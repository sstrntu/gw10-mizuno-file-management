import { useState } from 'react'
import './QCMatrix.css'

function QCMatrix() {
    const [selectedFile, setSelectedFile] = useState(null)
    const [showReuploadModal, setShowReuploadModal] = useState(false)

    // Mock data for QC Matrix
    const [qcData, setQcData] = useState([
        {
            id: 1,
            filename: '26SS_FTW_Bright_Gold_KV_M2J_16x9.jpg',
            pack: '1. Bright Gold Pack',
            category: '1. Key Visual',
            model: 'M2J - 4. MORELIA Ⅱ Japan',
            approvals: 3,
            status: 'APPROVED',
            comments: ''
        },
        {
            id: 2,
            filename: '26SS_FTW_Stargazer_T01_A3J.jpg',
            pack: '2. Stargazer Pack',
            category: '2. Tech Shots',
            model: 'A3J - 1. MORELIA NEO V β Japan',
            approvals: 2,
            status: '2/3 Approved',
            comments: 'Lighting needs adjustment'
        },
        {
            id: 3,
            filename: '26SS_FTW_Unity_Sky_S03_N5BJ.png',
            pack: '3. Unity Sky Pack',
            category: '3. Supporting Images',
            model: 'N5BJ - 2. MORELIA NEO V JAPAN',
            approvals: 1,
            status: '1/3 Approved',
            comments: 'Background color mismatch, please fix and reupload'
        },
        {
            id: 4,
            filename: '26SS_FTW_Blazing_Flair_C01.png',
            pack: '4. Blazing Flair Pack',
            category: '4. Carousel',
            model: 'N/A',
            approvals: 0,
            status: 'Pending',
            comments: 'Wrong file format, needs to be JPG'
        },
        {
            id: 5,
            filename: '26SS_FTW_Bright_Gold_KV_Pack_01.jpg',
            pack: '1. Bright Gold Pack',
            category: '1. Key Visual',
            model: 'N/A',
            approvals: 3,
            status: 'APPROVED',
            comments: ''
        },
        {
            id: 6,
            filename: '26SS_FTW_Stargazer_T02_M3J.jpg',
            pack: '2. Stargazer Pack',
            category: '2. Tech Shots',
            model: 'M3J - 3. MIZUNO ALPHA III',
            approvals: 1,
            status: '1/3 Approved',
            comments: 'Product positioning incorrect'
        }
    ])

    // Filter State
    const [filters, setFilters] = useState({
        status: 'All',
        pack: 'All',
        model: 'All',
        category: 'All'
    })

    // Extract unique values for filters
    const packs = ['All', ...new Set(qcData.map(item => item.pack))]
    const models = ['All', ...new Set(qcData.map(item => item.model).filter(m => m !== 'N/A'))]
    const categories = ['All', ...new Set(qcData.map(item => item.category))]
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

    // Filter files with comments for To-Do list (based on filtered data)
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

    const handleApprove = (id) => {
        setQcData(prevData =>
            prevData.map(item => {
                if (item.id === id && item.approvals < 3) {
                    const newApprovals = item.approvals + 1
                    return {
                        ...item,
                        approvals: newApprovals,
                        status: newApprovals === 3 ? 'APPROVED' : `${newApprovals}/3 Approved`
                    }
                }
                return item
            })
        )
    }

    const handleReject = (id) => {
        const comment = prompt('Please enter rejection comment:')
        if (comment) {
            setQcData(prevData =>
                prevData.map(item =>
                    item.id === id
                        ? { ...item, comments: comment, status: 'Pending' }
                        : item
                )
            )
        }
    }

    const handleTodoClick = (file) => {
        setSelectedFile(file)
        setShowReuploadModal(true)
    }

    const handleReupload = (e) => {
        e.preventDefault()
        const newFilename = e.target.filename.value

        if (newFilename !== selectedFile.filename) {
            alert(`Filename mismatch! Expected: ${selectedFile.filename}`)
            return
        }

        alert('File reupload successful! (Mock operation)')
        setShowReuploadModal(false)
    }

    const getStatusClass = (status) => {
        if (status === 'APPROVED') return 'status-approved'
        if (status.includes('2/3')) return 'status-progress-2'
        if (status.includes('1/3')) return 'status-progress-1'
        return 'status-pending'
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
                        <h3>📊 Data Matrix</h3>
                    </div>

                    <div className="table-container">
                        <table className="qc-table">
                            <thead>
                                <tr>
                                    <th>Filename</th>
                                    <th>Pack</th>
                                    <th>Category</th>
                                    <th>Model</th>
                                    <th>Status</th>
                                    <th>Comments</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.map((item) => (
                                    <tr key={item.id} className={item.status === 'APPROVED' ? 'row-approved' : ''}>
                                        <td className="col-filename">{item.filename}</td>
                                        <td className="col-pack">{item.pack}</td>
                                        <td className="col-category">{item.category}</td>
                                        <td className="col-model">{item.model}</td>
                                        <td className="col-status">
                                            <span className={`status-badge ${getStatusClass(item.status)}`}>
                                                {item.status}
                                            </span>
                                        </td>
                                        <td className="col-comments">
                                            {item.comments ? (
                                                <span className="comment-text">{item.comments}</span>
                                            ) : (
                                                <span className="no-comment">—</span>
                                            )}
                                        </td>
                                        <td className="col-actions">
                                            {item.status !== 'APPROVED' && (
                                                <div className="action-buttons">
                                                    <button
                                                        onClick={() => handleApprove(item.id)}
                                                        className="btn-approve"
                                                        title="Approve"
                                                    >
                                                        ✓
                                                    </button>
                                                    <button
                                                        onClick={() => handleReject(item.id)}
                                                        className="btn-reject"
                                                        title="Reject"
                                                    >
                                                        ✗
                                                    </button>
                                                </div>
                                            )}
                                            {item.status === 'APPROVED' && (
                                                <span className="approved-badge">✓ Done</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* QC To-Do List */}
                <div className="todo-section">
                    <div className="todo-header-bar">
                        <h3>📝 QC To-Do List</h3>
                        <span className="todo-count">{filesWithComments.length} files with comments</span>
                    </div>

                    <div className="todo-list">
                        {filesWithComments.length > 0 ? (
                            filesWithComments.map((item) => (
                                <div
                                    key={item.id}
                                    className="todo-item"
                                    onClick={() => handleTodoClick(item)}
                                >
                                    <div className="todo-item-header">
                                        <span className="todo-icon">📄</span>
                                        <span className="todo-filename">{item.filename}</span>
                                        <span className={`todo-status ${getStatusClass(item.status)}`}>
                                            {item.status}
                                        </span>
                                    </div>
                                    <div className="todo-item-body">
                                        <div className="todo-info">
                                            <span className="todo-label">Pack:</span>
                                            <span className="todo-value">{item.pack}</span>
                                        </div>
                                        <div className="todo-comment">
                                            <span className="comment-icon">💬</span>
                                            <span className="comment-content">{item.comments}</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="empty-todo">
                                <p>✨ All files are approved! No pending actions.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Reupload Modal */}
            {showReuploadModal && selectedFile && (
                <div className="modal-overlay" onClick={() => setShowReuploadModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>🔄 Reupload File</h3>
                            <button
                                className="modal-close"
                                onClick={() => setShowReuploadModal(false)}
                            >
                                ✕
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="file-info-section">
                                <h4>File Information</h4>
                                <div className="info-grid">
                                    <div className="info-item">
                                        <span className="info-label">Filename:</span>
                                        <span className="info-value">{selectedFile.filename}</span>
                                    </div>
                                    <div className="info-item">
                                        <span className="info-label">Pack:</span>
                                        <span className="info-value">{selectedFile.pack}</span>
                                    </div>
                                    <div className="info-item">
                                        <span className="info-label">Category:</span>
                                        <span className="info-value">{selectedFile.category}</span>
                                    </div>
                                    <div className="info-item">
                                        <span className="info-label">Model:</span>
                                        <span className="info-value">{selectedFile.model}</span>
                                    </div>
                                </div>

                                <div className="file-link-section">
                                    <span className="info-label">File Link:</span>
                                    <a href="#" className="file-link">
                                        📎 View Current File
                                    </a>
                                </div>

                                <div className="comments-section">
                                    <span className="info-label">Comments:</span>
                                    <div className="comment-box">
                                        {selectedFile.comments}
                                    </div>
                                </div>
                            </div>

                            <form onSubmit={handleReupload} className="reupload-form">
                                <h4>Reupload File</h4>
                                <div className="form-group">
                                    <label htmlFor="filename">Confirm Filename:</label>
                                    <input
                                        type="text"
                                        id="filename"
                                        name="filename"
                                        placeholder={selectedFile.filename}
                                        required
                                        className="form-input"
                                    />
                                    <p className="form-hint">
                                        ⚠️ Filename must match exactly: <code>{selectedFile.filename}</code>
                                    </p>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="file">Select File:</label>
                                    <input
                                        type="file"
                                        id="file"
                                        name="file"
                                        required
                                        className="form-input-file"
                                    />
                                </div>

                                <div className="form-actions">
                                    <button type="submit" className="btn-submit">
                                        Upload File
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-cancel"
                                        onClick={() => setShowReuploadModal(false)}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default QCMatrix
