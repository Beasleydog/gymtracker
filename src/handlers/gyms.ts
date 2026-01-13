import { GYM_SEARCH_RADIUS_M } from '../constants';
import { jsonResponse } from '../http';
import { parseNumber } from '../parse';
import { getGymsForLocationWithCacheStatus } from '../gyms';
import { Env } from '../types';

export async function handleGyms(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const lat = parseNumber(url.searchParams.get('lat'));
	const lon = parseNumber(url.searchParams.get('lon'));
	if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
		return jsonResponse({ ok: false, error: 'lat and lon are required' }, { status: 400 });
	}

	const radiusM = GYM_SEARCH_RADIUS_M;
	try {
		const { gyms, cacheHit } = await getGymsForLocationWithCacheStatus(env, lat, lon, radiusM);
		return jsonResponse({ ok: true, count: gyms.length, gyms, cacheHit });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to fetch gyms';
		return jsonResponse({ ok: false, error: message }, { status: 502 });
	}
}
