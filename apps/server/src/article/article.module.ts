import { Module } from '@nestjs/common';
import { AdminCheckService } from '../auth/admin-check';
import { AnnotationsController } from './annotations.controller';
import { ArticleController } from './article.controller';
import { ArticleService } from './article.service';
import { TagsController } from './tags.controller';

@Module({
  controllers: [ArticleController, TagsController, AnnotationsController],
  providers: [ArticleService, AdminCheckService],
  exports: [ArticleService],
})
export class ArticleModule {}
