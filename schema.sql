CREATE TABLE IF NOT EXISTS vocabulary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    type TEXT NOT NULL,
    category TEXT
);

CREATE TABLE IF NOT EXISTS usages (
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, type)
);

CREATE TABLE IF NOT EXISTS music_cache (
    key TEXT PRIMARY KEY,
    response TEXT NOT NULL,
    resolved_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_music_cache_expires_at
    ON music_cache (expires_at);
