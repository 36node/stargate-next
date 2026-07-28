import "server-only";

export const env = {
  STARGATE_AUTH_BACKEND: process.env.STARGATE_AUTH_BACKEND ?? "next",
  STARGATE_API_KEY: process.env.STARGATE_API_KEY ?? "",
  STARGATE_ENDPOINT: process.env.STARGATE_ENDPOINT ?? "http://localhost:9527",
  STARGATE_JWT_PUBLIC_KEY: process.env.STARGATE_JWT_PUBLIC_KEY,
  STARGATE_JWT_SECRET: process.env.STARGATE_JWT_SECRET ?? "",
};
