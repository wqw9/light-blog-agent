import { request } from './client';

export interface AboutData {
  name: string;
  signature: string;
  avatar: string;
  skills: string[];
  timeline: { year: string; event: string }[];
  links: { label: string; url: string }[];
  /** Markdown 正文（自由扩展内容） */
  content?: string;
  /** 服务端渲染好的正文 HTML */
  contentHtml?: string;
}

export function getAbout(): Promise<AboutData> {
  return request<AboutData>('/api/site/about');
}

/** 管理页编辑器读取原文 */
export function getAboutRaw(): Promise<AboutData> {
  return request<AboutData>('/api/site/about/raw');
}

/** 保存自我介绍（写回 config/about.json） */
export function updateAbout(payload: Partial<AboutData>): Promise<AboutData> {
  return request<AboutData>('/api/site/about', { method: 'PUT', body: JSON.stringify(payload) });
}
