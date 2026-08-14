import { Module } from '@nestjs/common';
import { ArticleModule } from '../article/article.module';
import { LlmModule } from '../llm/llm.module';
import { UploadController } from './upload.controller';
import { UploadsController } from './uploads.controller';
import { UploadService } from './upload.service';

@Module({
  imports: [ArticleModule, LlmModule],
  controllers: [UploadController, UploadsController],
  providers: [UploadService],
})
export class UploadModule {}
