import { z } from "zod";
import { requestPriorities } from "./priority-classifier";
import { requestStatuses, staffRoles } from "./request-workflow";

export const RequestPrioritySchema = z.enum(requestPriorities);
export const RequestStatusSchema = z.enum(requestStatuses);
export const StaffRoleSchema = z.enum(staffRoles);

export const AiTriageSchema = z.object({
  assistantReply: z.string().min(1),
  category: z.string().min(1),
  confidence: z.number().min(0).max(1).default(0.6),
  guestLocationLabel: z.string().min(1).max(120).optional(),
  needsStaff: z.boolean().default(true),
  priority: RequestPrioritySchema,
  suggestedAction: z.enum(["reply", "assign", "escalate", "reopen", "summarize", "mark_handled"]).default("reply"),
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

export const GuestLocationSchema = z.object({
  label: z.string().trim().min(1).max(120),
  source: z.enum(["guest", "agent", "qr"]).default("guest")
});

export const AgentPolicyVersionSchema = z.enum([
  "v1-assistive",
  "v1-semi-autonomous",
  "v2-autonomous-within-rules"
]);

export const AgentActionSchema = z.enum([
  "reply",
  "assign",
  "escalate",
  "reopen",
  "summarize",
  "mark_handled"
]);

export const VenueIntakeMessageSchema = PublicGuestMessageSchema.extend({
  locationLabel: z.string().trim().min(1).max(120).optional(),
  quickAction: z
    .enum([
      "drink",
      "missing_order",
      "long_wait",
      "spill",
      "dirty_area",
      "lost_property",
      "payment",
      "restroom",
      "accessibility",
      "vip",
      "safety",
      "medical",
      "general"
    ])
    .optional()
});

export type GuestLocation = z.infer<typeof GuestLocationSchema>;
export type AgentPolicyVersion = z.infer<typeof AgentPolicyVersionSchema>;
export type AgentAction = z.infer<typeof AgentActionSchema>;
export type VenueIntakeMessageInput = z.infer<typeof VenueIntakeMessageSchema>;
