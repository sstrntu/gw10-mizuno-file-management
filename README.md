# Mizuno File Management - Phase 1 MVP

A config-driven filename-to-path resolver for Mizuno's footwear marketing assets. This tool parses filenames and outputs structured Google Drive folder paths using rule-based logic.

## 🎯 Phase 1 Scope

**READ-ONLY** path resolution - no external APIs, no uploads, just validation and path resolution.

### Features
- ✅ Parse filenames with pack detection
- ✅ Detect model codes (optional)
- ✅ Match routing rules (first-match-wins)
- ✅ Resolve folder paths with placeholders
- ✅ Tree-style output visualization
- ✅ CLI interface
- ✅ Web UI (React + Flask)

### Out of Scope (Future Phases)
- ❌ Google OAuth
- ❌ Google Drive API
- ❌ File uploads
- ❌ QC workflows
- ❌ Database

## 🚀 Quick Start

### Option 1: Docker (Recommended)

**Prerequisites:**
- Docker
- Docker Compose

**Run the entire application:**

```bash
# Start both backend and frontend
docker-compose up

# Or run in detached mode
docker-compose up -d

# Stop the application
docker-compose down
```

The application will be available at:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:5001

### Option 2: Manual Setup

**Prerequisites:**
- Python 3.8+
- Node.js 16+
- npm

**Backend Setup:**

```bash
# Navigate to backend directory
cd backend

# Install Python dependencies
pip install -r requirements.txt

# Test CLI
python src/cli.py "26SS_FTW_Bright_Gold_KV_M2J_16x9_Clean.jpg"

# Start API server
python src/api.py
```

The API will be available at `http://localhost:5001`

**Frontend Setup:**

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The web UI will be available at `http://localhost:5173`

## 🐳 Docker Setup Details

The Docker setup includes:
- **Backend**: Python Flask API running on port 5001
- **Frontend**: React app built and served with Nginx on port 3000
- **Nginx Reverse Proxy**: Proxies `/api/*` requests from frontend to backend
- **Shared Network**: Both containers communicate on a bridge network

### Docker Commands

```bash
# Build and start containers
docker-compose up --build

# View logs
docker-compose logs -f

# Restart containers
docker-compose restart

# Stop and remove containers
docker-compose down

# Remove containers and volumes
docker-compose down -v
```

### Docker Architecture

```
Browser (localhost:3000)
    ↓
Nginx (Frontend Container)
    ├─→ Static Files (React Build)
    └─→ /api/* → Backend Container (Flask API on port 5001)
```

## 📖 Usage

### CLI Interface

```bash
python backend/src/cli.py "filename.jpg"
```

**Example:**
```bash
python backend/src/cli.py "26SS_FTW_Bright_Gold_KV_M2J_16x9_Clean.jpg"
```

**Output:**
```
Filename: 26SS_FTW_Bright_Gold_KV_M2J_16x9_Clean.jpg
============================================================

✓ Pack Detected: 1. Bright Gold Pack
✓ Model Detected: M2J - 4. MORELIA Ⅱ Japan
✓ Matched Rule: kv_model - Any _KV_ file that contains a model code

────────────────────────────────────────────────────────────
Resolved Path:
────────────────────────────────────────────────────────────
26SS_FTW_Sell-in
└── 1. Bright Gold Pack
    └── 1. Key Visual
        └── 4. MORELIA Ⅱ Japan
────────────────────────────────────────────────────────────

Full Path: 26SS_FTW_Sell-in/1. Bright Gold Pack/1. Key Visual/4. MORELIA Ⅱ Japan
```

### Web UI

1. Start the backend API: `python backend/src/api.py`
2. Start the frontend: `npm run dev` (in frontend directory)
3. Open `http://localhost:5173` in your browser
4. Enter a filename or click an example
5. Click "Resolve Path"

## 🗂️ Project Structure

```
gw10-mizuno-file-management/
├── config/                    # Configuration files
│   ├── config.json           # Main config with references
│   ├── packs.json            # Pack definitions
│   ├── models.json           # Model codes and folders
│   ├── folders.json          # Folder name mappings
│   └── rules.json            # Routing rules
├── backend/                   # Python backend
│   ├── src/
│   │   ├── config_loader.py  # Load and merge configs
│   │   ├── pack_detector.py  # Pack detection logic
│   │   ├── model_detector.py # Model code detection
│   │   ├── rule_matcher.py   # Rule matching engine
│   │   ├── path_resolver.py  # Path placeholder resolution
│   │   ├── resolver.py       # Main orchestrator
│   │   ├── cli.py           # CLI interface
│   │   └── api.py           # Flask API
│   └── requirements.txt
├── frontend/                  # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── FilenameInput.jsx
│   │   │   ├── PathOutput.jsx
│   │   │   └── ErrorDisplay.jsx
│   │   └── App.jsx
│   └── package.json
└── plan.md                    # Detailed project plan
```

## ⚙️ Configuration

All logic is **config-driven**. No hardcoded structure.

### Config Files

- **`config.json`**: Main config with file references
- **`packs.json`**: Pack definitions with keyTokens
- **`models.json`**: Model codes and folder names
- **`folders.json`**: Category and subfolder mappings
- **`rules.json`**: Routing rules (evaluated top-to-bottom)

### Example Filename Resolution

**Input:** `26SS_FTW_Bright_Gold_KV_N4BJ_16x9.psd`

**Process:**
1. **Pack Detection**: Matches "Bright Gold Pack" (all keyTokens found)
2. **Model Detection**: No model code found (N4BJ not in models.json)
3. **Rule Matching**: Matches `kv_psd` rule (contains `_KV_` + `.psd` extension)
4. **Path Resolution**: `{PACK_FOLDER}/{KEY_VISUAL}/{KV_PSD}`

**Output:** `26SS_FTW_Sell-in/1. Bright Gold Pack/1. Key Visual/2. PSD`

## ✅ Test Cases

### Valid Scenarios
- ✅ KV model image → `{PACK}/Key Visual/{MODEL}`
- ✅ KV_Pack image → `{PACK}/Key Visual/Color Pack`
- ✅ KV .psd → `{PACK}/Key Visual/PSD` (model not required)
- ✅ Tech Shot T01-T05 → `{PACK}/Tech Shots/{MODEL}`
- ✅ Supporting S01-S05 → `{PACK}/Supporting Images/{MODEL}`
- ✅ Carousel .png/.psd → `{PACK}/Carousel`

### Invalid Scenarios
- ❌ No pack match
- ❌ Multiple pack match
- ❌ T06 / S06 out of range
- ❌ Rule requires model but none exists
- ❌ Extension not allowed
- ❌ Matches zero rules

## 🔮 Future Phases

### Phase 2: Google Drive Integration
- Google OAuth
- Folder existence checks
- Create missing folders (never rename/delete)
- Dry-run mode

### Phase 3: File Upload
- Upload to resolved folder
- Overwrite rules (check for QC comments)
- Metadata storage

### Phase 4: QC & Approvals
- QC checklist
- Comments and to-do lists
- 3-user approval workflow
- Re-upload handling

### Phase 5: Scale & Notifications
- Slack/email notifications
- Audit logs
- Bulk upload
- Analytics dashboards

## 📝 API Reference

### POST `/api/resolve`

Resolve a filename to its folder path.

**Request:**
```json
{
  "filename": "26SS_FTW_Bright_Gold_KV_M2J_16x9.jpg"
}
```

**Response (Success):**
```json
{
  "success": true,
  "filename": "26SS_FTW_Bright_Gold_KV_M2J_16x9.jpg",
  "pack": {
    "id": "bright_gold",
    "folder": "1. Bright Gold Pack"
  },
  "model": {
    "code": "M2J",
    "folder": "4. MORELIA Ⅱ Japan"
  },
  "rule": {
    "id": "kv_model",
    "description": "Any _KV_ file that contains a model code"
  },
  "path": {
    "path_parts": ["1. Bright Gold Pack", "1. Key Visual", "4. MORELIA Ⅱ Japan"],
    "full_path": "26SS_FTW_Sell-in/1. Bright Gold Pack/1. Key Visual/4. MORELIA Ⅱ Japan",
    "tree": "26SS_FTW_Sell-in\n└── 1. Bright Gold Pack\n    └── 1. Key Visual\n        └── 4. MORELIA Ⅱ Japan"
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "filename": "invalid_file.jpg",
  "error": "No pack found for filename: invalid_file.jpg",
  "error_type": "PACK_ERROR"
}
```

## 🤝 Contributing

This is Phase 1 MVP. Future phases will add Google Drive integration, uploads, and QC workflows.

## 📄 License

Internal Mizuno project.
