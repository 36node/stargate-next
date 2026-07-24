import type { ReactNode } from "react";

export default function UnauthenticatedLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <main className="login-shell">
      <section className="login-brand">
        <p className="eyebrow">36node</p>
        <h1>Stargate Playground</h1>
        <p>Authentication administration and account management.</p>
      </section>
      <section className="login-panel">{children}</section>
    </main>
  );
}
