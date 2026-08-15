import type { ApiList, ArticleDetail, ArticleSummary, ChapterView } from '@myblog/shared';
import { request } from './client';

export interface ListArticlesParams {
  tag?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  /** 默认 PUBLISHED；管理页传 'all' 查看全部（含草稿） */
  status?: string;
}

export function listArticles(params: ListArticlesParams = {}): Promise<ApiList<ArticleSummary>> {
  const qs = new URLSearchParams();
  (Object.keys(params) as (keyof ListArticlesParams)[]).forEach((key) => {
    const value = params[key];
    if (value !== undefined && value !== '') qs.set(key, String(value));
  });
  const query = qs.toString();
  return request<ApiList<ArticleSummary>>(`/api/articles${query ? `?${query}` : ''}`);
}

export function getArticle(slug: string): Promise<ArticleDetail> {
  return request<ArticleDetail>(`/api/articles/${encodeURIComponent(slug)}`);
}

export function getChapter(articleId: number, index: number): Promise<ChapterView> {
  return request<ChapterView>(`/api/articles/${articleId}/chapters/${index}`);
}

/** 阅读计数（失败静默，不影响阅读体验） */
export function reportView(slug: string): Promise<void> {
  return request<void>(`/api/articles/${encodeURIComponent(slug)}/view`, { method: 'POST' }).catch(() => {});
}

/** 阅读时长上报（秒；失败静默） */
export function reportReadTime(articleId: number, seconds: number): Promise<void> {
  return request<void>(`/api/articles/${articleId}/read-report`, {
    method: 'POST',
    body: JSON.stringify({ seconds }),
  }).catch(() => {});
}

export interface UpdateArticlePayload {
  title?: string;
  summary?: string;
  tags?: string[];
  category?: string;
  cover?: string;
  status?: string;
  /** 私密：AI 不可读 */
  private?: boolean;
  contentMarkdown?: string;
}

export function updateArticle(id: number, payload: UpdateArticlePayload): Promise<ArticleDetail> {
  return request<ArticleDetail>(`/api/articles/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export interface ArticleRaw {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  category: string | null;
  cover: string | null;
  tags: string[];
  status: string;
  private: boolean;
  contentMarkdown: string;
}

export function getArticleRaw(id: number): Promise<ArticleRaw> {
  return request<ArticleRaw>(`/api/articles/${id}/raw`);
}

export function deleteArticle(id: number): Promise<{ id: number; deleted: boolean }> {
  return request<{ id: number; deleted: boolean }>(`/api/articles/${id}`, { method: 'DELETE' });
}

/** Ctrl+Z 撤销：回滚最近一次更新，或重建刚删除的文章 */
export function undoArticle(id: number): Promise<ArticleDetail> {
  return request<ArticleDetail>(`/api/articles/${id}/undo`, { method: 'POST' });
}

export interface TagInfo {
  name: string;
  color: string | null;
  count: number;
}

export function listTags(): Promise<TagInfo[]> {
  return request<TagInfo[]>('/api/tags');
}

export function createTag(name: string, color?: string): Promise<TagInfo> {
  return request<TagInfo>('/api/tags', { method: 'POST', body: JSON.stringify({ name, color }) });
}

export function updateTag(name: string, payload: { newName?: string; color?: string }): Promise<TagInfo> {
  return request<TagInfo>(`/api/tags/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteTag(name: string): Promise<{ name: string; deleted: boolean }> {
  return request(`/api/tags/${encodeURIComponent(name)}`, { method: 'DELETE' });
}
