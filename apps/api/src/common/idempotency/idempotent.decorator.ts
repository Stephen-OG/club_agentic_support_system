import { SetMetadata } from "@nestjs/common";

export const IDEMPOTENT_KEY = "idempotent";

export function Idempotent(): MethodDecorator {
  return SetMetadata(IDEMPOTENT_KEY, true);
}
