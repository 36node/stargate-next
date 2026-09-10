import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type {
  StargateServiceContract,
  TenantInput,
  TenantPatchInput,
  TenantStatus,
} from "@repo/stargate-service/contracts";
import type { Request } from "express";

import { STARGATE_SERVICE } from "../auth/stargate-service.module.js";
import {
  allowedKeysOnly,
  optionalNullableString,
  optionalString,
  parsePage,
  plainObjectBody,
  requestContext,
  singleQueryValue,
} from "../platform/request-context.js";

@Controller("v1/tenants")
export class TenantController {
  private readonly service: StargateServiceContract;

  constructor(@Inject(STARGATE_SERVICE) service: StargateServiceContract) {
    this.service = service;
  }

  @Post()
  create(@Body() rawBody: unknown, @Req() request: Request) {
    const scope = this.service.resolveAdminCredential(
      request.header("x-api-key")
    );
    const body = plainObjectBody(rawBody, "BODY_INVALID");
    allowedKeysOnly(body, ["id", "name", "settings"], "BODY_INVALID");
    let id: string | undefined;
    if (body.id !== undefined) {
      if (typeof body.id !== "string") {
        throw new BadRequestException({
          code: "TENANT_ID_INVALID",
          message: "tenant id must be a string",
        });
      }
      id = body.id;
    }
    const input: TenantInput = {
      ...(id !== undefined ? { id } : {}),
      ...(body.name !== undefined
        ? { name: optionalNullableString(body.name, "BODY_INVALID") }
        : {}),
      ...(body.settings !== undefined
        ? { settings: body.settings as TenantInput["settings"] }
        : {}),
    };
    return this.service.createTenant(scope, input, requestContext(request));
  }

  @Get()
  list(
    @Query("page[offset]") offsetValue: unknown,
    @Query("page[limit]") limitValue: unknown,
    @Query("filter[name]") nameValue: unknown,
    @Req() request: Request
  ) {
    const scope = this.service.resolveAdminCredential(
      request.header("x-api-key")
    );
    const { limit, offset } = parsePage(offsetValue, limitValue);
    const name = singleQueryValue(nameValue);
    return this.service.listTenants(scope, limit, offset, name);
  }

  @Get(":tenantId")
  get(@Param("tenantId") tenantId: string, @Req() request: Request) {
    const scope = this.service.resolveAdminCredential(
      request.header("x-api-key")
    );
    return this.service.getTenant(scope, tenantId);
  }

  @Patch(":tenantId")
  patch(
    @Param("tenantId") tenantId: string,
    @Body() rawBody: unknown,
    @Req() request: Request
  ) {
    const scope = this.service.resolveAdminCredential(
      request.header("x-api-key")
    );
    const body = plainObjectBody(rawBody, "PATCH_INVALID");
    allowedKeysOnly(body, ["name", "status", "settings"], "PATCH_INVALID");
    const name = optionalNullableString(body.name, "PATCH_INVALID");
    const status = optionalString(body.status, "PATCH_INVALID");
    if (status !== undefined && status !== "active" && status !== "disabled") {
      throw new BadRequestException({
        code: "PATCH_INVALID",
        message: "status must be active or disabled",
      });
    }
    if (
      name === undefined &&
      status === undefined &&
      body.settings === undefined
    ) {
      throw new BadRequestException({
        code: "PATCH_INVALID",
        message: "patch must include name, status, or settings",
      });
    }
    const input: TenantPatchInput = {
      ...(name !== undefined ? { name } : {}),
      ...(status !== undefined ? { status: status as TenantStatus } : {}),
      ...(body.settings !== undefined
        ? { settings: body.settings as TenantPatchInput["settings"] }
        : {}),
    };
    return this.service.patchTenant(
      scope,
      tenantId,
      input,
      requestContext(request)
    );
  }
}
