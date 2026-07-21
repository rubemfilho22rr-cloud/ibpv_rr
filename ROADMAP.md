# Roadmap sugerido

## Etapa 1 — Entrega instalável

- estabilizar Electron;
- corrigir downloads e salvamentos;
- validar IndexedDB;
- gerar instalador NSIS;
- testar instalação, uso e desinstalação.

## Etapa 2 — Qualidade

- logs locais de erro;
- rotina de backup e restauração;
- validação de dados;
- testes automatizados das funções financeiras;
- assinatura digital do instalador, quando houver certificado.

## Etapa 3 — Arquitetura

- separar `app.js` em módulos;
- centralizar estado da aplicação;
- padronizar componentes e modais;
- criar camada única de persistência;
- criar serviço único para PDF e PowerPoint.

## Etapa 4 — Recursos futuros

- atualização automática opcional;
- sincronização online opcional;
- contas com níveis de permissão mais robustos;
- trilha de auditoria;
- exportação e importação de backup criptografado.
