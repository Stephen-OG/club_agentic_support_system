import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, Length } from "class-validator";

export class PublicGuestMessageDto {
  @ApiProperty({
    example: "We need help with a spill at the table"
  })
  @IsString()
  @Length(1, 1600)
  message!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(12, 160)
  sessionId?: string;
}
