import http from "k6/http";

export function requireEnv(name) {
  const value = __ENV[name];
  if (!value) {
    throw new Error(`${name} is required for load tests`);
  }
  return value;
}

export function endpoint() {
  return requireEnv("STARGATE_ENDPOINT").replace(/\/$/, "");
}

/**
 * @param {string} path
 * @param {string} method
 * @param {{
 *   apiKey?: string,
 *   body?: unknown,
 *   forwardedFor?: string,
 *   tags?: Record<string, string>,
 *   tenantId?: string,
 * }} [options]
 */
export function request(path, method, options = {}) {
  const { apiKey, body, forwardedFor, tags, tenantId } = options;
  const headers = {};
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  if (tenantId !== undefined) {
    headers["x-tenant-id"] = tenantId;
  }
  if (forwardedFor) {
    headers["x-forwarded-for"] = forwardedFor;
  }

  const response = http.request(
    method,
    `${endpoint()}${path}`,
    body === undefined ? null : JSON.stringify(body),
    { headers, tags }
  );

  let parsed;
  if (response.status === 204 || response.body === null || response.body === "") {
    parsed = undefined;
  } else {
    try {
      parsed = response.json();
    } catch {
      parsed = undefined;
    }
  }

  return {
    body: parsed,
    response,
    status: response.status,
  };
}
