import { ApiProperty } from "@nestjs/swagger";

export class SetupResponseDto {
  @ApiProperty()
  organizationId!: string;

  @ApiProperty()
  organizationName!: string;

  @ApiProperty()
  staffProfileId!: string;

  @ApiProperty()
  venueId!: string;

  @ApiProperty()
  venueName!: string;
}
