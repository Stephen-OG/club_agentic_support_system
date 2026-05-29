import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import type { GuestRequestAction } from "@guestos/shared";

export class GuestRequestActionDto {
  @IsIn(["cancel", "confirm_resolved", "not_satisfied"])
  action!: GuestRequestAction;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  sessionId?: string;
}
