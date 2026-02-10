"""
Flask API for Filename Resolver
Provides REST API endpoint for filename resolution.
"""

import os
import unicodedata
from flask import Flask, request, jsonify
from flask_cors import CORS
import sys
from pathlib import Path

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.resolver import resolve_filename
from src import auth
from src.auth import require_auth, get_google_credentials_from_token
from src.drive_service import DriveService

app = Flask(__name__)
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'dev-secret-key-change-in-production')
CORS(app, supports_credentials=True)  # Enable CORS for React frontend with credentials


@app.route('/api/resolve', methods=['POST'])
def resolve():
    """
    Resolve a filename to its folder path.

    Request JSON:
        {
            "filename": "26SS_FTW_Bright_Gold_KV_M2J_16x9.jpg"
        }

    Response JSON:
        {
            "success": true,
            "filename": "...",
            "pack": {...},
            "model": {...},
            "rule": {...},
            "path": {...}
        }
    """
    try:
        data = request.get_json()

        if not data or 'filename' not in data:
            return jsonify({
                "success": False,
                "error": "Missing 'filename' in request body",
                "error_type": "INVALID_REQUEST"
            }), 400

        filename = data['filename']

        # Resolve the filename
        result = resolve_filename(filename)

        # Return JSON response
        return jsonify(result.to_dict())

    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Server error: {str(e)}",
            "error_type": "SERVER_ERROR"
        }), 500


@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok"})


@app.route('/api/structure', methods=['GET'])
def get_structure():
    """
    Get complete directory structure.

    Response JSON:
        {
            "name": "26SS_FTW_Sell-in",
            "type": "directory",
            "children": [...]
        }
    """
    try:
        from src.directory_generator import generate_directory_structure

        structure = generate_directory_structure()
        return jsonify(structure)

    except Exception as e:
        return jsonify({
            "error": f"Failed to generate structure: {str(e)}"
        }), 500


@app.route('/api/create-directories', methods=['POST'])
def create_directories():
    """
    Create directory structure (mock for testing - doesn't actually create folders).

    Response JSON:
        {
            "success": true,
            "message": "Directory structure created successfully",
            "count": 123
        }
    """
    try:
        from src.directory_generator import generate_flat_paths

        paths = generate_flat_paths()

        # In a real implementation, this would create actual directories
        # For testing, we just return success with the count

        return jsonify({
            "success": True,
            "message": f"Successfully created {len(paths)} directories",
            "count": len(paths),
            "paths": paths[:10]  # Return first 10 as sample
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Failed to create directories: {str(e)}"
        }), 500


def get_config_dir():
    """Resolve config directory dynamically for Local vs Docker paths."""
    src_dir = Path(__file__).parent

    # Check 3 levels up (Local: backend/src/api.py -> ROOT/config)
    path_local = src_dir.parent.parent / 'config'
    if path_local.exists() and path_local.is_dir():
        return path_local

    # Check 2 levels up (Docker: /app/src/api.py -> /app/config)
    path_docker = src_dir.parent / 'config'
    if path_docker.exists() and path_docker.is_dir():
        return path_docker

    # Fallback to local default if neither found (or raising error)
    return path_local

@app.route('/api/config', methods=['GET'])
def list_configs():
    """List available config files."""
    try:
        config_dir = get_config_dir()
        if not config_dir.exists():
             return jsonify({"files": [], "error": "Config directory not found"}), 404

        files = [f.name for f in config_dir.glob('*.json')]
        return jsonify({"files": sorted(files)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/config/<filename>', methods=['GET', 'POST'])
def manage_config(filename):
    """Read or update a config file."""
    try:
        config_dir = get_config_dir()
        file_path = config_dir / filename

        # Security check: ensure file is in config dir
        if not file_path.resolve().is_relative_to(config_dir.resolve()):
            return jsonify({"error": "Access denied"}), 403

        if not file_path.exists():
            return jsonify({"error": "File not found"}), 404

        if request.method == 'GET':
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return jsonify({"content": content})

        elif request.method == 'POST':
            data = request.get_json()
            if 'content' not in data:
                return jsonify({"error": "Missing content"}), 400

            # Write to file
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(data['content'])

            return jsonify({"success": True})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =============================================================================
# Authentication Endpoints (Supabase)
# =============================================================================

@app.route('/api/auth/status', methods=['GET'])
def auth_status():
    """
    Check authentication status using Supabase JWT token.

    Expects Authorization header: Bearer <supabase_access_token>
    """
    try:
        token = auth.get_token_from_header()
        status = auth.get_auth_status_from_token(token)
        return jsonify(status)
    except Exception as e:
        return jsonify({
            "authenticated": False,
            "error": str(e)
        }), 500


# =============================================================================
# Google Drive Endpoints
# =============================================================================

def get_drive_service_from_request():
    """
    Get Drive service using Google provider token from request.

    Expects the Google access token in:
    - X-Google-Token header, OR
    - google_token in request JSON body
    """
    # Try header first
    google_token = request.headers.get('X-Google-Token')

    # Fall back to request body
    if not google_token:
        data = request.get_json() or {}
        google_token = data.get('google_token')

    if not google_token:
        return None, "No Google token provided. Please login with Google."

    credentials = get_google_credentials_from_token(google_token)
    if not credentials:
        return None, "Failed to create Google credentials. Please login with Google again."

    drive = DriveService(credentials)

    # Validate token immediately so expired/invalid sessions are caught as auth errors.
    try:
        drive.service.about().get(fields='user').execute()
    except Exception:
        return None, "Google session expired or invalid. Please login with Google again."

    return drive, None


@app.route('/api/drive/structure', methods=['GET'])
@require_auth
def drive_get_structure():
    """
    Get actual folder hierarchy from Google Drive.

    Query params:
        root_folder_id: The root folder ID to start from

    Requires X-Google-Token header with Google access token.

    Response JSON:
        {
            "success": true,
            "name": "Root Folder",
            "id": "folder_id",
            "type": "directory",
            "children": [...]
        }
    """
    try:
        drive, error = get_drive_service_from_request()
        if not drive:
            return jsonify({
                "success": False,
                "error": error,
                "error_type": "AUTH_REQUIRED"
            }), 401

        root_folder_id = request.args.get('root_folder_id') or os.environ.get('DRIVE_ROOT_FOLDER_ID')

        if not root_folder_id:
            return jsonify({
                "success": False,
                "error": "No root folder ID provided. Set DRIVE_ROOT_FOLDER_ID or pass root_folder_id query param.",
                "error_type": "CONFIG_ERROR"
            }), 400

        # Get max_depth from query params (default 10, batch fetch is fast)
        max_depth = int(request.args.get('max_depth', 10))
        hierarchy = drive.get_hierarchy(root_folder_id, max_depth=max_depth)

        if 'error' in hierarchy:
            return jsonify({
                "success": False,
                "error": hierarchy['error'],
                "error_type": "DRIVE_ERROR"
            }), 400

        return jsonify({
            "success": True,
            **hierarchy
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "error_type": "SERVER_ERROR"
        }), 500


@app.route('/api/drive/test-access', methods=['POST'])
@require_auth
def drive_test_access():
    """
    Test Drive access and folder permissions.
    Useful for debugging Shared Drive access issues.
    """
    try:
        drive, error = get_drive_service_from_request()
        if not drive:
            return jsonify({
                "success": False,
                "error": error,
                "error_type": "AUTH_REQUIRED"
            }), 401

        data = request.get_json() or {}
        folder_id = data.get('folder_id') or os.environ.get('DRIVE_ROOT_FOLDER_ID')

        if not folder_id:
            return jsonify({
                "success": False,
                "error": "No folder ID provided",
            }), 400

        # Test 1: Get folder info
        folder_info = drive.get_folder_info(folder_id)

        # Test 2: List contents
        try:
            list_result = drive.service.files().list(
                q=f"'{folder_id}' in parents and trashed = false",
                spaces='drive',
                fields='files(id, name)',
                pageSize=5,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True
            ).execute()
            can_list = True
            list_error = None
            files = list_result.get('files', [])
        except Exception as e:
            can_list = False
            list_error = str(e)
            files = []

        # Test 3: Try to create a test folder
        try:
            test_folder = drive.service.files().create(
                body={
                    'name': '_test_folder_delete_me',
                    'mimeType': 'application/vnd.google-apps.folder',
                    'parents': [folder_id]
                },
                fields='id',
                supportsAllDrives=True
            ).execute()
            can_create = True
            create_error = None
            # Delete the test folder
            drive.service.files().delete(
                fileId=test_folder['id'],
                supportsAllDrives=True
            ).execute()
        except Exception as e:
            can_create = False
            create_error = str(e)

        return jsonify({
            "success": True,
            "folder_id": folder_id,
            "folder_info": folder_info,
            "can_list": can_list,
            "list_error": list_error,
            "files_found": len(files),
            "can_create": can_create,
            "create_error": create_error
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "error_type": "SERVER_ERROR"
        }), 500


@app.route('/api/drive/check-structure', methods=['POST'])
@require_auth
def drive_check_structure():
    """
    Check which folders exist in Drive vs need to be created.

    Request JSON:
        {
            "google_token": "google-access-token",
            "paths": [["Pack1", "SubFolder1"], ["Pack1", "SubFolder2"]],
            "root_folder_id": "optional-override"
        }

    Or pass google_token via X-Google-Token header.
    """
    try:
        drive, error = get_drive_service_from_request()
        if not drive:
            return jsonify({
                "success": False,
                "error": error,
                "error_type": "AUTH_REQUIRED"
            }), 401

        data = request.get_json() or {}
        paths = data.get('paths')
        root_folder_id = data.get('root_folder_id') or os.environ.get('DRIVE_ROOT_FOLDER_ID')

        if not root_folder_id:
            return jsonify({
                "success": False,
                "error": "No root folder ID provided. Set DRIVE_ROOT_FOLDER_ID or pass root_folder_id.",
                "error_type": "CONFIG_ERROR"
            }), 400

        # Validate root folder exists and is accessible
        folder_info = drive.get_folder_info(root_folder_id)
        if not folder_info:
            return jsonify({
                "success": False,
                "error": f"Root folder not found or not accessible. Folder ID: {root_folder_id}. "
                         "Please verify the folder ID is correct and that your Google account has access to it.",
                "error_type": "FOLDER_NOT_FOUND"
            }), 404

        # If no paths provided, generate from config
        if not paths:
            from src.directory_generator import generate_flat_paths
            path_strings = generate_flat_paths()
            # Convert string paths to list of parts
            paths = [p.split('/') for p in path_strings]

        result = drive.check_structure(paths, root_folder_id)
        result['success'] = True

        return jsonify(result)

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "error_type": "SERVER_ERROR"
        }), 500


@app.route('/api/drive/create-directories', methods=['POST'])
@require_auth
def drive_create_directories():
    """
    Create directory structure in Google Drive.

    Request JSON:
        {
            "google_token": "google-access-token",
            "paths": [["Pack1", "SubFolder1"], ["Pack1", "SubFolder2"]],
            "root_folder_id": "optional-override",
            "dry_run": false
        }

    Or pass google_token via X-Google-Token header.
    """
    try:
        drive, error = get_drive_service_from_request()
        if not drive:
            return jsonify({
                "success": False,
                "error": error,
                "error_type": "AUTH_REQUIRED"
            }), 401

        data = request.get_json() or {}
        paths = data.get('paths')
        root_folder_id = data.get('root_folder_id') or os.environ.get('DRIVE_ROOT_FOLDER_ID')
        dry_run = data.get('dry_run', False)

        if not root_folder_id:
            return jsonify({
                "success": False,
                "error": "No root folder ID provided. Set DRIVE_ROOT_FOLDER_ID or pass root_folder_id.",
                "error_type": "CONFIG_ERROR"
            }), 400

        # Validate root folder exists and is accessible
        folder_info = drive.get_folder_info(root_folder_id)
        if not folder_info:
            return jsonify({
                "success": False,
                "error": f"Root folder not found or not accessible. Folder ID: {root_folder_id}. "
                         "Please verify the folder ID is correct and that your Google account has access to it.",
                "error_type": "FOLDER_NOT_FOUND"
            }), 404

        if folder_info.get('trashed'):
            return jsonify({
                "success": False,
                "error": f"Root folder '{folder_info.get('name')}' is in trash. Please restore it first.",
                "error_type": "FOLDER_TRASHED"
            }), 400

        # If no paths provided, generate from config
        if not paths:
            from src.directory_generator import generate_flat_paths
            path_strings = generate_flat_paths()
            # Convert string paths to list of parts
            paths = [p.split('/') for p in path_strings]

        result = drive.create_structure(paths, root_folder_id, dry_run=dry_run)
        result['success'] = True

        return jsonify(result)

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "error_type": "SERVER_ERROR"
        }), 500


@app.route('/api/drive/list-files', methods=['GET'])
@require_auth
def drive_list_files():
    """
    List all files in Google Drive (non-folder items).

    Query params:
        root_folder_id: (optional) Limit to files within this folder and subfolders

    Response JSON:
        {
            "success": true,
            "files": [
                {
                    "id": "file_id",
                    "name": "filename.jpg",
                    "mimeType": "image/jpeg",
                    "webViewLink": "https://drive.google.com/file/d/...",
                    "createdTime": "2026-01-23T10:30:00Z",
                    "modifiedTime": "2026-01-23T10:30:00Z"
                }
            ]
        }
    """
    try:
        drive, error = get_drive_service_from_request()
        if not drive:
            return jsonify({
                "success": False,
                "error": error,
                "error_type": "AUTH_REQUIRED"
            }), 401

        folder_id = request.args.get('folder_id')

        if folder_id:
            query = (
                f"'{folder_id}' in parents and "
                f"mimeType != '{DriveService.FOLDER_MIME_TYPE}' and trashed = false"
            )
        else:
            # Backward-compatible fallback: list all non-folder files in Drive.
            query = "mimeType != 'application/vnd.google-apps.folder' and trashed = false"

        all_files = []
        page_token = None

        while True:
            results = drive.service.files().list(
                q=query,
                spaces='drive',
                fields='nextPageToken, files(id, name, mimeType, webViewLink, createdTime, modifiedTime, parents)',
                pageSize=1000,
                pageToken=page_token,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                orderBy='createdTime desc'  # Most recent first
            ).execute()

            files = results.get('files', [])
            all_files.extend(files)

            page_token = results.get('nextPageToken')
            if not page_token:
                break

        return jsonify({
            "success": True,
            "folder_id": folder_id,
            "files": all_files,
            "total": len(all_files)
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "error_type": "SERVER_ERROR"
        }), 500


@app.route('/api/drive/file-counts', methods=['POST'])
@require_auth
def drive_file_counts():
    """
    Count files inside specific Google Drive folders.

    Request JSON:
        {
            "folder_ids": ["folder_id_1", "folder_id_2", ...]
        }

    Response JSON:
        {
            "success": true,
            "counts": {
                "folder_id_1": 3,
                "folder_id_2": 0
            },
            "total_files": 3,
            "folder_count": 2
        }
    """
    try:
        drive, error = get_drive_service_from_request()
        if not drive:
            return jsonify({
                "success": False,
                "error": error,
                "error_type": "AUTH_REQUIRED"
            }), 401

        data = request.get_json() or {}
        folder_ids = data.get('folder_ids', [])

        if not isinstance(folder_ids, list):
            return jsonify({
                "success": False,
                "error": "folder_ids must be an array",
                "error_type": "INVALID_REQUEST"
            }), 400

        # Deduplicate and keep only non-empty strings.
        folder_ids = list(dict.fromkeys([
            folder_id.strip()
            for folder_id in folder_ids
            if isinstance(folder_id, str) and folder_id.strip()
        ]))

        if not folder_ids:
            return jsonify({
                "success": True,
                "counts": {},
                "total_files": 0,
                "folder_count": 0
            })

        counts = {folder_id: 0 for folder_id in folder_ids}
        folder_set = set(folder_ids)
        chunk_size = 20  # Keep Drive query string at a safe size.

        for i in range(0, len(folder_ids), chunk_size):
            chunk = folder_ids[i:i + chunk_size]
            parents_clause = " or ".join([f"'{folder_id}' in parents" for folder_id in chunk])
            query = (
                f"({parents_clause}) and "
                f"mimeType != '{DriveService.FOLDER_MIME_TYPE}' and trashed = false"
            )

            page_token = None
            while True:
                results = drive.service.files().list(
                    q=query,
                    spaces='drive',
                    fields='nextPageToken, files(id, parents)',
                    pageSize=1000,
                    pageToken=page_token,
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True
                ).execute()

                for file in results.get('files', []):
                    for parent_id in file.get('parents', []):
                        if parent_id in folder_set:
                            counts[parent_id] += 1

                page_token = results.get('nextPageToken')
                if not page_token:
                    break

        return jsonify({
            "success": True,
            "counts": counts,
            "total_files": sum(counts.values()),
            "folder_count": len(folder_ids)
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "error_type": "SERVER_ERROR"
        }), 500


@app.route('/api/drive/files-by-folders', methods=['POST'])
@require_auth
def drive_files_by_folders():
    """
    List files grouped by parent folder IDs.

    Request JSON:
        {
            "folder_ids": ["folder_id_1", "folder_id_2", ...]
        }

    Response JSON:
        {
            "success": true,
            "files_by_folder": {
                "folder_id_1": [{...}],
                "folder_id_2": [{...}]
            },
            "counts": {
                "folder_id_1": 3,
                "folder_id_2": 0
            },
            "total_files": 3,
            "folder_count": 2
        }
    """
    try:
        drive, error = get_drive_service_from_request()
        if not drive:
            return jsonify({
                "success": False,
                "error": error,
                "error_type": "AUTH_REQUIRED"
            }), 401

        data = request.get_json() or {}
        folder_ids = data.get('folder_ids', [])

        if not isinstance(folder_ids, list):
            return jsonify({
                "success": False,
                "error": "folder_ids must be an array",
                "error_type": "INVALID_REQUEST"
            }), 400

        # Deduplicate and keep only non-empty strings.
        folder_ids = list(dict.fromkeys([
            folder_id.strip()
            for folder_id in folder_ids
            if isinstance(folder_id, str) and folder_id.strip()
        ]))

        if not folder_ids:
            return jsonify({
                "success": True,
                "files_by_folder": {},
                "counts": {},
                "total_files": 0,
                "folder_count": 0
            })

        folder_set = set(folder_ids)
        files_by_folder = {folder_id: [] for folder_id in folder_ids}
        chunk_size = 20

        for i in range(0, len(folder_ids), chunk_size):
            chunk = folder_ids[i:i + chunk_size]
            parents_clause = " or ".join([f"'{folder_id}' in parents" for folder_id in chunk])
            query = (
                f"({parents_clause}) and "
                f"mimeType != '{DriveService.FOLDER_MIME_TYPE}' and trashed = false"
            )

            page_token = None
            while True:
                results = drive.service.files().list(
                    q=query,
                    spaces='drive',
                    fields='nextPageToken, files(id, name, mimeType, webViewLink, createdTime, modifiedTime, parents)',
                    pageSize=1000,
                    pageToken=page_token,
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True,
                    orderBy='createdTime desc'
                ).execute()

                for drive_file in results.get('files', []):
                    normalized_file = {
                        'id': drive_file.get('id'),
                        'name': drive_file.get('name'),
                        'mimeType': drive_file.get('mimeType'),
                        'webViewLink': drive_file.get('webViewLink'),
                        'createdTime': drive_file.get('createdTime'),
                        'modifiedTime': drive_file.get('modifiedTime')
                    }
                    for parent_id in drive_file.get('parents', []):
                        if parent_id in folder_set:
                            files_by_folder[parent_id].append(normalized_file)

                page_token = results.get('nextPageToken')
                if not page_token:
                    break

        counts = {folder_id: len(files) for folder_id, files in files_by_folder.items()}

        return jsonify({
            "success": True,
            "files_by_folder": files_by_folder,
            "counts": counts,
            "total_files": sum(counts.values()),
            "folder_count": len(folder_ids)
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "error_type": "SERVER_ERROR"
        }), 500


@app.route('/api/drive/folder/<folder_id>', methods=['GET'])
@require_auth
def drive_get_folder(folder_id):
    """
    Get folder details by ID.

    Requires X-Google-Token header with Google access token.
    """
    try:
        drive, error = get_drive_service_from_request()
        if not drive:
            return jsonify({
                "success": False,
                "error": error,
                "error_type": "AUTH_REQUIRED"
            }), 401

        exists = drive.folder_exists(folder_id)

        return jsonify({
            "success": True,
            "folder_id": folder_id,
            "exists": exists
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route('/api/drive/upload', methods=['POST'])
@require_auth
def drive_upload_file():
    """
    Upload file to Google Drive at resolved path.

    Request: multipart/form-data
    - file: File object
    - filename: Original filename (required)
    - root_folder_id: (optional) Override root folder

    Headers:
    - X-Google-Token: Google OAuth token
    - Authorization: Bearer <supabase_token>

    Response JSON:
        {
            "success": true,
            "filename": "original_filename.jpg",
            "actual_filename": "original_filename.jpg or original_filename_1.jpg",
            "file_id": "...",
            "web_view_link": "...",
            "created_time": "...",
            "storage_path": "Pack/KeyVisual/..."
        }

    Error responses:
    - INVALID_FILE: No file provided
    - INVALID_EXTENSION: Extension not in allowedExtensions
    - FILE_TOO_LARGE: Exceeds 50MB
    - VALIDATION_FAILED: Filename doesn't match rules
    - UPLOAD_FAILED: Drive API error
    """
    try:
        # 1. Check if file is in request
        if 'file' not in request.files:
            return jsonify({
                "success": False,
                "error": "No file provided in request",
                "error_type": "INVALID_FILE"
            }), 400

        file = request.files['file']
        filename = request.form.get('filename')

        if not filename:
            return jsonify({
                "success": False,
                "error": "Missing 'filename' in form data",
                "error_type": "INVALID_FILE"
            }), 400

        if file.filename == '':
            return jsonify({
                "success": False,
                "error": "Empty file provided",
                "error_type": "INVALID_FILE"
            }), 400

        overwrite_requested = str(request.form.get('overwrite', 'false')).strip().lower() in (
            '1', 'true', 'yes', 'on'
        )
        target_file_id = (request.form.get('target_file_id') or '').strip() or None

        # 2. Validate extension
        from src.config_loader import load_config
        config = load_config()
        allowed_extensions = config.get('allowedExtensions', [
            '.jpg', '.jpeg', '.png', '.webp', '.psd'  # Fallback defaults
        ])

        # Ensure allowed_extensions is a list (in case config is empty)
        if not allowed_extensions or not isinstance(allowed_extensions, list):
            allowed_extensions = ['.jpg', '.jpeg', '.png', '.webp', '.psd']

        file_ext = '.' + filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
        print(f"DEBUG: Upload validation - filename: {filename}, extension: {file_ext}, allowed: {allowed_extensions}")

        # Skip extension check - filename already validated on client side with resolve_filename
        # Extension validation is just a safety check, not a blocker
        if file_ext not in allowed_extensions:
            print(f"DEBUG: Warning - file extension '{file_ext}' not in config, but proceeding (already validated on client)")

        # 3. Validate file size (50MB limit)
        MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB in bytes
        file_content = file.read()
        if len(file_content) > MAX_FILE_SIZE:
            return jsonify({
                "success": False,
                "error": f"File size exceeds 50MB limit ({len(file_content) / 1024 / 1024:.1f}MB)",
                "error_type": "FILE_TOO_LARGE"
            }), 400

        # 4. Validate filename using resolver
        result = resolve_filename(filename)
        if not result.success:
            return jsonify({
                "success": False,
                "error": result.error,
                "error_type": "VALIDATION_FAILED"
            }), 400

        # 5. Get Google Drive service
        drive, error = get_drive_service_from_request()
        if not drive:
            return jsonify({
                "success": False,
                "error": error,
                "error_type": "AUTH_REQUIRED"
            }), 401

        root_folder_id = request.form.get('root_folder_id') or os.environ.get('DRIVE_ROOT_FOLDER_ID')
        if not root_folder_id:
            return jsonify({
                "success": False,
                "error": "No root folder ID provided",
                "error_type": "CONFIG_ERROR"
            }), 400

        # 6. Ensure path exists and get final folder ID
        # path_info is a dict with: path_parts (relative to root), full_path (with root), tree
        # Use path_parts which are already relative to root folder
        path_parts = result.path_info.get('path_parts', [])
        print(f"DEBUG: Upload path_parts: {path_parts}")

        existing, created = drive.ensure_path_exists(path_parts, root_folder_id, dry_run=False)

        # Get the last folder ID (destination for file)
        if created:
            final_folder_id = created[-1]['id']
        elif existing:
            final_folder_id = existing[-1]['id']
        else:
            return jsonify({
                "success": False,
                "error": "Failed to create or locate destination folder",
                "error_type": "UPLOAD_FAILED"
            }), 500

        if not final_folder_id:
            return jsonify({
                "success": False,
                "error": "Destination folder path could not be resolved",
                "error_type": "UPLOAD_FAILED"
            }), 500

        # 6b. Check if file already exists (or overwrite when requested)
        existing_same_name = drive.find_files_by_name(filename, final_folder_id, max_results=20)
        did_overwrite = False
        overwritten_file_id = None

        if existing_same_name:
            if overwrite_requested:
                target_existing = None
                if target_file_id:
                    target_existing = next(
                        (row for row in existing_same_name if row.get('id') == target_file_id),
                        None
                    )
                if not target_existing:
                    target_existing = existing_same_name[0]

                overwritten_file_id = target_existing.get('id')
                upload_result = drive.overwrite_file(
                    overwritten_file_id,
                    file_content,
                    filename=filename,
                    mime_type=file.content_type
                )
                did_overwrite = upload_result.get('success', False)
            else:
                return jsonify({
                    "success": False,
                    "error": f"File '{filename}' already exists in this folder",
                    "error_type": "FILE_EXISTS"
                }), 409
        else:
            # 7. Upload file
            upload_result = drive.upload_file(
                file_content,
                filename,
                final_folder_id,
                mime_type=file.content_type
            )

        if not upload_result['success']:
            return jsonify({
                "success": False,
                "error": upload_result.get('error', 'Upload failed'),
                "error_type": upload_result.get('error_type', 'UPLOAD_FAILED')
            }), 500

        # 8. Persist uploaded file metadata for QC/ToDo hydration.
        try:
            from src.supabase_client import get_supabase_client

            supabase = get_supabase_client()
            relative_path = '/'.join(path_parts)
            pack_name = (result.pack_info or {}).get('folder') or (path_parts[0] if path_parts else 'Unknown')
            category_name = path_parts[1] if len(path_parts) > 1 else None
            model_name = path_parts[2] if len(path_parts) > 2 else None

            existing_upload = supabase.table('uploaded_files').select('id').eq(
                'drive_file_id', upload_result.get('file_id')
            ).execute().data

            upload_payload = {
                'filename': upload_result.get('filename') or filename,
                'drive_file_id': upload_result.get('file_id'),
                'drive_folder_id': final_folder_id,
                'path': relative_path,
                'web_view_link': upload_result.get('web_view_link'),
                'mime_type': file.content_type,
                'file_size': len(file_content),
                'pack': pack_name,
                'category': category_name,
                'model': model_name,
                'file_type': (result.rule_info or {}).get('id')
            }

            if existing_upload:
                supabase.table('uploaded_files').update(upload_payload).eq(
                    'drive_file_id', upload_result.get('file_id')
                ).execute()
            else:
                supabase.table('uploaded_files').insert(upload_payload).execute()
        except Exception as cache_error:
            # Cache failure should not block upload success.
            print(f"Warning: failed to persist upload metadata: {cache_error}")

        # 8. Return success response
        return jsonify({
            "success": True,
            "filename": filename,
            "actual_filename": upload_result.get('filename'),
            "file_id": upload_result.get('file_id'),
            "web_view_link": upload_result.get('web_view_link'),
            "created_time": upload_result.get('created_time'),
            "storage_path": result.path_info.get('full_path', ''),
            "overwritten": did_overwrite,
            "overwritten_file_id": overwritten_file_id
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Server error: {str(e)}",
            "error_type": "SERVER_ERROR"
        }), 500


@app.route('/api/drive/delete-file', methods=['POST'])
@require_auth
def drive_delete_file():
    """
    Delete a file from Google Drive by file_id.

    Request JSON:
        {
            "file_id": "google_drive_file_id"
        }
    """
    try:
        data = request.get_json() or {}
        file_id = data.get('file_id')
        live_file_id = data.get('live_file_id')
        candidate_file_ids = data.get('candidate_file_ids', [])
        filename = data.get('filename')
        folder_id = data.get('folder_id')
        path = data.get('path')

        if not isinstance(candidate_file_ids, list):
            candidate_file_ids = []
        candidate_file_ids = list(dict.fromkeys([
            str(candidate_id).strip()
            for candidate_id in candidate_file_ids
            if str(candidate_id).strip()
        ]))

        if not file_id and not live_file_id and not filename:
            return jsonify({
                "success": False,
                "error": "Missing delete target (file_id/live_file_id or filename required)",
                "error_type": "INVALID_REQUEST"
            }), 400

        drive, error = get_drive_service_from_request()
        if not drive:
            return jsonify({
                "success": False,
                "error": error,
                "error_type": "AUTH_REQUIRED"
            }), 401

        deleted_file_id = None
        deleted_by_fallback = False
        not_found_by_id = False
        already_deleted = False
        moved_to_trash = False
        delete_attempts = []
        non_not_found_errors = []

        def normalize_name(value: str) -> str:
            return unicodedata.normalize('NFC', str(value or '')).strip()

        def normalize_path(value: str) -> str:
            parts = [
                normalize_name(part)
                for part in str(value or '').split('/')
                if normalize_name(part)
            ]
            return '/'.join(parts).lower()

        def resolve_folder_id_from_path(target_path: str):
            if not target_path:
                return None
            root_folder_id = os.environ.get('DRIVE_ROOT_FOLDER_ID')
            if not root_folder_id:
                return None

            path_parts = [part.strip() for part in str(target_path).split('/') if part.strip()]
            current_parent_id = root_folder_id
            for folder_name in path_parts:
                folder = drive.get_folder_by_name(folder_name, current_parent_id)
                if not folder:
                    return None
                current_parent_id = folder.get('id')

            return current_parent_id

        def escape_drive_query_literal(value: str) -> str:
            return str(value or '').replace('\\', '\\\\').replace("'", "\\'")

        def find_files_by_name_in_folder(target_folder_id: str, target_filename: str):
            """List files in folder and match filename in Python to avoid query escaping edge cases."""
            if not target_folder_id or not target_filename:
                return []

            matched = []
            base_matched = []
            suffixed_matched = []
            all_files = []
            page_token = None
            normalized_target = normalize_name(target_filename)
            normalized_target_lower = normalized_target.lower()
            target_base = normalized_target_lower.rsplit('.', 1)[0] if '.' in normalized_target_lower else normalized_target_lower

            while True:
                results = drive.service.files().list(
                    q=(
                        f"'{target_folder_id}' in parents and "
                        f"mimeType != '{DriveService.FOLDER_MIME_TYPE}' and trashed = false"
                    ),
                    spaces='drive',
                    fields='nextPageToken, files(id,name,modifiedTime)',
                    pageSize=1000,
                    pageToken=page_token,
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True
                ).execute()

                for drive_file in results.get('files', []):
                    all_files.append(drive_file)
                    drive_name = normalize_name(drive_file.get('name', ''))
                    drive_name_lower = drive_name.lower()
                    drive_base = drive_name_lower.rsplit('.', 1)[0] if '.' in drive_name_lower else drive_name_lower

                    if drive_name == normalized_target or drive_name_lower == normalized_target_lower:
                        matched.append(drive_file)
                    elif target_base and drive_base == target_base:
                        # Extension changed (e.g. .jpg vs .jpeg) but same basename.
                        base_matched.append(drive_file)
                    elif target_base and drive_base.startswith(f"{target_base}_"):
                        # Renamed duplicate (e.g. file_1.jpg) from older upload logic.
                        suffixed_matched.append(drive_file)

                page_token = results.get('nextPageToken')
                if not page_token:
                    break

            matched.sort(key=lambda f: f.get('modifiedTime') or '', reverse=True)
            base_matched.sort(key=lambda f: f.get('modifiedTime') or '', reverse=True)
            suffixed_matched.sort(key=lambda f: f.get('modifiedTime') or '', reverse=True)
            if not matched and len(all_files) == 1:
                # In QC folders we often expect one file; if name mapping is stale but only one live file exists,
                # use that file as fallback target.
                return all_files
            if not matched and base_matched:
                return base_matched
            if not matched and not base_matched and suffixed_matched:
                return suffixed_matched
            return matched

        def find_files_by_name_global(target_filename: str):
            """Fallback global name lookup; avoids full-drive scans."""
            if not target_filename:
                return []

            escaped_name = escape_drive_query_literal(target_filename)
            query = (
                f"name = '{escaped_name}' and "
                f"mimeType != '{DriveService.FOLDER_MIME_TYPE}' and trashed = false"
            )

            page_token = None
            matched = []
            while True:
                results = drive.service.files().list(
                    q=query,
                    spaces='drive',
                    fields='nextPageToken, files(id,name,parents,modifiedTime)',
                    pageSize=200,
                    pageToken=page_token,
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True
                ).execute()

                matched.extend(results.get('files', []))
                page_token = results.get('nextPageToken')
                if not page_token:
                    break

            matched.sort(key=lambda f: f.get('modifiedTime') or '', reverse=True)
            return matched

        def list_files_in_folder(target_folder_id: str):
            if not target_folder_id:
                return []
            page_token = None
            collected = []
            while True:
                results = drive.service.files().list(
                    q=(
                        f"'{target_folder_id}' in parents and "
                        f"mimeType != '{DriveService.FOLDER_MIME_TYPE}' and trashed = false"
                    ),
                    spaces='drive',
                    fields='nextPageToken, files(id,name,modifiedTime)',
                    pageSize=200,
                    pageToken=page_token,
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True
                ).execute()
                collected.extend(results.get('files', []))
                page_token = results.get('nextPageToken')
                if not page_token:
                    break
            collected.sort(key=lambda f: f.get('modifiedTime') or '', reverse=True)
            return collected

        def is_not_found_error(err: Exception) -> bool:
            err_text = str(err or '')
            if '404' in err_text or 'notFound' in err_text or 'File not found' in err_text:
                return True
            status = getattr(getattr(err, 'resp', None), 'status', None)
            return status == 404

        def try_delete_or_trash(target_file_id: str, source: str):
            """
            Try permanent delete first; if it fails, try moving to trash.
            Returns: (success: bool, used_trash: bool, saw_not_found: bool)
            """
            if not target_file_id:
                return False, False, False

            delete_error = None
            delete_not_found = False
            try:
                drive.service.files().delete(
                    fileId=target_file_id,
                    supportsAllDrives=True
                ).execute()
                delete_attempts.append({
                    "file_id": target_file_id,
                    "source": source,
                    "result": "deleted"
                })
                return True, False, False
            except Exception as err:
                delete_error = err
                delete_not_found = is_not_found_error(err)

            try:
                drive.service.files().update(
                    fileId=target_file_id,
                    supportsAllDrives=True,
                    body={'trashed': True},
                    fields='id,trashed'
                ).execute()
                delete_attempts.append({
                    "file_id": target_file_id,
                    "source": source,
                    "result": "trashed",
                    "delete_error": str(delete_error)
                })
                return True, True, delete_not_found
            except Exception as trash_error:
                trash_not_found = is_not_found_error(trash_error)
                delete_attempts.append({
                    "file_id": target_file_id,
                    "source": source,
                    "result": "failed",
                    "delete_error": str(delete_error),
                    "trash_error": str(trash_error)
                })
                if not delete_not_found and not trash_not_found:
                    non_not_found_errors.append({
                        "file_id": target_file_id,
                        "source": source,
                        "delete_error": str(delete_error),
                        "trash_error": str(trash_error)
                    })
                return False, False, (delete_not_found or trash_not_found)

        primary_ids = []
        if live_file_id:
            primary_ids.append(live_file_id)
        if file_id and file_id != live_file_id:
            primary_ids.append(file_id)
        for candidate_id in candidate_file_ids:
            if candidate_id not in primary_ids:
                primary_ids.append(candidate_id)

        for candidate_primary_id in primary_ids:
            if deleted_file_id:
                break
            success, used_trash, saw_not_found = try_delete_or_trash(candidate_primary_id, 'primary')
            if success:
                deleted_file_id = candidate_primary_id
                moved_to_trash = moved_to_trash or used_trash
            elif saw_not_found:
                # If not found by ID, attempt fallback by filename+folder_id.
                not_found_by_id = True

        # Always resolve path folder as a second source of truth.
        # A stale folder_id from QC metadata can otherwise block valid path-based deletion.
        path_folder_id = resolve_folder_id_from_path(path) if path else None
        folder_candidates = []
        for candidate_folder in [folder_id, path_folder_id]:
            if candidate_folder and candidate_folder not in folder_candidates:
                folder_candidates.append(candidate_folder)
        if not folder_id and path_folder_id:
            folder_id = path_folder_id

        if not deleted_file_id and filename and folder_candidates:
            for candidate_folder in folder_candidates:
                candidates = find_files_by_name_in_folder(candidate_folder, filename)
                if not candidates:
                    continue
                for candidate in candidates:
                    candidate_id = candidate.get('id')
                    if not candidate_id:
                        continue
                    success, used_trash, _ = try_delete_or_trash(candidate_id, f'folder:{candidate_folder}')
                    if success:
                        deleted_file_id = candidate_id
                        moved_to_trash = moved_to_trash or used_trash
                        deleted_by_fallback = True
                        break
                if deleted_file_id:
                    break

        if not deleted_file_id and filename:
            # Last-resort: global filename lookup.
            global_matches = find_files_by_name_global(filename)
            filtered_matches = []
            if folder_candidates:
                for match in global_matches:
                    parent_ids = match.get('parents') or []
                    if any(parent_id in folder_candidates for parent_id in parent_ids):
                        filtered_matches.append(match)

            delete_candidates = filtered_matches if filtered_matches else (
                global_matches if len(global_matches) == 1 else []
            )
            for candidate in delete_candidates:
                candidate_id = candidate.get('id')
                if not candidate_id:
                    continue
                success, used_trash, _ = try_delete_or_trash(candidate_id, 'global-name')
                if success:
                    deleted_file_id = candidate_id
                    moved_to_trash = moved_to_trash or used_trash
                    deleted_by_fallback = True
                    break

        if not deleted_file_id:
            # Extra fallback via uploaded_files cache using path+filename to locate live file/folder.
            # This handles stale QC file_id after reuploads.
            try:
                from src.supabase_client import get_supabase_client
                supabase = get_supabase_client()

                if filename:
                    cached_rows = supabase.table('uploaded_files').select(
                        'drive_file_id,drive_folder_id,path,filename'
                    ).eq('filename', filename).execute().data or []

                    normalized_requested_path = normalize_path(path)
                    cached_matches = [
                        row for row in cached_rows
                        if normalized_requested_path and normalize_path(row.get('path')) == normalized_requested_path
                    ]
                    if not cached_matches and folder_candidates:
                        cached_matches = [
                            row for row in cached_rows
                            if row.get('drive_folder_id') in folder_candidates
                        ]
                    if not cached_matches:
                        cached_matches = cached_rows

                    if cached_matches:
                        if not folder_id and cached_matches[0].get('drive_folder_id'):
                            folder_id = cached_matches[0].get('drive_folder_id')
                        for match in cached_matches:
                            candidate_id = match.get('drive_file_id')
                            if not candidate_id:
                                continue
                            success, used_trash, _ = try_delete_or_trash(candidate_id, 'uploaded-cache')
                            if success:
                                deleted_file_id = candidate_id
                                moved_to_trash = moved_to_trash or used_trash
                                deleted_by_fallback = True
                                break
            except Exception as cache_lookup_error:
                print(f"Warning: failed to resolve delete candidate from uploaded_files: {cache_lookup_error}")

        if not deleted_file_id:
            # Treat as already deleted only when caller gave no filename/folder/path fallback context.
            if not_found_by_id and (file_id or live_file_id) and not filename and not folder_id and not path:
                already_deleted = True
                deleted_file_id = live_file_id or file_id
            else:
                folder_probe = {}
                for candidate_folder in folder_candidates:
                    try:
                        folder_files = list_files_in_folder(candidate_folder)
                        folder_probe[candidate_folder] = {
                            "count": len(folder_files),
                            "files": [
                                {
                                    "id": f.get('id'),
                                    "name": f.get('name')
                                }
                                for f in folder_files[:20]
                            ]
                        }
                    except Exception as probe_error:
                        folder_probe[candidate_folder] = {
                            "error": str(probe_error)
                        }
                if non_not_found_errors:
                    return jsonify({
                        "success": False,
                        "error": "File was found but could not be deleted with current Drive permissions/token.",
                        "error_type": "DELETE_PERMISSION_ERROR",
                        "not_found_by_id": not_found_by_id,
                        "attempted_primary_ids": primary_ids,
                        "attempted_folder_ids": folder_candidates,
                        "path_resolved_folder_id": path_folder_id,
                        "folder_probe": folder_probe,
                        "non_not_found_errors": non_not_found_errors,
                        "delete_attempts": delete_attempts[-20:],
                        "filename": filename,
                        "folder_id": folder_id,
                        "path": path
                    }), 403
                return jsonify({
                    "success": False,
                    "error": "File was not deleted. Target file was not found in Drive.",
                    "error_type": "FILE_NOT_FOUND",
                    "not_found_by_id": not_found_by_id,
                    "attempted_primary_ids": primary_ids,
                    "attempted_folder_ids": folder_candidates,
                    "path_resolved_folder_id": path_folder_id,
                    "folder_probe": folder_probe,
                    "delete_attempts": delete_attempts[-20:],
                    "filename": filename,
                    "folder_id": folder_id,
                    "path": path
                }), 404

        # Best-effort cache cleanup (do not fail request if DB is unavailable).
        try:
            from src.supabase_client import get_supabase_client
            supabase = get_supabase_client()
            ids_to_cleanup = set()
            if file_id:
                ids_to_cleanup.add(file_id)
            if live_file_id:
                ids_to_cleanup.add(live_file_id)
            if deleted_file_id:
                ids_to_cleanup.add(deleted_file_id)

            for cleanup_id in ids_to_cleanup:
                # Remove upload cache row.
                supabase.table('uploaded_files').delete().eq('drive_file_id', cleanup_id).execute()

                # Remove QC tracking row for this Drive file.
                # Actions are cascaded by FK (ON DELETE CASCADE).
                supabase.table('mz_27ss_upload_qc').delete().eq('file_id', cleanup_id).execute()
        except Exception as cache_error:
            print(f"Warning: failed to cleanup DB metadata for {file_id}: {cache_error}")

        return jsonify({
            "success": True,
            "message": (
                "File already deleted in Drive. QC metadata cleaned."
                if already_deleted
                else ("File moved to trash successfully" if moved_to_trash else "File deleted successfully")
            ),
            "deleted_file_id": deleted_file_id,
            "deleted_by_fallback": deleted_by_fallback,
            "already_deleted": already_deleted,
            "moved_to_trash": moved_to_trash
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "error_type": "SERVER_ERROR"
        }), 500


@app.route('/api/drive/reset-structure', methods=['POST'])
@require_auth
def drive_reset_structure():
    """
    Delete all contents of the root folder and recreate the structure.

    Request JSON:
        {
            "google_token": "google-access-token",
            "root_folder_id": "root-folder-id",
            "paths": [["Pack1", "SubFolder1"], ...],
            "confirm_reset": true
        }
    """
    try:
        drive, error = get_drive_service_from_request()
        if not drive:
            return jsonify({
                "success": False,
                "error": error,
                "error_type": "AUTH_REQUIRED"
            }), 401

        data = request.get_json() or {}
        root_folder_id = data.get('root_folder_id') or os.environ.get('DRIVE_ROOT_FOLDER_ID')
        paths = data.get('paths')
        confirm_reset = data.get('confirm_reset', False)

        if not root_folder_id:
            return jsonify({
                "success": False,
                "error": "No root folder ID provided.",
                "error_type": "CONFIG_ERROR"
            }), 400

        # Validate root folder exists and is accessible
        folder_info = drive.get_folder_info(root_folder_id)
        if not folder_info:
            return jsonify({
                "success": False,
                "error": f"Root folder not found or not accessible. Folder ID: {root_folder_id}. "
                         "Please verify the folder ID is correct and that your Google account has access to it.",
                "error_type": "FOLDER_NOT_FOUND"
            }), 404

        if not confirm_reset:
            return jsonify({
                "success": False,
                "error": "Reset confirmation required (confirm_reset=True)",
                "error_type": "CONFIRMATION_REQUIRED"
            }), 400

        # 1. Delete all contents
        delete_result = drive.delete_folder_contents(root_folder_id)
        if not delete_result['success']:
            return jsonify({
                "success": False,
                "error": f"Failed to empty folder: {delete_result.get('error')}",
                "error_type": "DELETE_ERROR"
            }), 500

        # 2. Re-create structure
        # If no paths provided, generate from config
        if not paths:
            from src.directory_generator import generate_flat_paths
            path_strings = generate_flat_paths()
            # Convert string paths to list of parts
            paths = [p.split('/') for p in path_strings]

        create_result = drive.create_structure(paths, root_folder_id, dry_run=False)
        create_result['success'] = True
        create_result['reset_stats'] = {
            'deleted': delete_result['deleted_count'],
            'failed_delete': delete_result['failed_count']
        }

        return jsonify(create_result)

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "error_type": "SERVER_ERROR"
        }), 500


# =============================================================================
# QC Management Endpoints
# =============================================================================
# Note: QC Matrix now uses /api/drive/check-structure for directory status
# This is the same fast endpoint used by Directory Structure tab


@app.route('/api/qc/records', methods=['GET'])
@require_auth
def qc_get_records():
    """
    Get persisted QC records keyed by Drive file ID.

    Response JSON:
        {
            "success": true,
            "records": [
                {
                    "file_id": "drive_file_id",
                    "status": "1/3 Approved",
                    "approval_count": 1,
                    "latest_action_type": "approve",
                    "latest_comment": null
                }
            ]
        }
    """
    try:
        from src.supabase_client import get_supabase_client

        supabase = get_supabase_client()
        qc_rows = supabase.table('mz_27ss_upload_qc').select(
            'id,file_id,filename,status,approval_count,updated_at'
        ).execute().data or []

        if not qc_rows:
            return jsonify({
                "success": True,
                "records": []
            })

        # Latest actions for status context (actions.file_id points to QC table id).
        action_rows = supabase.table('mz_27ss_upload_qc_actions').select(
            'file_id,action_type,comment,created_at,user_email'
        ).order('created_at', ascending=False).execute().data or []
        latest_action_by_qc_id = {}
        latest_comment_by_qc_id = {}
        for action in action_rows:
            qc_id = action.get('file_id')
            if qc_id and qc_id not in latest_action_by_qc_id:
                latest_action_by_qc_id[qc_id] = action
            if qc_id and qc_id not in latest_comment_by_qc_id and str(action.get('comment') or '').strip():
                latest_comment_by_qc_id[qc_id] = action

        records = []
        for qc in qc_rows:
            latest_action = latest_action_by_qc_id.get(qc.get('id'), {})
            latest_comment_action = latest_comment_by_qc_id.get(qc.get('id'), {})
            approval_count = int(qc.get('approval_count') or 0)
            latest_action_type = latest_action.get('action_type')
            if approval_count >= 3:
                display_status = 'APPROVED'
            elif approval_count > 0:
                display_status = f'{approval_count}/3 Approved'
            elif latest_action_type in ('comment', 'reject'):
                display_status = 'Pending'
            else:
                display_status = 'Pending'
            records.append({
                'qc_id': qc.get('id'),
                'file_id': qc.get('file_id'),
                'filename': qc.get('filename'),
                'status': display_status,
                'approval_count': approval_count,
                'updated_at': qc.get('updated_at'),
                'latest_action_type': latest_action_type,
                'latest_comment': latest_comment_action.get('comment'),
                'latest_comment_at': latest_comment_action.get('created_at'),
                'latest_action_at': latest_action.get('created_at'),
                'latest_action_user': latest_action.get('user_email')
            })

        return jsonify({
            "success": True,
            "records": records
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "error_type": "SERVER_ERROR"
        }), 500


@app.route('/api/qc/reconcile-live-files', methods=['POST'])
@require_auth
def qc_reconcile_live_files():
    """
    Reconcile QC metadata against current live Drive files discovered by frontend scan.

    Request JSON:
        {
            "live_file_ids": ["drive_file_id_1", "drive_file_id_2", ...]
        }
    """
    try:
        from src.supabase_client import get_supabase_client

        data = request.get_json() or {}
        live_file_ids = data.get('live_file_ids', [])
        if not isinstance(live_file_ids, list):
            return jsonify({
                "success": False,
                "error": "live_file_ids must be an array",
                "error_type": "INVALID_REQUEST"
            }), 400

        # Deduplicate and keep only non-empty strings.
        live_file_ids = list(dict.fromkeys([
            file_id.strip()
            for file_id in live_file_ids
            if isinstance(file_id, str) and file_id.strip()
        ]))
        live_set = set(live_file_ids)

        supabase = get_supabase_client()
        qc_rows = supabase.table('mz_27ss_upload_qc').select('id,file_id').execute().data or []
        stale_file_ids = [
            row.get('file_id')
            for row in qc_rows
            if row.get('file_id') and row.get('file_id') not in live_set
        ]
        stale_file_ids = list(dict.fromkeys(stale_file_ids))

        if not stale_file_ids:
            return jsonify({
                "success": True,
                "removed_qc_rows": 0,
                "removed_uploaded_rows": 0,
                "stale_file_ids": []
            })

        # Build stale upload cache set as well (some stale uploads may exist without QC rows).
        uploaded_rows = supabase.table('uploaded_files').select('drive_file_id').execute().data or []
        stale_uploaded_ids = list(dict.fromkeys([
            row.get('drive_file_id')
            for row in uploaded_rows
            if row.get('drive_file_id') and row.get('drive_file_id') not in live_set
        ]))

        removed_qc_rows = 0
        for stale_id in stale_file_ids:
            supabase.table('mz_27ss_upload_qc').delete().eq('file_id', stale_id).execute()
            removed_qc_rows += 1

        removed_uploaded_rows = 0
        for stale_id in stale_uploaded_ids:
            supabase.table('uploaded_files').delete().eq('drive_file_id', stale_id).execute()
            removed_uploaded_rows += 1

        return jsonify({
            "success": True,
            "removed_qc_rows": removed_qc_rows,
            "removed_uploaded_rows": removed_uploaded_rows,
            "stale_file_ids": stale_file_ids,
            "stale_uploaded_ids": stale_uploaded_ids
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "error_type": "SERVER_ERROR"
        }), 500


@app.route('/api/qc/todo', methods=['GET'])
@require_auth
def qc_get_todo_list():
    """
    Get DB-backed QC ToDo list.

    A file appears in ToDo when its latest action is a 'comment'.
    This keeps ToDo persistent across page reloads and sessions.
    """
    try:
        from src.supabase_client import get_supabase_client

        supabase = get_supabase_client()

        qc_rows = supabase.table('mz_27ss_upload_qc').select('*').execute().data
        action_rows = supabase.table('mz_27ss_upload_qc_actions').select('*').order('created_at', ascending=False).execute().data

        # Optional path mapping from uploaded_files cache (if available).
        try:
            uploaded_rows = supabase.table('uploaded_files').select(
                'drive_file_id,drive_folder_id,path,filename'
            ).execute().data
        except Exception:
            uploaded_rows = []

        path_by_drive_file_id = {
            row.get('drive_file_id'): row.get('path')
            for row in uploaded_rows
            if row.get('drive_file_id')
        }
        folder_by_drive_file_id = {
            row.get('drive_file_id'): row.get('drive_folder_id')
            for row in uploaded_rows
            if row.get('drive_file_id')
        }

        uploads_by_filename = {}
        for row in uploaded_rows:
            normalized_name = str(row.get('filename') or '').strip().lower()
            if not normalized_name:
                continue
            uploads_by_filename.setdefault(normalized_name, []).append(row)

        # actions.file_id points to qc table id.
        latest_action_by_qc_id = {}
        for action in action_rows:
            qc_id = action.get('file_id')
            if qc_id and qc_id not in latest_action_by_qc_id:
                latest_action_by_qc_id[qc_id] = action

        todo_items = []
        for qc in qc_rows:
            latest_action = latest_action_by_qc_id.get(qc.get('id'))
            if not latest_action:
                continue

            if latest_action.get('action_type') != 'comment':
                continue

            comment = (latest_action.get('comment') or '').strip()
            if not comment:
                continue

            drive_file_id = qc.get('file_id')
            filename = qc.get('filename')
            path = path_by_drive_file_id.get(drive_file_id, '')
            folder_id = folder_by_drive_file_id.get(drive_file_id)

            # Fallback when drive_file_id is stale but filename has a single cached match.
            if not path and filename:
                candidates = uploads_by_filename.get(str(filename).strip().lower(), [])
                if len(candidates) == 1:
                    path = candidates[0].get('path') or path
                    folder_id = candidates[0].get('drive_folder_id') or folder_id

            todo_items.append({
                'qc_id': qc.get('id'),
                'file_id': drive_file_id,
                'folder_id': folder_id,
                'filename': filename,
                'web_view_link': qc.get('web_view_link'),
                'path': path,
                'comment': comment,
                'commented_by': latest_action.get('user_email'),
                'created_at': latest_action.get('created_at')
            })

        # Newest comments first.
        todo_items.sort(key=lambda x: x.get('created_at') or '', reverse=True)

        return jsonify({
            'success': True,
            'todo': todo_items,
            'count': len(todo_items)
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "error_type": "SERVER_ERROR"
        }), 500


@app.route('/api/qc/approve', methods=['POST'])
@require_auth
def qc_approve_file():
    """
    Approve a file and record the action with user info.

    Request JSON:
        {
            "file_id": "google_file_id",
            "filename": "file.jpg",
            "web_view_link": "https://..."
        }

    Response: Updated QC record. A file requires 3 approvals from 3 distinct users.
    """
    try:
        from src.supabase_client import get_supabase_client

        data = request.get_json()
        file_id = data.get('file_id')
        filename = data.get('filename')
        web_view_link = data.get('web_view_link')
        mime_type = data.get('mime_type')

        if not file_id:
            return jsonify({
                "success": False,
                "error": "Missing file_id"
            }), 400

        supabase = get_supabase_client()

        # Get current user info from auth (use stable user id, not raw JWT token).
        access_token = auth.get_token_from_header()
        user = auth.get_auth_status_from_token(access_token).get('user', {})
        user_id = user.get('id') or user.get('email') or access_token
        user_email = user.get('email', 'unknown@example.com')

        # Check if QC record exists, if not create it
        response = supabase.table('mz_27ss_upload_qc').select('*').eq('file_id', file_id).execute()

        if not response.data:
            # Create new QC record
            qc_record = {
                'file_id': file_id,
                'filename': filename,
                'web_view_link': web_view_link,
                'mime_type': mime_type,
                'approval_count': 0
            }
            supabase.table('mz_27ss_upload_qc').insert(qc_record).execute()
            qc_id = supabase.table('mz_27ss_upload_qc').select('id').eq('file_id', file_id).execute().data[0]['id']
        else:
            qc_id = response.data[0]['id']

        # Load action history to enforce distinct approvers per cycle.
        # A "comment" action resets the cycle.
        actions_response = supabase.table('mz_27ss_upload_qc_actions').select(
            'action_type,user_id,user_email'
        ).eq('file_id', qc_id).order('created_at', ascending=True).execute()
        actions = actions_response.data or []

        cycle_actions = []
        for action in actions:
            if action.get('action_type') in ('comment', 'reject'):
                cycle_actions = []
                continue
            cycle_actions.append(action)

        approver_keys = set()
        for action in cycle_actions:
            if action.get('action_type') != 'approve':
                continue
            action_user_id = action.get('user_id')
            action_user_email = str(action.get('user_email') or '').strip().lower()
            approver_key = action_user_id or action_user_email
            if approver_key:
                approver_keys.add(approver_key)

        current_user_key = user_id or str(user_email or '').strip().lower()
        if current_user_key in approver_keys:
            current_count = len(approver_keys)
            current_display_status = 'APPROVED' if current_count >= 3 else (f'{current_count}/3 Approved' if current_count > 0 else 'Pending')

            # Keep QC summary in sync with computed distinct approvals.
            supabase.table('mz_27ss_upload_qc').update({
                'approval_count': current_count
            }).eq('id', qc_id).execute()

            return jsonify({
                "success": True,
                "message": "You already approved this file. It still needs approvals from different users.",
                "approval_count": current_count,
                "status": current_display_status,
                "duplicate_approval": True
            })

        new_count = len(approver_keys) + 1
        new_display_status = 'APPROVED' if new_count >= 3 else f'{new_count}/3 Approved'

        # Update QC record
        supabase.table('mz_27ss_upload_qc').update({
            'approval_count': new_count
        }).eq('id', qc_id).execute()

        # Record action
        supabase.table('mz_27ss_upload_qc_actions').insert({
            'file_id': qc_id,
            'action_type': 'approve',
            'user_id': user_id,
            'user_email': user_email
        }).execute()

        return jsonify({
            "success": True,
            "message": "File fully approved (3/3)." if new_display_status == 'APPROVED' else f"Approval recorded from {user_email} ({new_count}/3).",
            "approval_count": new_count,
            "status": new_display_status,
            "duplicate_approval": False
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "error_type": "SERVER_ERROR"
        }), 500


@app.route('/api/qc/comment', methods=['POST'])
@app.route('/api/qc/reject', methods=['POST'])  # Backward compatibility
@require_auth
def qc_reject_file():
    """
    Save a QC comment for a file.

    Request JSON:
        {
            "file_id": "google_file_id",
            "filename": "file.jpg",
            "web_view_link": "https://...",
            "comment": "QC feedback comment"
        }
    """
    try:
        from src.supabase_client import get_supabase_client

        data = request.get_json()
        file_id = data.get('file_id')
        filename = data.get('filename')
        web_view_link = data.get('web_view_link')
        comment = data.get('comment', '')

        if not file_id:
            return jsonify({
                "success": False,
                "error": "Missing file_id"
            }), 400
        if not str(comment).strip():
            return jsonify({
                "success": False,
                "error": "Missing comment"
            }), 400

        supabase = get_supabase_client()

        # Get user info (use stable user id, not raw JWT token).
        access_token = auth.get_token_from_header()
        user = auth.get_auth_status_from_token(access_token).get('user', {})
        user_id = user.get('id') or user.get('email') or access_token
        user_email = user.get('email', 'unknown@example.com')

        # Check if QC record exists, if not create it
        response = supabase.table('mz_27ss_upload_qc').select('*').eq('file_id', file_id).execute()

        if not response.data:
            qc_record = {
                'file_id': file_id,
                'filename': filename,
                'web_view_link': web_view_link,
                'approval_count': 0
            }
            supabase.table('mz_27ss_upload_qc').insert(qc_record).execute()
            qc_id = supabase.table('mz_27ss_upload_qc').select('id').eq('file_id', file_id).execute().data[0]['id']
        else:
            qc_id = response.data[0]['id']

        # Reset approval progress for current review cycle.
        supabase.table('mz_27ss_upload_qc').update({
            'approval_count': 0
        }).eq('id', qc_id).execute()

        # Record comment action
        supabase.table('mz_27ss_upload_qc_actions').insert({
            'file_id': qc_id,
            'action_type': 'comment',
            'user_id': user_id,
            'user_email': user_email,
            'comment': comment
        }).execute()

        return jsonify({
            "success": True,
            "message": f"Comment saved by {user_email}"
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "error_type": "SERVER_ERROR"
        }), 500


@app.route('/api/qc/actions/<file_id>', methods=['GET'])
@require_auth
def qc_get_actions(file_id):
    """
    Get all actions (approvals, rejections, comments) for a file.

    Response JSON:
        {
            "success": true,
            "actions": [
                {
                    "id": "uuid",
                    "action_type": "approve",
                    "user_email": "user@example.com",
                    "comment": "...",
                    "created_at": "2026-01-23T..."
                }
            ]
        }
    """
    try:
        from src.supabase_client import get_supabase_client

        supabase = get_supabase_client()

        # Get QC record ID from file_id
        qc_response = supabase.table('mz_27ss_upload_qc').select('id').eq('file_id', file_id).execute()

        if not qc_response.data:
            return jsonify({
                "success": True,
                "actions": []
            })

        qc_id = qc_response.data[0]['id']

        # Get all actions for this file
        actions = supabase.table('mz_27ss_upload_qc_actions').select('*').eq('file_id', qc_id).order('created_at', ascending=True).execute()

        return jsonify({
            "success": True,
            "actions": actions.data
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "error_type": "SERVER_ERROR"
        }), 500


if __name__ == '__main__':
    print("Starting Filename Resolver API...")
    print("API available at: http://localhost:5001")
    print("Endpoint: POST /api/resolve")
    print("Auth: Uses Supabase JWT tokens (Bearer authentication)")
    print("Drive: Requires Google token from Supabase session")
    app.run(debug=True, host='0.0.0.0', port=5001)
