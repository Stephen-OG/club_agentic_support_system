import { NextResponse } from "next/server";
import { triageMessage } from "@/lib/ai/triage";
import { addDemoMessage, addDemoRequest, getDemoConversation, getDemoTable } from "@/lib/demo-store";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { tableToken, message, conversationId } = (await request.json()) as {
    tableToken?: string;
    message?: string;
    conversationId?: string;
  };

  if (!tableToken || !message?.trim()) {
    return NextResponse.json({ error: "tableToken and message are required" }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    const table = getDemoTable(tableToken);
    const activeConversationId = conversationId || getDemoConversation(table.id);
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

    return NextResponse.json({ table, conversationId: activeConversationId, messages: [guestMessage, assistantMessage], request: supportRequest });
  }

  const { data: table, error: tableError } = await supabase
    .from("club_tables")
    .select("*")
    .eq("qr_token", tableToken)
    .eq("is_active", true)
    .single();

  if (tableError || !table) {
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
      return NextResponse.json({ error: "Could not create conversation" }, { status: 500 });
    }

    activeConversationId = conversation.id;
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
    return NextResponse.json({ error: "Could not save messages" }, { status: 500 });
  }

  return NextResponse.json({
    table,
    conversationId: activeConversationId,
    messages: savedMessages || [],
    request: supportRequest
  });
}
