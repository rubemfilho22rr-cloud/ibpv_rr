# Relatório de implementação — versão 1.7.0

Data: 23/07/2026

## Resultado

A versão 1.7.0 mantém a identidade visual, o Portal de Transparência, a persistência de sessão e os lançamentos existentes. Foram adicionados os fluxos mensais, relação privada de dizimistas, saldo automático, assinaturas, relatórios assinados e administração segura de usuários.

## Funcionalidades implementadas

- seleção de mês e ano em entradas e despesas;
- categoria obrigatória e exibida no relatório;
- cálculo: saldo anterior + entradas = total disponível − despesas = saldo para o próximo mês;
- aproveitamento automático do saldo do relatório anterior;
- correção manual do saldo anterior quando necessário;
- cadastro reutilizável de dizimistas;
- relação mensal nominal para a equipe financeira;
- uma única entrada automática de Dízimos vinculada à relação mensal;
- resumo público de dízimos com somente quantidade e total;
- cargos de Primeiro Tesoureiro, Segundo Tesoureiro e Conselho Fiscal 1, 2 e 3;
- nomes e cargos congelados no instantâneo de cada relatório publicado;
- área de Relatórios assinados com envio, revisão e publicação;
- administração de contas, permissões, cargos e status;
- senha temporária mostrada uma única vez;
- troca obrigatória de senha no primeiro acesso;
- auditoria das novas operações.

## Arquivos principais alterados

- `app/index.html`: novos campos, menus e janelas de dízimos, assinados, usuários e senha.
- `app/scripts/app.js`: fluxos mensais, cálculos, telas, permissões, relatórios e Portal.
- `app/scripts/services/backend.js`: integração com tabelas, RPCs, Storage e função administrativa.
- `app/styles/main.css`: estilos das novas áreas.
- `app/styles/print-report.css`: resumo financeiro, assinaturas e relação interna.
- `api/admin-users.mjs`: função segura para criar e administrar contas.
- `.env.example`: variáveis públicas e variáveis exclusivas do servidor.
- `supabase/migrations/20260723_relatorio_mensal_dizimos_usuarios_assinados.sql`: banco, RLS, RPCs, auditoria e Storage.
- `tests/v1-7-monthly-tithes-users.test.mjs`: verificações automatizadas da versão.
- `README.md`, `CHANGELOG.md` e `package.json`: documentação e versão.

## Migração do banco

Execute no SQL Editor, depois da migração de 22/07:

`supabase/migrations/20260723_relatorio_mensal_dizimos_usuarios_assinados.sql`

A migração é aditiva e repetível. Ela não apaga lançamentos, relatórios, anexos, usuários nem arquivos existentes.

Ela adiciona:

- colunas de e-mail, senha temporária e último acesso em `profiles`;
- `church_positions`;
- origem automática em `financial_entries`;
- `tithers`, `tithe_sheets` e `tithe_items`;
- `signed_reports`;
- bucket privado `relatorios-assinados`;
- políticas RLS e funções RPC;
- regras públicas limitadas a relatórios publicados e resumo agregado.

## Configuração da Vercel

Além das variáveis públicas já existentes, cadastre na Vercel:

- `SUPABASE_URL`;
- `SUPABASE_SECRET_KEY`.

A chave secreta deve existir somente na Vercel. Não use prefixo `VITE_`, não coloque no GitHub e não salve no frontend.

## Segurança

- nomes e valores individuais de dízimos não são retornados ao visitante;
- visitantes recebem somente quantidade e total agregados;
- criação de usuários acontece no servidor;
- a senha temporária não é salva no frontend nem no banco em texto aberto;
- usuários com senha temporária não acessam dados financeiros antes da troca;
- relatórios assinados ficam privados até publicação explícita;
- logs continuam imutáveis pela interface;
- nenhuma política financeira anterior é removida ou enfraquecida.

## Validações executadas

- validação sintática dos arquivos JavaScript principais;
- 19 testes automatizados aprovados;
- build web de produção concluído;
- logo incluída no build;
- verificação dos menus, campos e estilos das novas áreas;
- inspeção visual da pré-visualização com o novo cálculo em uma única linha;
- inspeção dos cinco espaços de assinatura e da impressão A4 sem estouro lateral;
- confirmação estática de que a chave secreta não é usada no código do navegador.

## Aceitação manual necessária

Depois da migração e das variáveis da Vercel, validar com dados de teste:

1. criar um usuário com senha temporária e concluir o primeiro acesso;
2. atribuir cargos e gerar um relatório com assinaturas;
3. cadastrar dizimistas e salvar uma relação mensal;
4. confirmar a criação de uma única entrada de Dízimos;
5. publicar o relatório e verificar o resumo público;
6. enviar e publicar um PDF assinado;
7. testar o fechamento do mês e a abertura automática do saldo seguinte.
