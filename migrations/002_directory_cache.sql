-- Migration: Directory and File Cache Tables
-- Purpose: Cache Google Drive directory structure and uploaded files for fast QC Matrix loading
-- Schema: mz-27SS-upload-qc

-- Table: directories
-- Stores the expected directory structure and their Drive folder IDs
CREATE TABLE IF NOT EXISTS "mz-27SS-upload-qc".directories (
    id SERIAL PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    drive_folder_id TEXT,
    pack TEXT NOT NULL,
    category TEXT,
    model TEXT,
    exists_in_drive BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: uploaded_files
-- Stores metadata for all uploaded files
CREATE TABLE IF NOT EXISTS "mz-27SS-upload-qc".uploaded_files (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL,
    drive_file_id TEXT UNIQUE NOT NULL,
    drive_folder_id TEXT,
    path TEXT NOT NULL,
    web_view_link TEXT,
    mime_type TEXT,
    file_size BIGINT,
    pack TEXT NOT NULL,
    category TEXT,
    model TEXT,
    file_type TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_directories_path ON "mz-27SS-upload-qc".directories(path);
CREATE INDEX IF NOT EXISTS idx_directories_pack ON "mz-27SS-upload-qc".directories(pack);
CREATE INDEX IF NOT EXISTS idx_directories_exists ON "mz-27SS-upload-qc".directories(exists_in_drive);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_path ON "mz-27SS-upload-qc".uploaded_files(path);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_drive_file_id ON "mz-27SS-upload-qc".uploaded_files(drive_file_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_pack ON "mz-27SS-upload-qc".uploaded_files(pack);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_category ON "mz-27SS-upload-qc".uploaded_files(category);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION "mz-27SS-upload-qc".update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_directories_updated_at
    BEFORE UPDATE ON "mz-27SS-upload-qc".directories
    FOR EACH ROW
    EXECUTE FUNCTION "mz-27SS-upload-qc".update_updated_at_column();

CREATE TRIGGER update_uploaded_files_updated_at
    BEFORE UPDATE ON "mz-27SS-upload-qc".uploaded_files
    FOR EACH ROW
    EXECUTE FUNCTION "mz-27SS-upload-qc".update_updated_at_column();

-- Comments
COMMENT ON TABLE "mz-27SS-upload-qc".directories IS 'Caches directory structure from config and Drive API';
COMMENT ON TABLE "mz-27SS-upload-qc".uploaded_files IS 'Caches uploaded file metadata from Drive API';
COMMENT ON COLUMN "mz-27SS-upload-qc".directories.exists_in_drive IS 'Whether this directory actually exists in Google Drive';
