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
  HEALTH: `${API_BASE_URL}/api/health`,
  STRUCTURE: `${API_BASE_URL}/api/structure`,
  RESOLVE: `${API_BASE_URL}/api/resolve`,
  CREATE_DIRECTORIES: `${API_BASE_URL}/api/create-directories`,
};
