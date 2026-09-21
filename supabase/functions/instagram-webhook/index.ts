import { createClient } from "npm:@supabase/supabase-js@2";

// CORS headers for preflight and options
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

/**
 * Predictable word/phrase boundary keyword matching
 * Supports multi-word keywords, case-insensitivity, and prevents partial substring collisions.
 */
function matchCommentKeywords(
  commentText: string,
  keywordsStr: string,
): { matched: boolean; matchedKeyword: string } {
  if (!commentText || !keywordsStr) return { matched: false, matchedKeyword: "" };

  const cleanComment = commentText.trim().toLowerCase();

  // Split comma-separated keywords and trim
  const keywords = keywordsStr
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  for (const rawKw of keywords) {
    const cleanKw = rawKw.toLowerCase();
    if (!cleanKw) continue;

    // Escape regex special characters
    const escapedKw = cleanKw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Match keyword with Unicode word/punctuation boundaries
    // Prevents matching "caprice" or "priceless" when keyword is "price"
    const regex = new RegExp(
      `(^|[^\\p{L}\\p{N}_])${escapedKw}([^\\p{L}\\p{N}_]|$)`,
      "iu",
    );

    if (regex.test(cleanComment)) {
      return { matched: true, matchedKeyword: rawKw };
    }
  }

  return { matched: false, matchedKeyword: "" };
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // ============================================================================
  // 1. GET: Meta Webhook Verification (Handshake Challenge)
  // ============================================================================
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const verifyToken = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const expectedVerifyToken = Deno.env.get("INSTAGRAM_WEBHOOK_VERIFY_TOKEN") || "IG_Webhook_9fK3mP7xQ2vL8rT6nW4zA1";

    console.log(
      `[Webhook Verification] Mode: ${mode}, Token provided: ${verifyToken ? "[PRESENT]" : "[MISSING]"}`,
    );

    if (mode === "subscribe" && verifyToken && verifyToken === expectedVerifyToken) {
      console.log("[Webhook Verification] Challenge handshake accepted successfully.");
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    console.warn("[Webhook Verification] Verification challenge failed: Token mismatch or invalid mode.");
    return new Response("Verification failed: Forbidden", {
      status: 403,
      headers: corsHeaders,
    });
  }

  // ============================================================================
  // 2. POST: Process Webhook Events & Trigger Automatic DMs
  // ============================================================================
  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("[Webhook POST] Incoming Meta event payload:", JSON.stringify(body, null, 2));

      // Validate basic Meta webhook structure
      if (!body || body.object !== "instagram" || !Array.isArray(body.entry)) {
        console.log("[Webhook POST] Ignored non-instagram or malformed payload.");
        return new Response(
          JSON.stringify({ message: "Ignored non-instagram payload" }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Initialize Supabase Admin Client
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

      if (!supabaseUrl || !supabaseServiceKey) {
        console.error("[Webhook POST] Missing Supabase server configuration.");
        return new Response(JSON.stringify({ error: "Missing Supabase configuration" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });

      // Process each webhook entry
      for (const entry of body.entry) {
        const igAccountId = String(entry.id || "").trim(); // Instagram Business Account ID

        if (!igAccountId || !Array.isArray(entry.changes)) {
          console.warn("[Webhook] Skipping entry missing ID or changes array.");
          continue;
        }

        // 1. Identify Connected Instagram Account in Supabase
        let { data: account, error: accountError } = await supabaseAdmin
          .from("instagram_accounts")
          .select("id, user_id, instagram_user_id, instagram_username, access_token, status")
          .eq("instagram_user_id", igAccountId)
          .maybeSingle();

        // Fallback: If not matched by exact ID, find the latest active connected account
        if (!account) {
          const { data: fallbackAccount } = await supabaseAdmin
            .from("instagram_accounts")
            .select("id, user_id, instagram_user_id, instagram_username, access_token, status")
            .eq("status", "active")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (fallbackAccount) {
            account = fallbackAccount;
            console.log(`[Webhook] Matched active account @${account.instagram_username} (${account.id}) via fallback.`);
          }
        }

        if (accountError) {
          console.error(`[Webhook] Error querying account for IG user ${igAccountId}:`, accountError);
        }

        const tokenToUse = account?.access_token || Deno.env.get("INSTAGRAM_ACCESS_TOKEN") || "";

        for (const change of entry.changes) {
          // Process comment events
          if (change.field === "comments" && change.value) {
            const commentVal = change.value;

            const commentId = String(commentVal.id || "").trim();
            const rawCommentText = String(commentVal.text || "").trim();
            const postId = String(commentVal.media?.id || "").trim();
            const commenterId = String(commentVal.from?.id || "").trim();
            const commenterUsername = String(commentVal.from?.username || "").trim();

            if (!commentId) {
              console.warn("[Webhook] Skipping comment change with missing ID.");
              continue;
            }

            console.log(`[Webhook] === Processing Instagram Comment ===
              - Comment ID: ${commentId}
              - Post ID: ${postId}
              - Commenter: @${commenterUsername} (${commenterId})
              - Text: "${rawCommentText}"
              - Target IG Account: @${account?.instagram_username || "unknown"} (${igAccountId})
            `);

            // Prevent self-triggering: Do not send Auto DM if the comment is from our own account
            if (
              (commenterId && commenterId === igAccountId) ||
              (commenterUsername && account?.instagram_username && commenterUsername.toLowerCase() === account.instagram_username.toLowerCase())
            ) {
              console.log(`[Webhook] Comment is from own Instagram account (@${commenterUsername}). Skipping Auto DM.`);
              continue;
            }

            // 2. Synchronize comment to instagram_comments table
            if (account?.id && account?.user_id) {
              try {
                await supabaseAdmin
                  .from("instagram_comments")
                  .upsert(
                    {
                      user_id: account.user_id,
                      instagram_account_id: account.id,
                      post_id: postId,
                      instagram_comment_id: commentId,
                      instagram_user_id: commenterId || null,
                      instagram_username: commenterUsername || "instagram_user",
                      comment_text: rawCommentText,
                      parent_comment_id: (commentVal as any).parent_id || null,
                      commented_at: entry.time ? new Date(entry.time * 1000).toISOString() : new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                    { onConflict: "instagram_comment_id" }
                  );
                console.log(`[Webhook] Comment ${commentId} synchronized to instagram_comments.`);
              } catch (commDbErr) {
                console.warn("[Webhook] Non-blocking error saving to instagram_comments:", commDbErr);
              }
            }

            // 3. Duplicate Check: Verify if this comment was already processed (Idempotency)
            const { data: existingEvent } = await supabaseAdmin
              .from("instagram_webhook_events")
              .select("id, processed, payload")
              .eq("event_id", commentId)
              .maybeSingle();

            if (existingEvent && existingEvent.processed) {
              console.log(`[Webhook] Duplicate event detected. Comment ${commentId} already processed. Skipping to avoid duplicate DM.`);
              continue;
            }

            // Also check auto_dm_logs for comment deduplication
            const { data: existingLog } = await supabaseAdmin
              .from("auto_dm_logs")
              .select("id, status")
              .eq("comment_id", commentId)
              .eq("status", "sent")
              .maybeSingle();

            if (existingLog) {
              console.log(`[Webhook] Duplicate check: Comment ${commentId} already has sent log in auto_dm_logs. Skipping to avoid duplicate DM.`);
              continue;
            }

            // Record incoming event in instagram_webhook_events
            let eventRecordId = existingEvent?.id;
            if (!eventRecordId) {
              const { data: insertedEvent, error: insertError } = await supabaseAdmin
                .from("instagram_webhook_events")
                .insert({
                  instagram_account_id: account?.id ?? null,
                  event_id: commentId,
                  event_type: "comment",
                  payload: {
                    instagram_user_id: igAccountId,
                    post_id: postId,
                    comment_id: commentId,
                    commenter: {
                      id: commenterId,
                      username: commenterUsername,
                    },
                    comment_text: rawCommentText,
                    raw_value: commentVal,
                    entry_time: entry.time,
                  },
                  processed: false,
                })
                .select("id")
                .single();

              if (insertError) {
                if (insertError.code === "23505") {
                  console.log(`[Webhook] Duplicate event record ${commentId} concurrently handled.`);
                  continue;
                }
                console.error(`[Webhook] Error inserting webhook event record:`, insertError);
              } else {
                eventRecordId = insertedEvent?.id;
              }
            }

            // 4. Validate Token
            if (!tokenToUse) {
              console.warn(`[Webhook] No valid access token found for account @${account?.instagram_username || igAccountId}.`);
              if (eventRecordId) {
                await supabaseAdmin
                  .from("instagram_webhook_events")
                  .update({
                    processed: true,
                    payload: {
                      comment_id: commentId,
                      post_id: postId,
                      commenter: { id: commenterId, username: commenterUsername },
                      comment_text: rawCommentText,
                      processing_result: {
                        status: "failed",
                        reason: "no_valid_access_token",
                        error_message: "Instagram account has no active access token. Please reconnect.",
                        processed_at: new Date().toISOString(),
                      },
                    },
                  })
                  .eq("id", eventRecordId);
              }
              continue;
            }

            // 5. Fetch Automation Configurations for this Account
            let rules: any[] = [];

            if (account?.id) {
              // Priority 1: instagram_automations
              const { data: autoData } = await supabaseAdmin
                .from("instagram_automations")
                .select("id, user_id, instagram_account_id, instagram_post_id, keyword, dm_message, is_active")
                .eq("instagram_account_id", account.id)
                .eq("is_active", true);

              if (autoData && autoData.length > 0) {
                rules = autoData;
              } else {
                // Priority 2: auto_dm_rules
                try {
                  const { data: rulesData } = await supabaseAdmin
                    .from("auto_dm_rules")
                    .select("id, user_id, instagram_account_id, post_id, keyword, message, is_active")
                    .eq("instagram_account_id", account.id)
                    .eq("is_active", true);

                  if (rulesData && rulesData.length > 0) {
                    rules = rulesData.map((r: any) => ({
                      id: r.id,
                      user_id: r.user_id,
                      instagram_account_id: r.instagram_account_id,
                      instagram_post_id: r.post_id,
                      keyword: r.keyword,
                      dm_message: r.message,
                      is_active: r.is_active,
                    }));
                  }
                } catch (_) {}
              }
            }

            if (!rules || rules.length === 0) {
              console.log(`[Webhook] No active automations found for account ${account?.instagram_username || igAccountId}.`);
              if (eventRecordId) {
                await supabaseAdmin
                  .from("instagram_webhook_events")
                  .update({
                    processed: true,
                    payload: {
                      comment_id: commentId,
                      post_id: postId,
                      commenter: { id: commenterId, username: commenterUsername },
                      comment_text: rawCommentText,
                      processing_result: {
                        status: "ignored",
                        reason: "no_active_automations",
                        processed_at: new Date().toISOString(),
                      },
                    },
                  })
                  .eq("id", eventRecordId);
              }
              continue;
            }

            // 6. Post-Specific Priority Matching
            // Find post-specific rule first, then fallback to 'all_posts' rule
            let targetAutomation = rules.find(
              (a) => String(a.instagram_post_id).trim() === postId,
            );

            if (!targetAutomation) {
              targetAutomation = rules.find(
                (a) => String(a.instagram_post_id).trim() === "all_posts",
              );
            }

            if (!targetAutomation) {
              console.log(`[Webhook] No active automation matched post ID ${postId}.`);
              if (eventRecordId) {
                await supabaseAdmin
                  .from("instagram_webhook_events")
                  .update({
                    processed: true,
                    payload: {
                      comment_id: commentId,
                      post_id: postId,
                      commenter: { id: commenterId, username: commenterUsername },
                      comment_text: rawCommentText,
                      processing_result: {
                        status: "ignored",
                        reason: "no_matching_post_automation",
                        post_id: postId,
                        processed_at: new Date().toISOString(),
                      },
                    },
                  })
                  .eq("id", eventRecordId);
              }
              continue;
            }

            // 7. Predictable Keyword Matching
            const { matched, matchedKeyword } = matchCommentKeywords(
              rawCommentText,
              targetAutomation.keyword,
            );

            if (!matched) {
              console.log(`[Webhook] Comment "${rawCommentText}" did NOT match keywords [${targetAutomation.keyword}] for post ${postId}.`);
              if (eventRecordId) {
                await supabaseAdmin
                  .from("instagram_webhook_events")
                  .update({
                    processed: true,
                    payload: {
                      comment_id: commentId,
                      post_id: postId,
                      commenter: { id: commenterId, username: commenterUsername },
                      comment_text: rawCommentText,
                      processing_result: {
                        status: "ignored",
                        reason: "keyword_not_matched",
                        configured_keywords: targetAutomation.keyword,
                        comment_text: rawCommentText,
                        processed_at: new Date().toISOString(),
                      },
                    },
                  })
                  .eq("id", eventRecordId);
              }
              continue;
            }

            // 8. Send Automatic DM to Commenter via Meta Instagram Messaging API
            console.log(`[Webhook] Match SUCCESS! Keyword "${matchedKeyword}" found in comment. Sending Auto DM to @${commenterUsername}...`);

            const dmText = targetAutomation.dm_message;

            let metaResponseStatus = "failed";
            let metaResponseData: any = null;
            let metaErrorMessage: string | null = null;
            let providerMessageId: string | null = null;

            // Strategy: Use official Private Reply endpoint with comment_id (works within 7-day comment window)
            // Fallback to IGSID recipient if comment_id is unavailable
            const metaSendUrl = "https://graph.instagram.com/v21.0/me/messages";

            // Attempt 1: Private Reply via comment_id
            const recipientPayload = { comment_id: commentId };

            try {
              console.log(`[Webhook] Calling Meta Messaging API with recipient:`, recipientPayload);

              const dmResponse = await fetch(metaSendUrl, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${tokenToUse}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  recipient: recipientPayload,
                  message: {
                    text: dmText,
                  },
                }),
              });

              metaResponseData = await dmResponse.json();

              if (dmResponse.ok && (metaResponseData?.message_id || metaResponseData?.recipient_id)) {
                metaResponseStatus = "sent";
                providerMessageId = metaResponseData?.message_id || null;
                console.log(`[Webhook] Direct Message sent successfully to @${commenterUsername}! Message ID:`, metaResponseData?.message_id);
              } else {
                // If comment_id failed and commenterId exists, attempt fallback with recipient id
                if (commenterId) {
                  console.warn(`[Webhook] Private reply with comment_id failed (${dmResponse.status}). Trying fallback with commenter IGSID (${commenterId})...`);

                  const fallbackResponse = await fetch(metaSendUrl, {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${tokenToUse}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      recipient: { id: commenterId },
                      message: {
                        text: dmText,
                      },
                    }),
                  });

                  const fallbackData = await fallbackResponse.json();
                  if (fallbackResponse.ok && (fallbackData?.message_id || fallbackData?.recipient_id)) {
                    metaResponseStatus = "sent";
                    metaResponseData = fallbackData;
                    providerMessageId = fallbackData?.message_id || null;
                    console.log(`[Webhook] Fallback Direct Message sent successfully! Message ID:`, fallbackData?.message_id);
                  } else {
                    metaResponseStatus = "failed";
                    metaResponseData = fallbackData;
                    metaErrorMessage = fallbackData?.error?.message || metaResponseData?.error?.message || "Meta Messaging API request failed";
                    console.error(`[Webhook] Meta API Error:`, fallbackData);
                  }
                } else {
                  metaResponseStatus = "failed";
                  metaErrorMessage = metaResponseData?.error?.message || `Meta API Error (${dmResponse.status})`;
                  console.error(`[Webhook] Meta API Error:`, metaResponseData);
                }
              }
            } catch (dmErr) {
              metaResponseStatus = "failed";
              metaErrorMessage = (dmErr as Error)?.message || "Network exception while sending Instagram DM";
              console.error(`[Webhook] Network Exception sending DM:`, dmErr);
            }

            // 9. Store in auto_dm_logs
            try {
              await supabaseAdmin
                .from("auto_dm_logs")
                .insert({
                  user_id: account?.user_id || targetAutomation.user_id,
                  post_id: postId,
                  comment_id: commentId,
                  instagram_user_id: commenterId || null,
                  rule_id: targetAutomation.id && targetAutomation.id.length === 36 ? targetAutomation.id : null,
                  message: dmText,
                  status: metaResponseStatus,
                  provider_message_id: providerMessageId,
                  error_message: metaErrorMessage,
                });
            } catch (logErr) {
              console.warn("[Webhook] Error writing to auto_dm_logs:", logErr);
            }

            // 10. Store Final Result in instagram_webhook_events for Live UI Status
            if (eventRecordId) {
              await supabaseAdmin
                .from("instagram_webhook_events")
                .update({
                  processed: true,
                  payload: {
                    comment_id: commentId,
                    post_id: postId,
                    commenter: {
                      id: commenterId,
                      username: commenterUsername,
                    },
                    comment_text: rawCommentText,
                    processing_result: {
                      status: metaResponseStatus,
                      matched_keyword: matchedKeyword,
                      dm_message_sent: dmText,
                      meta_response: metaResponseData,
                      error_message: metaErrorMessage,
                      processed_at: new Date().toISOString(),
                    },
                  },
                })
                .eq("id", eventRecordId);
            }
          }
        }
      }

      // Meta requires immediate 200 OK response
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[Webhook POST] Unhandled top-level error:", err);
      return new Response(JSON.stringify({ error: (err as Error)?.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
});
