# Relatório Financeiro IBPV

Aplicativo financeiro da Igreja Batista Palavra da Vida, com uma única interface para Web/Vercel e Electron/Windows.

## Configuração

1. Copie `.env.example` para `.env`.
2. Preencha a URL e a chave publicável do projeto Supabase.
3. Nunca use uma chave `secret`, `service_role` ou a senha do banco.
4. Instale as dependências com `pnpm install`.

Variáveis:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

## Comandos

- `pnpm dev:web`: abre a versão web para desenvolvimento.
- `pnpm build:web`: cria `web-dist/`, a saída da Vercel.
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

## Administração de usuários

Contas são criadas em Supabase Authentication. O papel e o status são definidos em `public.profiles`. O frontend não contém chave administrativa e, portanto, não cria contas diretamente — isso é uma proteção deliberada.

## Limitações atuais

- documentos gerais ainda usam a camada local de compatibilidade;
- relatórios publicados registram totais e período, mas o PDF precisa ser enviado ao bucket em uma etapa posterior;
- a aceitação com dados reais e políticas RLS deve ser realizada antes do uso oficial;
- os executáveis Windows ainda não têm assinatura comercial.

Consulte `MIGRATION_REPORT.md` para detalhes técnicos e de validação.
