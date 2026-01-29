-- DNS Intel API Database Schema
-- SQLite database for users, subscriptions, API keys, and referrals

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,                    -- NULL for OAuth-only users
  name TEXT,
  avatar_url TEXT,
  google_id TEXT UNIQUE,
  twitter_id TEXT UNIQUE,
  referral_code TEXT UNIQUE NOT NULL,    -- Their code to share
  referred_by TEXT,                      -- User ID who referred them
  email_verified INTEGER DEFAULT 0,
  verification_token TEXT,
  stripe_customer_id TEXT UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  key_hash TEXT UNIQUE NOT NULL,         -- SHA256 of the actual key
  key_prefix TEXT NOT NULL,              -- First 8 chars for display (di_abc123...)
  name TEXT DEFAULT 'Default',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  stripe_subscription_id TEXT UNIQUE,
  plan TEXT NOT NULL,                    -- 'trial', 'monthly', 'quarterly'
  status TEXT NOT NULL,                  -- 'active', 'cancelled', 'expired', 'past_due'
  current_period_start TEXT NOT NULL,
  current_period_end TEXT NOT NULL,
  cancel_at_period_end INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Free months credits (from referrals)
CREATE TABLE IF NOT EXISTS credits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  months INTEGER NOT NULL,
  reason TEXT NOT NULL,                  -- 'referral', 'promo', etc.
  source_user_id TEXT,                   -- Who triggered the credit (referral)
  applied INTEGER DEFAULT 0,             -- Has this been applied to billing?
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Track referral conversions
CREATE TABLE IF NOT EXISTS referral_conversions (
  id TEXT PRIMARY KEY,
  referrer_id TEXT NOT NULL REFERENCES users(id),
  referred_id TEXT NOT NULL REFERENCES users(id),
  converted_at TEXT,                     -- When they paid (NULL = signed up but not paid)
  credit_given INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(referrer_id, referred_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_twitter_id ON users(twitter_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_credits_user ON credits(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_referrer ON referral_conversions(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_referred ON referral_conversions(referred_id);
