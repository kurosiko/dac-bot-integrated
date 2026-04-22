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
