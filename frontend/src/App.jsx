import { useState } from 'react'
import './App.css'
import DirectoryViewer from './components/DirectoryViewer'
import FileUploadTester from './components/FileUploadTester'
import QCMatrix from './components/QCMatrix'
import ConfigViewer from './components/ConfigViewer'
import AuthStatus from './components/AuthStatus'
import LoginPage from './components/LoginPage'
import { useAuth } from './hooks/useAuth'

function App() {
  const { user, session, loading, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState('upload')
  const [showConfig, setShowConfig] = useState(false)

  // Loading state
  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner">Loading...</div>
      </div>
    )
  }

  // Not authenticated -> Show Login Page
  if (!user) {
    return <LoginPage />
  }

  // Authenticated -> Show Main App
  const tabs = [
    { id: 'upload', label: 'File Upload', icon: '+' },
    { id: 'qc', label: 'QC Matrix', icon: '#' },
    { id: 'structure', label: 'Directory Structure', icon: '>' },
  ]

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div>
            <h1>File and QC Management</h1>
            <p className="subtitle">Directory Structure & File Upload Management System</p>
          </div>
          <div className="header-actions">
            <AuthStatus user={user} onLogout={signOut} />
            <button
              className="btn-view-config"
              onClick={() => setShowConfig(true)}
              title="View Configuration Files"
            >
              View Config
            </button>
          </div>
        </div>
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
        {activeTab === 'structure' && <DirectoryViewer session={session} />}
        {activeTab === 'upload' && <FileUploadTester session={session} />}
        {activeTab === 'qc' && <QCMatrix />}
      </main>

      {/* Config Modal */}
      {showConfig && <ConfigViewer onClose={() => setShowConfig(false)} />}


      <footer className="app-footer">
        <p>Mizuno File Management System - Phase 2 (Supabase + Google Drive)</p>
      </footer>
    </div>
  )
}

export default App
