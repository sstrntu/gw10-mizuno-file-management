"""
Directory Cache Module
Manages cached directory structure and uploaded files in Supabase
"""

from typing import Dict, List, Any, Optional
from datetime import datetime


class DirectoryCache:
    """Manages directory and file cache in Supabase"""

    def __init__(self, supabase_client):
        self.supabase = supabase_client

    def save_directories(self, directories: List[Dict[str, Any]]) -> None:
        """
        Save or update directory structure in cache.

        Args:
            directories: List of directory info dicts with:
                - path: Full path (e.g., "1. ELITE/1. Key Visual/Model Name")
                - drive_folder_id: Google Drive folder ID
                - pack: Pack name
                - category: Category (Key Visual, Tech Shots, etc)
                - model: Model name (optional)
                - exists_in_drive: Boolean
        """
        if not directories:
            return

        # Upsert directories (insert or update on conflict)
        for directory in directories:
            try:
                # Check if exists
                existing = self.supabase.table("directories").select("id").eq("path", directory["path"]).execute()

                if existing.data:
                    # Update
                    self.supabase.table("directories").update({
                        "drive_folder_id": directory.get("drive_folder_id"),
                        "exists_in_drive": directory.get("exists_in_drive", False),
                        "updated_at": datetime.utcnow().isoformat()
                    }).eq("path", directory["path"]).execute()
                else:
                    # Insert
                    self.supabase.table("directories").insert({
                        "path": directory["path"],
                        "drive_folder_id": directory.get("drive_folder_id"),
                        "pack": directory["pack"],
                        "category": directory.get("category"),
                        "model": directory.get("model"),
                        "exists_in_drive": directory.get("exists_in_drive", False)
                    }).execute()
            except Exception as e:
                print(f"Error saving directory {directory.get('path')}: {e}")

    def save_uploaded_file(self, file_info: Dict[str, Any]) -> None:
        """
        Save uploaded file metadata to cache.

        Args:
            file_info: Dict with file metadata:
                - filename: Original filename
                - drive_file_id: Google Drive file ID
                - drive_folder_id: Parent folder ID
                - path: Directory path
                - web_view_link: Drive web link
                - mime_type: File MIME type
                - file_size: File size in bytes
                - pack: Pack name
                - category: Category
                - model: Model name
                - file_type: File type (T01, KV, etc)
        """
        try:
            # Check if file already exists
            existing = self.supabase.table("uploaded_files").select("id").eq(
                "drive_file_id", file_info["drive_file_id"]
            ).execute()

            if existing.data:
                # Update existing
                self.supabase.table("uploaded_files").update({
                    "filename": file_info["filename"],
                    "path": file_info["path"],
                    "web_view_link": file_info.get("web_view_link"),
                    "mime_type": file_info.get("mime_type"),
                    "file_size": file_info.get("file_size"),
                    "updated_at": datetime.utcnow().isoformat()
                }).eq("drive_file_id", file_info["drive_file_id"]).execute()
            else:
                # Insert new
                self.supabase.table("uploaded_files").insert({
                    "filename": file_info["filename"],
                    "drive_file_id": file_info["drive_file_id"],
                    "drive_folder_id": file_info.get("drive_folder_id"),
                    "path": file_info["path"],
                    "web_view_link": file_info.get("web_view_link"),
                    "mime_type": file_info.get("mime_type"),
                    "file_size": file_info.get("file_size"),
                    "pack": file_info["pack"],
                    "category": file_info.get("category"),
                    "model": file_info.get("model"),
                    "file_type": file_info.get("file_type")
                }).execute()
        except Exception as e:
            print(f"Error saving file {file_info.get('filename')}: {e}")

    def get_all_directories(self) -> List[Dict[str, Any]]:
        """
        Get all directories from cache.

        Returns:
            List of directory records
        """
        try:
            response = self.supabase.table("directories").select("*").execute()
            return response.data
        except Exception as e:
            print(f"Error getting directories: {e}")
            return []

    def get_directories_by_pack(self, pack: str) -> List[Dict[str, Any]]:
        """
        Get directories for a specific pack.

        Args:
            pack: Pack name

        Returns:
            List of directory records
        """
        try:
            response = self.supabase.table("directories").select("*").eq("pack", pack).execute()
            return response.data
        except Exception as e:
            print(f"Error getting directories for pack {pack}: {e}")
            return []

    def get_files_by_path(self, path: str) -> List[Dict[str, Any]]:
        """
        Get uploaded files in a specific path.

        Args:
            path: Directory path

        Returns:
            List of file records
        """
        try:
            response = self.supabase.table("uploaded_files").select("*").eq("path", path).execute()
            return response.data
        except Exception as e:
            print(f"Error getting files for path {path}: {e}")
            return []

    def get_all_files(self) -> List[Dict[str, Any]]:
        """
        Get all uploaded files from cache.

        Returns:
            List of file records
        """
        try:
            response = self.supabase.table("uploaded_files").select("*").execute()
            return response.data
        except Exception as e:
            print(f"Error getting files: {e}")
            return []

    def clear_all(self) -> None:
        """Clear all cached data (directories and files)"""
        try:
            # Delete all directories
            self.supabase.table("directories").delete().neq("id", 0).execute()
            # Delete all files
            self.supabase.table("uploaded_files").delete().neq("id", 0).execute()
            print("Cache cleared successfully")
        except Exception as e:
            print(f"Error clearing cache: {e}")

    def count_files_by_path(self, path: str) -> int:
        """
        Count files in a specific path.

        Args:
            path: Directory path

        Returns:
            Number of files
        """
        try:
            response = self.supabase.table("uploaded_files").select("id").eq("path", path).execute()
            return len(response.data) if response.data else 0
        except Exception as e:
            print(f"Error counting files for path {path}: {e}")
            return 0
