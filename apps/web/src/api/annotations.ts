import { request } from './client';

export interface AnnotationView {
  id: number;
  chapterIndex: number;
  quoteText: string;
  note: string;
  author: string | null;
  createdAt: string;
}

/** 文章全部书注（公开可读） */
export function listAnnotations(articleId: number): Promise<AnnotationView[]> {
  return request<AnnotationView[]>(`/api/articles/${articleId}/annotations`);
}

/** 为某句话写书注（公开可写，服务端限流） */
export function createAnnotation(
  articleId: number,
  payload: { quoteText: string; note: string; author?: string; chapterIndex?: number },
): Promise<AnnotationView> {
  return request<AnnotationView>(`/api/articles/${articleId}/annotations`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** 删除书注（仅管理员） */
export function deleteAnnotation(id: number): Promise<{ id: number; deleted: boolean }> {
  return request(`/api/annotations/${id}`, { method: 'DELETE' });
}
