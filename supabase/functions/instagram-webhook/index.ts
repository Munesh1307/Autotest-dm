import { createClient } from "npm:@supabase/supabase-js@2";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const expectedVerifyToken = Deno.env.get("INSTAGRAM_WEBHOOK_VERIFY_TOKEN");

    console.log(`[Webhook Verification] Mode: ${mode}, Token matched: ${verifyToken === expectedVerifyToken}`);

    if (mode === "subscribe" && verifyToken && verifyToken === expectedVerifyToken) {
      console.log("[Webhook Verification] Challenge accepted successfully.");
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    console.warn("[Webhook Verification] Invalid verification token or mode.");
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
      console.log("[Webhook POST] Incoming payload:", JSON.stringify(body, null, 2));

      // Validate basic Meta payload structure
      if (!body || body.object !== "instagram" || !Array.isArray(body.entry)) {
        console.log("[Webhook POST] Ignored non-instagram or malformed payload.");
        return new Response(JSON.stringify({ message: "Ignored non-instagram payload" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Initialize Supabase Admin Client
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });

      // Process each entry
      for (const entry of body.entry) {
        const igUserId = String(entry.id || ""); // Target Instagram Business Account ID

        if (!igUserId || !Array.isArray(entry.changes)) {
          continue;
        }

        // 1. Identify Connected Instagram Account in Supabase
        const { data: account, error: accountError } = await supabaseAdmin
          .from("instagram_accounts")
          .select("id, user_id, instagram_user_id, instagram_username, access_token, status")
          .eq("instagram_user_id", igUserId)
          .maybeSingle();

        if (accountError) {
          console.error(`[Webhook] Error querying account for IG user ${igUserId}:`, accountError);
        }

        // Determine the access token to use (account token with fallback to environment secret during dev/test)
        const tokenToUse = account?.access_token || Deno.env.get("INSTAGRAM_ACCESS_TOKEN") || "";

        for (const change of entry.changes) {
          // Identify comment events
          if (change.field === "comments" && change.value) {
            const commentVal = change.value;

            const commentId = String(commentVal.id || "");
            const rawCommentText = String(commentVal.text || "");
            const postId = String(commentVal.media?.id || "");
            const commenterId = String(commentVal.from?.id || "");
            const commenterUsername = String(commentVal.from?.username || "");

            if (!commentId) {
              console.warn("[Webhook] Skipping comment change with missing ID.");
              continue;
            }

            console.log(`[Webhook] Processing Comment:
              - Comment ID: ${commentId}
              - IG Account ID: ${igUserId}
              - Post ID: ${postId}
              - Commenter: @${commenterUsername} (${commenterId})
              - Text: "${rawCommentText}"
            `);

            // 2. Check for duplicate event in instagram_webhook_events
            const { data: existingEvent } = await supabaseAdmin
              .from("instagram_webhook_events")
              .select("id, processed")
              .eq("event_id", commentId)
              .maybeSingle();

            if (existingEvent && existingEvent.processed) {
              console.log(`[Webhook] Event ${commentId} has already been processed. Skipping to avoid duplicate DM.`);
              continue;
            }

            // Upsert / Insert raw event into instagram_webhook_events
            let eventRecordId = existingEvent?.id;
            if (!eventRecordId) {
              const { data: insertedEvent, error: insertError } = await supabaseAdmin
                .from("instagram_webhook_events")
                .insert({
                  instagram_account_id: account?.id ?? null,
                  event_id: commentId,
                  event_type: "comment",
                  payload: {
                    instagram_user_id: igUserId,
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

            // 3. Validate Account & Access Token
            if (!tokenToUse) {
              console.warn(`[Webhook] No valid access token found for IG account ${igUserId}.`);
              if (eventRecordId) {
                await supabaseAdmin
                  .from("instagram_webhook_events")
                  .update({
                    processed: true,
                    payload: {
                      ...commentVal,
                      processing_result: {
                        status: "skipped",
                        reason: "no_valid_access_token",
                        processed_at: new Date().toISOString(),
                      },
                    },
                  })
                  .eq("id", eventRecordId);
              }
              continue;
            }

            // 4. Find Active Automation in Supabase
            // Look for automation belonging to this account and matching post (or all_posts)
            let automationsQuery = supabaseAdmin
              .from("instagram_automations")
              .select("id, user_id, instagram_account_id, instagram_post_id, keyword, dm_message, is_active")
              .eq("is_active", true);

            if (account?.id) {
              automationsQuery = automationsQuery.eq("instagram_account_id", account.id);
            }

            const { data: automations, error: autoError } = await automationsQuery;

            if (autoError) {
              console.error("[Webhook] Error fetching automations:", autoError);
              continue;
            }

            if (!automations || automations.length === 0) {
              console.log(`[Webhook] No active automations found for account ${igUserId}.`);
              if (eventRecordId) {
                await supabaseAdmin
                  .from("instagram_webhook_events")
                  .update({
                    processed: true,
                    payload: {
                      ...commentVal,
                      processing_result: {
                        status: "skipped",
                        reason: "no_active_automations",
                        processed_at: new Date().toISOString(),
                      },
                    },
                  })
                  .eq("id", eventRecordId);
              }
              continue;
            }

            // 5. Filter for Post & Perform Case-Insensitive Keyword Matching
            const normalizedComment = rawCommentText.trim().toLowerCase();
            let matchedAutomation: any = null;
            let matchedKeyword = "";

            for (const auto of automations) {
              // Check if post ID matches or is configured for all posts
              const autoPostId = String(auto.instagram_post_id || "").trim();
              const isPostMatch =
                autoPostId === "all_posts" ||
                autoPostId === postId ||
                // In demo/test mode with mock IDs (1, 2, 3), allow matching
                (postId.length < 5 && autoPostId === postId);

              if (!isPostMatch) {
                continue;
              }

              // Parse comma-separated keywords and trim whitespace
              const configuredKeywords = (auto.keyword || "")
                .split(",")
                .map((k: string) => k.trim().toLowerCase())
                .filter((k: string) => k.length > 0);

              // Check if normalized comment contains any configured keyword
              const foundKeyword = configuredKeywords.find((k: string) =>
                normalizedComment.includes(k)
              );

              if (foundKeyword) {
                matchedAutomation = auto;
                matchedKeyword = foundKeyword;
                break;
              }
            }

            if (!matchedAutomation) {
              console.log(`[Webhook] No keyword matched for comment: "${rawCommentText}"`);
              if (eventRecordId) {
                await supabaseAdmin
                  .from("instagram_webhook_events")
                  .update({
                    processed: true,
                    payload: {
                      ...commentVal,
                      processing_result: {
                        status: "ignored",
                        reason: "keyword_not_matched",
                        comment_text: rawCommentText,
                        processed_at: new Date().toISOString(),
                      },
                    },
                  })
                  .eq("id", eventRecordId);
              }
              continue;
            }

            // 6. Send DM using Meta Instagram Messaging API
            console.log(`[Webhook] Keyword "${matchedKeyword}" matched! Sending DM to @${commenterUsername} (${commenterId})...`);

            const dmText = matchedAutomation.dm_message;
            const recipientPayload = commenterId
              ? { id: commenterId }
              : { comment_id: commentId };

            let metaResponseStatus = "failed";
            let metaResponseData: any = null;
            let metaErrorMessage: string | null = null;

            try {
              // Official Meta Instagram Messaging API endpoint
              const metaSendUrl = "https://graph.instagram.com/v21.0/me/messages";

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

              if (dmResponse.ok) {
                metaResponseStatus = "sent";
                console.log(`[Webhook] Automatic DM sent successfully. Message ID:`, metaResponseData?.message_id);
              } else {
                metaResponseStatus = "failed";
                metaErrorMessage = metaResponseData?.error?.message || "Meta API request failed";
                console.error(`[Webhook] Meta Messaging API Error (${dmResponse.status}):`, metaResponseData);
              }
            } catch (dmErr) {
              metaResponseStatus = "failed";
              metaErrorMessage = (dmErr as Error)?.message || "Network error sending DM";
              console.error(`[Webhook] Exception sending DM:`, dmErr);
            }

            // 7. Store Final Processing Result in Database
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

      // Meta requires immediate 200 OK
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
