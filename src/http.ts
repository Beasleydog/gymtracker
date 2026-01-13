export const CORS_HEADERS = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET,POST,OPTIONS',
	'access-control-allow-headers': 'content-type,authorization',
};

export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
	const headers = new Headers(init.headers);
	headers.set('content-type', 'application/json; charset=utf-8');
	for (const [key, value] of Object.entries(CORS_HEADERS)) {
		if (!headers.has(key)) {
			headers.set(key, value);
		}
	}
	return new Response(JSON.stringify(data), {
		...init,
		headers,
	});
}
