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
    const { data: claimsData, error: userError } = await anonClient.auth.getClaims(token);
    if (userError || !claimsData?.claims) {
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

    // Check trial expiry
    const { data: company } = await serviceClient
      .from("companies")
      .select("subscription_status, trial_ends_at, max_seats")
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

    // Check seat limit
    if (company?.max_seats) {
      const { count } = await serviceClient
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("company_id", userRow.company_id)
        .eq("is_active", true);

      if (count && count > company.max_seats) {
        return new Response(
          JSON.stringify({ success: false, error: "Seat limit exceeded. Please upgrade your plan." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
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
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (activeEntry) {
      return new Response(
        JSON.stringify({ success: false, error: "You already have an active clock-in session" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: entry, error: insertError } = await serviceClient
      .from("time_entries")
      .insert({
        user_id: userId,
        company_id: userRow.company_id,
        clock_in_at: new Date().toISOString(),
        clock_in_lat: lat,
        clock_in_lng: lng,
        clock_in_location: location ?? null,
        status: "active",
        total_seconds: 0,
      })
      .select("*")
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: entry }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
