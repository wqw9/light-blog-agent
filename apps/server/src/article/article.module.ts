import { Module } from '@nestjs/common';
import { ArticleController } from './article.controller';
import { ArticleService } from './article.service';
import { TagsController } from './tags.controller';

@Module({
  controllers: [ArticleController, TagsController],
  providers: [ArticleService],
  exports: [ArticleService],
})
export class ArticleModule {}
