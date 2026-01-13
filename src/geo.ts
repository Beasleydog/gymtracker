const GEOHASH_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';

export function encodeGeohash(lat: number, lon: number, precision: number): string {
	let idx = 0;
	let bit = 0;
	let evenBit = true;
	let latMin = -90;
	let latMax = 90;
	let lonMin = -180;
	let lonMax = 180;
	let geohash = '';

	while (geohash.length < precision) {
		if (evenBit) {
			const mid = (lonMin + lonMax) / 2;
			if (lon >= mid) {
				idx = idx * 2 + 1;
				lonMin = mid;
			} else {
				idx *= 2;
				lonMax = mid;
			}
		} else {
			const mid = (latMin + latMax) / 2;
			if (lat >= mid) {
				idx = idx * 2 + 1;
				latMin = mid;
			} else {
				idx *= 2;
				latMax = mid;
			}
		}

		evenBit = !evenBit;
		bit += 1;

		if (bit === 5) {
			geohash += GEOHASH_ALPHABET[idx];
			bit = 0;
			idx = 0;
		}
	}

	return geohash;
}

export function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const toRad = (value: number) => (value * Math.PI) / 180;
	const r = 6371000;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return 2 * r * Math.asin(Math.sqrt(a));
}
