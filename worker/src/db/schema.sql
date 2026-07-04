-- ============================================================================
-- User System & Auth — PostgreSQL DDL
-- ============================================================================
-- Reference schema for the Resonance user system.
-- Migrations should be run manually via psql or Cloudflare dashboard,
-- NOT executed by the Worker at runtime.
-- ============================================================================
-- Prerequisites:
--   CREATE DATABASE resonance;
--   Cloudflare Hyperdrive binding configured as RESONANCE_DB
-- ============================================================================

-- Active verification codes (one per phone at a time).
-- Cleanup cron: DELETE WHERE created_at < NOW() - INTERVAL '5 minutes';
CREATE TABLE IF NOT EXISTS verification_codes (
    phone      VARCHAR(20) PRIMARY KEY,
    code       VARCHAR(10) NOT NULL,
    attempts   INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SMS send rate-limiting log.
-- TTL cleanup cron: DELETE WHERE created_at < NOW() - INTERVAL '1 hour';
CREATE TABLE IF NOT EXISTS code_requests (
    id         BIGSERIAL PRIMARY KEY,
    phone      VARCHAR(20) NOT NULL,
    ip         VARCHAR(45) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_code_requests_phone_ts ON code_requests (phone, created_at);
CREATE INDEX IF NOT EXISTS idx_code_requests_ip_ts   ON code_requests (ip, created_at);

-- Registered users. userId = "u_" + SHA256(phone + JWT_SECRET).
CREATE TABLE IF NOT EXISTS users (
    user_id    VARCHAR(80) PRIMARY KEY,
    phone_hash VARCHAR(128),  -- NULL for anonymous users; set on bind-phone
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User cloned voice records.
-- UNIQUE constraint provides server-side dedup.
CREATE TABLE IF NOT EXISTS user_voices (
    id         BIGSERIAL PRIMARY KEY,
    user_id    VARCHAR(80) NOT NULL REFERENCES users(user_id),
    voice_id   VARCHAR(100) NOT NULL,
    label      VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, voice_id)
);
CREATE INDEX IF NOT EXISTS idx_user_voices_user ON user_voices (user_id);
