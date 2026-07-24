/**
 * 对象操作工具函数
 */

const DIGIT_REGEX = /^\d+$/;

/**
 * 根据路径获取对象中的嵌套值
 *
 * @param obj - 要获取值的对象
 * @param path - 属性路径，支持点号分隔（如 'a.b.c'）或数组索引（如 'a[0].b'）
 * @param defaultValue - 如果路径不存在时返回的默认值
 * @returns 路径对应的值，如果不存在则返回 defaultValue
 *
 * @example
 * get({ a: { b: 1 } }, 'a.b')           // 1
 * get({ a: [{ b: 1 }] }, 'a[0].b')      // 1
 * get({ a: { b: 1 } }, 'a.c', 'default') // 'default'
 */
export function get<T = unknown>(
  obj: Record<string, unknown> | null | undefined,
  path: string,
  defaultValue?: T
): T | undefined {
  if (obj === null || obj === undefined) {
    return defaultValue;
  }

  // 将路径转换为数组，处理点号和数组索引
  const keys = path
    .replace(/\[(\d+)\]/g, ".$1") // 将 [0] 转换为 .0
    .split(".")
    .filter(Boolean);

  let result: unknown = obj;

  for (const key of keys) {
    if (result === null || result === undefined) {
      return defaultValue;
    }
    result = (result as Record<string, unknown>)[key];
  }

  return (result === undefined ? defaultValue : result) as T | undefined;
}

/**
 * 根据路径设置对象中的嵌套值
 *
 * @param obj - 要设置值的对象
 * @param path - 属性路径，支持点号分隔（如 'a.b.c'）或数组索引（如 'a[0].b'）
 * @param value - 要设置的值
 * @returns 原对象（已修改）
 *
 * @example
 * const obj = {};
 * set(obj, 'a.b', 1)        // { a: { b: 1 } }
 * set(obj, 'a[0].b', 2)     // { a: [{ b: 2 }] }
 */
export function set<T extends Record<string, unknown>>(
  obj: T,
  path: string,
  value: unknown
): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // 将路径转换为数组，处理点号和数组索引
  const keys = path
    .replace(/\[(\d+)\]/g, ".$1") // 将 [0] 转换为 .0
    .split(".")
    .filter(Boolean);

  let current: Record<string, unknown> = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const nextKey = keys[i + 1];

    if (current[key] === undefined || current[key] === null) {
      // 根据下一个键是数字还是字符串决定创建数组还是对象
      current[key] = DIGIT_REGEX.test(nextKey) ? [] : {};
    }

    current = current[key] as Record<string, unknown>;
  }

  const lastKey = keys.at(-1);
  if (lastKey !== undefined) {
    current[lastKey] = value;
  }

  return obj;
}
