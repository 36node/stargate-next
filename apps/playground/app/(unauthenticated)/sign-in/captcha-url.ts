export function captchaUrl(tenantId: string): string {
  return `/api/captcha?tenant=${encodeURIComponent(tenantId)}`;
}
