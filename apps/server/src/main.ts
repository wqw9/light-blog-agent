import 'dotenv/config';
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.disable('x-powered-by');

  // 基础安全响应头（不引依赖，个人博客足够）
  app.use((_req: { headers: unknown }, res: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  const config = app.get(ConfigService);

  // CORS：按 config/site.json 的 allowedOrigins 收紧；
  // 未配置时回退到本地开发地址（绝不使用"反射任意来源"的开放模式）
  const configuredOrigins = Array.isArray(config.site.allowedOrigins) && config.site.allowedOrigins.length > 0;
  const origins = configuredOrigins
    ? config.site.allowedOrigins
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];
  if (!configuredOrigins) {
    console.warn('[myblog] config/site.json 未配置 allowedOrigins，已回退到本地开发地址；生产部署请显式配置你的域名');
  }
  app.enableCors({ origin: origins, credentials: true });

  // 只静态公开图片目录；md/pdf/docx 原始文件走受控下载（/api/uploads/files/:name，需口令）
  app.useStaticAssets(join(config.uploadsDir, 'img'), { prefix: '/uploads/img/' });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`[myblog-server] http://localhost:${port}/api · 《${config.site.name}》`);
  console.log(`[myblog-server] 上传目录: ${config.uploadsDir}`);
}

void bootstrap();
