# Relatório Financeiro IBPV

Aplicativo financeiro da Igreja Batista Palavra da Vida, com uma única interface para Web/Vercel e Electron/Windows.

## Configuração

1. Copie `.env.example` para `.env`.
2. Preencha a URL e a chave publicável do projeto Supabase.
3. Nunca use uma chave `secret`, `service_role` ou a senha do banco.
4. Instale as dependências com `pnpm install`.
5. Em um projeto Supabase que já possua a estrutura financeira anterior, execute as migrações abaixo, nesta ordem:
   - `supabase/migrations/20260722_portal_transparencia_atividades.sql`;
   - `supabase/migrations/20260723_relatorio_mensal_dizimos_usuarios_assinados.sql`.

Variáveis:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Para a função segura de administração de usuários, cadastre somente na Vercel:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SECRET_KEY=chave_secreta_somente_do_servidor
```

`SUPABASE_SECRET_KEY` nunca pode receber o prefixo `VITE_`, ser colocada no GitHub ou ser enviada ao navegador.

## Comandos

- `pnpm dev:web`: abre a versão web para desenvolvimento.
- `pnpm build:web`: cria `web-dist/`, a saída da Vercel.
- `pnpm test`: valida sessão, Portal, histórico, nuvem, logo e impressão.
- `pnpm start`: compila a web e abre o Electron.
- `pnpm build:windows`: compila a web e gera Setup + Portable x64.
- `pnpm pack`: gera a pasta Windows sem instalador.

## Vercel

Importe o repositório e cadastre as duas variáveis em Settings → Environment Variables. O arquivo `vercel.json` já informa o comando e a pasta de saída. Após cadastrar ou alterar variáveis, faça um novo deploy.

## Fluxos Supabase integrados

- login por e-mail e senha;
- carregamento de perfil e bloqueio de usuário inativo;
- permissão de área administrativa por perfil;
- leitura, criação, edição e exclusão de lançamentos;
- envio de comprovantes ao bucket privado;
- links temporários para visualização de anexos;
- publicação e listagem de relatórios.
- Portal de Transparência sem conta Auth, com identificação por nome e sessão de visitante;
- histórico imutável de atividades administrativas e de visitantes;
- instantâneo seguro dos relatórios publicados;
- status de sincronização baseado no retorno real do Supabase.
- lançamentos mensais com categoria obrigatória;
- saldo anterior automático com correção manual;
- relação privada de dizimistas e resumo público sem nomes;
- entrada de Dízimos sincronizada automaticamente com a relação mensal;
- cargos de assinatura vinculados aos usuários;
- envio e publicação de relatórios assinados;
- criação de usuários com senha temporária e troca obrigatória no primeiro acesso.

## Portal de Transparência e histórico

O nome informado no Portal é apenas uma identificação declarada pelo visitante e não comprova sua identidade. A sessão fica em `sessionStorage`, permanece após F5 na mesma aba e pode ser encerrada em **Sair / trocar identificação**.

Visitantes recebem somente dados de relatórios com status `publicado` por funções RPC controladas. Não existe cadastro em `auth.users`, o bucket continua privado e nenhuma chave administrativa é usada no frontend.

O **Histórico de atividades** é visível somente para os perfis `administrador` e `conselho`. Entradas, despesas, relatórios e anexos são registrados por gatilhos do banco; acessos, visualizações, downloads e impressões usam funções RPC com lista fechada de ações.

## Administração de usuários

Contas são criadas em Supabase Authentication por uma função protegida da Vercel. O administrador informa nome, e-mail, permissão, cargo e status. A senha temporária é mostrada uma única vez e o novo usuário precisa substituí-la no primeiro acesso.

Permissão de acesso e cargo de assinatura são independentes. Por exemplo, uma pessoa pode ter permissão `conselho` e ocupar o cargo `Conselho Fiscal 1`. A troca de diretoria altera apenas o vínculo atual; relatórios já publicados preservam os nomes usados naquela publicação.

## Relação de dizimistas

Os nomes e valores individuais são protegidos pelas políticas RLS e ficam disponíveis somente para administrador, tesouraria e conselho fiscal. Ao salvar a relação de um mês, o banco cria ou atualiza uma única entrada automática na categoria **Dízimos**.

No Portal de Transparência são fornecidos somente a quantidade de dizimistas e o total do período. Nomes e valores individuais não são enviados ao visitante.

## Relatórios assinados

O administrador pode enviar um PDF assinado para determinado mês. O arquivo fica privado enquanto estiver em revisão e só aparece no Portal depois da ação explícita **Publicar no Portal**. Um novo envio para o mesmo mês substitui a versão online anterior.

## Limitações atuais

- documentos gerais ainda usam a camada local de compatibilidade;
- o PDF gerado pelo navegador continua sendo salvo pela opção de impressão; o PDF assinado é enviado manualmente pelo administrador;
- a aceitação com dados reais e políticas RLS deve ser realizada antes do uso oficial;
- os executáveis Windows ainda não têm assinatura comercial.

Consulte `IMPLEMENTATION_REPORT_1.7.0.md` para detalhes técnicos, implantação e validação.
