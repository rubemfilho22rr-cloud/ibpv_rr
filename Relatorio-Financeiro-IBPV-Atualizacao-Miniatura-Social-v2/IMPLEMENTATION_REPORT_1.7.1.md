# Relatório Financeiro IBPV — Atualização de manutenção pós-1.7.0

## Alterações realizadas

- A página inicial abre diretamente na escolha entre Portal de Transparência e Área Administrativa.
- As duas telas de boas-vindas e seus botões de continuidade foram removidos.
- O formulário de login limpa a senha antes da autenticação continuar e a limpa novamente ao finalizar a tentativa ou sair do portal.
- O relatório financeiro impresso não mostra mais o versículo de 1 Coríntios 14:40.
- A impressão A4 permite que tabelas longas continuem em uma segunda folha, sem dividir uma linha de lançamento.
- O bloco de assinaturas permanece inteiro, fica compacto para evitar uma segunda folha desnecessária e usa nomes em negrito.
- Foram reforçados os cabeçalhos HTTP: CSP, proteção contra enquadramento, HSTS, política de permissões, tipo de conteúdo e referências.

## Arquivos alterados

- `app/index.html`
- `app/scripts/app.js`
- `app/scripts/motion.js`
- `app/scripts/ui-core.js`
- `app/styles/main.css`
- `app/styles/stable-ui.css`
- `vercel.json`
- `package.json`

## Validação

- `pnpm run build:web`: concluído com sucesso.
- `pnpm test`: 19 testes aprovados.

## Teste manual recomendado após publicar

1. Abrir a página inicial e confirmar que a escolha de acesso aparece diretamente.
2. Entrar na área administrativa e verificar, em F12, que o campo de senha está vazio após o login.
3. Imprimir um relatório curto e confirmar uma página A4.
4. Imprimir um relatório com muitos lançamentos e confirmar que as assinaturas aparecem completas na última página.
