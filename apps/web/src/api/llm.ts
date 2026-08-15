import { request } from './client';

export interface LlmStatus {
  enabled: boolean;
  provider: string;
  model: string;
  configured: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Citation {
  id: number;
  slug: string;
  title: string;
  snippet: string;
}

export interface ChatEvent {
  text?: string;
  done?: boolean;
  citations?: Citation[];
  sessionId?: number;
  error?: string;
}

export function llmStatus(): Promise<LlmStatus> {
  return request<LlmStatus>('/api/llm/status');
}

export interface LlmProviderView {
  name: string;
  baseUrl: string;
  model: string;
  visionModel: string;
  priceInPer1k: number;
  priceOutPer1k: number;
  apiKeyConfigured: boolean;
}

export interface LlmConfigView {
  enabled: boolean;
  activeProvider: string;
  dailyTokenLimit: number;
  costLimitUsd: number;
  providers: LlmProviderView[];
}

export function getLlmConfig(): Promise<LlmConfigView> {
  return request<LlmConfigView>('/api/llm/config');
}

/** 保存 LLM 配置（多供应商）；apiKey 非空时立即加密存储 */
export function saveLlmConfig(payload: {
  enabled: boolean;
  activeProvider: string;
  dailyTokenLimit?: number;
  costLimitUsd?: number;
  providers?: {
    name: string;
    baseUrl: string;
    model: string;
    visionModel?: string;
    priceInPer1k?: number;
    priceOutPer1k?: number;
    apiKey?: string;
  }[];
}): Promise<LlmConfigView> {
  return request<LlmConfigView>('/api/llm/config', { method: 'PUT', body: JSON.stringify(payload) });
}

/** 测试连接：用当前配置发一条最小请求 */
export function testLlm(): Promise<{ ok: boolean; provider: string; model: string; reply: string }> {
  return request('/api/llm/test', { method: 'POST' });
}

/** 书籍整理：AI 生成摘要/标签/分类/建议问题 */
export function organizeArticle(id: number): Promise<{
  summary: string | null;
  tags: string[];
  category: string | null;
  questions: string[];
}> {
  return request(`/api/llm/organize/${id}`, { method: 'POST' });
}

export interface LlmUsage {
  todayTokens: number;
  todayCalls: number;
  todayCostUsd: number;
  totalTokens: number;
  totalCostUsd: number;
  dailyTokenLimit: number;
  costLimitUsd: number;
}

export function getUsage(): Promise<LlmUsage> {
  return request<LlmUsage>('/api/llm/usage');
}

// ========== 问答历史记录 ==========
export interface ChatSessionMeta {
  id: number;
  title: string;
  createdAt: string;
  messageCount: number;
}

export interface ChatSessionDetail {
  id: number;
  title: string;
  createdAt: string;
  messages: { role: string; content: string; citations: Citation[] }[];
}

export function listSessions(): Promise<ChatSessionMeta[]> {
  return request<ChatSessionMeta[]>('/api/chat/sessions');
}

export function getSession(id: number): Promise<ChatSessionDetail> {
  return request<ChatSessionDetail>(`/api/chat/sessions/${id}`);
}

export function deleteSession(id: number): Promise<{ id: number; deleted: boolean }> {
  return request(`/api/chat/sessions/${id}`, { method: 'DELETE' });
}

/** 小人配置（开关 / 回答气泡 / 隐藏自带蓝色气泡） */
export interface MascotConfig {
  enabled: boolean;
  showChatReply?: boolean;
  hideBuiltinTips?: boolean;
}

export function getMascotConfig(): Promise<MascotConfig> {
  return request<MascotConfig>('/api/site/mascot');
}

export function saveMascotConfig(payload: {
  enabled?: boolean;
  showChatReply?: boolean;
  hideBuiltinTips?: boolean;
}): Promise<MascotConfig> {
  return request<MascotConfig>('/api/site/mascot', { method: 'PUT', body: JSON.stringify(payload) });
}

/**
 * 流式问答（SSE via fetch）：逐段回调，结束返回引用列表与会话 id。
 */
export async function chatStream(
  messages: ChatMessage[],
  onText: (text: string) => void,
  sessionId?: number,
  skill?: string,
): Promise<{ citations: Citation[]; sessionId: number }> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, sessionId, skill }),
  });
  if (!res.ok) {
    let message = `请求失败 (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body?.message) message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('响应为空');
  const decoder = new TextDecoder();
  let buffer = '';
  let citations: Citation[] = [];
  let sid = sessionId ?? 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue;
        try {
          const event = JSON.parse(line.slice(5).trim()) as ChatEvent;
          if (event.text) onText(event.text);
          if (event.error) throw new Error(event.error);
          if (event.done) {
            if (event.citations) citations = event.citations;
            if (event.sessionId) sid = event.sessionId;
          }
        } catch (err) {
          if (err instanceof Error && err.message && !err.message.startsWith('Unexpected')) throw err;
        }
      }
    }
  }
  return { citations, sessionId: sid };
}

/** Skill：图片转 Markdown 文章（视觉模型读图成文） */
export function imageToMd(fileId: number): Promise<{
  filename: string;
  ok: boolean;
  article?: { id: number; slug: string; title: string; chapterCount: number };
}> {
  return request(`/api/llm/image-to-md/${fileId}`, { method: 'POST' });
}

/** Skill：PDF/DOCX 转 Markdown 文章 */
export function docToMd(fileId: number): Promise<{
  filename: string;
  ok: boolean;
  article?: { id: number; slug: string; title: string; chapterCount: number };
}> {
  return request(`/api/llm/doc-to-md/${fileId}`, { method: 'POST' });
}

/** Skill 提示词文件（config/prompts/*.md，管理页维护） */
export function getPrompts(): Promise<{ chat: string; organize: string; image: string }> {
  return request<{ chat: string; organize: string; image: string }>('/api/llm/prompts');
}

export function savePrompts(payload: { chat?: string; organize?: string; image?: string }): Promise<{ chat: string; organize: string; image: string }> {
  return request('/api/llm/prompts', { method: 'PUT', body: JSON.stringify(payload) });
}

// ========== Skill 库 ==========
export interface SkillInfo {
  name: string;
  description: string;
  content: string;
  builtin: boolean;
}

export function listSkills(): Promise<SkillInfo[]> {
  return request<SkillInfo[]>('/api/llm/skills');
}

export function saveSkill(name: string, content: string, description?: string): Promise<SkillInfo> {
  return request<SkillInfo>(`/api/llm/skills/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify({ content, description }),
  });
}

export function deleteSkill(name: string): Promise<{ name: string; deleted: boolean }> {
  return request(`/api/llm/skills/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

/** 元 Skill：按描述一键生成新 Skill */
export function generateSkill(name: string, description: string): Promise<SkillInfo> {
  return request<SkillInfo>('/api/llm/skills/generate', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
}

/** 对文章运行 Skill，生成处理后的新文章 */
export function runSkill(name: string, articleId: number): Promise<{
  skill: string;
  article: { id: number; slug: string; title: string; chapterCount: number };
}> {
  return request(`/api/llm/skills/${encodeURIComponent(name)}/run`, {
    method: 'POST',
    body: JSON.stringify({ articleId }),
  });
}
