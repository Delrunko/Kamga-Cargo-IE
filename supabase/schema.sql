-- À exécuter dans Supabase > SQL Editor
create table profiles(id uuid primary key references auth.users on delete cascade,nom text,
  role text not null check(role in('admin','caissier','agent')));
create table clients(id uuid primary key default gen_random_uuid(),nom text not null,tel text unique not null,created_at timestamptz default now());
create table colis(id uuid primary key default gen_random_uuid(),ref text unique not null,
  client_id uuid references clients,cartons int default 1,cbm numeric(8,2) not null,prix_unitaire int not null,
  forfait int default 0,montant int not null,arrivee date,statut text default 'En transit',created_at timestamptz default now());
create table docs(id uuid primary key default gen_random_uuid(),type text check(type in('devis','recu')),
  numero text unique not null,colis_id uuid references colis,montant int,avance int default 0,
  date date default current_date,lieu text default 'Dla',par uuid references profiles,created_at timestamptz default now());

-- Numérotation séquentielle centralisée (le reçu suit le dernier n° papier : 0002166)
create sequence recu_seq start 2167;
create sequence devis_seq start 1;
create function next_numero(t text) returns text language sql as $$
  select case when t='recu' then lpad(nextval('recu_seq')::text,7,'0')
  else 'D-'||lpad(nextval('devis_seq')::text,4,'0') end $$;

create function my_role() returns text language sql stable security definer as $$
  select role from profiles where id=auth.uid() $$;

alter table profiles enable row level security;
alter table clients enable row level security;
alter table colis enable row level security;
alter table docs enable row level security;
create policy p_read on profiles for select to authenticated using(id=auth.uid() or my_role()='admin');
create policy p_admin on profiles for all to authenticated using(my_role()='admin') with check(my_role()='admin');
create policy c_read on clients for select to authenticated using(true);
create policy c_write on clients for all to authenticated using(my_role() is not null) with check(my_role() is not null);
create policy k_read on colis for select to authenticated using(true);
create policy k_write on colis for all to authenticated using(my_role() is not null) with check(my_role() is not null);
create policy d_read on docs for select to authenticated using(true);
create policy d_insert on docs for insert to authenticated
  with check(my_role() in('admin','caissier') or (type='devis' and my_role()='agent'));
create policy d_del on docs for delete to authenticated using(my_role()='admin');
