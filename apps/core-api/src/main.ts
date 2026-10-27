import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter.js";
import { envFlag } from "./config/env.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService);
  const port = config.get<number>("PORT", 3000);
  const corsOrigins = config
    .get<string>("CORS_ORIGINS", "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });
  app.enableShutdownHooks();

  // Behind Traefik (+ nginx in production) request.ip must be the real client address,
  // otherwise the login limiter would key every request on the proxy's IP.
  const hops = Number(config.get<string>("TRUST_PROXY_HOPS", "1"));
  app
    .getHttpAdapter()
    .getInstance()
    .set("trust proxy", Number.isInteger(hops) && hops >= 0 ? hops : 1);

  // The API docs reveal every endpoint, so they are opt-in in production.
  const swaggerEnabled = envFlag(
    config.get<string>("ENABLE_SWAGGER"),
    config.get<string>("NODE_ENV") !== "production",
  );
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Minecraft Platform API")
      .setDescription("Bedrock server, packs, worlds, backups and logs management API")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/docs", app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // Set to a generous but finite value, e.g., 5 minutes
  const FIVE_MINUTES = 5 * 60 * 1000;
  const server = app.getHttpServer();
  server.timeout = FIVE_MINUTES;
  server.requestTimeout = FIVE_MINUTES;
  server.headersTimeout = 60 * 1000;
  server.timeout = 0;
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(
    `core-api listening on http://0.0.0.0:${port}${swaggerEnabled ? " (docs: /api/docs)" : ""}`,
  );
}

await bootstrap();
