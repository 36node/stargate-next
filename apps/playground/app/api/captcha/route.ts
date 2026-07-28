import { StargateNextClient } from "@repo/stargate-next-sdk";
import { NextResponse } from "next/server";

import { env } from "@/packages/services/env";

export const dynamic = "force-dynamic";

export async function GET() {
  if (env.STARGATE_AUTH_BACKEND !== "next") {
    return NextResponse.json({ enabled: false });
  }
  const client = new StargateNextClient(env.STARGATE_ENDPOINT, {
    apiKey: env.STARGATE_API_KEY,
  });
  try {
    const captcha = await client.createCaptcha();
    return NextResponse.json(
      { enabled: true, ...captcha },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { enabled: true, error: "captcha temporarily unavailable" },
      { headers: { "cache-control": "no-store" }, status: 502 }
    );
  }
}
