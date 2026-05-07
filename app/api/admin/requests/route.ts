import { NextResponse } from "next/server";
import { addDemoMessage, listDemoRequests, updateDemoRequest } from "@/lib/demo-store";
import { logger } from "@/lib/logger";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { RequestStatus } from "@/lib/types";

const guestStatusMessages: Partial<Record<RequestStatus, string>> = {
  acknowledged: "Your request has been assigned to a team member.",
  declined: "That team member declined the request. The manager will assign someone else.",
  in_progress: "The team is working on your request now.",
  completed: "The team marked this request complete. Are you satisfied with the service?",
  resolved: "Thanks for confirming. This request is now resolved.",
  cancelled: "This request was cancelled. Send another message if you still need help."
};

export async function GET() {
  const startedAt = Date.now();
  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    const requests = listDemoRequests();
    logger.info("admin.requests.list.demo", {
      count: requests.length,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ requests });
  }

  const { data, error } = await supabase
    .from("support_requests")
    .select("*, club_tables(label, zone), staff_profiles(display_name, role)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    logger.error("admin.requests.list.error", {
      durationMs: Date.now() - startedAt,
      error
    });
    return NextResponse.json({ error: "Could not load requests" }, { status: 500 });
  }

  logger.info("admin.requests.list.success", {
    count: data?.length || 0,
    durationMs: Date.now() - startedAt
  });

  return NextResponse.json({ requests: data || [] });
}

export async function PATCH(request: Request) {
  const startedAt = Date.now();
  const { id, status, assignedTo } = (await request.json()) as {
    id?: string;
    status?: RequestStatus;
    assignedTo?: string | null;
  };
  const nextStatus = status || (assignedTo ? "acknowledged" : undefined);

  if (!id || !nextStatus) {
    logger.warn("admin.requests.update.invalid_request", {
      hasId: Boolean(id),
      status,
      hasAssignedTo: assignedTo !== undefined
    });
    return NextResponse.json({ error: "id and status or assignedTo are required" }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    const updatedRequest = updateDemoRequest(id, nextStatus, assignedTo);
    const guestMessage = updatedRequest && guestStatusMessages[nextStatus];

    if (updatedRequest && guestMessage) {
      addDemoMessage({
        club_id: updatedRequest.club_id,
        table_id: updatedRequest.table_id,
        conversation_id: updatedRequest.conversation_id,
        request_id: updatedRequest.id,
        sender: "system",
        body: guestMessage
      });
    }

    logger.info("admin.requests.update.demo", {
      requestId: id,
      status: nextStatus,
      assignedTo,
      found: Boolean(updatedRequest),
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ request: updatedRequest });
  }

  const updates: {
    status: RequestStatus;
    resolved_at: string | null;
    assigned_to?: string | null;
  } = {
    status: nextStatus,
    resolved_at: nextStatus === "resolved" ? new Date().toISOString() : null
  };

  if (assignedTo !== undefined) {
    updates.assigned_to = assignedTo;
  }

  const { data, error } = await supabase
    .from("support_requests")
    .update(updates)
    .eq("id", id)
    .select("*, club_tables(label, zone), staff_profiles(display_name, role)")
    .single();

  if (error) {
    logger.error("admin.requests.update.error", {
      requestId: id,
      status: nextStatus,
      assignedTo,
      durationMs: Date.now() - startedAt,
      error
    });
    return NextResponse.json({ error: "Could not update request" }, { status: 500 });
  }

  const guestMessage = guestStatusMessages[nextStatus];

  if (guestMessage) {
    const { error: messageError } = await supabase
      .from("messages")
      .insert({
        club_id: data.club_id,
        table_id: data.table_id,
        conversation_id: data.conversation_id,
        request_id: data.id,
        sender: "system",
        body: guestMessage
      });

    if (messageError) {
      logger.error("admin.requests.update.status_message_error", {
        requestId: id,
        status: nextStatus,
        durationMs: Date.now() - startedAt,
        error: messageError
      });
    }
  }

  logger.info("admin.requests.update.success", {
    requestId: id,
    status: nextStatus,
    assignedTo,
    durationMs: Date.now() - startedAt
  });

  return NextResponse.json({ request: data });
}
