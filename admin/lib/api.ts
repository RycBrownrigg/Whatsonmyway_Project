const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003';
const TOKEN_STORAGE_KEY = 'wowm.adminToken';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function setAdminToken(token: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function clearAdminToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAdminToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.error ?? 'UNKNOWN_ERROR', body.error ?? 'API request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export interface Pack {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  packType: 'standard' | 'state';
  poiTypeId: string | null;
  stateCode: string | null;
  appleProductId: string;
  priceTier: string | null;
  status: 'draft' | 'published' | 'deprecated';
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface PackFieldDefinition {
  id: string;
  packId: string;
  fieldKey: string;
  label: string;
  dataType: 'text' | 'number' | 'boolean' | 'url' | 'phone' | 'enum';
  enumOptions: string[] | null;
  isRequired: boolean;
  sortOrder: number;
}

export interface CreatePackInput {
  name: string;
  slug: string;
  description?: string;
  packType: 'standard' | 'state';
  poiTypeId?: string;
  stateCode?: string;
  appleProductId: string;
  priceTier?: string;
}

export interface CreateFieldInput {
  fieldKey: string;
  label: string;
  dataType: 'text' | 'number' | 'boolean' | 'url' | 'phone' | 'enum';
  enumOptions?: string[];
  isRequired?: boolean;
  sortOrder?: number;
}

export const packApi = {
  list: () => apiCall<Pack[]>('/v1/admin/packs'),
  create: (input: CreatePackInput) =>
    apiCall<Pack>('/v1/admin/packs', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  get: (id: string) =>
    apiCall<{ pack: Pack; fields: PackFieldDefinition[] }>(`/v1/admin/packs/${id}`),
  addField: (packId: string, input: CreateFieldInput) =>
    apiCall<PackFieldDefinition>(`/v1/admin/packs/${packId}/framework/fields`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
