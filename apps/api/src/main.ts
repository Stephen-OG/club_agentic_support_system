import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { getApiPort } from "./bootstrap-config";
import { StructuredLogger } from "./common/logger/structured-logger.service";
import { HttpLoggingInterceptor } from "./common/logger/http-logging.interceptor";
import { loadLocalEnvOverrides } from "./local-env";
import {
  applySecurityHeaders,
  assertProductionSecurityConfig,
  getApiHost,
  isCorsOriginAllowed,
  parseCorsOrigins,
  shouldExposeApiDocs
} from "./security/security-config";

loadLocalEnvOverrides();

async function bootstrap() {
  assertProductionSecurityConfig(process.env);

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true
  });

  // Use structured JSON logger
  const logger = app.get(StructuredLogger);
  app.useLogger(logger);

  // Log all HTTP requests
  app.useGlobalInterceptors(new HttpLoggingInterceptor(logger));

  const config = app.get(ConfigService);
  const allowedOrigins = parseCorsOrigins(config.get<string>("CORS_ORIGINS"));

  if (config.get<string>("TRUST_PROXY") !== "false") {
    app.getHttpAdapter().getInstance().set("trust proxy", 1);
  }

  applySecurityHeaders(app, process.env);
  app.enableCors({
    credentials: true,
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      callback(null, isCorsOriginAllowed(origin, allowedOrigins));
    }
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
      exceptionFactory: (errors) => {
        const message = errors.map((e) => Object.values(e.constraints ?? {}).join(", ")).join("; ");
        return new BadRequestException(message || "Validation failed");
      }
    })
  );

  if (shouldExposeApiDocs(process.env)) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Madupe API")
      .setDescription("AI guest support and staff orchestration API")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document);
  }

  const port = getApiPort(process.env);
  const host = getApiHost(process.env);
  logger.log(`Starting API server on ${host}:${port}`, "Bootstrap");
  await app.listen(port, host);
}

void bootstrap();
