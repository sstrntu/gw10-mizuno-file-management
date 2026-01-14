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

## Phase 1 (MVP) — Filename Checks & Directory Printout (READ-ONLY)

### Objective
Resolve a filename into a **numbered, human-readable Google Drive path** and print it.

No external APIs. No Google Drive writes.

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

## Phase 2 — Google Drive Directory Creation (Later)
Add:
- Google OAuth
- Drive folder existence check
- Create missing folders only (never rename/delete)
- Dry-run toggle (preview vs create)

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
