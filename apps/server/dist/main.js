"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
require("reflect-metadata");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const node_path_1 = require("node:path");
const app_module_1 = require("./app.module");
const config_service_1 = require("./config/config.service");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, transform: true }));
    app.disable('x-powered-by');
    // 基础安全响应头（不引依赖，个人博客足够）
    app.use((_req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        next();
    });
    const config = app.get(config_service_1.ConfigService);
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
    // 静态公开目录：
    // - /uploads/img/    上传图片（头像/封面/正文插图）
    // - /uploads/models/ Live2D 模型资源（小人需要在每个访客浏览器加载，公开是设计行为）
    // md/pdf/docx 原始文件走受控下载（/api/uploads/files/:name，需口令），不在此公开
    const staticAssetsOptions = { maxAge: '7d' };
    app.useStaticAssets((0, node_path_1.join)(config.uploadsDir, 'img'), { prefix: '/uploads/img/', ...staticAssetsOptions });
    app.useStaticAssets((0, node_path_1.join)(config.uploadsDir, 'models'), { prefix: '/uploads/models/', ...staticAssetsOptions });
    const port = Number(process.env.PORT ?? 3000);
    await app.listen(port);
    console.log(`[myblog-server] http://localhost:${port}/api · 《${config.site.name}》`);
    console.log(`[myblog-server] 上传目录: ${config.uploadsDir}`);
}
void bootstrap();
//# sourceMappingURL=main.js.map