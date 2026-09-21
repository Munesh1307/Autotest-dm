"use client";

import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { toast } from "react-toastify";

function Page() {
  const supabase = createClient();
  const oauthProcessedRef = useRef(false);

  const [connected, setConnected] = useState(false);
  const [accountData, setAccountData] = useState(null);
  const [enabled, setEnabled] = useState(true);
  const [selectedPost, setSelectedPost] = useState(0);
  const [selectedComment, setSelectedComment] = useState(0);
  const [keyword, setKeyword] = useState("price, buy, info");
  const [dmMessage, setDmMessage] = useState(
    "Hey! 👋 Thanks for commenting on our post. We'd love to help you. Check your DM for more details.",
  );
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentAutomationId, setCurrentAutomationId] = useState(null);
  const [recentEvents, setRecentEvents] = useState([]);

  const posts = [
    {
      id: 1,
      type: "image",
      image:
        "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900",
      caption: "Our latest product is here 🚀",
      comments: 12,
    },
    {
      id: 2,
      type: "video",
      image:
        "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=900",
      caption: "Behind the scenes 🎥",
      comments: 8,
    },
    {
      id: 3,
      type: "image",
      image:
        "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=900",
      caption: "New collection available now ✨",
      comments: 24,
    },
  ];

  const comments = [
    {
      id: 1,
      username: "john_doe",
      avatar: "https://i.pravatar.cc/100?img=12",
      comment: "How much does this cost?",
      time: "2 min ago",
    },
    {
      id: 2,
      username: "sarah_w",
      avatar: "https://i.pravatar.cc/100?img=32",
      comment: "I want this! 🔥",
      time: "10 min ago",
    },
    {
      id: 3,
      username: "mike_ross",
      avatar: "https://i.pravatar.cc/100?img=45",
      comment: "Where can I buy this?",
      time: "18 min ago",
    },
    {
      id: 4,
      username: "anna_s",
      avatar: "https://i.pravatar.cc/100?img=47",
      comment: "Looks amazing ❤️",
      time: "25 min ago",
    },
  ];

  const currentPost = posts[selectedPost];
  const currentComment = comments[selectedComment];

  // Fetch connected account and check for Meta OAuth return callback
  useEffect(() => {
    fetchConnectedAccount();
    handleOAuthCallback();
  }, []);

  // Fetch automation for current post whenever selectedPost or accountData changes
  useEffect(() => {
    if (accountData?.id) {
      fetchAutomationForPost(posts[selectedPost]?.id, accountData.id);
      fetchRecentEvents(accountData.id);
    }
  }, [selectedPost, accountData]);

  const handleOAuthCallback = async () => {
    if (typeof window === "undefined") return;

    // Check one-time ref guard synchronously before any async work
    if (oauthProcessedRef.current) return;

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    if (!code) return;

    // Lock synchronously before starting token exchange
    oauthProcessedRef.current = true;

    // Clean OAuth code from browser URL immediately
    window.history.replaceState({}, document.title, window.location.pathname);

    // Strip trailing #_ fragment if present
    const cleanCode = code.replace(/#_$/, "").trim();

    // Prevent duplicate token exchange in React StrictMode across remounts
    const sessionLockKey = `ig_code_lock_${cleanCode.substring(0, 16)}`;
    if (sessionStorage.getItem(sessionLockKey)) {
      console.log("[dashboard] OAuth code already submitted, skipping duplicate call.");
      return;
    }
    sessionStorage.setItem(sessionLockKey, "processing");

    // Use exact redirect_uri stored at initiation or current dashboard URL
    const redirectUri =
      sessionStorage.getItem("instagram_oauth_redirect_uri") ||
      (window.location.origin + window.location.pathname);

    try {
      const msgUint8 = new TextEncoder().encode(cleanCode);
      const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const codeFingerprint = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .substring(0, 12);
      console.log(
        "[dashboard] OAuth callback captured code fingerprint:",
        codeFingerprint,
        "redirect_uri:",
        redirectUri,
      );
    } catch (_) {}

    setConnecting(true);
    toast.info("Connecting your Instagram account with Meta...");

    try {
      const { data, error } = await supabase.functions.invoke(
        "instagram-auth",
        {
          body: {
            code: cleanCode,
            redirect_uri: redirectUri,
          },
        },
      );

      if (error) {
        let msg = error.message;
        if (error.context) {
          try {
            const errBody = await error.context.json();
            msg = errBody.error || errBody.message || msg;
          } catch (_) {}
        }
        toast.error(msg || "Failed to connect Instagram account.");
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      if (data?.account) {
        setConnected(true);
        setAccountData(data.account);
        toast.success(
          `Instagram account @${data.account.instagram_username} connected successfully!`,
        );
        fetchRecentEvents(data.account.id);
      }
    } catch (err) {
      console.error("OAuth callback exchange error:", err);
      toast.error("Error completing Instagram authentication.");
    } finally {
      setConnecting(false);
    }
  };

  const handleConnectClick = async () => {
    if (connected && accountData?.id) {
      // Allow disconnect
      if (
        window.confirm(
          "Are you sure you want to disconnect your Instagram account?",
        )
      ) {
        const { error } = await supabase
          .from("instagram_accounts")
          .delete()
          .eq("id", accountData.id);

        if (!error) {
          setConnected(false);
          setAccountData(null);
          setCurrentAutomationId(null);
          setRecentEvents([]);
          toast.success("Instagram account disconnected.");
        } else {
          toast.error("Failed to disconnect: " + error.message);
        }
      }
      return;
    }

    setConnecting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Please log in to connect Instagram.");
        setConnecting(false);
        return;
      }

      const redirectUri = window.location.origin + window.location.pathname;
      sessionStorage.setItem("instagram_oauth_redirect_uri", redirectUri);

      const { data, error } = await supabase.functions.invoke(
        "instagram-auth",
        {
          body: {
            action: "get_auth_url",
            redirect_uri: redirectUri,
          },
        },
      );

      if (error) {
        let msg = error.message;
        if (error.context) {
          try {
            const errBody = await error.context.json();
            msg = errBody.error || errBody.message || msg;
          } catch (_) {}
        }

        if (msg.includes("not found") || error.status === 404) {
          toast.error(
            "The 'instagram-auth' Edge Function is not deployed in Supabase yet. Please deploy it first.",
          );
        } else {
          toast.error(msg);
        }
        return;
      }

      if (data?.auth_url) {
        window.location.href = data.auth_url;
      } else if (data?.error) {
        toast.error(data.error);
      } else {
        toast.error("Could not retrieve Instagram authorization URL.");
      }
    } catch (err) {
      console.error("Initiate connect error:", err);
      toast.error("Failed to initiate Instagram connection.");
    } finally {
      setConnecting(false);
    }
  };

  const fetchConnectedAccount = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: account, error } = await supabase
        .from("instagram_accounts")
        .select("id, instagram_user_id, instagram_username, status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching connected account:", error);
      } else if (account) {
        setConnected(true);
        setAccountData(account);
        fetchRecentEvents(account.id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentEvents = async (accountId) => {
    try {
      const { data, error } = await supabase
        .from("instagram_webhook_events")
        .select("*")
        .eq("instagram_account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (!error && data) {
        setRecentEvents(data);
      }
    } catch (err) {
      console.error("Error fetching recent events:", err);
    }
  };

  const fetchAutomationForPost = async (postId, accountId) => {
    try {
      const { data: automation, error } = await supabase
        .from("instagram_automations")
        .select("*")
        .eq("instagram_account_id", accountId)
        .eq("instagram_post_id", String(postId))
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching automation:", error);
      } else if (automation) {
        setCurrentAutomationId(automation.id);
        setKeyword(automation.keyword);
        setDmMessage(automation.dm_message);
        setEnabled(automation.is_active);
      } else {
        setCurrentAutomationId(null);
        setKeyword("price, buy, info");
        setDmMessage(
          "Hey! 👋 Thanks for commenting on our post. We'd love to help you. Check your DM for more details.",
        );
        setEnabled(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleActive = async () => {
    const nextState = !enabled;
    setEnabled(nextState);

    if (currentAutomationId) {
      try {
        const { error } = await supabase
          .from("instagram_automations")
          .update({ is_active: nextState })
          .eq("id", currentAutomationId);

        if (error) {
          toast.error("Failed to update status: " + error.message);
          setEnabled(!nextState);
        } else {
          toast.success(nextState ? "Auto DM enabled" : "Auto DM disabled");
        }
      } catch (err) {
        console.error(err);
        setEnabled(!nextState);
      }
    }
  };

  const handleSaveAutomation = async () => {
    if (!keyword.trim()) {
      toast.error("Please enter a comment keyword.");
      return;
    }

    if (!dmMessage.trim()) {
      toast.error("Please enter an automatic DM message.");
      return;
    }

    if (!accountData?.id) {
      toast.error("Please connect your Instagram account first.");
      return;
    }

    setSaving(true);
    try {
      // Execute server-side validated RPC
      const { data, error } = await supabase.rpc("save_instagram_automation", {
        p_account_id: accountData.id,
        p_post_id: String(currentPost.id),
        p_keyword: keyword.trim(),
        p_dm_message: dmMessage.trim(),
        p_is_active: enabled,
      });

      if (error) {
        toast.error(error.message || "Failed to save automation.");
        return;
      }

      if (data?.id) {
        setCurrentAutomationId(data.id);
      }
      toast.success("Auto DM automation saved successfully!");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      {" "}
      <div className="mx-auto max-w-6xl">
        {/* Header */}{" "}
        <div className="mb-6">
          {" "}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {" "}
            <div>
              {" "}
              <h1 className="text-2xl font-semibold text-gray-900">
                Instagram Auto DM{" "}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Automatically send Instagram DMs when users comment on your
                posts.
              </p>
            </div>
            {/* Instagram Connection */}
            <button
              onClick={handleConnectClick}
              disabled={connecting}
              className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                connected
                  ? "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  : "bg-black text-white hover:bg-gray-800"
              } ${connecting ? "cursor-not-allowed opacity-70" : ""}`}
            >
              {connecting
                ? "Connecting..."
                : connected
                  ? "✓ Instagram Connected"
                  : "Connect Instagram"}
            </button>
          </div>
        </div>
        {/* Connection Notice */}
        {!connected && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl">
                ◎
              </div>

              <div className="flex-1">
                <h2 className="font-medium text-gray-900">
                  Connect your Instagram account
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Connect Instagram to fetch your posts, videos and comments and
                  automatically send DMs to users.
                </p>
              </div>

              <button
                onClick={handleConnectClick}
                disabled={connecting}
                className={`rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 ${
                  connecting ? "cursor-not-allowed opacity-70" : ""
                }`}
              >
                {connecting ? "Connecting..." : "Connect"}
              </button>
            </div>
          </div>
        )}
        {connected && (
          <>
            {/* Account */}
            <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 font-semibold">
                    {accountData?.instagram_username
                      ? accountData.instagram_username.charAt(0).toUpperCase()
                      : "V"}
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      @{accountData?.instagram_username || "your_instagram"}
                    </p>

                    <p className="text-xs text-gray-500">
                      Instagram Business Account
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-600">
                    Connected
                  </span>
                  <button
                    onClick={handleConnectClick}
                    className="text-xs text-gray-400 hover:text-red-600 underline"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            </div>

            {/* Main Grid */}
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              {/* LEFT */}
              <div className="space-y-6">
                {/* Posts */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="mb-4">
                    <h2 className="font-medium text-gray-900">
                      Select Instagram Post
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      Choose the post or video where comments should trigger an
                      automatic DM.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {posts.map((post, index) => (
                      <button
                        key={post.id}
                        onClick={() => setSelectedPost(index)}
                        className={`group relative overflow-hidden rounded-lg border-2 ${
                          selectedPost === index
                            ? "border-black"
                            : "border-transparent"
                        }`}
                      >
                        <img
                          src={post.image}
                          alt="Instagram post"
                          className="aspect-square w-full object-cover transition group-hover:scale-105"
                        />

                        {post.type === "video" && (
                          <div className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-xs text-white">
                            ▶
                          </div>
                        )}

                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-left text-xs text-white">
                          {post.comments} comments
                        </div>

                        {selectedPost === index && (
                          <div className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-black text-xs text-white">
                            ✓
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selected Post */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="mb-4 font-medium text-gray-900">
                    Selected Post
                  </h2>

                  <div className="overflow-hidden rounded-xl border border-gray-200">
                    <img
                      src={currentPost.image}
                      alt="Selected Instagram post"
                      className="aspect-video w-full object-cover"
                    />

                    <div className="p-4">
                      <p className="text-sm font-medium text-gray-900">
                        {currentPost.caption}
                      </p>

                      <p className="mt-2 text-xs text-gray-500">
                        {currentPost.type === "video" ? "Video" : "Photo"} ·{" "}
                        {currentPost.comments} comments
                      </p>
                    </div>
                  </div>
                </div>

                {/* Comments */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="mb-4">
                    <h2 className="font-medium text-gray-900">Post Comments</h2>

                    <p className="mt-1 text-sm text-gray-500">
                      Select a comment trigger for the automatic DM.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {comments.map((comment, index) => (
                      <button
                        key={comment.id}
                        onClick={() => setSelectedComment(index)}
                        className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition ${
                          selectedComment === index
                            ? "border-black bg-gray-50"
                            : "border-gray-100 hover:border-gray-300"
                        }`}
                      >
                        <img
                          src={comment.avatar}
                          alt={comment.username}
                          className="h-9 w-9 rounded-full object-cover"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-gray-900">
                              @{comment.username}
                            </p>

                            <span className="text-xs text-gray-400">
                              {comment.time}
                            </span>
                          </div>

                          <p className="mt-1 text-sm text-gray-600">
                            {comment.comment}
                          </p>
                        </div>

                        <div
                          className={`mt-1 h-4 w-4 shrink-0 rounded-full border ${
                            selectedComment === index
                              ? "border-black bg-black"
                              : "border-gray-300"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT */}
              <div className="space-y-6">
                {/* Automation */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-5">
                    <div>
                      <h2 className="font-medium text-gray-900">
                        Auto DM Status
                      </h2>

                      <p className="mt-1 text-sm text-gray-500">
                        Turn automatic messages on or off.
                      </p>
                    </div>

                    <button
                      onClick={handleToggleActive}
                      aria-label="Toggle Auto DM"
                      className={`relative h-6 w-11 rounded-full transition ${
                        enabled ? "bg-black" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${
                          enabled ? "left-6" : "left-1"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Trigger Type */}
                  <div className="mt-5">
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Trigger
                    </label>

                    <select className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-black">
                      <option>When someone comments</option>
                      <option>When someone sends a message</option>
                      <option>When someone follows me</option>
                    </select>
                  </div>

                  {/* Keyword */}
                  <div className="mt-5">
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Comment Keyword
                    </label>

                    <input
                      type="text"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="e.g. price, buy, info"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
                    />

                    <p className="mt-1 text-xs text-gray-400">
                      DM can be triggered when a comment contains this keyword.
                    </p>
                  </div>

                  {/* Selected Comment */}
                  <div className="mt-5 rounded-lg bg-gray-50 p-3">
                    <p className="text-xs font-medium text-gray-500">
                      Example comment
                    </p>

                    <p className="mt-1 text-sm text-gray-800">
                      @{currentComment.username}: "{currentComment.comment}"
                    </p>
                  </div>

                  {/* Message */}
                  <div className="mt-5">
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Automatic DM
                    </label>

                    <textarea
                      rows={6}
                      value={dmMessage}
                      onChange={(e) => setDmMessage(e.target.value)}
                      placeholder="Write the message that should be sent..."
                      className="w-full resize-none rounded-lg border border-gray-300 px-3 py-3 text-sm outline-none focus:border-black"
                    />

                    <p className="mt-1 text-xs text-gray-400">
                      This message will be sent to the Instagram user who
                      comments.
                    </p>
                  </div>

                  {/* Save */}
                  <button
                    onClick={handleSaveAutomation}
                    disabled={saving}
                    className={`mt-6 w-full rounded-lg bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-gray-800 ${
                      saving ? "cursor-not-allowed opacity-70" : ""
                    }`}
                  >
                    {saving ? "Saving Auto DM..." : "Save Auto DM"}
                  </button>
                </div>

                {/* Automation Preview */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="font-medium text-gray-900">
                    Automation Preview
                  </h2>

                  <div className="mt-4 space-y-3">
                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xs text-gray-400">WHEN</p>
                      <p className="mt-1 text-sm font-medium text-gray-800">
                        Someone comments on this post
                      </p>
                    </div>

                    <div className="flex justify-center text-gray-400">↓</div>

                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xs text-gray-400">
                        IF COMMENT CONTAINS
                      </p>
                      <p className="mt-1 text-sm font-medium text-gray-800">
                        "{keyword}"
                      </p>
                    </div>

                    <div className="flex justify-center text-gray-400">↓</div>

                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xs text-gray-400">THEN</p>
                      <p className="mt-1 text-sm font-medium text-gray-800">
                        Send an Instagram DM
                      </p>
                    </div>
                  </div>
                </div>

                {/* Recent */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h2 className="font-medium text-gray-900">
                      Recent Auto DMs
                    </h2>

                    <span className="text-xs text-gray-400">Today</span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {recentEvents && recentEvents.length > 0 ? (
                      recentEvents.map((evt) => {
                        const commenterUsername =
                          evt.payload?.commenter?.username || "instagram_user";
                        const commentText =
                          evt.payload?.comment_text ||
                          evt.payload?.text ||
                          "Comment received";
                        const resultStatus =
                          evt.payload?.processing_result?.status ||
                          (evt.processed ? "Sent" : "Pending");
                        const isSent =
                          resultStatus === "sent" || resultStatus === "Sent";

                        return (
                          <div
                            key={evt.id}
                            className="rounded-lg border border-gray-100 p-3"
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-gray-900">
                                @{commenterUsername}
                              </p>

                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                  isSent
                                    ? "bg-green-50 text-green-600"
                                    : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {isSent ? "Sent" : resultStatus}
                              </span>
                            </div>

                            <p className="mt-1 text-xs text-gray-500">
                              Triggered by: "{commentText}"
                            </p>
                          </div>
                        );
                      })
                    ) : (
                      <>
                        <div className="rounded-lg border border-gray-100 p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-900">
                              @john_doe
                            </p>

                            <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-600">
                              Sent
                            </span>
                          </div>

                          <p className="mt-1 text-xs text-gray-500">
                            Triggered by: "How much does this cost?"
                          </p>
                        </div>

                        <div className="rounded-lg border border-gray-100 p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-900">
                              @sarah_w
                            </p>

                            <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-600">
                              Sent
                            </span>
                          </div>

                          <p className="mt-1 text-xs text-gray-500">
                            Triggered by: "I want this! 🔥"
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Page;
