"""
Supabase client for backend API
Handles connection to Supabase PostgreSQL and auth
Uses direct HTTP requests to PostgREST API
"""

import os
import httpx
import json
from typing import Dict, List, Any, Optional

# Initialize HTTP client with Supabase credentials
_http_client = None
_supabase_url = None
_supabase_key = None
_schema = "mz-27SS-upload-qc"

def init_supabase():
    """Initialize Supabase credentials"""
    global _supabase_url, _supabase_key

    _supabase_url = os.environ.get('SUPABASE_URL')
    _supabase_key = os.environ.get('SUPABASE_SERVICE_KEY')

    if not _supabase_url or not _supabase_key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required")

def get_headers() -> Dict[str, str]:
    """Get HTTP headers for Supabase API requests"""
    if not _supabase_key:
        init_supabase()

    return {
        "apikey": _supabase_key,
        "Authorization": f"Bearer {_supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

def _execute_query(method: str, endpoint: str, data: Optional[Dict] = None, params: Optional[Dict] = None) -> Dict[str, Any]:
    """Execute HTTP request to Supabase REST API"""
    if not _supabase_url:
        init_supabase()

    url = f"{_supabase_url}/rest/v1{endpoint}"
    headers = get_headers()
    headers["Accept-Profile"] = _schema
    headers["Content-Profile"] = _schema

    with httpx.Client() as client:
        if method == "GET":
            response = client.get(url, headers=headers, params=params)
        elif method == "POST":
            response = client.post(url, json=data, headers=headers)
        elif method == "PATCH":
            response = client.patch(url, json=data, headers=headers, params=params)
        elif method == "DELETE":
            response = client.delete(url, headers=headers, params=params)
        else:
            raise ValueError(f"Unsupported method: {method}")

        if response.status_code not in [200, 201, 204]:
            error_msg = response.text
            try:
                error_data = response.json()
                error_msg = error_data.get('message', error_msg)
            except:
                pass
            raise Exception(f"Supabase API error ({response.status_code}): {error_msg}")

        if response.status_code == 204 or not response.text:
            return {}

        return response.json()

class QueryResponse:
    """Response wrapper to match Supabase SDK interface"""
    def __init__(self, data):
        self.data = data if isinstance(data, list) else [data] if data else []


class SupabaseTable:
    """Helper class for table operations"""

    def __init__(self, table_name: str):
        self.table_name = table_name

    def select(self, *args):
        """SELECT query builder"""
        return SelectBuilder(self.table_name, args if args else ["*"])

    def insert(self, data: Dict):
        """INSERT query builder"""
        return InsertBuilder(self.table_name, data)

    def update(self, data: Dict):
        """UPDATE query builder"""
        return UpdateBuilder(self.table_name, data)

    def delete(self):
        """DELETE query builder"""
        return DeleteBuilder(self.table_name)


class InsertBuilder:
    """INSERT query builder"""

    def __init__(self, table_name: str, data: Dict):
        self.table_name = table_name
        self.data = data

    def execute(self):
        """Execute the INSERT query"""
        if isinstance(self.data, list):
            result = _execute_query("POST", f"/{self.table_name}", self.data)
        else:
            result = _execute_query("POST", f"/{self.table_name}", self.data)
        return QueryResponse(result)


class SelectBuilder:
    """SELECT query builder"""

    def __init__(self, table_name: str, columns: tuple):
        self.table_name = table_name
        self.columns = ",".join(columns) if columns else "*"
        self.conditions = {}
        self.limit_val = None
        self.order_val = None

    def eq(self, column: str, value):
        """Add equality condition"""
        self.conditions[column] = f"eq.{self._format_value(value)}"
        return self

    def _format_value(self, value):
        """Format value for query string"""
        if isinstance(value, str):
            return value
        elif isinstance(value, bool):
            return "true" if value else "false"
        else:
            return str(value)

    def limit(self, count: int):
        """Set limit"""
        self.limit_val = count
        return self

    def order(self, column: str, ascending: bool = True):
        """Set order"""
        self.order_val = (column, ascending)
        return self

    def execute(self):
        """Execute the SELECT query"""
        params = {}

        # Add columns
        params["select"] = self.columns

        # Add conditions
        for col, cond in self.conditions.items():
            params[col] = cond

        # Add limit
        if self.limit_val:
            params["limit"] = self.limit_val

        # Add order
        if self.order_val:
            col, asc = self.order_val
            params["order"] = f"{col}.{'asc' if asc else 'desc'}"

        result = _execute_query("GET", f"/{self.table_name}", params=params)
        return QueryResponse(result)


class UpdateBuilder:
    """UPDATE query builder"""

    def __init__(self, table_name: str, data: Dict):
        self.table_name = table_name
        self.data = data
        self.conditions = {}

    def eq(self, column: str, value):
        """Add equality condition"""
        self.conditions[column] = f"eq.{self._format_value(value)}"
        return self

    def _format_value(self, value):
        """Format value for query string"""
        if isinstance(value, str):
            return value
        elif isinstance(value, bool):
            return "true" if value else "false"
        else:
            return str(value)

    def execute(self):
        """Execute the UPDATE query"""
        params = {}

        # Add conditions
        for col, cond in self.conditions.items():
            params[col] = cond

        result = _execute_query("PATCH", f"/{self.table_name}", self.data, params=params)
        return QueryResponse(result)


class DeleteBuilder:
    """DELETE query builder"""

    def __init__(self, table_name: str):
        self.table_name = table_name
        self.conditions = {}

    def eq(self, column: str, value):
        """Add equality condition"""
        self.conditions[column] = f"eq.{self._format_value(value)}"
        return self

    def _format_value(self, value):
        """Format value for query string"""
        if isinstance(value, str):
            return value
        elif isinstance(value, bool):
            return "true" if value else "false"
        else:
            return str(value)

    def execute(self):
        """Execute the DELETE query"""
        params = {}

        # Add conditions
        for col, cond in self.conditions.items():
            params[col] = cond

        _execute_query("DELETE", f"/{self.table_name}", params=params)
        return QueryResponse([])


class SupabaseClient:
    """Supabase client wrapper"""

    def table(self, table_name: str) -> SupabaseTable:
        """Get a table reference"""
        return SupabaseTable(table_name)


# Global client instance
_client = None

def get_supabase_client() -> SupabaseClient:
    """Get or create Supabase client"""
    global _client

    if _client is None:
        init_supabase()
        _client = SupabaseClient()

    return _client
