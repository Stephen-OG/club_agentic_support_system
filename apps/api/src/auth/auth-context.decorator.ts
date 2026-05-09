import { createParamDecorator, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { AuthContext, RequestWithAuth } from "./auth-context";

export const CurrentAuth = createParamDecorator((_data: unknown, context: ExecutionContext): AuthContext => {
  const request = context.switchToHttp().getRequest<RequestWithAuth>();
  if (!request.auth) {
    throw new UnauthorizedException("Auth context missing");
  }
  return request.auth;
});
