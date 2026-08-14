import 'dotenv/config';
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // CORS：按 config/site.json 的 allowedOrigins 收紧；未配置时才放开（开发模式）
  const config = app.get(ConfigService);
  const origins = Array.isArray(config.site.allowedOrigins) && config.site.allowedOrigins.length > 0
    ? config.site.allowedOrigins
    : true;
  app.enableCors({ origin: origins, credentials: true });
  app.useStaticAssets(config.uploadsDir, { prefix: '/uploads/' });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`[myblog-server] http://localhost:${port}/api · 《${config.site.name}》`);
  console.log(`[myblog-server] 上传目录: ${config.uploadsDir}`);
}

void bootstrap();
