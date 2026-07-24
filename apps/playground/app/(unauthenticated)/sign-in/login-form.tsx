"use client";

import { useActionState } from "react";

import { type LoginState, loginAction } from "./action";

const initialState: LoginState = {};

export function LoginForm({ from }: { from?: string }) {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="login-form">
      <input name="from" type="hidden" value={from} />
      <label>
        账号
        <input
          autoComplete="username"
          name="login"
          placeholder="用户名、邮箱或手机号"
          required
        />
      </label>
      <label>
        密码
        <input
          autoComplete="current-password"
          name="password"
          placeholder="请输入密码"
          required
          type="password"
        />
      </label>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      <button disabled={pending} type="submit">
        {pending ? "登录中…" : "登录"}
      </button>
    </form>
  );
}
