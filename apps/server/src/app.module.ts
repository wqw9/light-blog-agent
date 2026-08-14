import { Module } from '@nestjs/common';
import { ArticleModule } from './article/article.module';
import { ConfigModule } from './config/config.module';
import { LlmModule } from './llm/llm.module';
import { PrismaModule } from './prisma/prisma.module';
import { StatsModule } from './stats/stats.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [ConfigModule, PrismaModule, ArticleModule, UploadModule, StatsModule, LlmModule],
})
export class AppModule {}
