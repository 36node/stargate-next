import { EventEmitter } from "node:events";

import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { createAccessLogMiddleware } from "../src/platform/access-log.middleware.js";
import { JsonLogger, resolveLogLevel } from "../src/platform/json-logger.js";

function records(lines: string[]): Record<string, unknown>[] {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("JsonLogger", () => {
  it("supports Pino-style message, bindings, and child calls", () => {
    const lines: string[] = [];
    const logger = new JsonLogger({
      bindings: { service: "stargate-next" },
      writer: (line) => lines.push(line),
    });

    logger.info("started");
    logger
      .child({ requestId: "request-1" })
      .warn({ statusCode: 429 }, "limited");

    expect(records(lines)).toMatchObject([
      {
        level: 30,
        msg: "started",
        service: "stargate-next",
      },
      {
        level: 40,
        msg: "limited",
        requestId: "request-1",
        service: "stargate-next",
        statusCode: 429,
      },
    ]);
  });

  it("defaults invalid log levels to info and filters debug records", () => {
    const lines: string[] = [];
    const logger = new JsonLogger({
      level: resolveLogLevel("invalid"),
      writer: (line) => lines.push(line),
    });

    logger.debug("hidden");
    logger.info("visible");

    expect(records(lines)).toHaveLength(1);
    expect(records(lines)[0]).toMatchObject({ level: 30, msg: "visible" });
  });
});

describe("access log middleware", () => {
  it("emits sanitized completed-request fields at info level", () => {
    const lines: string[] = [];
    const logger = new JsonLogger({ writer: (line) => lines.push(line) });
    const middleware = createAccessLogMiddleware(logger);
    const response = Object.assign(new EventEmitter(), {
      statusCode: 201,
    }) as unknown as Response;
    const request = {
      headers: {
        authorization: "Bearer secret",
        "x-api-key": "service-secret",
        "x-forwarded-for": "203.0.113.10, 198.51.100.8",
        "x-request-id": "request-1",
      },
      ip: "127.0.0.1",
      method: "POST",
      path: "/v1/accounts",
      query: { password: "secret" },
    } as unknown as Request;
    const next = vi.fn();

    middleware(request, response, next as NextFunction);
    response.emit("finish");

    expect(next).toHaveBeenCalledOnce();
    expect(records(lines)[0]).toMatchObject({
      clientIp: "203.0.113.10",
      level: 30,
      method: "POST",
      msg: "request completed",
      path: "/v1/accounts",
      requestId: "request-1",
      statusCode: 201,
    });
    expect(lines[0]).not.toContain("service-secret");
    expect(lines[0]).not.toContain("Bearer secret");
    expect(lines[0]).not.toContain('"password"');
  });
});
