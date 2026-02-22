import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_FIELDS = [
  "clock_in_at",
  "clock_out_at",
  "clock_in_lat",
  "clock_in_lng",
  "clock_out_lat",
  "clock_out_lng",
  "clock_in_location",
  "clock_out_location",
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth check ---
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

    // --- Service role client for privileged operations ---
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // --- Verify user is admin ---
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

    const adminCompanyId = userRow.company_id;

    // --- Parse body ---
    const body = await req.json();
    const { punch_id, ...updates } = body;

    if (!punch_id || typeof punch_id !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "punch_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter to allowed fields only
    const sanitizedUpdates: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in updates) {
        sanitizedUpdates[key] = updates[key];
      }
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No valid fields to update" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Fetch existing time entry ---
    const { data: existingEntry, error: fetchError } = await serviceClient
      .from("time_entries")
      .select("*")
      .eq("id", punch_id)
      .single();

    if (fetchError || !existingEntry) {
      return new Response(
        JSON.stringify({ success: false, error: "Time entry not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Validate company match ---
    if (existingEntry.company_id !== adminCompanyId) {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden: entry does not belong to your company" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Validate status ---
    if (existingEntry.status !== "completed") {
      return new Response(
        JSON.stringify({ success: false, error: "Only completed entries can be edited" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Recalculate total_seconds ---
    const finalClockIn = (sanitizedUpdates.clock_in_at as string) ?? existingEntry.clock_in_at;
    const finalClockOut = (sanitizedUpdates.clock_out_at as string) ?? existingEntry.clock_out_at;

    if (finalClockIn && finalClockOut) {
      const diffMs = new Date(finalClockOut).getTime() - new Date(finalClockIn).getTime();
      if (diffMs < 0) {
        return new Response(
          JSON.stringify({ success: false, error: "clock_out_at must be after clock_in_at" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      let totalSecs = Math.floor(diffMs / 1000);

      // Apply break deduction based on user's assigned location
      const { data: entryUser } = await serviceClient
        .from("users")
        .select("location_id")
        .eq("id", existingEntry.user_id)
        .single();

      if (entryUser?.location_id) {
        const { data: loc } = await serviceClient
          .from("locations")
          .select("break_after_hours, break_duration_minutes")
          .eq("id", entryUser.location_id)
          .single();

        if (loc?.break_after_hours && loc?.break_duration_minutes) {
          if (totalSecs > loc.break_after_hours * 3600) {
            totalSecs -= loc.break_duration_minutes * 60;
            if (totalSecs < 0) totalSecs = 0;
          }
        }
      }

      sanitizedUpdates.total_seconds = totalSecs;
    }

    // --- Audit log (old state) ---
    await serviceClient.from("audit_logs").insert({
      table_name: "time_entries",
      record_id: punch_id,
      action: "admin_edit_punch",
      old_values: existingEntry,
      new_values: sanitizedUpdates,
      performed_by: userId,
    });

    // --- Update ---
    const { data: updatedEntry, error: updateError } = await serviceClient
      .from("time_entries")
      .update(sanitizedUpdates)
      .eq("id", punch_id)
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
