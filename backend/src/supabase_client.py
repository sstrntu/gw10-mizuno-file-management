"""
Supabase client for backend API
Handles connection to Supabase PostgreSQL and auth
"""

import os
from supabase import create_client

# Initialize Supabase client (singleton pattern)
_supabase_client = None

def get_supabase_client():
    """Get or create Supabase client"""
    global _supabase_client

    if _supabase_client is None:
        supabase_url = os.environ.get('SUPABASE_URL')
        supabase_key = os.environ.get('SUPABASE_SERVICE_KEY')

        if not supabase_url or not supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required")

        _supabase_client = create_client(supabase_url, supabase_key)

    return _supabase_client
