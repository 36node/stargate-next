import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { checkStargateHealth } from "@repo/stargate-service";

@Controller("health")
export class HealthController {
  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  async ready() {
    const { database, redis } = await checkStargateHealth();

    if (!(database.ok && redis.ok)) {
      throw new ServiceUnavailableException({
        checks: { database, redis },
        status: "unavailable",
      });
    }

    return {
      checks: { database, redis },
      status: "ok",
    };
  }
}
