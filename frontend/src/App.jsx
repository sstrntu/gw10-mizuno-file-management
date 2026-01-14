import { useState } from 'react'
import './App.css'
import DirectoryViewer from './components/DirectoryViewer'
import FileUploadTester from './components/FileUploadTester'
import QCMatrix from './components/QCMatrix'

function App() {
  const [activeTab, setActiveTab] = useState('structure')

  const tabs = [
    { id: 'structure', label: 'Directory Structure', icon: '📂' },
    { id: 'upload', label: 'File Upload Test', icon: '📤' },
    { id: 'qc', label: 'QC Matrix', icon: '🔍' },
  ]

  return (
    <div className="app">
      <header className="app-header">
        <h1>File and QC Management</h1>
        <p className="subtitle">Directory Structure & File Upload Management System</p>
      </header>

      <nav className="tab-navigation">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      <main className="app-main">
        {activeTab === 'structure' && <DirectoryViewer />}
        {activeTab === 'upload' && <FileUploadTester />}
        {activeTab === 'qc' && <QCMatrix />}
      </main>

      <footer className="app-footer">
        <p>Mizuno File Management System - Phase 1 Enhanced</p>
      </footer>
    </div>
  )
}

export default App
