/**
 * 字符串处理工具函数
 */

// 顶层正则表达式常量（性能优化）
const LEADING_HYPHEN_REGEX = /^-+/;
const TRAILING_HYPHEN_REGEX = /-+$/;
const UPPERCASE_START_REGEX = /^[A-Z]/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 将字符串截断到指定长度，并添加省略号
 * @param str - 要截断的字符串
 * @param maxLength - 最大长度
 * @param suffix - 后缀，默认为 '...'
 * @returns 截断后的字符串
 */
export function truncate(
  str: string,
  maxLength: number,
  suffix = "..."
): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * 将字符串转换为 slug 格式（用于 URL）
 * @param str - 要转换的字符串
 * @returns slug 格式的字符串
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "")
    .replace(/--+/g, "-")
    .replace(LEADING_HYPHEN_REGEX, "")
    .replace(TRAILING_HYPHEN_REGEX, "");
}

/**
 * 将字符串首字母大写
 * @param str - 要转换的字符串
 * @returns 首字母大写的字符串
 */
export function capitalize(str: string): string {
  if (!str) {
    return str;
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * 将字符串转换为驼峰命名
 * @param str - 要转换的字符串
 * @returns 驼峰命名的字符串
 */
export function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ""))
    .replace(UPPERCASE_START_REGEX, (char) => char.toLowerCase());
}

/**
 * 将字符串转换为 PascalCase 命名
 * @param str - 要转换的字符串
 * @returns PascalCase 命名的字符串
 */
export function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * 将字符串转换为 snake_case 命名
 * @param str - 要转换的字符串
 * @returns snake_case 命名的字符串
 */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

/**
 * 生成随机字符串
 * @param length - 字符串长度
 * @param charset - 字符集，默认为字母数字
 * @returns 随机字符串
 */
export function randomString(
  length: number,
  charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}

/**
 * 检查字符串是否为有效的电子邮件格式
 * @param email - 要检查的字符串
 * @returns 是否为有效的电子邮件格式
 */
export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}
