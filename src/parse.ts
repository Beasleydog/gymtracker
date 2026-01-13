import { LocationEvent } from './types';

type Payload = {
	device_id?: unknown;
	location?: unknown;
	locations?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTimestamp(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === 'string' && value.trim()) {
		const parsed = Date.parse(value);
		return Number.isNaN(parsed) ? null : parsed;
	}
	return null;
}

export function parseNumber(value: string | null): number | null {
	if (!value) {
		return null;
	}
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : null;
}

function parseLocation(value: unknown): LocationEvent | null {
	if (!isRecord(value)) {
		return null;
	}
	const coords = isRecord(value.coords) ? value.coords : value;
	const lat = coords.latitude;
	const lon = coords.longitude;
	if (typeof lat !== 'number' || typeof lon !== 'number') {
		return null;
	}
	if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
		return null;
	}
	const accuracy = typeof coords.accuracy === 'number' ? coords.accuracy : undefined;
	const timestamp = parseTimestamp(value.timestamp ?? coords.timestamp) ?? Date.now();
	return {
		lat,
		lon,
		accuracy,
		timestamp,
	};
}

export function extractPayload(body: unknown): { deviceId: string | null; events: LocationEvent[] } {
	if (!isRecord(body)) {
		return { deviceId: null, events: [] };
	}

	const payload = body as Payload;
	const deviceId = typeof payload.device_id === 'string' && payload.device_id.trim() ? payload.device_id.trim() : null;
	const events: LocationEvent[] = [];

	if (Array.isArray(payload.locations)) {
		for (const item of payload.locations) {
			const parsed = parseLocation(item);
			if (parsed) {
				events.push(parsed);
			}
		}
	} else if (payload.location) {
		const parsed = parseLocation(payload.location);
		if (parsed) {
			events.push(parsed);
		}
	}

	return { deviceId, events };
}
