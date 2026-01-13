export interface Env {
	DB?: D1Database;
	GYM_CACHE?: KVNamespace;
}

export type LocationEvent = {
	lat: number;
	lon: number;
	accuracy?: number;
	timestamp: number;
};

export type Gym = {
	id: string;
	name: string;
	lat: number;
	lon: number;
	source: string;
};

export type CheckinRecord = {
	day: string;
	gym: Gym;
	distanceM: number;
	checkedInAt: number;
	pending: boolean;
	inserted: boolean;
};
