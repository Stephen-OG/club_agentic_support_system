import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsString, Matches, Max, Min, ValidateNested } from "class-validator";

export class VenueOpeningHourDto {
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

  @IsBoolean()
  isClosed!: boolean;
}

export class UpdateVenueOpeningHoursDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VenueOpeningHourDto)
  openingHours!: VenueOpeningHourDto[];
}
