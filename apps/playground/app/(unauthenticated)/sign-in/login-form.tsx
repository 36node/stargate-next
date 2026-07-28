"use client";

import { useActionState, useCallback, useEffect, useState } from "react";

import { type LoginState, loginAction } from "./action";
import { CaptchaInput } from "./captcha-input";

const initialState: LoginState = {};

type Captcha = { id: string; imageDataUri: string };

export function LoginForm({
  captchaEnabled,
  defaultCaptcha,
  from,
}: {
  captchaEnabled: boolean;
  defaultCaptcha?: Captcha;
  from?: string;
}) {
  const [state, action, pending] = useActionState(loginAction, initialState);
  const [captcha, setCaptcha] = useState<Captcha | undefined>(defaultCaptcha);
  const [captchaCode, setCaptchaCode] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(
    captchaEnabled && !defaultCaptcha
  );

  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    try {
      const response = await fetch("/api/captcha", { cache: "no-store" });
      const data = (await response.json()) as {
        enabled: boolean;
        id?: string;
        imageDataUri?: string;
      };
      setCaptcha(
        data.enabled && data.id && data.imageDataUri
          ? { id: data.id, imageDataUri: data.imageDataUri }
          : undefined
      );
      setCaptchaCode("");
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (captchaEnabled && !defaultCaptcha) {
      loadCaptcha().catch(() => setCaptcha(undefined));
    }
  }, [captchaEnabled, defaultCaptcha, loadCaptcha]);

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
      {captcha || captchaLoading ? (
        <fieldset className="captcha-fieldset">
          <legend>验证码</legend>
          <CaptchaInput
            captcha={captcha}
            code={captchaCode}
            loading={captchaLoading}
            onCodeChange={setCaptchaCode}
            onRefresh={() => {
              loadCaptcha().catch(() => setCaptcha(undefined));
            }}
          />
        </fieldset>
      ) : null}
      {state.error ? <p className="form-error">{state.error}</p> : null}
      <button disabled={pending} type="submit">
        {pending ? "登录中…" : "登录"}
      </button>
    </form>
  );
}
