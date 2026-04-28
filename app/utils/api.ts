import { apiUrl } from '../config';

export interface ApiRequestOptions extends RequestInit {
  requireAuth?: boolean;
  suppressUnauthorizedRedirect?: boolean;
}

/**
 * Make an authenticated API request with Bearer token
 */
export async function apiRequest(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<Response> {
  const { requireAuth = true, suppressUnauthorizedRedirect = false, headers = {}, body, ...restOptions } = options;

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  const providedHeaders = headers as Record<string, string>;
  const hasContentType = Object.keys(providedHeaders).some(
    (key) => key.toLowerCase() === 'content-type'
  );

  const requestHeaders: Record<string, string> = {
    ...(!isFormData && !hasContentType ? { 'Content-Type': 'application/json' } : {}),
    ...providedHeaders,
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
    body,
    headers: requestHeaders,
  });

  // Do not force a global logout on every 401.
  // Specific flows (e.g. AuthContext refresh) should decide whether to clear session.
  if (response.status === 401 && requireAuth && suppressUnauthorizedRedirect) {
    // Explicitly suppressed; caller will handle unauthorized state.
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
