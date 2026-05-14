import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength, ValidateIf } from "class-validator";

export class CreateStaffUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  displayName!: string;

  @IsIn(["owner", "admin", "manager", "staff", "security", "read_only"])
  role!: "owner" | "admin" | "manager" | "staff" | "security" | "read_only";

  @ValidateIf((input: CreateStaffUserDto) => !["owner", "admin"].includes(input.role))
  @IsUUID()
  venueId?: string;

  @IsOptional()
  @IsString()
  temporaryPassword?: string;
}
