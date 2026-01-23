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
        allowed_extensions = config.get('allowedExtensions', [])

        file_ext = '.' + filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
        if file_ext not in allowed_extensions:
            return jsonify({
                "success": False,
                "error": f"File extension '{file_ext}' not allowed. Allowed: {', '.join(allowed_extensions)}",
                "error_type": "INVALID_EXTENSION"
            }), 400

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
        # The full_path includes the root folder name, but ensure_path_exists expects relative path
        all_path_parts = result.path.full_path.split('/')
        # Skip the first part (root folder name) since ensure_path_exists is relative to root_folder_id
        path_parts = all_path_parts[1:] if len(all_path_parts) > 1 else []

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
            "storage_path": result.path.full_path
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


if __name__ == '__main__':
    print("Starting Filename Resolver API...")
    print("API available at: http://localhost:5001")
    print("Endpoint: POST /api/resolve")
    print("Auth: Uses Supabase JWT tokens (Bearer authentication)")
    print("Drive: Requires Google token from Supabase session")
    app.run(debug=True, host='0.0.0.0', port=5001)
