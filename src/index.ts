import { handleCheckins } from './handlers/checkins';
import { handleDevices } from './handlers/devices';
import { handleGyms } from './handlers/gyms';
import { handleIngest } from './handlers/ingest';
import { CORS_HEADERS, jsonResponse } from './http';
import { Env } from './types';
function handleRoot(): Response {
	return Response.redirect('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 302);
}

export default {
	async fetch(request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (request.method === 'GET' && url.pathname === '/health') {
			return jsonResponse({ ok: true });
		}
		if (request.method === 'GET' && url.pathname === '/checkins') {
			return handleCheckins(request, env);
		}
		if (request.method === 'GET' && url.pathname === '/gyms') {
			return handleGyms(request, env);
		}
		if (request.method === 'GET' && url.pathname === '/devices') {
			return handleDevices(request, env);
		}
		if (request.method === 'POST' && url.pathname === '/ingest') {
			return handleIngest(request, env);
		}
		if (request.method === 'GET' && url.pathname === '/') {
			return handleRoot();
		}

		return jsonResponse({ ok: false, error: 'Not found' }, { status: 404 });
	},
} satisfies ExportedHandler<Env>;
