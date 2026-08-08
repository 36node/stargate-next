import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type {
  StargateErrorCode,
  StargateServiceContract,
} from "@repo/stargate-service/contracts";
import type { Request } from "express";

import { STARGATE_SERVICE } from "../auth/stargate-service.module";
import { requestContext, tenantHeader } from "../platform/request-context";

function requiredString(
  value: unknown,
  code: StargateErrorCode,
  message: string
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException({ code, message });
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
    return this.service.createCaptcha(
      tenantHeader(request),
      requestContext(request)
    );
  }

  @Post("captchas/verify")
  @HttpCode(200)
  async verifyCaptcha(
    @Body() body: { code?: unknown; id?: unknown },
    @Req() request: Request
  ) {
    return {
      verified: await this.service.verifyCaptcha(
        tenantHeader(request),
        requiredString(
          body?.id,
          "CAPTCHA_ID_INVALID",
          "captcha id is required"
        ),
        requiredString(
          body?.code,
          "CAPTCHA_CODE_INVALID",
          "captcha code is required"
        )
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
      tenantHeader(request),
      {
        captchaCode: requiredString(
          body?.captchaCode,
          "CAPTCHA_CODE_INVALID",
          "captcha code is required"
        ),
        captchaId: requiredString(
          body?.captchaId,
          "CAPTCHA_ID_INVALID",
          "captcha id is required"
        ),
        login: requiredString(
          body?.login,
          "LOGIN_IDENTIFIER_INVALID",
          "login is required"
        ),
        password: requiredString(
          body?.password,
          "PASSWORD_INVALID",
          "password is required"
        ),
      },
      requestContext(request)
    );
  }

  @Post("auth/refresh")
  @HttpCode(200)
  refresh(@Body() body: { refreshKey?: unknown }, @Req() request: Request) {
    return this.service.refresh(
      tenantHeader(request),
      requiredString(
        body?.refreshKey,
        "REFRESH_KEY_INVALID",
        "refresh key is required"
      ),
      requestContext(request)
    );
  }

  @Post("auth/logout")
  @HttpCode(204)
  async logout(@Req() request: Request) {
    await this.service.logout(
      tenantHeader(request),
      request.header("authorization"),
      requestContext(request)
    );
  }

  @Post("auth/password")
  @HttpCode(204)
  async selfChangePassword(@Body() rawBody: unknown, @Req() request: Request) {
    await this.service.selfChangePassword(
      tenantHeader(request),
      request.header("authorization"),
      rawBody,
      requestContext(request)
    );
  }

  @Get("accounts/:accountId/sessions")
  async listSessions(
    @Param("accountId") accountId: string,
    @Req() request: Request
  ) {
    const scope = await this.service.resolveApiCredential(
      request.header("x-api-key"),
      tenantHeader(request)
    );
    return this.service.listSessions(scope, accountId);
  }

  @Delete("accounts/:accountId/sessions")
  @HttpCode(204)
  async revokeSessions(
    @Param("accountId") accountId: string,
    @Query("sessionId") sessionId: string | undefined,
    @Req() request: Request
  ) {
    const scope = await this.service.resolveApiCredential(
      request.header("x-api-key"),
      tenantHeader(request)
    );
    await this.service.revokeSessions(
      scope,
      accountId,
      requestContext(request),
      sessionId ? "admin_single_revoke" : "admin_bulk_revoke",
      sessionId
    );
  }
}
