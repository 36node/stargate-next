/**
 * 导航相关工具函数
 * 用于 NavBar、SideNav 等导航组件的通用逻辑
 */

/**
 * 构建带查询参数的 URL
 *
 * @param href - 基础路径
 * @param searchString - 查询字符串（不含 ?）
 * @returns 完整的 URL 路径
 *
 * @example
 * buildHref('/users', 'page=1&size=10')
 * // => '/users?page=1&size=10'
 *
 * buildHref('/users', '')
 * // => '/users'
 */
export const buildHref = (href: string, searchString: string): string =>
  searchString ? `${href}?${searchString}` : href;

/**
 * 判断路由是否处于激活状态
 * 支持精确匹配和前缀匹配（子路由也算激活）
 *
 * @param pathname - 当前路径
 * @param href - 路由的目标路径（可选）
 * @param children - 子路由列表（可选，用于父级路由的激活判断）
 * @returns 是否激活
 *
 * @example
 * // 精确匹配
 * isRouteActive('/users', '/users') // => true
 *
 * // 前缀匹配（子路由）
 * isRouteActive('/users/123', '/users') // => true
 *
 * // 父级路由（通过子路由判断）
 * isRouteActive('/users', undefined, [{ href: '/users' }]) // => true
 */
export const isRouteActive = (
  pathname: string,
  href?: string,
  children?: Array<{ href?: string }>
): boolean => {
  // 如果有 href，检查是否精确匹配或前缀匹配
  if (href) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  // 如果没有 href 但有子路由，检查子路由是否有激活的
  if (children) {
    return children.some(
      (child) => child.href && isRouteActive(pathname, child.href)
    );
  }

  return false;
};
