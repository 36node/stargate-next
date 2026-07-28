"use client";

import Image from "next/image";

type Captcha = { id: string; imageDataUri: string };

export function CaptchaInput({
  captcha,
  code,
  loading,
  onCodeChange,
  onRefresh,
}: {
  captcha?: Captcha;
  code: string;
  loading: boolean;
  onCodeChange: (code: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="captcha-input">
      <input name="captchaId" type="hidden" value={captcha?.id ?? ""} />
      <input
        autoComplete="one-time-code"
        data-testid="login-captcha"
        inputMode="text"
        maxLength={4}
        name="captchaCode"
        onChange={(event) =>
          onCodeChange(
            event.target.value
              .toUpperCase()
              .replace(/[^ABCDHJKLMNPQRSTUVWXYZ123456789]/g, "")
              .slice(0, 4)
          )
        }
        placeholder="请输入验证码"
        required
        type="text"
        value={code}
      />
      {captcha && !loading ? (
        <button
          aria-label="刷新验证码"
          className="captcha-image-button"
          onClick={onRefresh}
          title="点击刷新验证码"
          type="button"
        >
          <Image
            alt="验证码"
            data-testid="login-captcha-image"
            height={56}
            src={captcha.imageDataUri}
            unoptimized
            width={180}
          />
        </button>
      ) : (
        <div aria-live="polite" className="captcha-placeholder">
          加载中…
        </div>
      )}
    </div>
  );
}
