import { createClient } from "@/utils/supabase/client";

/**
 * Instagram Service
 * Secure communication layer between the frontend and Supabase Edge Functions / DB.
 * Sensitive tokens are never handled in the client.
 */

export const instagramService = {
  /**
   * Fetch connected Instagram account for the current user
   */
  async getConnectedAccount(supabase) {
    const client = supabase || createClient();
    const {
      data: { user },
      error: userError,
    } = await client.auth.getUser();

    if (userError || !user) return { account: null, error: userError };

    const { data: account, error } = await client
      .from("instagram_accounts")
      .select("id, user_id, instagram_user_id, instagram_username, status, created_at, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    return { account, error };
  },

  /**
   * Initiate Instagram OAuth connection URL
   */
  async getAuthUrl(supabase, redirectUri) {
    const client = supabase || createClient();
    const { data, error } = await client.functions.invoke("instagram-auth", {
      body: {
        action: "get_auth_url",
        redirect_uri: redirectUri,
      },
    });

    return { data, error };
  },

  /**
   * Exchange OAuth verification code for account connection
   */
  async exchangeCode(supabase, code, redirectUri) {
    const client = supabase || createClient();
    const { data, error } = await client.functions.invoke("instagram-auth", {
      body: {
        code,
        redirect_uri: redirectUri,
      },
    });

    return { data, error };
  },

  /**
   * Disconnect Instagram account
   */
  async disconnectAccount(supabase, accountId) {
    const client = supabase || createClient();
    const { error } = await client
      .from("instagram_accounts")
      .delete()
      .eq("id", accountId);

    return { error };
  },

  /**
   * Fetch real dynamic posts / media from connected Instagram Professional account
   */
  async getPosts(supabase, { limit = 24, after = null } = {}) {
    const client = supabase || createClient();
    const { data, error } = await client.functions.invoke("instagram-auth", {
      body: {
        action: "get_media",
        limit,
        after,
      },
    });

    if (error) {
      let msg = error.message;
      if (error.context) {
        try {
          const errBody = await error.context.json();
          msg = errBody.error || errBody.message || msg;
        } catch (_) {}
      }
      return { posts: [], paging: null, error: msg };
    }

    if (data?.error) {
      return { posts: [], paging: null, error: data.error, expired: data.expired };
    }

    return {
      posts: data?.data || [],
      paging: data?.paging || null,
      error: null,
    };
  },

  /**
   * Fetch real dynamic comments for a specific Instagram post
   */
  async getComments(supabase, postId, { limit = 50, after = null } = {}) {
    if (!postId) return { comments: [], error: "Missing post ID" };

    const client = supabase || createClient();
    const { data, error } = await client.functions.invoke("instagram-auth", {
      body: {
        action: "get_comments",
        post_id: String(postId),
        limit,
        after,
      },
    });

    if (error) {
      let msg = error.message;
      if (error.context) {
        try {
          const errBody = await error.context.json();
          msg = errBody.error || errBody.message || msg;
        } catch (_) {}
      }
      return { comments: [], paging: null, error: msg };
    }

    if (data?.error) {
      return { comments: [], paging: null, error: data.error, expired: data.expired };
    }

    return {
      comments: data?.data || [],
      paging: data?.paging || null,
      error: null,
    };
  },

  /**
   * Reply to an Instagram comment
   */
  async replyToComment(supabase, commentId, message) {
    if (!commentId || !message?.trim()) {
      return { success: false, error: "Comment ID and reply message are required" };
    }

    const client = supabase || createClient();
    const { data, error } = await client.functions.invoke("instagram-auth", {
      body: {
        action: "reply_comment",
        comment_id: String(commentId),
        message: message.trim(),
      },
    });

    if (error) {
      let msg = error.message;
      if (error.context) {
        try {
          const errBody = await error.context.json();
          msg = errBody.error || errBody.message || msg;
        } catch (_) {}
      }
      return { success: false, error: msg };
    }

    if (data?.error) {
      return { success: false, error: data.error };
    }

    return { success: true, id: data?.id, message: data?.message };
  },

  /**
   * Delete an Instagram comment
   */
  async deleteComment(supabase, commentId) {
    if (!commentId) return { success: false, error: "Comment ID is required" };

    const client = supabase || createClient();
    const { data, error } = await client.functions.invoke("instagram-auth", {
      body: {
        action: "delete_comment",
        comment_id: String(commentId),
      },
    });

    if (error) {
      let msg = error.message;
      if (error.context) {
        try {
          const errBody = await error.context.json();
          msg = errBody.error || errBody.message || msg;
        } catch (_) {}
      }
      return { success: false, error: msg };
    }

    if (data?.error) {
      return { success: false, error: data.error };
    }

    return { success: true };
  },

  /**
   * Hide / Unhide an Instagram comment
   */
  async hideComment(supabase, commentId, hide = true) {
    if (!commentId) return { success: false, error: "Comment ID is required" };

    const client = supabase || createClient();
    const { data, error } = await client.functions.invoke("instagram-auth", {
      body: {
        action: "hide_comment",
        comment_id: String(commentId),
        hide,
      },
    });

    if (error) {
      let msg = error.message;
      if (error.context) {
        try {
          const errBody = await error.context.json();
          msg = errBody.error || errBody.message || msg;
        } catch (_) {}
      }
      return { success: false, error: msg };
    }

    if (data?.error) {
      return { success: false, error: data.error };
    }

    return { success: true, hidden: data?.hidden };
  },

  /**
   * Fetch automation rule for a post
   */
  async getPostAutomation(supabase, accountId, postId) {
    const client = supabase || createClient();
    const { data, error } = await client
      .from("instagram_automations")
      .select("*")
      .eq("instagram_account_id", accountId)
      .eq("instagram_post_id", String(postId))
      .maybeSingle();

    return { data, error };
  },

  /**
   * Save or update automation rule
   */
  async saveAutomation(supabase, { accountId, postId, keyword, dmMessage, isActive, automationId }) {
    const client = supabase || createClient();

    // Use RPC if available or standard upsert
    try {
      const { data, error } = await client.rpc("save_instagram_automation", {
        p_account_id: accountId,
        p_post_id: String(postId),
        p_keyword: keyword.trim(),
        p_dm_message: dmMessage.trim(),
        p_is_active: isActive,
      });

      if (!error && data) {
        return { data, error: null };
      }
    } catch (_) {}

    // Fallback to table update/insert
    const {
      data: { user },
    } = await client.auth.getUser();

    if (automationId) {
      const { data, error } = await client
        .from("instagram_automations")
        .update({
          keyword: keyword.trim(),
          dm_message: dmMessage.trim(),
          is_active: isActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", automationId)
        .select()
        .single();

      return { data, error };
    } else {
      const { data, error } = await client
        .from("instagram_automations")
        .insert({
          user_id: user?.id,
          instagram_account_id: accountId,
          instagram_post_id: String(postId),
          keyword: keyword.trim(),
          dm_message: dmMessage.trim(),
          is_active: isActive,
        })
        .select()
        .single();

      return { data, error };
    }
  },

  /**
   * Fetch recent webhook events / auto DM logs
   */
  async getRecentWebhookEvents(supabase, accountId) {
    const client = supabase || createClient();
    const { data, error } = await client
      .from("instagram_webhook_events")
      .select("*")
      .eq("instagram_account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(10);

    return { data: data || [], error };
  },
};
