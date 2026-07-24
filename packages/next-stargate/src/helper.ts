import type { Provider, SignInState } from "./types";

export function safeParseState(
  stateStr: string | null
): SignInState | undefined {
  if (!stateStr) {
    return;
  }

  try {
    const decodedStr = decodeURIComponent(stateStr);
    const parsed = JSON.parse(decodedStr);

    if (typeof parsed === "object" && parsed !== null) {
      return parsed as SignInState;
    }
    return;
  } catch (error) {
    console.error("Failed to parse state:", error);
    return;
  }
}

export function findProviderByPathname(
  providers: Provider[],
  pathname: string
): Provider | undefined {
  return providers.find((p) => {
    if (p.callbackUrl.startsWith("/")) {
      return p.callbackUrl === pathname;
    }
    return new URL(p.callbackUrl).pathname === pathname;
  });
}
