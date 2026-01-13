import { recordCheckin } from '../checkins';
import { GYM_CHECKIN_RADIUS_M, GYM_SEARCH_RADIUS_M, MAX_ACCURACY_M } from '../constants';
import { jsonResponse } from '../http';
import { extractPayload } from '../parse';
import { findNearestGym, getGymsForLocation } from '../gyms';
import { CheckinRecord, Env, Gym } from '../types';

type SkippedEvent = {
	lat: number;
	lon: number;
	accuracy?: number;
	reason: string;
};

export async function handleIngest(request: Request, env: Env): Promise<Response> {
	if (!env.DB) {
		return jsonResponse({ ok: false, error: 'DB binding not configured' }, { status: 501 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ ok: false, error: 'Invalid JSON' }, { status: 400 });
	}

	const { deviceId, events } = extractPayload(body);
	if (!deviceId) {
		return jsonResponse({ ok: false, error: 'device_id is required' }, { status: 422 });
	}
	if (!events.length) {
		return jsonResponse({ ok: false, error: 'No location data found' }, { status: 422 });
	}

	const radiusM = GYM_SEARCH_RADIUS_M;
	const checkinRadiusM = GYM_CHECKIN_RADIUS_M;
	const maxAccuracy = MAX_ACCURACY_M;
	const localCache = new Map<string, Promise<Gym[]>>();
	const timeZone = request.cf?.timezone ?? null;
	const checkins: CheckinRecord[] = [];
	const skipped: SkippedEvent[] = [];
	const errors: string[] = [];

	for (const event of events) {
		console.log('ingest', deviceId, event.lat, event.lon);
		if (event.accuracy !== undefined && event.accuracy > maxAccuracy) {
			skipped.push({ lat: event.lat, lon: event.lon, accuracy: event.accuracy, reason: 'accuracy_too_low' });
			continue;
		}

		let gyms: Gym[];
		try {
			gyms = await getGymsForLocation(env, event.lat, event.lon, radiusM, localCache);
		} catch (error) {
			errors.push(error instanceof Error ? error.message : 'Failed to fetch gyms');
			continue;
		}

		const match = findNearestGym(gyms, event.lat, event.lon, checkinRadiusM);
		if (!match) {
			continue;
		}

		try {
			const record = await recordCheckin(env, deviceId, match, event.timestamp, timeZone);
			checkins.push(record);
		} catch (error) {
			errors.push(error instanceof Error ? error.message : 'Failed to record checkin');
		}
	}

	return jsonResponse({
		ok: errors.length === 0,
		deviceId,
		processed: events.length,
		matched: checkins.length,
		checkins,
		skipped,
		errors,
	});
}
