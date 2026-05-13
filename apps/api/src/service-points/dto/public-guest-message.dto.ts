import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class PublicGuestMessageDto {
  @ApiProperty({
    example: "We need help with a spill at the table"
  })
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
}
