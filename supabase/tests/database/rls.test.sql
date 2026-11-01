begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'hyresvard@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'sokande@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'annan@example.com');

select is((select count(*) from public.profiles)::int, 3, 'profiler skapas vid registrering');

insert into public.listings (id, owner_id, status, lease_type, title, street_address, postal_code, city, rooms, area_sqm, monthly_rent_sek) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'published', 'first_hand', 'Publicerad', 'Gatan 1', '11122', 'Stockholm', 2, 50, 10000),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'draft', 'first_hand', 'Utkast', 'Gatan 2', '11122', 'Stockholm', 3, 70, 14000);

-- Utloggad
set local role anon;
select set_config('request.jwt.claims', '', true);
select is((select count(*) from public.listings)::int, 1, 'utloggad ser bara publicerade annonser');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'utloggad kommer inte åt profiler');
select throws_ok($$ select * from public.applications $$, '42501', null, 'utloggad kommer inte åt anmälningar');

-- Hyresvärden
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.listings)::int, 2, 'ägaren ser sina utkast');

-- Sökande
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*) from public.listings)::int, 1, 'andra ser inte utkast');
select is_empty($$ update public.listings set title = 'Kapad' where id = '00000000-0000-0000-0000-000000000001' returning id $$, 'andra kan inte ändra annonsen');
select throws_ok(
  $$ insert into public.listings (owner_id, lease_type, title, street_address, postal_code, city, rooms, area_sqm, monthly_rent_sek)
     values ('00000000-0000-0000-0000-00000000000a', 'first_hand', 'Falsk', 'Gatan 3', '11122', 'Stockholm', 1, 20, 5000) $$,
  '42501', null, 'kan inte skapa annons i någon annans namn');
select throws_ok(
  $$ insert into public.applications (listing_id, applicant_id, status)
     values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'accepted') $$,
  '42501', null, 'sökande kan inte godkänna sig själv vid anmälan');
select throws_ok(
  $$ insert into public.applications (listing_id, applicant_id)
     values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'kan inte anmäla sig till utkast');
select lives_ok(
  $$ insert into public.applications (listing_id, applicant_id, message)
     values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'Hej!') $$,
  'kan anmäla sig till publicerad annons');
select throws_ok($$ update public.applications set status = 'accepted' $$, '42501', null, 'sökande kan inte godkänna sin anmälan');

-- Utomstående
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select is((select count(*) from public.applications)::int, 0, 'utomstående ser inte anmälningar');
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000b')::int, 0, 'utomstående ser inte sökandes profil');

-- Hyresvärden igen
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000b')::int, 1, 'hyresvärden ser sökandes profil');
select throws_ok($$ update public.applications set message = 'Ändrad' $$, '42501', null, 'hyresvärden kan inte ändra meddelandet');
select isnt_empty($$ update public.applications set status = 'accepted' returning id $$, 'hyresvärden kan godkänna anmälan');

-- Sökande återkallar
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select isnt_empty($$ update public.applications set status = 'withdrawn' returning id $$, 'sökande kan återkalla anmälan');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is_empty($$ update public.applications set status = 'accepted' returning id $$, 'hyresvärden kan inte godkänna återkallad anmälan');

select * from finish();
rollback;
