import { Module } from "@nestjs/common";

import { AuthCoreService } from "../auth-core";
import { AccountController } from "./account.controller";

@Module({
  controllers: [AccountController],
  exports: [AuthCoreService],
  providers: [AuthCoreService],
})
export class AccountModule {}
