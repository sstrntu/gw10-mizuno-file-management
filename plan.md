# plan.md — File Upload & QC Checklist Tool (Phased Build Plan)

## Goal
Build this tool in phases so we validate the **filename → directory resolution** logic first, before adding Google auth, Drive calls, uploads, and QC workflows.

This repo uses a **split-config approach**:
- `config/config.json`
- `config/packs.json`
- `config/models.json`
- `config/folders.json`
- `config/rules.json`

All logic is config-driven. Code must not hardcode structure.

---

## Phase 1 (MVP) — Filename Checks & Directory Printout (READ-ONLY) ✅ COMPLETE

### Objective
Resolve a filename into a **numbered, human-readable Google Drive path** and print it.

No external APIs. No Google Drive writes.

### Status: COMPLETED
- ✅ Config loading from JSON files
- ✅ Pack detection via keyTokens
- ✅ Model code detection
- ✅ Rule matching with contains, extensions, codeRange, anyOf
- ✅ Path resolution with placeholders
- ✅ CLI interface
- ✅ REST API (`/api/resolve`)
- ✅ Directory structure generation (`/api/structure`)
- ✅ React frontend with filename input, path output, error display
- ✅ Config viewer for editing configuration files

---

### Phase 1 Scope (IN)
- Load and merge all config files
- Parse filename string
- Detect pack via `packs.json`
- Detect model code via `models.json`
- Match routing rules in `rules.json`
- Resolve folder labels via `folders.json`
- Output resolved directory path

---

### Phase 1 Explicitly OUT of Scope
- Login / Google OAuth
- Google Drive API
- Folder creation
- File upload
- File existence checks
- QC / comments / approvals
- Database

---

## Phase 1 Input / Output

### Input
A filename string (text only):

```
26SS_FTW_Bright_Gold_KV_M2J_16x9_Clean.jpg
```

### Output (Success)
```
Resolved Path:
26SS_FTW_Sell-in
└── 1. Bright Gold Pack
    └── 1. Key Visual
        └── 4. MORELIA II JAPAN
```

### Output (Failure)
```
Error:
Filename contains _KV_ but no valid model code was found.
This rule requires a valid model code from models.json.
```

---

## Phase 1 Deliverables

### Repo Structure
```
/
  config/
    config.json
    packs.json
    models.json
    folders.json
    rules.json
  src/
    index.ts
    lib/
      configLoader.ts
      resolver.ts
      matchers.ts
      errors.ts
  plan.md
  README.md
```

---

## Phase 1 Interfaces

### Option A — CLI (preferred)
Command:
```bash
node dist/cli.js "26SS_FTW_Bright_Gold_KV_M2J_16x9_Clean.jpg"
```

Outputs:
- Resolved pack
- Matched rule ID
- Resolved path (single line)
- Tree-style output

### Option B — Minimal Web UI (optional)
Route:
- `/resolve-path`

UI:
- Filename input
- Resolve button
- Output panel

---

## Phase 1 Functional Requirements

| ID | Requirement |
|----|------------|
| P1-01 | Accept a filename string as input |
| P1-02 | Load all config files |
| P1-03 | Detect exactly one pack |
| P1-04 | Detect model code if present |
| P1-05 | Match rules in order |
| P1-06 | Resolve directory path |
| P1-07 | Print resolved path |
| P1-08 | Reject on ambiguity |
| P1-09 | Make no external API calls |

---

## Core Resolution Algorithm

### Step 1 — Load Config
- Read `config/config.json`
- Load referenced config files
- Build an in-memory config object:
  - `packs`
  - `models`
  - `folders`
  - `rules`

---

### Step 2 — Parse Filename
- Store full filename (including extension)
- Extract extension (e.g. `.psd`, `.jpg`)
- Keep base filename for substring matching

---

### Step 3 — Resolve Pack
- For each pack, all `keyTokens` must appear in the filename
- If no match → `PACK_NOT_FOUND`
- If multiple matches → `PACK_AMBIGUOUS`
- Else → `{PACK_FOLDER}` is resolved

---

### Step 4 — Resolve Model Code (Optional)
- Search the filename for any model code defined in `models.json`
- If found:
  - `modelCode`
  - `{MODEL_FOLDER}` (folder label)
- If not found:
  - Model remains undefined (only errors when the matched rule requires it)

---

### Step 5 — Match Routing Rule
Rules are evaluated **top to bottom**. First match wins.

Each rule may include:
- `contains` checks (substrings)
- `extensions` checks
- `requiresModelCode`
- `codeRange` checks (prefix + min/max + pad), e.g. `T01–T05`
- `anyOf` groups (e.g. carousel contains `_CAROUSEL` OR has `C01–C09`)

Match outcomes:
- 0 matches → `RULE_NOT_FOUND`
- >1 matches → `RULE_AMBIGUOUS` (treat as config error)
- 1 match → proceed

---

### Step 6 — Resolve Directory Path
Replace placeholders in `pathTemplate`:
- `{PACK_FOLDER}` from packs
- `{KEY_VISUAL}`, `{TECH_SHOTS}`, `{SUPPORTING}`, `{CAROUSEL}` from `folders.json`
- `{KV_COLOR_PACK}`, `{KV_PSD}`, `{CAROUSEL_1}`, `{CAROUSEL_2}` from `folders.json` (if used)
- `{MODEL_FOLDER}` from models (if used)

Return:
- `resolvedPathParts[]`
- `resolvedPathString` (join with `/`)
- `resolvedTreeString` (pretty-print)

---

## Confirmed Behavior Example (Must Pass)

Filename:
```
26SS_FTW_Bright_Gold_KV_N4BJ_16x9.psd
```

Expected:
- Pack → Bright Gold Pack
- Rule → KV PSD (pack-level)
- Model code is NOT required (even if unknown)
- Output path:
```
26SS_FTW_Sell-in/1. Bright Gold Pack/1. Key Visual/2. PSD
```

---

## Test Cases (Minimum)

### Valid
- KV model image routes to model folder
- KV_Pack image routes to Color Pack folder
- KV `.psd` routes to PSD folder (model not required)
- Tech Shot `T01–T05` routes to Tech Shots / Model folder
- Supporting `S01–S05` routes to Supporting Images / Model folder
- Carousel `.png/.psd` routes to Carousel 1/2 (requires user selection if ambiguous)

### Invalid
- No pack match
- Multiple pack match
- `T06` / `S06` out of range
- Rule requires model but none exists
- Extension not allowed
- Matches zero rules

---

## Phase 2 — Google Drive Directory Creation 🔄 IN PROGRESS

### Objective
Connect to Google Drive and create the resolved directory structure.

### Phase 2 Scope (IN)
- Google OAuth 2.0 authentication flow
- Drive API integration for folder operations
- Folder existence check before creation
- Create missing folders (never rename/delete)
- Dry-run toggle (preview mode vs actual creation)
- Session management for authenticated users

### Phase 2 Explicitly OUT of Scope
- File uploads
- File overwrite logic
- QC workflows
- Permissions management beyond basic auth

---

### Phase 2 Implementation Tasks

| ID | Task | Status |
|----|------|--------|
| P2-01 | Set up Google Cloud Project with Drive API | ⬜ User Setup Required |
| P2-02 | Implement OAuth 2.0 login flow (backend) | ✅ Complete |
| P2-03 | Create `/api/auth/login` endpoint | ✅ Complete |
| P2-04 | Create `/api/auth/callback` endpoint | ✅ Complete |
| P2-05 | Create `/api/auth/logout` endpoint | ✅ Complete |
| P2-06 | Implement Drive service wrapper | ✅ Complete |
| P2-07 | Add folder existence check function | ✅ Complete |
| P2-08 | Add folder creation function | ✅ Complete |
| P2-09 | Create `/api/drive/check-structure` endpoint | ✅ Complete |
| P2-10 | Create `/api/drive/create-directories` endpoint | ✅ Complete |
| P2-11 | Add dry-run toggle to creation endpoint | ✅ Complete |
| P2-12 | Update frontend with login button | ✅ Complete |
| P2-13 | Add Drive status indicator to UI | ✅ Complete |
| P2-14 | Update DirectoryCreator to use real Drive API | ✅ Complete |

---

### Phase 2 API Endpoints

#### Authentication
- `GET /api/auth/login` — Redirect to Google OAuth consent screen
- `GET /api/auth/callback` — Handle OAuth callback, store tokens
- `GET /api/auth/logout` — Clear session/tokens
- `GET /api/auth/status` — Check if user is authenticated

#### Drive Operations
- `POST /api/drive/check-structure` — Check which folders exist/missing
- `POST /api/drive/create-directories` — Create missing folders (with dry_run option)

---

### Phase 2 Environment Variables Required

#### Backend (.env)
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_JWT_SECRET=your-jwt-secret
DRIVE_ROOT_FOLDER_ID=<ID of 26SS_FTW_Sell-in folder>
DRIVE_ROOT_FOLDER=26SS_FTW_Sell-in
FLASK_SECRET_KEY=change-this-to-random-secret
```

#### Frontend (.env)
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

### Phase 2 Files Created/Modified

#### Backend (Python)
- `backend/src/auth.py` — Supabase JWT authentication module
- `backend/src/drive_service.py` — Google Drive API wrapper
- `backend/src/api.py` — Updated with auth and drive endpoints
- `backend/requirements.txt` — Added Supabase and Google API dependencies
- `backend/.env.example` — Environment variable template (Supabase config)

#### Frontend (React)
- `frontend/src/config/supabase.js` — Supabase client configuration
- `frontend/src/components/AuthStatus.jsx` — Supabase login/logout component
- `frontend/src/components/AuthStatus.css` — AuthStatus styling
- `frontend/src/components/DirectoryCreator.jsx` — Updated with Drive mode
- `frontend/src/components/DirectoryCreator.css` — Updated styling
- `frontend/src/components/DirectoryViewer.jsx` — Updated to use DirectoryCreator
- `frontend/src/config/api.js` — Added new API endpoints
- `frontend/src/App.jsx` — Added AuthStatus and session management
- `frontend/package.json` — Added @supabase/supabase-js dependency
- `frontend/.env.example` — Frontend environment template

---

### Phase 2 Setup Instructions

#### Supabase Setup

1. **Enable Google Provider in Supabase**
   - Go to your Supabase project dashboard
   - Navigate to Authentication > Providers
   - Enable Google provider
   - Add your Google OAuth credentials (Client ID & Secret)

2. **Configure Google Cloud for Supabase**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create OAuth 2.0 credentials (Web application)
   - Add authorized redirect URI: `https://your-project.supabase.co/auth/v1/callback`
   - Enable Google Drive API in your Google Cloud project
   - Add scopes: `drive.file`, `drive.metadata.readonly`

3. **Get Supabase Credentials**
   - Go to Supabase Project Settings > API
   - Copy: Project URL, anon/public key, JWT Secret

4. **Set Environment Variables**

   Backend (`backend/.env`):
   ```bash
   cp backend/.env.example backend/.env
   # Fill in Supabase credentials and Drive folder ID
   ```

   Frontend (`frontend/.env`):
   ```bash
   cp frontend/.env.example frontend/.env
   # Fill in Supabase URL and anon key
   ```

5. **Install Dependencies**
   ```bash
   # Backend
   cd backend && pip install -r requirements.txt

   # Frontend
   cd frontend && npm install
   ```

6. **Run the Application**
   ```bash
   # Backend
   cd backend && python src/api.py

   # Frontend
   cd frontend && npm run dev
   ```

#### Important Notes
- The Google provider token from Supabase is used for Drive API access
- Tokens are passed via `Authorization` header (Supabase JWT) and `X-Google-Token` header (Google access token)
- Provider tokens may expire; users may need to re-login for Drive access

---

## Phase 3 — File Upload & Overwrite Rules (Later)
Add:
- Upload file into resolved folder
- File existence checks:
  - If file exists and has **no QC comments** → block overwrite
  - If file exists and has **QC comments** → allow overwrite with confirmation (future phases)
- Store minimal metadata

---

## Phase 4 — QC & Approvals (Later)
Add:
- QC checklist table
- Comments / To-do list
- 3-user approvals required
- Re-upload resets approvals and clears To-do for that file

---

## Phase 5 — Notifications & Scale (Later)
Add:
- Slack/email notifications
- Audit logs
- Bulk upload
- Analytics dashboards

---

## Design Reminder
**If Phase 1 is correct, every later phase becomes safe.**
Filename resolution is the foundation.
