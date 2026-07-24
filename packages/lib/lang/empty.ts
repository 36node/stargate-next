/**
 * 空值检查工具函数
 */

/**
 * 检查值是否为空
 *
 * 判断规则：
 * - null 或 undefined 为空
 * - 空字符串 "" 为空
 * - 空数组 [] 为空
 * - 空对象 {} 为空
 * - 空 Map 或 Set 为空
 * - 其他值（包括 0, false）不为空
 *
 * @param value - 要检查的值
 * @returns 如果值为空则返回 true，否则返回 false
 *
 * @example
 * isEmpty(null)        // true
 * isEmpty(undefined)   // true
 * isEmpty('')          // true
 * isEmpty([])          // true
 * isEmpty({})          // true
 * isEmpty(new Map())   // true
 * isEmpty(new Set())   // true
 * isEmpty(0)           // false
 * isEmpty(false)       // false
 * isEmpty('hello')     // false
 * isEmpty([1, 2])      // false
 * isEmpty({ a: 1 })    // false
 */
export function isEmpty(value: unknown): boolean {
  // null 或 undefined
  if (value === null || value === undefined) {
    return true;
  }

  // 字符串
  if (typeof value === "string") {
    return value.length === 0;
  }

  // 数组或类数组对象
  if (Array.isArray(value)) {
    return value.length === 0;
  }

  // Map 或 Set
  if (value instanceof Map || value instanceof Set) {
    return value.size === 0;
  }

  // 普通对象
  if (typeof value === "object") {
    return Object.keys(value).length === 0;
  }

  // 其他类型（数字、布尔值等）不为空
  return false;
}

/**
 * 检查值是否为 null 或 undefined
 *
 * @param value - 要检查的值
 * @returns 如果值为 null 或 undefined 则返回 true，否则返回 false
 *
 * @example
 * isNil(null)        // true
 * isNil(undefined)   // true
 * isNil(0)           // false
 * isNil('')          // false
 * isNil(false)       // false
 * isNil([])          // false
 * isNil({})          // false
 */
export function isNil(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}
