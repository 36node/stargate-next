import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { StargateServiceContract } from "@repo/stargate-service/contracts";
import type { Request } from "express";

import { STARGATE_SERVICE } from "../auth/stargate-service.module";

function context(request: Request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  return {
    ip:
      typeof forwardedFor === "string"
        ? forwardedFor.split(",")[0]?.trim()
        : request.ip,
    requestId:
      typeof request.headers["x-request-id"] === "string"
        ? request.headers["x-request-id"]
        : undefined,
    userAgent:
      typeof request.headers["user-agent"] === "string"
        ? request.headers["user-agent"]
        : undefined,
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException({
      code: `${field.toUpperCase()}_INVALID`,
      message: `${field} is required`,
    });
  }
  return value;
}

@Controller("v1")
export class SessionController {
  private readonly service: StargateServiceContract;

  constructor(
    @Inject(STARGATE_SERVICE)
    service: StargateServiceContract
  ) {
    this.service = service;
  }

  @Post("captchas")
  createCaptcha(@Req() request: Request) {
    return this.service.createCaptcha(context(request));
  }

  @Post("captchas/verify")
  @HttpCode(200)
  async verifyCaptcha(@Body() body: { code?: unknown; id?: unknown }) {
    return {
      verified: await this.service.verifyCaptcha(
        requiredString(body?.id, "captchaId"),
        requiredString(body?.code, "captchaCode")
      ),
    };
  }

  @Post("auth/login")
  @HttpCode(200)
  login(
    @Body() body: {
      captchaCode?: unknown;
      captchaId?: unknown;
      login?: unknown;
      password?: unknown;
    },
    @Req() request: Request
  ) {
    return this.service.login(
      {
        captchaCode: requiredString(body?.captchaCode, "captchaCode"),
        captchaId: requiredString(body?.captchaId, "captchaId"),
        login: requiredString(body?.login, "login"),
        password: requiredString(body?.password, "password"),
      },
      context(request)
    );
  }

  @Post("auth/refresh")
  @HttpCode(200)
  refresh(@Body() body: { refreshKey?: unknown }, @Req() request: Request) {
    return this.service.refresh(
      requiredString(body?.refreshKey, "refreshKey"),
      context(request)
    );
  }

  @Post("auth/logout")
  @HttpCode(204)
  async logout(
    @Headers("authorization") authorization: string | undefined,
    @Req() request: Request
  ) {
    const claims = this.service.accessTokenClaims(authorization);
    await this.service.revokeSessions(
      claims.accountId,
      context(request),
      "logout",
      claims.sessionId
    );
  }

  @Get("accounts/:accountId/sessions")
  listSessions(
    @Param("accountId") accountId: string,
    @Headers("x-api-key") apiKey?: string
  ) {
    this.service.assertApiKey(apiKey);
    return this.service.listSessions(accountId);
  }

  @Delete("accounts/:accountId/sessions")
  @HttpCode(204)
  async revokeSessions(
    @Param("accountId") accountId: string,
    @Query("sessionId") sessionId: string | undefined,
    @Req() request: Request
  ) {
    this.service.assertApiKey(request.header("x-api-key"));
    await this.service.revokeSessions(
      accountId,
      context(request),
      sessionId ? "admin_single_revoke" : "admin_bulk_revoke",
      sessionId
    );
  }
}
