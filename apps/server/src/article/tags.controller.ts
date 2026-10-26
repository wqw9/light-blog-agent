import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AdminCheckService } from '../auth/admin-check';
import { AdminGuard } from '../auth/admin.guard';
import { PrismaService } from '../prisma/prisma.service';

/** 颜色只允许十六进制色值（防注入任意 CSS） */
const COLOR_PATTERN = /^#[0-9a-fA-F]{3,8}$/;

/**
 * Prisma 错误 → 可读的 400（而不是 500）：
 * - P2002 唯一约束冲突：标签已被重名占用（含大小写/空白差异导致的隐性重名）
 * - P2025 记录不存在：标签在别处已被删掉（页面列表过期）
 * 其它错误原样抛出，交给全局异常处理。
 */
function asBadRequest(err: unknown, fallback: string): never {
  const code = (err as { code?: string } | null)?.code;
  if (code === 'P2002') throw new BadRequestException('标签名已存在（换个名字，或注意大小写/空格）');
  if (code === 'P2025') throw new BadRequestException('标签已不存在（可能刚被删除），请刷新标签列表');
  if (err instanceof BadRequestException) throw err;
  throw new BadRequestException(err instanceof Error ? `${fallback}：${err.message}` : fallback);
}

class CreateTagDto {
  @IsString()
  @MaxLength(30)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(COLOR_PATTERN, { message: '颜色必须是 #RRGGBB 格式' })
  color?: string;
}

class UpdateTagDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  newName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(COLOR_PATTERN, { message: '颜色必须是 #RRGGBB 格式' })
  color?: string;
}

@Controller('tags')
export class TagsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminCheck: AdminCheckService,
  ) {}

  /** 标签列表：公开口径只统计公开文章的标签（不泄露私密/草稿的标签存在性），管理员可见全量 */
  @Get()
  async list(@Req() req: { headers: Record<string, string | undefined> }): Promise<{ name: string; color: string | null; count: number }[]> {
    const admin = this.adminCheck.isAdmin(req.headers);
    const where = admin ? undefined : { article: { status: 'PUBLISHED', private: false } };
    const groups = await this.prisma.articleTag.groupBy({
      by: ['tagId'],
      where,
      _count: { _all: true },
    });
    const tags = await this.prisma.tag.findMany({ select: { id: true, name: true, color: true } });
    const counts = new Map(groups.map((g) => [g.tagId, g._count._all]));
    return tags
      .map((t) => ({ name: t.name, color: t.color, count: counts.get(t.id) ?? 0 }))
      .sort((a, b) => b.count - a.count);
  }

  /** 新增标签（管理） */
  @Post()
  @UseGuards(AdminGuard)
  async create(@Body() dto: CreateTagDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('标签名不能为空');
    const exists = await this.prisma.tag.findUnique({ where: { name } });
    if (exists) throw new BadRequestException(`标签已存在: ${name}`);
    try {
      const tag = await this.prisma.tag.create({ data: { name, color: dto.color?.trim() || null } });
      return { name: tag.name, color: tag.color, count: 0 };
    } catch (err) {
      asBadRequest(err, '新增标签失败');
    }
  }

  /** 重命名 / 改颜色（管理；文章关联自动保留） */
  @Put(':name')
  @UseGuards(AdminGuard)
  async update(@Param('name') name: string, @Body() dto: UpdateTagDto) {
    const tag = await this.prisma.tag.findUnique({ where: { name } });
    if (!tag) throw new BadRequestException(`标签不存在: ${name}`);
    const newName = dto.newName?.trim();
    if (newName !== undefined && !newName) throw new BadRequestException('新标签名不能为空');
    if (newName && newName !== name) {
      const dup = await this.prisma.tag.findUnique({ where: { name: newName } });
      if (dup) throw new BadRequestException(`标签已存在: ${newName}`);
    }
    try {
      const updated = await this.prisma.tag.update({
        where: { id: tag.id },
        data: {
          ...(newName ? { name: newName } : {}),
          ...(typeof dto.color === 'string' ? { color: dto.color.trim() || null } : {}),
        },
      });
      const count = await this.prisma.articleTag.count({ where: { tagId: updated.id } });
      return { name: updated.name, color: updated.color, count };
    } catch (err) {
      asBadRequest(err, '保存标签失败');
    }
  }

  /** 删除标签（管理；同时移除与文章的关联） */
  @Delete(':name')
  @UseGuards(AdminGuard)
  async remove(@Param('name') name: string) {
    const tag = await this.prisma.tag.findUnique({ where: { name } });
    if (!tag) throw new BadRequestException(`标签不存在: ${name}`);
    try {
      await this.prisma.tag.delete({ where: { id: tag.id } }); // ArticleTag 关联级联删除
    } catch (err) {
      asBadRequest(err, '删除标签失败');
    }
    return { name, deleted: true };
  }
}
