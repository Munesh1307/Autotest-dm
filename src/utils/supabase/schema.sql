-- ==============================================================================
-- INSTAGRAM AUTO DM & COMMENT SYNCHRONIZATION SCHEMA & RLS POLICIES
-- ==============================================================================

-- 1. UTILITY: Automated updated_at timestamp trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 2. TABLE: instagram_accounts
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.instagram_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_user_id TEXT NOT NULL UNIQUE,
  instagram_username TEXT NOT NULL,
  access_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'disconnected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_user_instagram_account UNIQUE (user_id, instagram_user_id)
);

CREATE INDEX IF NOT EXISTS idx_instagram_accounts_user_id ON public.instagram_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_ig_user_id ON public.instagram_accounts(instagram_user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_status ON public.instagram_accounts(status);

DROP TRIGGER IF EXISTS set_instagram_accounts_updated_at ON public.instagram_accounts;
CREATE TRIGGER set_instagram_accounts_updated_at
  BEFORE UPDATE ON public.instagram_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own connected instagram accounts" ON public.instagram_accounts;
CREATE POLICY "Users can view their own connected instagram accounts"
  ON public.instagram_accounts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can link an instagram account" ON public.instagram_accounts;
CREATE POLICY "Users can link an instagram account"
  ON public.instagram_accounts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own connected instagram account" ON public.instagram_accounts;
CREATE POLICY "Users can update their own connected instagram account"
  ON public.instagram_accounts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can disconnect their own instagram account" ON public.instagram_accounts;
CREATE POLICY "Users can disconnect their own instagram account"
  ON public.instagram_accounts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Security: Prevent frontend leaking access_token
REVOKE SELECT (access_token) ON public.instagram_accounts FROM authenticated, anon;
GRANT SELECT (id, user_id, instagram_user_id, instagram_username, status, created_at, updated_at) 
  ON public.instagram_accounts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.instagram_accounts TO authenticated;

-- ==============================================================================
-- 3. TABLE: instagram_posts
-- Purpose: Store synchronized Instagram media items for each account
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.instagram_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_account_id UUID NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  instagram_post_id TEXT NOT NULL UNIQUE,
  caption TEXT,
  media_type TEXT NOT NULL DEFAULT 'IMAGE',
  media_url TEXT,
  thumbnail_url TEXT,
  permalink TEXT,
  like_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_account_instagram_post UNIQUE (instagram_account_id, instagram_post_id)
);

CREATE INDEX IF NOT EXISTS idx_instagram_posts_user_id ON public.instagram_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_account_id ON public.instagram_posts(instagram_account_id);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_post_id ON public.instagram_posts(instagram_post_id);

DROP TRIGGER IF EXISTS set_instagram_posts_updated_at ON public.instagram_posts;
CREATE TRIGGER set_instagram_posts_updated_at
  BEFORE UPDATE ON public.instagram_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.instagram_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own instagram posts" ON public.instagram_posts;
CREATE POLICY "Users can view their own instagram posts"
  ON public.instagram_posts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own instagram posts" ON public.instagram_posts;
CREATE POLICY "Users can insert their own instagram posts"
  ON public.instagram_posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own instagram posts" ON public.instagram_posts;
CREATE POLICY "Users can update their own instagram posts"
  ON public.instagram_posts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own instagram posts" ON public.instagram_posts;
CREATE POLICY "Users can delete their own instagram posts"
  ON public.instagram_posts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT ALL ON public.instagram_posts TO authenticated;

-- ==============================================================================
-- 4. TABLE: instagram_comments
-- Purpose: Store synchronized and webhook-captured comments mapped to posts & users
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.instagram_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_account_id UUID NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL, -- Instagram media/post ID
  instagram_comment_id TEXT NOT NULL UNIQUE, -- Ensures deduplication for comments
  instagram_user_id TEXT, -- Commenter's Instagram User ID / IGSID
  instagram_username TEXT NOT NULL, -- Commenter's Instagram username (@rahul123, etc.)
  comment_text TEXT NOT NULL,
  parent_comment_id TEXT, -- Parent comment ID if this is a sub-reply
  like_count INTEGER NOT NULL DEFAULT 0,
  commented_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_instagram_comment_id UNIQUE (instagram_comment_id)
);

CREATE INDEX IF NOT EXISTS idx_instagram_comments_user_id ON public.instagram_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_account_id ON public.instagram_comments(instagram_account_id);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_post_id ON public.instagram_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_comment_id ON public.instagram_comments(instagram_comment_id);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_username ON public.instagram_comments(instagram_username);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_commented_at ON public.instagram_comments(commented_at DESC);

DROP TRIGGER IF EXISTS set_instagram_comments_updated_at ON public.instagram_comments;
CREATE TRIGGER set_instagram_comments_updated_at
  BEFORE UPDATE ON public.instagram_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.instagram_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own instagram comments" ON public.instagram_comments;
CREATE POLICY "Users can view their own instagram comments"
  ON public.instagram_comments FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own instagram comments" ON public.instagram_comments;
CREATE POLICY "Users can insert their own instagram comments"
  ON public.instagram_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own instagram comments" ON public.instagram_comments;
CREATE POLICY "Users can update their own instagram comments"
  ON public.instagram_comments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own instagram comments" ON public.instagram_comments;
CREATE POLICY "Users can delete their own instagram comments"
  ON public.instagram_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT ALL ON public.instagram_comments TO authenticated;

-- ==============================================================================
-- 5. TABLE: auto_dm_rules (and instagram_automations)
-- Purpose: Store post-specific and global Auto DM keyword rules
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.auto_dm_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_account_id UUID NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL, -- Specific Instagram Media ID or 'all_posts'
  keyword TEXT NOT NULL CHECK (char_length(trim(keyword)) > 0),
  message TEXT NOT NULL CHECK (char_length(trim(message)) > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_auto_dm_rules_account_post UNIQUE (instagram_account_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_auto_dm_rules_user_id ON public.auto_dm_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_dm_rules_account_id ON public.auto_dm_rules(instagram_account_id);
CREATE INDEX IF NOT EXISTS idx_auto_dm_rules_post_active ON public.auto_dm_rules(post_id, is_active);
CREATE INDEX IF NOT EXISTS idx_auto_dm_rules_keyword ON public.auto_dm_rules(keyword);

DROP TRIGGER IF EXISTS set_auto_dm_rules_updated_at ON public.auto_dm_rules;
CREATE TRIGGER set_auto_dm_rules_updated_at
  BEFORE UPDATE ON public.auto_dm_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.auto_dm_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own auto dm rules" ON public.auto_dm_rules;
CREATE POLICY "Users can view their own auto dm rules"
  ON public.auto_dm_rules FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own auto dm rules" ON public.auto_dm_rules;
CREATE POLICY "Users can insert their own auto dm rules"
  ON public.auto_dm_rules FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own auto dm rules" ON public.auto_dm_rules;
CREATE POLICY "Users can update their own auto dm rules"
  ON public.auto_dm_rules FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own auto dm rules" ON public.auto_dm_rules;
CREATE POLICY "Users can delete their own auto dm rules"
  ON public.auto_dm_rules FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT ALL ON public.auto_dm_rules TO authenticated;

-- Backward compatibility: instagram_automations table
CREATE TABLE IF NOT EXISTS public.instagram_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_account_id UUID NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  instagram_post_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  dm_message TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.instagram_automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view automations" ON public.instagram_automations;
CREATE POLICY "Users can view automations" ON public.instagram_automations FOR ALL TO authenticated USING (auth.uid() = user_id);
GRANT ALL ON public.instagram_automations TO authenticated;

-- ==============================================================================
-- 6. TABLE: auto_dm_logs (and instagram_webhook_events)
-- Purpose: Track automated DM execution and prevent duplicate DMs
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.auto_dm_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  instagram_user_id TEXT,
  rule_id UUID REFERENCES public.auto_dm_rules(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'ignored', 'pending')),
  provider_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_auto_dm_logs_comment_rule UNIQUE (comment_id, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_auto_dm_logs_user_id ON public.auto_dm_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_dm_logs_post_id ON public.auto_dm_logs(post_id);
CREATE INDEX IF NOT EXISTS idx_auto_dm_logs_comment_id ON public.auto_dm_logs(comment_id);
CREATE INDEX IF NOT EXISTS idx_auto_dm_logs_status ON public.auto_dm_logs(status);
CREATE INDEX IF NOT EXISTS idx_auto_dm_logs_created_at ON public.auto_dm_logs(created_at DESC);

ALTER TABLE public.auto_dm_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own auto dm logs" ON public.auto_dm_logs;
CREATE POLICY "Users can view their own auto dm logs"
  ON public.auto_dm_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

GRANT ALL ON public.auto_dm_logs TO authenticated;

-- Backward compatibility: instagram_webhook_events
CREATE TABLE IF NOT EXISTS public.instagram_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_account_id UUID REFERENCES public.instagram_accounts(id) ON DELETE SET NULL,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL DEFAULT 'comment',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.instagram_webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view webhook events" ON public.instagram_webhook_events;
CREATE POLICY "Users can view webhook events" ON public.instagram_webhook_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.instagram_accounts WHERE id = instagram_webhook_events.instagram_account_id AND user_id = auth.uid()));
GRANT ALL ON public.instagram_webhook_events TO authenticated;
