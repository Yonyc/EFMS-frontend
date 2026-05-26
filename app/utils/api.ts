import { apiUrl } from '../config';

export function resolveUploadUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('/uploads/')) return `${apiUrl}${url}`;
  return url;
}

export interface ApiRequestOptions extends RequestInit {
  requireAuth?: boolean;
  suppressUnauthorizedRedirect?: boolean;
}

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

  // 401 handling is left to the caller — not every 401 should kill the session
  if (response.status === 401 && requireAuth && suppressUnauthorizedRedirect) {
  }

  return response;
}

export async function apiGet(endpoint: string, options: ApiRequestOptions = {}) {
  return apiRequest(endpoint, { ...options, method: 'GET' });
}

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

export async function apiPatch(
  endpoint: string,
  data?: any,
  options: ApiRequestOptions = {}
) {
  return apiRequest(endpoint, {
    ...options,
    method: 'PATCH',
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function apiDelete(endpoint: string, options: ApiRequestOptions = {}) {
  return apiRequest(endpoint, { ...options, method: 'DELETE' });
}

// Spring returns pagination either at root (legacy) or nested under .page (VIA_DTO)
export function getPageMeta(data: any): { totalPages: number; number: number; totalElements: number } {
  const meta = data?.page ?? data;
  return {
    totalPages: meta?.totalPages ?? 0,
    number: meta?.number ?? 0,
    totalElements: meta?.totalElements ?? 0,
  };
}
