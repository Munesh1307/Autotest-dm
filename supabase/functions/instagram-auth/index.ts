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

    const metaAppId =
      Deno.env.get("META_INSTAGRAM_APP_ID") ||
      Deno.env.get("META_APP_ID") ||
      "";

    const metaAppSecret = Deno.env.get("META_APP_SECRET") || "";

    // IMPORTANT:
    // One single redirect URI is used for the complete OAuth flow.
    const redirectUri =
      Deno.env.get("INSTAGRAM_REDIRECT_URI") ||
      "https://auto-dm-beta.vercel.app/dashboard";

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
        }
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
      }
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
        }
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
              "Missing META_INSTAGRAM_APP_ID or META_APP_ID in Supabase Secrets.",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      console.log(
        "[instagram-auth] OAuth redirect URI:",
        redirectUri
      );

      const authUrl =
        `https://www.instagram.com/oauth/authorize` +
        `?enable_fb_login=0` +
        `&force_authentication=1` +
        `&client_id=${encodeURIComponent(metaAppId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(
          "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments"
        )}`;

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
        }
      );
    }

    // --------------------------------------------------
    // 4. Exchange Instagram authorization code
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
        }
      );
    }

    if (!metaAppId || !metaAppSecret) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Server configuration error: META_INSTAGRAM_APP_ID or META_APP_SECRET is not configured in Supabase Secrets.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const cleanCode = String(rawCode).replace(/#_$/, "");

    console.log(
      `[instagram-auth] Exchanging Instagram authorization code for user ${user.id}...`
    );

    console.log(
      "[instagram-auth] Token exchange redirect URI:",
      redirectUri
    );

    // --------------------------------------------------
    // 5. Exchange code for short-lived access token
    // --------------------------------------------------

    const tokenForm = new URLSearchParams();

    tokenForm.append("client_id", metaAppId);
    tokenForm.append("client_secret", metaAppSecret);
    tokenForm.append("grant_type", "authorization_code");
    tokenForm.append("redirect_uri", redirectUri);
    tokenForm.append("code", cleanCode);

    const shortLivedRes = await fetch(
      "https://api.instagram.com/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenForm.toString(),
      }
    );

    const shortLivedData = await shortLivedRes.json();

    if (!shortLivedRes.ok || !shortLivedData.access_token) {
      console.error(
        "[instagram-auth] Short-lived token exchange failed:",
        shortLivedData
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
        }
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

      const longLivedData = await longLivedRes.json();

      if (longLivedRes.ok && longLivedData.access_token) {
        finalAccessToken = longLivedData.access_token;

        console.log(
          "[instagram-auth] Obtained long-lived Instagram access token."
        );
      } else {
        console.warn(
          "[instagram-auth] Long-lived token exchange warning:",
          longLivedData
        );
      }
    } catch (llErr) {
      console.warn(
        "[instagram-auth] Long-lived exchange request error:",
        llErr
      );
    }

    // --------------------------------------------------
    // 7. Fetch Instagram profile
    // --------------------------------------------------

    const profileRes = await fetch(
      `https://graph.instagram.com/v21.0/me?fields=id,username,account_type&access_token=${encodeURIComponent(
        finalAccessToken
      )}`,
      {
        method: "GET",
      }
    );

    const profileData = await profileRes.json();

    if (!profileRes.ok || !profileData.id) {
      console.error(
        "[instagram-auth] Failed to fetch Instagram profile:",
        profileData
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
        }
      );
    }

    const igUserId = String(profileData.id);
    const igUsername = String(
      profileData.username || "instagram_user"
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
          }
        )
        .select(
          "id, user_id, instagram_user_id, instagram_username, status, created_at, updated_at"
        )
        .single();

    if (dbError) {
      console.error(
        "[instagram-auth] Database save error:",
        dbError
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
        }
      );
    }

    console.log(
      "[instagram-auth] Instagram account connected successfully."
    );

    // --------------------------------------------------
    // 9. Return safe account data
    // --------------------------------------------------

    return new Response(
      JSON.stringify({
        success: true,
        account: {
          id: savedAccount.id,
          instagram_user_id: savedAccount.instagram_user_id,
          instagram_username: savedAccount.instagram_username,
          status: savedAccount.status,
        },
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error(
      "[instagram-auth] Top-level handler error:",
      err
    );

    return new Response(
      JSON.stringify({
        success: false,
        error:
          (err as Error)?.message ||
          "Internal server error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});