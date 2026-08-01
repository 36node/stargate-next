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
import type {
  AccountInput,
  AccountPatchInput,
  StargateErrorCode,
  StargateServiceContract,
} from "@repo/stargate-service/contracts";
import type { Request } from "express";

import { STARGATE_SERVICE } from "../auth/stargate-service.module";

const BATCH_MAX_IDS = 100;
const BATCH_MIN_IDS = 1;
const PAGE_LIMIT_DEFAULT = 10;
const PAGE_LIMIT_MAX = 100;
const PATCH_FORBIDDEN_FIELDS = ["password", "idempotencyKey"] as const;

type ApiErrorBody = { code: StargateErrorCode; message: string };

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
  private readonly service: StargateServiceContract;

  constructor(
    @Inject(STARGATE_SERVICE)
    service: StargateServiceContract
  ) {
    this.service = service;
  }

  @Post()
  create(@Body() body: AccountInput, @Req() request: Request) {
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
    const limit = Number(limitValue ?? String(PAGE_LIMIT_DEFAULT));
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > PAGE_LIMIT_MAX
    ) {
      throw new BadRequestException({
        code: "PAGE_INVALID",
        message:
          "page[offset] must be non-negative and page[limit] must be 1..100",
      } satisfies ApiErrorBody);
    }
    return this.service.listAccounts(limit, offset, "/v1/accounts");
  }

  @Post("@batchGet")
  @HttpCode(200)
  batchGet(
    @Body() body: { accountIds?: unknown },
    @Headers("x-api-key") apiKey?: string
  ) {
    this.service.assertApiKey(apiKey);
    if (
      !Array.isArray(body?.accountIds) ||
      body.accountIds.length < BATCH_MIN_IDS ||
      body.accountIds.length > BATCH_MAX_IDS ||
      body.accountIds.some((id) => typeof id !== "string" || !id)
    ) {
      throw new BadRequestException({
        code: "BATCH_INVALID",
        message: "accountIds must be an array of 1 to 100 non-empty strings",
      } satisfies ApiErrorBody);
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
    @Body() body: AccountPatchInput | undefined,
    @Req() request: Request
  ) {
    this.service.assertApiKey(request.header("x-api-key"));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new BadRequestException({
        code: "PATCH_INVALID",
        message: "patch body must be a JSON object",
      } satisfies ApiErrorBody);
    }
    if (PATCH_FORBIDDEN_FIELDS.some((field) => Object.hasOwn(body, field))) {
      throw new BadRequestException({
        code: "PATCH_INVALID",
        message: "patch body must not contain password or idempotencyKey",
      } satisfies ApiErrorBody);
    }
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
    this.service.assertApiKey(request.header("x-api-key"));
    if (typeof body?.password !== "string" || !body.password.trim()) {
      throw new BadRequestException({
        code: "PASSWORD_INVALID",
        message: "password is required",
      } satisfies ApiErrorBody);
    }
    await this.service.changePassword(
      accountId,
      body.password,
      context(request)
    );
  }
}
