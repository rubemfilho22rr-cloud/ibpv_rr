import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('cliente Supabase mantém e renova a sessão', () => {
  const source = read('app/scripts/services/supabase.js');
  assert.match(source, /persistSession:\s*true/);
  assert.match(source, /autoRefreshToken:\s*true/);
  assert.match(source, /detectSessionInUrl:\s*true/);
});

test('backend expõe getSession, perfil da sessão e onAuthStateChange', () => {
  const source = read('app/scripts/services/backend.js');
  assert.match(source, /supabase\.auth\.getSession\(\)/);
  assert.match(source, /supabase\.auth\.onAuthStateChange\(callback\)/);
  assert.match(source, /async currentUser\(existingSession = null\)/);
  assert.match(source, /this\.profile\(session\.user\.id\)/);
});

test('inicialização aguarda sessão e perfil antes de liberar a interface', () => {
  const source = read('app/scripts/app.js');
  const start = source.indexOf('async function initializeAuthenticatedSession()');
  const finish = source.indexOf("window.addEventListener('beforeunload'", start);
  assert.ok(start >= 0 && finish > start, 'fluxo de inicialização não encontrado');
  const initialization = source.slice(start, finish);
  const getSessionAt = initialization.indexOf('await backend.session()');
  const restoreAt = initialization.indexOf('await restoreAuthenticatedSession(session');
  const releaseAt = initialization.indexOf('window.IBPVSessionGate?.release()');
  assert.ok(getSessionAt >= 0, 'getSession não é aguardado');
  assert.ok(restoreAt > getSessionAt, 'perfil não é restaurado depois da sessão');
  assert.ok(releaseAt > restoreAt, 'interface é liberada antes da restauração');
  assert.match(initialization, /backend\.onAuthStateChange/);
});

test('tela de carregamento só é liberada explicitamente', () => {
  const source = read('app/vendor/bootstrap.js');
  const classes = () => ({ values: new Set(), add(...names) { names.forEach(name => this.values.add(name)); }, remove() {} });
  const curtain = { classList: classes() };
  const welcome = { classList: classes() };
  const body = { classList: classes() };
  const html = { classList: classes() };
  const events = [];
  const window = { dispatchEvent: event => events.push(event.type) };
  const document = {
    body,
    documentElement: html,
    getElementById: id => id === 'intro-curtain' ? curtain : null,
    querySelector: selector => selector === '[data-screen="welcome"]' ? welcome : null
  };
  class CustomEvent { constructor(type) { this.type = type; } }
  vm.runInNewContext(source, { window, document, CustomEvent });
  assert.equal(window.IBPVSessionGate.isReady(), false);
  assert.equal(curtain.classList.values.has('is-gone'), false);
  window.IBPVSessionGate.release();
  assert.equal(window.IBPVSessionGate.isReady(), true);
  assert.equal(curtain.classList.values.has('is-gone'), true);
  assert.deepEqual(events, ['ibpv-session-ready']);
});
