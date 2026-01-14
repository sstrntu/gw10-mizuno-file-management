import { useState, useEffect } from 'react'
import './DirectoryViewer.css'
import { API_ENDPOINTS } from '../config/api'

function DirectoryViewer() {
    const [structure, setStructure] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [expandedNodes, setExpandedNodes] = useState(new Set())
    const [createLoading, setCreateLoading] = useState(false)
    const [createResult, setCreateResult] = useState(null)

    useEffect(() => {
        fetchStructure()
    }, [])

    const fetchStructure = async () => {
        setLoading(true)
        setError(null)

        try {
            const response = await fetch(API_ENDPOINTS.STRUCTURE)
            const data = await response.json()

            if (response.ok) {
                setStructure(data)
                // Expand root by default
                setExpandedNodes(new Set([data.name]))
            } else {
                setError(data.error || 'Failed to load directory structure')
            }
        } catch (err) {
            setError(`Failed to connect to backend: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    const toggleNode = (nodePath) => {
        const newExpanded = new Set(expandedNodes)
        if (newExpanded.has(nodePath)) {
            newExpanded.delete(nodePath)
        } else {
            newExpanded.add(nodePath)
        }
        setExpandedNodes(newExpanded)
    }

    const handleCreateDirectories = async () => {
        setCreateLoading(true)
        setCreateResult(null)

        try {
            const response = await fetch(API_ENDPOINTS.CREATE_DIRECTORIES, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            })

            const data = await response.json()
            setCreateResult(data)
        } catch (error) {
            setCreateResult({
                success: false,
                error: `Failed to connect to backend: ${error.message}`,
            })
        } finally {
            setCreateLoading(false)
        }
    }

    const renderNode = (node, path = '', level = 0) => {
        const nodePath = path ? `${path}/${node.name}` : node.name
        const hasChildren = node.children && node.children.length > 0
        const isExpanded = expandedNodes.has(nodePath)

        return (
            <div key={nodePath} className="tree-node">
                <div
                    className={`node-content level-${level}`}
                    onClick={() => hasChildren && toggleNode(nodePath)}
                    style={{ cursor: hasChildren ? 'pointer' : 'default' }}
                >
                    {hasChildren && (
                        <span className="expand-icon">
                            {isExpanded ? '▼' : '▶'}
                        </span>
                    )}
                    {!hasChildren && <span className="expand-icon-placeholder"></span>}
                    <span className="folder-icon">📁</span>
                    <span className="node-name">{node.name}</span>
                </div>

                {hasChildren && isExpanded && (
                    <div className="node-children">
                        {node.children.map((child) => renderNode(child, nodePath, level + 1))}
                    </div>
                )}
            </div>
        )
    }

    if (loading) {
        return (
            <div className="directory-viewer">
                <div className="loading">
                    <div className="spinner"></div>
                    <p>Loading directory structure...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="directory-viewer">
                <div className="error-box">
                    <h3>⚠️ Error</h3>
                    <p>{error}</p>
                    <button onClick={fetchStructure} className="retry-button">
                        Retry
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="directory-viewer">
            <div className="viewer-header">
                <h2>📂 Directory Structure</h2>
                <p className="subtitle">Complete folder hierarchy for file organization</p>
            </div>

            <div className="tree-container">
                {structure && renderNode(structure)}
            </div>

            <div className="viewer-info">
                <p className="info-text">
                    💡 Click on folders to expand/collapse. This structure is generated from your configuration files.
                </p>
            </div>

            <div className="creator-section">
                <div className="creator-header-section">
                    <h2>🏗️ Create Directory Structure</h2>
                    <p className="subtitle">Generate the complete folder hierarchy</p>
                </div>

                <div className="creator-content-section">
                    <div className="info-card">
                        <h3>📋 What This Does</h3>
                        <ul>
                            <li>Creates all pack folders (Bright Gold, Stargazer, Unity Sky, Blazing Flair)</li>
                            <li>Creates category folders (Key Visual, Tech Shots, Supporting Images, Carousel)</li>
                            <li>Creates model-specific folders within each category</li>
                            <li>Sets up the complete directory hierarchy based on your configuration</li>
                        </ul>
                    </div>

                    <div className="action-section">
                        <button
                            onClick={handleCreateDirectories}
                            disabled={createLoading}
                            className="create-button"
                        >
                            {createLoading ? (
                                <>
                                    <span className="spinner-small"></span>
                                    Creating Directories...
                                </>
                            ) : (
                                <>
                                    <span className="button-icon">🚀</span>
                                    Create Directory Structure
                                </>
                            )}
                        </button>

                        <p className="note">
                            💡 Note: This is a mock operation for testing. In production, this would create actual folders.
                        </p>
                    </div>

                    {createResult && (
                        <div className={`result-box ${createResult.success ? 'success' : 'error'}`}>
                            {createResult.success ? (
                                <>
                                    <h3>✅ Success!</h3>
                                    <p className="result-message">{createResult.message}</p>
                                    <div className="result-details">
                                        <p><strong>Total Directories:</strong> {createResult.count}</p>
                                        {createResult.paths && createResult.paths.length > 0 && (
                                            <div className="sample-paths">
                                                <p><strong>Sample Paths:</strong></p>
                                                <ul>
                                                    {createResult.paths.map((path, index) => (
                                                        <li key={index}><code>{path}</code></li>
                                                    ))}
                                                </ul>
                                                {createResult.count > createResult.paths.length && (
                                                    <p className="more-paths">...and {createResult.count - createResult.paths.length} more</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <h3>❌ Error</h3>
                                    <p className="result-message">{createResult.error}</p>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default DirectoryViewer
