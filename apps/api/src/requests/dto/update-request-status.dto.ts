import { IsIn, IsOptional, IsUUID } from "class-validator";
import { requestStatuses } from "@madupe/shared";

export class UpdateRequestStatusDto {
  @IsIn(requestStatuses)
  status!: (typeof requestStatuses)[number];

  @IsOptional()
  @IsUUID()
  assignedToId?: string;
}
