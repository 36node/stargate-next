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
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";

import { AuthCoreService } from "../auth-core";

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

@Controller("v1/accounts")
export class AccountController {
  private readonly service: AuthCoreService;

  constructor(@Inject(AuthCoreService) service: AuthCoreService) {
    this.service = service;
  }

  @Post()
  create(
    @Body() body: Parameters<AuthCoreService["createAccount"]>[0],
    @Req() request: Request
  ) {
    this.service.assertApiKey(request.header("x-api-key"));
    return this.service.createAccount(body, context(request));
  }

  @Get()
  list(
    @Query("page[offset]") offsetValue: string | undefined,
    @Query("page[limit]") limitValue: string | undefined,
    @Headers("x-api-key") apiKey?: string
  ) {
    this.service.assertApiKey(apiKey);
    const offset = Number(offsetValue ?? "0");
    const limit = Number(limitValue ?? "10");
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      throw new BadRequestException({
        code: "PAGE_INVALID",
        message:
          "page[offset] must be non-negative and page[limit] must be 1..100",
      });
    }
    return this.service.listAccounts(limit, offset, "/v1/accounts");
  }

  @Post("@batchGet")
  batchGet(
    @Body() body: { accountIds?: unknown },
    @Headers("x-api-key") apiKey?: string
  ) {
    this.service.assertApiKey(apiKey);
    if (
      !Array.isArray(body?.accountIds) ||
      body.accountIds.length > 100 ||
      body.accountIds.some((id) => typeof id !== "string" || !id)
    ) {
      throw new BadRequestException({
        code: "BATCH_INVALID",
        message: "accountIds must be an array of at most 100 non-empty strings",
      });
    }
    return this.service.batchGet(body.accountIds);
  }

  @Get(":accountId")
  get(
    @Param("accountId") accountId: string,
    @Headers("x-api-key") apiKey?: string
  ) {
    this.service.assertApiKey(apiKey);
    return this.service.getAccount(accountId);
  }

  @Patch(":accountId")
  patch(
    @Param("accountId") accountId: string,
    @Body() body: Parameters<AuthCoreService["patchAccount"]>[1],
    @Req() request: Request
  ) {
    this.service.assertApiKey(request.header("x-api-key"));
    return this.service.patchAccount(accountId, body, context(request));
  }

  @Delete(":accountId")
  @HttpCode(204)
  async delete(@Param("accountId") accountId: string, @Req() request: Request) {
    this.service.assertApiKey(request.header("x-api-key"));
    await this.service.deleteAccount(accountId, context(request));
  }

  @Post(":accountId/password")
  @HttpCode(204)
  async changePassword(
    @Param("accountId") accountId: string,
    @Body() body: { password?: unknown },
    @Req() request: Request
  ) {
    if (typeof body?.password !== "string" || !body.password.trim()) {
      throw new BadRequestException({
        code: "PASSWORD_INVALID",
        message: "password is required",
      });
    }
    this.service.assertApiKey(request.header("x-api-key"));
    await this.service.changePassword(
      accountId,
      body.password,
      context(request)
    );
  }
}
