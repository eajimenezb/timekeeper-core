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
    const { data: { user }, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get user profile (allow both admin and employee)
    const { data: userRow, error: profileError } = await serviceClient
      .from("users")
      .select("role, company_id, is_active")
      .eq("id", userId)
      .single();

    if (profileError || !userRow) {
      return new Response(
        JSON.stringify({ success: false, error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!userRow.is_active) {
      return new Response(
        JSON.stringify({ success: false, error: "Account is deactivated" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check company trial status
    const { data: company } = await serviceClient
      .from("companies")
      .select("plan_type, subscription_status, trial_ends_at")
      .eq("id", userRow.company_id)
      .single();

    if (company?.subscription_status === "trialing" && company.trial_ends_at) {
      if (new Date(company.trial_ends_at) < new Date()) {
        return new Response(
          JSON.stringify({ success: false, error: "Trial has expired. Please upgrade your plan." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Check current status
    const { data: activeEntry } = await serviceClient
      .from("time_entries")
      .select("id")
      .eq("user_id", userId)
      .eq("company_id", userRow.company_id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    const currentStatus = activeEntry ? "clocked_in" : "clocked_out";

    // Date boundaries
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset).toISOString();

    const { data: dailyEntries } = await serviceClient
      .from("time_entries")
      .select("total_seconds")
      .eq("user_id", userId)
      .eq("company_id", userRow.company_id)
      .eq("status", "completed")
      .gte("clock_in_at", startOfDay);

    const dailyTotalSeconds = (dailyEntries ?? []).reduce((sum, e) => sum + (e.total_seconds ?? 0), 0);

    const { data: weeklyEntries } = await serviceClient
      .from("time_entries")
      .select("total_seconds")
      .eq("user_id", userId)
      .eq("company_id", userRow.company_id)
      .eq("status", "completed")
      .gte("clock_in_at", startOfWeek);

    const weeklyTotalSeconds = (weeklyEntries ?? []).reduce((sum, e) => sum + (e.total_seconds ?? 0), 0);

    const { data: history } = await serviceClient
      .from("time_entries")
      .select("id, clock_in_at, clock_out_at, clock_in_lat, clock_in_lng, clock_in_location, clock_out_lat, clock_out_lng, clock_out_location, total_seconds, status")
      .eq("user_id", userId)
      .eq("company_id", userRow.company_id)
      .order("clock_in_at", { ascending: false })
      .limit(50);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          current_status: currentStatus,
          daily_total_hours: +(dailyTotalSeconds / 3600).toFixed(2),
          weekly_total_hours: +(weeklyTotalSeconds / 3600).toFixed(2),
          history: history ?? [],
          company: company ? {
            plan_type: company.plan_type,
            subscription_status: company.subscription_status,
            trial_ends_at: company.trial_ends_at,
          } : null,
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
