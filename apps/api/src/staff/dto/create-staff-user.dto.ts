import { IsEmail, IsIn, IsOptional, IsString, Matches, MinLength } from "class-validator";

const postgresUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateStaffUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  displayName!: string;

  @IsIn(["owner", "admin", "manager", "staff", "security", "read_only"])
  role!: "owner" | "admin" | "manager" | "staff" | "security" | "read_only";

  @IsOptional()
  @Matches(postgresUuidPattern, { message: "venueId must be a Postgres UUID" })
  venueId?: string;
}
