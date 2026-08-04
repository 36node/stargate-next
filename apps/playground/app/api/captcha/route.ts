import { StargateNextClient } from "@repo/stargate-next-sdk";
import { type NextRequest, NextResponse } from "next/server";

import { resolveTenantId } from "@/auth-config";
import { env } from "@/packages/services/env";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (env.STARGATE_AUTH_BACKEND !== "next") {
    return NextResponse.json({ enabled: false });
  }
  const client = new StargateNextClient(env.STARGATE_ENDPOINT, {
    apiKey: env.STARGATE_API_KEY,
  });
  const tenant = resolveTenantId(request.nextUrl.searchParams.get("tenant"));
  try {
    const captcha = await client.createCaptcha(tenant);
    return NextResponse.json(
      { enabled: true, tenant, ...captcha },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { enabled: true, error: "captcha temporarily unavailable" },
      { headers: { "cache-control": "no-store" }, status: 502 }
    );
  }
}
