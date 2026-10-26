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
exports.UploadService = void 0;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const common_1 = require("@nestjs/common");
const shared_1 = require("@myblog/shared");
const article_service_1 = require("../article/article.service");
const config_service_1 = require("../config/config.service");
const llm_service_1 = require("../llm/llm.service");
const prisma_service_1 = require("../prisma/prisma.service");
let UploadService = class UploadService {
    prisma;
    articles;
    config;
    llm;
    constructor(prisma, articles, config, llm) {
        this.prisma = prisma;
        this.articles = articles;
        this.config = config;
        this.llm = llm;
    }
    /** 批量处理；单文件失败不影响批次（设计文档 5.2） */
    async handleFiles(files) {
        const results = [];
        for (const file of files ?? []) {
            try {
                results.push(await this.processOne(file));
            }
            catch (err) {
                results.push({
                    filename: this.fixFilename(file.originalname ?? 'unknown'),
                    ok: false,
                    error: err instanceof Error ? err.message : '处理失败',
                });
            }
        }
        return { results };
    }
    async processOne(file) {
        // multer 1.x 按 latin1 解码 multipart 文件名，UTF-8 中文名会变成乱码，这里还原
        const original = this.fixFilename(file.originalname ?? 'unnamed');
        const ext = (0, node_path_1.extname)(original).toLowerCase();
        // 1. 扩展名白名单
        if (![...shared_1.ALLOWED_MD_EXT, ...shared_1.ALLOWED_DOC_EXT, ...shared_1.ALLOWED_IMAGE_EXT].includes(ext)) {
            await this.discard(file);
            return { filename: original, ok: false, error: `不支持的文件类型: ${ext || '(无扩展名)'}` };
        }
        // 2. 大小限制（按类型）
        const buffer = await node_fs_1.promises.readFile(file.path);
        const limit = shared_1.ALLOWED_MD_EXT.includes(ext)
            ? shared_1.UPLOAD_LIMITS.md
            : shared_1.ALLOWED_DOC_EXT.includes(ext)
                ? shared_1.UPLOAD_LIMITS.doc
                : shared_1.UPLOAD_LIMITS.image;
        if (buffer.length > limit) {
            await this.discard(file);
            return { filename: original, ok: false, error: `文件超过大小限制 (${Math.round(limit / 1024 / 1024)}MB)` };
        }
        // 3. 魔数校验（内容与扩展名一致）
        const kind = this.classify(ext, buffer);
        if (kind === shared_1.FILE_KIND.UNKNOWN) {
            await this.discard(file);
            return { filename: original, ok: false, error: '文件内容与扩展名不符' };
        }
        // 4. SHA-256 去重
        const sha256 = (0, node_crypto_1.createHash)('sha256').update(buffer).digest('hex');
        const existing = await this.prisma.uploadFile.findUnique({ where: { sha256 } });
        if (existing) {
            await this.discard(file);
            const item = {
                filename: original,
                ok: true,
                duplicate: true,
                fileId: existing.id,
                kind: existing.kind,
            };
            if (existing.articleId) {
                const art = await this.prisma.article.findUnique({
                    where: { id: existing.articleId },
                    include: { _count: { select: { chapters: true } } },
                });
                if (art)
                    item.article = { id: art.id, slug: art.slug, title: art.title, chapterCount: art._count.chapters };
            }
            return item;
        }
        // 5. 落盘（hash 前缀 + 安全文件名）
        const sub = kind === shared_1.FILE_KIND.IMAGE ? 'img' : 'files';
        const targetDir = (0, node_path_1.join)(this.config.uploadsDir, sub);
        await node_fs_1.promises.mkdir(targetDir, { recursive: true });
        const safeBase = this.sanitize((0, node_path_1.basename)(original, ext)).slice(0, 60) || 'file';
        const finalName = `${sha256.slice(0, 12)}-${safeBase}${ext}`;
        const storedPath = (0, node_path_1.join)(sub, finalName).replace(/\\/g, '/');
        await node_fs_1.promises.rename(file.path, (0, node_path_1.join)(this.config.uploadsDir, storedPath));
        const record = await this.prisma.uploadFile.create({
            data: {
                filename: original,
                storedPath,
                mime: file.mimetype ?? 'application/octet-stream',
                size: buffer.length,
                sha256,
                kind,
                status: kind === shared_1.FILE_KIND.MD || kind === shared_1.FILE_KIND.TXT ? 'PARSED' : 'PENDING',
            },
        });
        // 6. 图片：返回直链
        if (kind === shared_1.FILE_KIND.IMAGE) {
            return { filename: original, ok: true, fileId: record.id, kind, url: `/uploads/${storedPath}` };
        }
        // 7. Markdown/文本：上传即发布（自动识别 UTF-8 / GBK 编码）
        if (kind === shared_1.FILE_KIND.MD || kind === shared_1.FILE_KIND.TXT) {
            const text = this.decodeText(buffer);
            const article = await this.articles.createFromMarkdown({
                contentMd: text,
                source: 'UPLOAD',
                fileId: record.id,
                fallbackTitle: (0, node_path_1.basename)(original, ext),
            });
            await this.prisma.uploadFile.update({
                where: { id: record.id },
                data: { status: 'PARSED', articleId: article.id },
            });
            // 上传即发布后，异步触发 AI 书籍整理（未启用 LLM 时静默跳过）
            void this.llm.organize(article.id).catch(() => { });
            return {
                filename: original,
                ok: true,
                fileId: record.id,
                kind,
                article: { id: article.id, slug: article.slug, title: article.title, chapterCount: article.chapters.length },
            };
        }
        // 8. PDF / DOCX：已落盘存档；文本提取与知识库向量化在 Phase 4（LLM/RAG）接入
        return {
            filename: original,
            ok: true,
            fileId: record.id,
            kind,
            warning: '文件已入库；PDF/DOCX 文本提取与知识库索引将在 Phase 4（LLM/RAG）接入',
        };
    }
    // ========== 上传记录（管理）==========
    async listFiles(page = 1, pageSize = 20) {
        const take = Math.min(100, Math.max(1, Number(pageSize) || 20));
        const skip = (Math.max(1, Number(page) || 1) - 1) * take;
        const [rows, total] = await this.prisma.$transaction([
            this.prisma.uploadFile.findMany({ orderBy: { createdAt: 'desc' }, skip, take }),
            this.prisma.uploadFile.count(),
        ]);
        const articleIds = [...new Set(rows.map((r) => r.articleId).filter((v) => v != null))];
        const arts = await this.prisma.article.findMany({
            where: { id: { in: articleIds } },
            select: { id: true, slug: true, title: true },
        });
        const artMap = new Map(arts.map((a) => [a.id, a]));
        return {
            items: rows.map((r) => ({
                id: r.id,
                filename: this.fixFilename(r.filename), // 显示层修复旧记录的乱码文件名
                storedPath: r.storedPath,
                mime: r.mime,
                size: r.size,
                kind: r.kind,
                status: r.status,
                error: r.error,
                createdAt: r.createdAt.toISOString(),
                article: r.articleId != null && artMap.has(r.articleId) ? artMap.get(r.articleId) : null,
            })),
            total,
        };
    }
    /** 删除上传记录与物理文件（如已发布为文章，需先删文章） */
    async removeFile(id) {
        const file = await this.prisma.uploadFile.findUnique({ where: { id } });
        if (!file)
            throw new common_1.NotFoundException(`上传记录不存在: id=${id}`);
        await node_fs_1.promises.rm((0, node_path_1.join)(this.config.uploadsDir, file.storedPath), { force: true }).catch(() => { });
        await this.prisma.uploadFile.delete({ where: { id } });
        return { id, deleted: true };
    }
    /** 将库内相对路径解析为绝对路径（受控下载用） */
    resolveStoredFile(storedPath) {
        return (0, node_path_1.join)(this.config.uploadsDir, storedPath);
    }
    /** 重新解析：以正确编码重建文章（修复旧乱码 / 解析失败的文件） */
    async reparse(id) {
        const file = await this.prisma.uploadFile.findUnique({ where: { id } });
        if (!file)
            throw new common_1.NotFoundException(`上传记录不存在: id=${id}`);
        if (file.kind !== 'MD' && file.kind !== 'TXT') {
            throw new common_1.BadRequestException('仅 Markdown / 文本文件支持重新解析');
        }
        // 先删旧文章（释放 fileId 唯一约束），再以正确编码重建
        if (file.articleId) {
            await this.prisma.article.deleteMany({ where: { id: file.articleId } }).catch(() => { });
        }
        const buffer = await node_fs_1.promises.readFile((0, node_path_1.join)(this.config.uploadsDir, file.storedPath));
        const text = this.decodeText(buffer);
        if (!text.trim()) {
            throw new common_1.BadRequestException('文件内容为空，无法重新解析（可直接删除该记录）');
        }
        const ext = (0, node_path_1.extname)(file.filename).toLowerCase();
        const article = await this.articles.createFromMarkdown({
            contentMd: text,
            source: 'UPLOAD',
            fileId: file.id,
            fallbackTitle: (0, node_path_1.basename)(this.fixFilename(file.filename), ext),
        });
        await this.prisma.uploadFile.update({
            where: { id },
            data: { status: 'PARSED', articleId: article.id, error: null },
        });
        return {
            filename: file.filename,
            ok: true,
            fileId: file.id,
            kind: file.kind,
            article: { id: article.id, slug: article.slug, title: article.title, chapterCount: article.chapters.length },
        };
    }
    // ========== 工具 ==========
    /** 文件名编码修复：multer 1.x 按 latin1 解码 UTF-8 文件名导致乱码 */
    fixFilename(name) {
        if (!/[\u0080-\u00ff]/.test(name))
            return name; // 纯 ASCII 或已是正确中文 → 不动
        const decoded = Buffer.from(name, 'latin1').toString('utf-8');
        return decoded.includes('\uFFFD') ? name : decoded; // 还原失败则保持原样
    }
    /** 文本解码：UTF-8 BOM → UTF-8 → GBK（中文 Windows 记事本默认 ANSI=GBK） */
    decodeText(buffer) {
        if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
            return buffer.subarray(3).toString('utf-8');
        }
        try {
            return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        }
        catch {
            return new TextDecoder('gbk').decode(buffer);
        }
    }
    /** 魔数校验：扩展名 + 文件头双重确认 */
    classify(ext, buffer) {
        if (shared_1.ALLOWED_MD_EXT.includes(ext)) {
            return this.isTextLike(buffer) ? (ext === '.txt' ? shared_1.FILE_KIND.TXT : shared_1.FILE_KIND.MD) : shared_1.FILE_KIND.UNKNOWN;
        }
        if (shared_1.ALLOWED_IMAGE_EXT.includes(ext)) {
            const isPng = buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
            const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
            const isGif = buffer.length > 4 && buffer.subarray(0, 6).toString('ascii').startsWith('GIF8');
            const isWebp = buffer.length > 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
            return isPng || isJpeg || isGif || isWebp ? shared_1.FILE_KIND.IMAGE : shared_1.FILE_KIND.UNKNOWN;
        }
        if (ext === '.pdf') {
            return buffer.length > 4 && buffer.subarray(0, 4).toString('ascii') === '%PDF' ? shared_1.FILE_KIND.PDF : shared_1.FILE_KIND.UNKNOWN;
        }
        if (ext === '.docx') {
            return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b ? shared_1.FILE_KIND.DOCX : shared_1.FILE_KIND.UNKNOWN;
        }
        return shared_1.FILE_KIND.UNKNOWN;
    }
    /** 文本类内容：不含 NUL 字节（GBK 文本在 UTF-8 严格解码下会失败，但不能因此拒收） */
    isTextLike(buffer) {
        return !buffer.includes(0);
    }
    sanitize(name) {
        return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
    }
    async discard(file) {
        try {
            await node_fs_1.promises.rm(file.path, { force: true });
        }
        catch {
            /* ignore */
        }
    }
};
exports.UploadService = UploadService;
exports.UploadService = UploadService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        article_service_1.ArticleService,
        config_service_1.ConfigService,
        llm_service_1.LlmService])
], UploadService);
//# sourceMappingURL=upload.service.js.map