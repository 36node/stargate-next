import { LoginForm } from "./login-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;

  return (
    <div className="login-card">
      <p className="eyebrow">Welcome back</p>
      <h2>登录</h2>
      <p>使用您的 Stargate 账号继续。</p>
      <LoginForm from={from} />
    </div>
  );
}
