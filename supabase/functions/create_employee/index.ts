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

    const adminUserId = claimsData.claims.sub as string;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify admin
    const { data: adminRow, error: adminError } = await serviceClient
      .from("users")
      .select("role, company_id")
      .eq("id", adminUserId)
      .single();

    if (adminError || !adminRow || adminRow.role !== "admin") {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden: admin role required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, full_name, role, location_id, redirect_to } = await req.json();

    if (!email || !role) {
      return new Response(
        JSON.stringify({ success: false, error: "email and role are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if email already exists in the company
    const { data: existingUser } = await serviceClient
      .from("users")
      .select("id")
      .eq("email", email)
      .eq("company_id", adminRow.company_id)
      .maybeSingle();

    if (existingUser) {
      return new Response(
        JSON.stringify({ success: false, error: "An employee with this email already exists in your company" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create user with a random password (email auto-confirmed so reset email works)
    let newUserId: string;
    const tempPassword = crypto.randomUUID() + "Aa1!";
    const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (authError) {
      // If email already exists in auth (orphaned), look it up and reuse
      if (authError.message?.includes("already been registered")) {
        const { data: listData, error: listError } = await serviceClient.auth.admin.listUsers({
          page: 1,
          perPage: 1,
          filter: email,
        } as any);
        const existingAuthUser = listData?.users?.[0];
        if (!existingAuthUser || listError) {
          const { data: allData } = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const fallbackUser = allData?.users?.find((u) => u.email === email);
          if (!fallbackUser) {
            return new Response(
              JSON.stringify({ success: false, error: "Email exists in auth but could not be found. Please contact support." }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          newUserId = fallbackUser.id;
        } else {
          newUserId = existingAuthUser.id;
        }

        // Check if trigger already created a users row for this id
        const { data: existingRow } = await serviceClient
          .from("users")
          .select("id, company_id")
          .eq("id", newUserId)
          .maybeSingle();

        if (existingRow) {
          const orphanCid = existingRow.company_id;
          await serviceClient
            .from("users")
            .update({
              company_id: adminRow.company_id,
              full_name: full_name || null,
              role,
              location_id: location_id || null,
              is_active: true,
              is_confirmed: false,
            })
            .eq("id", newUserId);
          if (orphanCid && orphanCid !== adminRow.company_id) {
            await serviceClient.from("companies").delete().eq("id", orphanCid);
          }
        } else {
          await serviceClient.from("users").insert({
            id: newUserId,
            company_id: adminRow.company_id,
            email,
            full_name: full_name || null,
            role,
            location_id: location_id || null,
            is_active: true,
            is_confirmed: false,
          });
        }
      } else {
        return new Response(
          JSON.stringify({ success: false, error: authError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      newUserId = authData.user.id;

      // The handle_new_auth_user trigger auto-creates a company + user row.
      await new Promise((r) => setTimeout(r, 500));

      const { data: autoUser } = await serviceClient
        .from("users")
        .select("company_id")
        .eq("id", newUserId)
        .maybeSingle();

      const orphanCompanyId = autoUser?.company_id;

      if (autoUser) {
        await serviceClient
          .from("users")
          .update({
            company_id: adminRow.company_id,
            full_name: full_name || null,
            role,
            location_id: location_id || null,
            is_confirmed: false,
          })
          .eq("id", newUserId);
      } else {
        await serviceClient.from("users").insert({
          id: newUserId,
          company_id: adminRow.company_id,
          email,
          full_name: full_name || null,
          role,
          location_id: location_id || null,
          is_confirmed: false,
        });
      }

      if (orphanCompanyId && orphanCompanyId !== adminRow.company_id) {
        await serviceClient.from("companies").delete().eq("id", orphanCompanyId);
      }
    }

    // Generate a password recovery link to share with the employee
    const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: redirect_to || Deno.env.get("SUPABASE_URL")!,
      },
    });

    const setupLink = linkData?.properties?.action_link || null;

    return new Response(
      JSON.stringify({ success: true, user_id: newUserId, setup_link: setupLink }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
