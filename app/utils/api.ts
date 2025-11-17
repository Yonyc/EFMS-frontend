import { apiUrl } from '../config';
import { buildLocalizedPath, DEFAULT_LOCALE, getLocaleFromPathname } from './locale';

export interface ApiRequestOptions extends RequestInit {
  requireAuth?: boolean;
}

/**
 * Make an authenticated API request with Bearer token
 */
export async function apiRequest(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<Response> {
  const { requireAuth = true, headers = {}, ...restOptions } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  // Add Bearer token if authentication is required
  if (requireAuth) {
    const token = localStorage.getItem('authToken');
    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  const url = endpoint.startsWith('http') ? endpoint : `${apiUrl}${endpoint}`;

  const response = await fetch(url, {
    ...restOptions,
    headers: requestHeaders,
  });

  // Handle 401 Unauthorized - token expired or invalid
  if (response.status === 401 && requireAuth) {
    // Clear auth data
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    // Redirect to login
    const targetLocale = typeof window !== 'undefined'
      ? getLocaleFromPathname(window.location.pathname || '/')
      : DEFAULT_LOCALE;
    window.location.href = buildLocalizedPath(targetLocale, '/login');
  }

  return response;
}

/**
 * Convenience method for GET requests
 */
export async function apiGet(endpoint: string, options: ApiRequestOptions = {}) {
  return apiRequest(endpoint, { ...options, method: 'GET' });
}

/**
 * Convenience method for POST requests
 */
export async function apiPost(
  endpoint: string,
  data?: any,
  options: ApiRequestOptions = {}
) {
  return apiRequest(endpoint, {
    ...options,
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * Convenience method for PUT requests
 */
export async function apiPut(
  endpoint: string,
  data?: any,
  options: ApiRequestOptions = {}
) {
  return apiRequest(endpoint, {
    ...options,
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * Convenience method for DELETE requests
 */
export async function apiDelete(endpoint: string, options: ApiRequestOptions = {}) {
  return apiRequest(endpoint, { ...options, method: 'DELETE' });
}
