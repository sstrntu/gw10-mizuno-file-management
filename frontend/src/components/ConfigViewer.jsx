import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../config/api'
import './ConfigViewer.css'

function ConfigViewer({ onClose }) {
    const [files, setFiles] = useState([])
    const [selectedFile, setSelectedFile] = useState(null)
    const [content, setContent] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    useEffect(() => {
        fetchFiles()
    }, [])

    const fetchFiles = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/config`)
            const data = await res.json()

            if (data.files && data.files.length > 0) {
                setFiles(data.files)
                if (!selectedFile) {
                    selectFile(data.files[0])
                }
            } else {
                setFiles([])
                setError(data.error || 'No config files found')
            }
        } catch (err) {
            setError('Failed to fetch config files: ' + err.message)
            console.error(err)
        }
    }

    const selectFile = async (filename) => {
        if (selectedFile === filename) return

        setLoading(true)
        setError(null)
        setSelectedFile(filename)

        try {
            const res = await fetch(`${API_BASE_URL}/api/config/${filename}`)
            const data = await res.json()

            if (data.content) {
                // Formatting for display
                let formatted = data.content
                try {
                    formatted = JSON.stringify(JSON.parse(data.content), null, 4)
                } catch (e) {
                    // Use as is
                }

                setContent(formatted)
            } else {
                setError(data.error || 'Failed to load file content')
            }
        } catch (err) {
            setError(`Failed to fetch ${filename}`)
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="config-viewer-overlay" onClick={onClose}>
            <div className="config-viewer-modal" onClick={e => e.stopPropagation()}>
                <div className="config-sidebar">
                    <h3>Config Files</h3>
                    <div className="file-list">
                        {files.map(file => (
                            <button
                                key={file}
                                className={`file-btn ${selectedFile === file ? 'active' : ''}`}
                                onClick={() => selectFile(file)}
                            >
                                <span className="file-icon">📄</span>
                                {file}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="config-main">
                    <div className="viewer-header">
                        <div className="file-info">
                            <h2>{selectedFile}</h2>
                            <span className="read-only-badge">Read Only</span>
                        </div>

                        <button className="btn-close" onClick={onClose}>
                            ✕ Close
                        </button>
                    </div>

                    {error && <div className="viewer-error">{error}</div>}

                    <div className="viewer-container">
                        {loading ? (
                            <div className="loading-state">Loading...</div>
                        ) : (
                            <pre className="code-viewer">
                                {content}
                            </pre>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ConfigViewer
