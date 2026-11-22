-- Messages confidentiels (jamais publiés) et retrait d'une lettre par son auteur. Appliqué le 22/11/2026.
alter table public.courrier add column prive boolean not null default false;
alter table public.courrier add column retrait text; -- empreinte du jeton de retrait remis à l'auteur
alter table public.courrier drop constraint courrier_message_check;
alter table public.courrier add constraint courrier_message_check check (char_length(message) between 2 and 1000);
alter table public.courrier add constraint courrier_prive_masque check (not prive or masque);

drop function public.courrier_poster(text, text, text, text);
create function public.courrier_poster(p_pseudo text, p_message text, p_mission text, p_empreinte text, p_prive boolean, p_retrait text)
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
  insert into public.courrier (pseudo, message, mission, prive, masque, retrait)
    values (p_pseudo, p_message, p_mission, p_prive, p_prive, p_retrait)
    returning id, created_at into v_id, v_date;
  insert into public.courrier_debit (empreinte) values (p_empreinte);
  return jsonb_build_object('ok', true, 'id', v_id, 'date', v_date);
end; $$;
revoke all on function public.courrier_poster(text, text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.courrier_poster(text, text, text, text, boolean, text) to service_role;
