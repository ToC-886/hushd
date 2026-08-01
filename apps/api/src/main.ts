import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { csrfHeaderMiddleware } from "./auth/csrf.middleware";
import { validateEnv } from "./config/env.validation";
import { requestIdMiddleware } from "./observability/request-id.middleware";

function parseCorsOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

async function bootstrap() {
  const logger = new Logger("bootstrap");
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const config = app.get(ConfigService);

  validateEnv(config);

  // Correlation id for every request, before any other handler runs.
  app.use(requestIdMiddleware);

  // Cookie-authenticated mutations must carry a custom header (CSRF backstop).
  app.use(csrfHeaderMiddleware);

  // Behind a TLS-terminating reverse proxy (Render, Cloudflare, nginx).
  app.set("trust proxy", 1);

  app.use(
    helmet({
      // API serves JSON only; CSP is enforced by the web/admin frontends.
      contentSecurityPolicy: false,
    }),
  );

  const corsOrigins = parseCorsOrigins(config.get<string>("CORS_ORIGINS"));
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    // Cookies are the browser auth transport; the origin allowlist above keeps
    // credentialed requests limited to the known frontends.
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.setGlobalPrefix("v1");

  app.enableShutdownHooks();

  const port = Number(config.get<string>("PORT") ?? 3001);
  await app.listen(port);
  logger.log(`api listening on port ${port} (prefix /v1)`);
}

void bootstrap();
