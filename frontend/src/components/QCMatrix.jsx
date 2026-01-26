import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import './QCMatrix.css'
import { API_ENDPOINTS } from '../config/api'

function QCMatrix() {
    const { session, user } = useAuth()
    const [qcData, setQcData] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [selectedFile, setSelectedFile] = useState(null)
    const [showReuploadModal, setShowReuploadModal] = useState(false)
    const [showActionsModal, setShowActionsModal] = useState(false)
    const [fileActions, setFileActions] = useState([])
    const [rejectComment, setRejectComment] = useState('')

    // Filter State
    const [filters, setFilters] = useState({
        status: 'All',
        pack: 'All',
        model: 'All',
        category: 'All'
    })

    // Fetch QC data on mount
    useEffect(() => {
        fetchQCData()
    }, [session])

    const fetchQCData = async () => {
        if (!session) {
            setError('Not authenticated')
            setLoading(false)
            return
        }

        try {
            setLoading(true)
            const response = await fetch(API_ENDPOINTS.QC_FILES, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'X-Google-Token': session.provider_token,
                    'Content-Type': 'application/json'
                }
            })

            const data = await response.json()

            if (data.success) {
                // Transform Google Drive files into QC format
                const qcItems = data.files.map((file, idx) => ({
                    id: idx,
                    filename: file.name,
                    file_id: file.id,
                    web_view_link: file.webViewLink,
                    mime_type: file.mimeType,
                    pack: 'Unknown',
                    category: 'Unknown',
                    model: 'Unknown',
                    approvals: file.qc?.approval_count || 0,
                    status: file.qc?.status || 'Pending',
                    comments: '',
                    created_at: file.createdTime
                }))
                setQcData(qcItems)
                setError(null)
            } else {
                setError(data.error || 'Failed to fetch QC data')
            }
        } catch (err) {
            setError(`Error fetching QC data: ${err.message}`)
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    // Extract unique values for filters
    const packs = ['All', ...new Set(qcData.map(item => item.pack).filter(p => p !== 'Unknown'))]
    const models = ['All', ...new Set(qcData.map(item => item.model).filter(m => m !== 'Unknown'))]
    const categories = ['All', ...new Set(qcData.map(item => item.category).filter(c => c !== 'Unknown'))]
    const statuses = ['All', 'APPROVED', 'Pending', 'In Progress']

    // Filter Logic
    const filteredData = qcData.filter(item => {
        const statusMatch = filters.status === 'All'
            ? true
            : filters.status === 'In Progress'
                ? item.status.includes('/')
                : item.status === filters.status
        const packMatch = filters.pack === 'All' || item.pack === filters.pack
        const modelMatch = filters.model === 'All' || item.model === filters.model
        const categoryMatch = filters.category === 'All' || item.category === filters.category
        return statusMatch && packMatch && modelMatch && categoryMatch
    })

    // Dashboard Statistics
    const totalFiles = filteredData.length
    const approvedFiles = filteredData.filter(f => f.status === 'APPROVED').length
    const completionRate = totalFiles > 0 ? Math.round((approvedFiles / totalFiles) * 100) : 0
    const todoCount = filteredData.filter(item => item.comments !== '').length

    const filesWithComments = filteredData.filter(item => item.comments !== '')

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
                    </div>
                </div>
            </div>

            {/* Mini Dashboard */}
            <div className="dashboard-grid">
                <div className="dash-card total-card">
                    <div className="card-lbl">Total Files</div>
                    <div className="card-val">{totalFiles}</div>
                    <div className="card-sub">Filtered View</div>
                </div>
                <div className="dash-card completion-card">
                    <div className="card-lbl">Completion</div>
                    <div className="card-val progress-text">{completionRate}%</div>
                    <div className="progress-bar-container">
                        <div className="progress-bar-fill" style={{ width: `${completionRate}%` }}></div>
                    </div>
                </div>
                <div className="dash-card todo-card">
                    <div className="card-lbl">Action Required</div>
                    <div className="card-val">{todoCount}</div>
                    <div className="card-sub">Files with Comments</div>
                </div>
                <div className="dash-card status-card">
                    <div className="card-lbl">Breakdown</div>
                    <div className="mini-stats">
                        <span className="mini-stat approved">{approvedFiles} <small>Appr</small></span>
                        <span className="mini-stat pending">{totalFiles - approvedFiles} <small>Pend</small></span>
                    </div>
                </div>
            </div>

            <div className="qc-content">
                {/* QC Matrix Table */}
                <div className="matrix-section">
                    <div className="matrix-header-bar">
                        <h3>📊 Data Matrix ({filteredData.length} files)</h3>
                    </div>

                    <div className="table-container">
                        <table className="qc-table">
                            <thead>
                                <tr>
                                    <th>File</th>
                                    <th>Status</th>
                                    <th>Approvals</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.map((item) => (
                                    <tr key={item.file_id} className={getStatusClass(item.status)}>
                                        <td>
                                            <a href={item.web_view_link} target="_blank" rel="noopener noreferrer" className="file-link">
                                                📄 {item.filename}
                                            </a>
                                        </td>
                                        <td className="status-cell">
                                            <span className="status-badge">{item.status}</span>
                                        </td>
                                        <td className="approval-cell">
                                            <span className="approval-count">{item.approvals}/3</span>
                                        </td>
                                        <td className="action-cell">
                                            <button
                                                className="btn-approve"
                                                onClick={() => handleApprove(item)}
                                                disabled={item.approvals >= 3}
                                                title="Approve this file"
                                            >
                                                ✓ Approve
                                            </button>
                                            <button
                                                className="btn-reject"
                                                onClick={() => {
                                                    setSelectedFile(item)
                                                    setShowReuploadModal(true)
                                                }}
                                                title="Reject and request changes"
                                            >
                                                ✗ Reject
                                            </button>
                                            <button
                                                className="btn-history"
                                                onClick={() => handleViewActions(item)}
                                                title="View approval history"
                                            >
                                                📋 History
                                            </button>
                                        </td>
                                    </tr>
                                ))}
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
