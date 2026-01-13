import { listCheckins } from '../checkins';
import { jsonResponse } from '../http';
import { parseNumber } from '../parse';
import { Env } from '../types';

export async function handleCheckins(request: Request, env: Env): Promise<Response> {
	if (!env.DB) {
		return jsonResponse({ ok: false, error: 'DB binding not configured' }, { status: 501 });
	}

	const url = new URL(request.url);
	const deviceId = url.searchParams.get('device_id');
	if (!deviceId) {
		return jsonResponse({ ok: false, error: 'device_id is required' }, { status: 400 });
	}

	const day = url.searchParams.get('day');
	const limitRaw = parseNumber(url.searchParams.get('limit'));
	const limit = Math.min(100, Math.max(1, limitRaw ?? 30));

	const checkins = await listCheckins(env, deviceId, day, limit);
	return jsonResponse({ ok: true, deviceId, checkins });
}
