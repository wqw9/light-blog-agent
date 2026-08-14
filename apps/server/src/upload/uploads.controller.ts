import { Controller, Delete, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { UploadService } from './upload.service';

/** 上传记录管理（列表 / 删除 / 重新解析），仅管理口令可用 */
@Controller('uploads')
@UseGuards(AdminGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadService) {}

  @Get()
  list(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.uploads.listFiles(Number(page) || 1, Number(pageSize) || 20);
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
