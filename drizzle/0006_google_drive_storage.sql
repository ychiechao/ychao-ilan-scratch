ALTER TABLE file_assets ADD COLUMN storage_provider TEXT NOT NULL DEFAULT 'google_drive';
ALTER TABLE file_assets ADD COLUMN provider_file_id TEXT;
UPDATE file_assets SET storage_provider = 'r2', provider_file_id = r2_key WHERE provider_file_id IS NULL;

CREATE TABLE drive_storage_settings (
  id TEXT PRIMARY KEY,
  service_account_email TEXT NOT NULL,
  project_id TEXT NOT NULL,
  private_key_id TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  private_key_iv TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  shared_drive_id TEXT NOT NULL,
  folder_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  configured_by TEXT NOT NULL,
  last_verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(configured_by) REFERENCES teachers(id)
);
