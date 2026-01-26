#!/usr/bin/env python3
"""
Script to create the mz-27SS-upload-qc schema and tables in Supabase PostgreSQL
Run this once to set up the database schema.
"""

import psycopg2
from psycopg2 import sql

# Database connection details
DB_HOST = "db.pwxhgvuyaxgavommtqpr.supabase.co"
DB_PORT = 5432
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASSWORD = "Tzt0bkistz7Hi2af"

# SQL schema and tables
SCHEMA_NAME = "mz-27SS-upload-qc"

SQL_COMMANDS = [
    # Create schema
    f"CREATE SCHEMA IF NOT EXISTS \"{SCHEMA_NAME}\";",

    # Main QC table for files
    f"""
    CREATE TABLE IF NOT EXISTS \"{SCHEMA_NAME}\".mz_27ss_upload_qc (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_id TEXT UNIQUE NOT NULL,
        filename TEXT NOT NULL,
        web_view_link TEXT NOT NULL,
        mime_type TEXT,
        status TEXT DEFAULT 'Pending' CHECK (status IN ('APPROVED', 'Pending', 'In Progress')),
        approval_count INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    """,

    # Action history table to track who approved/rejected/commented
    f"""
    CREATE TABLE IF NOT EXISTS \"{SCHEMA_NAME}\".mz_27ss_upload_qc_actions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_id UUID NOT NULL REFERENCES \"{SCHEMA_NAME}\".mz_27ss_upload_qc(id) ON DELETE CASCADE,
        action_type TEXT NOT NULL CHECK (action_type IN ('approve', 'reject', 'comment')),
        user_id TEXT NOT NULL,
        user_email TEXT,
        comment TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    """,

    # Indexes for faster queries
    f"CREATE INDEX IF NOT EXISTS idx_mz_qc_status ON \"{SCHEMA_NAME}\".mz_27ss_upload_qc(status);",
    f"CREATE INDEX IF NOT EXISTS idx_mz_qc_created ON \"{SCHEMA_NAME}\".mz_27ss_upload_qc(created_at DESC);",
    f"CREATE INDEX IF NOT EXISTS idx_mz_actions_file_id ON \"{SCHEMA_NAME}\".mz_27ss_upload_qc_actions(file_id);",
]

def setup_database():
    """Connect to database and create schema/tables"""
    try:
        # Connect to database
        print("Connecting to Supabase PostgreSQL...")
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD
        )

        cursor = conn.cursor()

        # Execute each command
        for i, command in enumerate(SQL_COMMANDS, 1):
            print(f"Executing command {i}/{len(SQL_COMMANDS)}...")
            cursor.execute(command)

        # Commit changes
        conn.commit()
        print("✅ Database schema created successfully!")

        # Verify tables exist
        cursor.execute(f"SELECT table_name FROM information_schema.tables WHERE table_schema = '{SCHEMA_NAME}';")
        tables = cursor.fetchall()
        print(f"\n📊 Created tables in schema '{SCHEMA_NAME}':")
        for table in tables:
            print(f"  - {table[0]}")

        cursor.close()
        conn.close()

    except Exception as e:
        print(f"❌ Error setting up database: {e}")
        raise

if __name__ == '__main__':
    setup_database()
