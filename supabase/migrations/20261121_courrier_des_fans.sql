-- Le Courrier des fans — schéma appliqué au projet Supabase « chuck-maurice » (vyylxdcqbxyhqusuwshf).
-- Trace de référence : les migrations ont été appliquées directement sur le projet.
--
-- Sécurité (vérifiée le 21/11/2026 avec la clé publique du projet) :
--   - les trois tables : RLS activé SANS règle + aucun droit pour anon/authenticated
--     → lecture, écriture et suppression directes refusées (401) ;
--   - courrier_poster n'est exécutable que par service_role (la fonction Edge « courrier ») ;
--   - le sel des empreintes et la clé du gardien sont dans courrier_secrets, jamais dans le site.

create table public.courrier (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  pseudo text not null check (char_length(pseudo) between 1 and 24),
  message text not null check (char_length(message) between 2 and 280),
  mission text check (mission is null or char_length(mission) <= 32),
  masque boolean not null default false
);
create index courrier_visible_idx on public.courrier (id desc) where not masque;

create table public.courrier_debit (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  empreinte text not null
);
create index courrier_debit_idx on public.courrier_debit (empreinte, created_at);

create table public.courrier_secrets (nom text primary key, valeur text not null);
insert into public.courrier_secrets (nom, valeur) values
  ('sel', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')),
  ('cle_gardien', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

alter table public.courrier enable row level security;
alter table public.courrier_debit enable row level security;
alter table public.courrier_secrets enable row level security;

create or replace function public.courrier_poster(p_pseudo text, p_message text, p_mission text, p_empreinte text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_heure int; v_jour int; v_global int; v_id bigint; v_date timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('courrier:' || p_empreinte));
  delete from public.courrier_debit where created_at < now() - interval '24 hours';
  select count(*) filter (where created_at > now() - interval '1 hour'), count(*) into v_heure, v_jour
    from public.courrier_debit where empreinte = p_empreinte;
  if v_heure >= 3 or v_jour >= 10 then return jsonb_build_object('ok', false, 'raison', 'debit'); end if;
  select count(*) into v_global from public.courrier_debit where created_at > now() - interval '1 hour';
  if v_global >= 120 then return jsonb_build_object('ok', false, 'raison', 'guichet'); end if;
  if exists (select 1 from (select message from public.courrier order by id desc limit 200) r where lower(r.message) = lower(p_message)) then
    return jsonb_build_object('ok', false, 'raison', 'doublon');
  end if;
  insert into public.courrier (pseudo, message, mission) values (p_pseudo, p_message, p_mission) returning id, created_at into v_id, v_date;
  insert into public.courrier_debit (empreinte) values (p_empreinte);
  return jsonb_build_object('ok', true, 'id', v_id, 'date', v_date);
end; $$;
revoke all on function public.courrier_poster(text, text, text, text) from public, anon, authenticated;
grant execute on function public.courrier_poster(text, text, text, text) to service_role;

-- 2e migration (courrier_sans_acces_direct) : aucun droit direct pour les rôles publics.
revoke all on table public.courrier, public.courrier_debit, public.courrier_secrets from anon, authenticated;
revoke all on sequence public.courrier_id_seq, public.courrier_debit_id_seq from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;
