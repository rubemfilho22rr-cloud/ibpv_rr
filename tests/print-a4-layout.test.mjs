import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../app/scripts/app.js', import.meta.url), 'utf8');
const printStyles = await readFile(new URL('../app/styles/stable-ui.css', import.meta.url), 'utf8');

test('relatório financeiro define colunas que cabem na largura do A4', () => {
  assert.match(appSource, /class="report-col-month"/);
  assert.match(appSource, /class="report-col-description"/);
  assert.match(appSource, /class="report-col-category"/);
  assert.match(appSource, /class="report-col-payment"/);
  assert.match(appSource, /class="report-col-value"/);

  assert.match(printStyles, /table-layout:\s*fixed\s*!important/);
  assert.match(printStyles, /\.report-table\s*\{[\s\S]*?min-width:\s*0\s*!important/);
  assert.match(printStyles, /\.report-table\s*\{[\s\S]*?max-width:\s*100%\s*!important/);
});

test('impressão remove a aplicação oculta do fluxo e evita páginas vazias', () => {
  assert.match(
    printStyles,
    /body\.is-printing-report\s*>\s*\*:not\(#preview-modal\)\s*\{[\s\S]*?display:\s*none\s*!important/
  );
  assert.match(printStyles, /body\.is-printing-report::before[\s\S]*?content:\s*none\s*!important/);
});

test('assinaturas permanecem juntas no fim do fluxo do relatório', () => {
  assert.match(
    printStyles,
    /body\.is-printing-report\s+\.report-signatures\s*\{[\s\S]*?break-before:\s*auto\s*!important/
  );
  assert.match(
    printStyles,
    /body\.is-printing-report\s+\.report-signatures\s*\{[\s\S]*?page-break-before:\s*auto\s*!important/
  );
  assert.match(
    printStyles,
    /body\.is-printing-report\s+\.report-signatures[\s\S]*?break-inside:\s*avoid/
  );
});

test('cargo sem usuário vinculado não cria uma segunda linha de sublinhados', () => {
  assert.doesNotMatch(appSource, /position\.name\|\|'_+'/);
  assert.match(appSource, /signatoryName\?`<strong>/);
});

test('cabeçalho impresso usa período na mesma linha e metadados em duas linhas', () => {
  assert.match(appSource, /class="report-period-inline"/);
  assert.match(
    printStyles,
    /\.report-meta\s*\{[\s\S]*?grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/
  );
  assert.match(
    printStyles,
    /\.report-meta\s*>\s*div:nth-child\(n\s*\+\s*4\)\s*\{[\s\S]*?grid-column:\s*span\s*3/
  );
});
