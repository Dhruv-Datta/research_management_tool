-- ============================================================
-- FULL SUPABASE SCHEMA — Research Management Tool
-- Run this in the Supabase SQL Editor to set up from scratch
-- https://supabase.com/dashboard/project/YOUR_PROJECT/sql
-- ============================================================


-- ============================================================
-- 1. CONTACTS
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT DEFAULT '',
  role TEXT DEFAULT '',
  relationship_type TEXT DEFAULT 'other',
  contact_method TEXT DEFAULT '',
  contact_value TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  relationship_strength TEXT DEFAULT 'new',
  importance INTEGER DEFAULT 3,
  outreach_type TEXT DEFAULT 'other',
  summary TEXT DEFAULT '',
  next_action TEXT DEFAULT '',
  follow_up_date DATE,
  last_contacted_at TIMESTAMPTZ,
  tags JSONB DEFAULT '[]'::jsonb,
  city TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  last_meeting_note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_follow_up ON contacts(follow_up_date);
CREATE INDEX IF NOT EXISTS idx_contacts_last_contacted ON contacts(last_contacted_at);


-- ============================================================
-- 2. INTERACTIONS (linked to contacts)
-- ============================================================
CREATE TABLE IF NOT EXISTS interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'note',
  summary TEXT DEFAULT '',
  next_step TEXT DEFAULT '',
  date TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interactions_contact ON interactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_interactions_date ON interactions(date DESC);


-- ============================================================
-- 3. CONTACT FILES (linked to contacts)
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT DEFAULT '',
  type TEXT DEFAULT 'link',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_files_contact ON contact_files(contact_id);


-- ============================================================
-- 4. TASKS
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'low',
  done BOOLEAN DEFAULT false,
  notes TEXT DEFAULT '',
  assignee TEXT DEFAULT '',
  subtasks JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT '',
  position INT DEFAULT 0,
  board_id TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_board_id ON tasks(board_id);


-- ============================================================
-- 5. APP SETTINGS (key-value store)
-- Keys: task_boards, activeTaskBoardId, assignees_[boardId],
--        activeWatchlistId
-- ============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 6. RESEARCH LINKS
-- ============================================================
CREATE TABLE IF NOT EXISTS research_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT,
  url TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'other',
  title TEXT,
  source TEXT,
  published_at TIMESTAMPTZ,
  notes TEXT,
  extracted_text TEXT,
  pasted_text TEXT,
  auto_summary TEXT,
  manual_summary TEXT,
  summary_status TEXT DEFAULT 'pending',
  summary_method TEXT DEFAULT 'none',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_links_ticker ON research_links(ticker);
CREATE INDEX IF NOT EXISTS idx_research_links_content_type ON research_links(content_type);


-- ============================================================
-- 7. DOCUMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT,
  category TEXT,
  ticker TEXT,
  notes TEXT DEFAULT '',
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER,
  storage_path TEXT,
  url TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 8. THESES
-- ============================================================
CREATE TABLE IF NOT EXISTS theses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT UNIQUE,
  core_reasons JSONB,
  assumptions TEXT,
  valuation TEXT,
  underwriting JSONB,
  news_updates JSONB DEFAULT '[]'::jsonb,
  todos JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 9. VALUATION MODELS
-- ============================================================
CREATE TABLE IF NOT EXISTS valuation_models (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT UNIQUE,
  inputs JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 10. HOLDINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS holdings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT UNIQUE NOT NULL,
  shares NUMERIC NOT NULL,
  cost_basis NUMERIC NOT NULL,
  added_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 11. PORTFOLIO CASH (single-row table, id always = 1)
-- ============================================================
CREATE TABLE IF NOT EXISTS portfolio_cash (
  id INTEGER PRIMARY KEY DEFAULT 1,
  cash NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO portfolio_cash (id, cash) VALUES (1, 0)
  ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 12. WATCHLISTS
-- ============================================================
CREATE TABLE IF NOT EXISTS watchlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  stocks JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 13. TICKER FUNDAMENTALS
-- data_type: revenue, eps, fcf, operating_margins, buybacks
-- ============================================================
CREATE TABLE IF NOT EXISTS ticker_fundamentals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL,
  data_type TEXT NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 14. TICKER PRICES
-- data_type: daily_prices, market_data
-- ============================================================
CREATE TABLE IF NOT EXISTS ticker_prices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL,
  data_type TEXT NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 15. ALLOCATION CONFIG (single-row table, id always = 1)
-- ============================================================
CREATE TABLE IF NOT EXISTS allocation_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  config JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO allocation_config (id, config) VALUES (1, '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 16. SECTOR CONFIG (single-row table, id always = 1)
-- config: { [sector]: { label, color } }
-- ============================================================
CREATE TABLE IF NOT EXISTS sector_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  config JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO sector_config (id, config) VALUES (1, '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 17. FACTOR CONFIG (single-row table, id always = 1)
-- ============================================================
CREATE TABLE IF NOT EXISTS factor_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  factors JSONB DEFAULT '[]'::jsonb,
  importance_weights JSONB DEFAULT '{"Volatility": 0.9}'::jsonb,
  exposures JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO factor_config (id, factors, importance_weights, exposures)
  VALUES (1, '[]'::jsonb, '{"Volatility": 0.9}'::jsonb, '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 18. FUND NAV DATA
-- ============================================================
CREATE TABLE IF NOT EXISTS fund_nav_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE,
  fund_nav NUMERIC,
  sp500_nav NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 19. STRATEGIC NOTES (per-position CIO annotations)
-- ============================================================
CREATE TABLE IF NOT EXISTS strategic_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT UNIQUE NOT NULL,
  sentiment TEXT DEFAULT 'neutral',        -- bullish, neutral, bearish
  conviction INTEGER DEFAULT 3,            -- 1-5
  action TEXT DEFAULT 'hold',              -- hold, trim, add, watch, exit
  action_reason TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  alternatives TEXT DEFAULT '',            -- alternative tickers / ideas
  expected_return NUMERIC,                  -- expected return %
  target_weight NUMERIC,                   -- target portfolio weight %
  priority TEXT DEFAULT 'normal',          -- urgent, high, normal, low
  sort_order NUMERIC DEFAULT 0,            -- manual ordering within a priority bucket
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_strategic_notes_ticker ON strategic_notes(ticker);


-- ============================================================
-- STORAGE BUCKETS
-- Run these separately or create via the Supabase dashboard
-- Dashboard > Storage > New Bucket
-- ============================================================

-- Bucket: documents
-- Used for: uploaded research documents (PDFs, Word, Excel, etc.)
-- Path format: {category}/{timestamp}_{filename}
-- Public: Yes
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', true)
  ON CONFLICT (id) DO NOTHING;

-- Bucket: research-images
-- Used for: inline images in rich text editors
-- Path format: {ticker}/{timestamp}_{filename}
-- Public: Yes
INSERT INTO storage.buckets (id, name, public) VALUES ('research-images', 'research-images', true)
  ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- STORAGE POLICIES (allow public read + authenticated upload)
-- ============================================================

-- documents bucket policies
CREATE POLICY "Allow public read on documents" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents');

CREATE POLICY "Allow public insert on documents" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Allow public delete on documents" ON storage.objects
  FOR DELETE USING (bucket_id = 'documents');

-- research-images bucket policies
CREATE POLICY "Allow public read on research-images" ON storage.objects
  FOR SELECT USING (bucket_id = 'research-images');

CREATE POLICY "Allow public insert on research-images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'research-images');

CREATE POLICY "Allow public delete on research-images" ON storage.objects
  FOR DELETE USING (bucket_id = 'research-images');
