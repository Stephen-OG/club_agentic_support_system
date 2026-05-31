import { ApiProperty } from "@nestjs/swagger";

export class SetupResponseDto {
  @ApiProperty()
  workspaceId!: string;

  @ApiProperty()
  workspaceName!: string;

  @ApiProperty()
  staffProfileId!: string;

  @ApiProperty()
  venueId!: string;

  @ApiProperty()
  venueName!: string;
}
