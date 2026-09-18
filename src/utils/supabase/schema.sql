-- ==============================================================================
-- INSTAGRAM AUTO DM - DATABASE SCHEMA & RLS POLICIES
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
-- Purpose: Store Instagram accounts connected by application users
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.instagram_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_user_id TEXT NOT NULL UNIQUE, -- Ensures 1 IG account belongs to only 1 app user
  instagram_username TEXT NOT NULL,
  access_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'disconnected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_user_instagram_account UNIQUE (user_id, instagram_user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_user_id 
  ON public.instagram_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_ig_user_id 
  ON public.instagram_accounts(instagram_user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_status 
  ON public.instagram_accounts(status);

-- Auto-update updated_at trigger
DROP TRIGGER IF EXISTS set_instagram_accounts_updated_at ON public.instagram_accounts;
CREATE TRIGGER set_instagram_accounts_updated_at
  BEFORE UPDATE ON public.instagram_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Enable Row Level Security
ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for instagram_accounts
CREATE POLICY "Users can view their own connected instagram accounts"
  ON public.instagram_accounts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can link an instagram account"
  ON public.instagram_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own connected instagram account"
  ON public.instagram_accounts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can disconnect their own instagram account"
  ON public.instagram_accounts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ==============================================================================
-- 3. SECURITY: Prevent access_token exposure to frontend queries
-- ==============================================================================
-- Revoke direct access_token SELECT for frontend roles (anon and authenticated)
REVOKE SELECT (access_token) ON public.instagram_accounts FROM authenticated, anon;
-- Grant SELECT on safe columns to authenticated
GRANT SELECT (id, user_id, instagram_user_id, instagram_username, status, created_at, updated_at) 
  ON public.instagram_accounts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.instagram_accounts TO authenticated;

-- Create a secure view for the frontend to query safely without access_token
CREATE OR REPLACE VIEW public.user_instagram_accounts 
WITH (security_invoker = true) AS
SELECT
  id,
  user_id,
  instagram_user_id,
  instagram_username,
  status,
  created_at,
  updated_at
FROM public.instagram_accounts;

GRANT SELECT ON public.user_instagram_accounts TO authenticated;

-- ==============================================================================
-- 4. TABLE: instagram_automations
-- Purpose: Store user's Instagram post automation rules
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.instagram_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_account_id UUID NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  instagram_post_id TEXT NOT NULL, -- Specific Instagram Media ID or 'all_posts'
  keyword TEXT NOT NULL CHECK (char_length(trim(keyword)) > 0),
  dm_message TEXT NOT NULL CHECK (char_length(trim(dm_message)) > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_account_post_keyword UNIQUE (instagram_account_id, instagram_post_id, keyword)
);

-- Indexes for fast lookup during webhook triggers
CREATE INDEX IF NOT EXISTS idx_instagram_automations_user_id 
  ON public.instagram_automations(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_automations_account_id 
  ON public.instagram_automations(instagram_account_id);
CREATE INDEX IF NOT EXISTS idx_instagram_automations_post_active 
  ON public.instagram_automations(instagram_post_id, is_active);
CREATE INDEX IF NOT EXISTS idx_instagram_automations_keyword 
  ON public.instagram_automations(keyword);

-- Auto-update updated_at trigger
DROP TRIGGER IF EXISTS set_instagram_automations_updated_at ON public.instagram_automations;
CREATE TRIGGER set_instagram_automations_updated_at
  BEFORE UPDATE ON public.instagram_automations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Enable Row Level Security
ALTER TABLE public.instagram_automations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for instagram_automations
CREATE POLICY "Users can view their own automations"
  ON public.instagram_automations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create automations for their own account"
  ON public.instagram_automations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.instagram_accounts
      WHERE id = instagram_account_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own automations"
  ON public.instagram_automations
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.instagram_accounts
      WHERE id = instagram_account_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own automations"
  ON public.instagram_automations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT ALL ON public.instagram_automations TO authenticated;

-- ==============================================================================
-- 5. SERVER-SIDE RPC: save_instagram_automation
-- Purpose: Server-side validation, ownership enforcement & upsert for automations
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.save_instagram_automation(
  p_account_id UUID,
  p_post_id TEXT,
  p_keyword TEXT,
  p_dm_message TEXT,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER -- Respects RLS and evaluates auth.uid()
AS $$
DECLARE
  v_user_id UUID;
  v_account_exists BOOLEAN;
  v_automation_id UUID;
  v_cleaned_keyword TEXT;
  v_cleaned_dm_message TEXT;
  v_cleaned_post_id TEXT;
BEGIN
  -- 1. Ensure user is authenticated
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate input parameters server-side
  v_cleaned_post_id := TRIM(COALESCE(p_post_id, ''));
  v_cleaned_keyword := TRIM(COALESCE(p_keyword, ''));
  v_cleaned_dm_message := TRIM(COALESCE(p_dm_message, ''));

  IF v_cleaned_post_id = '' THEN
    RAISE EXCEPTION 'Instagram post ID cannot be empty' USING ERRCODE = '22023';
  END IF;

  IF v_cleaned_keyword = '' THEN
    RAISE EXCEPTION 'Comment keyword cannot be empty' USING ERRCODE = '22023';
  END IF;

  IF v_cleaned_dm_message = '' THEN
    RAISE EXCEPTION 'DM message cannot be empty' USING ERRCODE = '22023';
  END IF;

  -- 3. Strictly verify that the Instagram account belongs to the calling user
  SELECT EXISTS (
    SELECT 1 FROM public.instagram_accounts
    WHERE id = p_account_id AND user_id = v_user_id
  ) INTO v_account_exists;

  IF NOT v_account_exists THEN
    RAISE EXCEPTION 'Instagram account not found or does not belong to you' USING ERRCODE = '42501';
  END IF;

  -- 4. Upsert into instagram_automations
  INSERT INTO public.instagram_automations (
    user_id,
    instagram_account_id,
    instagram_post_id,
    keyword,
    dm_message,
    is_active,
    updated_at
  ) VALUES (
    v_user_id,
    p_account_id,
    v_cleaned_post_id,
    v_cleaned_keyword,
    v_cleaned_dm_message,
    COALESCE(p_is_active, true),
    timezone('utc'::text, now())
  )
  ON CONFLICT (instagram_account_id, instagram_post_id, keyword)
  DO UPDATE SET
    dm_message = EXCLUDED.dm_message,
    is_active = EXCLUDED.is_active,
    updated_at = timezone('utc'::text, now())
  RETURNING id INTO v_automation_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_automation_id,
    'user_id', v_user_id,
    'instagram_account_id', p_account_id,
    'instagram_post_id', v_cleaned_post_id,
    'keyword', v_cleaned_keyword,
    'dm_message', v_cleaned_dm_message,
    'is_active', COALESCE(p_is_active, true)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_instagram_automation TO authenticated;

-- ==============================================================================
-- 6. TABLE: instagram_webhook_events
-- Purpose: Track webhook events and prevent duplicate processing
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.instagram_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_account_id UUID REFERENCES public.instagram_accounts(id) ON DELETE SET NULL,
  event_id TEXT NOT NULL UNIQUE, -- Meta webhook entry/comment/message ID for deduplication
  event_type TEXT NOT NULL DEFAULT 'comment',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for event lookup and deduplication
CREATE INDEX IF NOT EXISTS idx_instagram_webhook_events_event_id 
  ON public.instagram_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_instagram_webhook_events_account_id 
  ON public.instagram_webhook_events(instagram_account_id);
CREATE INDEX IF NOT EXISTS idx_instagram_webhook_events_processed 
  ON public.instagram_webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_instagram_webhook_events_created_at 
  ON public.instagram_webhook_events(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.instagram_webhook_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for instagram_webhook_events
CREATE POLICY "Users can view webhook events for their account"
  ON public.instagram_webhook_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.instagram_accounts
      WHERE id = instagram_webhook_events.instagram_account_id
      AND user_id = auth.uid()
    )
  );
