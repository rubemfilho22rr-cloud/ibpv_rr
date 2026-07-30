# Relatório de compilação

Data: 21/07/2026

## Resultado

- Instalador NSIS x64 gerado com sucesso.
- Versão portátil x64 gerada com sucesso.
- Aplicativo compatível com Windows 10 e Windows 11 de 64 bits.

## Correções realizadas

- Adicionado `preload.js` mínimo e seguro.
- Mantidos `contextIsolation`, `sandbox` e `webSecurity` ativos.
- Mantido `nodeIntegration` desativado.
- Bloqueadas navegações externas inesperadas.
- Links HTTP/HTTPS são encaminhados ao navegador padrão.
- Permitidas somente janelas internas necessárias à impressão e à visualização de anexos Blob.
- Adicionada escolha de local do Windows para downloads de anexos e PowerPoint.
- Adicionada Content Security Policy ao frontend.
- Configurado o instalador para preservar os dados do aplicativo na desinstalação.
- Separados os nomes dos artefatos Setup e Portable para impedir sobrescrita.
- Ajustada a configuração de build para o ambiente Windows utilizado.

## Testes executados

- Validação sintática de todos os arquivos JavaScript principais.
- Validação do `package.json`.
- Inicialização da aplicação em modo Electron de desenvolvimento.
- Inicialização e resposta da versão portátil compilada.
- Instalação silenciosa do Setup em diretório de teste.
- Inicialização e resposta da aplicação instalada.
- Execução bem-sucedida do desinstalador.

## Artefatos

- `Relatorio Financeiro IBPV Setup 1.4.0 x64.exe`
- `Relatorio Financeiro IBPV Portable 1.4.0 x64.exe`

## Limitações conhecidas

- Os executáveis não possuem certificado comercial de assinatura de código; o Windows SmartScreen pode exibir um aviso.
- PDF, PowerPoint, persistência com dados reais e todos os fluxos de interface ainda exigem uma rodada completa de aceitação manual com dados da igreja.
- Para evitar uma limitação de privilégios de links simbólicos durante a compilação, a edição de metadados do executável pelo `electron-builder` foi desativada. O ícone continua configurado para o instalador e para a janela do aplicativo.
