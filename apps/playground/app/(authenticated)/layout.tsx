import type { ReactNode } from "react";

import { ensureSession } from "../../stargate";
import { logoutAction } from "../action";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await ensureSession();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <p className="eyebrow">Stargate</p>
        <strong>Playground</strong>
        <nav>
          <a href="/">首页</a>
          <a href="/accounts">账号管理</a>
        </nav>
      </aside>
      <div className="app-content">
        <header className="app-header">
          <span>{session.subject}</span>
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
