import { NextResponse } from "next/server";
import { createGuestStatusMessage } from "@/lib/chat-copy";
import { addDemoMessage, listDemoMessages, listDemoRequests, updateDemoRequest } from "@/lib/demo-store";
import { logger } from "@/lib/logger";
import { addSatisfactionRatingsToRequests } from "@/lib/rating-analytics";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { RequestStatus } from "@/lib/types";

export async function GET() {
  const startedAt = Date.now();
  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    const requests = listDemoRequests();
    const messages = requests.flatMap((item) => listDemoMessages(item.conversation_id));
    const requestsWithRatings = addSatisfactionRatingsToRequests(requests, messages);
    logger.info("admin.requests.list.demo", {
      count: requestsWithRatings.length,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ requests: requestsWithRatings });
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

  const requests = data || [];
  const requestIds = requests.map((item) => item.id);
  let requestsWithRatings = requests.map((item) => ({ ...item, satisfaction_rating: null }));

  if (requestIds.length > 0) {
    const { data: ratingMessages, error: ratingError } = await supabase
      .from("messages")
      .select("request_id, metadata, created_at")
      .in("request_id", requestIds)
      .order("created_at", { ascending: true });

    if (ratingError) {
      logger.error("admin.requests.ratings.error", {
        durationMs: Date.now() - startedAt,
        error: ratingError
      });
      return NextResponse.json({ error: "Could not load ratings" }, { status: 500 });
    }

    requestsWithRatings = addSatisfactionRatingsToRequests(requests, ratingMessages || []);
  }

  logger.info("admin.requests.list.success", {
    count: requestsWithRatings.length,
    durationMs: Date.now() - startedAt
  });

  return NextResponse.json({ requests: requestsWithRatings });
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
    const guestMessage = updatedRequest && createGuestStatusMessage(nextStatus);

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

  const guestMessage = createGuestStatusMessage(nextStatus);

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
