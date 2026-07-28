import { Module } from "@nestjs/common";

import { StargateServiceModule } from "../auth/stargate-service.module";
import { SessionController } from "./session.controller";

@Module({
  controllers: [SessionController],
  imports: [StargateServiceModule],
})
export class SessionModule {}
