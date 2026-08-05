import { Module } from "@nestjs/common";

import { AccountModule } from "./account/account.module";
import { HealthController } from "./platform/health.controller";
import { SessionModule } from "./session/session.module";
import { TenantModule } from "./tenant/tenant.module";

@Module({
  controllers: [HealthController],
  imports: [AccountModule, SessionModule, TenantModule],
})
export class AppModule {}
