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

    const callerUserId = claimsData.claims.sub as string;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: callerRow } = await serviceClient
      .from("users")
      .select("role, company_id, is_active")
      .eq("id", callerUserId)
      .single();

    if (!callerRow || !callerRow.is_active) {
      return new Response(
        JSON.stringify({ success: false, error: "User not found or inactive" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action } = body;

    // ─── ENROLL ───
    if (action === "enroll") {
      const { target_user_id, descriptor, photo_url } = body;

      if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
        return new Response(
          JSON.stringify({ success: false, error: "descriptor must be a 128-element float array" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Determine target: self or admin enrolling someone
      const targetUserId = target_user_id || callerUserId;
      const isAdmin = callerRow.role === "admin";
      const isSelf = targetUserId === callerUserId;

      if (!isSelf && !isAdmin) {
        return new Response(
          JSON.stringify({ success: false, error: "Only admins can enroll other users" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify target user is in same company
      if (!isSelf) {
        const { data: targetUser } = await serviceClient
          .from("users")
          .select("company_id")
          .eq("id", targetUserId)
          .single();
        if (!targetUser || targetUser.company_id !== callerRow.company_id) {
          return new Response(
            JSON.stringify({ success: false, error: "Target user not in your company" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Deactivate any existing enrollment
      await serviceClient
        .from("face_enrollments")
        .update({ is_active: false })
        .eq("user_id", targetUserId)
        .eq("is_active", true);

      // Insert new enrollment
      const { data: enrollment, error: insertError } = await serviceClient
        .from("face_enrollments")
        .insert({
          user_id: targetUserId,
          company_id: callerRow.company_id,
          descriptor,
          photo_url: photo_url ?? null,
          enrolled_by: callerUserId,
          is_active: true,
        })
        .select("id, user_id, created_at")
        .single();

      if (insertError) {
        return new Response(
          JSON.stringify({ success: false, error: insertError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: enrollment }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── VERIFY ───
    if (action === "verify") {
      const { descriptor } = body;

      if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
        return new Response(
          JSON.stringify({ success: false, error: "descriptor must be a 128-element float array" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get the caller's active enrollment
      const { data: enrollment } = await serviceClient
        .from("face_enrollments")
        .select("descriptor")
        .eq("user_id", callerUserId)
        .eq("is_active", true)
        .single();

      if (!enrollment) {
        return new Response(
          JSON.stringify({ success: false, error: "No face enrollment found. Please enroll your face first.", needs_enrollment: true }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Compute Euclidean distance between descriptors
      const stored = enrollment.descriptor as number[];
      let sum = 0;
      for (let i = 0; i < 128; i++) {
        sum += (descriptor[i] - stored[i]) ** 2;
      }
      const distance = Math.sqrt(sum);

      // Threshold: 0.6 is standard for face-api.js (lower = stricter)
      const THRESHOLD = 0.6;
      const match = distance < THRESHOLD;
      const confidence = Math.max(0, Math.min(1, 1 - distance / THRESHOLD));

      return new Response(
        JSON.stringify({ success: true, data: { match, distance: Math.round(distance * 1000) / 1000, confidence: Math.round(confidence * 100) } }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── STATUS ───
    if (action === "status") {
      const targetUserId = body.target_user_id || callerUserId;

      // Only admins can check others
      if (targetUserId !== callerUserId && callerRow.role !== "admin") {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: enrollment } = await serviceClient
        .from("face_enrollments")
        .select("id, created_at, updated_at, photo_url")
        .eq("user_id", targetUserId)
        .eq("is_active", true)
        .maybeSingle();

      return new Response(
        JSON.stringify({ success: true, data: { enrolled: !!enrollment, enrollment } }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action. Use: enroll, verify, status" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
