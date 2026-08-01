/** 提供 Playground Cookie 回归共享的删除语义判定。 */
export function hasCookieDeletionSemantics(header: string): boolean {
  const [pair, ...attributes] = header.split(";").map((part) => part.trim());
  if (!pair) {
    return false;
  }
  const separator = pair.indexOf("=");
  if (separator < 0 || pair.slice(separator + 1) !== "") {
    return false;
  }
  const expires = attributes.find((value) =>
    value.toLowerCase().startsWith("expires=")
  );
  const maxAge = attributes.find((value) =>
    value.toLowerCase().startsWith("max-age=")
  );
  const expired = expires
    ? new Date(expires.slice(expires.indexOf("=") + 1)).getTime() <= 0
    : false;
  const maxAgeZero = maxAge?.slice(maxAge.indexOf("=") + 1) === "0";
  return expired || maxAgeZero;
}
