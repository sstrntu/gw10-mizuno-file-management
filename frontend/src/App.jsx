import { useState } from 'react'
import './App.css'
import DirectoryViewer from './components/DirectoryViewer'
import FileUploadTester from './components/FileUploadTester'
import QCMatrix from './components/QCMatrix'
import TechShot from './components/TechShot'
import ConfigViewer from './components/ConfigViewer'
import AuthStatus from './components/AuthStatus'
import LoginPage from './components/LoginPage'
import { useAuth } from './hooks/useAuth'

const DEFAULT_ROOT_ID = '1cKccx5IF91I6kZrqBdSx8MPNirXAf2c5'

function App() {
  const { user, session, loading, signOut, isGoogleConnected } = useAuth()
  const [activeTab, setActiveTab] = useState('upload')
  const [showConfig, setShowConfig] = useState(false)
  const [rootFolderId, setRootFolderIdState] = useState(
    () => localStorage.getItem('mizuno_root_folder_id') || DEFAULT_ROOT_ID
  )
  const [folderIdDraft, setFolderIdDraft] = useState(
    () => localStorage.getItem('mizuno_root_folder_id') || DEFAULT_ROOT_ID
  )

  const applyRootFolderId = (id) => {
    const trimmed = (id || '').trim() || DEFAULT_ROOT_ID
    localStorage.setItem('mizuno_root_folder_id', trimmed)
    setRootFolderIdState(trimmed)
    setFolderIdDraft(trimmed)
  }

  // Passed to DirectoryViewer so changes there sync back to the global state
  const setRootFolderIdGlobal = (id) => {
    localStorage.setItem('mizuno_root_folder_id', id)
    setRootFolderIdState(id)
    setFolderIdDraft(id)
  }

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

  // Session exists but Google token missing/expired -> reconnect
  if (!isGoogleConnected) {
    return <LoginPage isReconnect email={user.email} />
  }

  // Authenticated -> Show Main App
  const tabs = [
    { id: 'upload', label: 'File Upload', icon: '+' },
    { id: 'qc', label: 'QC Matrix', icon: '#' },
    { id: 'structure', label: 'Directory Structure', icon: '>' },
    { id: 'techshot', label: 'Tech Shot', icon: '◈' },
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
            <AuthStatus user={user} hasGoogleToken={isGoogleConnected} onLogout={signOut} />
            <button
              className="btn-view-config"
              onClick={() => setShowConfig(true)}
              title="View Configuration Files"
            >
              View Config
            </button>
          </div>
        </div>
        <div className="header-folder-bar">
          <span className="folder-bar-label">Root Folder ID</span>
          <input
            className="folder-bar-input"
            type="text"
            value={folderIdDraft}
            onChange={e => setFolderIdDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyRootFolderId(folderIdDraft)}
            spellCheck={false}
            placeholder="Google Drive Root Folder ID"
          />
          <button
            className={`folder-bar-btn${folderIdDraft.trim() === rootFolderId ? ' saved' : ''}`}
            onClick={() => applyRootFolderId(folderIdDraft)}
          >
            {folderIdDraft.trim() === rootFolderId ? '✓ Saved' : 'Apply'}
          </button>
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
        {activeTab === 'structure' && <DirectoryViewer session={session} rootFolderId={rootFolderId} setRootFolderId={setRootFolderIdGlobal} />}
        {activeTab === 'upload' && <FileUploadTester session={session} rootFolderId={rootFolderId} />}
        {activeTab === 'qc' && <QCMatrix session={session} user={user} rootFolderId={rootFolderId} />}
        {activeTab === 'techshot' && <TechShot session={session} />}
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
