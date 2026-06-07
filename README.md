# e-Criativo

MVP web para gerar anúncios com IA em fluxo de dois agentes:

- Agente Estrategista: estratégia, copy, ângulo, headline, CTA e briefing visual.
- Agente Criativo: transforma o briefing em prompt final de imagem e direção visual.
- Memória por cliente: perfil estratégico, identidade visual, assets, restrições, histórico e aprendizados reutilizados em novas campanhas.

## Stack

- Frontend: React, Vite, TypeScript, TailwindCSS
- Backend: Node.js, Express, TypeScript
- Banco: PostgreSQL 16+
- Integração: OpenAI API

## Instalação

```bash
npm install
copy .env.example backend\.env
```

Configure `DATABASE_URL` em `backend/.env`:

```bash
DATABASE_URL=postgresql://postgres:senha@localhost:5432/criativopro
```

Edite `backend/.env` e informe `OPENAI_API_KEY` para usar a OpenAI. Sem a chave, o sistema roda em modo local de desenvolvimento e salva campanhas com estratégia e imagem placeholder geradas localmente.

## Desenvolvimento

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3333

## Produção local

```bash
npm run build
npm start
```

## Docker

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3333
- PostgreSQL: localhost:5432

O servico `postgres` usa imagem `postgres:16`, volume persistente e healthcheck.

## Migracao de SQLite para PostgreSQL

1. Configure `DATABASE_URL` apontando para o PostgreSQL.
2. Garanta que o SQLite atual esteja em `backend/data/criativopro.sqlite` ou informe `SQLITE_DATABASE_PATH`.
3. Execute:

```bash
npm run migrate-sqlite-to-postgres
```

Para limpar o PostgreSQL antes de importar:

```bash
RESET_POSTGRES=true npm run migrate-sqlite-to-postgres
```

O script preserva IDs, importa tabelas conhecidas e imprime um relatorio JSON com registros migrados, ignorados e erros por tabela.

## Backup e Restore

```bash
npm run backup-db
BACKUP_FILE=backups/postgres-YYYY.dump npm run restore-db
```

Os backups usam `pg_dump --format=custom --compress=9` com timestamp no nome. O restore usa `pg_restore --clean --if-exists`.

## Estrutura

```text
backend/
  src/controllers
  src/routes
  src/services
  src/db
frontend/
  src/components
  src/pages
  src/services
```

## Fluxo com memória

1. Cadastre o cliente em `Clientes`.
2. Complete o Perfil Criativo do Cliente e envie assets como logos, referências, artes aprovadas e reprovadas.
3. Em `Nova campanha`, selecione o cliente e escreva o briefing livre.
4. Campos preenchidos na campanha têm prioridade sobre a memória do cliente.
5. A memória do cliente entra como padrão nos prompts do Agente Estrategista e do Agente Criativo.
6. Na tela de resultado, use as ações de aprendizado para salvar CTAs, estilos, paleta e observações no cliente.

O sistema nunca sobrescreve a memória do cliente automaticamente; os aprendizados só são salvos por ação explícita.

## Central de Agentes

A tela `Central de Agentes` permite editar os agentes `strategist_agent` e `creative_agent` sem alterar código.

- Cada salvamento cria uma nova versão em `agent_versions`.
- A aba de teste executa apenas o agente selecionado e mostra entrada, resposta bruta, JSON parseado e erros de schema.
- O fluxo principal carrega os agentes ativos do banco.
- Execuções são registradas em `agent_execution_logs`.

## Analise de Marca

No Perfil Criativo do Cliente, a aba `Analise de Marca` permite informar site, Instagram, textos manuais e materiais enviados para gerar sugestoes de memoria criativa com o agente `brand_analyzer_agent`.

- Nenhuma sugestao e aplicada automaticamente.
- A tela compara valor atual e sugestao da IA antes de salvar.
- Materiais aprovados alimentam referencias positivas; materiais reprovados alimentam referencias negativas.
- O Instagram e tratado apenas por conteudo publico ou materiais enviados manualmente, sem burlar login, bloqueios ou permissoes.

## Planejador de Campanhas

A tela `Planejador` permite criar campanhas em massa por tema, periodo, clientes, recorrencia e limites de fila.

- A ativacao cria itens em `campaign_generation_queue`.
- O backend processa a fila com `node-cron` a cada minuto.
- O worker respeita concorrencia global, intervalo minimo, limites por dia/hora e tentativas com backoff.
- Para producao, a fila pode ser migrada para BullMQ + Redis.

## Variáveis

- `OPENAI_API_KEY`: chave da OpenAI.
- `OPENAI_TEXT_MODEL`: modelo dos agentes textuais. Default: `gpt-5.4-mini`.
- `OPENAI_IMAGE_MODEL`: modelo de imagem. Default: `gpt-image-2`.
- `DATABASE_URL`: conexao PostgreSQL.
- `SQLITE_DATABASE_PATH`: caminho opcional do SQLite apenas para `npm run migrate-sqlite-to-postgres`.
- `PUBLIC_BASE_URL`: URL pública do backend para arquivos gerados.
- `FRONTEND_ORIGIN`: origem permitida no CORS.
