import "dotenv/config";

import { ValidationPipe } from "@nestjs/common";
import { HttpAdapterHost, NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module";
import { StargateServiceExceptionFilter } from "./auth/stargate-service-exception.filter";
import { createAccessLogMiddleware } from "./platform/access-log.middleware";
import { JsonLogger } from "./platform/json-logger";

async function bootstrap() {
  const logger = new JsonLogger({
    bindings: { service: "stargate-next" },
  });
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger,
  });
  // 关闭 strict，让 controller 的 D23 guard 统一决定业务错误码。
  // biome-ignore lint/correctness/useHookAtTopLevel: Nest application setup
  app.useBodyParser("json", { strict: false });
  // biome-ignore lint/correctness/useHookAtTopLevel: Nest application setup
  app.useBodyParser("urlencoded", { extended: true });
  app.use(createAccessLogMiddleware(logger));
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
    new StargateServiceExceptionFilter(app.get(HttpAdapterHost).httpAdapter)
  );
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 9527);
}

bootstrap();
