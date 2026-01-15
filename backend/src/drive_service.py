"""
Google Drive Service Module
Handles all Google Drive API interactions for folder operations.
"""

import os
from typing import Optional, Dict, List, Tuple
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.oauth2.credentials import Credentials


class DriveService:
    """Wrapper for Google Drive API operations."""

    FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'

    def __init__(self, credentials: Credentials):
        """
        Initialize Drive service with credentials.

        Args:
            credentials: Google OAuth2 credentials
        """
        self.service = build('drive', 'v3', credentials=credentials)
        self._folder_cache: Dict[str, str] = {}  # path -> folder_id cache

    def get_folder_by_name(self, name: str, parent_id: Optional[str] = None) -> Optional[Dict]:
        """
        Find a folder by name within a parent folder.

        Args:
            name: Folder name to search for
            parent_id: Parent folder ID (None for root)

        Returns:
            Folder metadata dict or None if not found
        """
        try:
            query_parts = [
                f"name = '{name}'",
                f"mimeType = '{self.FOLDER_MIME_TYPE}'",
                "trashed = false"
            ]

            if parent_id:
                query_parts.append(f"'{parent_id}' in parents")

            query = " and ".join(query_parts)

            results = self.service.files().list(
                q=query,
                spaces='drive',
                fields='files(id, name, parents)',
                pageSize=1
            ).execute()

            files = results.get('files', [])
            return files[0] if files else None

        except HttpError as e:
            print(f"Error searching for folder '{name}': {e}")
            return None

    def folder_exists(self, folder_id: str) -> bool:
        """
        Check if a folder exists by ID.

        Args:
            folder_id: Google Drive folder ID

        Returns:
            True if folder exists and is not trashed
        """
        try:
            file = self.service.files().get(
                fileId=folder_id,
                fields='id, trashed'
            ).execute()
            return not file.get('trashed', False)
        except HttpError:
            return False

    def create_folder(self, name: str, parent_id: Optional[str] = None) -> Optional[str]:
        """
        Create a new folder.

        Args:
            name: Folder name
            parent_id: Parent folder ID (None for root)

        Returns:
            New folder ID or None if creation failed
        """
        try:
            file_metadata = {
                'name': name,
                'mimeType': self.FOLDER_MIME_TYPE
            }

            if parent_id:
                file_metadata['parents'] = [parent_id]

            folder = self.service.files().create(
                body=file_metadata,
                fields='id'
            ).execute()

            return folder.get('id')

        except HttpError as e:
            print(f"Error creating folder '{name}': {e}")
            return None

    def get_or_create_folder(self, name: str, parent_id: Optional[str] = None) -> Optional[str]:
        """
        Get existing folder or create if it doesn't exist.

        Args:
            name: Folder name
            parent_id: Parent folder ID

        Returns:
            Folder ID (existing or newly created)
        """
        existing = self.get_folder_by_name(name, parent_id)
        if existing:
            return existing['id']
        return self.create_folder(name, parent_id)

    def ensure_path_exists(
        self,
        path_parts: List[str],
        root_folder_id: str,
        dry_run: bool = False
    ) -> Tuple[List[Dict], List[Dict]]:
        """
        Ensure a full path exists, creating folders as needed.

        Args:
            path_parts: List of folder names forming the path
            root_folder_id: ID of the root folder to start from
            dry_run: If True, don't actually create folders

        Returns:
            Tuple of (existing_folders, created_folders)
            Each folder is a dict with 'name', 'id', 'status'
        """
        existing_folders = []
        created_folders = []

        current_parent_id = root_folder_id

        for folder_name in path_parts:
            existing = self.get_folder_by_name(folder_name, current_parent_id)

            if existing:
                existing_folders.append({
                    'name': folder_name,
                    'id': existing['id'],
                    'status': 'exists'
                })
                current_parent_id = existing['id']
            else:
                if dry_run:
                    created_folders.append({
                        'name': folder_name,
                        'id': None,
                        'status': 'would_create'
                    })
                    # For dry run, we can't continue down the path
                    # since the folder doesn't exist
                    current_parent_id = None
                else:
                    new_id = self.create_folder(folder_name, current_parent_id)
                    if new_id:
                        created_folders.append({
                            'name': folder_name,
                            'id': new_id,
                            'status': 'created'
                        })
                        current_parent_id = new_id
                    else:
                        created_folders.append({
                            'name': folder_name,
                            'id': None,
                            'status': 'failed'
                        })
                        break

        return existing_folders, created_folders

    def check_structure(
        self,
        paths: List[List[str]],
        root_folder_id: str
    ) -> Dict:
        """
        Check which paths exist and which need to be created.

        Args:
            paths: List of paths (each path is a list of folder names)
            root_folder_id: ID of the root folder

        Returns:
            Dict with 'existing', 'missing', and 'summary'
        """
        existing_paths = []
        missing_paths = []

        # Cache folder lookups to avoid redundant API calls
        folder_cache: Dict[str, Optional[str]] = {}  # "parent_id/name" -> folder_id

        for path_parts in paths:
            current_parent_id = root_folder_id
            path_exists = True
            first_missing_idx = -1

            for idx, folder_name in enumerate(path_parts):
                cache_key = f"{current_parent_id}/{folder_name}"

                if cache_key in folder_cache:
                    folder_id = folder_cache[cache_key]
                else:
                    existing = self.get_folder_by_name(folder_name, current_parent_id)
                    folder_id = existing['id'] if existing else None
                    folder_cache[cache_key] = folder_id

                if folder_id:
                    current_parent_id = folder_id
                else:
                    path_exists = False
                    first_missing_idx = idx
                    break

            path_str = '/'.join(path_parts)

            if path_exists:
                existing_paths.append({
                    'path': path_str,
                    'folder_id': current_parent_id
                })
            else:
                missing_paths.append({
                    'path': path_str,
                    'missing_from': path_parts[first_missing_idx] if first_missing_idx >= 0 else path_parts[0],
                    'missing_parts': path_parts[first_missing_idx:] if first_missing_idx >= 0 else path_parts
                })

        return {
            'existing': existing_paths,
            'missing': missing_paths,
            'summary': {
                'total': len(paths),
                'existing_count': len(existing_paths),
                'missing_count': len(missing_paths)
            }
        }

    def create_structure(
        self,
        paths: List[List[str]],
        root_folder_id: str,
        dry_run: bool = False
    ) -> Dict:
        """
        Create folder structure for all paths.

        Args:
            paths: List of paths (each path is a list of folder names)
            root_folder_id: ID of the root folder
            dry_run: If True, only report what would be created

        Returns:
            Dict with results for each path
        """
        results = []
        created_count = 0
        skipped_count = 0
        failed_count = 0

        # Cache to track already created folders in this session
        session_cache: Dict[str, str] = {}  # "parent_id/name" -> folder_id

        for path_parts in paths:
            current_parent_id = root_folder_id
            path_result = {
                'path': '/'.join(path_parts),
                'folders': [],
                'status': 'success'
            }

            for folder_name in path_parts:
                cache_key = f"{current_parent_id}/{folder_name}"

                # Check session cache first
                if cache_key in session_cache:
                    path_result['folders'].append({
                        'name': folder_name,
                        'status': 'exists',
                        'id': session_cache[cache_key]
                    })
                    current_parent_id = session_cache[cache_key]
                    skipped_count += 1
                    continue

                # Check if folder exists in Drive
                existing = self.get_folder_by_name(folder_name, current_parent_id)

                if existing:
                    session_cache[cache_key] = existing['id']
                    path_result['folders'].append({
                        'name': folder_name,
                        'status': 'exists',
                        'id': existing['id']
                    })
                    current_parent_id = existing['id']
                    skipped_count += 1
                else:
                    if dry_run:
                        path_result['folders'].append({
                            'name': folder_name,
                            'status': 'would_create',
                            'id': None
                        })
                        created_count += 1
                        # Can't continue path in dry run mode
                        current_parent_id = None
                    else:
                        new_id = self.create_folder(folder_name, current_parent_id)
                        if new_id:
                            session_cache[cache_key] = new_id
                            path_result['folders'].append({
                                'name': folder_name,
                                'status': 'created',
                                'id': new_id
                            })
                            current_parent_id = new_id
                            created_count += 1
                        else:
                            path_result['folders'].append({
                                'name': folder_name,
                                'status': 'failed',
                                'id': None
                            })
                            path_result['status'] = 'partial'
                            failed_count += 1
                            break

            results.append(path_result)

        return {
            'dry_run': dry_run,
            'results': results,
            'summary': {
                'total_paths': len(paths),
                'created': created_count,
                'skipped': skipped_count,
                'failed': failed_count
            }
        }
