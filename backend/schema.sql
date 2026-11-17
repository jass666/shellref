-- shellref command library (Cloudflare D1)
CREATE TABLE IF NOT EXISTS commands (
  uid INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  command TEXT NOT NULL,
  description TEXT DEFAULT '',
  shell TEXT DEFAULT '',
  group_name TEXT DEFAULT 'Saved from web',
  source_url TEXT DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_commands_group ON commands(group_name);
CREATE INDEX IF NOT EXISTS idx_commands_updated ON commands(updated_at DESC);
