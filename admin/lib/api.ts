const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003';
const TOKEN_STORAGE_KEY = 'wowm.adminToken';

export class ApiError extends Error {
  status: number;
  code: string;
  // Present only for POST /v1/admin/packs/:id/build's 422
  // MISSING_REQUIRED_FIELDS response (D-04) — the full per-POI/per-field
  // report the build-failure table renders. Undefined for every other error.
  report?: MissingFieldReportEntry[];

  constructor(status: number, code: string, message: string, report?: MissingFieldReportEntry[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.report = report;
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
    throw new ApiError(
      response.status,
      body.error ?? 'UNKNOWN_ERROR',
      body.error ?? 'API request failed',
      body.report,
    );
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

export interface PoiType {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
}

export interface CreatePoiTypeInput {
  slug: string;
  name: string;
}

export type GeocodeStatus = 'pending' | 'ok' | 'low_confidence' | 'failed';

export interface GeocodeCandidate {
  address: string;
  latitude: number;
  longitude: number;
}

export interface Poi {
  id: string;
  poiTypeId: string;
  name: string;
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
  phone: string | null;
  website: string | null;
  additionalInfo: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodeStatus: GeocodeStatus;
  geocodeConfidence: number | null;
  geocodeCandidates: GeocodeCandidate[] | null;
  customFields: Record<string, unknown>;
  filterValues: Record<string, unknown>;
  status: 'active' | 'flagged' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface CreatePoiInput {
  poiTypeId: string;
  name: string;
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
  phone?: string;
  website?: string;
  additionalInfo?: string;
  customFields?: Record<string, unknown>;
  filterValues?: Record<string, unknown>;
}

export interface CreatePoiResponse extends Poi {
  geocodeErrorCode: string | null;
}

export interface UpdatePoiInput {
  name?: string;
  addressStreet?: string;
  addressCity?: string;
  addressState?: string;
  addressZip?: string;
  phone?: string;
  website?: string;
  additionalInfo?: string;
  customFields?: Record<string, unknown>;
  filterValues?: Record<string, unknown>;
}

export interface CreateFieldInput {
  fieldKey: string;
  label: string;
  dataType: 'text' | 'number' | 'boolean' | 'url' | 'phone' | 'enum';
  enumOptions?: string[];
  isRequired?: boolean;
  sortOrder?: number;
}

export interface UpdateFieldInput {
  label?: string;
  dataType?: 'text' | 'number' | 'boolean' | 'url' | 'phone' | 'enum';
  enumOptions?: string[] | null;
  isRequired?: boolean;
  sortOrder?: number;
}

export interface PackFilterDefinition {
  id: string;
  packId: string;
  filterKey: string;
  label: string;
  filterType: 'boolean' | 'single-select' | 'multi-select';
  options: string[] | null;
  sortOrder: number;
}

export interface CreateFilterInput {
  filterKey: string;
  label: string;
  filterType: 'boolean' | 'single-select' | 'multi-select';
  options?: string[];
  sortOrder?: number;
}

export interface UpdateFilterInput {
  label?: string;
  filterType?: 'boolean' | 'single-select' | 'multi-select';
  options?: string[] | null;
  sortOrder?: number;
}

export interface MissingFieldReportEntry {
  poiId: string;
  poiName: string;
  missingFieldKeys: string[];
}

export interface PackBuildResult {
  version: number;
  poiCount: number;
  checksum: string;
  fileUrl: string;
}

export const packApi = {
  list: () => apiCall<Pack[]>('/v1/admin/packs'),
  create: (input: CreatePackInput) =>
    apiCall<Pack>('/v1/admin/packs', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  get: (id: string) =>
    apiCall<{ pack: Pack; fields: PackFieldDefinition[]; filters: PackFilterDefinition[] }>(
      `/v1/admin/packs/${id}`,
    ),
  addField: (packId: string, input: CreateFieldInput) =>
    apiCall<PackFieldDefinition>(`/v1/admin/packs/${packId}/framework/fields`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  listFields: (packId: string) =>
    apiCall<PackFieldDefinition[]>(`/v1/admin/packs/${packId}/framework/fields`),
  updateField: (packId: string, fieldId: string, input: UpdateFieldInput) =>
    apiCall<PackFieldDefinition>(`/v1/admin/packs/${packId}/framework/fields/${fieldId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  removeField: (packId: string, fieldId: string) =>
    apiCall<void>(`/v1/admin/packs/${packId}/framework/fields/${fieldId}`, {
      method: 'DELETE',
    }),
  listFilters: (packId: string) =>
    apiCall<PackFilterDefinition[]>(`/v1/admin/packs/${packId}/framework/filters`),
  addFilter: (packId: string, input: CreateFilterInput) =>
    apiCall<PackFilterDefinition>(`/v1/admin/packs/${packId}/framework/filters`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateFilter: (packId: string, filterId: string, input: UpdateFilterInput) =>
    apiCall<PackFilterDefinition>(`/v1/admin/packs/${packId}/framework/filters/${filterId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  removeFilter: (packId: string, filterId: string) =>
    apiCall<void>(`/v1/admin/packs/${packId}/framework/filters/${filterId}`, {
      method: 'DELETE',
    }),
  build: (packId: string) =>
    apiCall<PackBuildResult>(`/v1/admin/packs/${packId}/build`, {
      method: 'POST',
    }),
};

export const poiTypeApi = {
  list: () => apiCall<PoiType[]>('/v1/admin/poi-types'),
  create: (input: CreatePoiTypeInput) =>
    apiCall<PoiType>('/v1/admin/poi-types', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

export const poiApi = {
  list: (params: { poiTypeId?: string; status?: Poi['status'] }) => {
    const query = new URLSearchParams();
    if (params.poiTypeId) query.set('poiTypeId', params.poiTypeId);
    if (params.status) query.set('status', params.status);
    const qs = query.toString();
    return apiCall<Poi[]>(`/v1/admin/pois${qs ? `?${qs}` : ''}`);
  },
  create: (input: CreatePoiInput) =>
    apiCall<CreatePoiResponse>('/v1/admin/pois', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  get: (id: string) => apiCall<Poi>(`/v1/admin/pois/${id}`),
  update: (id: string, input: UpdatePoiInput) =>
    apiCall<CreatePoiResponse>(`/v1/admin/pois/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  retryGeocode: (id: string) =>
    apiCall<CreatePoiResponse>(`/v1/admin/pois/${id}/geocode`, {
      method: 'POST',
    }),
  selectCandidate: (id: string, index: number) =>
    apiCall<CreatePoiResponse>(`/v1/admin/pois/${id}/geocode`, {
      method: 'POST',
      body: JSON.stringify({ selectedCandidateIndex: index }),
    }),
};
