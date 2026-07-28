import { env } from "@repo/services/env";

export const authBackendLabel =
  env.STARGATE_AUTH_BACKEND === "next" ? "Stargate Next" : "Stargate Legacy";
