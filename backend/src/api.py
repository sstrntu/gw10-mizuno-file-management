"""
Flask API for Filename Resolver
Provides REST API endpoint for filename resolution.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.resolver import resolve_filename

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend


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


if __name__ == '__main__':
    print("Starting Filename Resolver API...")
    print("API available at: http://localhost:5001")
    print("Endpoint: POST /api/resolve")
    app.run(debug=True, host='0.0.0.0', port=5001)
