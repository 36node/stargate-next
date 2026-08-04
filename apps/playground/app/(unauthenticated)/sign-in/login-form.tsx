"use client";

import { useActionState, useCallback, useEffect, useState } from "react";

import { type LoginState, loginAction } from "./action";
import { CaptchaInput } from "./captcha-input";
import { captchaUrl } from "./captcha-url";

const initialState: LoginState = {};

type Captcha = { id: string; imageDataUri: string };

export function LoginForm({
  captchaEnabled,
  defaultCaptcha,
  from,
  initialTenant,
  tenantOptions,
}: {
  captchaEnabled: boolean;
  defaultCaptcha?: Captcha;
  from?: string;
  initialTenant: string;
  tenantOptions: readonly string[];
}) {
  const [state, action, pending] = useActionState(loginAction, initialState);
  const [captcha, setCaptcha] = useState<Captcha | undefined>(defaultCaptcha);
  const [captchaCode, setCaptchaCode] = useState("");
  const [tenant, setTenant] = useState(initialTenant);
  const [captchaLoading, setCaptchaLoading] = useState(
    captchaEnabled && !defaultCaptcha
  );

  const loadCaptcha = useCallback(async (selectedTenant: string) => {
    setCaptchaLoading(true);
    try {
      const response = await fetch(captchaUrl(selectedTenant), {
        cache: "no-store",
      });
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
      loadCaptcha(initialTenant).catch(() => setCaptcha(undefined));
    }
  }, [captchaEnabled, defaultCaptcha, initialTenant, loadCaptcha]);

  return (
    <form action={action} className="login-form">
      <input name="from" type="hidden" value={from} />
      {captchaEnabled ? (
        <label>
          租户
          <select
            name="tenantId"
            onChange={(event) => {
              const selectedTenant = event.target.value;
              setTenant(selectedTenant);
              setCaptchaCode("");
              loadCaptcha(selectedTenant).catch(() => setCaptcha(undefined));
            }}
            value={tenant}
          >
            {tenantOptions.map((tenantId) => (
              <option key={tenantId} value={tenantId}>
                {tenantId}
              </option>
            ))}
          </select>
        </label>
      ) : null}
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
              loadCaptcha(tenant).catch(() => setCaptcha(undefined));
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
