# Arquitetura do Relatório Financeiro IBPV

## Visão geral

O mesmo frontend em `app/` gera duas distribuições:

```text
app/ -> Vite -> web-dist/ -> Vercel
                         -> Electron -> Setup/Portable Windows
```

As duas distribuições usam o mesmo projeto Supabase para sessão, perfis, lançamentos, relatórios e arquivos privados.

## Camadas

- `app/index.html`, `app/styles/`: interface e identidade visual compartilhadas.
- `app/scripts/app.js`: controlador legado da interface, em modularização progressiva.
- `app/scripts/services/supabase.js`: criação segura do cliente público.
- `app/scripts/services/backend.js`: contrato de autenticação, dados e Storage.
- `electron-main.js` e `preload.js`: adaptação segura para Windows.
- `vite.config.js`: build compartilhado para navegador e Electron.
- `vercel.json`: publicação estática e cabeçalhos de segurança.

## Segurança

O frontend recebe somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. A chave secreta, `service_role` e a senha do banco nunca podem ser adicionadas ao aplicativo, à Vercel ou ao GitHub. O acesso real é limitado pelas políticas RLS do Supabase.

No Electron permanecem ativos `contextIsolation`, `sandbox`, `webSecurity` e `nodeIntegration: false`. O preload expõe apenas a identificação da plataforma.

## Compatibilidade local

Sem variáveis Supabase, o projeto compila em modo local para preservar o acesso aos dados antigos em `localStorage` e IndexedDB. Esse modo não sincroniza dispositivos e não deve ser usado como produção.

## Evolução móvel e atualizações

O contrato em `services/backend.js` pode ser reutilizado por uma futura interface React Native, Flutter ou Capacitor. Não se recomenda empacotar diretamente o frontend desktop como aplicativo móvel sem uma rodada específica de acessibilidade e navegação por toque.

Atualização automática do Windows deve ser implementada futuramente com artefatos assinados e um provedor de releases. Ela não foi ativada antes de existir certificado de assinatura de código e canal oficial de distribuição.
