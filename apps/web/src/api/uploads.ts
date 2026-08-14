import type { ApiList } from '@myblog/shared';
import { request } from './client';

export interface UploadRecord {
  id: number;
  filename: string;
  storedPath: string;
  mime: string;
  size: number;
  kind: string;
  status: string;
  error: string | null;
  createdAt: string;
  article: { id: number; slug: string; title: string } | null;
}

export function listUploads(params: { page?: number; pageSize?: number } = {}): Promise<ApiList<UploadRecord>> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  const query = qs.toString();
  return request<ApiList<UploadRecord>>(`/api/uploads${query ? `?${query}` : ''}`);
}

export function deleteUpload(id: number): Promise<{ id: number; deleted: boolean }> {
  return request<{ id: number; deleted: boolean }>(`/api/uploads/${id}`, { method: 'DELETE' });
}

export function reparseUpload(id: number): Promise<{
  filename: string;
  ok: boolean;
  article?: { id: number; slug: string; title: string; chapterCount: number };
  error?: string;
}> {
  return request(`/api/uploads/${id}/reparse`, { method: 'POST' });
}
