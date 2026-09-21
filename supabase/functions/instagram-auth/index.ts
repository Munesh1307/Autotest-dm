import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://auto-dm-beta.vercel.app",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const INSTAGRAM_REDIRECT_URI =
      Deno.env.get("INSTAGRAM_REDIRECT_URI") ||
      "https://auto-dm-beta.vercel.app/dashboard";

    const metaAppId =
      Deno.env.get("META_INSTAGRAM_APP_ID") || "";

    const metaAppSecret =
      Deno.env.get("META_INSTAGRAM_APP_SECRET") || "";

    // --------------------------------------------------
    // 1. Authenticate Supabase user
    // --------------------------------------------------

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing authorization header",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();

    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceKey,
      {
        auth: {
          persistSession: false,
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unauthorized: Invalid or expired user session.",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // --------------------------------------------------
    // 2. Parse request
    // --------------------------------------------------

    const body = await req.json().catch(() => ({}));

    // --------------------------------------------------
    // 3. Generate Instagram OAuth URL
    // --------------------------------------------------

    if (body.action === "get_auth_url") {
      if (!metaAppId) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Missing META_INSTAGRAM_APP_ID in Supabase Secrets.",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      const authUrl =
        `https://www.instagram.com/oauth/authorize` +
        `?client_id=${encodeURIComponent(metaAppId)}` +
        `&redirect_uri=${encodeURIComponent(INSTAGRAM_REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(
          "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments",
        )}`;

      console.log("[instagram-auth] Generated OAuth configuration:", {
        authorization_endpoint: "https://www.instagram.com/oauth/authorize",
        client_id: metaAppId,
        redirect_uri: INSTAGRAM_REDIRECT_URI,
        response_type: "code",
        scope: [
          "instagram_business_basic",
          "instagram_business_manage_messages",
          "instagram_business_manage_comments",
        ],
        auth_url: authUrl,
      });

      return new Response(
        JSON.stringify({
          success: true,
          auth_url: authUrl,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // --------------------------------------------------
    // 4. Read authorization code
    // --------------------------------------------------

    const rawCode = body.code || "";

    if (!rawCode) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing authorization code.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (!metaAppId || !metaAppSecret) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Server configuration error: META_INSTAGRAM_APP_ID or META_INSTAGRAM_APP_SECRET is not configured in Supabase Secrets.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Remove Instagram callback fragment if present.
    const cleanCode = String(rawCode)
      .trim()
      .replace(/#_$/, "");

    // Safe SHA-256 fingerprint of the authorization code (never logging actual code)
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(cleanCode),
    );
    const codeFingerprint = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .substring(0, 12);

    console.log(
      `[instagram-auth] Starting Instagram OAuth token exchange for user ${user.id}`,
    );

    console.log("[instagram-auth] Token exchange request received:", {
      authorization_code_fingerprint: codeFingerprint,
      client_id: metaAppId,
      redirect_uri: INSTAGRAM_REDIRECT_URI,
      grant_type: "authorization_code",
      has_client_secret: Boolean(metaAppSecret),
      has_code: Boolean(cleanCode),
    });

    // --------------------------------------------------
    // 5. Exchange authorization code for short-lived token
    // --------------------------------------------------

    const tokenForm = new URLSearchParams();

    tokenForm.append("client_id", metaAppId);
    tokenForm.append("client_secret", metaAppSecret);
    tokenForm.append("grant_type", "authorization_code");
    tokenForm.append(
      "redirect_uri",
      INSTAGRAM_REDIRECT_URI,
    );
    tokenForm.append("code", cleanCode);

    const shortLivedRes = await fetch(
      "https://api.instagram.com/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenForm.toString(),
      },
    );

    const shortLivedText = await shortLivedRes.text();

    let shortLivedData: any = {};

    try {
      shortLivedData = JSON.parse(shortLivedText);
    } catch {
      shortLivedData = {
        raw_response: shortLivedText,
      };
    }

    if (!shortLivedRes.ok || !shortLivedData.access_token) {
      console.error(
        "[instagram-auth] Meta short-lived token exchange failed:",
        {
          authorization_code_fingerprint: codeFingerprint,
          http_status: shortLivedRes.status,
          response: shortLivedData,
          redirect_uri_used: INSTAGRAM_REDIRECT_URI,
          client_id_used: metaAppId,
        },
      );

      return new Response(
        JSON.stringify({
          success: false,
          error:
            shortLivedData?.error_message ||
            shortLivedData?.error?.message ||
            "Failed to exchange authorization code with Meta.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const shortLivedToken = shortLivedData.access_token;

    let finalAccessToken = shortLivedToken;

    // --------------------------------------------------
    // 6. Exchange for long-lived token
    // --------------------------------------------------

    try {
      const longLivedUrl =
        `https://graph.instagram.com/access_token` +
        `?grant_type=ig_exchange_token` +
        `&client_secret=${encodeURIComponent(metaAppSecret)}` +
        `&access_token=${encodeURIComponent(shortLivedToken)}`;

      const longLivedRes = await fetch(longLivedUrl, {
        method: "GET",
      });

      const longLivedText = await longLivedRes.text();

      let longLivedData: any = {};

      try {
        longLivedData = JSON.parse(longLivedText);
      } catch {
        longLivedData = {
          raw_response: longLivedText,
        };
      }

      if (longLivedRes.ok && longLivedData.access_token) {
        finalAccessToken = longLivedData.access_token;

        console.log(
          "[instagram-auth] Long-lived Instagram access token obtained.",
        );
      } else {
        console.warn(
          "[instagram-auth] Long-lived token exchange warning:",
          {
            http_status: longLivedRes.status,
            response: longLivedData,
          },
        );
      }
    } catch (llErr) {
      console.warn(
        "[instagram-auth] Long-lived token exchange request error:",
        llErr,
      );
    }

    // --------------------------------------------------
    // 7. Fetch Instagram profile
    // --------------------------------------------------

    const profileRes = await fetch(
      `https://graph.instagram.com/v21.0/me?fields=id,username,account_type&access_token=${encodeURIComponent(
        finalAccessToken,
      )}`,
      {
        method: "GET",
      },
    );

    const profileText = await profileRes.text();

    let profileData: any = {};

    try {
      profileData = JSON.parse(profileText);
    } catch {
      profileData = {
        raw_response: profileText,
      };
    }

    if (!profileRes.ok || !profileData.id) {
      console.error(
        "[instagram-auth] Failed to fetch Instagram profile:",
        {
          http_status: profileRes.status,
          response: profileData,
        },
      );

      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Failed to fetch Instagram profile from Meta Graph API.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const igUserId = String(profileData.id);
    const igUsername = String(
      profileData.username || "instagram_user",
    );

    // --------------------------------------------------
    // 8. Save Instagram account
    // --------------------------------------------------

    const { data: savedAccount, error: dbError } =
      await supabaseAdmin
        .from("instagram_accounts")
        .upsert(
          {
            user_id: user.id,
            instagram_user_id: igUserId,
            instagram_username: igUsername,
            access_token: finalAccessToken,
            status: "active",
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "instagram_user_id",
          },
        )
        .select(
          "id, user_id, instagram_user_id, instagram_username, status, created_at, updated_at",
        )
        .single();

    if (dbError) {
      console.error(
        "[instagram-auth] Database save error:",
        dbError,
      );

      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Failed to store Instagram account record in database: " +
            dbError.message,
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    console.log(
      "[instagram-auth] Instagram account connected successfully.",
    );

    // --------------------------------------------------
    // 9. Return safe account data
    // --------------------------------------------------

    return new Response(
      JSON.stringify({
        success: true,
        account: {
          id: savedAccount.id,
          instagram_user_id:
            savedAccount.instagram_user_id,
          instagram_username:
            savedAccount.instagram_username,
          status: savedAccount.status,
        },
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error(
      "[instagram-auth] Top-level handler error:",
      err,
    );

    return new Response(
      JSON.stringify({
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "Internal server error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});