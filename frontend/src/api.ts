import type { ApiFailure } from './types';

export class ApiError extends Error {
  readonly code: string;
  readonly reasons: string[];
  readonly status: number;

  constructor(status: number, payload: ApiFailure) {
    super(payload.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload.code;
    this.reasons = payload.reasons ?? [];
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...(init.headers ?? {}) } : init?.headers,
  });
  if (!response.ok) {
    let payload: ApiFailure;
    try {
      payload = await response.json() as ApiFailure;
    } catch {
      payload = { code: 'HTTP_ERROR', message: `Ошибка HTTP ${response.status}`, reasons: [] };
    }
    throw new ApiError(response.status, payload);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

