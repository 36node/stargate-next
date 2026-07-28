import { authBackendLabel } from "../../auth-backend";

export default function HomePage() {
  return (
    <section className="placeholder-card">
      <p className="eyebrow">{authBackendLabel} Playground</p>
      <h1>账号管理即将推出</h1>
      <p>此页面将用于浏览和管理 {authBackendLabel} 账号。</p>
    </section>
  );
}
