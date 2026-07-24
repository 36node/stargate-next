const defaultEndpoint = "http://localhost:3000";

export const env = {
  STARGATE_API_KEY: process.env.STARGATE_API_KEY ?? "",
  STARGATE_ENDPOINT: process.env.STARGATE_ENDPOINT ?? defaultEndpoint,
  STARGATE_JWT_PUBLIC_KEY: process.env.STARGATE_JWT_PUBLIC_KEY,
  STARGATE_JWT_SECRET: process.env.STARGATE_JWT_SECRET ?? "",
};
