import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { API_ENDPOINTS } from '../config/api'

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
  const [inputMode, setInputMode] = useState('diecut') // 'segment' | 'diecut'
  const [captureFile, setCaptureFile] = useState(null)
  const [captureUrl, setCaptureUrl] = useState(null)
  const [capturePreviewing, setCapturePreviewing] = useState(false)
  const [diecutFile, setDiecutFile] = useState(null)
  const [diecutUrl, setDiecutUrl] = useState(null)
  const [segmentedUrl, setSegmentedUrl] = useState(null)
  const [segmentedBlob, setSegmentedBlob] = useState(null)
  const [compositeUrl, setCompositeUrl] = useState(null)
  const [brushSize, setBrushSize] = useState(34)
  const [brushMode, setBrushMode] = useState('paint')
  const [segmentModel, setSegmentModel] = useState('auto')
  const [brushPointCount, setBrushPointCount] = useState(0)
  const [isBrushing, setIsBrushing] = useState(false)

  // Step 4 adjustment tools
  const [adjustTool, setAdjustTool] = useState(null) // null | 'exposure' | 'saturation' | 'transform'
  const [exposureValue, setExposureValue] = useState(0)
  const [saturationValue, setSaturationValue] = useState(0)
  const [diecutScale, setDiecutScale] = useState(1.0)
  const [diecutRotation, setDiecutRotation] = useState(0)

  // Loading / error
  const [segmenting, setSegmenting] = useState(false)
  const [compositing, setCompositing] = useState(false)
  const [error, setError] = useState(null)

  const captureImageRef = useRef(null)
  const brushCanvasRef = useRef(null)
  const brushPointsRef = useRef([])
  const brushPointCountRef = useRef(0)
  const lastBrushPointRef = useRef(null)
  const MAX_BRUSH_POINTS = 300

  // Step 4 canvas refs
  const compositeCanvasRef = useRef(null)
  const bgBitmapRef = useRef(null)
  const diecutBitmapRef = useRef(null)
  const maskBboxRef = useRef(null)
  const baseImageDataRef = useRef(null)
  const diecutMaskRef = useRef(null) // Uint8Array: diecut coverage per pixel (0-255)

  const getBrushPointCount = useCallback(() => {
    return brushPointsRef.current.reduce((total, point) => total + (point ? 1 : 0), 0)
  }, [])

  const redrawBrushOverlay = useCallback(() => {
    const canvas = brushCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const radius = Math.max(8, brushSize / 2)
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.45)'
    ctx.fillStyle = 'rgba(0, 255, 255, 0.18)'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = radius * 2

    let prev = null
    for (const point of brushPointsRef.current) {
      if (!point) {
        prev = null
        continue
      }

      const x = point.x_ratio * canvas.width
      const y = point.y_ratio * canvas.height

      if (prev) {
        ctx.beginPath()
        ctx.moveTo(prev.x, prev.y)
        ctx.lineTo(x, y)
        ctx.stroke()
      }

      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
      prev = { x, y }
    }
  }, [brushSize])

  const syncBrushCanvasSize = useCallback(() => {
    const imageEl = captureImageRef.current
    const canvas = brushCanvasRef.current
    if (!imageEl || !canvas) return

    const width = Math.max(1, Math.round(imageEl.clientWidth))
    const height = Math.max(1, Math.round(imageEl.clientHeight))
    if (!width || !height) return

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }

    redrawBrushOverlay()
  }, [redrawBrushOverlay])

  const clearBrushSelection = useCallback(() => {
    brushPointsRef.current = []
    brushPointCountRef.current = 0
    lastBrushPointRef.current = null
    setBrushPointCount(0)
    setIsBrushing(false)

    const canvas = brushCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  useEffect(() => {
    if (!captureUrl) return
    const handleResize = () => syncBrushCanvasSize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [captureUrl, syncBrushCanvasSize])

  useEffect(() => {
    syncBrushCanvasSize()
  }, [captureUrl, brushSize, brushPointCount, syncBrushCanvasSize])

  useEffect(() => {
    setIsBrushing(false)
    lastBrushPointRef.current = null
  }, [brushMode])

  // ── File handlers ──────────────────────────────────────────────────────────

  function handleBgFile(file) {
    setBgFile(file)
    setBgUrl(URL.createObjectURL(file))
  }

  function handleMaskFile(file) {
    setMaskFile(file)
    setMaskUrl(URL.createObjectURL(file))

    // Auto-set Tech Shot number from mask filename (e.g. "T04" → 4)
    const match = file.name.match(/T(\d{2})/i)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num >= 1 && num <= 5) setTechShotNum(num)
    }
  }

  async function handleMaskSelect(shotNum) {
    const name = `T${String(shotNum).padStart(2, '0')}`
    const url = `/masks/${name}.jpg`
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Could not load ${name}`)
      const blob = await res.blob()
      const file = new File([blob], `${name}.jpg`, { type: blob.type })
      handleMaskFile(file)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleCaptureFile(file) {
    setCaptureFile(file)
    setCapturePreviewing(false)
    setCaptureUrl(null)
    setSegmentedUrl(null)
    setSegmentedBlob(null)
    setCompositeUrl(null)
    clearBrushSelection()
    setError(null)

    const isArw = /\.arw$/i.test(file.name || '')
    if (!isArw) {
      setCaptureUrl(URL.createObjectURL(file))
      return
    }

    setCapturePreviewing(true)
    try {
      const fd = new FormData()
      fd.append('file', file, file.name || 'capture.arw')
      fd.append('max_dim', '2400')
      fd.append('quality', '92')

      const res = await fetch(API_ENDPOINTS.TECHSHOT_PREVIEW, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || `ARW preview failed (${res.status})`)
      }

      const blob = await res.blob()
      setCaptureUrl(URL.createObjectURL(blob))
    } catch (err) {
      setError(err.message)
    } finally {
      setCapturePreviewing(false)
    }
  }

  function handleDiecutFile(file) {
    setDiecutFile(file)
    const objectUrl = URL.createObjectURL(file)
    setDiecutUrl(objectUrl)
    setSegmentedUrl(objectUrl)
    setSegmentedBlob(file)
    setCompositeUrl(null)
    setCaptureFile(null)
    setCaptureUrl(null)
    setCapturePreviewing(false)
    clearBrushSelection()
    setError(null)
  }

  function handleInputModeChange(mode) {
    if (mode === inputMode) return
    setInputMode(mode)
    setCaptureFile(null)
    setCaptureUrl(null)
    setCapturePreviewing(false)
    setDiecutFile(null)
    setDiecutUrl(null)
    setSegmentedUrl(null)
    setSegmentedBlob(null)
    setCompositeUrl(null)
    clearBrushSelection()
    setError(null)
  }

  // ── Derive current step ────────────────────────────────────────────────────

  function getStep() {
    if (!bgUrl || !maskUrl) return 1
    if (inputMode === 'segment' && !captureUrl) return 1
    if (inputMode === 'diecut' && !segmentedUrl) return 1
    if (inputMode === 'segment' && !segmentedUrl) return 2
    if (!compositeUrl) return 3
    return 4
  }

  const step = getStep()

  function getBrushPointFromEvent(event) {
    const canvas = brushCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return null

    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null

    return { x, y, width: rect.width, height: rect.height }
  }

  function normalizeBrushPath(points) {
    const normalized = []
    let lastWasSeparator = true

    for (const point of points) {
      if (!point) {
        if (!lastWasSeparator && normalized.length > 0) {
          normalized.push(null)
        }
        lastWasSeparator = true
        continue
      }

      normalized.push(point)
      lastWasSeparator = false
    }

    while (normalized.length > 0 && normalized[normalized.length - 1] === null) {
      normalized.pop()
    }

    return normalized
  }

  const appendBrushPoint = useCallback((point, force = false) => {
    const minDistance = Math.max(2, brushSize * 0.25)
    const lastPoint = lastBrushPointRef.current
    if (!force && lastPoint) {
      const dx = point.x - lastPoint.x
      const dy = point.y - lastPoint.y
      if (Math.hypot(dx, dy) < minDistance) return
    }

    const xRatio = Math.max(0, Math.min(1, point.x / point.width))
    const yRatio = Math.max(0, Math.min(1, point.y / point.height))

    brushPointsRef.current.push({ x_ratio: xRatio, y_ratio: yRatio })
    brushPointCountRef.current += 1
    lastBrushPointRef.current = { x: point.x, y: point.y }

    if (brushPointCountRef.current === 1 || brushPointCountRef.current % 4 === 0) {
      setBrushPointCount(brushPointCountRef.current)
    }

    redrawBrushOverlay()
  }, [brushSize, redrawBrushOverlay])

  const eraseBrushPoint = useCallback((point, force = false) => {
    const minDistance = Math.max(2, brushSize * 0.25)
    const lastPoint = lastBrushPointRef.current
    if (!force && lastPoint) {
      const dx = point.x - lastPoint.x
      const dy = point.y - lastPoint.y
      if (Math.hypot(dx, dy) < minDistance) return
    }

    const eraseRadius = Math.max(8, brushSize / 2)
    const nextPoints = []

    for (const entry of brushPointsRef.current) {
      if (!entry) {
        nextPoints.push(null)
        continue
      }

      const px = entry.x_ratio * point.width
      const py = entry.y_ratio * point.height
      const shouldErase = Math.hypot(px - point.x, py - point.y) <= eraseRadius
      if (!shouldErase) {
        nextPoints.push(entry)
      }
    }

    brushPointsRef.current = normalizeBrushPath(nextPoints)
    brushPointCountRef.current = getBrushPointCount()
    setBrushPointCount(brushPointCountRef.current)
    lastBrushPointRef.current = { x: point.x, y: point.y }
    redrawBrushOverlay()
  }, [brushSize, getBrushPointCount, redrawBrushOverlay])

  const handleBrushPointerDown = useCallback((event) => {
    if (segmenting) return

    const point = getBrushPointFromEvent(event)
    if (!point) return

    event.preventDefault()
    lastBrushPointRef.current = null

    if (brushMode === 'paint') {
      if (brushPointsRef.current.length > 0 && brushPointsRef.current[brushPointsRef.current.length - 1] !== null) {
        brushPointsRef.current.push(null)
      }
      appendBrushPoint(point, true)
    } else {
      eraseBrushPoint(point, true)
    }

    setIsBrushing(true)

    if (event.currentTarget?.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }, [appendBrushPoint, brushMode, eraseBrushPoint, segmenting])

  const handleBrushPointerMove = useCallback((event) => {
    if (!isBrushing || segmenting) return

    const point = getBrushPointFromEvent(event)
    if (!point) return

    event.preventDefault()
    if (brushMode === 'paint') {
      appendBrushPoint(point)
    } else {
      eraseBrushPoint(point)
    }
  }, [appendBrushPoint, brushMode, eraseBrushPoint, isBrushing, segmenting])

  const handleBrushPointerUp = useCallback((event) => {
    if (!isBrushing) return
    event.preventDefault()
    setIsBrushing(false)
    lastBrushPointRef.current = null
    brushPointCountRef.current = getBrushPointCount()
    setBrushPointCount(brushPointCountRef.current)

    if (event.currentTarget?.releasePointerCapture) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch (_) {
        // Ignore pointer capture release errors.
      }
    }
  }, [getBrushPointCount, isBrushing])

  function getSampledBrushPoints(points) {
    if (points.length <= MAX_BRUSH_POINTS) return points
    const step = points.length / MAX_BRUSH_POINTS
    const sampled = []
    for (let i = 0; i < MAX_BRUSH_POINTS; i += 1) {
      sampled.push(points[Math.floor(i * step)])
    }
    return sampled
  }

  async function handleSegmentSelection() {
    if (inputMode !== 'segment') return
    if (segmenting) return

    const rawPoints = brushPointsRef.current.filter(Boolean)
    if (!rawPoints.length) {
      setError('Airbrush over the object area before generating a cutout.')
      return
    }

    const brushPoints = getSampledBrushPoints(rawPoints)
    const imageEl = captureImageRef.current
    const displayW = imageEl?.clientWidth || 1
    const displayH = imageEl?.clientHeight || 1
    const anchorPoint = brushPoints[Math.floor(brushPoints.length / 2)] || brushPoints[0]

    const paintedMaskData = brushCanvasRef.current?.toDataURL('image/png')
    if (!paintedMaskData) {
      setError('Unable to read painted mask from canvas.')
      return
    }

    setSegmenting(true)
    setError(null)

    try {
      if (!captureFile) {
        throw new Error('Please upload a capture image first.')
      }

      const fd = new FormData()
      fd.append('file', captureFile, captureFile.name || 'capture')
      fd.append('painted_mask', paintedMaskData)
      fd.append('model', segmentModel)
      fd.append('click_x', anchorPoint.x_ratio * displayW)
      fd.append('click_y', anchorPoint.y_ratio * displayH)
      fd.append('img_width', displayW)
      fd.append('img_height', displayH)
      fd.append('brush_size', String(brushSize))
      fd.append('brush_points', JSON.stringify(brushPoints))

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
      setBrushPointCount(brushPointCountRef.current)
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
      fd.append('draw_bbox', '0')

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
      // Load all source images fresh from original files at native resolution
      // (avoids ImageBitmap size limits and display canvas downscaling)
      const loadImg = (src) => new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = typeof src === 'string' ? src : URL.createObjectURL(src)
      })

      const [bgImg, diecutImg, maskImg] = await Promise.all([
        loadImg(bgFile),
        loadImg(segmentedBlob),
        loadImg(maskFile),
      ])

      const W = bgImg.naturalWidth
      const H = bgImg.naturalHeight

      // Compute mask bbox at full BG resolution
      const maskOc = new OffscreenCanvas(maskImg.naturalWidth, maskImg.naturalHeight)
      const maskCtx = maskOc.getContext('2d')
      maskCtx.drawImage(maskImg, 0, 0)
      const mData = maskCtx.getImageData(0, 0, maskOc.width, maskOc.height).data
      let minX = maskOc.width, minY = maskOc.height, maxX = 0, maxY = 0
      for (let y = 0; y < maskOc.height; y++) {
        for (let x = 0; x < maskOc.width; x++) {
          if (mData[(y * maskOc.width + x) * 4] > 127) {
            if (x < minX) minX = x; if (y < minY) minY = y
            if (x > maxX) maxX = x; if (y > maxY) maxY = y
          }
        }
      }
      const bboxScX = W / maskOc.width
      const bboxScY = H / maskOc.height
      const fullBbox = {
        x: minX * bboxScX, y: minY * bboxScY,
        w: (maxX - minX + 1) * bboxScX, h: (maxY - minY + 1) * bboxScY,
      }

      // Crop diecut to alpha bbox
      const dcOc = new OffscreenCanvas(diecutImg.naturalWidth, diecutImg.naturalHeight)
      const dcCtx = dcOc.getContext('2d')
      dcCtx.drawImage(diecutImg, 0, 0)
      const dData = dcCtx.getImageData(0, 0, dcOc.width, dcOc.height).data
      let dMinX = dcOc.width, dMinY = dcOc.height, dMaxX = 0, dMaxY = 0
      let dFound = false
      for (let y = 0; y < dcOc.height; y++) {
        for (let x = 0; x < dcOc.width; x++) {
          if (dData[(y * dcOc.width + x) * 4 + 3] > 0) {
            if (x < dMinX) dMinX = x; if (y < dMinY) dMinY = y
            if (x > dMaxX) dMaxX = x; if (y > dMaxY) dMaxY = y
            dFound = true
          }
        }
      }
      const cropW = dFound ? dMaxX - dMinX + 1 : dcOc.width
      const cropH = dFound ? dMaxY - dMinY + 1 : dcOc.height
      const cropX = dFound ? dMinX : 0
      const cropY = dFound ? dMinY : 0

      // Calculate output resolution that preserves diecut native quality.
      // If the diecut would be downscaled at BG resolution, scale the entire
      // output up so the diecut is rendered at ~1:1 pixel mapping.
      const fitScAtBg = Math.min(fullBbox.w / cropW, fullBbox.h / cropH) * diecutScale
      const upscale = fitScAtBg < 1 ? Math.min(1 / fitScAtBg, 4) : 1  // cap at 4x BG res
      const outW = Math.round(W * upscale)
      const outH = Math.round(H * upscale)

      console.log(`[TechShot Export] BG: ${W}x${H}, Diecut: ${cropW}x${cropH}, fitSc: ${fitScAtBg.toFixed(3)}, upscale: ${upscale.toFixed(2)}, output: ${outW}x${outH}`)

      // Render composite at output resolution
      const oc = new OffscreenCanvas(outW, outH)
      const ctx = oc.getContext('2d')
      ctx.drawImage(bgImg, 0, 0, outW, outH)

      // Grab clean BG data for adjustment mask
      const bgData = (exposureValue !== 0 || saturationValue !== 0)
        ? ctx.getImageData(0, 0, outW, outH).data : null

      // Draw diecut fitted inside mask bbox with current transform (at output scale)
      const outBbox = {
        x: fullBbox.x * upscale, y: fullBbox.y * upscale,
        w: fullBbox.w * upscale, h: fullBbox.h * upscale,
      }
      const fitSc = Math.min(outBbox.w / cropW, outBbox.h / cropH)
      const dw = cropW * fitSc * diecutScale
      const dh = cropH * fitSc * diecutScale
      const cx = outBbox.x + outBbox.w / 2
      const cy = outBbox.y + outBbox.h / 2

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(diecutRotation * Math.PI / 180)
      ctx.drawImage(diecutImg, cropX, cropY, cropW, cropH, -dw / 2, -dh / 2, dw, dh)
      ctx.restore()

      // Apply exposure + saturation adjustments at full res
      if (bgData) {
        const compData = ctx.getImageData(0, 0, outW, outH)
        const data = compData.data
        const numPx = outW * outH
        for (let i = 0; i < numPx; i++) {
          const p = i * 4
          const diff = Math.max(
            Math.abs(data[p] - bgData[p]),
            Math.abs(data[p + 1] - bgData[p + 1]),
            Math.abs(data[p + 2] - bgData[p + 2])
          )
          if (diff <= 4) continue
          const m = Math.min(255, diff * 4)
          const alpha = m / 255
          let r = data[p], g = data[p + 1], b = data[p + 2]
          if (exposureValue !== 0) {
            const strength = alpha * (exposureValue / 100)
            const ef = strength >= 0 ? 1 + strength : 1 / (1 - strength)
            r = Math.max(0, Math.min(255, r * ef))
            g = Math.max(0, Math.min(255, g * ef))
            b = Math.max(0, Math.min(255, b * ef))
          }
          if (saturationValue !== 0) {
            const strength = alpha * (saturationValue / 100)
            const sf = 1 + strength
            const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b
            r = Math.max(0, Math.min(255, gray + (r - gray) * sf))
            g = Math.max(0, Math.min(255, gray + (g - gray) * sf))
            b = Math.max(0, Math.min(255, gray + (b - gray) * sf))
          }
          data[p] = r; data[p + 1] = g; data[p + 2] = b
        }
        ctx.putImageData(compData, 0, 0)
      }

      const blob = await oc.convertToBlob({ type: 'image/png' })
      if (!blob) throw new Error('Canvas export failed')

      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = generatedFilename || 'techshot_result.png'
      a.click()
    } catch (err) {
      setError(err.message)
    }
  }

  // ── Step 4 canvas compositing ──────────────────────────────────────────────

  // Draw red bounding box overlay on canvas (UI only, never in export)
  function drawBboxOverlay() {
    const canvas = compositeCanvasRef.current
    const bbox = maskBboxRef.current
    if (!canvas || !bbox) return
    const ctx = canvas.getContext('2d')
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 0, 0, 1)'
    ctx.lineWidth = 3
    ctx.strokeRect(bbox.x, bbox.y, bbox.w, bbox.h)
    ctx.restore()
  }

  function renderBaseCanvas(scale, rotation) {
    const canvas = compositeCanvasRef.current
    const bg = bgBitmapRef.current
    const diecut = diecutBitmapRef.current
    const bbox = maskBboxRef.current
    if (!canvas || !bg || !diecut || !bbox) return

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height)

    // Grab clean BG pixels before drawing diecut (for mask rebuild)
    const bgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data

    // Match server compositing logic: fit diecut inside mask bbox, centered
    const fitSc = Math.min(bbox.w / diecut.width, bbox.h / diecut.height)
    const dw = diecut.width * fitSc * scale
    const dh = diecut.height * fitSc * scale
    const cx = bbox.x + bbox.w / 2
    const cy = bbox.y + bbox.h / 2

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(rotation * Math.PI / 180)
    ctx.drawImage(diecut, -dw / 2, -dh / 2, dw, dh)
    ctx.restore()

    // Save clean base (no bbox) for adjustments and export
    baseImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height)

    // Rebuild diecut mask to match new position (prevents ghost from old position)
    const compData = baseImageDataRef.current.data
    const numPx = canvas.width * canvas.height
    const dMask = new Uint8Array(numPx)
    for (let i = 0; i < numPx; i++) {
      const p = i * 4
      const diff = Math.max(
        Math.abs(compData[p] - bgData[p]),
        Math.abs(compData[p + 1] - bgData[p + 1]),
        Math.abs(compData[p + 2] - bgData[p + 2])
      )
      if (diff > 4) dMask[i] = Math.min(255, diff * 4)
    }
    diecutMaskRef.current = dMask

    // Draw bbox overlay for UI display
    drawBboxOverlay()
  }

  // Apply exposure + saturation to the diecut region (diecutMaskRef) on the base composite
  function renderAdjustedCanvas(expVal, satVal) {
    const canvas = compositeCanvasRef.current
    const base = baseImageDataRef.current
    const mask = diecutMaskRef.current
    if (!canvas || !base || !mask) return

    const ctx = canvas.getContext('2d')
    const result = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height)
    const data = result.data

    for (let i = 0; i < data.length; i += 4) {
      const m = mask[i >> 2]
      if (m === 0) continue

      const alpha = m / 255
      let r = data[i], g = data[i + 1], b = data[i + 2]

      if (expVal !== 0) {
        const strength = alpha * (expVal / 100)
        const ef = strength >= 0 ? 1 + strength : 1 / (1 - strength)
        r = Math.max(0, Math.min(255, r * ef))
        g = Math.max(0, Math.min(255, g * ef))
        b = Math.max(0, Math.min(255, b * ef))
      }

      if (satVal !== 0) {
        const strength = alpha * (satVal / 100)
        const sf = 1 + strength
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b
        r = Math.max(0, Math.min(255, gray + (r - gray) * sf))
        g = Math.max(0, Math.min(255, gray + (g - gray) * sf))
        b = Math.max(0, Math.min(255, gray + (b - gray) * sf))
      }

      data[i] = r; data[i + 1] = g; data[i + 2] = b
    }

    ctx.putImageData(result, 0, 0)

    // Draw bbox overlay for UI display
    drawBboxOverlay()
  }

  // Initialise canvas editor whenever composite is ready
  useEffect(() => {
    if (!compositeUrl || !bgFile || !maskFile || !segmentedBlob) return

    setAdjustTool(null)
    setExposureValue(0)
    setSaturationValue(0)
    setDiecutScale(1.0)
    setDiecutRotation(0)

    let cancelled = false

    async function init() {
      try {
        // Load server composite as the canvas base (correct placement guaranteed)
        // and source images in parallel (needed only for the Transform tool)
        const compositeBlob = await fetch(compositeUrl).then(r => r.blob())
        const [serverBm, bgBm, diecutBm, maskBm] = await Promise.all([
          createImageBitmap(compositeBlob),
          createImageBitmap(bgFile),
          createImageBitmap(segmentedBlob),
          createImageBitmap(maskFile),
        ])
        if (cancelled) return

        bgBitmapRef.current = bgBm

        const canvas = compositeCanvasRef.current
        if (!canvas) return

        // Size canvas from server composite (= BG dimensions, so mask bbox math stays consistent)
        const MAX_DIM = 1400
        const sc = Math.min(1, MAX_DIM / Math.max(serverBm.width, serverBm.height))
        canvas.width = Math.round(serverBm.width * sc)
        canvas.height = Math.round(serverBm.height * sc)

        // Draw server composite directly — no client-side bbox guessing
        const ctx = canvas.getContext('2d')
        ctx.drawImage(serverBm, 0, 0, canvas.width, canvas.height)
        baseImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height)

        // Compute mask bbox at canvas resolution (used by Transform tool only)
        const oc = new OffscreenCanvas(maskBm.width, maskBm.height)
        const octx = oc.getContext('2d')
        octx.drawImage(maskBm, 0, 0)
        const mData = octx.getImageData(0, 0, maskBm.width, maskBm.height).data
        let minX = maskBm.width, minY = maskBm.height, maxX = 0, maxY = 0
        let found = false
        for (let y = 0; y < maskBm.height; y++) {
          for (let x = 0; x < maskBm.width; x++) {
            if (mData[(y * maskBm.width + x) * 4] > 127) {
              if (x < minX) minX = x; if (y < minY) minY = y
              if (x > maxX) maxX = x; if (y > maxY) maxY = y
              found = true
            }
          }
        }
        if (found) {
          const sx = canvas.width / maskBm.width
          const sy = canvas.height / maskBm.height
          maskBboxRef.current = { x: minX * sx, y: minY * sy, w: (maxX - minX + 1) * sx, h: (maxY - minY + 1) * sy }
        }

        // Crop diecut to alpha bbox (used by Transform tool only)
        const doc = new OffscreenCanvas(diecutBm.width, diecutBm.height)
        const dctx = doc.getContext('2d')
        dctx.drawImage(diecutBm, 0, 0)
        const dData = dctx.getImageData(0, 0, diecutBm.width, diecutBm.height).data
        let dMinX = diecutBm.width, dMinY = diecutBm.height, dMaxX = 0, dMaxY = 0
        let dFound = false
        for (let y = 0; y < diecutBm.height; y++) {
          for (let x = 0; x < diecutBm.width; x++) {
            if (dData[(y * diecutBm.width + x) * 4 + 3] > 0) {
              if (x < dMinX) dMinX = x; if (y < dMinY) dMinY = y
              if (x > dMaxX) dMaxX = x; if (y > dMaxY) dMaxY = y
              dFound = true
            }
          }
        }
        diecutBitmapRef.current = dFound
          ? await createImageBitmap(diecutBm, dMinX, dMinY, dMaxX - dMinX + 1, dMaxY - dMinY + 1)
          : diecutBm

        // Build diecut mask by diffing server composite vs BG (detects exactly where server placed the diecut)
        const bgOc = new OffscreenCanvas(canvas.width, canvas.height)
        const bgCtx = bgOc.getContext('2d')
        bgCtx.drawImage(bgBm, 0, 0, canvas.width, canvas.height)
        const bgData = bgCtx.getImageData(0, 0, canvas.width, canvas.height).data
        const compData = baseImageDataRef.current.data
        const numPx = canvas.width * canvas.height
        const dMask = new Uint8Array(numPx)
        for (let i = 0; i < numPx; i++) {
          const p = i * 4
          const diff = Math.max(
            Math.abs(compData[p] - bgData[p]),
            Math.abs(compData[p + 1] - bgData[p + 1]),
            Math.abs(compData[p + 2] - bgData[p + 2])
          )
          if (diff > 4) dMask[i] = Math.min(255, diff * 4)
        }
        diecutMaskRef.current = dMask

        // Draw red bbox overlay on canvas for UI display
        drawBboxOverlay()
      } catch (err) {
        console.error('[TechShot] canvas init error:', err)
      }
    }

    init()
    return () => { cancelled = true }
  }, [compositeUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── New capture (reset per-capture state, keep BG + mask) ─────────────────

  function handleNewCapture() {
    setInputMode('diecut')
    setCaptureFile(null)
    setCaptureUrl(null)
    setCapturePreviewing(false)
    setDiecutFile(null)
    setDiecutUrl(null)
    setSegmentedUrl(null)
    setSegmentedBlob(null)
    setCompositeUrl(null)
    clearBrushSelection()
    setError(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const stepLabels = inputMode === 'segment'
    ? ['Upload', 'Select Object', 'Review Cutout', 'Result']
    : ['Upload', 'Upload Cutout', 'Review Cutout', 'Result']

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

          <div className="ts-mask-select">
            <div className="ts-section-label" style={{ marginBottom: 6 }}>Mask</div>
            <div className="ts-mask-select-row">
              {[1, 2, 3, 4, 5].map(n => {
                const name = `T${String(n).padStart(2, '0')}`
                const active = maskFile?.name?.startsWith(name)
                return (
                  <button
                    key={n}
                    className={`ts-mask-btn ${active ? 'ts-mask-btn--active' : ''}`}
                    onClick={() => handleMaskSelect(n)}
                  >
                    {name}
                  </button>
                )
              })}
            </div>
            {maskUrl && (
              <div className="ts-mask-preview">
                <img src={maskUrl} alt="Mask preview" />
              </div>
            )}
          </div>
        </div>

        <div className="ts-sidebar-section">
          <div className="ts-section-label">Per Capture</div>
          <div className="ts-brush-mode" style={{ marginBottom: 10 }}>
            <button
              className={`ts-brush-mode-btn ${inputMode === 'segment' ? 'active' : ''}`}
              onClick={() => handleInputModeChange('segment')}
            >
              Segment
            </button>
            <button
              className={`ts-brush-mode-btn ${inputMode === 'diecut' ? 'active' : ''}`}
              onClick={() => handleInputModeChange('diecut')}
            >
              Upload Diecut
            </button>
          </div>

          {inputMode === 'segment' ? (
            <>
              <UploadZone
                label="Capture Photo"
                previewUrl={captureUrl}
                onFile={handleCaptureFile}
                accept="image/*,.arw,.ARW"
              />
              {capturePreviewing && (
                <div className="ts-step-label">Preparing ARW preview…</div>
              )}
            </>
          ) : (
            <>
              <UploadZone
                label="Diecut Image"
                previewUrl={diecutUrl}
                onFile={handleDiecutFile}
                accept="image/png,image/webp,image/*"
              />
              <div className="ts-step-label">Upload pre-cut PNG/WebP with transparency</div>
            </>
          )}
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
            <p>
              {inputMode === 'segment'
                ? 'Upload BG image, mask, and a capture photo to begin.'
                : 'Upload BG image, mask, and a diecut image to begin.'}
            </p>
            <ul className="ts-checklist">
              <li className={bgUrl ? 'done' : ''}>BG Image {bgUrl ? '✓' : ''}</li>
              <li className={maskUrl ? 'done' : ''}>Mask {maskUrl ? '✓' : ''}</li>
              {inputMode === 'segment' ? (
                <li className={captureUrl ? 'done' : ''}>Capture Photo {captureUrl ? '✓' : ''}</li>
              ) : (
                <li className={segmentedUrl ? 'done' : ''}>Diecut Image {segmentedUrl ? '✓' : ''}</li>
              )}
            </ul>
          </div>
        )}

        {/* Step 2: airbrush to segment */}
        {step === 2 && inputMode === 'segment' && (
          <div className="ts-canvas-area">
            <div className="ts-canvas-instruction">
              {segmenting
                ? 'Segmenting… please wait'
                : 'Airbrush over the product area, then Generate Cutout. SAM will complete the object from your brush. If parts are missing, add more brush and regenerate.'}
            </div>

            <div className="ts-brush-toolbar">
              <div className="ts-brush-mode">
                <button
                  className={`ts-brush-mode-btn ${brushMode === 'paint' ? 'active' : ''}`}
                  onClick={() => setBrushMode('paint')}
                  disabled={segmenting}
                >
                  Paint
                </button>
                <button
                  className={`ts-brush-mode-btn ${brushMode === 'erase' ? 'active' : ''}`}
                  onClick={() => setBrushMode('erase')}
                  disabled={segmenting}
                >
                  Erase
                </button>
              </div>

              <label className="ts-brush-size">
                <span>Brush Size</span>
                <input
                  type="range"
                  min="18"
                  max="90"
                  step="2"
                  value={brushSize}
                  onChange={e => setBrushSize(Number(e.target.value))}
                  disabled={segmenting}
                />
                <strong>{brushSize}px</strong>
              </label>

              <label className="ts-brush-size">
                <span>Model</span>
                <select
                  className="ts-naming-select ts-naming-select--short"
                  value={segmentModel}
                  onChange={e => setSegmentModel(e.target.value)}
                  disabled={segmenting}
                >
                  <option value="auto">Auto (Best)</option>
                  <option value="hq">HQ-SAM</option>
                  <option value="sam">SAM (Fast)</option>
                </select>
              </label>

              <div className="ts-brush-count">
                Mode: {brushMode === 'paint' ? 'Paint' : 'Erase'} | Marks: {brushPointCount}
              </div>

              <div className="ts-brush-actions">
                <button
                  className="ts-btn ts-btn--secondary"
                  onClick={clearBrushSelection}
                  disabled={segmenting || brushPointCount === 0}
                >
                  Clear Brush
                </button>
                <button
                  className="ts-btn ts-btn--primary"
                  onClick={handleSegmentSelection}
                  disabled={segmenting || capturePreviewing || brushPointCount === 0}
                >
                  {segmenting ? 'Segmenting…' : 'Generate Cutout'}
                </button>
              </div>
            </div>

            <div className="ts-canvas-wrap ts-canvas-wrap--brush">
              <img
                ref={captureImageRef}
                src={captureUrl}
                alt="Capture"
                className={`ts-capture-img ${segmenting ? '' : 'ts-capture-img--brush'}`}
                onLoad={syncBrushCanvasSize}
                draggable={false}
              />
              <canvas
                ref={brushCanvasRef}
                className={`ts-brush-canvas ${segmenting ? 'ts-brush-canvas--disabled' : ''} ${brushMode === 'erase' ? 'ts-brush-canvas--erase' : 'ts-brush-canvas--paint'}`}
                onPointerDown={handleBrushPointerDown}
                onPointerMove={handleBrushPointerMove}
                onPointerUp={handleBrushPointerUp}
                onPointerCancel={handleBrushPointerUp}
              />
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
                {inputMode === 'segment' && (
                  <button className="ts-btn ts-btn--secondary" onClick={() => {
                    setSegmentedUrl(null); setSegmentedBlob(null); setError(null)
                  }}>
                    Add More Brush
                  </button>
                )}
                {inputMode === 'segment' && (
                  <button className="ts-btn ts-btn--secondary" onClick={() => {
                    setSegmentedUrl(null); setSegmentedBlob(null); setError(null); clearBrushSelection()
                  }}>
                    Clear + Repaint
                  </button>
                )}
                {inputMode === 'diecut' && (
                  <button className="ts-btn ts-btn--secondary" onClick={() => {
                    setDiecutFile(null); setDiecutUrl(null); setSegmentedUrl(null); setSegmentedBlob(null); setError(null)
                  }}>
                    Replace Diecut
                  </button>
                )}
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

        {/* Step 4: final composite + adjustment tools */}
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

            {/* Adjustment toolbar */}
            <div className="ts-adj-toolbar">
              <div className="ts-adj-tools">
                <button
                  className={`ts-adj-tool-btn ${adjustTool === 'exposure' ? 'active' : ''}`}
                  onClick={() => setAdjustTool(prev => prev === 'exposure' ? null : 'exposure')}
                  title="Adjust brightness of the diecut"
                >
                  ☀ Exposure
                </button>
                <button
                  className={`ts-adj-tool-btn ${adjustTool === 'saturation' ? 'active' : ''}`}
                  onClick={() => setAdjustTool(prev => prev === 'saturation' ? null : 'saturation')}
                  title="Adjust color saturation of the diecut"
                >
                  ◐ Saturation
                </button>
                <button
                  className={`ts-adj-tool-btn ${adjustTool === 'transform' ? 'active' : ''}`}
                  onClick={() => setAdjustTool(prev => prev === 'transform' ? null : 'transform')}
                  title="Rotate and scale the diecut"
                >
                  ⊞ Transform
                </button>
              </div>

              {adjustTool === 'exposure' && (
                <div className="ts-adj-options">
                  <label className="ts-adj-label">
                    <span>Exposure</span>
                    <input type="range" min="-100" max="100" value={exposureValue}
                      onChange={e => {
                        const v = +e.target.value
                        setExposureValue(v)
                        renderAdjustedCanvas(v, saturationValue)
                      }} />
                    <input type="number" className="ts-adj-number" min="-100" max="100"
                      value={exposureValue}
                      onChange={e => {
                        const v = Math.max(-100, Math.min(100, +e.target.value || 0))
                        setExposureValue(v)
                        renderAdjustedCanvas(v, saturationValue)
                      }} />
                  </label>
                  <button className="ts-btn ts-btn--secondary ts-btn--sm" onClick={() => { setExposureValue(0); renderAdjustedCanvas(0, saturationValue) }}>
                    Reset
                  </button>
                </div>
              )}

              {adjustTool === 'saturation' && (
                <div className="ts-adj-options">
                  <label className="ts-adj-label">
                    <span>Saturation</span>
                    <input type="range" min="-100" max="100" value={saturationValue}
                      onChange={e => {
                        const v = +e.target.value
                        setSaturationValue(v)
                        renderAdjustedCanvas(exposureValue, v)
                      }} />
                    <input type="number" className="ts-adj-number" min="-100" max="100"
                      value={saturationValue}
                      onChange={e => {
                        const v = Math.max(-100, Math.min(100, +e.target.value || 0))
                        setSaturationValue(v)
                        renderAdjustedCanvas(exposureValue, v)
                      }} />
                  </label>
                  <button className="ts-btn ts-btn--secondary ts-btn--sm" onClick={() => { setSaturationValue(0); renderAdjustedCanvas(exposureValue, 0) }}>
                    Reset
                  </button>
                </div>
              )}

              {adjustTool === 'transform' && (
                <div className="ts-adj-options">
                  <label className="ts-adj-label">
                    <span>Scale</span>
                    <input type="range" min="30" max="200" value={Math.round(diecutScale * 100)}
                      onChange={e => {
                        const s = e.target.value / 100
                        setDiecutScale(s)
                        renderBaseCanvas(s, diecutRotation)
                        renderAdjustedCanvas(exposureValue, saturationValue)
                      }} />
                    <input type="number" className="ts-adj-number" min="30" max="200"
                      value={Math.round(diecutScale * 100)}
                      onChange={e => {
                        const s = Math.max(30, Math.min(200, +e.target.value || 100)) / 100
                        setDiecutScale(s)
                        renderBaseCanvas(s, diecutRotation)
                        renderAdjustedCanvas(exposureValue, saturationValue)
                      }} />
                    <span className="ts-adj-unit">%</span>
                  </label>
                  <label className="ts-adj-label">
                    <span>Rotation</span>
                    <input type="range" min="-180" max="180" value={diecutRotation}
                      onChange={e => {
                        const r = +e.target.value
                        setDiecutRotation(r)
                        renderBaseCanvas(diecutScale, r)
                        renderAdjustedCanvas(exposureValue, saturationValue)
                      }} />
                    <input type="number" className="ts-adj-number" min="-180" max="180"
                      value={diecutRotation}
                      onChange={e => {
                        const r = Math.max(-180, Math.min(180, +e.target.value || 0))
                        setDiecutRotation(r)
                        renderBaseCanvas(diecutScale, r)
                        renderAdjustedCanvas(exposureValue, saturationValue)
                      }} />
                    <span className="ts-adj-unit">°</span>
                  </label>
                  <button className="ts-btn ts-btn--secondary ts-btn--sm" onClick={() => {
                    setDiecutScale(1.0)
                    setDiecutRotation(0)
                    renderBaseCanvas(1.0, 0)
                    renderAdjustedCanvas(exposureValue, saturationValue)
                  }}>
                    Reset
                  </button>
                </div>
              )}
            </div>

            {/* Canvas composite display */}
            <div className="ts-canvas-editor">
              <canvas ref={compositeCanvasRef} className="ts-composite-canvas" />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
