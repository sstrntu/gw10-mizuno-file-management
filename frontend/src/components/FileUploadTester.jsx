import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import './FileUploadTester.css'
import { API_ENDPOINTS } from '../config/api'

function FileUploadTester() {
    const { session } = useAuth()

    // Original validation mode state
    const [filename, setFilename] = useState('')
    const [result, setResult] = useState(null)
    const [batchResults, setBatchResults] = useState(null)
    const [loading, setLoading] = useState(false)
    const [debouncedFilename, setDebouncedFilename] = useState('')
    const [isBatchMode, setIsBatchMode] = useState(false)

    // Upload mode state
    const [selectedFiles, setSelectedFiles] = useState([])
    const [uploadQueue, setUploadQueue] = useState([])
    const [uploadingFiles, setUploadingFiles] = useState({}) // fileId -> progress %
    const [uploadedFiles, setUploadedFiles] = useState([])
    const [failedFiles, setFailedFiles] = useState([])
    const [isDragging, setIsDragging] = useState(false)
    const [uploadMode, setUploadMode] = useState(false)

    const fileInputRef = useRef(null)

    // Debounce filename input for validation mode
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedFilename(filename)
        }, 500)

        return () => clearTimeout(timer)
    }, [filename])

    // Auto-resolve when debounced filename changes (validation mode)
    useEffect(() => {
        if (!uploadMode && debouncedFilename.trim()) {
            const isBatch = debouncedFilename.includes(',')
            setIsBatchMode(isBatch)

            if (isBatch) {
                resolveBatch(debouncedFilename)
            } else {
                resolveFilename(debouncedFilename)
            }
        } else {
            setResult(null)
            setBatchResults(null)
            setIsBatchMode(false)
        }
    }, [debouncedFilename, uploadMode])

    // Auto-upload valid files
    useEffect(() => {
        if (!uploadMode) return

        const validFiles = uploadQueue.filter(f =>
            f.status === 'valid' && !uploadingFiles[f.id] && f.retryCount === 0
        )

        if (validFiles.length > 0) {
            // Limit concurrent uploads to 3
            const activeUploads = Object.keys(uploadingFiles).length
            const toUpload = validFiles.slice(0, Math.max(0, 3 - activeUploads))

            toUpload.forEach(fileObj => {
                uploadFile(fileObj)
            })
        }
    }, [uploadQueue, uploadingFiles, uploadMode])

    // ===== VALIDATION MODE FUNCTIONS =====

    const resolveFilename = async (filenameToResolve) => {
        setLoading(true)
        setBatchResults(null)

        try {
            const response = await fetch(API_ENDPOINTS.RESOLVE, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ filename: filenameToResolve }),
            })

            const data = await response.json()
            setResult(data)
        } catch (error) {
            setResult({
                success: false,
                error: `Failed to connect to backend: ${error.message}`,
                error_type: 'CONNECTION_ERROR',
            })
        } finally {
            setLoading(false)
        }
    }

    const resolveBatch = async (batchInput) => {
        setLoading(true)
        setResult(null)

        const filenames = batchInput
            .split(',')
            .map(f => f.trim())
            .filter(f => f.length > 0)

        try {
            const promises = filenames.map(async (fname) => {
                try {
                    const response = await fetch(API_ENDPOINTS.RESOLVE, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ filename: fname }),
                    })
                    const data = await response.json()
                    return { filename: fname, result: data }
                } catch (error) {
                    return {
                        filename: fname,
                        result: {
                            success: false,
                            error: `Failed to connect to backend: ${error.message}`,
                            error_type: 'CONNECTION_ERROR',
                        }
                    }
                }
            })

            const results = await Promise.all(promises)

            const valid = results.filter(r => r.result.success)
            const invalid = results.filter(r => !r.result.success)

            setBatchResults({
                total: results.length,
                valid: valid,
                invalid: invalid,
                validCount: valid.length,
                invalidCount: invalid.length
            })
        } catch (error) {
            setBatchResults({
                total: 0,
                valid: [],
                invalid: [],
                validCount: 0,
                invalidCount: 0,
                error: `Batch processing failed: ${error.message}`
            })
        } finally {
            setLoading(false)
        }
    }

    // ===== UPLOAD MODE FUNCTIONS =====

    const handleDragOver = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
    }

    const handleDragLeave = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
    }

    const handleDrop = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)

        const files = Array.from(e.dataTransfer.files)
        handleFilesSelected(files)
    }

    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files)
        handleFilesSelected(files)
    }

    const handleFilesSelected = async (files) => {
        // Create file state objects
        const newFileObjects = files.map(file => ({
            id: crypto.randomUUID(),
            file: file,
            filename: file.name,
            size: file.size,
            status: 'validating',
            progress: 0,
            validationResult: null,
            uploadResult: null,
            error: null,
            retryCount: 0
        }))

        // Add to selected files
        setSelectedFiles(prev => [...prev, ...newFileObjects])

        // Validate all files in parallel
        const validationPromises = newFileObjects.map(async (fileObj) => {
            try {
                const response = await fetch(API_ENDPOINTS.RESOLVE, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ filename: fileObj.filename }),
                })
                const data = await response.json()
                return { id: fileObj.id, result: data }
            } catch (error) {
                return {
                    id: fileObj.id,
                    result: {
                        success: false,
                        error: error.message,
                        error_type: 'VALIDATION_ERROR'
                    }
                }
            }
        })

        const validationResults = await Promise.all(validationPromises)

        // Update files with validation results
        setSelectedFiles(prev => {
            const updated = [...prev]
            validationResults.forEach(validation => {
                const fileIdx = updated.findIndex(f => f.id === validation.id)
                if (fileIdx >= 0) {
                    updated[fileIdx] = {
                        ...updated[fileIdx],
                        status: validation.result.success ? 'valid' : 'invalid',
                        validationResult: validation.result,
                        error: validation.result.success ? null : validation.result.error
                    }
                }
            })
            return updated
        })

        // Move valid files to upload queue, invalid to failed
        const validFiles = newFileObjects.filter(f => {
            const validation = validationResults.find(v => v.id === f.id)
            return validation?.result.success
        })

        const invalidFiles = newFileObjects.filter(f => {
            const validation = validationResults.find(v => v.id === f.id)
            return !validation?.result.success
        })

        setUploadQueue(prev => [...prev, ...validFiles])

        setFailedFiles(prev => [...prev, ...invalidFiles.map(f => {
            const validation = validationResults.find(v => v.id === f.id)
            return {
                ...f,
                error: validation?.result.error || 'Validation failed'
            }
        })])
    }

    const uploadFile = (fileObj) => {
        const formData = new FormData()
        formData.append('file', fileObj.file)
        formData.append('filename', fileObj.filename)

        // Set initial progress
        setUploadingFiles(prev => ({...prev, [fileObj.id]: 0}))

        const xhr = new XMLHttpRequest()

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const progress = Math.round((e.loaded / e.total) * 100)
                setUploadingFiles(prev => ({...prev, [fileObj.id]: progress}))
            }
        })

        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText)
                    handleUploadSuccess(fileObj, response)
                } catch (e) {
                    handleUploadError(fileObj, 'Invalid response format')
                }
            } else {
                try {
                    const error = JSON.parse(xhr.responseText)
                    handleUploadError(fileObj, error.error || 'Upload failed')
                } catch (e) {
                    handleUploadError(fileObj, 'Upload failed')
                }
            }
        })

        xhr.addEventListener('error', () => {
            handleUploadError(fileObj, 'Network error during upload')
        })

        xhr.open('POST', API_ENDPOINTS.DRIVE_UPLOAD)
        xhr.setRequestHeader('Authorization', `Bearer ${session?.access_token}`)
        xhr.setRequestHeader('X-Google-Token', session?.provider_token)
        xhr.send(formData)

        // Update file status
        setUploadQueue(prev => prev.map(f =>
            f.id === fileObj.id ? {...f, status: 'uploading'} : f
        ))
    }

    const handleUploadSuccess = (fileObj, response) => {
        setUploadingFiles(prev => {
            const updated = {...prev}
            delete updated[fileObj.id]
            return updated
        })

        setUploadQueue(prev => prev.filter(f => f.id !== fileObj.id))

        setUploadedFiles(prev => [...prev, {
            ...fileObj,
            status: 'uploaded',
            uploadResult: response
        }])
    }

    const handleUploadError = (fileObj, error) => {
        setUploadingFiles(prev => {
            const updated = {...prev}
            delete updated[fileObj.id]
            return updated
        })

        setUploadQueue(prev => prev.filter(f => f.id !== fileObj.id))

        setFailedFiles(prev => [...prev, {
            ...fileObj,
            status: 'failed',
            error: error,
            retryCount: fileObj.retryCount
        }])
    }

    const retryUpload = (fileObj) => {
        // Remove from failed
        setFailedFiles(prev => prev.filter(f => f.id !== fileObj.id))

        // Increment retry count and re-add to queue
        const updatedFile = {
            ...fileObj,
            retryCount: fileObj.retryCount + 1,
            status: 'valid',
            error: null,
            progress: 0
        }

        setUploadQueue(prev => [...prev, updatedFile])
    }

    const clearAll = () => {
        setSelectedFiles([])
        setUploadQueue([])
        setUploadedFiles([])
        setFailedFiles([])
        setUploadingFiles({})
    }

    // ===== RENDER HELPERS =====

    const validatingCount = selectedFiles.filter(f => f.status === 'validating').length
    const uploadingCount = Object.keys(uploadingFiles).length
    const uploadedCount = uploadedFiles.length
    const failedCount = failedFiles.length

    const exampleFilenames = [
        '26SS_FTW_Bright_Gold_KV_M2J_16x9.jpg',
        '26SS_FTW_Stargazer_T01_A3J.jpg',
        '26SS_FTW_Unity_Sky_S03_N5BJ.png',
        '26SS_FTW_Blazing_Flair_C01.png',
        '26SS_FTW_Bright_Gold_KV_Pack_01.jpg',
    ]

    const batchExample = '26SS_FTW_Bright_Gold_KV_M2J_16x9.jpg, 26SS_FTW_Stargazer_T01_A3J.jpg, invalid_file.jpg, 26SS_FTW_Unity_Sky_S03_N5BJ.png'

    return (
        <div className="file-upload-tester">
            <div className="tester-header">
                <h2>📤 File Upload Tester</h2>
                <p className="subtitle">Test filename validation and upload files to Google Drive</p>

                <div className="mode-toggle">
                    <button
                        className={`mode-btn ${!uploadMode ? 'active' : ''}`}
                        onClick={() => {
                            setUploadMode(false)
                            setSelectedFiles([])
                            setUploadQueue([])
                            setUploadedFiles([])
                            setFailedFiles([])
                        }}
                    >
                        🔍 Validate Mode
                    </button>
                    <button
                        className={`mode-btn ${uploadMode ? 'active' : ''}`}
                        onClick={() => {
                            setUploadMode(true)
                            setFilename('')
                            setResult(null)
                            setBatchResults(null)
                        }}
                    >
                        📤 Upload Mode
                    </button>
                </div>
            </div>

            <div className="tester-content">
                {!uploadMode ? (
                    // ===== VALIDATION MODE =====
                    <>
                        <div className="input-section">
                            <label htmlFor="filename-input" className="input-label">
                                {isBatchMode ? 'Batch Mode: Enter Multiple Filenames (comma-separated)' : 'Enter Filename'}
                            </label>
                            <input
                                id="filename-input"
                                type="text"
                                value={filename}
                                onChange={(e) => setFilename(e.target.value)}
                                placeholder={isBatchMode ? "file1.jpg, file2.png, file3.jpg..." : "e.g., 26SS_FTW_Bright_Gold_KV_M2J_16x9.jpg"}
                                className="filename-test-input"
                            />
                            {loading && <div className="input-loading">{isBatchMode ? `Processing ${filename.split(',').length} files...` : 'Validating...'}</div>}
                        </div>

                        {batchResults && !loading && (
                            <div className="batch-results">
                                <div className="batch-summary">
                                    <h3>📊 Batch QC Results</h3>
                                    <div className="summary-stats">
                                        <div className="stat-card total">
                                            <span className="stat-icon">📁</span>
                                            <div className="stat-info">
                                                <span className="stat-value">{batchResults.total}</span>
                                                <span className="stat-label">Total Files</span>
                                            </div>
                                        </div>
                                        <div className="stat-card valid">
                                            <span className="stat-icon">✅</span>
                                            <div className="stat-info">
                                                <span className="stat-value">{batchResults.validCount}</span>
                                                <span className="stat-label">Valid</span>
                                            </div>
                                        </div>
                                        <div className="stat-card invalid">
                                            <span className="stat-icon">❌</span>
                                            <div className="stat-info">
                                                <span className="stat-value">{batchResults.invalidCount}</span>
                                                <span className="stat-label">Invalid</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {batchResults.validCount > 0 && (
                                    <div className="batch-section valid-section">
                                        <h4>✅ Valid Files ({batchResults.validCount})</h4>
                                        <div className="batch-files">
                                            {batchResults.valid.map((item, index) => (
                                                <div key={index} className="batch-file-item valid">
                                                    <div className="file-header">
                                                        <span className="file-icon">📄</span>
                                                        <span className="file-name">{item.filename}</span>
                                                    </div>
                                                    <div className="file-details">
                                                        <div className="detail-row">
                                                            <span className="detail-label">Pack:</span>
                                                            <span className="detail-value">{item.result.pack.folder}</span>
                                                        </div>
                                                        {item.result.model && (
                                                            <div className="detail-row">
                                                                <span className="detail-label">Model:</span>
                                                                <span className="detail-value">
                                                                    {item.result.model.code} - {item.result.model.folder}
                                                                </span>
                                                            </div>
                                                        )}
                                                        <div className="detail-row">
                                                            <span className="detail-label">Rule:</span>
                                                            <span className="detail-value">{item.result.rule.description}</span>
                                                        </div>
                                                        <div className="detail-path">
                                                            <span className="path-label">📂 Storage Path:</span>
                                                            <code className="path-value">{item.result.path.full_path}</code>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {batchResults.invalidCount > 0 && (
                                    <div className="batch-section invalid-section">
                                        <h4>❌ Invalid Files ({batchResults.invalidCount})</h4>
                                        <div className="batch-files">
                                            {batchResults.invalid.map((item, index) => (
                                                <div key={index} className="batch-file-item invalid">
                                                    <div className="file-header">
                                                        <span className="file-icon">⚠️</span>
                                                        <span className="file-name">{item.filename}</span>
                                                    </div>
                                                    <div className="file-details error">
                                                        <p className="error-message">{item.result.error}</p>
                                                        <p className="error-type">Error Type: {item.result.error_type}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {result && !loading && !batchResults && (
                            <div className={`validation-result ${result.success ? 'valid' : 'invalid'}`}>
                                {result.success ? (
                                    <>
                                        <div className="result-status success">
                                            <span className="status-icon">✅</span>
                                            <h3>Valid Filename</h3>
                                        </div>

                                        <div className="result-info">
                                            <div className="info-row">
                                                <span className="info-label">Pack:</span>
                                                <span className="info-value">{result.pack.folder}</span>
                                            </div>

                                            {result.model && (
                                                <div className="info-row">
                                                    <span className="info-label">Model:</span>
                                                    <span className="info-value">
                                                        {result.model.code} - {result.model.folder}
                                                    </span>
                                                </div>
                                            )}

                                            <div className="info-row">
                                                <span className="info-label">Rule:</span>
                                                <span className="info-value">{result.rule.description}</span>
                                            </div>
                                        </div>

                                        <div className="storage-location">
                                            <h4>📂 File will be stored in:</h4>
                                            <div className="path-display-box">
                                                <code>{result.path.full_path}</code>
                                            </div>
                                            <div className="path-tree-box">
                                                <pre>{result.path.tree}</pre>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="result-status error">
                                            <span className="status-icon">❌</span>
                                            <h3>Invalid Filename</h3>
                                        </div>

                                        <div className="error-details">
                                            <p className="error-message">{result.error}</p>
                                            <p className="error-type">Error Type: {result.error_type}</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {!result && !loading && !batchResults && (
                            <div className="examples-section">
                                <h3>Try an example:</h3>
                                <div className="examples-grid-upload">
                                    {exampleFilenames.map((example, index) => (
                                        <button
                                            key={index}
                                            onClick={() => setFilename(example)}
                                            className="example-chip single"
                                        >
                                            {example}
                                        </button>
                                    ))}
                                </div>
                                <div className="batch-example">
                                    <h4>Or try batch mode:</h4>
                                    <button
                                        onClick={() => setFilename(batchExample)}
                                        className="example-chip batch"
                                    >
                                        <span className="batch-badge">BATCH</span>
                                        {batchExample}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    // ===== UPLOAD MODE =====
                    <>
                        {/* Drag and Drop Zone */}
                        <div
                            className={`drop-zone ${isDragging ? 'dragging' : ''}`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                        >
                            <span className="drop-icon">📂</span>
                            <h3>Drag & Drop Files Here</h3>
                            <p>or</p>
                            <button
                                className="browse-btn"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                Browse Files
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept=".jpg,.jpeg,.png,.webp,.psd"
                                onChange={handleFileSelect}
                                style={{display: 'none'}}
                            />
                            <p className="drop-hint">Supported: JPG, JPEG, PNG, WebP, PSD (max 50MB each)</p>
                        </div>

                        {/* Upload Summary */}
                        {(selectedFiles.length > 0 || uploadedFiles.length > 0 || failedFiles.length > 0) && (
                            <>
                                <div className="upload-summary">
                                    <h3>📊 Upload Summary</h3>
                                    <div className="summary-stats">
                                        {validatingCount > 0 && (
                                            <div className="stat-card validating">
                                                <span className="stat-icon">⏳</span>
                                                <div className="stat-info">
                                                    <span className="stat-value">{validatingCount}</span>
                                                    <span className="stat-label">Validating</span>
                                                </div>
                                            </div>
                                        )}
                                        {uploadingCount > 0 && (
                                            <div className="stat-card uploading">
                                                <span className="stat-icon">📤</span>
                                                <div className="stat-info">
                                                    <span className="stat-value">{uploadingCount}</span>
                                                    <span className="stat-label">Uploading</span>
                                                </div>
                                            </div>
                                        )}
                                        {uploadedCount > 0 && (
                                            <div className="stat-card valid">
                                                <span className="stat-icon">✅</span>
                                                <div className="stat-info">
                                                    <span className="stat-value">{uploadedCount}</span>
                                                    <span className="stat-label">Uploaded</span>
                                                </div>
                                            </div>
                                        )}
                                        {failedCount > 0 && (
                                            <div className="stat-card invalid">
                                                <span className="stat-icon">❌</span>
                                                <div className="stat-info">
                                                    <span className="stat-value">{failedCount}</span>
                                                    <span className="stat-label">Failed</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Validating & Uploading Files */}
                                {(selectedFiles.filter(f => f.status === 'validating').length > 0 || uploadQueue.length > 0) && (
                                    <div className="upload-section">
                                        <h4>📋 In Progress</h4>
                                        <div className="file-list">
                                            {selectedFiles.filter(f => f.status === 'validating').map(file => (
                                                <div key={file.id} className="upload-file-item validating">
                                                    <div className="file-info">
                                                        <span className="file-icon">⏳</span>
                                                        <span className="file-name">{file.filename}</span>
                                                        <span className="file-size">({(file.size / 1024 / 1024).toFixed(2)}MB)</span>
                                                    </div>
                                                    <div className="file-status">Validating...</div>
                                                </div>
                                            ))}
                                            {uploadQueue.map(file => (
                                                <div key={file.id} className="upload-file-item uploading">
                                                    <div className="file-info">
                                                        <span className="file-icon">📤</span>
                                                        <span className="file-name">{file.filename}</span>
                                                    </div>
                                                    <div className="progress-container">
                                                        <div className="upload-progress-bar">
                                                            <div
                                                                className="progress-fill"
                                                                style={{width: `${uploadingFiles[file.id] || 0}%`}}
                                                            />
                                                        </div>
                                                        <span className="progress-text">{uploadingFiles[file.id] || 0}%</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Uploaded Files */}
                                {uploadedFiles.length > 0 && (
                                    <div className="upload-section success-section">
                                        <h4>✅ Successfully Uploaded ({uploadedFiles.length})</h4>
                                        <div className="file-list">
                                            {uploadedFiles.map(file => (
                                                <div key={file.id} className="upload-file-item success">
                                                    <div className="file-info">
                                                        <span className="file-icon">✅</span>
                                                        <span className="file-name">{file.uploadResult.actual_filename}</span>
                                                    </div>
                                                    <div className="file-details-upload">
                                                        <span className="path-info">📂 {file.uploadResult.storage_path}</span>
                                                        {file.uploadResult.web_view_link && (
                                                            <a
                                                                href={file.uploadResult.web_view_link}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="drive-link"
                                                            >
                                                                Open in Drive →
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Failed Files */}
                                {failedFiles.length > 0 && (
                                    <div className="upload-section error-section">
                                        <h4>❌ Failed ({failedFiles.length})</h4>
                                        <div className="file-list">
                                            {failedFiles.map(file => (
                                                <div key={file.id} className="upload-file-item failed">
                                                    <div className="file-info">
                                                        <span className="file-icon">❌</span>
                                                        <span className="file-name">{file.filename}</span>
                                                    </div>
                                                    <div className="file-error">
                                                        <p className="error-msg">{file.error}</p>
                                                        <button
                                                            className="retry-btn"
                                                            onClick={() => retryUpload(file)}
                                                            disabled={file.retryCount >= 3}
                                                        >
                                                            {file.retryCount >= 3 ? `Max Retries (${file.retryCount})` : 'Retry'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Clear All Button */}
                                {uploadedFiles.length > 0 || failedFiles.length > 0 && uploadQueue.length === 0 && selectedFiles.filter(f => f.status === 'validating').length === 0 && (
                                    <div className="action-buttons">
                                        <button className="clear-btn" onClick={clearAll}>
                                            Clear All
                                        </button>
                                    </div>
                                )}
                            </>
                        )}

                        {selectedFiles.length === 0 && uploadedFiles.length === 0 && failedFiles.length === 0 && (
                            <div className="empty-state">
                                <p className="empty-text">No files selected. Drag & drop files or click browse to get started.</p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

export default FileUploadTester
