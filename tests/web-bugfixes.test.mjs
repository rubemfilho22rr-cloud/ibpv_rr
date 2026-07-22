import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('impressão usa a pré-visualização atual sem abrir about:blank', () => {
  const source = read('app/scripts/app.js');
  const start = source.indexOf('async function printReport()');
  const finish = source.indexOf("document.getElementById('print-report')", start);
  assert.ok(start >= 0 && finish > start, 'função de impressão não encontrada');
  const printFunction = source.slice(start, finish);

  assert.match(printFunction, /#preview-content \.report-document/);
  assert.match(printFunction, /document\.fonts\?\.ready/);
  assert.match(printFunction, /waitForReportImages\(source\)/);
  assert.match(printFunction, /window\.print\(\)/);
  assert.doesNotMatch(printFunction, /window\.open|about:blank|document\.write|printWindow/);
});

test('folha impressa é A4 e mantém a logo proporcional', () => {
  const css = read('app/styles/stable-ui.css');
  assert.match(css, /@page\s*{[\s\S]*?size:\s*A4 portrait;[\s\S]*?margin:\s*12mm;/);
  assert.match(css, /body\.is-printing-report \.report-brand-logo\s*{[\s\S]*?width:\s*140px !important;[\s\S]*?max-width:\s*140px !important;[\s\S]*?max-height:\s*90px !important;[\s\S]*?height:\s*auto !important;[\s\S]*?object-fit:\s*contain !important;/);
  assert.doesNotMatch(css, /@media\s+print[\s\S]*?\bimg\s*{[\s\S]*?width:\s*100%/);
});

test('salvamento online informa o horário confirmado', () => {
  const source = read('app/scripts/app.js');
  const saveAt = source.indexOf('item.id=await backend.saveEntry');
  const messageAt = source.indexOf('Salvo na nuvem às', saveAt);
  assert.ok(saveAt >= 0 && messageAt > saveAt, 'confirmação não ocorre depois do salvamento no Supabase');
  assert.match(source.slice(messageAt, messageAt + 180), /toLocaleTimeString\('pt-BR'\)/);
});
