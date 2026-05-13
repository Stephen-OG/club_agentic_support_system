import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateServicePointDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @IsString()
  locationId?: string;
}
