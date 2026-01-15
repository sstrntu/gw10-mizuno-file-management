import { useState } from 'react';
import './AuthStatus.css';

function AuthStatus({ user, onLogout }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogout = async () => {
    try {
      setLoading(true);
      setError(null);
      await onLogout();
    } catch (err) {
      setError(err.message || 'Failed to logout');
      setLoading(false);
    }
  };

  if (!user) {
    return null; // Should not happen in this view given new routing, but safe guard
  }

  const hasGoogleToken = !!user.app_metadata?.provider_token;

  return (
    <div className={`auth-status authenticated`}>
      {error && <span className="auth-error">{error}</span>}

      <span className="status-icon">G</span>
      <span className="status-text">
        {user.email?.split('@')[0] || 'Connected'}
        {hasGoogleToken && <span className="drive-badge">Drive</span>}
      </span>
      <button
        className="btn-logout"
        onClick={handleLogout}
        disabled={loading}
      >
        {loading ? '...' : 'Logout'}
      </button>
    </div>
  );
}

export default AuthStatus;
