-- Relatorio Financeiro IBPV
-- Periodos mensais, relacao privada de dizimistas, cargos, usuarios temporarios
-- e relatorios assinados.
--
-- Migracao aditiva e repetivel. Nao apaga lancamentos, relatorios ou arquivos
-- existentes. Execute depois de 20260722_portal_transparencia_atividades.sql.

create extension if not exists pgcrypto;

-- ============================================================
-- 1. PERFIS, SENHA TEMPORARIA E CARGOS DE ASSINATURA
-- ============================================================

alter table public.profiles
  add column if not exists email text,
  add column if not exists must_change_password boolean not null default false,
  add column if not exists last_access_at timestamptz;

update public.profiles profile
set email = auth_user.email
from auth.users auth_user
where auth_user.id = profile.id
  and profile.email is distinct from auth_user.email;

create table if not exists public.church_positions (
  code text primary key,
  label text not null,
  sort_order integer not null default 0,
  assigned_user_id uuid unique references auth.users(id) on delete set null,
  assigned_at timestamptz,
  assigned_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint church_positions_code_check check (
    code in (
      'primeiro_tesoureiro',
      'segundo_tesoureiro',
      'conselho_fiscal_1',
      'conselho_fiscal_2',
      'conselho_fiscal_3'
    )
  )
);

insert into public.church_positions (code, label, sort_order)
values
  ('primeiro_tesoureiro', 'Primeiro Tesoureiro', 10),
  ('segundo_tesoureiro', 'Segundo Tesoureiro', 20),
  ('conselho_fiscal_1', 'Conselho Fiscal 1', 30),
  ('conselho_fiscal_2', 'Conselho Fiscal 2', 40),
  ('conselho_fiscal_3', 'Conselho Fiscal 3', 50)
on conflict (code) do update
set
  label = excluded.label,
  sort_order = excluded.sort_order;

alter table public.church_positions enable row level security;

-- Usuários com senha temporária continuam autenticados, mas não recebem papel
-- de acesso às tabelas financeiras até concluírem a troca.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select profile.role
  from public.profiles profile
  where profile.id = (select auth.uid())
    and profile.active = true
    and profile.must_change_password = false
  limit 1;
$$;

create or replace function public.can_view_tithes()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.current_user_role() in ('administrador', 'tesouraria', 'conselho'),
    false
  );
$$;

drop policy if exists "Equipe financeira visualiza cargos" on public.church_positions;
create policy "Equipe financeira visualiza cargos"
on public.church_positions
for select
to authenticated
using (public.is_financial_staff());

drop policy if exists "Administrador gerencia cargos" on public.church_positions;
create policy "Administrador gerencia cargos"
on public.church_positions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.church_positions to authenticated;
grant insert, update, delete on public.church_positions to authenticated;

create or replace function public.list_report_signatories()
returns table (
  code text,
  label text,
  sort_order integer,
  user_id uuid,
  full_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_financial_staff() then
    raise exception 'Acesso restrito a equipe financeira.';
  end if;

  return query
  select
    position.code,
    position.label,
    position.sort_order,
    position.assigned_user_id,
    profile.full_name
  from public.church_positions position
  left join public.profiles profile on profile.id = position.assigned_user_id
  order by position.sort_order;
end;
$$;

revoke all on function public.list_report_signatories() from public;
grant execute on function public.list_report_signatories() to authenticated;

-- ============================================================
-- 2. ORIGEM AUTOMATICA DOS LANCAMENTOS DE DIZIMOS
-- ============================================================

alter table public.financial_entries
  add column if not exists source_type text,
  add column if not exists source_id uuid;

create unique index if not exists financial_entries_source_unique_idx
  on public.financial_entries(source_type, source_id)
  where source_type is not null and source_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'financial_entries_source_type_check'
      and conrelid = 'public.financial_entries'::regclass
  ) then
    alter table public.financial_entries
      add constraint financial_entries_source_type_check
      check (source_type is null or source_type in ('tithe_sheet'));
  end if;
end;
$$;

-- ============================================================
-- 3. CADASTRO E RELACAO MENSAL DE DIZIMISTAS
-- ============================================================

create table if not exists public.tithers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  active boolean not null default true,
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tithers_name_length check (char_length(full_name) between 3 and 160)
);

create unique index if not exists tithers_active_name_unique_idx
  on public.tithers(lower(full_name))
  where active = true;

create table if not exists public.tithe_sheets (
  id uuid primary key default gen_random_uuid(),
  reference_month date not null unique,
  financial_entry_id uuid unique
    references public.financial_entries(id) on delete set null,
  total_amount numeric(14,2) not null default 0
    check (total_amount >= 0),
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tithe_sheets_first_day_check
    check (reference_month = date_trunc('month', reference_month)::date)
);

create table if not exists public.tithe_items (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.tithe_sheets(id) on delete cascade,
  tither_id uuid not null references public.tithers(id) on delete restrict,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sheet_id, tither_id)
);

create index if not exists tithe_sheets_reference_month_idx
  on public.tithe_sheets(reference_month desc);

create index if not exists tithe_items_sheet_idx
  on public.tithe_items(sheet_id);

create index if not exists tithe_items_tither_idx
  on public.tithe_items(tither_id);

alter table public.tithers enable row level security;
alter table public.tithe_sheets enable row level security;
alter table public.tithe_items enable row level security;

drop trigger if exists tithers_set_updated_at on public.tithers;
create trigger tithers_set_updated_at
before update on public.tithers
for each row execute function public.set_updated_at();

drop trigger if exists tithe_sheets_set_updated_at on public.tithe_sheets;
create trigger tithe_sheets_set_updated_at
before update on public.tithe_sheets
for each row execute function public.set_updated_at();

drop trigger if exists tithe_items_set_updated_at on public.tithe_items;
create trigger tithe_items_set_updated_at
before update on public.tithe_items
for each row execute function public.set_updated_at();

drop policy if exists "Equipe financeira visualiza dizimistas" on public.tithers;
create policy "Equipe financeira visualiza dizimistas"
on public.tithers
for select
to authenticated
using (public.can_view_tithes());

drop policy if exists "Tesouraria gerencia dizimistas" on public.tithers;
create policy "Tesouraria gerencia dizimistas"
on public.tithers
for all
to authenticated
using (public.can_manage_finances())
with check (public.can_manage_finances());

drop policy if exists "Equipe financeira visualiza relacoes de dizimos" on public.tithe_sheets;
create policy "Equipe financeira visualiza relacoes de dizimos"
on public.tithe_sheets
for select
to authenticated
using (public.can_view_tithes());

drop policy if exists "Tesouraria gerencia relacoes de dizimos" on public.tithe_sheets;
create policy "Tesouraria gerencia relacoes de dizimos"
on public.tithe_sheets
for all
to authenticated
using (public.can_manage_finances())
with check (public.can_manage_finances());

drop policy if exists "Equipe financeira visualiza valores de dizimos" on public.tithe_items;
create policy "Equipe financeira visualiza valores de dizimos"
on public.tithe_items
for select
to authenticated
using (public.can_view_tithes());

drop policy if exists "Tesouraria gerencia valores de dizimos" on public.tithe_items;
create policy "Tesouraria gerencia valores de dizimos"
on public.tithe_items
for all
to authenticated
using (public.can_manage_finances())
with check (public.can_manage_finances());

grant select, insert, update, delete on public.tithers to authenticated;
grant select, insert, update, delete on public.tithe_sheets to authenticated;
grant select, insert, update, delete on public.tithe_items to authenticated;

create or replace function public.create_tither(p_full_name text)
returns public.tithers
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_name text := regexp_replace(trim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  result public.tithers%rowtype;
begin
  if not public.can_manage_finances() then
    raise exception 'Somente a tesouraria ou o administrador pode cadastrar dizimistas.';
  end if;

  if char_length(normalized_name) < 3 or char_length(normalized_name) > 160
     or normalized_name ~ '[<>]' then
    raise exception 'Informe um nome valido entre 3 e 160 caracteres.';
  end if;

  select * into result
  from public.tithers
  where lower(full_name) = lower(normalized_name)
  order by active desc, created_at desc
  limit 1;

  if result.id is not null then
    update public.tithers
    set full_name = normalized_name, active = true, updated_at = now()
    where id = result.id
    returning * into result;
  else
    insert into public.tithers (full_name, created_by)
    values (normalized_name, actor_id)
    returning * into result;
  end if;

  return result;
end;
$$;

create or replace function public.save_tithe_sheet(
  p_reference_month date,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_month date := date_trunc('month', p_reference_month)::date;
  sheet public.tithe_sheets%rowtype;
  resolved_category_id uuid;
  linked_entry_id uuid;
  computed_total numeric(14,2);
  supplied_count integer;
  valid_count integer;
begin
  if not public.can_manage_finances() then
    raise exception 'Somente a tesouraria ou o administrador pode salvar a relacao de dizimos.';
  end if;

  if p_reference_month is null then
    raise exception 'Informe o mes de referencia.';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'A lista de dizimos e invalida.';
  end if;

  select count(*) into supplied_count
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb));

  select count(*) into valid_count
  from (
    select distinct (item ->> 'tither_id')::uuid as tither_id
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) item
    join public.tithers tither
      on tither.id = (item ->> 'tither_id')::uuid
     and tither.active = true
    where item ? 'tither_id'
      and item ? 'amount'
      and (item ->> 'amount')::numeric >= 0
  ) valid_items;

  if supplied_count <> valid_count then
    raise exception 'A relacao possui nomes repetidos ou valores invalidos.';
  end if;

  insert into public.tithe_sheets (
    reference_month,
    created_by,
    updated_by
  )
  values (
    normalized_month,
    actor_id,
    actor_id
  )
  on conflict (reference_month) do update
  set updated_by = actor_id, updated_at = now()
  returning * into sheet;

  delete from public.tithe_items where sheet_id = sheet.id;

  insert into public.tithe_items (sheet_id, tither_id, amount)
  select
    sheet.id,
    (item ->> 'tither_id')::uuid,
    round((item ->> 'amount')::numeric, 2)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) item;

  select coalesce(sum(amount), 0)
  into computed_total
  from public.tithe_items
  where sheet_id = sheet.id;

  select id into resolved_category_id
  from public.financial_categories
  where type = 'entrada'
    and lower(name) in ('dizimos', 'dízimos')
  order by case when name = 'Dízimos' then 0 else 1 end
  limit 1;

  if resolved_category_id is null then
    insert into public.financial_categories (name, type, sort_order)
    values ('Dízimos', 'entrada', 10)
    on conflict (name, type) do update set active = true
    returning id into resolved_category_id;
  end if;

  linked_entry_id := sheet.financial_entry_id;

  if linked_entry_id is null then
    select id into linked_entry_id
    from public.financial_entries
    where source_type = 'tithe_sheet'
      and source_id = sheet.id
    limit 1;
  end if;

  if computed_total > 0 then
    if linked_entry_id is null then
      insert into public.financial_entries (
        type,
        category_id,
        description,
        amount,
        transaction_date,
        payment_method,
        notes,
        status,
        source_type,
        source_id,
        created_by,
        updated_by
      )
      values (
        'entrada',
        resolved_category_id,
        'Dizimos - ' || to_char(normalized_month, 'MM/YYYY'),
        computed_total,
        normalized_month,
        null,
        'Lancamento gerado automaticamente pela relacao de dizimistas.',
        'ativo',
        'tithe_sheet',
        sheet.id,
        actor_id,
        actor_id
      )
      returning id into linked_entry_id;
    else
      update public.financial_entries
      set
        type = 'entrada',
        category_id = resolved_category_id,
        description = 'Dizimos - ' || to_char(normalized_month, 'MM/YYYY'),
        amount = computed_total,
        transaction_date = normalized_month,
        status = 'ativo',
        source_type = 'tithe_sheet',
        source_id = sheet.id,
        updated_by = actor_id,
        updated_at = now()
      where id = linked_entry_id;
    end if;
  elsif linked_entry_id is not null then
    update public.financial_entries
    set status = 'cancelado', updated_by = actor_id, updated_at = now()
    where id = linked_entry_id;
  end if;

  update public.tithe_sheets
  set
    total_amount = computed_total,
    financial_entry_id = linked_entry_id,
    updated_by = actor_id,
    updated_at = now()
  where id = sheet.id
  returning * into sheet;

  return jsonb_build_object(
    'id', sheet.id,
    'reference_month', sheet.reference_month,
    'total_amount', sheet.total_amount,
    'financial_entry_id', sheet.financial_entry_id,
    'updated_at', sheet.updated_at
  );
end;
$$;

revoke all on function public.create_tither(text) from public;
revoke all on function public.save_tithe_sheet(date, jsonb) from public;
grant execute on function public.create_tither(text) to authenticated;
grant execute on function public.save_tithe_sheet(date, jsonb) to authenticated;

-- ============================================================
-- 4. RELATORIOS ASSINADOS
-- ============================================================

create table if not exists public.signed_reports (
  id uuid primary key default gen_random_uuid(),
  reference_month date not null unique,
  report_id uuid references public.reports(id) on delete set null,
  file_name text not null,
  storage_bucket text not null default 'relatorios-assinados',
  storage_path text not null unique,
  file_size bigint not null check (file_size > 0),
  mime_type text not null default 'application/pdf',
  status text not null default 'rascunho'
    check (status in ('rascunho', 'publicado')),
  uploaded_by uuid not null default auth.uid()
    references auth.users(id) on delete restrict,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signed_reports_first_day_check
    check (reference_month = date_trunc('month', reference_month)::date),
  constraint signed_reports_pdf_check
    check (mime_type = 'application/pdf')
);

alter table public.signed_reports enable row level security;

drop trigger if exists signed_reports_set_updated_at on public.signed_reports;
create trigger signed_reports_set_updated_at
before update on public.signed_reports
for each row execute function public.set_updated_at();

drop policy if exists "Equipe financeira visualiza relatorios assinados" on public.signed_reports;
create policy "Equipe financeira visualiza relatorios assinados"
on public.signed_reports
for select
to authenticated
using (public.is_financial_staff());

drop policy if exists "Administrador gerencia relatorios assinados" on public.signed_reports;
create policy "Administrador gerencia relatorios assinados"
on public.signed_reports
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update, delete on public.signed_reports to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'relatorios-assinados',
  'relatorios-assinados',
  false,
  52428800,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.is_published_signed_report_file(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.signed_reports signed
    where signed.status = 'publicado'
      and signed.storage_path = object_name
  );
$$;

drop policy if exists "Equipe financeira le relatorios assinados" on storage.objects;
create policy "Equipe financeira le relatorios assinados"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'relatorios-assinados'
  and public.is_financial_staff()
);

drop policy if exists "Administrador envia relatorios assinados" on storage.objects;
create policy "Administrador envia relatorios assinados"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'relatorios-assinados'
  and public.is_admin()
);

drop policy if exists "Administrador atualiza relatorios assinados" on storage.objects;
create policy "Administrador atualiza relatorios assinados"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'relatorios-assinados'
  and public.is_admin()
)
with check (
  bucket_id = 'relatorios-assinados'
  and public.is_admin()
);

drop policy if exists "Administrador exclui relatorios assinados" on storage.objects;
create policy "Administrador exclui relatorios assinados"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'relatorios-assinados'
  and public.is_admin()
);

drop policy if exists "Visitantes leem relatorios assinados publicados" on storage.objects;
create policy "Visitantes leem relatorios assinados publicados"
on storage.objects
for select
to anon
using (
  bucket_id = 'relatorios-assinados'
  and public.is_published_signed_report_file(name)
);

revoke all on function public.is_published_signed_report_file(text) from public;
grant execute on function public.is_published_signed_report_file(text) to anon, authenticated;

-- ============================================================
-- 5. AUDITORIA DAS NOVAS AREAS
-- ============================================================

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

  if target_table = 'tithers' then
    return case operation
      when 'INSERT' then 'tither_created'
      when 'UPDATE' then 'tither_updated'
      when 'DELETE' then 'tither_deleted'
      else lower(operation)
    end;
  end if;

  if target_table in ('tithe_sheets', 'tithe_items') then
    return 'tithe_sheet_' || lower(operation);
  end if;

  if target_table = 'signed_reports' then
    if operation = 'DELETE' then return 'signed_report_removed'; end if;
    if new_status = 'publicado' and old_status is distinct from 'publicado' then
      return 'signed_report_published';
    end if;
    if operation = 'INSERT' then return 'signed_report_uploaded'; end if;
    return 'signed_report_replaced';
  end if;

  if target_table = 'church_positions' then
    return 'position_' || lower(operation);
  end if;

  return lower(operation);
end;
$$;

drop trigger if exists tithers_audit on public.tithers;
create trigger tithers_audit
after insert or update or delete on public.tithers
for each row execute function public.register_audit_log();

drop trigger if exists tithe_sheets_audit on public.tithe_sheets;
create trigger tithe_sheets_audit
after insert or update or delete on public.tithe_sheets
for each row execute function public.register_audit_log();

drop trigger if exists tithe_items_audit on public.tithe_items;
create trigger tithe_items_audit
after insert or update or delete on public.tithe_items
for each row execute function public.register_audit_log();

drop trigger if exists signed_reports_audit on public.signed_reports;
create trigger signed_reports_audit
after insert or update or delete on public.signed_reports
for each row execute function public.register_audit_log();

-- A funcao de registro da interface passa a aceitar tambem as novas acoes.
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
    'save_failed',
    'password_changed',
    'tithe_sheet_viewed',
    'tithe_pdf_downloaded',
    'signed_report_downloaded'
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
    'visitor_exited',
    'signed_report_downloaded',
    'tithe_summary_viewed'
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
    case
      when p_action = 'signed_report_downloaded' then 'signed_reports'
      when p_action = 'tithe_summary_viewed' then 'tithe_sheets'
      when p_record_id is null then 'visitor_sessions'
      else 'reports'
    end,
    coalesce(p_record_id, p_session_id::text),
    case p_action
      when 'portal_opened' then 'Acesso iniciado no Portal de Transparencia'
      when 'report_viewed' then 'Relatorio publicado visualizado'
      when 'pdf_downloaded' then 'PDF de relatorio publicado baixado'
      when 'print_requested' then 'Impressao ou PDF solicitado'
      when 'visitor_exited' then 'Sessao de visitante encerrada'
      when 'signed_report_downloaded' then 'Relatorio assinado baixado'
      when 'tithe_summary_viewed' then 'Resumo publico de dizimos visualizado'
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

-- ============================================================
-- 6. PORTAL: RELATORIO, DOCUMENTO ASSINADO E RESUMO DE DIZIMOS
-- ============================================================

drop function if exists public.list_public_reports();

create function public.list_public_reports()
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
  has_snapshot boolean,
  signed_report_id uuid,
  signed_report_path text,
  signed_report_file_name text,
  tither_count bigint,
  tithe_total numeric
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
    report.report_snapshot is not null,
    signed.id,
    signed.storage_path,
    signed.file_name,
    coalesce(tithe_summary.tither_count, 0),
    coalesce(tithe_summary.tithe_total, 0)
  from public.reports report
  left join public.signed_reports signed
    on signed.reference_month = date_trunc('month', report.start_date)::date
   and signed.status = 'publicado'
  left join lateral (
    select
      count(distinct item.tither_id) filter (where item.amount > 0) as tither_count,
      coalesce(sum(item.amount), 0) as tithe_total
    from public.tithe_sheets sheet
    join public.tithe_items item on item.sheet_id = sheet.id
    where sheet.reference_month between
      date_trunc('month', report.start_date)::date
      and date_trunc('month', report.end_date)::date
  ) tithe_summary on true
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

  if resolved_name is null then
    raise exception 'Identificacao de visitante obrigatoria.';
  end if;

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
    'snapshot', report.report_snapshot,
    'signed_report', case when signed.id is null then null else jsonb_build_object(
      'id', signed.id,
      'file_name', signed.file_name,
      'storage_path', signed.storage_path,
      'published_at', signed.published_at
    ) end,
    'tithe_summary', jsonb_build_object(
      'count', coalesce(tithe_summary.tither_count, 0),
      'total', coalesce(tithe_summary.tithe_total, 0)
    )
  ) into payload
  from public.reports report
  left join public.signed_reports signed
    on signed.reference_month = date_trunc('month', report.start_date)::date
   and signed.status = 'publicado'
  left join lateral (
    select
      count(distinct item.tither_id) filter (where item.amount > 0) as tither_count,
      coalesce(sum(item.amount), 0) as tithe_total
    from public.tithe_sheets sheet
    join public.tithe_items item on item.sheet_id = sheet.id
    where sheet.reference_month between
      date_trunc('month', report.start_date)::date
      and date_trunc('month', report.end_date)::date
  ) tithe_summary on true
  where report.id = p_report_id
    and report.status = 'publicado';

  if payload is null then
    raise exception 'Relatorio publicado nao encontrado.';
  end if;

  perform public.record_visitor_activity(
    p_session_id,
    p_client_token,
    'report_viewed',
    p_report_id::text,
    jsonb_build_object('title', payload ->> 'title')
  );

  if coalesce((payload -> 'tithe_summary' ->> 'count')::bigint, 0) > 0 then
    perform public.record_visitor_activity(
      p_session_id,
      p_client_token,
      'tithe_summary_viewed',
      p_report_id::text,
      jsonb_build_object('title', payload ->> 'title')
    );
  end if;

  return payload;
end;
$$;

revoke all on function public.record_user_activity(text, text, text, text, text, jsonb) from public;
revoke all on function public.record_visitor_activity(uuid, uuid, text, text, jsonb) from public;
revoke all on function public.list_public_reports() from public;
revoke all on function public.get_public_report(uuid, uuid, uuid) from public;

grant execute on function public.record_user_activity(text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.record_visitor_activity(uuid, uuid, text, text, jsonb) to anon, authenticated;
grant execute on function public.list_public_reports() to anon, authenticated;
grant execute on function public.get_public_report(uuid, uuid, uuid) to anon, authenticated;
