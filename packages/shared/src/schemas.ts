import { z } from "zod";
import { requestPriorities } from "./priority-classifier";
import { requestStatuses, staffRoles } from "./request-workflow";

export const RequestPrioritySchema = z.enum(requestPriorities);
export const RequestStatusSchema = z.enum(requestStatuses);
export const StaffRoleSchema = z.enum(staffRoles);

export const AiTriageSchema = z.object({
  assistantReply: z.string().min(1),
  category: z.string().min(1),
  needsStaff: z.boolean().default(true),
  priority: RequestPrioritySchema,
  summary: z.string().min(1).optional(),
  title: z.string().min(1)
});

export type AiTriageOutput = z.infer<typeof AiTriageSchema>;

export const PublicGuestMessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(1600),
  sessionId: z.string().trim().min(12).max(160).optional()
});

export type PublicGuestMessageInput = z.infer<typeof PublicGuestMessageSchema>;
