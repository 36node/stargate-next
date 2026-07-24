import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { checkDbHealth } from "@repo/db";
import { checkRedisHealth } from "@repo/redis";

@Controller("health")
export class HealthController {
  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  async ready() {
    const [database, redis] = await Promise.all([
      checkDbHealth(),
      checkRedisHealth(),
    ]);

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
