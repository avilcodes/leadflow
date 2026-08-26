import type { ApiResponse, LeadFilters } from '@/types';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
    ...options,
  };

  const response = await fetch(url, config);

  if (response.status === 401) {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new ApiError(401, 'Session expired. Please log in again.');
  }

  let data: ApiResponse<T>;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(response.status, 'Invalid response from server');
  }

  if (!response.ok) {
    throw new ApiError(response.status, data.error || 'Something went wrong', data);
  }

  return data;
}

// ─── Auth ───

export async function login(email: string, password: string) {
  return fetchApi('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function register(name: string, email: string, password: string) {
  return fetchApi('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
}

export async function logout() {
  return fetchApi('/api/auth/logout', { method: 'POST' });
}

export async function getMe() {
  return fetchApi<{
    id: string;
    email: string;
    name: string | null;
    role: string;
  }>('/api/auth/me');
}

// ─── Leads ───

export async function getLeads(filters?: LeadFilters & { page?: number; pageSize?: number; sortBy?: string; sortOrder?: string }) {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '' && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(v => params.append(key, v));
        } else {
          params.set(key, String(value));
        }
      }
    });
  }
  return fetchApi(`/api/leads?${params.toString()}`);
}

export async function getLead(id: string) {
  return fetchApi(`/api/leads/${id}`);
}

export async function createLead(data: Record<string, unknown>) {
  return fetchApi('/api/leads', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateLead(id: string, data: Record<string, unknown>) {
  return fetchApi(`/api/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteLead(id: string) {
  return fetchApi(`/api/leads/${id}`, { method: 'DELETE' });
}

export async function importLeads(file: File, mappings: Record<string, string>, tags?: string[], source?: string) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mappings', JSON.stringify(mappings));
  if (tags) formData.append('tags', JSON.stringify(tags));
  if (source) formData.append('source', source);

  const response = await fetch('/api/leads/import', {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(response.status, data.error || 'Import failed');
  }

  return response.json();
}

export async function exportLeads(filters?: LeadFilters) {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '' && value !== null) {
        params.set(key, String(value));
      }
    });
  }

  const response = await fetch(`/api/leads/export?${params.toString()}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new ApiError(response.status, 'Export failed');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leads-export-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

// ─── Lead Actions ───

export async function enrichLead(id: string) {
  return fetchApi(`/api/leads/${id}/enrich`, { method: 'POST' });
}

export async function analyzeLead(id: string) {
  return fetchApi(`/api/leads/${id}/analyze`, { method: 'POST' });
}

export async function generateEmail(leadId: string, campaignId?: string) {
  return fetchApi(`/api/leads/${leadId}/generate-email`, {
    method: 'POST',
    body: JSON.stringify({ campaignId }),
  });
}

export async function bulkAction(action: string, leadIds: string[], extra?: Record<string, unknown>) {
  return fetchApi('/api/leads/bulk', {
    method: 'POST',
    body: JSON.stringify({ action, leadIds, ...extra }),
  });
}

// ─── Campaigns ───

export async function getCampaigns(params?: { page?: number; pageSize?: number; status?: string }) {
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.set(key, String(value));
    });
  }
  return fetchApi(`/api/campaigns?${searchParams.toString()}`);
}

export async function getCampaign(id: string) {
  return fetchApi(`/api/campaigns/${id}`);
}

export async function createCampaign(data: Record<string, unknown>) {
  return fetchApi('/api/campaigns', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCampaign(id: string, data: Record<string, unknown>) {
  return fetchApi(`/api/campaigns/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteCampaign(id: string) {
  return fetchApi(`/api/campaigns/${id}`, { method: 'DELETE' });
}

export async function addLeadsToCampaign(campaignId: string, leadIds: string[]) {
  return fetchApi(`/api/campaigns/${campaignId}/leads`, {
    method: 'POST',
    body: JSON.stringify({ leadIds }),
  });
}

export async function removeLeadsFromCampaign(campaignId: string, leadIds: string[]) {
  return fetchApi(`/api/campaigns/${campaignId}/leads`, {
    method: 'DELETE',
    body: JSON.stringify({ leadIds }),
  });
}

export async function generateCampaignEmails(campaignId: string) {
  return fetchApi(`/api/campaigns/${campaignId}/generate-emails`, { method: 'POST' });
}

export async function startCampaign(id: string) {
  return fetchApi(`/api/campaigns/${id}/start`, { method: 'POST' });
}

export async function pauseCampaign(id: string) {
  return fetchApi(`/api/campaigns/${id}/pause`, { method: 'POST' });
}

export async function resumeCampaign(id: string) {
  return fetchApi(`/api/campaigns/${id}/resume`, { method: 'POST' });
}

// ─── Emails ───

export async function getEmail(id: string) {
  return fetchApi(`/api/emails/${id}`);
}

export async function updateEmail(id: string, data: Record<string, unknown>) {
  return fetchApi(`/api/emails/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function sendEmail(id: string) {
  return fetchApi(`/api/emails/${id}/send`, { method: 'POST' });
}

// ─── Dashboard ───

export async function getDashboard() {
  return fetchApi('/api/dashboard');
}

export async function getActivities(params?: {
  page?: number;
  pageSize?: number;
  eventType?: string;
  leadId?: string;
  campaignId?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') searchParams.set(key, String(value));
    });
  }
  return fetchApi(`/api/activities?${searchParams.toString()}`);
}

// ─── Auto Processing ───

export async function getAutoProcessingSettings() {
  return fetchApi<{ enabled: boolean; updatedAt: string | null; updatedBy: string | null }>(
    '/api/settings/auto-processing'
  );
}

export async function updateAutoProcessingSettings(enabled: boolean) {
  return fetchApi('/api/settings/auto-processing', {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  });
}

export async function processLeads(leadIds?: string[]) {
  return fetchApi<{ processedCount: number; failedCount: number; totalLeads: number; message: string }>(
    '/api/leads/process',
    {
      method: 'POST',
      body: JSON.stringify({ leadIds }),
    }
  );
}

// ─── Settings / Credentials ───

export async function getCredentials() {
  return fetchApi('/api/settings/credentials');
}

export async function saveCredential(provider: string, apiKey: string, config?: Record<string, unknown>) {
  return fetchApi(`/api/settings/credentials/${provider}`, {
    method: 'PUT',
    body: JSON.stringify({ provider, apiKey, config }),
  });
}

export async function testCredential(provider: string) {
  return fetchApi(`/api/settings/credentials/${provider}/test`, { method: 'POST' });
}

export { ApiError };
