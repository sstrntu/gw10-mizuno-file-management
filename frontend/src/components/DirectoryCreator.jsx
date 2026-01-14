import { useState } from 'react'
import './DirectoryCreator.css'
import { API_ENDPOINTS } from '../config/api'

function DirectoryCreator() {
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState(null)

    const handleCreateDirectories = async () => {
        setLoading(true)
        setResult(null)

        try {
            const response = await fetch(API_ENDPOINTS.CREATE_DIRECTORIES, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            })

            const data = await response.json()
            setResult(data)
        } catch (error) {
            setResult({
                success: false,
                error: `Failed to connect to backend: ${error.message}`,
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="directory-creator">
            <div className="creator-header">
                <h2>🏗️ Directory Creation</h2>
                <p className="subtitle">Create the complete folder structure for file organization</p>
            </div>

            <div className="creator-content">
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
                        disabled={loading}
                        className="create-button"
                    >
                        {loading ? (
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

                {result && (
                    <div className={`result-box ${result.success ? 'success' : 'error'}`}>
                        {result.success ? (
                            <>
                                <h3>✅ Success!</h3>
                                <p className="result-message">{result.message}</p>
                                <div className="result-details">
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
                                </div>
                            </>
                        ) : (
                            <>
                                <h3>❌ Error</h3>
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
