import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Portal de Transparência identifica visitante sem criar usuário Auth', () => {
  const html = read('app/index.html');
  const app = read('app/scripts/app.js');
  const backend = read('app/scripts/services/backend.js');

  assert.match(html, /Portal de Transparência/);
  assert.match(html, /Seu nome será registrado no histórico de acesso/);
  assert.match(html, /id="member-name"/);
  assert.doesNotMatch(html, /id="member-email"|id="member-password"/);
  assert.match(app, /backend\.beginVisitorSession\(name,crypto\.randomUUID\(\)\)/);
  assert.match(app, /sessionStorage\.setItem\(visitorSessionKey/);
  assert.match(backend, /rpc\('begin_visitor_session'/);
  assert.doesNotMatch(backend, /beginVisitorSession[\s\S]{0,300}signUp/);
});

test('logo do relatório usa URL transformada pelo build e impressão tem limite de espera', () => {
  const source = read('app/scripts/app.js');
  assert.match(source, /new URL\('\.\.\/assets\/logo-ibpv\.png',import\.meta\.url\)\.href/);
  assert.match(source, /class="report-brand-logo" src="\$\{REPORT_LOGO_URL\}"/);
  assert.match(source, /if\(image\.complete\)return Promise\.resolve\(\);/);
  assert.match(source, /setTimeout\(finish,timeoutMs\)/);
});

test('status da nuvem só confirma depois do retorno do backend', () => {
  const source = read('app/scripts/app.js');
  const saveAt = source.indexOf('const savedEntry=await backend.saveEntry');
  const successAt = source.indexOf('markCloudSaved(savedAt)', saveAt);
  const failureAt = source.indexOf("setCloudStatus(navigator.onLine?'error':'offline')", saveAt);
  assert.ok(saveAt >= 0 && successAt > saveAt, 'status de sucesso precisa ocorrer após o salvamento');
  assert.ok(failureAt > saveAt, 'erro de salvamento precisa atualizar o estado da nuvem');
  assert.match(read('app/index.html'), /id="cloud-storage-status"/);
  assert.match(read('app/index.html'), /id="last-cloud-sync"/);
});

test('carregar dados da nuvem não cria um falso horário de salvamento', () => {
  const source = read('app/scripts/app.js');
  const start = source.indexOf('async function syncEntries()');
  const finish = source.indexOf('function isMemberProfile', start);
  const syncFunction = source.slice(start, finish);
  assert.ok(start >= 0 && finish > start, 'função de sincronização não encontrada');
  assert.doesNotMatch(syncFunction, /markCloudSaved\(/);
  assert.match(syncFunction, /setCloudStatus\(state\.lastCloudSync\?'saved':'connected'/);
});

test('histórico é imutável na interface e tem controle por perfil', () => {
  const html = read('app/index.html');
  const app = read('app/scripts/app.js');
  const backend = read('app/scripts/services/backend.js');

  assert.match(html, /id="activity-log-nav"/);
  assert.match(html, /Histórico de atividades/);
  assert.match(app, /\['administrador','conselho'\]\.includes/);
  assert.match(backend, /from\('audit_logs'\)[\s\S]{0,120}\.select\('id,user_id,actor_type/);
  assert.doesNotMatch(app, /deleteActivityLog|updateActivityLog/);
});

test('migração cria RPCs públicas controladas e mantém logs sem escrita direta', () => {
  const sql = read('supabase/migrations/20260722_portal_transparencia_atividades.sql');
  assert.match(sql, /create table if not exists public\.visitor_sessions/);
  assert.match(sql, /create or replace function public\.begin_visitor_session/);
  assert.match(sql, /create or replace function public\.record_visitor_activity/);
  assert.match(sql, /create or replace function public\.list_public_reports/);
  assert.match(sql, /where report\.status = 'publicado'/);
  assert.match(sql, /revoke insert, update, delete on table public\.audit_logs from anon, authenticated/);
  assert.match(sql, /revoke all on table public\.audit_logs from anon/);
  assert.match(sql, /grant select on table public\.audit_logs to authenticated/);
  assert.match(sql, /created_at >= now\(\) - interval '2 seconds'/);
  assert.match(sql, /created_at >= now\(\) - interval '30 seconds'/);
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete)[\s\S]{0,80}audit_logs\s+to\s+anon/i);
  assert.doesNotMatch(read('app/scripts/services/supabase.js'), /service_role|sb_secret_/i);
});
