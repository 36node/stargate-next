import { Module } from "@nestjs/common";

import { StargateServiceModule } from "../auth/stargate-service.module.js";
import { TenantController } from "./tenant.controller.js";
import { TenantApiKeyController } from "./tenant-api-key.controller.js";

@Module({
  controllers: [TenantController, TenantApiKeyController],
  imports: [StargateServiceModule],
})
export class TenantModule {}
