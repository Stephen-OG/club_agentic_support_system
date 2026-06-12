import { IsEmail, IsString, IsOptional, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class SetupRequestDto {
  @ApiProperty({ description: "Email for the owner account" })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: "Display name for the owner" })
  @IsString()
  @MinLength(1)
  displayName!: string;

  @ApiProperty({ description: "Organization name (e.g. company or group name)" })
  @IsString()
  @MinLength(1)
  organizationName!: string;

  @ApiProperty({ description: "Organization slug (URL-friendly identifier)" })
  @IsString()
  @MinLength(1)
  organizationSlug!: string;

  @ApiProperty({ description: "First venue name" })
  @IsString()
  @MinLength(1)
  venueName!: string;

  @ApiProperty({ description: "First venue slug" })
  @IsString()
  @MinLength(1)
  venueSlug!: string;

  @ApiProperty({ description: "Timezone (e.g. Europe/London)", required: false })
  @IsOptional()
  @IsString()
  timezone?: string;
}
