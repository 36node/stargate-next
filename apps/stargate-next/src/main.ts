import "dotenv/config";

import { ValidationPipe } from "@nestjs/common";
import { HttpAdapterHost, NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { PrismaExceptionFilter } from "./prisma-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // biome-ignore lint/correctness/useHookAtTopLevel: Nest application setup
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    })
  );
  // biome-ignore lint/correctness/useHookAtTopLevel: Nest application setup
  app.useGlobalFilters(
    new PrismaExceptionFilter(app.get(HttpAdapterHost).httpAdapter)
  );
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 9527);
}

bootstrap();
