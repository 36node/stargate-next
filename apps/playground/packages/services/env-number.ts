/** 提供不依赖 server-only 的环境变量数值解析能力。 */
const NON_NEGATIVE_DECIMAL = /^(0|[1-9][0-9]*)$/;

export function nonNegativeIntegerEnv(
  name: string,
  raw: string | undefined,
  fallback: number
): number {
  if (raw === undefined) {
    return fallback;
  }
  if (!NON_NEGATIVE_DECIMAL.test(raw)) {
    throw new Error(`${name} must be a decimal non-negative integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a safe integer`);
  }
  return value;
}
