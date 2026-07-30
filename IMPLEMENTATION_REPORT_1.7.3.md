# Relatório Financeiro IBPV — correção 1.7.3

## Alteração

- Removida a sequência de sublinhados usada como nome provisório nos cargos de assinatura sem usuário vinculado.
- Cada responsável agora apresenta somente a linha longa destinada à assinatura.
- Quando houver um usuário vinculado ao cargo, o nome permanece exibido em negrito abaixo da linha.
- Adicionado um espaço vertical de 10 mm entre o quadro de totais e o bloco de assinaturas.
- Cada campo de assinatura passou a reservar 14 mm de altura, com 5 mm entre as fileiras.

## Arquivos alterados

- `app/scripts/app.js`
- `tests/print-a4-layout.test.mjs`
- `package.json`
- `app/index.html`
- `app/styles/stable-ui.css`
- `CHANGELOG.md`

## Validação

- Testes automatizados do projeto.
- Build da versão web.
