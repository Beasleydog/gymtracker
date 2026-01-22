import { MIN_PENDING_CONFIRMATION_MINUTES } from './constants';
import { CheckinRecord, Env, Gym } from './types';

type StoredCheckinRow = {
	user_id: string;
	day: string;
	gym_id: string;
	gym_name: string;
	checked_in_at: number;
	lat: number;
	lon: number;
	source: string;
};

type CheckinRow = StoredCheckinRow & {
	pending: boolean;
};

type ExistingCheckinRow = {
	gym_id: string;
	checked_in_at: number;
};

type DeviceDayRow = {
	user_id: string;
	day: string;
};

export type DeviceCheckinDays = {
	deviceId: string;
	days: string[];
};

function toDayString(timestamp: number, timeZone?: string | null): string {
	if (timeZone) {
		try {
			const parts = new Intl.DateTimeFormat('en-US', {
				timeZone,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
			}).formatToParts(new Date(timestamp));
			const year = parts.find((part) => part.type === 'year')?.value;
			const month = parts.find((part) => part.type === 'month')?.value;
			const day = parts.find((part) => part.type === 'day')?.value;
			if (year && month && day) {
				return `${year}-${month}-${day}`;
			}
		} catch {
		}
	}
	return new Date(timestamp).toISOString().slice(0, 10);
}

function toPendingTimestamp(timestamp: number): number {
	return -Math.abs(Math.trunc(timestamp));
}

function splitCheckinTimestamp(timestamp: number): { checkedInAt: number; pending: boolean } {
	if (timestamp < 0) {
		return { checkedInAt: Math.abs(timestamp), pending: true };
	}
	return { checkedInAt: timestamp, pending: false };
}

export async function clearPendingCheckin(
	env: Env,
	deviceId: string,
	timestamp: number,
	timeZone?: string | null,
): Promise<boolean> {
	if (!env.DB) {
		throw new Error('DB binding not configured');
	}
	const day = toDayString(timestamp, timeZone);
	const result = await env.DB
		.prepare('DELETE FROM checkins WHERE user_id = ? AND day = ? AND checked_in_at < 0;')
		.bind(deviceId, day)
		.run();
	return result.changes > 0;
}

export async function recordCheckin(
	env: Env,
	deviceId: string,
	match: { gym: Gym; distanceM: number },
	timestamp: number,
	timeZone?: string | null,
	options?: { forceConfirmed?: boolean },
): Promise<CheckinRecord> {
	if (!env.DB) {
		throw new Error('DB binding not configured');
	}
	const day = toDayString(timestamp, timeZone);
	const existingStatement = env.DB
		.prepare('SELECT gym_id, checked_in_at FROM checkins WHERE user_id = ? AND day = ?;')
		.bind(deviceId, day);
	const { results: existingResults } = await existingStatement.all<ExistingCheckinRow>();
	const existing = existingResults[0];

	const forceConfirmed = options?.forceConfirmed ?? false;
	const pendingTimestamp = toPendingTimestamp(timestamp);
	const storedTimestamp = forceConfirmed ? timestamp : pendingTimestamp;
	if (!existing) {
		const statement = env.DB.prepare(
			'INSERT INTO checkins (user_id, day, gym_id, gym_name, checked_in_at, lat, lon, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, day) DO NOTHING;',
		).bind(deviceId, day, match.gym.id, match.gym.name, storedTimestamp, match.gym.lat, match.gym.lon, match.gym.source);
		const result = await statement.run();
		return {
			day,
			gym: match.gym,
			distanceM: match.distanceM,
			checkedInAt: timestamp,
			pending: !forceConfirmed,
			inserted: result.changes > 0,
		};
	}

	if (existing.checked_in_at < 0) {
		if (existing.gym_id === match.gym.id) {
			const pendingCheckedInAt = Math.abs(existing.checked_in_at);
			const minPendingAgeMs = MIN_PENDING_CONFIRMATION_MINUTES * 60 * 1000;
			if (forceConfirmed || timestamp - pendingCheckedInAt >= minPendingAgeMs) {
				await env.DB
					.prepare(
						'UPDATE checkins SET checked_in_at = ?, gym_name = ?, lat = ?, lon = ?, source = ? WHERE user_id = ? AND day = ?;',
					)
					.bind(
						timestamp,
						match.gym.name,
						match.gym.lat,
						match.gym.lon,
						match.gym.source,
						deviceId,
						day,
					)
					.run();
				return {
					day,
					gym: match.gym,
					distanceM: match.distanceM,
					checkedInAt: timestamp,
					pending: false,
					inserted: false,
				};
			}
			return {
				day,
				gym: match.gym,
				distanceM: match.distanceM,
				checkedInAt: pendingCheckedInAt,
				pending: true,
				inserted: false,
			};
		}

		const nextTimestamp = forceConfirmed ? timestamp : pendingTimestamp;
		await env.DB
			.prepare(
				'UPDATE checkins SET gym_id = ?, gym_name = ?, checked_in_at = ?, lat = ?, lon = ?, source = ? WHERE user_id = ? AND day = ?;',
			)
			.bind(
				match.gym.id,
				match.gym.name,
				nextTimestamp,
				match.gym.lat,
				match.gym.lon,
				match.gym.source,
				deviceId,
				day,
			)
			.run();
		return {
			day,
			gym: match.gym,
			distanceM: match.distanceM,
			checkedInAt: timestamp,
			pending: !forceConfirmed,
			inserted: false,
		};
	}

	return {
		day,
		gym: match.gym,
		distanceM: match.distanceM,
		checkedInAt: timestamp,
		pending: false,
		inserted: false,
	};
}

export async function listCheckins(
	env: Env,
	deviceId: string,
	day: string | null,
	limit: number,
): Promise<CheckinRow[]> {
	if (!env.DB) {
		throw new Error('DB binding not configured');
	}

	const statement = day
		? env.DB.prepare(
				'SELECT user_id, day, gym_id, gym_name, checked_in_at, lat, lon, source FROM checkins WHERE user_id = ? AND day = ? ORDER BY checked_in_at DESC;',
			).bind(deviceId, day)
		: env.DB.prepare(
				'SELECT user_id, day, gym_id, gym_name, checked_in_at, lat, lon, source FROM checkins WHERE user_id = ? ORDER BY checked_in_at DESC LIMIT ?;',
			).bind(deviceId, limit);

	const { results } = await statement.all<StoredCheckinRow>();
	return results.map((row) => {
		const { checkedInAt, pending } = splitCheckinTimestamp(row.checked_in_at);
		return {
			...row,
			checked_in_at: checkedInAt,
			pending,
		};
	});
}

export async function listDeviceCheckinDays(env: Env): Promise<DeviceCheckinDays[]> {
	if (!env.DB) {
		throw new Error('DB binding not configured');
	}

	const statement = env.DB.prepare(
		'SELECT user_id, day FROM checkins WHERE checked_in_at > 0 ORDER BY user_id, day;',
	);
	const { results } = await statement.all<DeviceDayRow>();
	const daysByDevice = new Map<string, string[]>();

	for (const row of results) {
		const days = daysByDevice.get(row.user_id);
		if (days) {
			days.push(row.day);
		} else {
			daysByDevice.set(row.user_id, [row.day]);
		}
	}

	return Array.from(daysByDevice, ([deviceId, days]) => ({
		deviceId,
		days,
	}));
}
