import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import './QCMatrix.css'
import { API_ENDPOINTS } from '../config/api'

// Cache storage (shared across component mounts)
const qcDataCache = {
    data: null,
    timestamp: null,
    CACHE_DURATION: 5 * 60 * 1000 // 5 minutes in milliseconds
}

function QCMatrix() {
    const { session, user } = useAuth()
    const [qcData, setQcData] = useState([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState(null)
    const [selectedFile, setSelectedFile] = useState(null)
    const [showReuploadModal, setShowReuploadModal] = useState(false)
    const [showActionsModal, setShowActionsModal] = useState(false)
    const [fileActions, setFileActions] = useState([])
    const [rejectComment, setRejectComment] = useState('')
    const hasFetchedRef = useRef(false)

    // Filter State
    const [filters, setFilters] = useState({
        status: 'All',
        pack: 'All',
        model: 'All',
        category: 'All'
    })

    // Check if cached data is still fresh
    const isCacheFresh = () => {
        if (!qcDataCache.data || !qcDataCache.timestamp) return false
        const now = Date.now()
        return (now - qcDataCache.timestamp) < qcDataCache.CACHE_DURATION
    }

    // Fetch QC data on mount (with caching)
    useEffect(() => {
        if (hasFetchedRef.current) return
        hasFetchedRef.current = true

        // Use cached data if fresh
        if (isCacheFresh()) {
            console.log('Using cached QC data')
            setQcData(qcDataCache.data)
            setLoading(false)
            setError(null)
        } else {
            console.log('Cache stale or empty, fetching fresh data')
            fetchQCData()
        }
    }, [session])

    const fetchQCData = async () => {
        if (!session) {
            setError('Not authenticated')
            setLoading(false)
            return
        }

        try {
            setLoading(true)

            console.log('Fetching QC data using /api/drive/check-structure...')

            // Use the same endpoint as Directory Structure (FAST!)
            const response = await fetch(API_ENDPOINTS.DRIVE_CHECK_STRUCTURE, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'X-Google-Token': session.provider_token || '',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})  // Backend generates paths from config
            })

            const data = await response.json()

            if (data.success) {
                const { existing, missing, summary } = data

                // Parse each existing path to extract metadata
                const qcItems = existing.map((item, index) => {
                    const pathParts = item.path.split('/')

                    // Parse path: "1. ELITE/1. Key Visual/Model Name"
                    const pack = pathParts[0] || 'Unknown'
                    const category = pathParts[1] || 'Unknown'
                    const model = pathParts[2] || 'Unknown'

                    // Determine type from category
                    let type = 'Unknown'
                    if (category.includes('Key Visual')) type = 'KV'
                    else if (category.includes('Tech Shot')) type = 'TS'
                    else if (category.includes('T01')) type = 'T01'
                    else if (category.includes('T02')) type = 'T02'
                    else if (category.includes('T03')) type = 'T03'

                    return {
                        id: `${item.folder_id}-${index}`,
                        path: item.path,
                        folder_id: item.folder_id,
                        pack: pack,
                        category: category,
                        model: model,
                        type: type,
                        file_count: 0,  // TODO: Get from database cache
                        expected_files: 1,  // TODO: Calculate based on rules
                        upload_status: 'Empty',  // Will be updated after counting files
                        approvals: 0,
                        qc_status: 'Pending',
                        comments: ''
                    }
                })

                // Add missing folders to the list
                const missingItems = missing.map((item, index) => {
                    const pathParts = item.path.split('/')
                    const pack = pathParts[0] || 'Unknown'
                    const category = pathParts[1] || 'Unknown'
                    const model = pathParts[2] || 'Unknown'

                    let type = 'Unknown'
                    if (category.includes('Key Visual')) type = 'KV'
                    else if (category.includes('Tech Shot')) type = 'TS'
                    else if (category.includes('T01')) type = 'T01'
                    else if (category.includes('T02')) type = 'T02'
                    else if (category.includes('T03')) type = 'T03'

                    return {
                        id: `missing-${index}`,
                        path: item.path,
                        folder_id: null,
                        pack: pack,
                        category: category,
                        model: model,
                        type: type,
                        file_count: 0,
                        expected_files: 1,
                        upload_status: 'Missing',
                        approvals: 0,
                        qc_status: 'Pending',
                        comments: ''
                    }
                })

                const allItems = [...qcItems, ...missingItems]

                const newData = {
                    stats: {
                        total_expected: summary.total,
                        uploaded: summary.existing_count,
                        missing: summary.missing_count,
                        upload_percentage: Math.round((summary.existing_count / summary.total) * 100)
                    },
                    files: allItems
                }

                // Update state
                setQcData(newData)
                setError(null)

                // Save to cache
                qcDataCache.data = newData
                qcDataCache.timestamp = Date.now()
                console.log('QC data cached for 5 minutes')
            } else {
                setError(data.error || 'Failed to fetch QC data')
            }
        } catch (err) {
            setError(`Error fetching QC data: ${err.message}`)
            console.error('QC fetch error:', err)
        } finally {
            setLoading(false)
        }
    }

    // Extract stats if available
    const stats = qcData?.stats || { total_expected: 0, uploaded: 0, missing: 0, upload_percentage: 0 }
    const files = qcData?.files || []

    // Extract unique values for filters
    const packs = ['All', ...new Set(files.map(item => item.pack).filter(p => p !== 'Unknown'))]
    const models = ['All', ...new Set(files.map(item => item.model).filter(m => m !== 'Unknown'))]
    const categories = ['All', ...new Set(files.map(item => item.category).filter(c => c !== 'Unknown'))]
    const statuses = ['All', 'APPROVED', 'Pending', 'In Progress']

    // Filter Logic
    const filteredData = files.filter(item => {
        const statusMatch = filters.status === 'All'
            ? true
            : filters.status === 'In Progress'
                ? item.qc_status.includes('/')
                : item.qc_status === filters.status
        const packMatch = filters.pack === 'All' || item.pack === filters.pack
        const modelMatch = filters.model === 'All' || item.model === filters.model
        const categoryMatch = filters.category === 'All' || item.category === filters.category
        return statusMatch && packMatch && modelMatch && categoryMatch
    })

    // Dashboard Statistics
    const totalPaths = filteredData.length
    const completePaths = filteredData.filter(f => f.upload_status === 'Complete').length
    const approvedPaths = filteredData.filter(f => f.qc_status === 'APPROVED').length
    const completionRate = totalPaths > 0 ? Math.round((approvedPaths / totalPaths) * 100) : 0
    const todoCount = filteredData.filter(item => item.comments !== '').length

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }))
    }

    const resetFilters = () => {
        setFilters({
            status: 'All',
            pack: 'All',
            model: 'All',
            category: 'All'
        })
    }

    const handleRefresh = async () => {
        setRefreshing(true)
        // Clear cache to force fresh fetch
        qcDataCache.data = null
        qcDataCache.timestamp = null
        await fetchQCData()
        setRefreshing(false)
    }

    const handleApprove = async (fileItem) => {
        if (!session) {
            alert('Not authenticated')
            return
        }

        try {
            const response = await fetch(API_ENDPOINTS.QC_APPROVE, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'X-Google-Token': session.provider_token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    file_id: fileItem.file_id,
                    filename: fileItem.filename,
                    web_view_link: fileItem.web_view_link,
                    mime_type: fileItem.mime_type
                })
            })

            const data = await response.json()

            if (data.success) {
                // Update local state
                setQcData(prevData =>
                    prevData.map(item => {
                        if (item.file_id === fileItem.file_id) {
                            const newApprovals = data.approval_count
                            return {
                                ...item,
                                approvals: newApprovals,
                                status: newApprovals >= 3 ? 'APPROVED' : `${newApprovals}/3 Approved`
                            }
                        }
                        return item
                    })
                )
                alert(`File approved by ${user?.email}`)
            } else {
                alert(`Error: ${data.error}`)
            }
        } catch (err) {
            alert(`Error approving file: ${err.message}`)
            console.error(err)
        }
    }

    const handleReject = async (fileItem) => {
        if (!rejectComment.trim()) {
            alert('Please enter a rejection comment')
            return
        }

        if (!session) {
            alert('Not authenticated')
            return
        }

        try {
            const response = await fetch(API_ENDPOINTS.QC_REJECT, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'X-Google-Token': session.provider_token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    file_id: fileItem.file_id,
                    filename: fileItem.filename,
                    web_view_link: fileItem.web_view_link,
                    comment: rejectComment
                })
            })

            const data = await response.json()

            if (data.success) {
                // Update local state
                setQcData(prevData =>
                    prevData.map(item =>
                        item.file_id === fileItem.file_id
                            ? { ...item, status: 'Pending', approvals: 0, comments: rejectComment }
                            : item
                    )
                )
                setRejectComment('')
                setShowReuploadModal(false)
                alert(`File rejected by ${user?.email}`)
            } else {
                alert(`Error: ${data.error}`)
            }
        } catch (err) {
            alert(`Error rejecting file: ${err.message}`)
            console.error(err)
        }
    }

    const handleViewActions = async (fileItem) => {
        if (!session) {
            alert('Not authenticated')
            return
        }

        try {
            const response = await fetch(`${API_ENDPOINTS.QC_ACTIONS}/${fileItem.file_id}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'X-Google-Token': session.provider_token,
                    'Content-Type': 'application/json'
                }
            })

            const data = await response.json()

            if (data.success) {
                setFileActions(data.actions)
                setSelectedFile(fileItem)
                setShowActionsModal(true)
            } else {
                alert(`Error: ${data.error}`)
            }
        } catch (err) {
            alert(`Error fetching actions: ${err.message}`)
            console.error(err)
        }
    }

    const getStatusClass = (status) => {
        if (status === 'APPROVED') return 'status-approved'
        if (status.includes('2/3')) return 'status-progress-2'
        if (status.includes('1/3')) return 'status-progress-1'
        return 'status-pending'
    }

    if (loading) {
        return (
            <div className="qc-matrix">
                <div className="qc-header">
                    <h2>🔍 Quality Control Matrix</h2>
                </div>
                <div style={{ padding: '2rem', textAlign: 'center' }}>Loading QC data...</div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="qc-matrix">
                <div className="qc-header">
                    <h2>🔍 Quality Control Matrix</h2>
                </div>
                <div style={{ padding: '2rem', color: '#ff0055' }}>Error: {error}</div>
            </div>
        )
    }

    return (
        <div className="qc-matrix">
            <div className="qc-header">
                <h2>🔍 Quality Control Matrix</h2>
                <div className="header-controls">
                    <div className="filter-group">
                        <select
                            value={filters.status}
                            onChange={(e) => handleFilterChange('status', e.target.value)}
                            className="filter-select"
                        >
                            {statuses.map(s => <option key={s} value={s}>{s === 'All' ? 'Filter: Status' : s}</option>)}
                        </select>
                        <select
                            value={filters.pack}
                            onChange={(e) => handleFilterChange('pack', e.target.value)}
                            className="filter-select"
                        >
                            {packs.map(p => <option key={p} value={p}>{p === 'All' ? 'Filter: Pack' : p}</option>)}
                        </select>
                        <select
                            value={filters.model}
                            onChange={(e) => handleFilterChange('model', e.target.value)}
                            className="filter-select"
                        >
                            {models.map(m => <option key={m} value={m}>{m === 'All' ? 'Filter: Model' : m}</option>)}
                        </select>
                        <select
                            value={filters.category}
                            onChange={(e) => handleFilterChange('category', e.target.value)}
                            className="filter-select"
                        >
                            {categories.map(c => <option key={c} value={c}>{c === 'All' ? 'Filter: Category' : c}</option>)}
                        </select>
                        <button onClick={resetFilters} className="btn-reset">Reset</button>
                        <button
                            onClick={handleRefresh}
                            className="btn-refresh"
                            disabled={refreshing}
                        >
                            {refreshing ? '🔄 Refreshing...' : '🔄 Refresh'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mini Dashboard */}
            <div className="dashboard-grid">
                <div className="dash-card total-card">
                    <div className="card-lbl">Total Folders</div>
                    <div className="card-val">{totalPaths}</div>
                    <div className="card-sub">Model Folders</div>
                </div>
                <div className="dash-card success-card">
                    <div className="card-lbl">Complete</div>
                    <div className="card-val">{completePaths}</div>
                    <div className="card-sub">{completePaths}/{totalPaths} Uploaded</div>
                </div>
                <div className="dash-card warning-card">
                    <div className="card-lbl">Approved</div>
                    <div className="card-val">{approvedPaths}</div>
                    <div className="card-sub">{completionRate}% QC Complete</div>
                </div>
                <div className="dash-card info-card">
                    <div className="card-lbl">Structure</div>
                    <div className="card-val">{stats.uploaded}/{stats.total_expected}</div>
                    <div className="card-sub">{stats.upload_percentage}% Built</div>
                </div>
            </div>

            <div className="qc-content">
                {/* QC Matrix Table */}
                <div className="matrix-section">
                    <div className="matrix-header-bar">
                        <h3>📊 Quality Control Matrix ({filteredData.length} folders)</h3>
                    </div>

                    <div className="table-container">
                        <table className="qc-table">
                            <thead>
                                <tr>
                                    <th>Pack</th>
                                    <th>Category</th>
                                    <th>Model</th>
                                    <th>Type</th>
                                    <th>Path</th>
                                    <th>Files</th>
                                    <th>Upload Status</th>
                                    <th>QC Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.length === 0 ? (
                                    <tr>
                                        <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                                            No folders found. Create directory structure to see paths here.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredData.map((item) => (
                                        <tr key={item.id}>
                                            <td className="pack-cell">{item.pack}</td>
                                            <td className="category-cell">{item.category}</td>
                                            <td className="model-cell">{item.model}</td>
                                            <td className="type-cell">{item.type}</td>
                                            <td className="path-cell">
                                                <span className="path-text">{item.path}</span>
                                            </td>
                                            <td className="file-count-cell">
                                                <span className={item.file_count >= item.expected_files ? 'count-complete' : 'count-partial'}>
                                                    {item.file_count}/{item.expected_files}
                                                </span>
                                            </td>
                                            <td className="upload-status-cell">
                                                <span className={`upload-badge upload-${item.upload_status.toLowerCase()}`}>
                                                    {item.upload_status}
                                                </span>
                                            </td>
                                            <td className="qc-status-cell">
                                                <span className={`qc-badge qc-${item.qc_status.toLowerCase().replace(/\//g, '-')}`}>
                                                    {item.qc_status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Rejection Modal */}
            {showReuploadModal && selectedFile && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h3>Reject File</h3>
                            <button className="modal-close" onClick={() => setShowReuploadModal(false)}>✕</button>
                        </div>
                        <div className="modal-content">
                            <p><strong>File:</strong> {selectedFile.filename}</p>
                            <textarea
                                placeholder="Enter rejection reason and feedback..."
                                value={rejectComment}
                                onChange={(e) => setRejectComment(e.target.value)}
                                rows="5"
                                className="reject-textarea"
                            />
                        </div>
                        <div className="modal-footer">
                            <button className="btn-cancel" onClick={() => setShowReuploadModal(false)}>Cancel</button>
                            <button className="btn-reject" onClick={() => handleReject(selectedFile)}>Send Rejection</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Actions History Modal */}
            {showActionsModal && selectedFile && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h3>Approval History</h3>
                            <button className="modal-close" onClick={() => setShowActionsModal(false)}>✕</button>
                        </div>
                        <div className="modal-content">
                            <p><strong>File:</strong> {selectedFile.filename}</p>
                            <div className="actions-list">
                                {fileActions.length === 0 ? (
                                    <p className="no-actions">No actions recorded yet</p>
                                ) : (
                                    fileActions.map((action) => (
                                        <div key={action.id} className="action-item">
                                            <div className="action-header">
                                                <span className="action-type">{action.action_type.toUpperCase()}</span>
                                                <span className="action-user">{action.user_email}</span>
                                                <span className="action-date">{new Date(action.created_at).toLocaleDateString()}</span>
                                            </div>
                                            {action.comment && <p className="action-comment">{action.comment}</p>}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-cancel" onClick={() => setShowActionsModal(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default QCMatrix
