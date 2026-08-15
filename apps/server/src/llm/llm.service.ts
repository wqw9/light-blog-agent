import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import mammoth from 'mammoth';
import { promises as fsp } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { ArticleService } from '../article/article.service';
import { ConfigService, LlmRuntime } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { scoreChunks, splitIntoChunks, tokenize } from './chunker';
import { withSafety } from './prompts';

// pdf-parse@1.1.1 无类型声明且 ts-node 不拾取 ambient d.ts，这里用 require + 显式类型
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text?: string }>;

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Citation {
  id: number;
  slug: string;
  title: string;
  snippet: string;
}

/** 与 UploadService 相同的文件名乱码修复（避免循环依赖，此处复制） */
function fixFilename(name: string): string {
  if (!/[\u0080-\u00ff]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf-8');
  return decoded.includes('\uFFFD') ? name : decoded;
}

/** Skill 生成器（元 Skill）：按用户需求写出新 Skill 提示词（含"何时使用"小节） */
const SKILL_GENERATOR = [
  '你是 Skill 设计专家。用户想创建一个用于处理文章的 Skill，请根据需求写出一份高质量的 Skill 提示词（纯文本，不含 frontmatter）：',
  '要求：',
  '1. 用第二人称"你是……"开头，明确角色与任务。',
  '2. 列出清晰的执行步骤或规则（编号列表）。',
  '3. 明确输出格式（Markdown / JSON 等）。',
  '4. 在末尾添加「## 何时使用」小节，列出 2~3 个适用场景（什么时候该用这个 Skill、什么输入最合适）。',
  '5. 用中文，150~350 字。',
  '只输出提示词内容，不要任何解释或代码块标记。',
].join('\n');

@Injectable()
export class LlmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly articles: ArticleService,
  ) {}

  // ========== 状态 ==========
  status() {
    const cfg = this.config.getLlmRuntime();
    return {
      enabled: cfg.enabled,
      provider: cfg.provider,
      model: cfg.model,
      configured: Boolean(cfg.apiKey),
    };
  }

  // ========== 用量统计（每日 token 限额 + 花费上限） ==========
  /** token 粗估：CJK 一字一 token，其余 4 字符一 token */
  estimateTokens(text: string): number {
    const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
    const other = text.replace(/[\u4e00-\u9fff\s]/g, '').length;
    return cjk + Math.ceil(other / 4);
  }

  async getUsage(): Promise<{
    todayTokens: number;
    todayCalls: number;
    todayCostUsd: number;
    totalTokens: number;
    totalCostUsd: number;
    dailyTokenLimit: number;
    costLimitUsd: number;
  }> {
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const [row, agg] = await this.prisma.$transaction([
      this.prisma.llmUsage.findUnique({ where: { date: key } }),
      this.prisma.llmUsage.aggregate({ _sum: { tokens: true, costUsd: true } }),
    ]);
    const cfg = this.config.getLlmRuntime();
    return {
      todayTokens: row?.tokens ?? 0,
      todayCalls: row?.calls ?? 0,
      todayCostUsd: row?.costUsd ?? 0,
      totalTokens: agg._sum.tokens ?? 0,
      totalCostUsd: agg._sum.costUsd ?? 0,
      dailyTokenLimit: cfg.dailyTokenLimit,
      costLimitUsd: cfg.costLimitUsd,
    };
  }

  private async assertUsageAllowed(cfg: LlmRuntime): Promise<void> {
    if (cfg.dailyTokenLimit <= 0 && cfg.costLimitUsd <= 0) return;
    const usage = await this.getUsage();
    if (cfg.dailyTokenLimit > 0 && usage.todayTokens >= cfg.dailyTokenLimit) {
      throw new BadRequestException(`今日 Token 额度已用完（${usage.todayTokens}/${cfg.dailyTokenLimit}），可在管理页调整限额`);
    }
    if (cfg.costLimitUsd > 0 && usage.totalCostUsd >= cfg.costLimitUsd) {
      throw new BadRequestException(`累计花费已达上限（$${usage.totalCostUsd.toFixed(4)}/$${cfg.costLimitUsd}），可在管理页调整`);
    }
  }

  private async recordUsage(inText: string, outText: string, cfg: LlmRuntime): Promise<void> {
    const inTokens = this.estimateTokens(inText);
    const outTokens = this.estimateTokens(outText);
    const cost = (inTokens / 1000) * cfg.priceInPer1k + (outTokens / 1000) * cfg.priceOutPer1k;
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await this.prisma.llmUsage.upsert({
      where: { date: key },
      create: { date: key, tokens: inTokens + outTokens, calls: 1, costUsd: cost },
      update: { tokens: { increment: inTokens + outTokens }, calls: { increment: 1 }, costUsd: { increment: cost } },
    });
  }

  private requireReady(): LlmRuntime {
    const cfg = this.config.getLlmRuntime();
    if (!cfg.enabled) throw new BadRequestException('LLM 未启用：在 config/llm.json 设置 enabled=true 并填入 apiKey');
    if (!cfg.apiKey) throw new BadRequestException('LLM 未配置 API Key：在 config/llm.json 填入 apiKey（服务会自动加密存储）');
    if (!cfg.baseUrl || !cfg.model) throw new BadRequestException('LLM 配置不完整：检查 provider/model');
    return cfg;
  }

  // ========== 流式补全（OpenAI 兼容协议） ==========
  async *chatStream(messages: ChatMessage[]): AsyncGenerator<string> {
    const cfg = this.requireReady();
    await this.assertUsageAllowed(cfg);
    const inText = messages.map((m) => m.content).join('\n');
    const url = `${cfg.baseUrl}/chat/completions`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model, messages, stream: true, temperature: 0.6 }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new BadRequestException(`LLM 请求失败 (${resp.status})${text ? `: ${text.slice(0, 300)}` : ''}`);
    }
    const reader = resp.body?.getReader();
    if (!reader) throw new BadRequestException('LLM 响应为空');
    const decoder = new TextDecoder();
    let buffer = '';
    let outText = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') return;
          try {
            const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
            const text = json.choices?.[0]?.delta?.content;
            if (text) {
              outText += text;
              yield text;
            }
          } catch {
            /* 忽略非 JSON 行 */
          }
        }
      }
    } finally {
      await this.recordUsage(inText, outText, cfg).catch(() => {});
    }
  }

  /** 非流式补全（整理任务用）；content 支持字符串或视觉消息数组 */
  private async chatOnce(system: string, user: string | unknown[]): Promise<string> {
    const cfg = this.requireReady();
    await this.assertUsageAllowed(cfg);
    const inText = system + '\n' + JSON.stringify(user);
    const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.3,
        stream: false,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new BadRequestException(`LLM 请求失败 (${resp.status})${text ? `: ${text.slice(0, 300)}` : ''}`);
    }
    const json = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
    const reply = json.choices?.[0]?.message?.content ?? '';
    await this.recordUsage(inText, reply, cfg).catch(() => {});
    return reply;
  }

  /** 测试连接：用当前配置发一条最小请求，返回模型回复 */
  async testConnection(): Promise<{ provider: string; model: string; reply: string }> {
    const cfg = this.requireReady();
    const reply = await this.chatOnce('你是连接测试助手。', '请只回复四个字：连接成功');
    return { provider: cfg.provider, model: cfg.model, reply: reply.slice(0, 120) };
  }

  /** 视觉补全（图片转 Markdown 用 visionModel） */
  private async chatVision(system: string, imageDataUrl: string, mime: string): Promise<string> {
    const cfg = this.requireReady();
    await this.assertUsageAllowed(cfg);
    if (!cfg.visionModel) {
      throw new BadRequestException('当前供应商未配置视觉模型：在管理页 LLM 设置中填写');
    }
    const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.visionModel,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: [
              { type: 'text', text: '请整理这张图片：' },
              { type: 'image_url', image_url: { url: `data:${mime};base64,${imageDataUrl}` } },
            ],
          },
        ],
        temperature: 0.5,
        stream: false,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new BadRequestException(`视觉模型请求失败 (${resp.status})${text ? `: ${text.slice(0, 160)}` : ''}`);
    }
    const json = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
    const reply = json.choices?.[0]?.message?.content ?? '';
    await this.recordUsage(system, reply, cfg).catch(() => {});
    return reply;
  }

  // ========== 知识问答会话（历史记录） ==========
  async saveChatSession(sessionId: number | undefined, messages: ChatMessage[], reply: string, citations: Citation[]): Promise<number> {
    let id = sessionId;
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) throw new BadRequestException('缺少用户消息');

    if (!id) {
      const session = await this.prisma.chatSession.create({
        data: { title: lastUser.content.slice(0, 40) || '新对话' },
      });
      id = session.id;
    }
    await this.prisma.chatMessage.create({
      data: { sessionId: id, role: 'USER', content: lastUser.content },
    });
    await this.prisma.chatMessage.create({
      data: { sessionId: id, role: 'ASSISTANT', content: reply, citations: JSON.stringify(citations) },
    });
    return id;
  }

  async listSessions(limit = 20) {
    const sessions = await this.prisma.chatSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(50, Number(limit) || 20),
      include: { _count: { select: { messages: true } } },
    });
    return sessions.map((s) => ({
      id: s.id,
      title: s.title,
      createdAt: s.createdAt.toISOString(),
      messageCount: s._count.messages,
    }));
  }

  async getSession(sessionId: number) {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!session) throw new NotFoundException(`会话不存在: id=${sessionId}`);
    return {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt.toISOString(),
      messages: session.messages.map((m) => ({
        role: m.role,
        content: m.content,
        citations: m.citations ? (JSON.parse(m.citations) as Citation[]) : [],
      })),
    };
  }

  async deleteSession(sessionId: number): Promise<{ id: number; deleted: boolean }> {
    const existing = await this.prisma.chatSession.findUnique({ where: { id: sessionId }, select: { id: true } });
    if (!existing) throw new NotFoundException(`会话不存在: id=${sessionId}`);
    await this.prisma.chatSession.delete({ where: { id: sessionId } });
    return { id: sessionId, deleted: true };
  }

  // ========== 知识问答（RAG-lite 检索） ==========
  /** @param skillName 可选：使用指定 Skill 提示词（如 book-finder 书籍搜索），默认使用通用问答提示词 */
  async answer(messages: ChatMessage[], skillName?: string): Promise<{ stream: AsyncGenerator<string>; citations: Citation[] }> {
    const question = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const cfg = this.config.getLlmRuntime();

    const queryTokens = tokenize(question);
    const rows = await this.prisma.knowledgeChunk.findMany({
      select: { id: true, articleId: true, content: true },
    });
    const scored = scoreChunks(queryTokens, rows).slice(0, cfg.topK);

    const articleIds = [...new Set(scored.map((s) => s.articleId))];
    const articles = await this.prisma.article.findMany({
      where: { id: { in: articleIds }, status: 'PUBLISHED', private: false },
      select: { id: true, slug: true, title: true },
    });
    const artMap = new Map(articles.map((a) => [a.id, a]));

    const chunks = scored
      .filter((s) => artMap.has(s.articleId))
      .map((s) => ({ content: s.content, article: artMap.get(s.articleId)! }));
    const citations: Citation[] = chunks.map((c, i) => ({
      id: c.article.id,
      slug: c.article.slug,
      title: c.article.title,
      snippet: chunks[i].content.slice(0, 80),
    }));

    // 安全规则最先注入（防套话/防提示词注入）；指定 Skill 时使用该 Skill 的系统提示词
    let systemPrompt = this.config.getPromptFiles().chat;
    if (typeof skillName === 'string' && skillName.trim()) {
      const skill = this.config.readSkill(skillName.trim());
      if (skill?.content) systemPrompt = skill.content;
    }
    const system = withSafety(systemPrompt);
    const context = chunks.length
      ? `以下是可参考的资料：\n\n${chunks
          .map((c, i) => `[资料${i + 1}]（来源：${c.article.title}）\n${c.content}`)
          .join('\n\n')}`
      : '（当前知识库中没有检索到相关资料）';

    const chatMessages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: `${context}\n\n用户问题：${question}` },
    ];
    return { stream: this.chatStream(chatMessages), citations };
  }

  // ========== 书籍整理（摘要/标签/分类/建议问题） ==========
  async organize(articleId: number) {
    this.requireReady();
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      include: { tags: { select: { tag: true } } },
    });
    if (!article) throw new NotFoundException(`文章不存在: id=${articleId}`);

    const text = article.contentMarkdown.slice(0, 12000);
    const reply = await this.chatOnce(
      withSafety(this.config.getPromptFiles().organize),
      `文章标题：${article.title}\n\n正文：\n${text}`,
    );
    const parsed = parseOrganizeJson(reply);

    const tagsRaw: unknown = parsed.tags;
    const tags = Array.isArray(tagsRaw)
      ? tagsRaw.map((t) => String(t).trim()).filter(Boolean).slice(0, 5)
      : [];
    const questionsRaw: unknown = parsed.questions;
    const questions = Array.isArray(questionsRaw)
      ? questionsRaw.map((q) => String(q).trim()).filter(Boolean).slice(0, 3)
      : [];

    const data: Prisma.ArticleUpdateInput = { questionsJson: JSON.stringify(questions) };
    if (typeof parsed.summary === 'string' && parsed.summary.trim()) data.summary = parsed.summary.trim();
    if (typeof parsed.category === 'string' && parsed.category.trim()) {
      data.category = {
        connectOrCreate: { where: { name: parsed.category.trim() }, create: { name: parsed.category.trim() } },
      };
    }

    await this.prisma.article.update({
      where: { id: articleId },
      data: {
        ...data,
        tags: tags.length
          ? { create: tags.map((t) => ({ tag: { connectOrCreate: { where: { name: t }, create: { name: t } } } })) }
          : undefined,
      },
    });

    return { summary: parsed.summary ?? null, tags, category: parsed.category ?? null, questions };
  }

  // ========== Skill：图片转 Markdown 文章（视觉模型读图成文） ==========
  async imageToMarkdown(fileId: number) {
    const file = await this.prisma.uploadFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException(`上传记录不存在: id=${fileId}`);
    if (file.kind !== 'IMAGE') throw new BadRequestException('仅图片支持转换为文章');

    const buffer = await fsp.readFile(join(this.config.uploadsDir, file.storedPath));
    const markdown = await this.chatVision(
      withSafety(this.config.getPromptFiles().image),
      buffer.toString('base64'),
      file.mime || 'image/png',
    );
    if (!markdown.trim()) throw new BadRequestException('视觉模型未返回内容');

    const ext = extname(file.filename).toLowerCase();
    const article = await this.articles.createFromMarkdown({
      contentMd: markdown,
      source: 'UPLOAD',
      fileId: file.id,
      fallbackTitle: basename(fixFilename(file.filename), ext),
    });
    await this.prisma.uploadFile.update({
      where: { id: file.id },
      data: { status: 'PARSED', articleId: article.id },
    });
    return {
      filename: file.filename,
      ok: true,
      article: { id: article.id, slug: article.slug, title: article.title, chapterCount: article.chapters.length },
    };
  }

  // ========== Skill：PDF/DOCX 转 Markdown 文章 ==========
  async docToMarkdown(fileId: number) {
    const file = await this.prisma.uploadFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException(`上传记录不存在: id=${fileId}`);
    if (file.kind !== 'PDF' && file.kind !== 'DOCX') {
      throw new BadRequestException('仅 PDF / DOCX 支持转换为文章');
    }

    const buffer = await fsp.readFile(join(this.config.uploadsDir, file.storedPath));
    let text = '';
    if (file.kind === 'PDF') {
      const parsed = await pdfParse(buffer);
      text = (parsed.text ?? '').trim();
    } else {
      const result = await mammoth.extractRawText({ buffer });
      text = (result.value ?? '').trim();
    }
    if (!text) throw new BadRequestException('未能从文档中提取到文本');

    // 启用 LLM 时用"整理师"提示词把纯文本整理成结构化 Markdown；否则原样发布
    let markdown: string;
    const cfg = this.config.getLlmRuntime();
    if (cfg.enabled && cfg.apiKey) {
      try {
        markdown = await this.chatOnce(
          withSafety('你是文档整理师：把用户提供的纯文本整理成结构清晰的 Markdown 正文（保留原意、适当分节、列出要点），只输出 Markdown。'),
          `文档文本：\n${text.slice(0, 20000)}`,
        );
      } catch {
        markdown = text;
      }
    } else {
      markdown = text;
    }

    const ext = extname(file.filename).toLowerCase();
    const article = await this.articles.createFromMarkdown({
      contentMd: markdown,
      source: 'UPLOAD',
      fileId: file.id,
      fallbackTitle: basename(fixFilename(file.filename), ext),
    });
    await this.prisma.uploadFile.update({
      where: { id: file.id },
      data: { status: 'PARSED', articleId: article.id },
    });
    return {
      filename: file.filename,
      ok: true,
      article: { id: article.id, slug: article.slug, title: article.title, chapterCount: article.chapters.length },
    };
  }

  // ========== Skill：一键生成新 Skill（元 Skill） ==========
  async generateSkill(name: string, description: string): Promise<{ name: string; description: string; content: string }> {
    if (!name.trim()) throw new BadRequestException('Skill 名称不能为空');
    if (!description.trim()) throw new BadRequestException('请描述这个 Skill 的用途');
    const content = await this.chatOnce(withSafety(SKILL_GENERATOR), `Skill 名称：${name.trim()}\n\n用途需求：${description.trim()}`);
    if (!content.trim()) throw new BadRequestException('生成失败：模型未返回内容');
    const safe = await this.config.saveSkill(name, content, description.trim());
    return { name: safe, description: description.trim(), content: content.trim() };
  }

  // ========== Skill：运行（对文章执行，生成处理后的新文章） ==========
  async runSkill(name: string, articleId: number) {
    const skill = this.config.readSkill(name);
    if (!skill) throw new NotFoundException(`Skill 不存在: ${name}`);
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      include: { tags: { select: { tag: true } } },
    });
    if (!article) throw new NotFoundException(`文章不存在: id=${articleId}`);

    const output = await this.chatOnce(
      withSafety(skill.content),
      `文章标题：${article.title}\n\n正文：\n${article.contentMarkdown.slice(0, 16000)}`,
    );
    if (!output.trim()) throw new BadRequestException('Skill 执行失败：模型未返回内容');

    const created = await this.articles.createFromMarkdown({
      contentMd: output,
      title: `${article.title}·${skill.name}`,
      tags: [...article.tags.map((t) => t.tag.name), 'skill'],
      source: 'MANUAL',
    });
    return {
      skill: skill.name,
      article: { id: created.id, slug: created.slug, title: created.title, chapterCount: created.chapters.length },
    };
  }

  // ========== 全量重建检索索引 ==========
  async reindex(): Promise<{ deleted: number; indexed: number; articles: number; skippedPrivate: number }> {
    const deleted = await this.prisma.knowledgeChunk.deleteMany({});
    const articles = await this.prisma.article.findMany({
      select: { id: true, contentMarkdown: true, private: true },
    });
    const cfg = this.config.getLlmRuntime();
    let indexed = 0;
    let skippedPrivate = 0;
    for (const a of articles) {
      if (a.private) {
        skippedPrivate += 1;
        continue; // 私密文章不进入 AI 知识库（AI 无读取权）
      }
      const chunks = splitIntoChunks(a.contentMarkdown, cfg.maxChars);
      if (!chunks.length) continue;
      await this.prisma.knowledgeChunk.createMany({
        data: chunks.map((content, i) => ({ articleId: a.id, chunkIndex: i, content })),
      });
      indexed += chunks.length;
    }
    return { deleted: deleted.count, indexed, articles: articles.length, skippedPrivate };
  }
}

/** 容忍 ```json 代码块包裹的 JSON 回复 */
function parseOrganizeJson(reply: string): Record<string, unknown> {
  let text = reply.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}
