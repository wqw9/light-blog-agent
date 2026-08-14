import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { renderMarkdown } from '@myblog/markdown';
import type { SiteConfig } from '@myblog/shared';
import { AdminGuard } from '../auth/admin.guard';
import { ConfigService } from './config.service';
import { UpdateAboutDto } from './dto';

@Controller('site')
export class ConfigController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  site(): SiteConfig {
    return this.config.site;
  }

  /**
   * 自我介绍数据 + 渲染后的 Markdown 正文（contentHtml）。
   * config/about.json 的 content 字段是自由扩展区，介绍页直接展示。
   * 实时读文件：改文件或管理页保存后立即生效。
   */
  @Get('about')
  about(): Record<string, unknown> {
    const data = this.config.getAboutData();
    const content = typeof data.content === 'string' ? data.content : '';
    return { ...data, content, contentHtml: renderMarkdown(content).html };
  }

  /** 管理页编辑器读取原文（含 Markdown content） */
  @Get('about/raw')
  @UseGuards(AdminGuard)
  aboutRaw(): Record<string, unknown> {
    return this.config.getAboutData();
  }

  /** 保存自我介绍（写回 config/about.json，数据即配置） */
  @Put('about')
  @UseGuards(AdminGuard)
  async updateAbout(@Body() dto: UpdateAboutDto): Promise<Record<string, unknown>> {
    await this.config.saveAbout(dto as unknown as Record<string, unknown>);
    const content = dto.content ?? '';
    return { ...dto, contentHtml: renderMarkdown(content).html };
  }

  /** 动态小人配置（Phase 3）：实时读文件，改配置刷新页面即生效 */
  @Get('mascot')
  mascot(): Record<string, unknown> {
    return this.config.getMascotData();
  }

  /** 小人设置开关（管理页）：启用/LLM 回答气泡/隐藏自带蓝色气泡 */
  @Put('mascot')
  @UseGuards(AdminGuard)
  async updateMascot(
    @Body() dto: { enabled?: boolean; showChatReply?: boolean; hideBuiltinTips?: boolean },
  ): Promise<Record<string, unknown>> {
    await this.config.saveMascotConfig(dto);
    return this.config.getMascotData();
  }
}
