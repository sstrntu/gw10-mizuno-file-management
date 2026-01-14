import { useState } from 'react'
import './FilenameInput.css'

function FilenameInput({ onResolve, loading }) {
    const [filename, setFilename] = useState('')

    const handleSubmit = (e) => {
        e.preventDefault()
        if (filename.trim()) {
            onResolve(filename.trim())
        }
    }

    const exampleFilenames = [
        '26SS_FTW_Bright_Gold_KV_M2J_16x9_Clean.jpg',
        '26SS_FTW_Bright_Gold_KV_N4BJ_16x9.psd',
        '26SS_FTW_Stargazer_T01_A3J.jpg',
        '26SS_FTW_Unity_Sky_S03_N5BJ.png',
        '26SS_FTW_Blazing_Flair_C05.png',
    ]

    const handleExampleClick = (example) => {
        setFilename(example)
    }

    return (
        <div className="filename-input-container">
            <form onSubmit={handleSubmit} className="filename-form">
                <div className="input-group">
                    <input
                        type="text"
                        value={filename}
                        onChange={(e) => setFilename(e.target.value)}
                        placeholder="Enter filename (e.g., 26SS_FTW_Bright_Gold_KV_M2J_16x9.jpg)"
                        className="filename-input"
                        disabled={loading}
                    />
                    <button
                        type="submit"
                        className="resolve-button"
                        disabled={loading || !filename.trim()}
                    >
                        {loading ? 'Resolving...' : 'Resolve Path'}
                    </button>
                </div>
            </form>

            <div className="examples">
                <p className="examples-label">Try an example:</p>
                <div className="examples-grid">
                    {exampleFilenames.map((example, index) => (
                        <button
                            key={index}
                            onClick={() => handleExampleClick(example)}
                            className="example-button"
                            disabled={loading}
                        >
                            {example}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default FilenameInput
