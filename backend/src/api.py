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

        # If no paths provided, generate from config
        if not paths:
            from src.directory_generator import generate_flat_paths
            path_strings = generate_flat_paths()
            # Convert string paths to list of parts (skip root folder)
            root_name = os.environ.get('DRIVE_ROOT_FOLDER', '26SS_FTW_Sell-in')
            paths = []
            for p in path_strings:
                parts = p.split('/')
                # Skip the root folder name if present
                if parts and parts[0] == root_name:
                    parts = parts[1:]
                if parts:
                    paths.append(parts)

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

        # If no paths provided, generate from config
        if not paths:
            from src.directory_generator import generate_flat_paths
            path_strings = generate_flat_paths()
            # Convert string paths to list of parts (skip root folder)
            root_name = os.environ.get('DRIVE_ROOT_FOLDER', '26SS_FTW_Sell-in')
            paths = []
            for p in path_strings:
                parts = p.split('/')
                # Skip the root folder name if present
                if parts and parts[0] == root_name:
                    parts = parts[1:]
                if parts:
                    paths.append(parts)

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


if __name__ == '__main__':
    print("Starting Filename Resolver API...")
    print("API available at: http://localhost:5001")
    print("Endpoint: POST /api/resolve")
    print("Auth: Uses Supabase JWT tokens (Bearer authentication)")
    print("Drive: Requires Google token from Supabase session")
    app.run(debug=True, host='0.0.0.0', port=5001)
