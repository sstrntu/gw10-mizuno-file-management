import { useState } from 'react'
import './DirectoryCreator.css'
import { API_ENDPOINTS } from '../config/api'

function DirectoryCreator({ session, onScanStart, onScanEnd, onScanComplete, rootFolderId, setRootFolderId }) {
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState(null)
    const [showResetConfirm, setShowResetConfirm] = useState(false)

    // Default folder ID for display hint
    const DEFAULT_ROOT_ID = '1cKccx5IF91I6kZrqBdSx8MPNirXAf2c5'

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
            // Assume Drive Mode
            if (isAuthenticated && hasGoogleToken) {
                const endpoint = API_ENDPOINTS.DRIVE_CREATE_DIRECTORIES
                const options = {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({
                        dry_run: false,
                        root_folder_id: rootFolderId
                    })
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
            } else {
                setResult({
                    success: false,
                    error: 'Authentication required. Please login with Google to create directories.'
                })
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
        if (onScanStart) onScanStart()

        try {
            const response = await fetch(API_ENDPOINTS.DRIVE_CHECK_STRUCTURE, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    root_folder_id: rootFolderId
                })
            })

            const data = await response.json()
            setResult({
                ...data,
                isCheckResult: true
            })
            // Pass the hierarchy to the viewer
            if (data.success && data.hierarchy && onScanComplete) {
                onScanComplete(data.hierarchy)
            }
        } catch (error) {
            setResult({
                success: false,
                error: `Failed to check structure: ${error.message}`,
            })
        } finally {
            setLoading(false)
            if (onScanEnd) onScanEnd()
        }
    }

    const handleResetStructure = async () => {
        setShowResetConfirm(false)
        setLoading(true)
        setResult(null)

        try {
            const response = await fetch(API_ENDPOINTS.DRIVE_RESET_STRUCTURE, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    root_folder_id: rootFolderId,
                    confirm_reset: true
                })
            })

            const data = await response.json()
            setResult(data)

        } catch (error) {
            setResult({
                success: false,
                error: `Failed to reset structure: ${error.message}`,
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="directory-creator">
            <div className="creator-header">
                <h2>Directory Creation</h2>
                <p className="subtitle">Create the complete folder hierarchy for file organization</p>
            </div>

            <div className="creator-content">
                <div className="creator-panel controls-panel">
                    {/* Drive Settings & Actions */}
                    {hasGoogleToken ? (
                        <div className="drive-actions-container">
                            <div className="root-folder-input">
                                <label htmlFor="root-id">Target Root Folder ID</label>
                                <input
                                    id="root-id"
                                    type="text"
                                    value={rootFolderId}
                                    onChange={(e) => setRootFolderId(e.target.value)}
                                    placeholder="Enter Google Drive Folder ID"
                                />
                                <p className="field-hint">Defaults to: {DEFAULT_ROOT_ID}</p>
                            </div>

                            <div className="action-row">
                                <button
                                    onClick={handleCreateDirectories}
                                    disabled={loading}
                                    className="create-button"
                                >
                                    {loading ? 'Creating...' : 'Create Structure'}
                                </button>
                                <button
                                    onClick={handleCheckStructure}
                                    disabled={loading}
                                    className="check-button"
                                >
                                    {loading ? 'Checking...' : 'Scan / Check Status'}
                                </button>

                                {/* Sync Button (only enabled if we did a check and found missing items) */}
                                {result?.isCheckResult && result?.summary?.missing_count > 0 && (
                                    <button
                                        onClick={handleCreateDirectories}
                                        disabled={loading}
                                        className="sync-button"
                                        title="Add only missing folders, keep existing files"
                                    >
                                        Sync Missing Folders ({result.summary.missing_count})
                                    </button>
                                )}
                            </div>

                            <div className="destructive-zone">
                                <h4>Destructive Actions</h4>
                                <button
                                    onClick={() => setShowResetConfirm(true)}
                                    disabled={loading}
                                    className="reset-button"
                                >
                                    Reset & Recreate Structure
                                </button>
                                <p className="warning-text">Warning: This will delete ALL files in the target folder.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="auth-required-state">
                            <p>Authentication Required</p>
                            <p className="sub-text">Please log in with Google to manage directory structure.</p>
                        </div>
                    )}
                </div>

                <div className="creator-panel results-panel">
                    {/* Results Display */}
                    {result ? (
                        <div className={`result-box ${result.success ? 'success' : 'error'}`}>
                            {result.success ? (
                                <>
                                    {result.isCheckResult ? (
                                        <>
                                            <h3>Structure Check Complete</h3>
                                            <div className="result-details">
                                                <div className="summary-stats">
                                                    <div className="stat existing">
                                                        <span className="stat-value">{result.summary?.existing_count || 0}</span>
                                                        <span className="stat-label">Existing</span>
                                                    </div>
                                                    <div className={`stat missing ${result.summary?.missing_count > 0 ? 'alert' : ''}`}>
                                                        <span className="stat-value">{result.summary?.missing_count || 0}</span>
                                                        <span className="stat-label">Missing</span>
                                                    </div>
                                                </div>
                                                {result.missing && result.missing.length > 0 && (
                                                    <div className="missing-paths">
                                                        <p><strong>Missing Folders:</strong></p>
                                                        <ul>
                                                            {result.missing.slice(0, 15).map((item, index) => (
                                                                <li key={index}>
                                                                    <code>{item.path}</code>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                        {result.missing.length > 15 && (
                                                            <p className="more-paths">...and {result.missing.length - 15} more</p>
                                                        )}
                                                        <p className="check-hint">Use "Sync Missing" to create these folders.</p>
                                                    </div>
                                                )}
                                                {result.missing?.length === 0 && (
                                                    <p className="success-msg">Base structure is complete!</p>
                                                )}
                                            </div>
                                        </>
                                    ) : result.reset_stats ? (
                                        <>
                                            <h3>Reset Complete</h3>
                                            <div className="result-details">
                                                <p className="success-msg">Structure recreated successfully.</p>
                                                <div className="summary-stats">
                                                    <div className="stat failed">
                                                        <span className="stat-value">{result.reset_stats.deleted}</span>
                                                        <span className="stat-label">Deleted</span>
                                                    </div>
                                                    <div className="stat created">
                                                        <span className="stat-value">{result.summary?.created || 0}</span>
                                                        <span className="stat-label">Created</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <h3>{result.dry_run ? 'Dry Run Complete' : 'Creation Complete'}</h3>
                                            <div className="result-details">
                                                <div className="summary-stats">
                                                    <div className="stat created">
                                                        <span className="stat-value">{result.summary?.created || 0}</span>
                                                        <span className="stat-label">{result.dry_run ? 'Would Create' : 'Created'}</span>
                                                    </div>
                                                </div>
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
                    ) : (
                        <div className="empty-state">
                            <p>Ready to scan.</p>
                            <p className="sub-text">Select a mode and click Scan to see the directory status here.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Confirmation Modal */}
            {showResetConfirm && (
                <div className="modal-overlay">
                    <div className="modal-content warning-modal">
                        <h3>⚠️ Danger Zone</h3>
                        <p>Are you sure you want to <strong>WIPE ALL CONTENTS</strong> of the target folder?</p>
                        <p>Folder ID: <code>{rootFolderId}</code></p>
                        <p>This action cannot be undone. All files and subfolders will be permanently deleted.</p>
                        <div className="modal-actions">
                            <button onClick={() => setShowResetConfirm(false)} className="btn-cancel">Cancel</button>
                            <button onClick={handleResetStructure} className="btn-confirm-delete">Yes, Delete Everything</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default DirectoryCreator
