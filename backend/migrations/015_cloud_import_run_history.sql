CREATE TABLE cloud_import_run_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL REFERENCES cloud_import_configs(id) ON DELETE CASCADE,
    run_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) NOT NULL,
    imported_rows INTEGER DEFAULT 0,
    failed_rows INTEGER DEFAULT 0,
    error_log TEXT
);

CREATE INDEX idx_cloud_import_run_history_config_id ON cloud_import_run_history(config_id);
