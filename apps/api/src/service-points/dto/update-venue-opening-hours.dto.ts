import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsString, Matches, Max, Min, ValidateNested } from "class-validator";

export class VenueOpeningHourDto {
  @Transform(({ value }) => (typeof value === "string" ? Number(value) : value))
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsString()
  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
  opensAt!: string;

  @IsString()
  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
  closesAt!: string;

  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  isClosed!: boolean;
}

export class UpdateVenueOpeningHoursDto {
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => VenueOpeningHourDto)
  openingHours!: VenueOpeningHourDto[];
}
