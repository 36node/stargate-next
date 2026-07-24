import { Module } from "@nestjs/common";

import { HealthController } from "./platform/health.controller";

@Module({
  controllers: [HealthController],
})
export class AppModule {}
