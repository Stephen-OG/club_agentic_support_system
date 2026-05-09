import { NextResponse } from "next/server";
import { triageMessage } from "@/lib/ai/triage";
import {
  addDemoMessage,
  addDemoRequest,
  getActiveDemoRequestForConversation,
  getDemoRequest,
  getDemoConversation,
  getDemoTable,
  getLatestDemoRequestForConversation,
  updateDemoRequest,
  listDemoMessages
} from "@/lib/demo-store";
import { logger } from "@/lib/logger";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");

  if (!conversationId) {
    logger.warn("chat.get.invalid_request", {
      hasConversationId: false
    });
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    const messages = listDemoMessages(conversationId);
    const supportRequest = getLatestDemoRequestForConversation(conversationId);
    logger.info("chat.get.demo", {
      conversationId,
      messageCount: messages.length,
      requestId: supportRequest?.id,
      requestStatus: supportRequest?.status,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ messages, request: supportRequest });
  }

  const [{ data: messages, error: messagesError }, { data: requests, error: requestError }] = await Promise.all([
    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }),
    supabase
      .from("support_requests")
      .select("*, club_tables(label, zone), staff_profiles(display_name, role)")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
  ]);

  if (messagesError || requestError) {
    logger.error("chat.get.error", {
      conversationId,
      durationMs: Date.now() - startedAt,
      messagesError,
      requestError
    });
    return NextResponse.json({ error: "Could not load conversation" }, { status: 500 });
  }

  logger.info("chat.get.success", {
    conversationId,
    messageCount: messages?.length || 0,
    requestId: requests?.[0]?.id,
    requestStatus: requests?.[0]?.status,
    durationMs: Date.now() - startedAt
  });

  return NextResponse.json({ messages: messages || [], request: requests?.[0] || null });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const { tableToken, message, conversationId } = (await request.json()) as {
    tableToken?: string;
    message?: string;
    conversationId?: string;
  };

  if (!tableToken || !message?.trim()) {
    logger.warn("chat.create.invalid_request", {
      hasTableToken: Boolean(tableToken),
      messageLength: message?.length || 0
    });
    return NextResponse.json({ error: "tableToken and message are required" }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    const table = getDemoTable(tableToken);
    const activeConversationId = conversationId || getDemoConversation(table.id);
    const activeRequest = getActiveDemoRequestForConversation(activeConversationId);

    if (activeRequest) {
      const guestMessage = addDemoMessage({
        club_id: table.club_id,
        table_id: table.id,
        conversation_id: activeConversationId,
        request_id: activeRequest.id,
        sender: "guest",
        body: message
      });
      const assistantMessage = addDemoMessage({
        club_id: table.club_id,
        table_id: table.id,
        conversation_id: activeConversationId,
        request_id: activeRequest.id,
        sender: "assistant",
        body: "Thanks, I added that to your open request."
      });

      logger.info("chat.create.demo_followup", {
        tableId: table.id,
        tableToken,
        conversationId: activeConversationId,
        requestId: activeRequest.id,
        requestStatus: activeRequest.status,
        messageLength: message.length,
        durationMs: Date.now() - startedAt
      });

      return NextResponse.json({
        table,
        conversationId: activeConversationId,
        messages: [guestMessage, assistantMessage],
        request: activeRequest
      });
    }

    const guestMessage = addDemoMessage({
      club_id: table.club_id,
      table_id: table.id,
      conversation_id: activeConversationId,
      request_id: null,
      sender: "guest",
      body: message
    });
    const triage = await triageMessage(message, table.label);
    const supportRequest = addDemoRequest({
      club_id: table.club_id,
      table_id: table.id,
      conversation_id: activeConversationId,
      title: triage.title,
      category: triage.category,
      status: "new",
      priority: triage.priority,
      summary: message,
      club_tables: { label: table.label, zone: table.zone }
    });
    const assistantMessage = addDemoMessage({
      club_id: table.club_id,
      table_id: table.id,
      conversation_id: activeConversationId,
      request_id: supportRequest.id,
      sender: "assistant",
      body: triage.assistantReply
    });

    logger.info("chat.create.demo", {
      tableId: table.id,
      tableToken,
      conversationId: activeConversationId,
      requestId: supportRequest.id,
      messageLength: message.length,
      triageCategory: triage.category,
      triagePriority: triage.priority,
      durationMs: Date.now() - startedAt
    });

    return NextResponse.json({ table, conversationId: activeConversationId, messages: [guestMessage, assistantMessage], request: supportRequest });
  }

  const { data: table, error: tableError } = await supabase
    .from("club_tables")
    .select("*")
    .eq("qr_token", tableToken)
    .eq("is_active", true)
    .single();

  if (tableError || !table) {
    logger.warn("chat.create.table_not_found", {
      tableToken,
      durationMs: Date.now() - startedAt,
      error: tableError
    });
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  let activeConversationId = conversationId;

  if (!activeConversationId) {
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .insert({ club_id: table.club_id, table_id: table.id })
      .select("*")
      .single();

    if (conversationError || !conversation) {
      logger.error("chat.create.conversation_error", {
        tableId: table.id,
        tableToken,
        durationMs: Date.now() - startedAt,
        error: conversationError
      });
      return NextResponse.json({ error: "Could not create conversation" }, { status: 500 });
    }

    activeConversationId = conversation.id;
  }

  const { data: activeRequests, error: activeRequestError } = await supabase
    .from("support_requests")
    .select("*, club_tables(label, zone)")
    .eq("conversation_id", activeConversationId)
    .not("status", "in", "(resolved,cancelled)")
    .order("created_at", { ascending: false })
    .limit(1);

  if (activeRequestError) {
    logger.error("chat.create.active_request_error", {
      tableId: table.id,
      tableToken,
      conversationId: activeConversationId,
      durationMs: Date.now() - startedAt,
      error: activeRequestError
    });
    return NextResponse.json({ error: "Could not load active request" }, { status: 500 });
  }

  const activeRequest = activeRequests?.[0] || null;

  if (activeRequest) {
    const { data: savedMessages, error: messageError } = await supabase
      .from("messages")
      .insert([
        {
          club_id: table.club_id,
          table_id: table.id,
          conversation_id: activeConversationId,
          request_id: activeRequest.id,
          sender: "guest",
          body: message
        },
        {
          club_id: table.club_id,
          table_id: table.id,
          conversation_id: activeConversationId,
          request_id: activeRequest.id,
          sender: "assistant",
          body: "Thanks, I added that to your open request."
        }
      ])
      .select("*");

    if (messageError) {
      logger.error("chat.create.followup_message_error", {
        tableId: table.id,
        tableToken,
        conversationId: activeConversationId,
        requestId: activeRequest.id,
        durationMs: Date.now() - startedAt,
        error: messageError
      });
      return NextResponse.json({ error: "Could not save messages" }, { status: 500 });
    }

    logger.info("chat.create.followup_success", {
      tableId: table.id,
      tableToken,
      conversationId: activeConversationId,
      requestId: activeRequest.id,
      requestStatus: activeRequest.status,
      messageLength: message.length,
      savedMessageCount: savedMessages?.length || 0,
      durationMs: Date.now() - startedAt
    });

    return NextResponse.json({
      table,
      conversationId: activeConversationId,
      messages: savedMessages || [],
      request: activeRequest
    });
  }

  const triage = await triageMessage(message, table.label);

  const { data: supportRequest, error: requestError } = await supabase
    .from("support_requests")
    .insert({
      club_id: table.club_id,
      table_id: table.id,
      conversation_id: activeConversationId,
      title: triage.title,
      category: triage.category,
      priority: triage.priority,
      summary: message
    })
    .select("*")
    .single();

  if (requestError || !supportRequest) {
    logger.error("chat.create.request_error", {
      tableId: table.id,
      tableToken,
      conversationId: activeConversationId,
      triageCategory: triage.category,
      triagePriority: triage.priority,
      durationMs: Date.now() - startedAt,
      error: requestError
    });
    return NextResponse.json({ error: "Could not create support request" }, { status: 500 });
  }

  const { data: savedMessages, error: messageError } = await supabase
    .from("messages")
    .insert([
      {
        club_id: table.club_id,
        table_id: table.id,
        conversation_id: activeConversationId,
        request_id: supportRequest.id,
        sender: "guest",
        body: message
      },
      {
        club_id: table.club_id,
        table_id: table.id,
        conversation_id: activeConversationId,
        request_id: supportRequest.id,
        sender: "assistant",
        body: triage.assistantReply
      }
    ])
    .select("*");

  if (messageError) {
    logger.error("chat.create.message_error", {
      tableId: table.id,
      tableToken,
      conversationId: activeConversationId,
      requestId: supportRequest.id,
      durationMs: Date.now() - startedAt,
      error: messageError
    });
    return NextResponse.json({ error: "Could not save messages" }, { status: 500 });
  }

  logger.info("chat.create.success", {
    tableId: table.id,
    tableToken,
    conversationId: activeConversationId,
    requestId: supportRequest.id,
    messageLength: message.length,
    triageCategory: triage.category,
    triagePriority: triage.priority,
    savedMessageCount: savedMessages?.length || 0,
    durationMs: Date.now() - startedAt
  });

  return NextResponse.json({
    table,
    conversationId: activeConversationId,
    messages: savedMessages || [],
    request: supportRequest
  });
}

export async function PATCH(request: Request) {
  const startedAt = Date.now();
  const { requestId, action } = (await request.json()) as {
    requestId?: string;
    action?: "cancel" | "confirm_resolved" | "not_satisfied";
  };

  if (!requestId || !action) {
    logger.warn("chat.action.invalid_request", {
      hasRequestId: Boolean(requestId),
      action
    });
    return NextResponse.json({ error: "requestId and action are required" }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    const supportRequest = getDemoRequest(requestId);

    if (!supportRequest) {
      logger.warn("chat.action.demo_request_not_found", {
        requestId,
        action
      });
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const next = getClientActionResult(action, supportRequest.status);

    if (!next.allowed) {
      return NextResponse.json({ error: next.error }, { status: 409 });
    }

    const updatedRequest = updateDemoRequest(requestId, next.status);
    const message = addDemoMessage({
      club_id: supportRequest.club_id,
      table_id: supportRequest.table_id,
      conversation_id: supportRequest.conversation_id,
      request_id: supportRequest.id,
      sender: "system",
      body: next.message
    });

    logger.info("chat.action.demo", {
      requestId,
      action,
      status: next.status,
      durationMs: Date.now() - startedAt
    });

    return NextResponse.json({ request: updatedRequest, message });
  }

  const { data: supportRequest, error: requestError } = await supabase
    .from("support_requests")
    .select("*, club_tables(label, zone), staff_profiles(display_name, role)")
    .eq("id", requestId)
    .single();

  if (requestError || !supportRequest) {
    logger.warn("chat.action.request_not_found", {
      requestId,
      action,
      durationMs: Date.now() - startedAt,
      error: requestError
    });
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const next = getClientActionResult(action, supportRequest.status);

  if (!next.allowed) {
    return NextResponse.json({ error: next.error }, { status: 409 });
  }

  const { data: updatedRequest, error: updateError } = await supabase
    .from("support_requests")
    .update({
      status: next.status,
      resolved_at: next.status === "resolved" ? new Date().toISOString() : null
    })
    .eq("id", requestId)
    .select("*, club_tables(label, zone), staff_profiles(display_name, role)")
    .single();

  if (updateError || !updatedRequest) {
    logger.error("chat.action.update_error", {
      requestId,
      action,
      status: next.status,
      durationMs: Date.now() - startedAt,
      error: updateError
    });
    return NextResponse.json({ error: "Could not update request" }, { status: 500 });
  }

  const { data: message, error: messageError } = await supabase
    .from("messages")
    .insert({
      club_id: supportRequest.club_id,
      table_id: supportRequest.table_id,
      conversation_id: supportRequest.conversation_id,
      request_id: supportRequest.id,
      sender: "system",
      body: next.message
    })
    .select("*")
    .single();

  if (messageError) {
    logger.error("chat.action.message_error", {
      requestId,
      action,
      status: next.status,
      durationMs: Date.now() - startedAt,
      error: messageError
    });
  }

  logger.info("chat.action.success", {
    requestId,
    action,
    status: next.status,
    durationMs: Date.now() - startedAt
  });

  return NextResponse.json({ request: updatedRequest, message });
}

function getClientActionResult(
  action: "cancel" | "confirm_resolved" | "not_satisfied",
  currentStatus: string
):
  | { allowed: true; status: "cancelled" | "resolved" | "in_progress"; message: string }
  | { allowed: false; error: string } {
  if (action === "cancel") {
    if (
      currentStatus === "completed" ||
      currentStatus === "resolved" ||
      currentStatus === "cancelled" ||
      currentStatus === "escalated"
    ) {
      return { allowed: false, error: "This request can no longer be cancelled" };
    }

    return {
      allowed: true,
      status: "cancelled",
      message: "You cancelled this request. Send another message if you need anything else."
    };
  }

  if (action === "confirm_resolved") {
    if (currentStatus !== "completed") {
      return { allowed: false, error: "This request is not awaiting satisfaction confirmation" };
    }

    return {
      allowed: true,
      status: "resolved",
      message: "Thanks for confirming. This request is resolved."
    };
  }

  if (currentStatus !== "completed") {
    return { allowed: false, error: "This request is not awaiting satisfaction confirmation" };
  }

  return {
    allowed: true,
    status: "in_progress",
    message: "Thanks for letting us know. The team will continue working on this request."
  };
}
