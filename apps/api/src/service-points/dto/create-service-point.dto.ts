import { Transform } from "class-transformer";
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class CreateServicePointDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @IsString()
  @IsUUID()
  locationId?: string;
}
