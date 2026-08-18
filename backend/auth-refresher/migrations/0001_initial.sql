CREATE TABLE auth_state (
  id TEXT PRIMARY KEY CHECK (id = 'codex-agent'),
  auth_ciphertext TEXT NOT NULL,
  auth_iv TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  refreshed_at TEXT,
  valid_until TEXT,
  validated_at TEXT,
  github_published_at TEXT,
  last_success_at TEXT,
  last_error_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  lease_owner TEXT,
  lease_until TEXT
);
