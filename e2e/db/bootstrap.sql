-- What a Supabase database has before its auth service (GoTrue) first starts: the role GoTrue
-- connects as and the schemas it and supabase/migrations expect. GoTrue then creates auth.* itself.
-- Run by docker-init.sh with -v auth_password=…
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create role supabase_auth_admin login password :'auth_password' noinherit createrole;
create schema auth authorization supabase_auth_admin;
grant create on database postgres to supabase_auth_admin;
alter role supabase_auth_admin set search_path = auth;
