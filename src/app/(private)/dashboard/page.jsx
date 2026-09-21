"use client";

import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { instagramService } from "@/services/instagram.service";
import { toast } from "react-toastify";

function Page() {
  const supabase = createClient();
  const oauthProcessedRef = useRef(false);

  // Account State
  const [connected, setConnected] = useState(false);
  const [accountData, setAccountData] = useState(null);
  const [connecting, setConnecting] = useState(false);

  // Real Instagram Posts State
  const [posts, setPosts] = useState([]);
  const [selectedPost, setSelectedPost] = useState(0);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [postsError, setPostsError] = useState(null);
  const [postsPaging, setPostsPaging] = useState(null);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);

  // Real Instagram Comments State
  const [comments, setComments] = useState([]);
  const [selectedComment, setSelectedComment] = useState(0);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentsError, setCommentsError] = useState(null);

  // Comment Management Actions
  const [replyingCommentId, setReplyingCommentId] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Automation Configuration State
  const [enabled, setEnabled] = useState(true);
  const [triggerType, setTriggerType] = useState("post"); // "post" | "all_posts"
  const [keyword, setKeyword] = useState("price, buy, info");
  const [dmMessage, setDmMessage] = useState(
    "Hey! 👋 Thanks for commenting on our post. We'd love to help you. Check your DM for more details."
  );
  const [saving, setSaving] = useState(false);
  const [currentAutomationId, setCurrentAutomationId] = useState(null);
  const [recentEvents, setRecentEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Active Post & Comment
  const currentPost = posts && posts.length > 0 ? posts[selectedPost] || posts[0] : null;
  const currentComment = comments && comments.length > 0 ? comments[selectedComment] || comments[0] : null;

  // Initial mount: fetch connected account and handle OAuth callback
  useEffect(() => {
    fetchConnectedAccount();
    handleOAuthCallback();
  }, []);

  // Whenever account connects or changes, fetch posts & recent events, and set up live polling
  useEffect(() => {
    if (connected && accountData?.id) {
      fetchPosts();
      fetchRecentEvents(accountData.id);

      // Auto-poll recent Auto DM logs every 10 seconds
      const interval = setInterval(() => {
        fetchRecentEvents(accountData.id, true);
      }, 10000);

      return () => clearInterval(interval);
    }
  }, [connected, accountData?.id]);

  // Whenever selectedPost or triggerType changes, fetch comments & automation
  useEffect(() => {
    if (accountData?.id) {
      const targetPostId = triggerType === "all_posts" ? "all_posts" : currentPost?.id;
      if (targetPostId) {
        fetchAutomationForPost(targetPostId, accountData.id);
      }
      if (currentPost?.id) {
        fetchCommentsForPost(currentPost.id);
      } else {
        setComments([]);
      }
    }
  }, [currentPost?.id, accountData?.id, triggerType]);

  // ============================================================================
  // OAuth & Account Connection
  // ============================================================================

  const handleOAuthCallback = async () => {
    if (typeof window === "undefined") return;

    if (oauthProcessedRef.current) return;

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    if (!code) return;

    oauthProcessedRef.current = true;
    window.history.replaceState({}, document.title, window.location.pathname);

    const cleanCode = code.replace(/#_$/, "").trim();

    const sessionLockKey = `ig_code_lock_${cleanCode.substring(0, 16)}`;
    if (sessionStorage.getItem(sessionLockKey)) {
      console.log("[dashboard] OAuth code already submitted, skipping duplicate call.");
      return;
    }
    sessionStorage.setItem(sessionLockKey, "processing");

    const redirectUri =
      sessionStorage.getItem("instagram_oauth_redirect_uri") ||
      (window.location.origin + window.location.pathname);

    setConnecting(true);
    toast.info("Connecting your Instagram account with Meta...");

    try {
      const { data, error } = await instagramService.exchangeCode(supabase, cleanCode, redirectUri);

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
        toast.success(`Instagram account @${data.account.instagram_username} connected successfully!`);
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
      if (window.confirm("Are you sure you want to disconnect your Instagram account?")) {
        const { error } = await instagramService.disconnectAccount(supabase, accountData.id);

        if (!error) {
          setConnected(false);
          setAccountData(null);
          setPosts([]);
          setComments([]);
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

      const { data, error } = await instagramService.getAuthUrl(supabase, redirectUri);

      if (error) {
        let msg = error.message;
        if (error.context) {
          try {
            const errBody = await error.context.json();
            msg = errBody.error || errBody.message || msg;
          } catch (_) {}
        }
        toast.error(msg || "Could not retrieve Instagram authorization URL.");
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
    try {
      const { account, error } = await instagramService.getConnectedAccount(supabase);

      if (error) {
        console.error("Error fetching connected account:", error);
      } else if (account) {
        setConnected(true);
        setAccountData(account);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ============================================================================
  // Real Instagram Data Fetching (Posts & Comments)
  // ============================================================================

  const fetchPosts = async (after = null) => {
    if (after) {
      setLoadingMorePosts(true);
    } else {
      setLoadingPosts(true);
      setPostsError(null);
    }

    try {
      const { posts: fetchedPosts, paging, error, expired } = await instagramService.getPosts(supabase, {
        limit: 12,
        after,
      });

      if (expired) {
        setConnected(false);
        setPosts([]);
        setPostsError("Instagram session expired. Please reconnect your account.");
        toast.error("Instagram token expired. Please reconnect.");
        return;
      }

      if (error) {
        setPostsError(error);
        return;
      }

      if (after) {
        setPosts((prev) => [...prev, ...(fetchedPosts || [])]);
      } else {
        setPosts(fetchedPosts || []);
        setSelectedPost(0);
      }
      setPostsPaging(paging);
    } catch (err) {
      console.error("Error fetching posts:", err);
      setPostsError("Failed to fetch Instagram posts.");
    } finally {
      setLoadingPosts(false);
      setLoadingMorePosts(false);
    }
  };

  const fetchCommentsForPost = async (postId) => {
    if (!postId) return;

    setLoadingComments(true);
    setCommentsError(null);
    setReplyingCommentId(null);
    setReplyText("");

    try {
      const { comments: fetchedComments, error, expired } = await instagramService.getComments(supabase, postId, {
        limit: 50,
      });

      if (expired) {
        setConnected(false);
        toast.error("Instagram session expired. Please reconnect.");
        return;
      }

      if (error) {
        setCommentsError(error);
        setComments([]);
      } else {
        setComments(fetchedComments || []);
        setSelectedComment(0);
      }
    } catch (err) {
      console.error("Error fetching comments:", err);
      setCommentsError("Failed to fetch comments for this post.");
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  };

  const fetchRecentEvents = async (accountId, silent = false) => {
    if (!silent) setLoadingEvents(true);
    try {
      const { data, error } = await instagramService.getRecentWebhookEvents(supabase, accountId);
      if (!error && data) {
        setRecentEvents(data);
      }
    } catch (err) {
      console.error("Error fetching recent events:", err);
    } finally {
      if (!silent) setLoadingEvents(false);
    }
  };

  const fetchAutomationForPost = async (postId, accountId) => {
    try {
      const { data: automation, error } = await instagramService.getPostAutomation(supabase, accountId, postId);

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
          "Hey! 👋 Thanks for commenting on our post. We'd love to help you. Check your DM for more details."
        );
        setEnabled(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ============================================================================
  // Comment Actions (Reply, Delete, Hide, Refresh)
  // ============================================================================

  const handleReplySubmit = async (commentId) => {
    if (!replyText.trim()) {
      toast.error("Please enter a reply message.");
      return;
    }

    setSubmittingReply(true);
    try {
      const { success, error } = await instagramService.replyToComment(supabase, commentId, replyText);

      if (error || !success) {
        toast.error(error || "Failed to post reply.");
      } else {
        toast.success("Reply posted successfully to Instagram!");
        setReplyText("");
        setReplyingCommentId(null);
        if (currentPost?.id) {
          fetchCommentsForPost(currentPost.id);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while posting the reply.");
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm("Are you sure you want to delete this comment from Instagram?")) return;

    setActionLoadingId(commentId);
    try {
      const { success, error } = await instagramService.deleteComment(supabase, commentId);

      if (error || !success) {
        toast.error(error || "Failed to delete comment.");
      } else {
        toast.success("Comment deleted from Instagram.");
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while deleting the comment.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleHideComment = async (commentId, shouldHide = true) => {
    setActionLoadingId(commentId);
    try {
      const { success, hidden, error } = await instagramService.hideComment(supabase, commentId, shouldHide);

      if (error || !success) {
        toast.error(error || "Failed to update comment visibility.");
      } else {
        toast.success(hidden ? "Comment hidden on Instagram." : "Comment unhidden on Instagram.");
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while updating comment visibility.");
    } finally {
      setActionLoadingId(null);
    }
  };

  // ============================================================================
  // Automation Status & Save
  // ============================================================================

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

    const targetPostId = triggerType === "all_posts" ? "all_posts" : currentPost?.id;

    if (!targetPostId) {
      toast.error("Please select an Instagram post first.");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await instagramService.saveAutomation(supabase, {
        accountId: accountData.id,
        postId: targetPostId,
        keyword: keyword.trim(),
        dmMessage: dmMessage.trim(),
        isActive: enabled,
        automationId: currentAutomationId,
      });

      if (error) {
        toast.error(error.message || "Failed to save automation.");
        return;
      }

      if (data?.id) {
        setCurrentAutomationId(data.id);
      }
      toast.success(
        triggerType === "all_posts"
          ? "Global Auto DM for ALL posts saved successfully!"
          : "Auto DM for selected post saved successfully!"
      );
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  };

  // ============================================================================
  // Formatting Helpers
  // ============================================================================

  const getMediaImageUrl = (post) => {
    if (!post) return "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900";
    if (post.media_type === "VIDEO") {
      return post.thumbnail_url || post.media_url || "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=900";
    }
    return post.media_url || post.thumbnail_url || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900";
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "";
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMin < 1) return "Just now";
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch (_) {
      return "";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                Instagram Auto DM
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Automatically send Instagram DMs when users comment on your posts.
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
                  Connect Instagram to fetch your real posts, videos, and comments and automatically send DMs to commenters matching your keywords.
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
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 font-semibold text-gray-800">
                    {accountData?.instagram_username
                      ? accountData.instagram_username.charAt(0).toUpperCase()
                      : "I"}
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      @{accountData?.instagram_username || "your_instagram"}
                    </p>

                    <p className="text-xs text-gray-500">
                      Instagram Professional Account
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
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="font-medium text-gray-900">
                        Select Instagram Post
                      </h2>
                      <p className="mt-1 text-sm text-gray-500">
                        Choose the post or video where comments should trigger an automatic DM.
                      </p>
                    </div>

                    <button
                      onClick={() => fetchPosts()}
                      disabled={loadingPosts}
                      className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      title="Refresh Posts"
                    >
                      {loadingPosts ? "Refreshing..." : "↻ Refresh"}
                    </button>
                  </div>

                  {/* Loading Posts State */}
                  {loadingPosts && (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-black border-t-transparent mb-2"></div>
                      <p className="text-sm text-gray-500">Loading Instagram posts...</p>
                    </div>
                  )}

                  {/* Error State */}
                  {!loadingPosts && postsError && (
                    <div className="rounded-lg bg-red-50 p-4 text-center text-sm text-red-600">
                      <p>{postsError}</p>
                      <button
                        onClick={() => fetchPosts()}
                        className="mt-2 text-xs font-medium underline hover:text-red-800"
                      >
                        Try again
                      </button>
                    </div>
                  )}

                  {/* Empty State */}
                  {!loadingPosts && !postsError && posts.length === 0 && (
                    <div className="rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-500">
                      <p className="font-medium text-gray-700">No Instagram posts found.</p>
                      <p className="mt-1 text-xs text-gray-400">
                        Publish a post or Reel on your Instagram account to configure Auto DMs.
                      </p>
                    </div>
                  )}

                  {/* Posts Grid */}
                  {!loadingPosts && !postsError && posts.length > 0 && (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        {posts.map((post, index) => {
                          const imageUrl = getMediaImageUrl(post);
                          const isVideo = post.media_type === "VIDEO";
                          const isCarousel = post.media_type === "CAROUSEL_ALBUM";
                          const commentCount = post.comments_count ?? 0;

                          return (
                            <button
                              key={post.id}
                              onClick={() => setSelectedPost(index)}
                              className={`group relative overflow-hidden rounded-lg border-2 text-left ${
                                selectedPost === index
                                    ? "border-black"
                                  : "border-transparent hover:border-gray-300"
                              }`}
                            >
                              <img
                                src={imageUrl}
                                alt={post.caption || "Instagram post"}
                                className="aspect-square w-full object-cover transition group-hover:scale-105"
                                onError={(e) => {
                                  e.currentTarget.src =
                                    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900";
                                }}
                              />

                              {isVideo && (
                                <div className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white">
                                  ▶ Video
                                </div>
                              )}

                              {isCarousel && (
                                <div className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white">
                                  ❐ Album
                                </div>
                              )}

                              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-left text-xs text-white">
                                {commentCount} comments
                              </div>

                              {selectedPost === index && (
                                <div className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-black text-xs text-white">
                                  ✓
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Pagination: Load More */}
                      {postsPaging?.cursors?.after && (
                        <div className="mt-4 text-center">
                          <button
                            onClick={() => fetchPosts(postsPaging.cursors.after)}
                            disabled={loadingMorePosts}
                            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            {loadingMorePosts ? "Loading more..." : "Load More Posts"}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Selected Post Preview */}
                {currentPost && (
                  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="font-medium text-gray-900">
                        Selected Post
                      </h2>
                      {currentPost.permalink && (
                        <a
                          href={currentPost.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gray-500 hover:text-black underline"
                        >
                          View on Instagram ↗
                        </a>
                      )}
                    </div>

                    <div className="overflow-hidden rounded-xl border border-gray-200">
                      <img
                        src={getMediaImageUrl(currentPost)}
                        alt={currentPost.caption || "Selected Instagram post"}
                        className="aspect-video w-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src =
                            "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900";
                        }}
                      />

                      <div className="p-4">
                        <p className="text-sm font-medium text-gray-900 line-clamp-3">
                          {currentPost.caption || "No caption for this post."}
                        </p>

                        <p className="mt-2 text-xs text-gray-500">
                          {currentPost.media_type === "VIDEO"
                            ? "Video"
                            : currentPost.media_type === "CAROUSEL_ALBUM"
                              ? "Carousel Album"
                              : "Photo"}{" "}
                          · {currentPost.comments_count ?? comments.length} comments
                          {currentPost.like_count !== undefined && ` · ${currentPost.like_count} likes`}
                          {currentPost.timestamp && ` · ${formatTimestamp(currentPost.timestamp)}`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Comments Section */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="font-medium text-gray-900">
                        Post Comments {comments.length > 0 && `(${comments.length})`}
                      </h2>
                      <p className="mt-1 text-sm text-gray-500">
                        Real-time comments from Instagram users on this post.
                      </p>
                    </div>

                    {currentPost?.id && (
                      <button
                        onClick={() => fetchCommentsForPost(currentPost.id)}
                        disabled={loadingComments}
                        className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        title="Refresh Comments"
                      >
                        {loadingComments ? "Refreshing..." : "↻ Refresh Comments"}
                      </button>
                    )}
                  </div>

                  {/* Loading Comments */}
                  {loadingComments && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent mb-2"></div>
                      <p className="text-xs text-gray-500">Loading comments from Instagram...</p>
                    </div>
                  )}

                  {/* Comments Error */}
                  {!loadingComments && commentsError && (
                    <div className="rounded-lg bg-red-50 p-4 text-center text-xs text-red-600">
                      <p>{commentsError}</p>
                      <button
                        onClick={() => currentPost?.id && fetchCommentsForPost(currentPost.id)}
                        className="mt-1 underline hover:text-red-800"
                      >
                        Try again
                      </button>
                    </div>
                  )}

                  {/* No Comments State */}
                  {!loadingComments && !commentsError && comments.length === 0 && (
                    <div className="rounded-lg bg-gray-50 p-6 text-center text-xs text-gray-500">
                      <p className="font-medium text-gray-700">No comments yet on this post.</p>
                      <p className="mt-1 text-gray-400">
                        When users comment on this Instagram post or reel, their username and comment will appear here.
                      </p>
                    </div>
                  )}

                  {/* Comments List */}
                  {!loadingComments && !commentsError && comments.length > 0 && (
                    <div className="space-y-3">
                      {comments.map((comment, index) => {
                        const commenterUsername = comment.username || "instagram_user";
                        const initial = commenterUsername.charAt(0).toUpperCase() || "U";
                        const isReplying = replyingCommentId === comment.id;

                        return (
                          <div
                            key={comment.id}
                            className={`rounded-lg border p-3 transition ${
                              selectedComment === index
                                ? "border-black bg-gray-50/70"
                                : "border-gray-100 hover:border-gray-300"
                            }`}
                          >
                            <div
                              onClick={() => setSelectedComment(index)}
                              className="flex cursor-pointer items-start gap-3 text-left"
                            >
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-700">
                                {initial}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-medium text-gray-900">
                                    @{commenterUsername}
                                  </p>

                                  <span className="text-xs text-gray-400">
                                    {formatTimestamp(comment.timestamp)}
                                  </span>
                                </div>

                                <p className="mt-1 text-sm text-gray-600">
                                  {comment.text}
                                </p>
                              </div>

                              <div
                                className={`mt-1 h-4 w-4 shrink-0 rounded-full border ${
                                  selectedComment === index
                                    ? "border-black bg-black"
                                    : "border-gray-300"
                                }`}
                              />
                            </div>

                            {/* Comment Actions Toolbar */}
                            <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-xs">
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => {
                                    if (isReplying) {
                                      setReplyingCommentId(null);
                                    } else {
                                      setReplyingCommentId(comment.id);
                                      setReplyText(`@${commenterUsername} `);
                                    }
                                  }}
                                  className="font-medium text-gray-700 hover:text-black"
                                >
                                  {isReplying ? "Cancel" : "Reply"}
                                </button>

                                <button
                                  onClick={() => handleHideComment(comment.id, true)}
                                  disabled={actionLoadingId === comment.id}
                                  className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                                >
                                  Hide
                                </button>

                                <button
                                  onClick={() => handleDeleteComment(comment.id)}
                                  disabled={actionLoadingId === comment.id}
                                  className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                                >
                                  Delete
                                </button>
                              </div>

                              {comment.like_count !== undefined && comment.like_count > 0 && (
                                <span className="text-gray-400">
                                  ♥ {comment.like_count}
                                </span>
                              )}
                            </div>

                            {/* Inline Reply Input */}
                            {isReplying && (
                              <div className="mt-3 flex gap-2">
                                <input
                                  type="text"
                                  value={replyText}
                                  onChange={(e) => setReplyText(e.target.value)}
                                  placeholder="Write a public reply..."
                                  className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs outline-none focus:border-black"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                      e.preventDefault();
                                      handleReplySubmit(comment.id);
                                    }
                                  }}
                                />
                                <button
                                  onClick={() => handleReplySubmit(comment.id)}
                                  disabled={submittingReply || !replyText.trim()}
                                  className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                                >
                                  {submittingReply ? "Posting..." : "Post Reply"}
                                </button>
                              </div>
                            )}

                            {/* Sub-Replies Display */}
                            {comment.replies?.data && comment.replies.data.length > 0 && (
                              <div className="mt-2 space-y-1.5 pl-6 border-l-2 border-gray-100">
                                {comment.replies.data.map((rep) => (
                                  <div key={rep.id} className="text-xs text-gray-600">
                                    <span className="font-semibold text-gray-800">
                                      @{rep.username}:{" "}
                                    </span>
                                    <span>{rep.text}</span>
                                    <span className="ml-2 text-[10px] text-gray-400">
                                      {formatTimestamp(rep.timestamp)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
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
                      Trigger Scope
                    </label>

                    <select
                      value={triggerType}
                      onChange={(e) => setTriggerType(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-black"
                    >
                      <option value="post">
                        When someone comments on this selected post
                      </option>
                      <option value="all_posts">
                        When someone comments on ANY post on my account (All Posts)
                      </option>
                    </select>

                    <p className="mt-1 text-xs text-gray-400">
                      {triggerType === "all_posts"
                        ? "🌍 Global rule: When any user comments with matching keywords on ANY of your posts/reels, they will receive this Auto DM."
                        : "🎯 Post-specific rule: Only comments on this selected post matching the keywords will trigger this Auto DM."}
                    </p>
                  </div>

                  {/* Keyword */}
                  <div className="mt-5">
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Comment Keyword(s)
                    </label>

                    <input
                      type="text"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="e.g. price, buy, info, link, offer"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
                    />

                    <p className="mt-1 text-xs text-gray-400">
                      Separate multiple keywords with commas (e.g., <code>price, info, buy</code>). Matching is case-insensitive.
                    </p>
                  </div>

                  {/* Selected Comment Preview */}
                  <div className="mt-5 rounded-lg bg-gray-50 p-3">
                    <p className="text-xs font-medium text-gray-500">
                      Example comment
                    </p>

                    <p className="mt-1 text-sm text-gray-800">
                      {currentComment ? (
                        <>
                          @{currentComment.username || "instagram_user"}: "{currentComment.text || currentComment.comment}"
                        </>
                      ) : (
                        <span className="text-gray-400">Select a comment on the left to preview</span>
                      )}
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
                      This message will be sent directly to the Instagram user who comments.
                    </p>
                  </div>

                  {/* Save */}
                  <button
                    onClick={handleSaveAutomation}
                    disabled={saving || (triggerType !== "all_posts" && !currentPost?.id)}
                    className={`mt-6 w-full rounded-lg bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-gray-800 ${
                      saving || (triggerType !== "all_posts" && !currentPost?.id) ? "cursor-not-allowed opacity-70" : ""
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
                        {triggerType === "all_posts"
                          ? "Someone comments on ANY post on your account"
                          : `Someone comments on selected post (${currentPost?.caption ? currentPost.caption.slice(0, 30) + "..." : "Selected Post"})`}
                      </p>
                    </div>

                    <div className="flex justify-center text-gray-400">↓</div>

                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xs text-gray-400">
                        IF COMMENT CONTAINS (ANY OF)
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {keyword
                          .split(",")
                          .map((k) => k.trim())
                          .filter(Boolean)
                          .map((k, i) => (
                            <span
                              key={i}
                              className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-800"
                            >
                              "{k}"
                            </span>
                          ))}
                      </div>
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
                    <div>
                      <h2 className="font-medium text-gray-900">
                        Recent Auto DMs
                      </h2>
                      <p className="text-xs text-gray-400">Live Webhook Log</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => accountData?.id && fetchRecentEvents(accountData.id)}
                        disabled={loadingEvents}
                        className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        title="Refresh Live Logs"
                      >
                        {loadingEvents ? "..." : "↻ Refresh"}
                      </button>
                      <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                        Live
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {recentEvents && recentEvents.length > 0 ? (
                      recentEvents.map((evt) => {
                        const commenterUsername =
                          evt.payload?.commenter?.username ||
                          evt.payload?.from?.username ||
                          "instagram_user";
                        const commentText =
                          evt.payload?.comment_text ||
                          evt.payload?.text ||
                          "Comment received";
                        const resultStatus =
                          evt.payload?.processing_result?.status ||
                          (evt.processed ? "sent" : "pending");
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
                                    : resultStatus === "failed"
                                      ? "bg-red-50 text-red-600"
                                      : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {isSent ? "DM Sent ✓" : resultStatus}
                              </span>
                            </div>

                            <p className="mt-1 text-xs text-gray-600">
                              Comment: "{commentText}"
                            </p>
                            {evt.payload?.processing_result?.dm_message_sent && (
                              <p className="mt-1 rounded bg-gray-50 p-2 text-[11px] text-gray-500 italic">
                                DM: "{evt.payload.processing_result.dm_message_sent}"
                              </p>
                            )}
                            {evt.created_at && (
                              <p className="mt-1 text-[10px] text-gray-400">
                                {formatTimestamp(evt.created_at)}
                              </p>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-lg border border-gray-100 p-4 text-center text-xs text-gray-400">
                        No automated DMs triggered yet. When users comment matching your keyword(s), live logs appear here.
                      </div>
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
