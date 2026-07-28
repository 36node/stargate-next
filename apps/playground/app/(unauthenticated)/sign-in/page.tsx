import { env } from "@repo/services/env";
import { StargateNextClient } from "@repo/stargate-next-sdk";

import { authBackendLabel } from "../../../auth-backend";
import { LoginForm } from "./login-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const captchaEnabled = env.STARGATE_AUTH_BACKEND === "next";
  let defaultCaptcha:
    | Awaited<ReturnType<StargateNextClient["createCaptcha"]>>
    | undefined;
  if (captchaEnabled) {
    try {
      defaultCaptcha = await new StargateNextClient(env.STARGATE_ENDPOINT, {
        apiKey: env.STARGATE_API_KEY,
      }).createCaptcha();
    } catch {
      defaultCaptcha = undefined;
    }
  }

  return (
    <div className="login-card">
      <p className="eyebrow">Welcome back</p>
      <h2>登录</h2>
      <p>使用您的 {authBackendLabel} 账号继续。</p>
      <LoginForm
        captchaEnabled={captchaEnabled}
        defaultCaptcha={defaultCaptcha}
        from={from}
      />
    </div>
  );
}
