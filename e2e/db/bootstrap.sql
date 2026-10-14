-- The bits of a Supabase database that supabase/migrations depend on, so the e2e suite can run
-- the real migrations against plain Postgres without the Supabase CLI.
create schema if not exists extensions;
create schema if not exists auth;

create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
