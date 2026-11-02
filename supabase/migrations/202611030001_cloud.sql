-- Server-only API. Not exposed through public Supabase Data API.
CREATE SCHEMA IF NOT EXISTS cafeos_cloud;
REVOKE ALL ON SCHEMA cafeos_cloud FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS cafeos_cloud.tenants (
 id uuid PRIMARY KEY, name text NOT NULL, plan text NOT NULL DEFAULT 'Trial',
 max_outlets integer NOT NULL DEFAULT 1 CHECK(max_outlets BETWEEN 1 AND 500),
 status text NOT NULL CHECK(status IN ('active','suspended')), expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cafeos_cloud.tenants ADD COLUMN IF NOT EXISTS max_outlets integer NOT NULL DEFAULT 1 CHECK(max_outlets BETWEEN 1 AND 500);
CREATE TABLE IF NOT EXISTS cafeos_cloud.outlets (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES cafeos_cloud.tenants(id),
 code text UNIQUE NOT NULL, name text NOT NULL, state jsonb NOT NULL,
 version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(octet_length(state::text) <= 33554432)
);
CREATE TABLE IF NOT EXISTS cafeos_cloud.sessions (
 token_hash text PRIMARY KEY, outlet_id uuid NOT NULL REFERENCES cafeos_cloud.outlets(id), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS cafeos_cloud.admins (
 id text PRIMARY KEY, name text NOT NULL, salt text NOT NULL, password_hash text NOT NULL, keys jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cafeos_cloud.admin_sessions (
 token_hash text PRIMARY KEY, admin_id text NOT NULL REFERENCES cafeos_cloud.admins(id), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS cafeos_cloud.attempts (id text PRIMARY KEY, count integer NOT NULL, until_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS cafeos_cloud.audit (
 id uuid PRIMARY KEY, actor text NOT NULL, action text NOT NULL, detail text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cafeos_cloud.migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
-- Non-login role used only after the server has established trusted outlet scope.
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cafeos_outlet_runtime') THEN CREATE ROLE cafeos_outlet_runtime NOLOGIN NOBYPASSRLS; END IF; END $$;
GRANT cafeos_outlet_runtime TO postgres;
GRANT USAGE ON SCHEMA cafeos_cloud TO cafeos_outlet_runtime;
GRANT SELECT, UPDATE ON cafeos_cloud.outlets TO cafeos_outlet_runtime;
ALTER TABLE cafeos_cloud.outlets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outlet_scope ON cafeos_cloud.outlets;
CREATE POLICY outlet_scope ON cafeos_cloud.outlets TO cafeos_outlet_runtime
 USING(id::text = current_setting('cafeos.outlet_id', true))
 WITH CHECK(id::text = current_setting('cafeos.outlet_id', true));
REVOKE ALL ON ALL TABLES IN SCHEMA cafeos_cloud FROM PUBLIC,anon,authenticated;
INSERT INTO cafeos_cloud.migrations(id) VALUES('202611030001') ON CONFLICT DO NOTHING;
