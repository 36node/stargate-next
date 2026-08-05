import { authBackendLabel } from "../../auth-backend";
import { ensureSession } from "../../stargate";

export default async function HomePage() {
  const session = await ensureSession();
  return (
    <section className="placeholder-card">
      <p className="eyebrow">{authBackendLabel} Playground</p>
      <h1>账号管理即将推出</h1>
      <p>此页面将用于浏览和管理 {authBackendLabel} 账号。</p>
      <p>当前租户：{session.tenantId ?? "default"}</p>
      <p>当前账号：{session.subject}</p>
    </section>
  );
}
