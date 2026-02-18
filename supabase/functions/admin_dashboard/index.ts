import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub as string;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify admin role
    const { data: userRow, error: userError } = await serviceClient
      .from("users")
      .select("role, company_id")
      .eq("id", userId)
      .single();

    if (userError || !userRow || userRow.role !== "admin") {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden: admin role required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const companyId = userRow.company_id;

    // Parse optional filters from query params
    const url = new URL(req.url);
    const employeeId = url.searchParams.get("employee_id");
    const startDate = url.searchParams.get("start_date");
    const endDate = url.searchParams.get("end_date");

    // Fetch employees in company
    const { data: employees } = await serviceClient
      .from("users")
      .select("id, full_name, email, role")
      .eq("company_id", companyId);

    // Build punches query
    let punchesQuery = serviceClient
      .from("time_entries")
      .select("id, user_id, clock_in_at, clock_out_at, clock_in_lat, clock_in_lng, clock_in_location, clock_out_lat, clock_out_lng, clock_out_location, total_seconds, status")
      .eq("company_id", companyId)
      .order("clock_in_at", { ascending: false })
      .limit(500);

    if (employeeId) {
      punchesQuery = punchesQuery.eq("user_id", employeeId);
    }
    if (startDate) {
      punchesQuery = punchesQuery.gte("clock_in_at", startDate);
    }
    if (endDate) {
      // Include the full end date day
      punchesQuery = punchesQuery.lte("clock_in_at", endDate + "T23:59:59.999Z");
    }

    const { data: punches } = await punchesQuery;

    // Calculate total hours per employee
    const hoursMap: Record<string, number> = {};
    for (const p of punches ?? []) {
      hoursMap[p.user_id] = (hoursMap[p.user_id] ?? 0) + (p.total_seconds ?? 0);
    }

    const totalHoursPerEmployee = Object.entries(hoursMap).map(([uid, seconds]) => ({
      user_id: uid,
      total_hours: +(seconds / 3600).toFixed(2),
    }));

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          employees: employees ?? [],
          punches: punches ?? [],
          total_hours_per_employee: totalHoursPerEmployee,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
