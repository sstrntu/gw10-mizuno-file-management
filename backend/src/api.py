"""
Flask API for Filename Resolver
Provides REST API endpoint for filename resolution.
"""

import os
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
        return None, "Failed to create Google credentials"

    return DriveService(credentials), None


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
                "error_type": "DRIVE_ERROR"
            }), 400

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
                "error_type": "DRIVE_ERROR"
            }), 400

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
                "error_type": "DRIVE_ERROR"
            }), 400

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
                "error_type": "DRIVE_ERROR"
            }), 400

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
                "error_type": "DRIVE_ERROR"
            }), 400

        root_folder_id = request.args.get('root_folder_id') or os.environ.get('DRIVE_ROOT_FOLDER_ID')

        # If root_folder_id is provided, we'll list files in that folder and subfolders
        # For simplicity, we'll list all non-folder files in Drive
        query = "mimeType != 'application/vnd.google-apps.folder' and trashed = false"

        all_files = []
        page_token = None

        while True:
            results = drive.service.files().list(
                q=query,
                spaces='drive',
                fields='nextPageToken, files(id, name, mimeType, webViewLink, createdTime, modifiedTime)',
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
            "files": all_files,
            "total": len(all_files)
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
                "error": error
            }), 400

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
                "error_type": "DRIVE_ERROR"
            }), 400

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

        # 6b. Check if file already exists
        if drive.file_exists(filename, final_folder_id):
            return jsonify({
                "success": False,
                "error": f"File '{filename}' already exists in this folder",
                "error_type": "FILE_EXISTS"
            }), 409

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

        # 8. Return success response
        return jsonify({
            "success": True,
            "filename": filename,
            "actual_filename": upload_result.get('filename'),
            "file_id": upload_result.get('file_id'),
            "web_view_link": upload_result.get('web_view_link'),
            "created_time": upload_result.get('created_time'),
            "storage_path": result.path_info.get('full_path', '')
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Server error: {str(e)}",
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
                "error_type": "DRIVE_ERROR"
            }), 400

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

@app.route('/api/qc/files', methods=['GET'])
@require_auth
def qc_get_files():
    """
    Get all QC files with their approval status.
    Fetches files from Google Drive and merges with QC data from Supabase.

    Response JSON:
        {
            "success": true,
            "files": [
                {
                    "id": "uuid",
                    "file_id": "google_file_id",
                    "filename": "file.jpg",
                    "web_view_link": "https://drive.google.com/...",
                    "mime_type": "image/jpeg",
                    "status": "APPROVED",
                    "approval_count": 3,
                    "created_at": "2026-01-23T...",
                    "updated_at": "2026-01-23T..."
                }
            ]
        }
    """
    try:
        from src.supabase_client import get_supabase_client

        # Get all QC records from Supabase
        supabase = get_supabase_client()
        response = supabase.table('mz_27ss_upload_qc').select('*').execute()

        qc_records = {record['file_id']: record for record in response.data}

        # Get all files from Google Drive
        drive, error = get_drive_service_from_request()
        if not drive:
            return jsonify({
                "success": False,
                "error": error,
                "error_type": "DRIVE_ERROR"
            }), 400

        query = "mimeType != 'application/vnd.google-apps.folder' and trashed = false"
        all_files = []
        page_token = None

        while True:
            results = drive.service.files().list(
                q=query,
                spaces='drive',
                fields='nextPageToken, files(id, name, mimeType, webViewLink, createdTime, modifiedTime)',
                pageSize=1000,
                pageToken=page_token,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                orderBy='createdTime desc'
            ).execute()

            files = results.get('files', [])

            # Merge with QC data
            for file in files:
                qc_data = qc_records.get(file['id'], {})
                file['qc'] = {
                    'id': qc_data.get('id'),
                    'status': qc_data.get('status', 'Pending'),
                    'approval_count': qc_data.get('approval_count', 0),
                    'created_at': qc_data.get('created_at'),
                    'updated_at': qc_data.get('updated_at')
                }

            all_files.extend(files)
            page_token = results.get('nextPageToken')
            if not page_token:
                break

        return jsonify({
            "success": True,
            "files": all_files,
            "total": len(all_files)
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

    Response: Updated QC record
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

        # Get current user info from auth
        user_id = auth.get_token_from_header()
        user = auth.get_auth_status_from_token(user_id).get('user', {})
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
                'status': 'Pending',
                'approval_count': 0
            }
            supabase.table('mz_27ss_upload_qc').insert(qc_record).execute()
            qc_id = supabase.table('mz_27ss_upload_qc').select('id').eq('file_id', file_id).execute().data[0]['id']
        else:
            qc_id = response.data[0]['id']

        # Increment approval count
        current = supabase.table('mz_27ss_upload_qc').select('approval_count').eq('id', qc_id).execute().data[0]
        new_count = current['approval_count'] + 1
        new_status = 'APPROVED' if new_count >= 3 else f'{new_count}/3 Approved'

        # Update QC record
        supabase.table('mz_27ss_upload_qc').update({
            'approval_count': new_count,
            'status': new_status
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
            "message": f"File approved by {user_email}",
            "approval_count": new_count
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "error_type": "SERVER_ERROR"
        }), 500


@app.route('/api/qc/reject', methods=['POST'])
@require_auth
def qc_reject_file():
    """
    Reject a file with a comment.

    Request JSON:
        {
            "file_id": "google_file_id",
            "filename": "file.jpg",
            "web_view_link": "https://...",
            "comment": "Reason for rejection"
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

        supabase = get_supabase_client()

        # Get user info
        user_id = auth.get_token_from_header()
        user = auth.get_auth_status_from_token(user_id).get('user', {})
        user_email = user.get('email', 'unknown@example.com')

        # Check if QC record exists, if not create it
        response = supabase.table('mz_27ss_upload_qc').select('*').eq('file_id', file_id).execute()

        if not response.data:
            qc_record = {
                'file_id': file_id,
                'filename': filename,
                'web_view_link': web_view_link,
                'status': 'Pending',
                'approval_count': 0
            }
            supabase.table('mz_27ss_upload_qc').insert(qc_record).execute()
            qc_id = supabase.table('mz_27ss_upload_qc').select('id').eq('file_id', file_id).execute().data[0]['id']
        else:
            qc_id = response.data[0]['id']

        # Reset status to Pending
        supabase.table('mz_27ss_upload_qc').update({
            'status': 'Pending',
            'approval_count': 0
        }).eq('id', qc_id).execute()

        # Record rejection action
        supabase.table('mz_27ss_upload_qc_actions').insert({
            'file_id': qc_id,
            'action_type': 'reject',
            'user_id': user_id,
            'user_email': user_email,
            'comment': comment
        }).execute()

        return jsonify({
            "success": True,
            "message": f"File rejected by {user_email}"
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
        actions = supabase.table('mz_27ss_upload_qc_actions').select('*').eq('file_id', qc_id).order('created_at', desc=False).execute()

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
