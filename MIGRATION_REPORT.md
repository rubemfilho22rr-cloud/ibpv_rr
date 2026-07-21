# Relatório de migração Web + Electron + Supabase

Data: 21/07/2026

## Correção 1.5.1

- Corrigido travamento na tela inicial do Electron causado pelo bloqueio de módulos JavaScript em endereços `file://`.
- O frontend agora é servido internamente pelo protocolo seguro `app://`.
- Adicionada liberação de segurança da cortina inicial e atualizado o título da janela.

## Implementado

- Build web com Vite e saída estática em `web-dist/`.
- Build Windows separado e baseado na mesma saída web.
- Configuração pronta para Vercel.
- Cliente Supabase modular e configurado apenas por variáveis de ambiente.
- Autenticação por e-mail/senha e carregamento de `profiles`.
- Bloqueio de membro na área administrativa e de perfil inativo.
- CRUD remoto de `financial_entries`.
- Consulta de categorias para vinculação dos lançamentos.
- Upload de anexos de lançamentos para `comprovantes-financeiros`.
- Leitura de anexos privados por URL temporária.
- Publicação e listagem de registros em `reports`.
- Modo local mantido para recuperação e transição dos dados 1.4.0.
- CSP atualizada para HTTPS e WebSocket do Supabase.
- Cabeçalhos defensivos para a implantação Vercel.

## Preservado

- HTML, CSS, identidade visual e animações.
- Impressão/PDF pelo navegador.
- geração PowerPoint;
- Setup e versão portátil;
- isolamento e sandbox do Electron;
- diálogo nativo de download no Windows.

## Pendente de aceitação

- Login real em cada papel usando as contas do projeto IBPV.
- RLS para administrador, tesouraria, conselho e membro.
- Upload, abertura e exclusão de comprovantes reais.
- Fluxo completo de publicação e acesso por membro.
- PDF publicado no bucket `relatorios-publicados`.
- Migração opcional dos dados locais existentes para o Supabase.
- Assinatura de código e atualização automática.

## Decisões arquiteturais

O frontend não recebe credenciais administrativas. Criação de usuários continua no painel Supabase até existir uma função de servidor protegida. Atualizações automáticas não foram habilitadas sem assinatura e canal oficial, evitando alertas e risco de distribuição indevida.
