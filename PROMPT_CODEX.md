# Tarefa principal — Relatório Financeiro IBPV

Trabalhe diretamente neste projeto e entregue um aplicativo Windows instalável completo.

## Resultado obrigatório

Gere e teste um instalador final chamado, preferencialmente:

`Relatorio Financeiro IBPV Setup.exe`

O usuário não deve precisar instalar Node.js, abrir arquivos `.bat` ou executar comandos para usar o programa. O instalador deve funcionar como um aplicativo Windows normal.

## Requisitos do instalador

- Aplicativo para Windows 10 e Windows 11, 64 bits.
- Instalador NSIS em `.exe`.
- Atalho opcional na Área de Trabalho.
- Atalho no Menu Iniciar.
- Entrada em “Aplicativos instalados” do Windows.
- Desinstalador funcional.
- Nome exibido: **Relatório Financeiro IBPV**.
- Empresa/autor: **Igreja Batista Palavra da Vida**.
- Ícone: `app/assets/logo-ibpv.ico`.
- Dados do usuário preservados entre atualizações e reinstalações, sempre que tecnicamente possível.
- Não apagar IndexedDB, LocalStorage ou anexos em atualizações normais.
- Não exigir conexão com a internet para abrir e usar o aplicativo depois de instalado.

## Trabalho técnico

1. Revise a estrutura Electron existente.
2. Crie um `preload.js` seguro, caso seja necessário.
3. Mantenha `contextIsolation: true` e `nodeIntegration: false`.
4. Bloqueie navegação externa inesperada e abertura arbitrária de novas janelas.
5. Corrija caminhos locais de CSS, JavaScript, imagens, PDF e PowerPoint.
6. Confirme que IndexedDB e LocalStorage funcionam no aplicativo empacotado.
7. Confirme que anexos continuam sendo salvos e recuperados.
8. Confirme que a geração e o download de PDF e PowerPoint funcionam dentro do Electron.
9. Faça o salvamento de arquivos abrir uma caixa de diálogo adequada do Windows quando necessário.
10. Corrija qualquer bug de blur, modal, navegação, animação ou tela em branco.
11. Remova dependências ou arquivos obsoletos somente depois de confirmar que não são usados.
12. Execute os testes essenciais descritos em `TEST_PLAN.md`.
13. Gere o instalador na pasta `dist`.

## Não entregar apenas código

A tarefa só estará concluída quando houver um `.exe` instalável em `dist` e ele tiver sido aberto e testado no Windows.

## Funcionalidades que devem ser preservadas

- Tela inicial e escolha de perfil.
- Área de membros.
- Área de tesouraria/conselho fiscal.
- Login e usuários.
- Relatórios financeiros.
- Periodicidades mensal, bimestral, trimestral, quadrimestral, semestral e anual.
- Entradas, saídas e resumo.
- Anexos múltiplos por lançamento.
- Documentos gerais do relatório.
- Armazenamento local em IndexedDB.
- Visualização e geração de PDF.
- Geração de PowerPoint.
- Publicação e consulta de relatórios.
- Animações modernas, sem desfoque permanente.
- Identidade visual e logotipo da igreja.

## Prioridade de execução

1. Fazer o aplicativo abrir sem erros.
2. Garantir persistência dos dados.
3. Garantir PDF, PowerPoint e anexos.
4. Gerar e testar o instalador.
5. Melhorar arquitetura sem alterar o comportamento aprovado.

## Entrega final esperada

- `dist/Relatorio Financeiro IBPV Setup.exe`
- Código-fonte atualizado.
- `BUILD_REPORT.md` informando:
  - alterações realizadas;
  - testes executados;
  - localização exata do instalador;
  - limitações ainda existentes, caso haja.
