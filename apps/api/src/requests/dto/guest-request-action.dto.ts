import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";
import type { GuestRequestAction } from "@guestos/shared";

export class GuestRequestActionDto {
  @IsIn(["cancel", "confirm_resolved", "not_satisfied"])
  action!: GuestRequestAction;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
}
