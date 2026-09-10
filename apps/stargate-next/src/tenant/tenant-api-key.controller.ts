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
  StargateServiceContract,
  TenantApiKeyInput,
} from "@repo/stargate-service/contracts";
import type { Request } from "express";

import { STARGATE_SERVICE } from "../auth/stargate-service.module.js";
import {
  allowedKeysOnly,
  optionalNullableString,
  parsePage,
  plainObjectBody,
  requestContext,
  tenantHeader,
} from "../platform/request-context.js";

@Controller("v1/tenant-api-keys")
export class TenantApiKeyController {
  private readonly service: StargateServiceContract;

  constructor(@Inject(STARGATE_SERVICE) service: StargateServiceContract) {
    this.service = service;
  }

  @Post()
  async create(@Body() rawBody: unknown, @Req() request: Request) {
    const scope = await this.service.resolveApiCredential(
      request.header("x-api-key"),
      tenantHeader(request)
    );
    const body =
      rawBody === undefined ? {} : plainObjectBody(rawBody, "BODY_INVALID");
    allowedKeysOnly(body, ["name"], "BODY_INVALID");
    const name = optionalNullableString(body.name, "BODY_INVALID");
    const input: TenantApiKeyInput = {
      ...(name !== undefined ? { name } : {}),
    };
    return this.service.createTenantApiKey(
      scope,
      input,
      requestContext(request)
    );
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
    return this.service.listTenantApiKeys(scope, limit, offset);
  }

  @Patch(":keyId")
  async patch(
    @Param("keyId") keyId: string,
    @Body() rawBody: unknown,
    @Req() request: Request
  ) {
    const scope = await this.service.resolveApiCredential(
      request.header("x-api-key"),
      tenantHeader(request)
    );
    const body = plainObjectBody(rawBody, "PATCH_INVALID");
    allowedKeysOnly(body, ["name"], "PATCH_INVALID");
    if (!Object.hasOwn(body, "name")) {
      throw new BadRequestException({
        code: "PATCH_INVALID",
        message: "patch must include name",
      });
    }
    const name = optionalNullableString(body.name, "PATCH_INVALID");
    if (name === undefined) {
      throw new BadRequestException({
        code: "PATCH_INVALID",
        message: "patch must include name",
      });
    }
    return this.service.patchTenantApiKey(scope, keyId, { name });
  }

  @Delete(":keyId")
  @HttpCode(204)
  async delete(@Param("keyId") keyId: string, @Req() request: Request) {
    const scope = await this.service.resolveApiCredential(
      request.header("x-api-key"),
      tenantHeader(request)
    );
    await this.service.deleteTenantApiKey(
      scope,
      keyId,
      requestContext(request)
    );
  }
}
