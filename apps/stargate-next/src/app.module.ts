import { Module } from "@nestjs/common";

import { AccountModule } from "./account/account.module";
import { HealthController } from "./platform/health.controller";
import { SessionModule } from "./session/session.module";

@Module({
  controllers: [HealthController],
  imports: [AccountModule, SessionModule],
})
export class AppModule {}
