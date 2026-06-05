import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from "class-validator";
import { requestStatuses } from "@madupe/shared";

export class ListVenueRequestsDto {
  @IsOptional()
  @Transform(({ value }) => (value === "true" || value === true ? true : false))
  @IsBoolean()
  page?: boolean;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsISO8601()
  cursor?: string;

  @IsOptional()
  @IsIn(requestStatuses)
  status?: (typeof requestStatuses)[number];

  @IsOptional()
  @IsIn(["active", "terminal", "all"])
  statusGroup?: "active" | "terminal" | "all";
}
