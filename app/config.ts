// Check window global first (injected at runtime), then build-time env, then fallback
export const apiUrl: string =
    (typeof window !== 'undefined' && (window as any).__ENV__?.API_URL) ||
    (typeof process !== 'undefined' && (process as any).env?.API_URL) ||
    'http://localhost:8080';