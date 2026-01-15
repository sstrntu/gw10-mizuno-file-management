import { useState, useEffect } from 'react'
import './DirectoryCreator.css'
import { API_ENDPOINTS } from '../config/api'
import { supabase } from '../config/supabase'

function DirectoryCreator({ session }) {
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState(null)
    const [dryRun, setDryRun] = useState(true)
    const [mode, setMode] = useState('mock') // 'mock' or 'drive'

    const isAuthenticated = !!session?.user
    const hasGoogleToken = !!session?.provider_token

    const getAuthHeaders = () => {
        const headers = {
            'Content-Type': 'application/json',
        }

        if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`
        }

        if (session?.provider_token) {
            headers['X-Google-Token'] = session.provider_token
        }

        return headers
    }

    const handleCreateDirectories = async () => {
        setLoading(true)
        setResult(null)

        try {
            let endpoint, options

            if (mode === 'drive' && isAuthenticated && hasGoogleToken) {
                // Use real Google Drive API
                endpoint = API_ENDPOINTS.DRIVE_CREATE_DIRECTORIES
                options = {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({
                        dry_run: dryRun
                    })
                }
            } else {
                // Use mock endpoint
                endpoint = API_ENDPOINTS.CREATE_DIRECTORIES
                options = {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            }

            const response = await fetch(endpoint, options)
            const data = await response.json()

            if (response.status === 401) {
                setResult({
                    success: false,
                    error: 'Not authenticated. Please login with Google first.'
                })
            } else {
                setResult(data)
            }
        } catch (error) {
            setResult({
                success: false,
                error: `Failed to connect to backend: ${error.message}`,
            })
        } finally {
            setLoading(false)
        }
    }

    const handleCheckStructure = async () => {
        if (!isAuthenticated || !hasGoogleToken) {
            setResult({
                success: false,
                error: 'Please login with Google to check Drive structure.'
            })
            return
        }

        setLoading(true)
        setResult(null)

        try {
            const response = await fetch(API_ENDPOINTS.DRIVE_CHECK_STRUCTURE, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({})
            })

            const data = await response.json()
            setResult({
                ...data,
                isCheckResult: true
            })
        } catch (error) {
            setResult({
                success: false,
                error: `Failed to check structure: ${error.message}`,
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="directory-creator">
            <div className="creator-header">
                <h2>Directory Creation</h2>
                <p className="subtitle">Create the complete folder structure for file organization</p>
            </div>

            <div className="creator-content">
                <div className="info-card">
                    <h3>What This Does</h3>
                    <ul>
                        <li>Creates all pack folders (Bright Gold, Stargazer, Unity Sky, Blazing Flair)</li>
                        <li>Creates category folders (Key Visual, Tech Shots, Supporting Images, Carousel)</li>
                        <li>Creates model-specific folders within each category</li>
                        <li>Sets up the complete directory hierarchy based on your configuration</li>
                    </ul>
                </div>

                {/* Mode Selection */}
                <div className="mode-selection">
                    <h3>Operation Mode</h3>
                    <div className="mode-options">
                        <label className={`mode-option ${mode === 'mock' ? 'selected' : ''}`}>
                            <input
                                type="radio"
                                name="mode"
                                value="mock"
                                checked={mode === 'mock'}
                                onChange={(e) => setMode(e.target.value)}
                            />
                            <span className="mode-label">Mock (Testing)</span>
                            <span className="mode-desc">Simulates folder creation without making changes</span>
                        </label>
                        <label className={`mode-option ${mode === 'drive' ? 'selected' : ''} ${!hasGoogleToken ? 'disabled' : ''}`}>
                            <input
                                type="radio"
                                name="mode"
                                value="drive"
                                checked={mode === 'drive'}
                                onChange={(e) => setMode(e.target.value)}
                                disabled={!hasGoogleToken}
                            />
                            <span className="mode-label">
                                Google Drive
                                {!isAuthenticated && ' (Login Required)'}
                                {isAuthenticated && !hasGoogleToken && ' (Re-login for Drive access)'}
                            </span>
                            <span className="mode-desc">Creates actual folders in your Google Drive</span>
                        </label>
                    </div>
                </div>

                {/* Dry Run Toggle (only for Drive mode) */}
                {mode === 'drive' && hasGoogleToken && (
                    <div className="dry-run-toggle">
                        <label>
                            <input
                                type="checkbox"
                                checked={dryRun}
                                onChange={(e) => setDryRun(e.target.checked)}
                            />
                            <span>Dry Run Mode</span>
                            <span className="toggle-desc">
                                {dryRun ? 'Preview what would be created (no changes made)' : 'Actually create folders in Drive'}
                            </span>
                        </label>
                    </div>
                )}

                <div className="action-section">
                    {mode === 'drive' && hasGoogleToken && (
                        <button
                            onClick={handleCheckStructure}
                            disabled={loading}
                            className="check-button"
                        >
                            {loading ? 'Checking...' : 'Check Existing Structure'}
                        </button>
                    )}
                    <button
                        onClick={handleCreateDirectories}
                        disabled={loading}
                        className={`create-button ${mode === 'drive' && !dryRun ? 'warning' : ''}`}
                    >
                        {loading ? (
                            <>
                                <span className="spinner-small"></span>
                                {mode === 'drive' ? (dryRun ? 'Previewing...' : 'Creating...') : 'Processing...'}
                            </>
                        ) : (
                            <>
                                {mode === 'mock' && 'Run Mock Creation'}
                                {mode === 'drive' && dryRun && 'Preview Drive Creation'}
                                {mode === 'drive' && !dryRun && 'Create in Google Drive'}
                            </>
                        )}
                    </button>

                    <p className="note">
                        {mode === 'mock' && 'This is a mock operation for testing. No actual folders will be created.'}
                        {mode === 'drive' && dryRun && 'Dry run mode: Shows what would be created without making changes.'}
                        {mode === 'drive' && !dryRun && 'WARNING: This will create actual folders in your Google Drive!'}
                    </p>
                </div>

                {result && (
                    <div className={`result-box ${result.success ? 'success' : 'error'}`}>
                        {result.success ? (
                            <>
                                {/* Check Structure Results */}
                                {result.isCheckResult ? (
                                    <>
                                        <h3>Structure Check Complete</h3>
                                        <div className="result-details">
                                            <div className="summary-stats">
                                                <div className="stat">
                                                    <span className="stat-value">{result.summary?.total || 0}</span>
                                                    <span className="stat-label">Total Paths</span>
                                                </div>
                                                <div className="stat existing">
                                                    <span className="stat-value">{result.summary?.existing_count || 0}</span>
                                                    <span className="stat-label">Existing</span>
                                                </div>
                                                <div className="stat missing">
                                                    <span className="stat-value">{result.summary?.missing_count || 0}</span>
                                                    <span className="stat-label">Missing</span>
                                                </div>
                                            </div>
                                            {result.missing && result.missing.length > 0 && (
                                                <div className="missing-paths">
                                                    <p><strong>Missing Folders (first 10):</strong></p>
                                                    <ul>
                                                        {result.missing.slice(0, 10).map((item, index) => (
                                                            <li key={index}>
                                                                <code>{item.path}</code>
                                                                <span className="missing-from">from: {item.missing_from}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                    {result.missing.length > 10 && (
                                                        <p className="more-paths">...and {result.missing.length - 10} more</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* Creation Results */}
                                        <h3>{result.dry_run ? 'Preview Complete' : 'Creation Complete'}</h3>
                                        {result.message && <p className="result-message">{result.message}</p>}
                                        <div className="result-details">
                                            {result.summary ? (
                                                <div className="summary-stats">
                                                    <div className="stat">
                                                        <span className="stat-value">{result.summary.total_paths || 0}</span>
                                                        <span className="stat-label">Total Paths</span>
                                                    </div>
                                                    <div className="stat created">
                                                        <span className="stat-value">{result.summary.created || 0}</span>
                                                        <span className="stat-label">{result.dry_run ? 'Would Create' : 'Created'}</span>
                                                    </div>
                                                    <div className="stat skipped">
                                                        <span className="stat-value">{result.summary.skipped || 0}</span>
                                                        <span className="stat-label">Already Exist</span>
                                                    </div>
                                                    {result.summary.failed > 0 && (
                                                        <div className="stat failed">
                                                            <span className="stat-value">{result.summary.failed}</span>
                                                            <span className="stat-label">Failed</span>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <>
                                                    <p><strong>Total Directories:</strong> {result.count}</p>
                                                    {result.paths && result.paths.length > 0 && (
                                                        <div className="sample-paths">
                                                            <p><strong>Sample Paths:</strong></p>
                                                            <ul>
                                                                {result.paths.map((path, index) => (
                                                                    <li key={index}><code>{path}</code></li>
                                                                ))}
                                                            </ul>
                                                            {result.count > result.paths.length && (
                                                                <p className="more-paths">...and {result.count - result.paths.length} more</p>
                                                            )}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </>
                                )}
                            </>
                        ) : (
                            <>
                                <h3>Error</h3>
                                <p className="result-message">{result.error}</p>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

export default DirectoryCreator
