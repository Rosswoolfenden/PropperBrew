-- Deterministic fixtures for the e2e suite. IDs and values here are asserted in tests/*.spec.ts
-- via fixtures.ts, so change them together.

-- Profiles are created by the on_auth_user_created trigger; pin the usernames afterwards.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'alice@example.com'),
  ('00000000-0000-4000-8000-00000000000b', 'ben@example.com');
update public.profiles set username = 'alice' where id = '00000000-0000-4000-8000-00000000000a';
update public.profiles set username = 'ben' where id = '00000000-0000-4000-8000-00000000000b';

insert into public.roasters (id, slug, name, city, bio, shopify_domain, shopify_uninstalled_at) values
  ('00000000-0000-4000-8000-000000000100', 'north-star', 'North Star Coffee Roasters', 'Leeds',
   'Leeds'' first specialty roastery, sourcing directly from producers they visit every harvest.',
   'north-star-coffee.myshopify.com', null),
  ('00000000-0000-4000-8000-000000000110', 'hackney-heights', 'Hackney Heights', 'London', null,
   'hackney-heights.myshopify.com', null),
  -- Uninstalled the app, so nothing is in stock: left out of discovery.
  ('00000000-0000-4000-8000-000000000120', 'gone-quiet', 'Gone Quiet Roasters', 'Bristol', null,
   'gone-quiet.myshopify.com', now());

insert into public.coffee_beans
  (id, roaster_id, slug, name, image_url, origin_country, region, producer, process, roast_level,
   varietals, altitude_masl, tasting_notes, avg_rating, review_count, created_at)
values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000100', 'el-diviso',
   'El Diviso Pink Bourbon',
   'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 4 5%22%3E%3Crect width=%224%22 height=%225%22 fill=%22%23b7ccb9%22/%3E%3C/svg%3E',
   'Colombia', 'Huila', 'Néstor Lasso', 'washed', 'light',
   '{Pink Bourbon}', 1850, '{Rhubarb,Hibiscus,Pink grapefruit}', 45, 2, now()),
  -- Every variant is out of stock: hidden from "in stock" lists, page shows the sold-out note.
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000100', 'kiambu-ab',
   'Kiambu AB', null, 'Kenya', null, null, 'natural', 'medium',
   '{}', null, '{Blackcurrant}', null, 0, now() - interval '1 day'),
  -- Hackney Heights' newest coffee is newer than North Star's, so they lead discovery.
  ('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000110', 'kochere',
   'Kochere Natural', null, 'Ethiopia', 'Yirgacheffe', null, 'natural', 'light',
   '{Heirloom}', 2000, '{Blueberry,Jasmine}', null, 0, now() + interval '1 minute'),
  ('00000000-0000-4000-8000-000000000212', '00000000-0000-4000-8000-000000000110', 'cerrado',
   'Cerrado Pulped Natural', null, 'Brazil', 'Cerrado Mineiro', null, 'honey', 'medium',
   '{Yellow Bourbon}', null, '{Hazelnut,Milk chocolate}', null, 0, now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000221', '00000000-0000-4000-8000-000000000120', 'old-faithful',
   'Old Faithful', null, 'Guatemala', null, null, 'washed', 'medium',
   '{}', null, '{Toffee}', null, 0, now());

insert into public.shopify_products (id, roaster_id, shopify_product_id, coffee_bean_id, title) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000100', '1001',
   '00000000-0000-4000-8000-000000000201', 'El Diviso Pink Bourbon'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000100', '1002',
   '00000000-0000-4000-8000-000000000202', 'Kiambu AB'),
  ('00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000110', '1101',
   '00000000-0000-4000-8000-000000000211', 'Kochere Natural'),
  ('00000000-0000-4000-8000-000000000312', '00000000-0000-4000-8000-000000000110', '1102',
   '00000000-0000-4000-8000-000000000212', 'Cerrado Pulped Natural'),
  ('00000000-0000-4000-8000-000000000321', '00000000-0000-4000-8000-000000000120', '1201',
   '00000000-0000-4000-8000-000000000221', 'Old Faithful');

insert into public.shopify_variants
  (shopify_product_row_id, coffee_bean_id, shopify_variant_id, title, weight_g, price_pence, in_stock)
values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', '2001', '250g / Wholebean', 250, 1250, true),
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', '2002', '1kg / Wholebean', 1000, 4200, true),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000202', '2003', '250g / Wholebean', 250, 1100, false),
  ('00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000211', '3001', '250g / Wholebean', 250, 1400, true),
  ('00000000-0000-4000-8000-000000000312', '00000000-0000-4000-8000-000000000212', '3002', '250g / Wholebean', 250, 950, true),
  ('00000000-0000-4000-8000-000000000321', '00000000-0000-4000-8000-000000000221', '4001', '250g / Wholebean', 250, 1000, false);

insert into public.reviews (user_id, coffee_bean_id, rating, tasting_notes, body, created_at) values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000201', 50,
   '{Rhubarb,Cherry}', 'Bright and juicy, with a long floral finish.', now()),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000201', 40,
   '{}', null, now() - interval '1 hour');

-- Mock recipes with full step-by-step guides (shown on the recipe screen).
insert into public.brew_recipes
  (id, user_id, coffee_bean_id, brew_method, coffee_dose_dg, water_weight_g, water_temp_c,
   grinder_model, grinder_key, grind_setting, total_brew_time_seconds, upvotes_count, notes, steps)
values
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000201',
   'v60', 150, 250, 94, 'Comandante C40', 'comandante c40', '24 clicks', 165, 7,
   'A clean, bright cup that lets the rhubarb and hibiscus lead. Keep the pours gentle so the bed stays flat.',
   '[{"time":0,"water":45,"title":"The bloom","note":"Pour 45g to saturate the grounds evenly, then wait 30 seconds while the CO2 escapes."},
     {"time":30,"water":150,"title":"The main pour","note":"Spiral outward then back in, reaching 150g by 1:15 with a slow, steady stream."},
     {"time":75,"water":250,"title":"The finish","note":"Add the final 100g and give the dripper a light swirl. Draw-down should finish around 2:45."}]'),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000201',
   'espresso', 180, 40, null, null, null, null, 28, 2,
   'Pulled a touch long to tame the acidity; grapefruit up front with a syrupy finish.',
   '[{"time":0,"title":"Pre-infuse","note":"Low pressure for 5 seconds to wet the puck evenly."},
     {"time":5,"water":40,"title":"Extract","note":"Full pressure until 40g in the cup, around 28 seconds total."}]'),
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000201',
   'aeropress', 150, 230, 85, '1Zpresso JX-Pro', '1zpresso jx-pro', '3.2.0', 150, 4,
   'Inverted, lower temperature for a sweeter, rounder cup.',
   '[{"time":0,"water":50,"title":"Wet the grounds","note":"Inverted AeroPress. Add 50g and stir three times."},
     {"time":30,"water":230,"title":"Top up","note":"Fill to 230g, cap with a rinsed filter and steep."},
     {"time":120,"title":"Flip and press","note":"Flip onto the cup and press gently for 30 seconds."}]'),
  ('00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000211',
   'chemex', 300, 500, 96, 'Baratza Encore', 'baratza encore', '20', 270, 5,
   'Big batch for two. The thick filter keeps the blueberry clean and juicy.',
   '[{"time":0,"water":60,"title":"The bloom","note":"60g of water, then 45 seconds to degas."},
     {"time":45,"water":300,"title":"First pour","note":"Pour in slow circles to 300g."},
     {"time":105,"water":500,"title":"Second pour","note":"Top up to 500g and let it drain. Aim to finish around 4:30."}]'),
  ('00000000-0000-4000-8000-000000000512', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000211',
   'v60', 120, 200, 93, 'Comandante C40', 'comandante c40', '22 clicks', 150, 3,
   'A smaller single cup; finer grind to pull out the jasmine.',
   '[{"time":0,"water":40,"title":"The bloom","note":"40g, swirl, wait 40 seconds."},
     {"time":40,"water":200,"title":"One long pour","note":"Steady centre pour to 200g, finishing by 1:20."}]'),
  ('00000000-0000-4000-8000-000000000521', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000212',
   'french_press', 300, 500, 96, 'Baratza Encore', 'baratza encore', '28', 480, 6,
   'Hoffmann-style: long steep, no plunge-through. Hazelnut and milk chocolate, very forgiving.',
   '[{"time":0,"water":500,"title":"Fill","note":"Add all 500g of water at once."},
     {"time":240,"title":"Break the crust","note":"Stir the crust and skim off the foam and floaters."},
     {"time":480,"title":"Pour","note":"Press only to the surface and pour slowly through the mesh."}]'),
  ('00000000-0000-4000-8000-000000000522', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000212',
   'moka_pot', 150, 150, 70, null, null, 'Fine', 240, 1,
   'Start with hot water so the grounds never cook.',
   '[{"time":0,"water":150,"title":"Fill the base","note":"Hot water to just below the valve, coffee levelled, not tamped."},
     {"time":120,"title":"Low heat","note":"Medium-low heat with the lid open; watch for the first flow."},
     {"time":240,"title":"Stop early","note":"Take it off when it turns blond and cool the base under the tap."}]');

-- The roasters' own recommended recipes (no user; shown first on each coffee).
insert into public.brew_recipes
  (id, roaster_id, coffee_bean_id, brew_method, coffee_dose_dg, water_weight_g, water_temp_c,
   grinder_model, grinder_key, grind_setting, total_brew_time_seconds, upvotes_count, notes, steps)
values
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000201',
   'v60', 150, 240, 95, null, null, 'Medium-fine', 180, 12,
   'How we cup it at the roastery: a touch hotter and a slightly tighter ratio to bring out the hibiscus.',
   '[{"time":0,"water":50,"title":"The bloom","note":"50g, stir gently, 40 seconds."},
     {"time":40,"water":140,"title":"Second pour","note":"Slow circles to 140g."},
     {"time":80,"water":240,"title":"Final pour","note":"Centre pour to 240g, aim to finish by 3:00."}]'),
  ('00000000-0000-4000-8000-000000000611', '00000000-0000-4000-8000-000000000110', '00000000-0000-4000-8000-000000000211',
   'aeropress', 170, 220, 88, null, null, 'Medium', 135, 9,
   'Our competition-style AeroPress: strong concentrate, then bypass to taste.',
   '[{"time":0,"water":220,"title":"All in","note":"Standard position, all the water at once, stir five times."},
     {"time":75,"title":"Swirl","note":"Fit the plunger to stop dripping and swirl gently."},
     {"time":105,"title":"Press","note":"Press for 30 seconds, stopping at the hiss."}]'),
  ('00000000-0000-4000-8000-000000000612', '00000000-0000-4000-8000-000000000110', '00000000-0000-4000-8000-000000000212',
   'espresso', 190, 42, 93, null, null, 'Fine', 30, 8,
   'Our house espresso. Great with milk.',
   '[{"time":0,"water":42,"title":"Pull","note":"19g in, 42g out, around 30 seconds."}]');

insert into public.shelf_entries (user_id, coffee_bean_id, roast_date, created_at) values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000201', current_date - 10, now()),
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000202', null, now() - interval '1 minute');
