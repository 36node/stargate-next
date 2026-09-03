import { Module } from "@nestjs/common";

import { AccountModule } from "./account/account.module.js";
import { HealthController } from "./platform/health.controller.js";
import { SessionModule } from "./session/session.module.js";
import { TenantModule } from "./tenant/tenant.module.js";

@Module({
  controllers: [HealthController],
  imports: [AccountModule, SessionModule, TenantModule],
})
export class AppModule {}
