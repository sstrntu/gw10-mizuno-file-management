import { useState, useEffect } from 'react'
import './FileUploadTester.css'
import { API_ENDPOINTS } from '../config/api'

function FileUploadTester() {
    const [filename, setFilename] = useState('')
    const [result, setResult] = useState(null)
    const [batchResults, setBatchResults] = useState(null)
    const [loading, setLoading] = useState(false)
    const [debouncedFilename, setDebouncedFilename] = useState('')
    const [isBatchMode, setIsBatchMode] = useState(false)

    // Debounce filename input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedFilename(filename)
        }, 500)

        return () => clearTimeout(timer)
    }, [filename])

    // Auto-resolve when debounced filename changes
    useEffect(() => {
        if (debouncedFilename.trim()) {
            // Check if it's batch mode (contains comma)
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
    }, [debouncedFilename])

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

        // Parse comma-separated filenames
        const filenames = batchInput
            .split(',')
            .map(f => f.trim())
            .filter(f => f.length > 0)

        try {
            // Process all filenames in parallel
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

            // Separate valid and invalid results
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
                <p className="subtitle">Test filename validation and see where files will be stored</p>
            </div>

            <div className="tester-content">
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
            </div>
        </div>
    )
}

export default FileUploadTester
