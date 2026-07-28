import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module";
import { SessionController } from "./session.controller";

@Module({
  controllers: [SessionController],
  imports: [AccountModule],
})
export class SessionModule {}
