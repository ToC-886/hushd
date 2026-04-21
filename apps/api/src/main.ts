import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix("v1");
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);  // eslint-disable-next-line no-console
  console.log(`api listening on http://localhost:${port}/v1`);
}

void bootstrap();
