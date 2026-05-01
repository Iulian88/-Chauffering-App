CREATE TABLE IF NOT EXISTS notifications_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL,
  operator_id  UUID        NOT NULL,
  channel      TEXT        NOT NULL,
  template_key TEXT        NOT NULL,
  title        TEXT        NOT NULL,
  body         TEXT        NOT NULL,
  payload      JSONB,
  status       TEXT        NOT NULL DEFAULT 'pending',
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
