import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AdminGuard } from '../auth/admin.guard';
import { RateLimiter } from '../auth/rate-limiter';
import { PrismaService } from '../prisma/prisma.service';

class CreateAnnotationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  quoteText!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  note!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  author?: string;

  @IsOptional()
  chapterIndex?: number;
}

/**
 * 句子书注（公开协作）：
 * - 任何访客都可以对已发布且非私密的文章写书注（选中句子 → 注释）
 * - 同 IP 每小时最多 10 条（防刷），IP 只存 SHA-256 哈希（不存原始 IP）
 * - 删除仅管理员可用
 */
@Controller()
export class AnnotationsController {
  private readonly limiter = new RateLimiter(60 * 60 * 1000, 10);

  constructor(private readonly prisma: PrismaService) {}

  @Get('articles/:id/annotations')
  async list(@Param('id', ParseIntPipe) id: number) {
    const rows = await this.prisma.annotation.findMany({
      where: { articleId: id },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((a) => ({
      id: a.id,
      chapterIndex: a.chapterIndex,
      quoteText: a.quoteText,
      note: a.note,
      author: a.author,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  @Post('articles/:id/annotations')
  async create(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateAnnotationDto,
    @Req() req: { ip?: string },
  ) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      select: { status: true, private: true },
    });
    if (!article || article.status !== 'PUBLISHED' || article.private) {
      throw new BadRequestException('文章不存在或未发布');
    }

    const ip = req.ip ?? 'unknown';
    const ipHash = createHash('sha256').update(ip).digest('hex');
    if (!this.limiter.allow(`anno:${ipHash}`)) {
      throw new BadRequestException('书注提交过于频繁，请稍后再试');
    }

    const quoteText = dto.quoteText.trim();
    const note = dto.note.trim();
    if (!quoteText || !note) throw new BadRequestException('引文与书注不能为空');

    const annotation = await this.prisma.annotation.create({
      data: {
        articleId: id,
        chapterIndex: Math.max(1, Number(dto.chapterIndex) || 1),
        quoteText,
        note,
        author: dto.author?.trim() || null,
        ipHash,
      },
    });
    return {
      id: annotation.id,
      chapterIndex: annotation.chapterIndex,
      quoteText: annotation.quoteText,
      note: annotation.note,
      author: annotation.author,
      createdAt: annotation.createdAt.toISOString(),
    };
  }

  @Delete('annotations/:id')
  @UseGuards(AdminGuard)
  async remove(@Param('id', ParseIntPipe) id: number) {
    const existing = await this.prisma.annotation.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new BadRequestException('书注不存在');
    await this.prisma.annotation.delete({ where: { id } });
    return { id, deleted: true };
  }
}
