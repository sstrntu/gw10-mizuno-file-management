import './ErrorDisplay.css'

function ErrorDisplay({ error, errorType }) {
    const getErrorIcon = (type) => {
        switch (type) {
            case 'PACK_ERROR':
                return '📦'
            case 'RULE_ERROR':
                return '📋'
            case 'CONNECTION_ERROR':
                return '🔌'
            default:
                return '⚠️'
        }
    }

    const getErrorTitle = (type) => {
        switch (type) {
            case 'PACK_ERROR':
                return 'Pack Detection Error'
            case 'RULE_ERROR':
                return 'Rule Matching Error'
            case 'CONNECTION_ERROR':
                return 'Connection Error'
            default:
                return 'Error'
        }
    }

    return (
        <div className="error-display-container">
            <div className="error-header">
                <span className="error-icon">{getErrorIcon(errorType)}</span>
                <h2>{getErrorTitle(errorType)}</h2>
            </div>
            <div className="error-content">
                <p className="error-message">{error}</p>
                <p className="error-type">Error Type: {errorType}</p>
            </div>
        </div>
    )
}

export default ErrorDisplay
