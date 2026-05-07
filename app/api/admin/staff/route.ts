import { NextResponse } from "next/server";
import { addDemoStaff, listDemoStaff } from "@/lib/demo-store";
import { logger } from "@/lib/logger";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/types";

const demoClubId = "00000000-0000-0000-0000-000000000001";
const staffRoles = new Set<StaffRole>(["manager", "admin", "staff"]);

function createStaffEmail(displayName: string) {
  const slug = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/(^\.|\.$)/g, "");
  return `${slug || "staff"}.${crypto.randomUUID()}@agentic-support.local`;
}

export async function GET() {
  const startedAt = Date.now();
  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    const staff = listDemoStaff();
    logger.info("admin.staff.list.demo", {
      count: staff.length,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ staff });
  }

  const { data, error } = await supabase
    .from("staff_profiles")
    .select("*")
    .order("role", { ascending: true })
    .order("display_name", { ascending: true });

  if (error) {
    logger.error("admin.staff.list.error", {
      durationMs: Date.now() - startedAt,
      error
    });
    return NextResponse.json({ error: "Could not load staff" }, { status: 500 });
  }

  logger.info("admin.staff.list.success", {
    count: data?.length || 0,
    durationMs: Date.now() - startedAt
  });

  return NextResponse.json({ staff: data || [] });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const { displayName, role } = (await request.json()) as {
    displayName?: string;
    role?: StaffRole;
  };
  const normalizedDisplayName = displayName?.trim();

  if (!normalizedDisplayName || !role || !staffRoles.has(role)) {
    logger.warn("admin.staff.create.invalid_request", {
      hasDisplayName: Boolean(normalizedDisplayName),
      role
    });
    return NextResponse.json({ error: "displayName and a valid role are required" }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    const staff = addDemoStaff({ displayName: normalizedDisplayName, role });
    logger.info("admin.staff.create.demo", {
      staffId: staff.id,
      role,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ staff }, { status: 201 });
  }

  const { data: existingClub, error: clubError } = await supabase
    .from("clubs")
    .select("id")
    .eq("id", demoClubId)
    .maybeSingle();

  if (clubError) {
    logger.error("admin.staff.create.club_error", {
      durationMs: Date.now() - startedAt,
      error: clubError
    });
    return NextResponse.json({ error: "Could not load club" }, { status: 500 });
  }

  let clubId = existingClub?.id;

  if (!clubId) {
    const { data: createdClub, error: createClubError } = await supabase
      .from("clubs")
      .insert({ id: demoClubId, name: "Demo Club", slug: "demo-club" })
      .select("id")
      .single();

    if (createClubError || !createdClub) {
      logger.error("admin.staff.create.club_create_error", {
        durationMs: Date.now() - startedAt,
        error: createClubError
      });
      return NextResponse.json({ error: "Could not create club" }, { status: 500 });
    }

    clubId = createdClub.id;
  }

  const staffInput = {
    club_id: clubId,
    display_name: normalizedDisplayName,
    role
  };
  let result = await supabase
    .from("staff_profiles")
    .insert(staffInput)
    .select("*")
    .single();

  if (result.error) {
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email: createStaffEmail(normalizedDisplayName),
      email_confirm: true,
      user_metadata: {
        display_name: normalizedDisplayName,
        role
      }
    });

    if (!userError && userData.user) {
      result = await supabase
        .from("staff_profiles")
        .insert({
          id: userData.user.id,
          ...staffInput
        })
        .select("*")
        .single();
    } else {
      logger.error("admin.staff.create.auth_user_error", {
        role,
        durationMs: Date.now() - startedAt,
        error: userError
      });
    }
  }

  const { data, error } = result;

  if (error) {
    logger.error("admin.staff.create.error", {
      club_id: clubId,
      role,
      durationMs: Date.now() - startedAt,
      error
    });
    return NextResponse.json({ error: "Could not create staff member" }, { status: 500 });
  }

  logger.info("admin.staff.create.success", {
    staffId: data.id,
    role,
    durationMs: Date.now() - startedAt
  });

  return NextResponse.json({ staff: data }, { status: 201 });
}
