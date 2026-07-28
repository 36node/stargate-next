import { Module } from "@nestjs/common";
import {
  createStargateService,
  type StargateServiceContract,
} from "@repo/stargate-service";

export const STARGATE_SERVICE = Symbol("STARGATE_SERVICE");

@Module({
  exports: [STARGATE_SERVICE],
  providers: [
    {
      provide: STARGATE_SERVICE,
      useFactory: (): StargateServiceContract => createStargateService(),
    },
  ],
})
export class StargateServiceModule {}
