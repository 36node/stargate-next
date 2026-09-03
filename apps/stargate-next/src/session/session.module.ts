import { Module } from "@nestjs/common";

import { StargateServiceModule } from "../auth/stargate-service.module.js";
import { SessionController } from "./session.controller.js";

@Module({
  controllers: [SessionController],
  imports: [StargateServiceModule],
})
export class SessionModule {}
