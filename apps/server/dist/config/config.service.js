"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigService = exports.BUILTIN_SKILLS = void 0;
const common_1 = require("@nestjs/common");
const markdown_1 = require("@myblog/markdown");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const root_1 = require("../common/root");
const password_1 = require("../auth/password");
const encryption_1 = require("../auth/encryption");
/** 内置核心 Skill：可编辑但不可删除 */
exports.BUILTIN_SKILLS = ['chat-assistant', 'book-organizer', 'image-organizer', 'book-finder'];
/** 常见供应商默认价格（美元 / 1K token，可改） */
const DEFAULT_PRICES = {
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
function canonicalIpv4(host) {
    let n = null;
    if (/^\d+$/.test(host))
        n = Number(host);
    else if (/^0x[0-9a-f]+$/i.test(host))
        n = parseInt(host, 16);
    else if (/^0[0-7]+$/.test(host))
        n = parseInt(host, 8);
    if (n !== null) {
        if (!Number.isFinite(n) || n < 0 || n > 0xffffffff)
            return null;
        return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
    }
    const parts = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!parts)
        return null;
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
function assertSafeBaseUrl(raw) {
    const url = raw.trim();
    if (!url)
        return '';
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
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
        }
        else if (host !== 'localhost' && host !== '::1') {
            throw new Error('http 明文 baseUrl 仅允许本机地址（localhost/127.0.0.1），远程服务请使用 https');
        }
    }
    return url.replace(/\/+$/, '');
}
/**
 * 友链清洗（保存与读取都过一遍，保证不把危险链接写进配置）：
 * - 文本字段裁长，链接只允许 http(s)://（防 javascript:/data: 等 XSS 载荷）
 * - 头像允许站内 /uploads/ 相对路径或 http(s)://
 * - 缺名字或缺地址的条目直接丢弃；最多 100 条
 */
function normalizeFriends(raw) {
    const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
    const webUrl = (value) => {
        const url = typeof value === 'string' ? value.trim() : '';
        return /^https?:\/\/\S+$/i.test(url) ? url.slice(0, 500) : '';
    };
    const imageUrl = (value) => {
        const url = typeof value === 'string' ? value.trim() : '';
        return /^(\/|https?:\/\/)/i.test(url) ? url.slice(0, 500) : '';
    };
    const links = (Array.isArray(raw.links) ? raw.links : [])
        .map((item) => {
        const link = (item ?? {});
        return {
            name: text(link.name, 40),
            url: webUrl(link.url),
            avatar: imageUrl(link.avatar),
            description: text(link.description, 120),
        };
    })
        .filter((link) => link.name && link.url)
        .slice(0, 100);
    return {
        title: text(raw.title, 60) || '友链',
        intro: text(raw.intro, 200),
        applyHint: text(raw.applyHint, 300),
        links,
    };
}
/** 数据即配置：config/*.json 是站点、自我介绍、友链、LLM 的唯一数据源 */
let ConfigService = class ConfigService {
    repoRoot;
    site;
    /** 自我介绍：内存缓存供 fallback；读取请用 getAboutData()（实时读文件） */
    about;
    llm;
    /** 小人配置：保存后同步内存；读取请用 getMascotData()（实时读文件） */
    mascot;
    constructor() {
        this.repoRoot = (0, root_1.findRepoRoot)();
        this.site = this.loadJson('config/site.json');
        this.about = this.loadJson('config/about.json');
        this.llm = this.loadLlmConfig(); // llm.json 可能不存在（不入库），缺失时用安全的默认结构
        this.mascot = this.loadJson('config/mascot.json');
        // 敏感数据自动加密：明文口令/API Key 在启动时一次性转为哈希/密文写回
        this.autoEncryptAdminPassword();
        this.migrateLlmConfig();
        this.autoEncryptLlmApiKeys();
    }
    /** 读取 LLM 配置：文件缺失（从未配置过）时返回安全默认结构（禁用、无密钥） */
    loadLlmConfig() {
        try {
            return this.loadJson('config/llm.json');
        }
        catch {
            return {
                enabled: false,
                activeProvider: 'deepseek',
                providers: {},
                retrieval: { topK: 6 },
                chunking: { maxChars: 1200 },
            };
        }
    }
    get uploadsDir() {
        return (0, node_path_1.join)(this.repoRoot, 'uploads');
    }
    get dataDir() {
        return (0, node_path_1.join)(this.repoRoot, 'data');
    }
    /**
     * 管理口令凭据：环境变量 MYBLOG_ADMIN_PASSWORD 优先（验证/CI 注入测试口令，
     * 不触碰配置文件），其次读取 config/admin.json（password 明文 或 hash scrypt 哈希）。
     * 每次请求实时读取，改配置无需重启。
     */
    get adminCredential() {
        const env = process.env.MYBLOG_ADMIN_PASSWORD;
        if (env !== undefined)
            return { password: env.trim() };
        try {
            const raw = JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(this.repoRoot, 'config', 'admin.json'), 'utf-8'));
            return {
                password: typeof raw.password === 'string' ? raw.password.trim() : '',
                hash: typeof raw.hash === 'string' ? raw.hash.trim() : '',
            };
        }
        catch {
            return {}; // 文件缺失或损坏 → 开放模式
        }
    }
    loadJson(rel) {
        return JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(this.repoRoot, rel), 'utf-8'));
    }
    /** 自动加密：明文管理口令 → scrypt 哈希写回（一次性迁移，之后只存哈希） */
    autoEncryptAdminPassword() {
        const path = (0, node_path_1.join)(this.repoRoot, 'config', 'admin.json');
        try {
            const raw = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf-8'));
            if (typeof raw.password === 'string' && raw.password.trim() && !raw.hash) {
                raw.hash = (0, password_1.hashPassword)(raw.password.trim());
                delete raw.password;
                (0, node_fs_1.writeFileSync)(path, `${JSON.stringify(raw, null, 2)}\n`, 'utf-8');
                console.log('[myblog] 管理口令已自动转换为 scrypt 哈希存储');
            }
        }
        catch {
            /* 文件缺失/损坏时跳过 */
        }
    }
    /** 旧结构迁移：presets/provider/apiKeyEnc → providers 多供应商结构（一次性） */
    migrateLlmConfig() {
        const path = (0, node_path_1.join)(this.repoRoot, 'config', 'llm.json');
        try {
            const raw = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf-8'));
            if (typeof raw.providers === 'object' && raw.providers !== null)
                return; // 已是新结构
            const presets = (raw.presets ?? {});
            const active = typeof raw.provider === 'string' ? raw.provider : 'deepseek';
            const providers = {};
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
            if (typeof raw.apiKeyEnc === 'string' && raw.apiKeyEnc)
                providers[active].apiKeyEnc = raw.apiKeyEnc;
            const migrated = {
                enabled: raw.enabled === true,
                activeProvider: active,
                dailyTokenLimit: 0,
                costLimitUsd: 0,
                providers,
                retrieval: raw.retrieval ?? { topK: 6 },
                chunking: raw.chunking ?? { maxChars: 1200 },
            };
            (0, node_fs_1.writeFileSync)(path, `${JSON.stringify(migrated, null, 2)}\n`, 'utf-8');
            console.log('[myblog] LLM 配置已迁移为多供应商结构');
        }
        catch {
            /* 忽略 */
        }
    }
    /** 自动加密：各供应商明文 apiKey → AES-256-GCM 密文写回 */
    autoEncryptLlmApiKeys() {
        const path = (0, node_path_1.join)(this.repoRoot, 'config', 'llm.json');
        try {
            const raw = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf-8'));
            let changed = false;
            for (const entry of Object.values(raw.providers ?? {})) {
                if (typeof entry.apiKey === 'string' && entry.apiKey.trim() && !entry.apiKeyEnc) {
                    entry.apiKeyEnc = (0, encryption_1.encryptSecret)(entry.apiKey.trim(), this.dataDir);
                    delete entry.apiKey;
                    changed = true;
                }
            }
            if (changed) {
                (0, node_fs_1.writeFileSync)(path, `${JSON.stringify(raw, null, 2)}\n`, 'utf-8');
                console.log('[myblog] LLM API Key 已自动加密存储（data/secret.key）');
            }
        }
        catch {
            /* 忽略 */
        }
    }
    /** 实时读取 LLM 配置并解密当前供应商 apiKey（改文件即更新，无需重启） */
    getLlmRuntime() {
        const fallback = {
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
            const raw = this.loadJson('config/llm.json');
            const active = raw.activeProvider ?? 'deepseek';
            const entry = raw.providers?.[active];
            if (!entry)
                return fallback;
            let apiKey = typeof entry.apiKey === 'string' ? entry.apiKey.trim() : '';
            if (!apiKey && typeof entry.apiKeyEnc === 'string' && entry.apiKeyEnc) {
                apiKey = (0, encryption_1.decryptSecret)(entry.apiKeyEnc, this.dataDir);
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
        }
        catch {
            return fallback;
        }
    }
    /** 管理页视图：LLM 配置（密钥脱敏） */
    getLlmView() {
        const runtime = this.getLlmRuntime();
        let providers = [];
        try {
            const file = this.loadJson('config/llm.json');
            providers = Object.entries(file.providers ?? {}).map(([name, v]) => ({
                name,
                baseUrl: v.baseUrl ?? '',
                model: v.model ?? '',
                visionModel: typeof v.visionModel === 'string' ? v.visionModel : '',
                priceInPer1k: Number(v.priceInPer1k) || 0,
                priceOutPer1k: Number(v.priceOutPer1k) || 0,
                apiKeyConfigured: Boolean(v.apiKeyEnc || v.apiKey),
            }));
        }
        catch {
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
    async saveLlmConfig(input) {
        const path = (0, node_path_1.join)(this.repoRoot, 'config', 'llm.json');
        // 文件缺失（从未配置过）时从安全的默认结构开始
        let raw;
        try {
            raw = this.loadJson('config/llm.json');
        }
        catch {
            raw = { enabled: false, activeProvider: 'deepseek', providers: {}, retrieval: { topK: 6 }, chunking: { maxChars: 1200 } };
        }
        const current = (raw.providers ?? {});
        raw.enabled = input.enabled === true;
        if (input.activeProvider)
            raw.activeProvider = input.activeProvider;
        if (typeof input.dailyTokenLimit === 'number' && input.dailyTokenLimit >= 0)
            raw.dailyTokenLimit = Math.round(input.dailyTokenLimit);
        if (typeof input.costLimitUsd === 'number' && input.costLimitUsd >= 0)
            raw.costLimitUsd = input.costLimitUsd;
        if (Array.isArray(input.providers)) {
            const next = {};
            for (const p of input.providers) {
                const name = p.name.trim();
                if (!name)
                    continue;
                const prev = current[name] ?? {};
                const entry = {
                    baseUrl: assertSafeBaseUrl((p.baseUrl ?? prev.baseUrl ?? '').trim()),
                    model: (p.model ?? prev.model ?? '').trim(),
                    visionModel: (p.visionModel ?? prev.visionModel ?? '').trim(),
                    priceInPer1k: typeof p.priceInPer1k === 'number' ? p.priceInPer1k : prev.priceInPer1k ?? 0,
                    priceOutPer1k: typeof p.priceOutPer1k === 'number' ? p.priceOutPer1k : prev.priceOutPer1k ?? 0,
                    apiKeyEnc: prev.apiKeyEnc,
                };
                if (typeof p.apiKey === 'string' && p.apiKey.trim()) {
                    entry.apiKeyEnc = (0, encryption_1.encryptSecret)(p.apiKey.trim(), this.dataDir);
                }
                next[name] = entry;
            }
            raw.providers = next;
        }
        const tmp = `${path}.tmp`;
        await node_fs_1.promises.writeFile(tmp, `${JSON.stringify(raw, null, 2)}\n`, 'utf-8');
        await node_fs_1.promises.rename(tmp, path);
        console.log('[myblog] LLM 配置已保存（多供应商，apiKey 自动加密）');
    }
    /** 小人配置保存（管理页开关） */
    async saveMascotConfig(input) {
        const path = (0, node_path_1.join)(this.repoRoot, 'config', 'mascot.json');
        const raw = this.loadJson('config/mascot.json');
        if (typeof input.enabled === 'boolean')
            raw.enabled = input.enabled;
        if (typeof input.showChatReply === 'boolean')
            raw.showChatReply = input.showChatReply;
        if (typeof input.hideBuiltinTips === 'boolean')
            raw.hideBuiltinTips = input.hideBuiltinTips;
        const tmp = `${path}.tmp`;
        await node_fs_1.promises.writeFile(tmp, `${JSON.stringify(raw, null, 2)}\n`, 'utf-8');
        await node_fs_1.promises.rename(tmp, path);
        this.mascot = raw;
    }
    /** Skill 提示词文件：实时读取（config/prompts/*.md，改文件即更新） */
    getPromptFiles() {
        const dir = (0, node_path_1.join)(this.repoRoot, 'config', 'prompts');
        const read = (name, fallback) => {
            try {
                const text = (0, node_fs_1.readFileSync)((0, node_path_1.join)(dir, name), 'utf-8').trim();
                return text ? text : fallback;
            }
            catch {
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
    async savePromptFiles(prompts) {
        const dir = (0, node_path_1.join)(this.repoRoot, 'config', 'prompts');
        await node_fs_1.promises.mkdir(dir, { recursive: true });
        const map = {
            'chat-assistant.md': prompts.chat,
            'book-organizer.md': prompts.organize,
            'image-organizer.md': prompts.image,
        };
        for (const [name, content] of Object.entries(map)) {
            if (typeof content !== 'string')
                continue;
            const path = (0, node_path_1.join)(dir, name);
            const tmp = `${path}.tmp`;
            await node_fs_1.promises.writeFile(tmp, content.trim() ? `${content.trim()}\n` : '', 'utf-8');
            await node_fs_1.promises.rename(tmp, path);
        }
    }
    // ========== Skill 库（config/prompts/*.md，支持用户自主增删改） ==========
    get skillDir() {
        return (0, node_path_1.join)(this.repoRoot, 'config', 'prompts');
    }
    sanitizeSkillName(name) {
        return name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fff-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60);
    }
    /** 列出全部 Skill（名称/描述/内容/是否内置） */
    listSkills() {
        let files = [];
        try {
            files = (0, node_fs_1.readdirSync)(this.skillDir).filter((f) => f.endsWith('.md'));
        }
        catch {
            files = [];
        }
        return files
            .map((f) => {
            const name = f.replace(/\.md$/, '');
            const source = (0, node_fs_1.readFileSync)((0, node_path_1.join)(this.skillDir, f), 'utf-8');
            const { data, content } = (0, markdown_1.parseFrontmatter)(source);
            return {
                name,
                description: typeof data.description === 'string' ? data.description : '',
                content: content.trim(),
                builtin: exports.BUILTIN_SKILLS.includes(name),
            };
        })
            .sort((a, b) => Number(b.builtin) - Number(a.builtin) || a.name.localeCompare(b.name));
    }
    readSkill(name) {
        return this.listSkills().find((s) => s.name === name) ?? null;
    }
    /** 保存（创建或更新）Skill：frontmatter 存描述 */
    async saveSkill(name, content, description) {
        const safe = this.sanitizeSkillName(name);
        if (!safe)
            throw new Error('Skill 名称无效');
        await node_fs_1.promises.mkdir(this.skillDir, { recursive: true });
        const front = description?.trim() ? `---\ndescription: ${description.trim().replace(/\n/g, ' ')}\n---\n\n` : '';
        const path = (0, node_path_1.join)(this.skillDir, `${safe}.md`);
        const tmp = `${path}.tmp`;
        await node_fs_1.promises.writeFile(tmp, `${front}${content.trim()}\n`, 'utf-8');
        await node_fs_1.promises.rename(tmp, path);
        return safe;
    }
    /** 删除 Skill（内置核心不可删） */
    async deleteSkill(name) {
        if (exports.BUILTIN_SKILLS.includes(name))
            throw new Error('内置核心 Skill 不可删除（可编辑）');
        const path = (0, node_path_1.join)(this.skillDir, `${this.sanitizeSkillName(name)}.md`);
        if (!(0, node_fs_1.existsSync)(path))
            throw new Error('Skill 不存在');
        await node_fs_1.promises.rm(path, { force: true });
    }
    /** 实时读取自我介绍（改文件即更新，保存后立即生效） */
    getAboutData() {
        try {
            return this.loadJson('config/about.json');
        }
        catch {
            return this.about; // 文件缺失/损坏时退回启动时缓存
        }
    }
    /**
     * 实时读取友链（config/friends.json）：改文件或管理页保存后立即生效。
     * 文件缺失 / 结构损坏时返回空友链（不影响站点其它页面）。
     */
    getFriendsData() {
        const empty = { title: '友链', intro: '', applyHint: '', links: [] };
        try {
            const raw = this.loadJson('config/friends.json');
            return normalizeFriends(raw);
        }
        catch {
            return empty;
        }
    }
    /** 保存友链（写回 config/friends.json，临时文件 + rename 防写一半损坏） */
    async saveFriends(input) {
        const path = (0, node_path_1.join)(this.repoRoot, 'config', 'friends.json');
        const next = normalizeFriends({
            title: typeof input.title === 'string' ? input.title : this.getFriendsData().title,
            intro: typeof input.intro === 'string' ? input.intro : this.getFriendsData().intro,
            applyHint: typeof input.applyHint === 'string' ? input.applyHint : this.getFriendsData().applyHint,
            links: Array.isArray(input.links) ? input.links : this.getFriendsData().links,
        });
        const tmp = `${path}.tmp`;
        await node_fs_1.promises.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
        await node_fs_1.promises.rename(tmp, path);
        return next;
    }
    /** 实时读取动态小人配置（改文件即更新，无需重启服务） */
    getMascotData() {
        try {
            return this.loadJson('config/mascot.json');
        }
        catch {
            return this.mascot; // 文件缺失/损坏时退回启动时缓存
        }
    }
    /** 写回 config/about.json（临时文件 + rename，避免写一半损坏配置） */
    async saveAbout(data) {
        const path = (0, node_path_1.join)(this.repoRoot, 'config', 'about.json');
        const tmp = `${path}.tmp`;
        await node_fs_1.promises.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
        await node_fs_1.promises.rename(tmp, path);
        this.about = data; // 同步内存缓存
    }
    /** 站点背景图等 site.json 增量更新（管理页保存后立即生效） */
    async saveSite(input) {
        const path = (0, node_path_1.join)(this.repoRoot, 'config', 'site.json');
        const raw = this.loadJson('config/site.json');
        if (typeof input.backgroundImage === 'string') {
            const value = input.backgroundImage.trim();
            if (value && !/^(\/|https?:\/\/)/.test(value)) {
                throw new Error('背景图 URL 必须以 / 或 http(s):// 开头');
            }
            raw.backgroundImage = value.slice(0, 500);
        }
        const tmp = `${path}.tmp`;
        await node_fs_1.promises.writeFile(tmp, `${JSON.stringify(raw, null, 2)}\n`, 'utf-8');
        await node_fs_1.promises.rename(tmp, path);
        Object.assign(this.site, raw); // 同步内存缓存（readonly 引用内联更新）
    }
};
exports.ConfigService = ConfigService;
exports.ConfigService = ConfigService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], ConfigService);
//# sourceMappingURL=config.service.js.map