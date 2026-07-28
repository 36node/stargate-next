import {
  type ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { StargateServiceError } from "@repo/stargate-service";
import type { Response } from "express";

const statusByCategory = {
  conflict: HttpStatus.CONFLICT,
  invalid_argument: HttpStatus.BAD_REQUEST,
  not_found: HttpStatus.NOT_FOUND,
  rate_limited: HttpStatus.TOO_MANY_REQUESTS,
  unauthenticated: HttpStatus.UNAUTHORIZED,
} as const;

@Catch(StargateServiceError)
export class StargateServiceExceptionFilter extends BaseExceptionFilter {
  catch(exception: StargateServiceError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const error = new HttpException(
      { code: exception.code, message: exception.message },
      statusByCategory[exception.category]
    );
    response.status(error.getStatus()).json(error.getResponse());
  }
}
