-- Same rule as every other table: RLS on, no policies; all access goes through apps/api.
alter table public.roaster_members enable row level security;
--> statement-breakpoint

-- Sign-up sets the account type from user metadata ({ account_type: "business" }); anything else
-- is a consumer. A business account has no access to a roaster until it connects that roaster's
-- Shopify store (proving it runs the store), so the self-declared type grants nothing on its own.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name, account_type)
  values (
    new.id,
    lower(regexp_replace(split_part(coalesce(new.email, 'brewer'), '@', 1), '[^a-zA-Z0-9_]', '', 'g'))
      || '_' || substr(replace(new.id::text, '-', ''), 1, 6),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    case when new.raw_user_meta_data ->> 'account_type' = 'business'
      then 'business'::public.account_type
      else 'consumer'::public.account_type
    end
  );
  return new;
end;
$$;
