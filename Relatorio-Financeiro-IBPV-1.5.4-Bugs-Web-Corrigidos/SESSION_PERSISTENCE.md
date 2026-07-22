# Persistência da sessão no frontend web

Data: 21/07/2026

## Resultado

O frontend agora consulta a sessão persistida do Supabase antes de exibir a landing page. Quando existe uma sessão válida, o perfil correspondente é carregado de `public.profiles`, o nome e a função são restaurados e a área permitida ao usuário é aberta automaticamente.

O logotipo inicial existente passou a funcionar como estado de carregamento durante essa verificação. Nenhum elemento visual novo foi criado.

## Fluxo implementado

1. O cliente Supabase mantém `persistSession`, `autoRefreshToken` e `detectSessionInUrl` habilitados.
2. A inicialização aguarda `supabase.auth.getSession()`.
3. Havendo sessão, o frontend consulta `public.profiles` pelo identificador do usuário.
4. Perfis administrativos abrem `admin-dashboard`; o perfil `membro` mantém acesso apenas ao portal de membros.
5. A tela inicial só é liberada depois da conclusão dessa verificação.
6. `supabase.auth.onAuthStateChange()` acompanha login, logout, atualização do usuário e renovação do token.
7. O logout remove a sessão no Supabase, limpa o usuário atual e retorna à seleção de acesso.

## Arquivos alterados

- `app/scripts/app.js`: restauração inicial, roteamento autenticado, atualização de perfil e logout.
- `app/scripts/services/backend.js`: assinatura de mudanças do Auth e leitura do perfil usando uma sessão já obtida.
- `app/vendor/bootstrap.js`: controle explícito da tela de carregamento.
- `app/scripts/ui-core.js`: respeita a verificação de sessão antes de liberar a interface.
- `app/scripts/motion.js`: aguarda o evento de sessão pronta.
- `app/styles/premium.css`: remove o encerramento automático da tela de carregamento antes da verificação.
- `tests/session-persistence.test.mjs`: testes automatizados do contrato de persistência.
- `web-dist/`: build web regenerado.

`app/scripts/services/supabase.js` foi verificado e já continha as três opções solicitadas; portanto, não precisou ser alterado.

## Itens preservados

- HTML e estrutura visual;
- estilos e aparência existentes;
- funções de entradas e despesas;
- tabelas e políticas do banco de dados;
- lógica de anexos, relatórios, PDF e PowerPoint.

## Validação executada

- verificação sintática dos seis arquivos JavaScript envolvidos;
- quatro testes automatizados aprovados;
- build Vite de produção concluído com sucesso;
- 52 módulos transformados e artefatos web gerados.

Com uma sessão Supabase válida armazenada pelo navegador, o fluxo cobre recarregar com F5, fechar e abrir a aba e fechar e abrir o navegador. A duração efetiva da sessão continua obedecendo às configurações do projeto Supabase e à renovação automática do token.
