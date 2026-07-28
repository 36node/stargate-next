import { StargateNextClient } from "@repo/stargate-next-sdk";
import type { ReactNode } from "react";

import { env } from "@/packages/services/env";
import { authBackendLabel } from "../../auth-backend";
import { ensureSession } from "../../stargate";
import { logoutAction } from "../action";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await ensureSession();
  const username =
    env.STARGATE_AUTH_BACKEND === "next"
      ? await new StargateNextClient(env.STARGATE_ENDPOINT, {
          apiKey: env.STARGATE_API_KEY,
        })
          .getAccount(session.subject)
          .then((account) => account.username)
          .catch(() => session.subject)
      : session.subject;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <p className="eyebrow">{authBackendLabel}</p>
        <strong>Playground</strong>
        <nav>
          <a href="/">首页</a>
          <a href="/accounts">账号管理</a>
        </nav>
      </aside>
      <div className="app-content">
        <header className="app-header">
          <span>{username}</span>
          <form action={logoutAction}>
            <button className="secondary-button" type="submit">
              退出登录
            </button>
          </form>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
