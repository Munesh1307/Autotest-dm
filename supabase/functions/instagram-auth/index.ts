
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req: Request) => {
  // --------------------------------------------------
  // 0. Handle CORS preflight
  // --------------------------------------------------

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // --------------------------------------------------
    // 1. Read Supabase environment variables
    // --------------------------------------------------

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

    const supabaseServiceKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const metaAppId =
      Deno.env.get("META_INSTAGRAM_APP_ID") ?? "";

    const metaAppSecret =
      Deno.env.get("META_INSTAGRAM_APP_SECRET") ?? "";

    const envRedirectUri =
      Deno.env.get("INSTAGRAM_REDIRECT_URI") ?? "";

    // --------------------------------------------------
    // 2. Parse request body
    // --------------------------------------------------

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    /*
     * Resolve redirect_uri:
     * 1. Priority to body.redirect_uri passed by caller
     * 2. Fallback to INSTAGRAM_REDIRECT_URI in Supabase Secrets
     */
    const resolvedRedirectUri =
      (typeof body.redirect_uri === "string" && body.redirect_uri.trim())
        ? body.redirect_uri.trim()
        : envRedirectUri.trim();

    // --------------------------------------------------
    // 3. Validate server configuration
    // --------------------------------------------------

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Missing Supabase server configuration (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).",
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

    if (!metaAppId) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Missing META_INSTAGRAM_APP_ID in Supabase Secrets.",
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

    if (!metaAppSecret) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Missing META_INSTAGRAM_APP_SECRET in Supabase Secrets.",
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

    if (!resolvedRedirectUri) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Missing redirect_uri. Please provide redirect_uri in request or set INSTAGRAM_REDIRECT_URI in Supabase Secrets.",
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

    // --------------------------------------------------
    // 3. Authenticate Supabase user
    // --------------------------------------------------

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing authorization header.",
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

    const token = authHeader
      .replace(/^Bearer\s+/i, "")
      .trim();

    if (!token) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing bearer token.",
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

    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error(
        "[instagram-auth] Supabase authentication failed:",
        userError,
      );

      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Unauthorized: Invalid or expired user session.",
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
    // 4. Generate Instagram OAuth URL
    // --------------------------------------------------

    if (body.action === "get_auth_url") {
      const scopes = [
        "instagram_business_basic",
        "instagram_business_manage_messages",
        "instagram_business_manage_comments",
      ];

      const authUrl =
        "https://www.instagram.com/oauth/authorize" +
        `?client_id=${encodeURIComponent(metaAppId)}` +
        `&redirect_uri=${encodeURIComponent(
          resolvedRedirectUri,
        )}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scopes.join(","))}`;

      console.log(
        "[instagram-auth] OAuth URL configuration:",
        {
          authorization_endpoint:
            "https://www.instagram.com/oauth/authorize",
          client_id: metaAppId,
          redirect_uri: resolvedRedirectUri,
          response_type: "code",
          scopes,
        },
      );

      return new Response(
        JSON.stringify({
          success: true,
          auth_url: authUrl,
          redirect_uri: resolvedRedirectUri,
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
    // 5. Read authorization code
    // --------------------------------------------------

    const rawCode =
      typeof body.code === "string"
        ? body.code.trim()
        : "";

    if (!rawCode) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Missing authorization code.",
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

    /*
     * Instagram sometimes returns a code with #_ appended.
     * Remove only that callback fragment.
     */
    const cleanCode = rawCode.replace(/#_$/, "");

    // --------------------------------------------------
    // 6. Create safe code fingerprint for logs
    // --------------------------------------------------

    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(cleanCode),
    );

    const codeFingerprint = Array.from(
      new Uint8Array(hashBuffer),
    )
      .map((byte) =>
        byte.toString(16).padStart(2, "0"),
      )
      .join("")
      .substring(0, 12);

    console.log(
      `[instagram-auth] Starting OAuth token exchange for user ${user.id}`,
    );

    console.log(
      "[instagram-auth] OAuth exchange configuration:",
      {
        authorization_code_fingerprint:
          codeFingerprint,
        client_id: metaAppId,
        redirect_uri: resolvedRedirectUri,
        grant_type: "authorization_code",
        has_client_secret: Boolean(metaAppSecret),
        has_code: Boolean(cleanCode),
      },
    );

    // --------------------------------------------------
    // 7. Exchange authorization code for short-lived token
    // --------------------------------------------------

    const tokenForm = new URLSearchParams();

    tokenForm.append(
      "client_id",
      metaAppId,
    );

    tokenForm.append(
      "client_secret",
      metaAppSecret,
    );

    tokenForm.append(
      "grant_type",
      "authorization_code",
    );

    /*
     * VERY IMPORTANT:
     *
     * This MUST exactly match the redirect_uri
     * used in Step 4.
     */
    tokenForm.append(
      "redirect_uri",
      resolvedRedirectUri,
    );

    tokenForm.append(
      "code",
      cleanCode,
    );

    console.log(
      "[instagram-auth] Token exchange fields:",
      {
        client_id: metaAppId,
        grant_type: "authorization_code",
        redirect_uri: resolvedRedirectUri,
        has_code: Boolean(cleanCode),
        has_client_secret: Boolean(metaAppSecret),
      },
    );

    const shortLivedRes = await fetch(
      "https://api.instagram.com/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body: tokenForm.toString(),
      },
    );

    const shortLivedText =
      await shortLivedRes.text();

    let shortLivedData: any = {};

    try {
      shortLivedData =
        JSON.parse(shortLivedText);
    } catch {
      shortLivedData = {
        raw_response: shortLivedText,
      };
    }

    if (
      !shortLivedRes.ok ||
      !shortLivedData.access_token
    ) {
      console.error(
        "[instagram-auth] Short-lived token exchange failed:",
        {
          http_status: shortLivedRes.status,
          response: shortLivedData,
          fbtrace_id:
            shortLivedData?.fbtrace_id ??
            "not_present",
          error_type:
            shortLivedData?.error_type ??
            "unknown",
          error_code:
            shortLivedData?.code ??
            "unknown",
          redirect_uri_used:
            resolvedRedirectUri,
          client_id_used: metaAppId,
        },
      );

      return new Response(
        JSON.stringify({
          success: false,
          error:
            shortLivedData?.error_message ||
            shortLivedData?.error?.message ||
            "Failed to exchange authorization code with Instagram.",
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

    const shortLivedToken =
      shortLivedData.access_token;

    let finalAccessToken =
      shortLivedToken;

    // --------------------------------------------------
    // 9. Exchange short-lived token for long-lived token
    // --------------------------------------------------

    try {
      const longLivedUrl =
        "https://graph.instagram.com/access_token" +
        "?grant_type=ig_exchange_token" +
        `&client_secret=${encodeURIComponent(
          metaAppSecret,
        )}` +
        `&access_token=${encodeURIComponent(
          shortLivedToken,
        )}`;

      const longLivedRes =
        await fetch(longLivedUrl, {
          method: "GET",
        });

      const longLivedText =
        await longLivedRes.text();

      let longLivedData: any = {};

      try {
        longLivedData =
          JSON.parse(longLivedText);
      } catch {
        longLivedData = {
          raw_response: longLivedText,
        };
      }

      if (
        longLivedRes.ok &&
        longLivedData.access_token
      ) {
        finalAccessToken =
          longLivedData.access_token;

        console.log(
          "[instagram-auth] Long-lived Instagram access token obtained.",
        );
      } else {
        console.warn(
          "[instagram-auth] Long-lived token exchange failed:",
          {
            http_status:
              longLivedRes.status,
            response: longLivedData,
          },
        );

        /*
         * We keep the short-lived token as a fallback.
         * The account can still be saved if profile
         * retrieval succeeds.
         */
      }
    } catch (longLivedError) {
      console.warn(
        "[instagram-auth] Long-lived token request error:",
        longLivedError,
      );
    }

    // --------------------------------------------------
    // 10. Fetch Instagram profile
    // --------------------------------------------------

    const profileUrl =
      "https://graph.instagram.com/v21.0/me" +
      "?fields=id,username,account_type" +
      `&access_token=${encodeURIComponent(
        finalAccessToken,
      )}`;

    const profileRes =
      await fetch(profileUrl, {
        method: "GET",
      });

    const profileText =
      await profileRes.text();

    let profileData: any = {};

    try {
      profileData =
        JSON.parse(profileText);
    } catch {
      profileData = {
        raw_response: profileText,
      };
    }

    if (
      !profileRes.ok ||
      !profileData.id
    ) {
      console.error(
        "[instagram-auth] Failed to fetch Instagram profile:",
        {
          http_status:
            profileRes.status,
          response: profileData,
        },
      );

      return new Response(
        JSON.stringify({
          success: false,
          error:
            profileData?.error?.message ||
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

    const igUserId =
      String(profileData.id);

    const igUsername =
      String(
        profileData.username ||
          "instagram_user",
      );

    // --------------------------------------------------
    // 11. Save Instagram account
    // --------------------------------------------------

    const {
      data: savedAccount,
      error: dbError,
    } = await supabaseAdmin
      .from("instagram_accounts")
      .upsert(
        {
          user_id: user.id,
          instagram_user_id:
            igUserId,
          instagram_username:
            igUsername,
          access_token:
            finalAccessToken,
          status: "active",
          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict:
            "instagram_user_id",
        },
      )
      .select(
        `
          id,
          user_id,
          instagram_user_id,
          instagram_username,
          status,
          created_at,
          updated_at
        `,
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
            "Content-Type":
              "application/json",
          },
        },
      );
    }

    // --------------------------------------------------
    // 12. Success response
    // --------------------------------------------------

    console.log(
      "[instagram-auth] Instagram account connected successfully.",
      {
        user_id: user.id,
        instagram_user_id:
          igUserId,
        instagram_username:
          igUsername,
      },
    );

    /*
     * NEVER return access_token to frontend.
     */
    return new Response(
      JSON.stringify({
        success: true,
        account: {
          id: savedAccount.id,
          instagram_user_id:
            savedAccount.instagram_user_id,
          instagram_username:
            savedAccount.instagram_username,
          status:
            savedAccount.status,
        },
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      },
    );
  } catch (err) {
    // --------------------------------------------------
    // 13. Global error handler
    // --------------------------------------------------

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
            : "Internal server error.",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      },
    );
  }
});

