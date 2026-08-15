import { Injectable } from '@nestjs/common';
import { parseFrontmatter } from '@myblog/markdown';
import { readFileSync, writeFileSync, readdirSync, existsSync, promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { findRepoRoot } from '../common/root';
import { hashPassword } from '../auth/password';
import { decryptSecret, encryptSecret } from '../auth/encryption';
import type { SiteConfig } from '@myblog/shared';

/** 内置核心 Skill：可编辑但不可删除 */
export const BUILTIN_SKILLS = ['chat-assistant', 'book-organizer', 'image-organizer', 'book-finder'];

/** 单个 LLM 供应商配置 */
export interface LlmProviderEntry {
  baseUrl: string;
  model: string;
  visionModel?: string;
  priceInPer1k?: number;
  priceOutPer1k?: number;
  apiKey?: string;
  apiKeyEnc?: string;
}

/** config/llm.json 结构（多供应商） */
export interface LlmConfig {
  enabled: boolean;
  activeProvider: string;
  dailyTokenLimit?: number;
  costLimitUsd?: number;
  providers: Record<string, LlmProviderEntry>;
  retrieval: { topK: number };
  chunking: { maxChars: number };
}

/** LLM 运行时配置（apiKey 已解密） */
export interface LlmRuntime {
  enabled: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  visionModel: string;
  priceInPer1k: number;
  priceOutPer1k: number;
  dailyTokenLimit: number;
  costLimitUsd: number;
  topK: number;
  maxChars: number;
}

/** 常见供应商默认价格（美元 / 1K token，可改） */
const DEFAULT_PRICES: Record<string, { priceInPer1k: number; priceOutPer1k: number; visionModel?: string }> = {
  deepseek: { priceInPer1k: 0.00027, priceOutPer1k: 0.0011 },
  qwen: { priceInPer1k: 0.00011, priceOutPer1k: 0.00041, visionModel: 'qwen-vl-plus' },
  kimi: { priceInPer1k: 0.0033, priceOutPer1k: 0.0033, visionModel: 'moonshot-v1-8k-vision-preview' },
  openai: { priceInPer1k: 0.00015, priceOutPer1k: 0.0006, visionModel: 'gpt-4o-mini' },
  glm: { priceInPer1k: 0.000014, priceOutPer1k: 0.000014, visionModel: 'glm-4v' },
};

/**
 * 将数字形式的主机名规范化为点分十进制 IPv4：
 * 拦截 2130706433（十进制整数）、0x7f000001（十六进制）、0177.0.0.1（八进制）等
 * 会被底层解析成 IP 的记法绕过；域名返回 null。
 */
function canonicalIpv4(host: string): string | null {
  let n: number | null = null;
  if (/^\d+$/.test(host)) n = Number(host);
  else if (/^0x[0-9a-f]+$/i.test(host)) n = parseInt(host, 16);
  else if (/^0[0-7]+$/.test(host)) n = parseInt(host, 8);
  if (n !== null) {
    if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) return null;
    return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }
  const parts = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!parts) return null;
  const nums = parts.slice(1).map(Number);
  return nums.every((x) => x >= 0 && x <= 255) ? nums.join('.') : null;
}

/**
 * LLM baseUrl 安全校验（防 SSRF / API Key 外泄）：
 * - 仅允许 http/https
 * - http 明文仅允许本机回环地址（localhost/127.0.0.0/8/::1，自托管模型场景）
 * - 数字 IP 记法先规范化再判断（防 2130706433/0x7f000001/127.1 等绕过）
 * - 远程服务一律要求 https（防止密钥随明文请求泄露给中间网络）
 */
function assertSafeBaseUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return '';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`baseUrl 无效: ${url}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('baseUrl 仅支持 http/https 协议');
  }
  if (parsed.protocol === 'http:') {
    const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const canonical = canonicalIpv4(host);
    if (canonical !== null) {
      // 数字形式主机名：仅放行规范后的 127.0.0.0/8 回环段
      if (!canonical.startsWith('127.')) {
        throw new Error('http 明文 baseUrl 仅允许本机回环地址（127.0.0.0/8），远程服务请使用 https');
      }
    } else if (host !== 'localhost' && host !== '::1') {
      throw new Error('http 明文 baseUrl 仅允许本机地址（localhost/127.0.0.1），远程服务请使用 https');
    }
  }
  return url.replace(/\/+$/, '');
}

/** 数据即配置：config/*.json 是站点、自我介绍、LLM 的唯一数据源 */
@Injectable()
export class ConfigService {
  readonly repoRoot: string;
  readonly site: SiteConfig;
  /** 自我介绍：内存缓存供 fallback；读取请用 getAboutData()（实时读文件） */
  about: Record<string, unknown>;
  readonly llm: LlmConfig;
  /** 小人配置：保存后同步内存；读取请用 getMascotData()（实时读文件） */
  mascot: Record<string, unknown>;

  constructor() {
    this.repoRoot = findRepoRoot();
    this.site = this.loadJson('config/site.json') as SiteConfig;
    this.about = this.loadJson('config/about.json') as Record<string, unknown>;
    this.llm = this.loadLlmConfig(); // llm.json 可能不存在（不入库），缺失时用安全的默认结构
    this.mascot = this.loadJson('config/mascot.json') as Record<string, unknown>;
    // 敏感数据自动加密：明文口令/API Key 在启动时一次性转为哈希/密文写回
    this.autoEncryptAdminPassword();
    this.migrateLlmConfig();
    this.autoEncryptLlmApiKeys();
  }

  /** 读取 LLM 配置：文件缺失（从未配置过）时返回安全默认结构（禁用、无密钥） */
  private loadLlmConfig(): LlmConfig {
    try {
      return this.loadJson('config/llm.json') as LlmConfig;
    } catch {
      return {
        enabled: false,
        activeProvider: 'deepseek',
        providers: {},
        retrieval: { topK: 6 },
        chunking: { maxChars: 1200 },
      };
    }
  }

  get uploadsDir(): string {
    return join(this.repoRoot, 'uploads');
  }

  get dataDir(): string {
    return join(this.repoRoot, 'data');
  }

  /**
   * 管理口令凭据：环境变量 MYBLOG_ADMIN_PASSWORD 优先（验证/CI 注入测试口令，
   * 不触碰配置文件），其次读取 config/admin.json（password 明文 或 hash scrypt 哈希）。
   * 每次请求实时读取，改配置无需重启。
   */
  get adminCredential(): { password?: string; hash?: string } {
    const env = process.env.MYBLOG_ADMIN_PASSWORD;
    if (env !== undefined) return { password: env.trim() };
    try {
      const raw = JSON.parse(readFileSync(join(this.repoRoot, 'config', 'admin.json'), 'utf-8')) as {
        password?: string;
        hash?: string;
      };
      return {
        password: typeof raw.password === 'string' ? raw.password.trim() : '',
        hash: typeof raw.hash === 'string' ? raw.hash.trim() : '',
      };
    } catch {
      return {}; // 文件缺失或损坏 → 开放模式
    }
  }

  private loadJson(rel: string): unknown {
    return JSON.parse(readFileSync(join(this.repoRoot, rel), 'utf-8'));
  }

  /** 自动加密：明文管理口令 → scrypt 哈希写回（一次性迁移，之后只存哈希） */
  private autoEncryptAdminPassword(): void {
    const path = join(this.repoRoot, 'config', 'admin.json');
    try {
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as { password?: string; hash?: string };
      if (typeof raw.password === 'string' && raw.password.trim() && !raw.hash) {
        raw.hash = hashPassword(raw.password.trim());
        delete raw.password;
        writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`, 'utf-8');
        console.log('[myblog] 管理口令已自动转换为 scrypt 哈希存储');
      }
    } catch {
      /* 文件缺失/损坏时跳过 */
    }
  }

  /** 旧结构迁移：presets/provider/apiKeyEnc → providers 多供应商结构（一次性） */
  private migrateLlmConfig(): void {
    const path = join(this.repoRoot, 'config', 'llm.json');
    try {
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
      if (typeof raw.providers === 'object' && raw.providers !== null) return; // 已是新结构
      const presets = (raw.presets ?? {}) as Record<string, { baseUrl: string; model: string }>;
      const active = typeof raw.provider === 'string' ? raw.provider : 'deepseek';
      const providers: Record<string, LlmProviderEntry> = {};
      for (const [name, p] of Object.entries(presets)) {
        const price = DEFAULT_PRICES[name];
        providers[name] = {
          baseUrl: p.baseUrl ?? '',
          model: p.model ?? '',
          visionModel: name === active && typeof raw.visionModel === 'string' ? raw.visionModel : (price?.visionModel ?? ''),
          priceInPer1k: price?.priceInPer1k ?? 0,
          priceOutPer1k: price?.priceOutPer1k ?? 0,
        };
      }
      if (typeof raw.apiKeyEnc === 'string' && raw.apiKeyEnc) providers[active].apiKeyEnc = raw.apiKeyEnc;
      const migrated: Record<string, unknown> = {
        enabled: raw.enabled === true,
        activeProvider: active,
        dailyTokenLimit: 0,
        costLimitUsd: 0,
        providers,
        retrieval: raw.retrieval ?? { topK: 6 },
        chunking: raw.chunking ?? { maxChars: 1200 },
      };
      writeFileSync(path, `${JSON.stringify(migrated, null, 2)}\n`, 'utf-8');
      console.log('[myblog] LLM 配置已迁移为多供应商结构');
    } catch {
      /* 忽略 */
    }
  }

  /** 自动加密：各供应商明文 apiKey → AES-256-GCM 密文写回 */
  private autoEncryptLlmApiKeys(): void {
    const path = join(this.repoRoot, 'config', 'llm.json');
    try {
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as LlmConfig;
      let changed = false;
      for (const entry of Object.values(raw.providers ?? {})) {
        if (typeof entry.apiKey === 'string' && entry.apiKey.trim() && !entry.apiKeyEnc) {
          entry.apiKeyEnc = encryptSecret(entry.apiKey.trim(), this.dataDir);
          delete entry.apiKey;
          changed = true;
        }
      }
      if (changed) {
        writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`, 'utf-8');
        console.log('[myblog] LLM API Key 已自动加密存储（data/secret.key）');
      }
    } catch {
      /* 忽略 */
    }
  }

  /** 实时读取 LLM 配置并解密当前供应商 apiKey（改文件即更新，无需重启） */
  getLlmRuntime(): LlmRuntime {
    const fallback: LlmRuntime = {
      enabled: false,
      provider: 'deepseek',
      baseUrl: '',
      model: '',
      apiKey: '',
      visionModel: '',
      priceInPer1k: 0,
      priceOutPer1k: 0,
      dailyTokenLimit: 0,
      costLimitUsd: 0,
      topK: 6,
      maxChars: 1200,
    };
    try {
      const raw = this.loadJson('config/llm.json') as LlmConfig;
      const active = raw.activeProvider ?? 'deepseek';
      const entry = raw.providers?.[active];
      if (!entry) return fallback;
      let apiKey = typeof entry.apiKey === 'string' ? entry.apiKey.trim() : '';
      if (!apiKey && typeof entry.apiKeyEnc === 'string' && entry.apiKeyEnc) {
        apiKey = decryptSecret(entry.apiKeyEnc, this.dataDir);
      }
      return {
        enabled: raw.enabled === true,
        provider: active,
        baseUrl: (entry.baseUrl ?? '').replace(/\/+$/, ''),
        model: entry.model ?? '',
        apiKey,
        visionModel: typeof entry.visionModel === 'string' ? entry.visionModel.trim() : '',
        priceInPer1k: Number(entry.priceInPer1k) || 0,
        priceOutPer1k: Number(entry.priceOutPer1k) || 0,
        dailyTokenLimit: Number(raw.dailyTokenLimit) || 0,
        costLimitUsd: Number(raw.costLimitUsd) || 0,
        topK: Number(raw.retrieval?.topK) || 6,
        maxChars: Number(raw.chunking?.maxChars) || 1200,
      };
    } catch {
      return fallback;
    }
  }

  /** 管理页视图：LLM 配置（密钥脱敏） */
  getLlmView(): Record<string, unknown> {
    const runtime = this.getLlmRuntime();
    let providers: { name: string; baseUrl: string; model: string; visionModel: string; priceInPer1k: number; priceOutPer1k: number; apiKeyConfigured: boolean }[] = [];
    try {
      const file = this.loadJson('config/llm.json') as LlmConfig;
      providers = Object.entries(file.providers ?? {}).map(([name, v]) => ({
        name,
        baseUrl: v.baseUrl ?? '',
        model: v.model ?? '',
        visionModel: typeof v.visionModel === 'string' ? v.visionModel : '',
        priceInPer1k: Number(v.priceInPer1k) || 0,
        priceOutPer1k: Number(v.priceOutPer1k) || 0,
        apiKeyConfigured: Boolean(v.apiKeyEnc || v.apiKey),
      }));
    } catch {
      /* ignore */
    }
    return {
      enabled: runtime.enabled,
      activeProvider: runtime.provider,
      dailyTokenLimit: runtime.dailyTokenLimit,
      costLimitUsd: runtime.costLimitUsd,
      providers,
    };
  }

  /** 保存 LLM 配置：多供应商；apiKey 非空时立即加密存储，留空表示不修改 */
  async saveLlmConfig(input: {
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
  }): Promise<void> {
    const path = join(this.repoRoot, 'config', 'llm.json');
    // 文件缺失（从未配置过）时从安全的默认结构开始
    let raw: Record<string, unknown>;
    try {
      raw = this.loadJson('config/llm.json') as Record<string, unknown>;
    } catch {
      raw = { enabled: false, activeProvider: 'deepseek', providers: {}, retrieval: { topK: 6 }, chunking: { maxChars: 1200 } };
    }
    const current = (raw.providers ?? {}) as Record<string, LlmProviderEntry>;

    raw.enabled = input.enabled === true;
    if (input.activeProvider) raw.activeProvider = input.activeProvider;
    if (typeof input.dailyTokenLimit === 'number' && input.dailyTokenLimit >= 0) raw.dailyTokenLimit = Math.round(input.dailyTokenLimit);
    if (typeof input.costLimitUsd === 'number' && input.costLimitUsd >= 0) raw.costLimitUsd = input.costLimitUsd;

    if (Array.isArray(input.providers)) {
      const next: Record<string, LlmProviderEntry> = {};
      for (const p of input.providers) {
        const name = p.name.trim();
        if (!name) continue;
        const prev = current[name] ?? {};
        const entry: LlmProviderEntry = {
          baseUrl: assertSafeBaseUrl((p.baseUrl ?? prev.baseUrl ?? '').trim()),
          model: (p.model ?? prev.model ?? '').trim(),
          visionModel: (p.visionModel ?? prev.visionModel ?? '').trim(),
          priceInPer1k: typeof p.priceInPer1k === 'number' ? p.priceInPer1k : prev.priceInPer1k ?? 0,
          priceOutPer1k: typeof p.priceOutPer1k === 'number' ? p.priceOutPer1k : prev.priceOutPer1k ?? 0,
          apiKeyEnc: prev.apiKeyEnc,
        };
        if (typeof p.apiKey === 'string' && p.apiKey.trim()) {
          entry.apiKeyEnc = encryptSecret(p.apiKey.trim(), this.dataDir);
        }
        next[name] = entry;
      }
      raw.providers = next;
    }

    const tmp = `${path}.tmp`;
    await fsp.writeFile(tmp, `${JSON.stringify(raw, null, 2)}\n`, 'utf-8');
    await fsp.rename(tmp, path);
    console.log('[myblog] LLM 配置已保存（多供应商，apiKey 自动加密）');
  }

  /** 小人配置保存（管理页开关） */
  async saveMascotConfig(input: { enabled?: boolean; showChatReply?: boolean; hideBuiltinTips?: boolean }): Promise<void> {
    const path = join(this.repoRoot, 'config', 'mascot.json');
    const raw = this.loadJson('config/mascot.json') as Record<string, unknown>;
    if (typeof input.enabled === 'boolean') raw.enabled = input.enabled;
    if (typeof input.showChatReply === 'boolean') raw.showChatReply = input.showChatReply;
    if (typeof input.hideBuiltinTips === 'boolean') raw.hideBuiltinTips = input.hideBuiltinTips;
    const tmp = `${path}.tmp`;
    await fsp.writeFile(tmp, `${JSON.stringify(raw, null, 2)}\n`, 'utf-8');
    await fsp.rename(tmp, path);
    this.mascot = raw;
  }

  /** Skill 提示词文件：实时读取（config/prompts/*.md，改文件即更新） */
  getPromptFiles(): { chat: string; organize: string; image: string } {
    const dir = join(this.repoRoot, 'config', 'prompts');
    const read = (name: string, fallback: string): string => {
      try {
        const text = readFileSync(join(dir, name), 'utf-8').trim();
        return text ? text : fallback;
      } catch {
        return fallback;
      }
    };
    return {
      chat: read('chat-assistant.md', '你是知识助理，只依据提供的资料回答。'),
      organize: read('book-organizer.md', '输出整理 JSON。'),
      image: read('image-organizer.md', '阅读图片并整理成 Markdown。'),
    };
  }

  /** 保存 Skill 提示词文件（管理页维护，数据即配置） */
  async savePromptFiles(prompts: { chat?: string; organize?: string; image?: string }): Promise<void> {
    const dir = join(this.repoRoot, 'config', 'prompts');
    await fsp.mkdir(dir, { recursive: true });
    const map: Record<string, string | undefined> = {
      'chat-assistant.md': prompts.chat,
      'book-organizer.md': prompts.organize,
      'image-organizer.md': prompts.image,
    };
    for (const [name, content] of Object.entries(map)) {
      if (typeof content !== 'string') continue;
      const path = join(dir, name);
      const tmp = `${path}.tmp`;
      await fsp.writeFile(tmp, content.trim() ? `${content.trim()}\n` : '', 'utf-8');
      await fsp.rename(tmp, path);
    }
  }

  // ========== Skill 库（config/prompts/*.md，支持用户自主增删改） ==========
  get skillDir(): string {
    return join(this.repoRoot, 'config', 'prompts');
  }

  private sanitizeSkillName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  /** 列出全部 Skill（名称/描述/内容/是否内置） */
  listSkills(): { name: string; description: string; content: string; builtin: boolean }[] {
    let files: string[] = [];
    try {
      files = readdirSync(this.skillDir).filter((f) => f.endsWith('.md'));
    } catch {
      files = [];
    }
    return files
      .map((f) => {
        const name = f.replace(/\.md$/, '');
        const source = readFileSync(join(this.skillDir, f), 'utf-8');
        const { data, content } = parseFrontmatter(source);
        return {
          name,
          description: typeof data.description === 'string' ? data.description : '',
          content: content.trim(),
          builtin: BUILTIN_SKILLS.includes(name),
        };
      })
      .sort((a, b) => Number(b.builtin) - Number(a.builtin) || a.name.localeCompare(b.name));
  }

  readSkill(name: string): { name: string; description: string; content: string; builtin: boolean } | null {
    return this.listSkills().find((s) => s.name === name) ?? null;
  }

  /** 保存（创建或更新）Skill：frontmatter 存描述 */
  async saveSkill(name: string, content: string, description?: string): Promise<string> {
    const safe = this.sanitizeSkillName(name);
    if (!safe) throw new Error('Skill 名称无效');
    await fsp.mkdir(this.skillDir, { recursive: true });
    const front = description?.trim() ? `---\ndescription: ${description.trim().replace(/\n/g, ' ')}\n---\n\n` : '';
    const path = join(this.skillDir, `${safe}.md`);
    const tmp = `${path}.tmp`;
    await fsp.writeFile(tmp, `${front}${content.trim()}\n`, 'utf-8');
    await fsp.rename(tmp, path);
    return safe;
  }

  /** 删除 Skill（内置核心不可删） */
  async deleteSkill(name: string): Promise<void> {
    if (BUILTIN_SKILLS.includes(name)) throw new Error('内置核心 Skill 不可删除（可编辑）');
    const path = join(this.skillDir, `${this.sanitizeSkillName(name)}.md`);
    if (!existsSync(path)) throw new Error('Skill 不存在');
    await fsp.rm(path, { force: true });
  }

  /** 实时读取自我介绍（改文件即更新，保存后立即生效） */
  getAboutData(): Record<string, unknown> {
    try {
      return this.loadJson('config/about.json') as Record<string, unknown>;
    } catch {
      return this.about; // 文件缺失/损坏时退回启动时缓存
    }
  }

  /** 实时读取动态小人配置（改文件即更新，无需重启服务） */
  getMascotData(): Record<string, unknown> {
    try {
      return this.loadJson('config/mascot.json') as Record<string, unknown>;
    } catch {
      return this.mascot; // 文件缺失/损坏时退回启动时缓存
    }
  }

  /** 写回 config/about.json（临时文件 + rename，避免写一半损坏配置） */
  async saveAbout(data: Record<string, unknown>): Promise<void> {
    const path = join(this.repoRoot, 'config', 'about.json');
    const tmp = `${path}.tmp`;
    await fsp.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
    await fsp.rename(tmp, path);
    this.about = data; // 同步内存缓存
  }

  /** 站点背景图等 site.json 增量更新（管理页保存后立即生效） */
  async saveSite(input: { backgroundImage?: string }): Promise<void> {
    const path = join(this.repoRoot, 'config', 'site.json');
    const raw = this.loadJson('config/site.json') as Record<string, unknown>;
    if (typeof input.backgroundImage === 'string') {
      const value = input.backgroundImage.trim();
      if (value && !/^(\/|https?:\/\/)/.test(value)) {
        throw new Error('背景图 URL 必须以 / 或 http(s):// 开头');
      }
      raw.backgroundImage = value.slice(0, 500);
    }
    const tmp = `${path}.tmp`;
    await fsp.writeFile(tmp, `${JSON.stringify(raw, null, 2)}\n`, 'utf-8');
    await fsp.rename(tmp, path);
    Object.assign(this.site, raw as Partial<SiteConfig>); // 同步内存缓存（readonly 引用内联更新）
  }
}
