import type { NextFunction, Request, Response } from "express";

import type { JsonLogger } from "./json-logger.js";

function clientIp(request: Request): string | undefined {
  const forwardedFor = request.headers["x-forwarded-for"];
  return typeof forwardedFor === "string"
    ? forwardedFor.split(",")[0]?.trim()
    : request.ip;
}

function requestId(request: Request): string | undefined {
  const value = request.headers["x-request-id"];
  return typeof value === "string" ? value : undefined;
}

export function createAccessLogMiddleware(logger: JsonLogger) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const startedAt = performance.now();
    response.once("finish", () => {
      logger.info(
        {
          clientIp: clientIp(request),
          durationMs: Math.round(performance.now() - startedAt),
          method: request.method,
          path: request.path,
          requestId: requestId(request),
          statusCode: response.statusCode,
        },
        "request completed"
      );
    });
    next();
  };
}
