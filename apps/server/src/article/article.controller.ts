import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { ApiList, ArticleDetail, ArticleSummary, ChapterView } from '@myblog/shared';
import { AdminGuard } from '../auth/admin.guard';
import { ArticleService } from './article.service';
import { CreateArticleDto, UpdateArticleDto } from './dto';

@Controller('articles')
export class ArticleController {
  constructor(private readonly articles: ArticleService) {}

  @Get()
  list(@Query() query: Record<string, string>): Promise<ApiList<ArticleSummary>> {
    return this.articles.list(query);
  }

  @Get(':slug')
  detail(@Param('slug') slug: string): Promise<ArticleDetail> {
    return this.articles.getBySlug(slug);
  }

  @Get(':id/chapters/:index')
  chapter(
    @Param('id', ParseIntPipe) id: number,
    @Param('index', ParseIntPipe) index: number,
  ): Promise<ChapterView> {
    return this.articles.getChapter(id, index);
  }

  @Get(':id/raw')
  @UseGuards(AdminGuard)
  raw(@Param('id', ParseIntPipe) id: number) {
    return this.articles.getRaw(id);
  }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() dto: CreateArticleDto) {
    return this.articles.createFromMarkdown({
      contentMd: dto.contentMarkdown,
      title: dto.title,
      summary: dto.summary,
      tags: dto.tags,
      category: dto.category,
      cover: dto.cover,
      source: 'MANUAL',
    });
  }

  @Put(':id')
  @UseGuards(AdminGuard)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateArticleDto): Promise<ArticleDetail> {
    return this.articles.update(id, dto);
  }

  @Post(':id/undo')
  @UseGuards(AdminGuard)
  undo(@Param('id', ParseIntPipe) id: number): Promise<ArticleDetail> {
    return this.articles.undo(id);
  }

  @Post(':slug/view')
  view(@Param('slug') slug: string): Promise<void> {
    return this.articles.touchView(slug);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id', ParseIntPipe) id: number): Promise<{ id: number; deleted: boolean }> {
    return this.articles.remove(id);
  }
}
