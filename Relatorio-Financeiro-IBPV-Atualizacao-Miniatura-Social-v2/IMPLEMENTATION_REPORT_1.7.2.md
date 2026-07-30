# Relatório Financeiro IBPV — correção de impressão 1.7.2

## Objetivo

Corrigir exclusivamente o documento impresso/PDF para aproveitar a largura e a altura da folha A4, sem alterar os dados financeiros, o Supabase ou o desenho normal da pré-visualização.

## Alterações

### Isolamento da impressão

- Os elementos da aplicação que ficam atrás do modal são removidos do fluxo durante a impressão.
- Pseudoelementos e fundos da interface não produzem mais folhas vazias.
- Somente o conteúdo real de `#preview-modal` participa da paginação.

### Cabeçalho e informações

- Logo reduzida para `25 mm × 14 mm` no máximo.
- Título e período aparecem na mesma linha.
- Saldo anterior, periodicidade, período, responsável e data de geração ocupam exatamente duas linhas.

### Tabelas

- Cada tabela usa 100% da largura útil da folha A4 e nunca mantém a largura mínima usada no celular.
- Foram definidas cinco colunas proporcionais: mês, descrição, categoria, forma de pagamento/recebimento e valor.
- Textos longos quebram dentro da própria célula.
- Mês e valor permanecem em uma linha.
- Cada lançamento continua inteiro durante uma quebra de página.

### Resumo e assinaturas

- O resumo financeiro foi compactado.
- O bloco de assinaturas permanece indivisível e segue o fluxo normal do relatório.
- Em relatórios curtos, as assinaturas ficam no final da primeira página.
- Em relatórios realmente longos, as assinaturas ficam juntas no final da última página utilizada pelos lançamentos.
- Não existe quebra de página obrigatória antes das assinaturas.

## Arquivos alterados

- `app/scripts/app.js`
- `app/styles/stable-ui.css`
- `tests/print-a4-layout.test.mjs`
- `tests/web-bugfixes.test.mjs`
- `CHANGELOG.md`
- `IMPLEMENTATION_REPORT_1.7.2.md`

## Validação automatizada

- `pnpm test`: 23 testes aprovados.
- `pnpm build:web`: concluído com sucesso.

## Teste visual após publicação

1. Abrir um relatório com poucos lançamentos.
2. Confirmar uma página A4, sem barra horizontal e com assinaturas no final.
3. Abrir um relatório com muitos lançamentos.
4. Confirmar que somente os lançamentos necessários passam para a segunda página.
5. Confirmar que as assinaturas aparecem juntas no final da última página.
6. Confirmar que não existe terceira página vazia.
