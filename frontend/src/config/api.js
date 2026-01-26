// API Configuration - works in both development and Docker

const getApiBaseUrl = () => {
  // In production (Docker), use relative URL - nginx will proxy to backend
  if (import.meta.env.PROD) {
    return '';
  }

  // In development, use explicit localhost URL
  return 'http://localhost:5001';
};

export const API_BASE_URL = getApiBaseUrl();

export const API_ENDPOINTS = {
  // Health check
  HEALTH: `${API_BASE_URL}/api/health`,

  // Phase 1 - Resolution
  STRUCTURE: `${API_BASE_URL}/api/structure`,
  RESOLVE: `${API_BASE_URL}/api/resolve`,
  CREATE_DIRECTORIES: `${API_BASE_URL}/api/create-directories`,

  // Phase 2 - Authentication
  AUTH_LOGIN: `${API_BASE_URL}/api/auth/login`,
  AUTH_LOGOUT: `${API_BASE_URL}/api/auth/logout`,
  AUTH_STATUS: `${API_BASE_URL}/api/auth/status`,

  // Phase 2 - Google Drive
  DRIVE_STRUCTURE: `${API_BASE_URL}/api/drive/structure`,
  DRIVE_CHECK_STRUCTURE: `${API_BASE_URL}/api/drive/check-structure`,
  DRIVE_CREATE_DIRECTORIES: `${API_BASE_URL}/api/drive/create-directories`,
  DRIVE_RESET_STRUCTURE: `${API_BASE_URL}/api/drive/reset-structure`,
  DRIVE_UPLOAD: `${API_BASE_URL}/api/drive/upload`,
  DRIVE_LIST_FILES: `${API_BASE_URL}/api/drive/list-files`,

  // Phase 3 - QC Management
  QC_FILES: `${API_BASE_URL}/api/qc/files`,
  QC_APPROVE: `${API_BASE_URL}/api/qc/approve`,
  QC_REJECT: `${API_BASE_URL}/api/qc/reject`,
  QC_ACTIONS: `${API_BASE_URL}/api/qc/actions`,
};
