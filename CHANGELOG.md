# Changelog

## 1.6.0 - Portal de Transparência e histórico

- Removido o painel branco indevido na transição final da apresentação.
- Área pública renomeada para Portal de Transparência, com identificação somente por nome e sem usuário Supabase Auth.
- Sessão de visitante restaurada após F5 na mesma aba e encerramento por botão próprio.
- Relatórios públicos expostos somente quando publicados, por RPCs controladas.
- Histórico imutável de atividades com filtros, detalhes, atores e resultados.
- Auditoria financeira e de anexos registrada por gatilhos no banco.
- Status de nuvem atualizado somente após confirmação real do Supabase.
- Caminho da logo transformado pelo build para Web, Vercel e Electron.
- Impressão A4 usa a pré-visualização atual, espera fontes/imagens com limite seguro e restaura a interface no final.
- Adicionados testes automatizados para sessão, Portal, histórico, nuvem, logo e impressão.
- Electron atualizado para 37.3.1, mantendo sandbox, isolamento de contexto, integração Node desativada e segurança web.

## 1.5.4 - Inicialização destravada

- A tela de entrada é liberada por um inicializador independente dos demais módulos.
- Falhas de internet, Supabase ou PowerPoint não conseguem mais prender a cortina inicial.
- O gerador de PowerPoint voltou a ser carregado como biblioteca de navegador, sem interferir no código principal.
- A versão aparece no título da janela para facilitar a confirmação do arquivo aberto.

## 1.5.3 - Correção de carregamento e estabilidade

- Substituído o protocolo interno por um servidor local restrito ao próprio computador.
- Corrigida a regra de navegação que podia bloquear a página inicial.
- Isolado o cache das versões anteriores para evitar configurações antigas corrompidas.
- Artefatos renomeados com `CORRIGIDO` para não serem confundidos com as versões anteriores.

## 1.5.2 - Restauração completa da interface

- Corrigido carregamento de CSS, imagens e JavaScript no protocolo interno.
- Adicionados tipos de conteúdo corretos para todos os recursos visuais.
- Mantida a integração Supabase e a interface original.

## 1.5.1 - Correção da abertura no Electron

- Frontend carregado pelo protocolo seguro `app://` para permitir módulos JavaScript.
- Cortina inicial recebe uma liberação de segurança após a inicialização.
- Título da janela atualizado para a versão online.

## 1.5.0 - Web, Electron e Supabase

- Build compartilhado para Vercel e Windows.
- Autenticação, perfis e lançamentos integrados ao Supabase.
- Comprovantes em Storage privado e relatórios publicados online.
- Configuração por variáveis de ambiente e documentação de implantação.

## 1.4 — Base estável

- correção do desfoque permanente;
- reorganização das animações;
- blur restrito ao fundo dos modais;
- proteção contra transições interrompidas;
- manutenção do sistema de anexos;
- manutenção dos períodos dinâmicos;
- manutenção da geração de PDF e PowerPoint.

Os arquivos históricos de atualização permanecem dentro de `app/`.
