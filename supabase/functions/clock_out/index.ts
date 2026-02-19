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

    const { data: userRow } = await serviceClient
      .from("users")
      .select("role, company_id, is_active")
      .eq("id", userId)
      .single();

    if (!userRow) {
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

    const body = await req.json();
    const { lat, lng, location } = body;

    if (lat == null || lng == null || typeof lat !== "number" || typeof lng !== "number") {
      return new Response(
        JSON.stringify({ success: false, error: "lat and lng are required (numbers)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: activeEntry } = await serviceClient
      .from("time_entries")
      .select("*")
      .eq("user_id", userId)
      .eq("company_id", userRow.company_id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!activeEntry) {
      return new Response(
        JSON.stringify({ success: false, error: "No active clock-in session found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date();
    const clockInTime = new Date(activeEntry.clock_in_at);
    const totalSeconds = Math.floor((now.getTime() - clockInTime.getTime()) / 1000);

    const { data: updatedEntry, error: updateError } = await serviceClient
      .from("time_entries")
      .update({
        clock_out_at: now.toISOString(),
        clock_out_lat: lat,
        clock_out_lng: lng,
        clock_out_location: location ?? null,
        status: "completed",
        total_seconds: totalSeconds,
      })
      .eq("id", activeEntry.id)
      .select("*")
      .single();

    if (updateError) {
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: updatedEntry }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
