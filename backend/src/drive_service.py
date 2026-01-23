"""
Google Drive Service Module
Handles all Google Drive API interactions for folder operations.
"""

import os
import mimetypes
from io import BytesIO
from typing import Optional, Dict, List, Tuple, Any
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseUpload
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
                pageSize=1,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True
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
                fields='id, trashed',
                supportsAllDrives=True
            ).execute()
            return not file.get('trashed', False)
        except HttpError:
            return False

    def get_folder_info(self, folder_id: str) -> Optional[Dict]:
        """
        Get folder information by ID.

        Args:
            folder_id: Google Drive folder ID

        Returns:
            Dict with folder info or None if not found/accessible
        """
        try:
            file = self.service.files().get(
                fileId=folder_id,
                fields='id, name, mimeType, trashed, capabilities',
                supportsAllDrives=True
            ).execute()
            return file
        except HttpError as e:
            print(f"Error getting folder info for '{folder_id}': {e}")
            return None

    def create_folder(self, name: str, parent_id: Optional[str] = None) -> Optional[str]:
        """
        Create a new folder with retry logic for transient errors.

        Args:
            name: Folder name
            parent_id: Parent folder ID (None for root)

        Returns:
            New folder ID or None if creation failed
        """
        import time
        max_retries = 3
        retry_delay = 1

        for attempt in range(max_retries):
            try:
                file_metadata = {
                    'name': name,
                    'mimeType': self.FOLDER_MIME_TYPE
                }

                if parent_id:
                    file_metadata['parents'] = [parent_id]

                folder = self.service.files().create(
                    body=file_metadata,
                    fields='id',
                    supportsAllDrives=True
                ).execute()

                return folder.get('id')

            except HttpError as e:
                # Check if error is retryable (5xx errors)
                if e.resp.status >= 500 and attempt < max_retries - 1:
                    print(f"Transient error creating folder '{name}' (attempt {attempt + 1}), retrying in {retry_delay}s...")
                    time.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                else:
                    print(f"Error creating folder '{name}': {e}")
                    return None
            except Exception as e:
                print(f"Unexpected error creating folder '{name}': {e}")
                return None

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
        Uses optimized batch fetching for speed.
        Also returns the folder hierarchy for display.

        Args:
            paths: List of paths (each path is a list of folder names)
            root_folder_id: ID of the root folder

        Returns:
            Dict with 'existing', 'missing', 'summary', and 'hierarchy'
        """
        # Get root folder info
        try:
            root_info = self.service.files().get(
                fileId=root_folder_id,
                fields='id, name, mimeType',
                supportsAllDrives=True
            ).execute()
        except HttpError as e:
            return {
                'existing': [],
                'missing': [],
                'summary': {'total': 0, 'existing_count': 0, 'missing_count': 0},
                'hierarchy': {'name': 'Error', 'id': root_folder_id, 'type': 'directory', 'children': [], 'error': str(e)}
            }

        # Fetch all folders at once using batch approach
        all_folders = self._fetch_all_folders_flat(root_folder_id)

        # Build lookup: parent_id -> {folder_name -> folder_id}
        children_by_parent: Dict[str, Dict[str, str]] = {}
        for folder in all_folders:
            for parent_id in folder.get('parents', []):
                if parent_id not in children_by_parent:
                    children_by_parent[parent_id] = {}
                children_by_parent[parent_id][folder['name']] = folder['id']

        existing_paths = []
        missing_paths = []

        # Check each path against the in-memory structure
        for path_parts in paths:
            current_parent_id = root_folder_id
            path_exists = True
            first_missing_idx = -1

            for idx, folder_name in enumerate(path_parts):
                # Look up in memory
                parent_children = children_by_parent.get(current_parent_id, {})
                folder_id = parent_children.get(folder_name)

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

        # Build hierarchy from the already-fetched folders
        full_hierarchy = self._build_tree_from_flat(root_info, all_folders, max_depth=10)

        # Return full hierarchy (includes root folder and all children)
        hierarchy = full_hierarchy

        return {
            'existing': existing_paths,
            'missing': missing_paths,
            'summary': {
                'total': len(paths),
                'existing_count': len(existing_paths),
                'missing_count': len(missing_paths)
            },
            'hierarchy': hierarchy
        }

    def create_structure(
        self,
        paths: List[List[str]],
        root_folder_id: str,
        dry_run: bool = False
    ) -> Dict:
        """
        Create folder structure for all paths.
        Uses optimized batch fetching to check existing folders first.

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

        # Batch fetch all existing folders first
        all_folders = self._fetch_all_folders_flat(root_folder_id)

        # Build lookup: parent_id -> {folder_name -> folder_id}
        children_by_parent: Dict[str, Dict[str, str]] = {}
        for folder in all_folders:
            for parent_id in folder.get('parents', []):
                if parent_id not in children_by_parent:
                    children_by_parent[parent_id] = {}
                children_by_parent[parent_id][folder['name']] = folder['id']

        # Session cache for newly created folders
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

                # Check session cache first (for newly created folders)
                if cache_key in session_cache:
                    path_result['folders'].append({
                        'name': folder_name,
                        'status': 'exists',
                        'id': session_cache[cache_key]
                    })
                    current_parent_id = session_cache[cache_key]
                    skipped_count += 1
                    continue

                # Check in-memory lookup (from batch fetch)
                parent_children = children_by_parent.get(current_parent_id, {})
                existing_id = parent_children.get(folder_name)

                if existing_id:
                    session_cache[cache_key] = existing_id
                    path_result['folders'].append({
                        'name': folder_name,
                        'status': 'exists',
                        'id': existing_id
                    })
                    current_parent_id = existing_id
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
                            # Also add to in-memory lookup for subsequent paths
                            if current_parent_id not in children_by_parent:
                                children_by_parent[current_parent_id] = {}
                            children_by_parent[current_parent_id][folder_name] = new_id
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

    def delete_folder_contents(self, folder_id: str) -> Dict[str, int]:
        """
        Delete all contents (files and subfolders) within a folder.

        Args:
            folder_id: ID of the folder to empty

        Returns:
            Dict with 'deleted_count' and 'failed_count'
        """
        deleted = 0
        failed = 0

        try:
            # List all children
            query = f"'{folder_id}' in parents and trashed = false"
            
            page_token = None
            while True:
                results = self.service.files().list(
                    q=query,
                    spaces='drive',
                    fields='nextPageToken, files(id, name, mimeType)',
                    pageToken=page_token,
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True
                ).execute()

                items = results.get('files', [])

                for item in items:
                    try:
                        self.service.files().delete(fileId=item['id'], supportsAllDrives=True).execute()
                        deleted += 1
                        print(f"Deleted: {item['name']} ({item['id']})")
                    except Exception as e:
                        # Skip 404 errors (folder already deleted), only count actual failures
                        if '404' not in str(e):
                            print(f"Failed to delete {item['name']}: {e}")
                        failed += 1

                page_token = results.get('nextPageToken')
                if not page_token:
                    break

            return {
                'success': True,
                'deleted_count': deleted,
                'failed_count': failed
            }

        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'deleted_count': deleted,
                'failed_count': failed
            }

    def file_exists(self, filename: str, folder_id: str) -> bool:
        """
        Check if file exists in a specific folder.

        Args:
            filename: File name to check
            folder_id: Parent folder ID

        Returns:
            True if file exists in folder, False otherwise
        """
        try:
            query = f"name = '{filename}' and '{folder_id}' in parents and trashed = false"
            results = self.service.files().list(
                q=query,
                spaces='drive',
                fields='files(id)',
                pageSize=1,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True
            ).execute()

            files = results.get('files', [])
            return len(files) > 0

        except HttpError as e:
            print(f"Error checking if file exists: {e}")
            return False

    def get_unique_filename(self, filename: str, folder_id: str) -> str:
        """
        Generate unique filename by appending numeric suffix if needed.

        Args:
            filename: Original filename
            folder_id: Parent folder ID

        Returns:
            Unique filename (appends _1, _2, etc. if file exists)
        """
        if not self.file_exists(filename, folder_id):
            return filename

        # Split filename into name and extension
        name_parts = filename.rsplit('.', 1)
        if len(name_parts) == 2:
            base_name, ext = name_parts
            ext = '.' + ext
        else:
            base_name = filename
            ext = ''

        # Try numbered variants
        counter = 1
        while counter <= 100:  # Limit attempts to prevent infinite loop
            new_filename = f"{base_name}_{counter}{ext}"
            if not self.file_exists(new_filename, folder_id):
                return new_filename
            counter += 1

        # Fallback (shouldn't reach here in normal usage)
        return f"{base_name}_DUPLICATE_{counter}{ext}"

    def upload_file(
        self,
        file_content: bytes,
        filename: str,
        folder_id: str,
        mime_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Upload file to Google Drive with retry logic and conflict resolution.

        Args:
            file_content: File content as bytes
            filename: Original filename
            folder_id: Destination folder ID
            mime_type: MIME type (auto-detected if not provided)

        Returns:
            {
                'success': bool,
                'file_id': str (if success),
                'filename': str (actual filename used, may differ if renamed),
                'web_view_link': str (if success),
                'created_time': str (if success),
                'error': str (if failure),
                'error_type': str
            }
        """
        import time

        # Auto-detect MIME type if not provided
        if not mime_type:
            mime_type, _ = mimetypes.guess_type(filename)
            if not mime_type:
                mime_type = 'application/octet-stream'

        # Get unique filename if needed
        unique_filename = self.get_unique_filename(filename, folder_id)

        # Retry logic for transient errors
        max_retries = 3
        retry_delay = 1

        for attempt in range(max_retries):
            try:
                file_metadata = {
                    'name': unique_filename,
                    'parents': [folder_id]
                }

                # Create file-like object from bytes
                file_obj = BytesIO(file_content)

                # Create media object for upload
                media = MediaIoBaseUpload(file_obj, mimetype=mime_type, resumable=True)

                # Upload file
                file_result = self.service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields='id, name, webViewLink, createdTime',
                    supportsAllDrives=True
                ).execute()

                return {
                    'success': True,
                    'file_id': file_result.get('id'),
                    'filename': unique_filename,
                    'web_view_link': file_result.get('webViewLink'),
                    'created_time': file_result.get('createdTime')
                }

            except HttpError as e:
                # Check if error is retryable (5xx errors)
                if e.resp.status >= 500 and attempt < max_retries - 1:
                    print(f"Transient error uploading file (attempt {attempt + 1}), retrying in {retry_delay}s...")
                    time.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                else:
                    # Determine error type
                    if e.resp.status == 400:
                        error_type = 'INVALID_FILE'
                        error_msg = f"Invalid file: {str(e)}"
                    elif e.resp.status == 403:
                        error_type = 'PERMISSION_DENIED'
                        error_msg = "Permission denied. Check folder access."
                    elif e.resp.status == 404:
                        error_type = 'FOLDER_NOT_FOUND'
                        error_msg = "Destination folder not found."
                    else:
                        error_type = 'UPLOAD_FAILED'
                        error_msg = f"Upload failed: {str(e)}"

                    print(f"Error uploading file: {error_msg}")
                    return {
                        'success': False,
                        'filename': filename,
                        'error': error_msg,
                        'error_type': error_type
                    }

            except Exception as e:
                print(f"Unexpected error uploading file: {e}")
                return {
                    'success': False,
                    'filename': filename,
                    'error': f"Unexpected error: {str(e)}",
                    'error_type': 'SERVER_ERROR'
                }

        # Max retries exceeded
        return {
            'success': False,
            'filename': filename,
            'error': 'Upload failed after maximum retries',
            'error_type': 'MAX_RETRIES_EXCEEDED'
        }

    def get_hierarchy(self, folder_id: str, max_depth: int = 10) -> Dict:
        """
        Fetch folder hierarchy from Google Drive using optimized batch approach.
        Fetches all folders in one query and builds tree in memory.

        Args:
            folder_id: ID of the root folder to start from
            max_depth: Maximum depth to recurse (default 10)

        Returns:
            Dict with folder tree structure:
            {
                "name": "folder_name",
                "id": "folder_id",
                "type": "directory",
                "children": [...]
            }
        """
        try:
            # Get the root folder info
            root_info = self.service.files().get(
                fileId=folder_id,
                fields='id, name, mimeType',
                supportsAllDrives=True
            ).execute()

            # Fetch ALL subfolders in one batch query
            all_folders = self._fetch_all_folders_flat(folder_id)

            # Build tree structure in memory
            return self._build_tree_from_flat(root_info, all_folders, max_depth)

        except HttpError as e:
            return {
                'name': 'Error',
                'id': folder_id,
                'type': 'directory',
                'children': [],
                'error': str(e)
            }

    def _fetch_all_folders_flat(self, root_folder_id: str) -> List[Dict]:
        """
        Fetch all folders under a root folder in a single paginated query.
        Much faster than recursive calls.

        Args:
            root_folder_id: The root folder ID

        Returns:
            List of all folder metadata dicts with id, name, parents
        """
        all_folders = []

        # Query for all folders - we'll filter by ancestry in memory
        # For Shared Drives, we need to get folders that have any parent in our tree
        folders_to_check = [root_folder_id]
        checked_folders = set()

        while folders_to_check:
            # Build query for current batch of parent folders
            parent_queries = [f"'{pid}' in parents" for pid in folders_to_check if pid not in checked_folders]
            if not parent_queries:
                break

            checked_folders.update(folders_to_check)
            folders_to_check = []

            # Process in chunks to avoid query length limits
            chunk_size = 10
            for i in range(0, len(parent_queries), chunk_size):
                chunk = parent_queries[i:i + chunk_size]
                query = f"({' or '.join(chunk)}) and mimeType = '{self.FOLDER_MIME_TYPE}' and trashed = false"

                page_token = None
                while True:
                    try:
                        results = self.service.files().list(
                            q=query,
                            spaces='drive',
                            fields='nextPageToken, files(id, name, parents)',
                            pageSize=1000,
                            pageToken=page_token,
                            supportsAllDrives=True,
                            includeItemsFromAllDrives=True
                        ).execute()

                        new_folders = results.get('files', [])
                        all_folders.extend(new_folders)

                        # Add new folder IDs to check for their children
                        for folder in new_folders:
                            if folder['id'] not in checked_folders:
                                folders_to_check.append(folder['id'])

                        page_token = results.get('nextPageToken')
                        if not page_token:
                            break
                    except HttpError as e:
                        print(f"Error fetching folders: {e}")
                        break

        return all_folders

    def _build_tree_from_flat(self, root_info: Dict, all_folders: List[Dict], max_depth: int) -> Dict:
        """
        Build tree structure from flat list of folders.

        Args:
            root_info: Root folder metadata
            all_folders: Flat list of all folder metadata
            max_depth: Maximum tree depth

        Returns:
            Tree structure dict
        """
        # Create lookup maps
        folders_by_id = {f['id']: f for f in all_folders}
        children_by_parent = {}

        for folder in all_folders:
            for parent_id in folder.get('parents', []):
                if parent_id not in children_by_parent:
                    children_by_parent[parent_id] = []
                children_by_parent[parent_id].append(folder)

        # Sort children by name
        for parent_id in children_by_parent:
            children_by_parent[parent_id].sort(key=lambda f: f.get('name', '').lower())

        # Build tree recursively from memory
        def build_node(folder_info: Dict, depth: int) -> Dict:
            node = {
                'name': folder_info.get('name', 'Unknown'),
                'id': folder_info.get('id'),
                'type': 'directory',
                'children': []
            }

            if depth >= max_depth:
                return node

            children = children_by_parent.get(folder_info['id'], [])
            for child in children:
                node['children'].append(build_node(child, depth + 1))

            return node

        return build_node(root_info, 0)
