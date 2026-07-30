import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('lançamentos usam mês, categoria real e o novo cálculo financeiro', () => {
  const html = read('app/index.html');
  const app = read('app/scripts/app.js');
  const backend = read('app/scripts/services/backend.js');

  assert.match(html, /id="transaction-date" type="month"/);
  assert.match(html, /<select id="transaction-category" required>/);
  assert.match(app, /date:monthStorageValue/);
  assert.match(app, /categoryId:categorySelect\.value/);
  assert.match(backend, /if \(!categoryId\) throw new Error\('Escolha uma categoria válida/);
  assert.match(html, /Total disponível/);
  assert.match(html, /Saldo para o próximo mês/);
  assert.match(app, /backend\.previousReport\(startDate\)/);
  assert.match(app, /openingBalanceOverrides/);
});

test('relação de dizimistas gera exatamente uma entrada vinculada e preserva a privacidade pública', () => {
  const sql = read('supabase/migrations/20260723_relatorio_mensal_dizimos_usuarios_assinados.sql');
  const app = read('app/scripts/app.js');

  assert.match(sql, /create table if not exists public\.tithers/);
  assert.match(sql, /create table if not exists public\.tithe_sheets/);
  assert.match(sql, /create table if not exists public\.tithe_items/);
  assert.match(sql, /create unique index if not exists financial_entries_source_unique_idx/);
  assert.match(sql, /source_type = 'tithe_sheet'/);
  assert.match(sql, /create or replace function public\.save_tithe_sheet/);
  assert.match(sql, /count\(distinct item\.tither_id\).*tither_count/s);
  assert.match(sql, /coalesce\(sum\(item\.amount\), 0\).*tithe_total/s);
  assert.doesNotMatch(sql.slice(sql.indexOf('create function public.list_public_reports()')), /tither\.full_name/);
  assert.match(app, /data-tither-amount/);
  assert.match(app, /backend\.saveTitheSheet/);
  assert.match(app, /sourceType==='tithe_sheet'/);
});

test('usuários são administrados por função segura e senha temporária não vai ao frontend', () => {
  const api = read('api/admin-users.mjs');
  const app = read('app/scripts/app.js');
  const supabaseClient = read('app/scripts/services/supabase.js');

  assert.match(api, /process\.env\.SUPABASE_SECRET_KEY/);
  assert.match(api, /auth\.admin\.createUser/);
  assert.match(api, /temporaryPassword\(\)/);
  assert.match(api, /must_change_password: true/);
  assert.match(api, /action === 'change-own-password'/);
  assert.match(app, /temporary-password-modal/);
  assert.match(app, /change-password-modal/);
  assert.doesNotMatch(supabaseClient, /SUPABASE_SECRET_KEY|service_role|sb_secret_/);
  assert.doesNotMatch(app, /SUPABASE_SECRET_KEY|service_role|sb_secret_/);
});

test('cargos viram assinaturas congeladas e relatório assinado só é publicado por ação explícita', () => {
  const sql = read('supabase/migrations/20260723_relatorio_mensal_dizimos_usuarios_assinados.sql');
  const app = read('app/scripts/app.js');
  const mainCss = read('app/styles/main.css');

  assert.match(sql, /create table if not exists public\.church_positions/);
  assert.match(sql, /'primeiro_tesoureiro'/);
  assert.match(sql, /'conselho_fiscal_3'/);
  assert.match(app, /signatories:cachedPositions\.map/);
  assert.match(app, /class="report-signatures"/);
  assert.match(mainCss, /\.report-signatures\{/);
  assert.match(mainCss, /grid-template-columns:minmax\(0,1fr\) 30px minmax\(0,1fr\) 30px minmax\(0,1fr\) 30px minmax\(0,1fr\) 30px minmax\(0,1\.2fr\)/);
  assert.match(mainCss, /\.tithe-report-table th:nth-child\(2\)/);
  assert.match(sql, /create table if not exists public\.signed_reports/);
  assert.match(sql, /status text not null default 'rascunho'/);
  assert.match(app, /data-publish-signed/);
  assert.match(app, /backend\.publishSignedReport/);
  assert.match(app, /data-download-signed-public/);
});
