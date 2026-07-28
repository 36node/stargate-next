import { type ArgumentsHost, Catch, ConflictException } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import type { Response } from "express";

@Catch()
export class PrismaExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const code =
      typeof exception === "object" &&
      exception !== null &&
      "code" in exception &&
      typeof exception.code === "string"
        ? exception.code
        : undefined;
    if (code !== "P2002") {
      super.catch(exception, host);
      return;
    }

    const response = host.switchToHttp().getResponse<Response>();
    const error = new ConflictException({
      code: "ACCOUNT_IDENTIFIER_CONFLICT",
      message: "username, email, or phone is already in use",
    });
    response.status(error.getStatus()).json(error.getResponse());
  }
}
