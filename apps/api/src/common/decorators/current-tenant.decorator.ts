import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export type TenantContext = {
  venueId?: string;
  workspaceId?: string;
};

export const CurrentTenant = createParamDecorator((_data: unknown, context: ExecutionContext): TenantContext => {
  const request = context.switchToHttp().getRequest<{ tenant?: TenantContext }>();
  return request.tenant || {};
});
