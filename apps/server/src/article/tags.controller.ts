import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AdminGuard } from '../auth/admin.guard';
import { PrismaService } from '../prisma/prisma.service';

/** 颜色只允许十六进制色值（防注入任意 CSS） */
const COLOR_PATTERN = /^#[0-9a-fA-F]{3,8}$/;

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
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(): Promise<{ name: string; color: string | null; count: number }[]> {
    const groups = await this.prisma.articleTag.groupBy({ by: ['tagId'], _count: { _all: true } });
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
    const tag = await this.prisma.tag.create({ data: { name, color: dto.color?.trim() || null } });
    return { name: tag.name, color: tag.color, count: 0 };
  }

  /** 重命名 / 改颜色（管理；文章关联自动保留） */
  @Put(':name')
  @UseGuards(AdminGuard)
  async update(@Param('name') name: string, @Body() dto: UpdateTagDto) {
    const tag = await this.prisma.tag.findUnique({ where: { name } });
    if (!tag) throw new BadRequestException(`标签不存在: ${name}`);
    const newName = dto.newName?.trim();
    if (newName && newName !== name) {
      const dup = await this.prisma.tag.findUnique({ where: { name: newName } });
      if (dup) throw new BadRequestException(`标签已存在: ${newName}`);
    }
    const updated = await this.prisma.tag.update({
      where: { id: tag.id },
      data: {
        ...(newName ? { name: newName } : {}),
        ...(typeof dto.color === 'string' ? { color: dto.color.trim() || null } : {}),
      },
    });
    const count = await this.prisma.articleTag.count({ where: { tagId: updated.id } });
    return { name: updated.name, color: updated.color, count };
  }

  /** 删除标签（管理；同时移除与文章的关联） */
  @Delete(':name')
  @UseGuards(AdminGuard)
  async remove(@Param('name') name: string) {
    const tag = await this.prisma.tag.findUnique({ where: { name } });
    if (!tag) throw new BadRequestException(`标签不存在: ${name}`);
    await this.prisma.tag.delete({ where: { id: tag.id } }); // ArticleTag 关联级联删除
    return { name, deleted: true };
  }
}
