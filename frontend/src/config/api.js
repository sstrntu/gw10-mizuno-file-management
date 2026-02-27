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
  DRIVE_DELETE_FILE: `${API_BASE_URL}/api/drive/delete-file`,
  DRIVE_LIST_FILES: `${API_BASE_URL}/api/drive/list-files`,
  DRIVE_FILE_COUNTS: `${API_BASE_URL}/api/drive/file-counts`,
  DRIVE_FILES_BY_FOLDERS: `${API_BASE_URL}/api/drive/files-by-folders`,

  // Phase 3 - QC Management
  // Note: QC Matrix uses DRIVE_CHECK_STRUCTURE for directory status
  QC_APPROVE: `${API_BASE_URL}/api/qc/approve`,
  QC_REJECT: `${API_BASE_URL}/api/qc/reject`,
  QC_COMMENT: `${API_BASE_URL}/api/qc/comment`,
  QC_RECORDS: `${API_BASE_URL}/api/qc/records`,
  QC_RECONCILE_LIVE_FILES: `${API_BASE_URL}/api/qc/reconcile-live-files`,
  QC_TODO: `${API_BASE_URL}/api/qc/todo`,
  QC_ACTIONS: `${API_BASE_URL}/api/qc/actions`,

  // Tech Shot — image segmentation & compositing
  TECHSHOT_SEGMENT: `${API_BASE_URL}/api/techshot/segment`,
  TECHSHOT_COMPOSITE: `${API_BASE_URL}/api/techshot/composite`,
  TECHSHOT_NAMING_CONFIG: `${API_BASE_URL}/api/techshot/naming-config`,
};
