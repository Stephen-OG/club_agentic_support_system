import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class ClassifyPriorityDto {
  @ApiProperty({
    example: "There is broken glass near our table"
  })
  @IsString()
  @Length(1, 1600)
  message!: string;
}
