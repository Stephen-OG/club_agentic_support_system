import { NextResponse } from "next/server";
import { listDemoRequests, updateDemoRequest } from "@/lib/demo-store";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { RequestStatus } from "@/lib/types";

export async function GET() {
  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ requests: listDemoRequests() });
  }

  const { data, error } = await supabase
    .from("support_requests")
    .select("*, club_tables(label, zone)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "Could not load requests" }, { status: 500 });
  }

  return NextResponse.json({ requests: data || [] });
}

export async function PATCH(request: Request) {
  const { id, status } = (await request.json()) as { id?: string; status?: RequestStatus };

  if (!id || !status) {
    return NextResponse.json({ error: "id and status are required" }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ request: updateDemoRequest(id, status) });
  }

  const { data, error } = await supabase
    .from("support_requests")
    .update({
      status,
      resolved_at: status === "resolved" ? new Date().toISOString() : null
    })
    .eq("id", id)
    .select("*, club_tables(label, zone)")
    .single();

  if (error) {
    return NextResponse.json({ error: "Could not update request" }, { status: 500 });
  }

  return NextResponse.json({ request: data });
}
