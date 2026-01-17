import {
	GYM_CACHE_TTL_SECONDS,
	GYM_GEOHASH_PRECISION,
	OVERPASS_MAX_RETRIES,
	OVERPASS_RETRY_BACKOFF_MS,
	OVERPASS_URL,
} from './constants';
import { encodeGeohash, haversineDistanceM } from './geo';
import { MANUAL_GYMS } from './manual-gyms';
import { BANNED_GYMS } from './banned-gyms';
import { GYM_RADIUS_OVERRIDES_M } from './gym-radius-overrides';
import { Env, Gym } from './types';

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status: number): boolean {
	return status === 429 || status >= 500;
}

async function fetchOverpass(url: string): Promise<Response> {
	let lastError: unknown;
	for (let attempt = 0; attempt <= OVERPASS_MAX_RETRIES; attempt += 1) {
		try {
			const response = await fetch(url, { method: 'GET' });
			if (response.ok || !shouldRetry(response.status) || attempt === OVERPASS_MAX_RETRIES) {
				return response;
			}
			lastError = new Error(`Overpass error: ${response.status} ${response.statusText}`);
		} catch (error) {
			lastError = error;
			if (attempt === OVERPASS_MAX_RETRIES) {
				break;
			}
		}
		const delay = OVERPASS_RETRY_BACKOFF_MS * (attempt + 1);
		await sleep(delay);
	}
	throw lastError instanceof Error ? lastError : new Error('Overpass request failed');
}

async function fetchGymsFromOverpass(lat: number, lon: number, radiusM: number): Promise<Gym[]> {
	const query = [
		'[out:json][timeout:25];',
		'(',
		`nwr(around:${radiusM},${lat},${lon})["leisure"="fitness_centre"];`,
		`nwr(around:${radiusM},${lat},${lon})["amenity"="gym"];`,
		`nwr(around:${radiusM},${lat},${lon})["leisure"="sports_centre"]["sport"="fitness"];`,
		');',
		'out center;',
	].join('');
	const url = new URL(OVERPASS_URL);
	url.searchParams.set('data', query);
	const response = await fetchOverpass(url.toString());

	if (!response.ok) {
		throw new Error(`Overpass error: ${response.status} ${response.statusText}`);
	}

	const data = (await response.json()) as {
		elements?: Array<{ type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }>;
	};
	const elements = data.elements ?? [];

	const gyms = elements
		.map((element) => {
			const latValue = element.lat ?? element.center?.lat;
			const lonValue = element.lon ?? element.center?.lon;
			if (latValue === undefined || lonValue === undefined) {
				return null;
			}
			const tags = element.tags ?? {};
			const name = tags.name ?? tags.brand ?? tags.operator ?? 'Unnamed gym';
			return {
				id: `osm:${element.type}:${element.id}`,
				name,
				lat: latValue,
				lon: lonValue,
				source: 'osm',
			} satisfies Gym;
		})
		.filter((gym): gym is Gym => Boolean(gym));

	const manualGyms = getManualGymsNear(lat, lon, radiusM);
	if (!manualGyms.length) {
		return gyms;
	}

	const existingIds = new Set(gyms.map((gym) => gym.id));
	for (const gym of manualGyms) {
		if (!existingIds.has(gym.id)) {
			gyms.push(gym);
		}
	}
	return gyms;
}

function getManualGymsNear(lat: number, lon: number, radiusM: number): Gym[] {
	if (!MANUAL_GYMS.length) {
		return [];
	}
	return MANUAL_GYMS.filter((gym) => haversineDistanceM(lat, lon, gym.lat, gym.lon) <= radiusM);
}

function getCacheKey(lat: number, lon: number, radiusM: number): string {
	const cell = encodeGeohash(lat, lon, GYM_GEOHASH_PRECISION);
	return `gyms:v1:r=${radiusM}:p=${GYM_GEOHASH_PRECISION}:${cell}`;
}

async function readCachedGyms(env: Env, key: string): Promise<Gym[] | null> {
	if (!env.GYM_CACHE) {
		return null;
	}
	const cached = await env.GYM_CACHE.get(key, { type: 'json' });
	if (!cached || typeof cached !== 'object') {
		return null;
	}
	const gyms = (cached as { gyms?: unknown }).gyms;
	return Array.isArray(gyms) ? (gyms as Gym[]) : null;
}

async function writeCachedGyms(env: Env, key: string, gyms: Gym[], radiusM: number, lat: number, lon: number): Promise<void> {
	if (!env.GYM_CACHE) {
		return;
	}
	const payload = {
		fetchedAt: Date.now(),
		radiusM,
		center: { lat, lon },
		gyms,
	};
	await env.GYM_CACHE.put(key, JSON.stringify(payload), { expirationTtl: GYM_CACHE_TTL_SECONDS });
}

export async function getGymsForLocation(
	env: Env,
	lat: number,
	lon: number,
	radiusM: number,
	localCache: Map<string, Promise<Gym[]>>,
): Promise<Gym[]> {
	const key = getCacheKey(lat, lon, radiusM);

	const existing = localCache.get(key);
	if (existing) {
		return existing;
	}

	const pending = (async () => {
		const cached = await readCachedGyms(env, key);
		if (cached) {
			return cached;
		}

		const gyms = await fetchGymsFromOverpass(lat, lon, radiusM);
		await writeCachedGyms(env, key, gyms, radiusM, lat, lon);
		return gyms;
	})();

	localCache.set(key, pending);
	return pending;
}

export async function getGymsForLocationWithCacheStatus(
	env: Env,
	lat: number,
	lon: number,
	radiusM: number,
): Promise<{ gyms: Gym[]; cacheHit: boolean }> {
	const key = getCacheKey(lat, lon, radiusM);
	const cached = await readCachedGyms(env, key);
	if (cached) {
		return { gyms: cached, cacheHit: true };
	}

	const gyms = await fetchGymsFromOverpass(lat, lon, radiusM);
	await writeCachedGyms(env, key, gyms, radiusM, lat, lon);
	return { gyms, cacheHit: false };
}

export function findNearestGym(
	gyms: Gym[],
	lat: number,
	lon: number,
	maxDistance: number,
): { gym: Gym; distanceM: number } | null {
	let best: { gym: Gym; distanceM: number } | null = null;
	for (const gym of gyms) {
		if (BANNED_GYMS.has(gym.id)) {
			continue;
		}
		const distance = haversineDistanceM(lat, lon, gym.lat, gym.lon);
		const overrideRadius = GYM_RADIUS_OVERRIDES_M.get(gym.id);
		const allowedDistance = overrideRadius === undefined ? maxDistance : Math.max(maxDistance, overrideRadius);
		if (distance <= allowedDistance && (!best || distance < best.distanceM)) {
			best = { gym, distanceM: distance };
		}
	}
	return best;
}
