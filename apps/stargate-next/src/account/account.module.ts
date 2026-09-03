import { Module } from "@nestjs/common";

import { StargateServiceModule } from "../auth/stargate-service.module.js";
import { AccountController } from "./account.controller.js";

@Module({
  controllers: [AccountController],
  exports: [StargateServiceModule],
  imports: [StargateServiceModule],
})
export class AccountModule {}
