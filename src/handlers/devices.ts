import { listDeviceCheckinDays } from '../checkins';
import { jsonResponse } from '../http';
import { Env } from '../types';

export async function handleDevices(request: Request, env: Env): Promise<Response> {
	if (!env.DB) {
		return jsonResponse({ ok: false, error: 'DB binding not configured' }, { status: 501 });
	}

	const devices = await listDeviceCheckinDays(env);
	return jsonResponse({ ok: true, devices });
}
