import { IsString, MinLength } from "class-validator";

export class ImportMenuCsvDto {
  @IsString()
  @MinLength(1)
  csv!: string;
}
