import { useState } from 'react'
import './DirectoryViewer.css'
import DirectoryCreator from './DirectoryCreator'

// Default folder ID from requirements
const DEFAULT_ROOT_ID = '1cKccx5IF91I6kZrqBdSx8MPNirXAf2c5'

function DirectoryViewer({ session }) {
    const [structure, setStructure] = useState(null)
    const [loading, setLoading] = useState(false)
    const [expandedNodes, setExpandedNodes] = useState(new Set())
    const [rootFolderId, setRootFolderId] = useState(DEFAULT_ROOT_ID)
    const [hasScanned, setHasScanned] = useState(false)

    // Called when scan completes with hierarchy data
    const handleScanComplete = (hierarchy) => {
        if (hierarchy) {
            setStructure(hierarchy)
            setExpandedNodes(new Set([hierarchy.name]))
            setHasScanned(true)
        }
    }

    // Called when scan starts
    const handleScanStart = () => {
        setLoading(true)
    }

    // Called when scan ends (success or failure)
    const handleScanEnd = () => {
        setLoading(false)
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

    return (
        <div className="directory-viewer">
            {/* Directory Creation Section (Top) */}
            <DirectoryCreator
                session={session}
                onScanStart={handleScanStart}
                onScanEnd={handleScanEnd}
                onScanComplete={handleScanComplete}
                rootFolderId={rootFolderId}
                setRootFolderId={setRootFolderId}
            />

            <div className="viewer-header">
                <h2>Directory Structure</h2>
                <p className="subtitle">Live view from Google Drive</p>
            </div>

            <div className="tree-container">
                {loading && (
                    <div className="loading-inline">
                        <div className="spinner"></div>
                        <p>Loading directory structure...</p>
                    </div>
                )}

                {!loading && !hasScanned && (
                    <div className="empty-state">
                        <p>Click "Scan / Check Status" to view the directory structure from Google Drive.</p>
                    </div>
                )}

                {!loading && hasScanned && structure && renderNode(structure)}
            </div>

            <div className="viewer-info">
                <p className="info-text">
                    Click on folders to expand/collapse.
                </p>
            </div>
        </div>
    )
}

export default DirectoryViewer
