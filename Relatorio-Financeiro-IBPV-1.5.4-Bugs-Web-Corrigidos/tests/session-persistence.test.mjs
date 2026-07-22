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
  const start = source.indexOf('async function bootstrapApplication()');
  const finish = source.indexOf('function aggregateByMonth', start);
  assert.ok(start >= 0 && finish > start, 'fluxo de inicialização não encontrado');
  const initialization = source.slice(start, finish);
  const getSessionAt = initialization.indexOf('await backend.session()');
  const restoreAt = initialization.indexOf('await restoreAuthenticatedSession(session');
  const listenerAt = initialization.indexOf('registerAuthStateListener()');
  const releaseAt = initialization.indexOf('window.IBPVSessionGate?.release()');
  assert.ok(getSessionAt >= 0, 'getSession não é aguardado');
  assert.ok(restoreAt > getSessionAt, 'perfil não é restaurado depois da sessão');
  assert.ok(listenerAt > getSessionAt, 'listener foi registrado antes da verificação da sessão');
  assert.ok(releaseAt > restoreAt, 'interface é liberada antes da restauração');
  assert.doesNotMatch(initialization, /enterFlowMode\('welcome'/);
  assert.match(source, /bootstrapApplication\(\);/);
  assert.doesNotMatch(source, /initializeAuthenticatedSession/);
});

test('listener de autenticação trata cada evento sem conflito de navegação', () => {
  const source = read('app/scripts/app.js');
  const start = source.indexOf('function handleAuthStateChange(event,session)');
  const finish = source.indexOf('function registerAuthStateListener()', start);
  const listener = source.slice(start, finish);
  assert.match(listener, /event==='TOKEN_REFRESHED'\)return/);
  assert.match(listener, /event==='SIGNED_OUT'/);
  assert.match(listener, /event==='INITIAL_SESSION'\|\|event==='SIGNED_IN'/);
  assert.match(listener, /restoreAuthenticatedSession\(session/);

  const registrationStart = source.indexOf('function registerAuthStateListener()');
  const registrationEnd = source.indexOf('async function bootstrapApplication()', registrationStart);
  const registration = source.slice(registrationStart, registrationEnd);
  assert.match(registration, /if\(authListenerRegistered\)return/);
  assert.match(registration, /unsubscribeAuthState\(\)/);
  assert.match(registration, /backend\.onAuthStateChange/);
});

test('rotinas visuais não reapresentam a landing page sobre a área autenticada', () => {
  assert.match(read('app/scripts/ui-core.js'), /body\.classList\.contains\('app-page'\)\) return/);
  assert.match(read('app/vendor/bootstrap.js'), /!body\?\.classList\.contains\('app-page'\)/);
  assert.match(read('app/scripts/motion.js'), /!document\.body\.classList\.contains\('app-page'\)/);
});

test('tela de carregamento só é liberada explicitamente', () => {
  const source = read('app/vendor/bootstrap.js');
  const classes = () => ({ values: new Set(), add(...names) { names.forEach(name => this.values.add(name)); }, remove() {}, contains(name) { return this.values.has(name); } });
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
