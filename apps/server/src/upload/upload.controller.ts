import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Controller, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { AdminGuard } from '../auth/admin.guard';
import { findRepoRoot } from '../common/root';
import { UploadService } from './upload.service';

// multer 先落盘到 uploads/tmp（随机名），由 UploadService 校验后移动到最终位置
const uploadOptions = {
  storage: diskStorage({
    destination: (_req: unknown, _file: unknown, cb: (err: Error | null, dir: string) => void) => {
      const dir = join(findRepoRoot(), 'uploads', 'tmp');
      try {
        mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (err) {
        cb(err instanceof Error ? err : new Error(String(err)), dir);
      }
    },
  }),
  limits: { fileSize: 60 * 1024 * 1024, files: 10 },
};

@Controller('upload')
export class UploadController {
  constructor(private readonly uploads: UploadService) {}

  @Post()
  @UseGuards(AdminGuard)
  @UseInterceptors(FilesInterceptor('files', 10, uploadOptions))
  upload(@UploadedFiles() files: Express.Multer.File[]) {
    return this.uploads.handleFiles(files);
  }
}
