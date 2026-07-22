# Relatório Financeiro IBPV 1.6.0

## Antes de publicar

1. Abra o Supabase e entre em **SQL Editor → New query**.
2. No código-fonte, abra `supabase/migrations/20260722_portal_transparencia_atividades.sql`.
3. Cole todo o conteúdo no SQL Editor e clique em **Run** uma única vez.
4. Na Vercel, confirme as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. Faça um novo deploy.

A migração é aditiva e repetível: não apaga lançamentos e não recria as tabelas financeiras.

## Teste rápido depois do deploy

- percorra os três botões **Continuar** e confirme que não aparece painel branco;
- entre no **Portal de Transparência** somente com um nome;
- faça F5 e confirme que a identificação continua na mesma aba;
- entre como administrador e abra **Histórico de atividades**;
- salve uma entrada e confira o horário de salvamento na nuvem;
- abra a pré-visualização e teste **Imprimir / Salvar como PDF**.

## Segurança

O visitante não é um usuário autenticado. O nome é apenas informado pela pessoa e não comprova sua identidade. Nenhuma chave secreta foi incluída no código-fonte.

O Electron permanece com sandbox, isolamento de contexto, integração Node desativada e segurança web. Neste computador de desenvolvimento, o Windows recusou iniciar o renderizador sandboxed com código 49/`0x80000003`; por segurança, `--no-sandbox` não foi incorporado. Consulte `IMPLEMENTATION_REPORT_1.6.0.md` para o diagnóstico completo.
