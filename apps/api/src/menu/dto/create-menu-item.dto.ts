import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength
} from "class-validator";

function trimNullable(value: unknown) {
  return typeof value === "string" ? value.trim() : value;
}

export class CreateMenuItemDto {
  @IsString()
  @IsUUID()
  sectionId!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @Transform(({ value }) => trimNullable(value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @Transform(({ value }) => trimNullable(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  priceLabel?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dietaryTags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
