import { env } from "@/packages/services/env";

export const authBackendLabel =
  env.STARGATE_AUTH_BACKEND === "next" ? "Stargate Next" : "Stargate Legacy";
