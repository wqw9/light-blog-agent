import { BadRequestException, Controller, Delete, Get, NotFoundException, Param, ParseIntPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { AdminGuard } from '../auth/admin.guard';
import { UploadService } from './upload.service';

/**
 * 上传记录管理（列表 / 删除 / 重新解析），仅管理口令可用。
 * 原始文件（md/pdf/docx）也仅管理员可下载：公开站只暴露 /uploads/img/ 图片目录，
 * 防止私密文章的原始 Markdown 被未授权直链下载。
 */
@Controller('uploads')
@UseGuards(AdminGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadService) {}

  @Get()
  list(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.uploads.listFiles(Number(page) || 1, Number(pageSize) || 20);
  }

  /** 受控下载原始文件（仅 files/ 目录，白名单文件名，防目录穿越） */
  @Get('files/:name')
  file(@Param('name') name: string, @Res() res: { sendFile: (path: string, cb: (err?: Error) => void) => void; status: (code: number) => { json: (b: unknown) => void } }) {
    const safe = basename(name);
    if (safe !== name || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/.test(safe)) {
      throw new BadRequestException('文件名无效');
    }
    const full = this.uploads.resolveStoredFile(`files/${safe}`);
    if (!existsSync(full)) throw new NotFoundException('文件不存在');
    res.sendFile(full, (err?: Error) => {
      if (err) res.status(404).json({ message: '文件不存在', statusCode: 404 });
    });
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.uploads.removeFile(id);
  }

  @Post(':id/reparse')
  reparse(@Param('id', ParseIntPipe) id: number) {
    return this.uploads.reparse(id);
  }
}
