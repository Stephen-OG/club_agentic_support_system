import { NextResponse } from "next/server";
import { addDemoMessage, getDemoRequest, listDemoMessages } from "@/lib/demo-store";
import { logger } from "@/lib/logger";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");

  if (!conversationId) {
    logger.warn("admin.messages.list.invalid_request", {
      hasConversationId: false
    });
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    const messages = listDemoMessages(conversationId);
    logger.info("admin.messages.list.demo", {
      conversationId,
      count: messages.length,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ messages });
  }

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    logger.error("admin.messages.list.error", {
      conversationId,
      durationMs: Date.now() - startedAt,
      error
    });
    return NextResponse.json({ error: "Could not load messages" }, { status: 500 });
  }

  logger.info("admin.messages.list.success", {
    conversationId,
    count: data?.length || 0,
    durationMs: Date.now() - startedAt
  });

  return NextResponse.json({ messages: data || [] });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const { requestId, body } = (await request.json()) as { requestId?: string; body?: string };

  if (!requestId || !body?.trim()) {
    logger.warn("admin.messages.create.invalid_request", {
      hasRequestId: Boolean(requestId),
      bodyLength: body?.length || 0
    });
    return NextResponse.json({ error: "requestId and body are required" }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    const supportRequest = getDemoRequest(requestId);
    if (!supportRequest) {
      logger.warn("admin.messages.create.demo_request_not_found", {
        requestId
      });
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const message = addDemoMessage({
      club_id: supportRequest.club_id,
      table_id: supportRequest.table_id,
      conversation_id: supportRequest.conversation_id,
      request_id: requestId,
      sender: "staff",
      body
    });

    logger.info("admin.messages.create.demo", {
      requestId,
      conversationId: supportRequest.conversation_id,
      bodyLength: body.length,
      durationMs: Date.now() - startedAt
    });

    return NextResponse.json({ message });
  }

  const { data: supportRequest, error: requestError } = await supabase
    .from("support_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (requestError || !supportRequest) {
    logger.warn("admin.messages.create.request_not_found", {
      requestId,
      durationMs: Date.now() - startedAt,
      error: requestError
    });
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      club_id: supportRequest.club_id,
      table_id: supportRequest.table_id,
      conversation_id: supportRequest.conversation_id,
      request_id: requestId,
      sender: "staff",
      body
    })
    .select("*")
    .single();

  if (error) {
    logger.error("admin.messages.create.error", {
      requestId,
      conversationId: supportRequest.conversation_id,
      bodyLength: body.length,
      durationMs: Date.now() - startedAt,
      error
    });
    return NextResponse.json({ error: "Could not save staff message" }, { status: 500 });
  }

  logger.info("admin.messages.create.success", {
    requestId,
    conversationId: supportRequest.conversation_id,
    bodyLength: body.length,
    durationMs: Date.now() - startedAt
  });

  return NextResponse.json({ message: data });
}
