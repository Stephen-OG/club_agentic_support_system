import { NextResponse } from "next/server";
import { addDemoMessage, getDemoRequest, listDemoMessages } from "@/lib/demo-store";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ messages: listDemoMessages(conversationId) });
  }

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Could not load messages" }, { status: 500 });
  }

  return NextResponse.json({ messages: data || [] });
}

export async function POST(request: Request) {
  const { requestId, body } = (await request.json()) as { requestId?: string; body?: string };

  if (!requestId || !body?.trim()) {
    return NextResponse.json({ error: "requestId and body are required" }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    const supportRequest = getDemoRequest(requestId);
    if (!supportRequest) {
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

    return NextResponse.json({ message });
  }

  const { data: supportRequest, error: requestError } = await supabase
    .from("support_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (requestError || !supportRequest) {
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
    return NextResponse.json({ error: "Could not save staff message" }, { status: 500 });
  }

  return NextResponse.json({ message: data });
}
