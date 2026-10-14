-- Fuzzy matching for the bag scanner (word_similarity), and pgvector for future
-- taste-profile recommendations.
create extension if not exists pg_trgm with schema extensions;
--> statement-breakpoint
create extension if not exists vector with schema extensions;
--> statement-breakpoint

-- Profiles are 1:1 with Supabase auth users.
alter table public.profiles
  add constraint profiles_id_auth_users_fk foreign key (id) references auth.users (id) on delete cascade;
--> statement-breakpoint

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    lower(regexp_replace(split_part(coalesce(new.email, 'brewer'), '@', 1), '[^a-zA-Z0-9_]', '', 'g'))
      || '_' || substr(replace(new.id::text, '-', ''), 1, 6),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1))
  );
  return new;
end;
$$;
--> statement-breakpoint

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
--> statement-breakpoint

-- All data access goes through apps/api (which connects as the postgres role).
-- Enable RLS with no policies so Supabase's auto-generated REST/GraphQL APIs
-- can't read or write these tables with the anon/authenticated keys.
alter table public.profiles enable row level security;
--> statement-breakpoint
alter table public.roasters enable row level security;
--> statement-breakpoint
alter table public.coffee_beans enable row level security;
--> statement-breakpoint
alter table public.shopify_products enable row level security;
--> statement-breakpoint
alter table public.shopify_variants enable row level security;
--> statement-breakpoint
alter table public.reviews enable row level security;
--> statement-breakpoint
alter table public.brew_recipes enable row level security;
--> statement-breakpoint
alter table public.recipe_votes enable row level security;
--> statement-breakpoint
alter table public.shelf_entries enable row level security;
--> statement-breakpoint
alter table public.orders enable row level security;
--> statement-breakpoint
alter table public.order_lines enable row level security;
--> statement-breakpoint
alter table public.webhook_events enable row level security;
