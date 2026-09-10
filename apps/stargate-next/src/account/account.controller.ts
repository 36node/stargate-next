import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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

import { STARGATE_SERVICE } from "../auth/stargate-service.module.js";
import {
  parsePage,
  plainObjectBody,
  requestContext,
  tenantHeader,
} from "../platform/request-context.js";

const BATCH_MAX_IDS = 100;
const BATCH_MIN_IDS = 1;
const PATCH_FORBIDDEN_FIELDS = ["password", "idempotencyKey"] as const;

type ApiErrorBody = { code: StargateErrorCode; message: string };

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
  async create(@Body() rawBody: unknown, @Req() request: Request) {
    const scope = await this.service.resolveApiCredential(
      request.header("x-api-key"),
      tenantHeader(request)
    );
    const body = plainObjectBody(rawBody, "BODY_INVALID") as AccountInput;
    return this.service.createAccount(scope, body, requestContext(request));
  }

  @Get()
  async list(
    @Query("page[offset]") offsetValue: unknown,
    @Query("page[limit]") limitValue: unknown,
    @Req() request: Request
  ) {
    const scope = await this.service.resolveApiCredential(
      request.header("x-api-key"),
      tenantHeader(request)
    );
    const { limit, offset } = parsePage(offsetValue, limitValue);
    return this.service.listAccounts(scope, limit, offset);
  }

  @Post("@batchGet")
  @HttpCode(200)
  async batchGet(@Body() rawBody: unknown, @Req() request: Request) {
    const scope = await this.service.resolveApiCredential(
      request.header("x-api-key"),
      tenantHeader(request)
    );
    const body = plainObjectBody(rawBody, "BATCH_INVALID");
    if (
      !Array.isArray(body.accountIds) ||
      body.accountIds.length < BATCH_MIN_IDS ||
      body.accountIds.length > BATCH_MAX_IDS ||
      body.accountIds.some((id) => typeof id !== "string" || !id)
    ) {
      throw new BadRequestException({
        code: "BATCH_INVALID",
        message: "accountIds must be an array of 1 to 100 non-empty strings",
      } satisfies ApiErrorBody);
    }
    return this.service.batchGet(scope, body.accountIds);
  }

  @Get(":accountId")
  async get(@Param("accountId") accountId: string, @Req() request: Request) {
    const scope = await this.service.resolveApiCredential(
      request.header("x-api-key"),
      tenantHeader(request)
    );
    return this.service.getAccount(scope, accountId);
  }

  @Patch(":accountId")
  async patch(
    @Param("accountId") accountId: string,
    @Body() rawBody: unknown,
    @Req() request: Request
  ) {
    const scope = await this.service.resolveApiCredential(
      request.header("x-api-key"),
      tenantHeader(request)
    );
    const body = plainObjectBody(rawBody, "PATCH_INVALID");
    if (PATCH_FORBIDDEN_FIELDS.some((field) => Object.hasOwn(body, field))) {
      throw new BadRequestException({
        code: "PATCH_INVALID",
        message: "patch body must not contain password or idempotencyKey",
      } satisfies ApiErrorBody);
    }
    return this.service.patchAccount(
      scope,
      accountId,
      body as AccountPatchInput,
      requestContext(request)
    );
  }

  @Delete(":accountId")
  @HttpCode(204)
  async delete(@Param("accountId") accountId: string, @Req() request: Request) {
    const scope = await this.service.resolveApiCredential(
      request.header("x-api-key"),
      tenantHeader(request)
    );
    await this.service.deleteAccount(scope, accountId, requestContext(request));
  }

  @Post(":accountId/password")
  @HttpCode(204)
  async changePassword(
    @Param("accountId") accountId: string,
    @Body() rawBody: unknown,
    @Req() request: Request
  ) {
    const scope = await this.service.resolveApiCredential(
      request.header("x-api-key"),
      tenantHeader(request)
    );
    const body = plainObjectBody(rawBody, "PASSWORD_INVALID");
    if (typeof body.password !== "string" || !body.password.trim()) {
      throw new BadRequestException({
        code: "PASSWORD_INVALID",
        message: "password is required",
      } satisfies ApiErrorBody);
    }
    await this.service.changePassword(
      scope,
      accountId,
      body.password,
      requestContext(request)
    );
  }
}
