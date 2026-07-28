/**
 * 判断用户是否有权限访问
 *
 * 用户权限 a:b:c，可以用通配符 * 匹配，例如 a:b:*，也可以是 a:*:c，也可以是 a:b*:c
 * 可以用 a:(b|c):d 代表 a:b:d 或者 a:c:d
 *
 * 还支持排除权限：
 * - a:b:!c 表示 a:b:* 但不允许 a:b:c
 * - a:b:!(c|d) 表示 a:b:* 但不允许 a:b:c 和 a:b:d
 *
 * required 权限可以是多个，是 AND 关系，必须同时满足才返回 true
 */
export function checkPermission(
  userPermissions: string[],
  ...required: string[]
): boolean {
  if (!required || required.length === 0) {
    return true;
  }

  const permissionToRegex = (permission: string): RegExp => {
    const parts = permission.split(":");
    const regexParts = parts.map((part) => {
      if (part.startsWith("!")) {
        if (part.startsWith("!(")) {
          const exclusions = part.slice(2, -1).split("|");
          return `(?!${exclusions.join("$|")}$)[^:]*`;
        }
        return `(?!${part.slice(1)}$)[^:]*`;
      }
      return part === "*" ? ".*" : part.replace(/\*/g, "[^:]*");
    });
    return new RegExp(`^${regexParts.join(":")}$`);
  };

  const matchesPermission = (
    userPermission: string,
    requiredPermission: string
  ): boolean => {
    const regex = permissionToRegex(userPermission);
    return regex.test(requiredPermission);
  };

  return required.every((reqPerm) =>
    userPermissions.some((userPerm) => matchesPermission(userPerm, reqPerm))
  );
}
