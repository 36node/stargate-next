import "server-only";

import { STARGATE_AUTH_BACKEND_DEFAULT } from "@/auth-config";
import { nonNegativeIntegerEnv } from "./env-number";

export const env = {
  STARGATE_AUTH_BACKEND:
    process.env.STARGATE_AUTH_BACKEND ?? STARGATE_AUTH_BACKEND_DEFAULT,
  STARGATE_API_KEY: process.env.STARGATE_API_KEY ?? "",
  STARGATE_ENDPOINT: process.env.STARGATE_ENDPOINT ?? "http://localhost:9527",
  JWT_CLOCK_TOLERANCE_SECONDS: nonNegativeIntegerEnv(
    "JWT_CLOCK_TOLERANCE_SECONDS",
    process.env.JWT_CLOCK_TOLERANCE_SECONDS,
    30
  ),
  STARGATE_JWT_PUBLIC_KEY: process.env.STARGATE_JWT_PUBLIC_KEY,
  STARGATE_JWT_SECRET: process.env.STARGATE_JWT_SECRET ?? "",
};
