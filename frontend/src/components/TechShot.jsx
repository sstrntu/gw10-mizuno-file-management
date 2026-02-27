import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { API_ENDPOINTS } from '../config/api'

// ─── Helper: resize image to max dimension before upload ─────────────────────

function resizeImageFile(file, maxDim) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    }
    img.src = URL.createObjectURL(file)
  })
}

// ─── Upload Zone ─────────────────────────────────────────────────────────────

function UploadZone({ label, previewUrl, onFile, accept = 'image/*', persistent = false }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback(e => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }, [onFile])

  return (
    <div
      className={`ts-upload-zone ${previewUrl ? 'ts-upload-zone--loaded' : ''} ${dragging ? 'ts-upload-zone--drag' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files[0]; if (f) onFile(f); e.target.value = '' }}
      />
      {previewUrl ? (
        <div className="ts-upload-preview">
          <img src={previewUrl} alt={label} />
          <div className="ts-upload-overlay">
            <span>{persistent ? 'Replace' : 'Change'}</span>
          </div>
          <div className="ts-upload-label">{label}</div>
        </div>
      ) : (
        <div className="ts-upload-empty">
          <div className="ts-upload-icon">+</div>
          <div className="ts-upload-label">{label}</div>
        </div>
      )}
    </div>
  )
}

// ─── Step indicator ──────────────────────────────────────────────────────────

function StepIndicator({ current, total }) {
  return (
    <div className="ts-steps">
      {Array.from({ length: total }, (_, i) => i + 1).map(n => (
        <div key={n} className={`ts-step ${n === current ? 'ts-step--active' : n < current ? 'ts-step--done' : ''}`}>
          {n < current ? '✓' : n}
        </div>
      ))}
    </div>
  )
}

// ─── Checkered background (transparency indicator) ───────────────────────────

const CHECKER_CSS = {
  backgroundImage:
    'linear-gradient(45deg, #2a2a2a 25%, transparent 25%),' +
    'linear-gradient(-45deg, #2a2a2a 25%, transparent 25%),' +
    'linear-gradient(45deg, transparent 75%, #2a2a2a 75%),' +
    'linear-gradient(-45deg, transparent 75%, #2a2a2a 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TechShot({ session }) {
  // ── Naming config (from backend) ───────────────────────────────────────────
  const [namingConfig, setNamingConfig] = useState(null)
  const [selectedPack, setSelectedPack] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [techShotNum, setTechShotNum] = useState(1)

  useEffect(() => {
    fetch(API_ENDPOINTS.TECHSHOT_NAMING_CONFIG, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(r => r.json())
      .then(data => {
        setNamingConfig(data)
        if (data.packs?.length) setSelectedPack(data.packs[0].id)
      })
      .catch(() => {})
  }, [session.access_token])

  // Auto-reset model when pack changes
  useEffect(() => {
    setSelectedModel('')
  }, [selectedPack])

  // Models available for the selected pack
  const availableModels = useMemo(() => {
    if (!namingConfig || !selectedPack) return []
    const codes = namingConfig.pack_models?.[selectedPack] ?? []
    return codes
      .map(code => namingConfig.models.find(m => m.code === code))
      .filter(Boolean)
  }, [namingConfig, selectedPack])

  // Auto-select first model when available models change
  useEffect(() => {
    if (availableModels.length && !selectedModel) {
      setSelectedModel(availableModels[0].code)
    }
  }, [availableModels])

  // Generated filename
  const generatedFilename = useMemo(() => {
    if (!namingConfig || !selectedPack || !selectedModel) return null
    const pack = namingConfig.packs.find(p => p.id === selectedPack)
    const packCode = pack?.code ?? '00'
    const shotCode = `T${String(techShotNum).padStart(2, '0')}`
    return `${namingConfig.season}_${packCode}_${shotCode}_${selectedModel}.png`
  }, [namingConfig, selectedPack, selectedModel, techShotNum])

  // Persistent state (BG + mask stay across captures)
  const [bgFile, setBgFile] = useState(null)
  const [bgUrl, setBgUrl] = useState(null)
  const [maskFile, setMaskFile] = useState(null)
  const [maskUrl, setMaskUrl] = useState(null)

  // Per-capture state
  const [captureFile, setCaptureFile] = useState(null)
  const [captureUrl, setCaptureUrl] = useState(null)
  const [segmentedUrl, setSegmentedUrl] = useState(null)
  const [segmentedBlob, setSegmentedBlob] = useState(null)
  const [compositeUrl, setCompositeUrl] = useState(null)
  const [clickPoint, setClickPoint] = useState(null)

  // Loading / error
  const [segmenting, setSegmenting] = useState(false)
  const [compositing, setCompositing] = useState(false)
  const [error, setError] = useState(null)

  const captureCanvasRef = useRef(null)

  // ── File handlers ──────────────────────────────────────────────────────────

  function handleBgFile(file) {
    setBgFile(file)
    setBgUrl(URL.createObjectURL(file))
  }

  function handleMaskFile(file) {
    setMaskFile(file)
    setMaskUrl(URL.createObjectURL(file))
  }

  function handleCaptureFile(file) {
    setCaptureFile(file)
    setCaptureUrl(URL.createObjectURL(file))
    setSegmentedUrl(null)
    setSegmentedBlob(null)
    setCompositeUrl(null)
    setClickPoint(null)
    setError(null)
  }

  // ── Derive current step ────────────────────────────────────────────────────

  function getStep() {
    if (!bgUrl || !maskUrl || !captureUrl) return 1
    if (!segmentedUrl) return 2
    if (!compositeUrl) return 3
    return 4
  }

  const step = getStep()

  // ── Canvas click → segment ─────────────────────────────────────────────────

  async function handleCanvasClick(e) {
    if (segmenting) return
    const canvas = captureCanvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top
    const displayW = rect.width
    const displayH = rect.height

    setClickPoint({ x: clickX, y: clickY })
    setSegmenting(true)
    setError(null)

    try {
      // Resize to max 2000px before uploading — reduces 40MB RAW to ~1-2MB
      const resizedBlob = await resizeImageFile(captureFile, 2000)

      const fd = new FormData()
      fd.append('file', resizedBlob, 'capture.jpg')
      fd.append('click_x', clickX)
      fd.append('click_y', clickY)
      fd.append('img_width', displayW)
      fd.append('img_height', displayH)

      const res = await fetch(API_ENDPOINTS.TECHSHOT_SEGMENT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || `Server error ${res.status}`)
      }

      const blob = await res.blob()
      setSegmentedBlob(blob)
      setSegmentedUrl(URL.createObjectURL(blob))
    } catch (err) {
      setError(err.message)
    } finally {
      setSegmenting(false)
    }
  }

  // ── Generate composite ─────────────────────────────────────────────────────

  async function handleComposite() {
    if (compositing) return
    setCompositing(true)
    setError(null)

    try {
      const fd = new FormData()
      fd.append('bg', bgFile)
      fd.append('mask', maskFile)
      fd.append('segmented', segmentedBlob, 'segmented.png')

      const res = await fetch(API_ENDPOINTS.TECHSHOT_COMPOSITE, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || `Server error ${res.status}`)
      }

      const blob = await res.blob()
      setCompositeUrl(URL.createObjectURL(blob))
    } catch (err) {
      setError(err.message)
    } finally {
      setCompositing(false)
    }
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  async function handleExport() {
    if (!segmentedBlob || !bgFile || !maskFile) return
    try {
      const fd = new FormData()
      fd.append('bg', bgFile)
      fd.append('mask', maskFile)
      fd.append('segmented', segmentedBlob, 'segmented.png')
      fd.append('draw_bbox', '0')

      const res = await fetch(API_ENDPOINTS.TECHSHOT_COMPOSITE, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      })
      if (!res.ok) throw new Error(`Export failed (${res.status})`)

      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = generatedFilename || 'techshot_result.png'
      a.click()
    } catch (err) {
      setError(err.message)
    }
  }

  // ── New capture (reset per-capture state, keep BG + mask) ─────────────────

  function handleNewCapture() {
    setCaptureFile(null)
    setCaptureUrl(null)
    setSegmentedUrl(null)
    setSegmentedBlob(null)
    setCompositeUrl(null)
    setClickPoint(null)
    setError(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const stepLabels = ['Upload', 'Select Object', 'Review Cutout', 'Result']

  return (
    <div className="tech-shot">
      {/* ── Left Sidebar ── */}
      <aside className="ts-sidebar">
        <div className="ts-sidebar-header">
          <h2 className="ts-title">Tech Shot</h2>
          <p className="ts-subtitle">Composite product shots</p>
        </div>

        {/* ── File Naming ── */}
        <div className="ts-sidebar-section ts-naming-section">
          <div className="ts-section-label">File Naming</div>

          <div className="ts-naming-row">
            <label className="ts-naming-label">Pack</label>
            <select
              className="ts-naming-select"
              value={selectedPack}
              onChange={e => setSelectedPack(e.target.value)}
              disabled={!namingConfig}
            >
              {(namingConfig?.packs ?? []).map(p => (
                <option key={p.id} value={p.id}>{p.folder}</option>
              ))}
            </select>
          </div>

          <div className="ts-naming-row">
            <label className="ts-naming-label">Category</label>
            <div className="ts-naming-fixed">Tech Shots</div>
          </div>

          <div className="ts-naming-row">
            <label className="ts-naming-label">Model</label>
            <select
              className="ts-naming-select"
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              disabled={!availableModels.length}
            >
              {availableModels.length === 0 && (
                <option value="">— no models —</option>
              )}
              {availableModels.map(m => (
                <option key={m.code} value={m.code}>{m.folder}</option>
              ))}
            </select>
          </div>

          <div className="ts-naming-row">
            <label className="ts-naming-label">Shot #</label>
            <select
              className="ts-naming-select ts-naming-select--short"
              value={techShotNum}
              onChange={e => setTechShotNum(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map(n => (
                <option key={n} value={n}>T{String(n).padStart(2, '0')}</option>
              ))}
            </select>
          </div>

          {generatedFilename && (
            <div className="ts-naming-output">
              <span className="ts-naming-output-label">Export filename</span>
              <span className="ts-naming-output-value">{generatedFilename}</span>
            </div>
          )}
        </div>

        <div className="ts-sidebar-section">
          <div className="ts-section-label">Persistent Setup</div>
          <UploadZone label="BG Image" previewUrl={bgUrl} onFile={handleBgFile} persistent />
          <UploadZone label="Mask" previewUrl={maskUrl} onFile={handleMaskFile} persistent />
        </div>

        <div className="ts-sidebar-section">
          <div className="ts-section-label">Per Capture</div>
          <UploadZone label="Capture Photo" previewUrl={captureUrl} onFile={handleCaptureFile} />
        </div>

        <StepIndicator current={step} total={4} />
        <div className="ts-step-label">{stepLabels[step - 1]}</div>
      </aside>

      {/* ── Main Work Area ── */}
      <main className="ts-main">
        {error && (
          <div className="ts-error">
            <span className="ts-error-icon">!</span>
            {error}
          </div>
        )}

        {/* Step 1: prompt */}
        {step === 1 && (
          <div className="ts-placeholder">
            <div className="ts-placeholder-icon">◈</div>
            <p>Upload BG image, mask, and a capture photo to begin.</p>
            <ul className="ts-checklist">
              <li className={bgUrl ? 'done' : ''}>BG Image {bgUrl ? '✓' : ''}</li>
              <li className={maskUrl ? 'done' : ''}>Mask {maskUrl ? '✓' : ''}</li>
              <li className={captureUrl ? 'done' : ''}>Capture Photo {captureUrl ? '✓' : ''}</li>
            </ul>
          </div>
        )}

        {/* Step 2: click to segment */}
        {step === 2 && (
          <div className="ts-canvas-area">
            <div className="ts-canvas-instruction">
              {segmenting
                ? 'Segmenting… please wait'
                : 'Click on the object you want to cut out'}
            </div>
            <div className="ts-canvas-wrap" style={{ position: 'relative' }}>
              <img
                ref={captureCanvasRef}
                src={captureUrl}
                alt="Capture"
                className={`ts-capture-img ${segmenting ? '' : 'ts-capture-img--clickable'}`}
                onClick={handleCanvasClick}
                draggable={false}
              />
              {clickPoint && segmenting && (
                <div
                  className="ts-click-marker"
                  style={{ left: clickPoint.x, top: clickPoint.y }}
                />
              )}
              {segmenting && <div className="ts-canvas-overlay"><div className="ts-spinner" /></div>}
            </div>
          </div>
        )}

        {/* Step 3: segmented preview + composite button */}
        {step === 3 && (
          <div className="ts-review-area">
            <div className="ts-review-header">
              <span className="ts-review-title">Cutout Preview</span>
              <div className="ts-review-actions">
                <button className="ts-btn ts-btn--secondary" onClick={() => {
                  setSegmentedUrl(null); setSegmentedBlob(null); setClickPoint(null)
                }}>
                  Re-select
                </button>
                <button
                  className="ts-btn ts-btn--primary"
                  onClick={handleComposite}
                  disabled={compositing}
                >
                  {compositing ? 'Compositing…' : 'Generate Composite'}
                </button>
              </div>
            </div>
            <div className="ts-segmented-preview" style={CHECKER_CSS}>
              <img src={segmentedUrl} alt="Segmented" />
            </div>
          </div>
        )}

        {/* Step 4: final composite */}
        {step === 4 && (
          <div className="ts-result-area">
            <div className="ts-result-header">
              <span className="ts-result-title">Final Composite</span>
              <div className="ts-result-actions">
                <button className="ts-btn ts-btn--secondary" onClick={handleNewCapture}>
                  New Capture →
                </button>
                <button className="ts-btn ts-btn--primary" onClick={handleExport}>
                  Export PNG
                </button>
              </div>
            </div>
            <div className="ts-export-filename">
              <span className="ts-export-filename-label">Output filename</span>
              <span className="ts-export-filename-value">
                {generatedFilename || <span className="ts-export-filename-warn">Set pack / model in the left panel to name this file</span>}
              </span>
            </div>
            <div className="ts-composite-preview">
              <img src={compositeUrl} alt="Composite result" />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
