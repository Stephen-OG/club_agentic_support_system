import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true
    })
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("GuestOS API")
    .setDescription("AI guest support and staff orchestration API")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  const config = app.get(ConfigService);
  const port = config.get<number>("PORT") || 4000;
  const host = config.get<string>("HOST") || "127.0.0.1";
  console.log(`Starting API server on ${host}:${port}...`);
  await app.listen(port, host);
}

void bootstrap();
