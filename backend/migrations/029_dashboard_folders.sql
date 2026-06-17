-- Migration for Dashboard Folders

CREATE TABLE IF NOT EXISTS dashboard_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dashboard_folder_assignments (
    dashboard_id VARCHAR(255) PRIMARY KEY,
    folder_id UUID NOT NULL REFERENCES dashboard_folders(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
