-- Add indexes for foreign keys reported by the Supabase performance advisor.
-- These reduce delete/update checks and common relation lookups as production data grows.
create index if not exists "Message_servicePointId_createdAt_idx"
  on public."Message"("servicePointId", "createdAt");

create index if not exists "RequestAssignment_assignedById_createdAt_idx"
  on public."RequestAssignment"("assignedById", "createdAt");

create index if not exists "RequestEvent_actorStaffId_createdAt_idx"
  on public."RequestEvent"("actorStaffId", "createdAt");

create index if not exists "ServicePoint_locationId_idx"
  on public."ServicePoint"("locationId");

create index if not exists "StaffMembership_staffProfileId_isActive_idx"
  on public."StaffMembership"("staffProfileId", "isActive");

-- set_updated_at() is only used as a trigger helper. It should not be callable
-- through PostgREST RPC by anonymous or signed-in browser clients.
revoke execute on function public.set_updated_at() from public;
revoke execute on function public.set_updated_at() from anon;
revoke execute on function public.set_updated_at() from authenticated;
