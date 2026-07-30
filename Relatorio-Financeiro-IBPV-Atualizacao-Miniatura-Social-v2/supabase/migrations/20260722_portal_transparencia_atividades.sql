-- Relatorio Financeiro IBPV
-- Portal de Transparencia sem conta e historico imutavel de atividades.
-- Esta migracao e aditiva: nao remove nem recria dados financeiros existentes.

create extension if not exists pgcrypto;

alter table public.reports
  add column if not exists report_snapshot jsonb;

alter table public.audit_logs
  add column if not exists actor_type text not null default 'authenticated',
  add column if not exists actor_name text,
  add column if not exists actor_role text,
  add column if not exists visitor_session_id uuid,
  add column if not exists description text,
  add column if not exists result text not null default 'success',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.audit_logs log
set
  actor_type = case when log.user_id is null then 'system' else 'authenticated' end,
  actor_name = coalesce(log.actor_name, profile.full_name),
  actor_role = coalesce(log.actor_role, profile.role)
from public.profiles profile
where profile.id = log.user_id
  and (log.actor_name is null or log.actor_role is null);

update public.audit_logs
set actor_type = 'system'
where user_id is null
  and visitor_session_id is null;

create table if not exists public.visitor_sessions (
  id uuid primary key default gen_random_uuid(),
  client_token uuid not null unique,
  visitor_name text not null,
  active boolean not null default true,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint visitor_sessions_name_length
    check (char_length(visitor_name) between 3 and 120)
);

alter table public.visitor_sessions enable row level security;

revoke all on table public.visitor_sessions from anon, authenticated;
revoke all on table public.audit_logs from anon;
revoke insert, update, delete on table public.audit_logs from anon, authenticated;
grant select on table public.audit_logs to authenticated;

create index if not exists visitor_sessions_last_seen_idx
  on public.visitor_sessions(last_seen_at desc);

create index if not exists audit_logs_visitor_activity_idx
  on public.audit_logs(visitor_session_id, action, record_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'audit_logs_actor_type_check'
      and conrelid = 'public.audit_logs'::regclass
  ) then
    alter table public.audit_logs
      add constraint audit_logs_actor_type_check
      check (actor_type in ('authenticated', 'visitor', 'system'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'audit_logs_result_check'
      and conrelid = 'public.audit_logs'::regclass
  ) then
    alter table public.audit_logs
      add constraint audit_logs_result_check
      check (result in ('success', 'failure'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'audit_logs_visitor_session_fkey'
      and conrelid = 'public.audit_logs'::regclass
  ) then
    alter table public.audit_logs
      add constraint audit_logs_visitor_session_fkey
      foreign key (visitor_session_id)
      references public.visitor_sessions(id)
      on delete restrict;
  end if;
end;
$$;

create or replace function public.audit_action_name(
  target_table text,
  operation text,
  old_row jsonb,
  new_row jsonb
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  entry_type text := coalesce(new_row ->> 'type', old_row ->> 'type');
  old_status text := old_row ->> 'status';
  new_status text := new_row ->> 'status';
begin
  if target_table = 'financial_entries' then
    return case
      when entry_type = 'entrada' and operation = 'INSERT' then 'income_created'
      when entry_type = 'entrada' and operation = 'UPDATE' then 'income_updated'
      when entry_type = 'entrada' and operation = 'DELETE' then 'income_deleted'
      when entry_type = 'saida' and operation = 'INSERT' then 'expense_created'
      when entry_type = 'saida' and operation = 'UPDATE' then 'expense_updated'
      when entry_type = 'saida' and operation = 'DELETE' then 'expense_deleted'
      else lower(operation)
    end;
  end if;

  if target_table = 'reports' then
    if operation = 'DELETE' then return 'report_deleted'; end if;
    if new_status = 'publicado' and old_status is distinct from 'publicado' then
      return 'report_published';
    end if;
    if new_status = 'arquivado' and old_status is distinct from 'arquivado' then
      return 'report_archived';
    end if;
    return 'report_saved';
  end if;

  if target_table = 'attachments' then
    return case operation
      when 'INSERT' then 'attachment_uploaded'
      when 'UPDATE' then 'attachment_updated'
      when 'DELETE' then 'attachment_deleted'
      else lower(operation)
    end;
  end if;

  return lower(operation);
end;
$$;

create or replace function public.register_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_profile public.profiles%rowtype;
  old_json jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_json jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  target_id text;
  activity_action text;
begin
  target_id := coalesce(
    case when tg_op = 'DELETE' then old.id::text else new.id::text end,
    null
  );

  if actor_id is not null then
    select * into actor_profile
    from public.profiles
    where id = actor_id;
  end if;

  activity_action := public.audit_action_name(tg_table_name, tg_op, old_json, new_json);

  insert into public.audit_logs (
    user_id,
    actor_type,
    actor_name,
    actor_role,
    action,
    table_name,
    record_id,
    description,
    result,
    old_data,
    new_data,
    metadata
  )
  values (
    actor_id,
    case when actor_id is null then 'system' else 'authenticated' end,
    actor_profile.full_name,
    actor_profile.role,
    activity_action,
    tg_table_name,
    target_id,
    case activity_action
      when 'income_created' then 'Entrada financeira adicionada'
      when 'income_updated' then 'Entrada financeira editada'
      when 'income_deleted' then 'Entrada financeira excluida'
      when 'expense_created' then 'Despesa financeira adicionada'
      when 'expense_updated' then 'Despesa financeira editada'
      when 'expense_deleted' then 'Despesa financeira excluida'
      when 'report_saved' then 'Relatorio financeiro salvo'
      when 'report_published' then 'Relatorio financeiro publicado'
      when 'report_archived' then 'Relatorio financeiro arquivado'
      when 'report_deleted' then 'Relatorio financeiro excluido'
      when 'attachment_uploaded' then 'Anexo enviado'
      when 'attachment_updated' then 'Anexo atualizado'
      when 'attachment_deleted' then 'Anexo excluido'
      else activity_action
    end,
    'success',
    old_json,
    new_json,
    '{}'::jsonb
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists attachments_audit on public.attachments;
create trigger attachments_audit
after insert or update or delete on public.attachments
for each row execute function public.register_audit_log();

create or replace function public.begin_visitor_session(
  p_visitor_name text,
  p_client_token uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_name text := regexp_replace(trim(coalesce(p_visitor_name, '')), '\s+', ' ', 'g');
  session_id uuid;
begin
  if char_length(normalized_name) < 3 or char_length(normalized_name) > 120 then
    raise exception 'Informe um nome completo entre 3 e 120 caracteres.';
  end if;

  if normalized_name ~ '[<>]' then
    raise exception 'O nome informado contem caracteres invalidos.';
  end if;

  insert into public.visitor_sessions (
    client_token,
    visitor_name,
    active,
    started_at,
    last_seen_at,
    ended_at
  )
  values (p_client_token, normalized_name, true, now(), now(), null)
  on conflict (client_token) do update
  set
    visitor_name = excluded.visitor_name,
    active = true,
    last_seen_at = now(),
    ended_at = null
  returning id into session_id;

  if exists (
    select 1
    from public.audit_logs
    where visitor_session_id = session_id
      and action = 'visitor_identified'
      and created_at >= now() - interval '30 seconds'
  ) then
    return session_id;
  end if;

  insert into public.audit_logs (
    actor_type,
    actor_name,
    visitor_session_id,
    action,
    table_name,
    record_id,
    description,
    result,
    metadata
  )
  values (
    'visitor',
    normalized_name,
    session_id,
    'visitor_identified',
    'visitor_sessions',
    session_id::text,
    'Visitante identificado no Portal de Transparencia',
    'success',
    '{}'::jsonb
  );

  return session_id;
end;
$$;

create or replace function public.resume_visitor_session(
  p_session_id uuid,
  p_client_token uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_name text;
begin
  update public.visitor_sessions
  set last_seen_at = now()
  where id = p_session_id
    and client_token = p_client_token
    and active = true
  returning visitor_name into resolved_name;

  return resolved_name;
end;
$$;

create or replace function public.record_visitor_activity(
  p_session_id uuid,
  p_client_token uuid,
  p_action text,
  p_record_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_name text;
  log_id bigint;
  allowed_actions constant text[] := array[
    'portal_opened',
    'report_viewed',
    'pdf_downloaded',
    'print_requested',
    'visitor_exited'
  ];
begin
  if not (p_action = any(allowed_actions)) then
    raise exception 'Atividade de visitante nao permitida.';
  end if;

  if octet_length(coalesce(p_metadata, '{}'::jsonb)::text) > 4096 then
    raise exception 'Metadados excedem o limite permitido.';
  end if;

  select visitor_name into resolved_name
  from public.visitor_sessions
  where id = p_session_id
    and client_token = p_client_token
    and active = true;

  if resolved_name is null then
    raise exception 'Sessao de visitante invalida ou encerrada.';
  end if;

  update public.visitor_sessions
  set last_seen_at = now()
  where id = p_session_id;

  select id into log_id
  from public.audit_logs
  where visitor_session_id = p_session_id
    and action = p_action
    and record_id is not distinct from coalesce(p_record_id, p_session_id::text)
    and created_at >= now() - interval '2 seconds'
  order by created_at desc
  limit 1;

  -- Repetições idênticas muito rápidas retornam o registro existente em vez de
  -- criar linhas ilimitadas no histórico.
  if log_id is not null then return log_id; end if;

  insert into public.audit_logs (
    actor_type,
    actor_name,
    visitor_session_id,
    action,
    table_name,
    record_id,
    description,
    result,
    metadata
  )
  values (
    'visitor',
    resolved_name,
    p_session_id,
    p_action,
    case when p_record_id is null then 'visitor_sessions' else 'reports' end,
    coalesce(p_record_id, p_session_id::text),
    case p_action
      when 'portal_opened' then 'Acesso iniciado no Portal de Transparencia'
      when 'report_viewed' then 'Relatorio publicado visualizado'
      when 'pdf_downloaded' then 'PDF de relatorio publicado baixado'
      when 'print_requested' then 'Impressao ou PDF solicitado'
      when 'visitor_exited' then 'Sessao de visitante encerrada'
      else p_action
    end,
    'success',
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into log_id;

  if p_action = 'visitor_exited' then
    update public.visitor_sessions
    set active = false, ended_at = now(), last_seen_at = now()
    where id = p_session_id;
  end if;

  return log_id;
end;
$$;

create or replace function public.record_user_activity(
  p_action text,
  p_table_name text default 'application',
  p_record_id text default null,
  p_description text default null,
  p_result text default 'success',
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_profile public.profiles%rowtype;
  log_id bigint;
  allowed_actions constant text[] := array[
    'login',
    'logout',
    'session_restored',
    'period_changed',
    'report_previewed',
    'print_requested',
    'pdf_downloaded',
    'save_failed'
  ];
begin
  if actor_id is null then raise exception 'Autenticacao obrigatoria.'; end if;
  if not (p_action = any(allowed_actions)) then raise exception 'Atividade nao permitida.'; end if;
  if p_result not in ('success', 'failure') then raise exception 'Resultado invalido.'; end if;
  if octet_length(coalesce(p_metadata, '{}'::jsonb)::text) > 8192 then
    raise exception 'Metadados excedem o limite permitido.';
  end if;

  select * into actor_profile
  from public.profiles
  where id = actor_id and active = true;

  if actor_profile.id is null then raise exception 'Perfil ativo nao encontrado.'; end if;

  insert into public.audit_logs (
    user_id,
    actor_type,
    actor_name,
    actor_role,
    action,
    table_name,
    record_id,
    description,
    result,
    metadata
  )
  values (
    actor_id,
    'authenticated',
    actor_profile.full_name,
    actor_profile.role,
    p_action,
    coalesce(nullif(trim(p_table_name), ''), 'application'),
    p_record_id,
    coalesce(p_description, p_action),
    p_result,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into log_id;

  return log_id;
end;
$$;

create or replace function public.list_public_reports()
returns table (
  id uuid,
  title text,
  period_type text,
  start_date date,
  end_date date,
  total_income numeric,
  total_expense numeric,
  opening_balance numeric,
  closing_balance numeric,
  published_at timestamptz,
  pdf_storage_path text,
  has_snapshot boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    report.id,
    report.title,
    report.period_type,
    report.start_date,
    report.end_date,
    report.total_income,
    report.total_expense,
    report.opening_balance,
    report.closing_balance,
    report.published_at,
    report.pdf_storage_path,
    report.report_snapshot is not null
  from public.reports report
  where report.status = 'publicado'
  order by report.start_date desc, report.published_at desc;
$$;

create or replace function public.get_public_report(
  p_report_id uuid,
  p_session_id uuid,
  p_client_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_name text;
  payload jsonb;
begin
  select visitor_name into resolved_name
  from public.visitor_sessions
  where id = p_session_id
    and client_token = p_client_token
    and active = true;

  if resolved_name is null then raise exception 'Identificacao de visitante obrigatoria.'; end if;

  select jsonb_build_object(
    'id', report.id,
    'title', report.title,
    'period_type', report.period_type,
    'start_date', report.start_date,
    'end_date', report.end_date,
    'total_income', report.total_income,
    'total_expense', report.total_expense,
    'opening_balance', report.opening_balance,
    'closing_balance', report.closing_balance,
    'published_at', report.published_at,
    'pdf_storage_path', report.pdf_storage_path,
    'snapshot', report.report_snapshot
  ) into payload
  from public.reports report
  where report.id = p_report_id
    and report.status = 'publicado';

  if payload is null then raise exception 'Relatorio publicado nao encontrado.'; end if;

  perform public.record_visitor_activity(
    p_session_id,
    p_client_token,
    'report_viewed',
    p_report_id::text,
    jsonb_build_object('title', payload ->> 'title')
  );

  return payload;
end;
$$;

create or replace function public.is_published_report_file(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.reports report
    where report.status = 'publicado'
      and report.pdf_storage_path = object_name
  );
$$;

drop policy if exists "Visitantes leem arquivos de relatorios publicados" on storage.objects;
create policy "Visitantes leem arquivos de relatorios publicados"
on storage.objects
for select
to anon
using (
  bucket_id = 'relatorios-publicados'
  and public.is_published_report_file(name)
);

drop policy if exists "Administrador e conselho visualizam auditoria" on public.audit_logs;
create policy "Administrador e conselho visualizam auditoria"
on public.audit_logs
for select
to authenticated
using (public.current_user_role() in ('administrador', 'conselho'));

revoke all on function public.begin_visitor_session(text, uuid) from public;
revoke all on function public.resume_visitor_session(uuid, uuid) from public;
revoke all on function public.record_visitor_activity(uuid, uuid, text, text, jsonb) from public;
revoke all on function public.record_user_activity(text, text, text, text, text, jsonb) from public;
revoke all on function public.list_public_reports() from public;
revoke all on function public.get_public_report(uuid, uuid, uuid) from public;
revoke all on function public.is_published_report_file(text) from public;

grant execute on function public.begin_visitor_session(text, uuid) to anon, authenticated;
grant execute on function public.resume_visitor_session(uuid, uuid) to anon, authenticated;
grant execute on function public.record_visitor_activity(uuid, uuid, text, text, jsonb) to anon, authenticated;
grant execute on function public.record_user_activity(text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.list_public_reports() to anon, authenticated;
grant execute on function public.get_public_report(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.is_published_report_file(text) to anon, authenticated;
