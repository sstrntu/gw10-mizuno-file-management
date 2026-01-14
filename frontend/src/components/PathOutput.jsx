import './PathOutput.css'

function PathOutput({ result }) {
    return (
        <div className="path-output-container">
            <div className="result-header">
                <h2>✓ Path Resolved Successfully</h2>
                <p className="filename-display">{result.filename}</p>
            </div>

            <div className="result-details">
                <div className="detail-card">
                    <h3>📦 Pack</h3>
                    <p className="detail-value">{result.pack.folder}</p>
                    <p className="detail-id">ID: {result.pack.id}</p>
                </div>

                {result.model && (
                    <div className="detail-card">
                        <h3>🏷️ Model</h3>
                        <p className="detail-value">{result.model.folder}</p>
                        <p className="detail-id">Code: {result.model.code}</p>
                    </div>
                )}

                <div className="detail-card">
                    <h3>📋 Rule</h3>
                    <p className="detail-value">{result.rule.description}</p>
                    <p className="detail-id">ID: {result.rule.id}</p>
                </div>
            </div>

            <div className="path-display">
                <h3>📂 Resolved Path</h3>
                <div className="path-tree">
                    <pre>{result.path.tree}</pre>
                </div>
                <div className="path-string">
                    <p className="path-label">Full Path:</p>
                    <code>{result.path.full_path}</code>
                </div>
            </div>
        </div>
    )
}

export default PathOutput
