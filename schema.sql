CREATE TABLE IF NOT EXISTS checkins (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  gym_id TEXT NOT NULL,
  gym_name TEXT NOT NULL,
  checked_in_at INTEGER NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_checkins_user_time ON checkins(user_id, checked_in_at DESC);
