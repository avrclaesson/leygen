-- Grundschema för uthyrning: profiler, annonser, annonsbilder och intresseanmälningar.

create type public.listing_status as enum ('draft', 'published', 'rented', 'archived');
create type public.lease_type as enum ('first_hand', 'second_hand');
create type public.application_status as enum ('pending', 'accepted', 'rejected', 'withdrawn');

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Profiler ---------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Skapar profilen automatiskt när en användare registrerar sig.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Annonser ---------------------------------------------------------------------

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  status public.listing_status not null default 'draft',
  lease_type public.lease_type not null,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  street_address text not null,
  postal_code text not null check (postal_code ~ '^\d{5}$'),
  city text not null,
  rooms numeric(3, 1) not null check (rooms > 0),
  area_sqm numeric(6, 1) not null check (area_sqm > 0),
  floor smallint,
  monthly_rent_sek integer not null check (monthly_rent_sek >= 0),
  deposit_sek integer check (deposit_sek >= 0),
  available_from date,
  available_until date,
  furnished boolean not null default false,
  pets_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (available_until is null or available_until >= available_from)
);

create index listings_owner_id_idx on public.listings (owner_id);
create index listings_search_idx on public.listings (city, monthly_rent_sek) where status = 'published';

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

-- Annonsbilder -----------------------------------------------------------------

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  storage_path text not null unique,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index listing_images_listing_id_idx on public.listing_images (listing_id, position);

-- Intresseanmälningar ----------------------------------------------------------

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  status public.application_status not null default 'pending',
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, applicant_id)
);

create index applications_applicant_id_idx on public.applications (applicant_id);

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- Behörigheter -----------------------------------------------------------------
-- Rättigheterna sätts explicit eftersom Supabase annars ger anon och authenticated allt.

revoke all on public.profiles, public.listings, public.listing_images, public.applications
  from anon, authenticated;

grant select on public.listings, public.listing_images to anon;
grant select, insert, update, delete on public.listings, public.listing_images to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant select, insert on public.applications to authenticated;
grant update (status) on public.applications to authenticated;

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.applications enable row level security;

create policy "Användare ser sin egen profil"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Hyresvärdar ser profiler för sina sökande"
  on public.profiles for select to authenticated
  using (
    exists (
      select 1
      from public.applications a
      join public.listings l on l.id = a.listing_id
      where a.applicant_id = profiles.id
        and l.owner_id = (select auth.uid())
    )
  );

create policy "Användare ändrar sin egen profil"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Alla ser publicerade annonser"
  on public.listings for select to anon, authenticated
  using (status = 'published');

create policy "Ägare ser sina egna annonser"
  on public.listings for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "Ägare skapar egna annonser"
  on public.listings for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Ägare ändrar egna annonser"
  on public.listings for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Ägare tar bort egna annonser"
  on public.listings for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Listings RLS gäller i underfrågan, så bilder syns bara om annonsen gör det.
create policy "Bilder syns om annonsen syns"
  on public.listing_images for select to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id));

create policy "Ägare hanterar annonsens bilder"
  on public.listing_images for all to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and l.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and l.owner_id = (select auth.uid())
    )
  );

create policy "Sökande ser sina egna anmälningar"
  on public.applications for select to authenticated
  using (applicant_id = (select auth.uid()));

create policy "Ägare ser anmälningar på sina annonser"
  on public.applications for select to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and l.owner_id = (select auth.uid())
    )
  );

create policy "Sökande anmäler sig till andras publicerade annonser"
  on public.applications for insert to authenticated
  with check (
    applicant_id = (select auth.uid())
    and status = 'pending'
    and exists (
      select 1 from public.listings l
      where l.id = listing_id
        and l.status = 'published'
        and l.owner_id <> (select auth.uid())
    )
  );

create policy "Sökande återkallar sin anmälan"
  on public.applications for update to authenticated
  using (applicant_id = (select auth.uid()))
  with check (applicant_id = (select auth.uid()) and status = 'withdrawn');

create policy "Ägare besvarar anmälningar som inte är återkallade"
  on public.applications for update to authenticated
  using (
    status <> 'withdrawn'
    and exists (
      select 1 from public.listings l
      where l.id = listing_id and l.owner_id = (select auth.uid())
    )
  )
  with check (
    status <> 'withdrawn'
    and exists (
      select 1 from public.listings l
      where l.id = listing_id and l.owner_id = (select auth.uid())
    )
  );

-- Bildlagring ------------------------------------------------------------------
-- Filer läggs under <listing_id>/<filnamn>. Bucketen är publik, så den som har
-- en bilds URL kan se den även om annonsen är ett utkast.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-images', 'listing-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Ägare laddar upp annonsbilder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listing-images'
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.owner_id = (select auth.uid())
    )
  );

create policy "Ägare ändrar annonsbilder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'listing-images'
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.owner_id = (select auth.uid())
    )
  );

create policy "Ägare tar bort annonsbilder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'listing-images'
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.owner_id = (select auth.uid())
    )
  );
