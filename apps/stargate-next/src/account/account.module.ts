import { Module } from "@nestjs/common";

import { StargateServiceModule } from "../auth/stargate-service.module";
import { AccountController } from "./account.controller";

@Module({
  controllers: [AccountController],
  exports: [StargateServiceModule],
  imports: [StargateServiceModule],
})
export class AccountModule {}
