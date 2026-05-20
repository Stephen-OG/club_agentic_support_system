import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class PublicVenueMessageDto {
  @ApiProperty({ example: "My drinks never came" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(1600)
  message!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(12)
  @MaxLength(160)
  sessionId?: string;

  @ApiPropertyOptional({ example: "Table 14" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  locationLabel?: string;

  @ApiPropertyOptional({ example: "missing_order" })
  @IsOptional()
  @IsIn([
    "drink",
    "missing_order",
    "long_wait",
    "spill",
    "dirty_area",
    "lost_property",
    "payment",
    "restroom",
    "accessibility",
    "vip",
    "safety",
    "medical",
    "general"
  ])
  quickAction?: string;
}
