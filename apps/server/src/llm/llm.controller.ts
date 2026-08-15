import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AdminGuard } from '../auth/admin.guard';
import { RateLimiter } from '../auth/rate-limiter';
import { ConfigService } from '../config/config.service';
import { LlmService } from './llm.service';

/** 最小 SSE 响应接口（避免直接依赖 express 类型） */
interface SseResponse {
  setHeader(name: string, value: string): void;
  flushHeaders?(): void;
  write(chunk: string): boolean;
  end(): void;
}

class ChatMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(8000)
  content!: string;
}

class ChatDto {
  @IsArray()
  @ArrayMaxSize(30)
  messages!: ChatMessageDto[];

  @IsOptional()
  sessionId?: number;

  /** 可选：指定 Skill 名称（如 book-finder 书籍搜索），使用该 Skill 的提示词回答 */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  skill?: string;
}

class UpdateLlmConfigDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  activeProvider!: string;

  @IsOptional()
  dailyTokenLimit?: number;

  @IsOptional()
  costLimitUsd?: number;

  @IsOptional()
  @IsArray()
  providers?: {
    name: string;
    baseUrl: string;
    model: string;
    visionModel?: string;
    priceInPer1k?: number;
    priceOutPer1k?: number;
    apiKey?: string;
  }[];
}

@Controller()
export class LlmController {
  /** 对话限流：同一来源每分钟最多 20 次（防 token 预算滥用；LLM 未启用时不消耗额度） */
  private readonly chatLimiter = new RateLimiter(60 * 1000, 20);

  constructor(
    private readonly llm: LlmService,
    private readonly config: ConfigService,
  ) {}

  @Get('llm/status')
  status() {
    return this.llm.status();
  }

  /** 管理页：读取 LLM 配置（密钥脱敏） */
  @Get('llm/config')
  @UseGuards(AdminGuard)
  llmConfig() {
    return this.config.getLlmView();
  }

  /** 管理页：保存 LLM 配置（多供应商；apiKey 非空时立即加密存储；baseUrl 做安全校验） */
  @Put('llm/config')
  @UseGuards(AdminGuard)
  async saveConfig(@Body() dto: UpdateLlmConfigDto) {
    try {
      await this.config.saveLlmConfig({
        enabled: dto.enabled,
        activeProvider: dto.activeProvider,
        dailyTokenLimit: dto.dailyTokenLimit,
        costLimitUsd: dto.costLimitUsd,
        providers: dto.providers,
      });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'LLM 配置无效');
    }
    return this.config.getLlmView();
  }

  /** 测试连接：用当前配置发一条最小请求 */
  @Post('llm/test')
  @UseGuards(AdminGuard)
  async testConnection() {
    try {
      return { ok: true, ...(await this.llm.testConnection()) };
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : '测试失败');
    }
  }

  /** 知识问答：SSE 流式返回（引用来源与 sessionId 见 done 事件）；公开可用但限流 */
  @Post('chat')
  async chat(@Body() dto: ChatDto, @Res() res: SseResponse, @Req() req: { ip?: string }): Promise<void> {
    if (!Array.isArray(dto.messages) || dto.messages.length === 0) {
      throw new BadRequestException('messages 不能为空');
    }
    const totalChars = dto.messages.reduce((n, m) => n + m.content.length, 0);
    if (totalChars > 12000) {
      throw new BadRequestException('消息总长度超过限制（12000 字符）');
    }
    const ip = req.ip ?? 'unknown';
    if (!this.chatLimiter.allow(`chat:${ip}`)) {
      throw new BadRequestException('提问过于频繁，请稍后再试');
    }
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    try {
      const { stream, citations } = await this.llm.answer(dto.messages, dto.skill);
      let full = '';
      for await (const text of stream) {
        full += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
      let sessionId = dto.sessionId;
      try {
        sessionId = await this.llm.saveChatSession(sessionId, dto.messages, full, citations);
      } catch {
        /* 会话保存失败不影响回答 */
      }
      res.write(`data: ${JSON.stringify({ done: true, citations, sessionId })}\n\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '回答失败';
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    }
    res.end();
  }

  /** 问答历史记录（含会话内容，仅管理员可见） */
  @Get('chat/sessions')
  @UseGuards(AdminGuard)
  sessions() {
    return this.llm.listSessions();
  }

  @Get('chat/sessions/:id')
  @UseGuards(AdminGuard)
  session(@Param('id', ParseIntPipe) id: number) {
    return this.llm.getSession(id);
  }

  @Delete('chat/sessions/:id')
  @UseGuards(AdminGuard)
  deleteSession(@Param('id', ParseIntPipe) id: number) {
    return this.llm.deleteSession(id);
  }

  /** 用量统计：每日 token / 花费 / 限额（仅管理员） */
  @Get('llm/usage')
  @UseGuards(AdminGuard)
  usage() {
    return this.llm.getUsage();
  }

  /** 书籍整理：AI 生成摘要/标签/分类/建议问题并写回文章 */
  @Post('llm/organize/:id')
  @UseGuards(AdminGuard)
  organize(@Param('id', ParseIntPipe) id: number) {
    return this.llm.organize(id);
  }

  /** Skill：图片转 Markdown 文章（视觉模型读图成文） */
  @Post('llm/image-to-md/:id')
  @UseGuards(AdminGuard)
  imageToMd(@Param('id', ParseIntPipe) id: number) {
    return this.llm.imageToMarkdown(id);
  }

  /** Skill：PDF/DOCX 转 Markdown 文章 */
  @Post('llm/doc-to-md/:id')
  @UseGuards(AdminGuard)
  docToMd(@Param('id', ParseIntPipe) id: number) {
    return this.llm.docToMarkdown(id);
  }

  /** Skill 提示词文件（管理页维护） */
  @Get('llm/prompts')
  @UseGuards(AdminGuard)
  prompts() {
    return this.config.getPromptFiles();
  }

  @Put('llm/prompts')
  @UseGuards(AdminGuard)
  async savePrompts(@Body() dto: { chat?: string; organize?: string; image?: string }) {
    await this.config.savePromptFiles(dto);
    return this.config.getPromptFiles();
  }

  // ========== Skill 库（用户自主增删改 + 一键生成 + 运行） ==========
  @Get('llm/skills')
  @UseGuards(AdminGuard)
  skills() {
    return this.config.listSkills();
  }

  @Put('llm/skills/:name')
  @UseGuards(AdminGuard)
  async saveSkill(@Param('name') name: string, @Body() dto: { content?: string; description?: string }) {
    if (typeof dto.content !== 'string' || !dto.content.trim()) {
      throw new BadRequestException('Skill 内容不能为空');
    }
    try {
      const safe = await this.config.saveSkill(name, dto.content, dto.description);
      return this.config.readSkill(safe);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Skill 名称无效');
    }
  }

  @Delete('llm/skills/:name')
  @UseGuards(AdminGuard)
  async deleteSkill(@Param('name') name: string) {
    try {
      await this.config.deleteSkill(name);
      return { name, deleted: true };
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : '删除失败');
    }
  }

  /** 元 Skill：按描述一键生成新 Skill */
  @Post('llm/skills/generate')
  @UseGuards(AdminGuard)
  generateSkill(@Body() dto: { name?: string; description?: string }) {
    return this.llm.generateSkill(dto.name ?? '', dto.description ?? '');
  }

  /** 对文章运行 Skill，生成处理后的新文章 */
  @Post('llm/skills/:name/run')
  @UseGuards(AdminGuard)
  runSkill(@Param('name') name: string, @Body() dto: { articleId?: number }) {
    if (!dto.articleId) throw new BadRequestException('articleId 不能为空');
    return this.llm.runSkill(name, dto.articleId);
  }

  /** 全量重建知识检索索引 */
  @Post('llm/reindex')
  @UseGuards(AdminGuard)
  reindex() {
    return this.llm.reindex();
  }
}
