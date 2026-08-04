import { Module } from "@nestjs/common";

import { StargateServiceModule } from "../auth/stargate-service.module";
import { TenantController } from "./tenant.controller";
import { TenantApiKeyController } from "./tenant-api-key.controller";

@Module({
  controllers: [TenantController, TenantApiKeyController],
  imports: [StargateServiceModule],
})
export class TenantModule {}
