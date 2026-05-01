-- Migration 010: Add FCM token column to users
-- Used by Firebase Cloud Messaging for push notifications.
-- Nullable — user may exist without a registered device token.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS fcm_token TEXT;
