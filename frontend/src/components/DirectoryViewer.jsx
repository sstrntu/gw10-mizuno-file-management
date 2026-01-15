import { useState, useEffect } from 'react'
import './DirectoryViewer.css'
import { API_ENDPOINTS } from '../config/api'
import DirectoryCreator from './DirectoryCreator'

function DirectoryViewer({ session }) {
    const [structure, setStructure] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [expandedNodes, setExpandedNodes] = useState(new Set())

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
                            {isExpanded ? '[-]' : '[+]'}
                        </span>
                    )}
                    {!hasChildren && <span className="expand-icon-placeholder"></span>}
                    <span className="folder-icon">/</span>
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
                    <h3>Error</h3>
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
                <h2>Directory Structure</h2>
                <p className="subtitle">Complete folder hierarchy for file organization</p>
            </div>

            <div className="tree-container">
                {structure && renderNode(structure)}
            </div>

            <div className="viewer-info">
                <p className="info-text">
                    Click on folders to expand/collapse. This structure is generated from your configuration files.
                </p>
            </div>

            {/* Use DirectoryCreator component with session */}
            <DirectoryCreator session={session} />
        </div>
    )
}

export default DirectoryViewer
