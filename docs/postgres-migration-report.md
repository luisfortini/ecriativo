# Relatorio de Migracao SQLite -> PostgreSQL

## Escopo

A persistencia da aplicacao foi migrada para PostgreSQL 16+. O driver runtime passou de `better-sqlite3` para `pg`, com pool de conexoes, migrations versionadas e services/controllers assíncronos.

## Tabelas mapeadas

- `clients`: PK `id`; memoria da marca em `brand_memory_summary`; campos longos em `TEXT`; datas em `TIMESTAMPTZ`.
- `brands`: PK `id`; FK `client_id -> clients(id)` com cascade.
- `campaigns`: PK `id`; FK `client_id -> clients(id)`; JSONs historicos como `TEXT`; datas em `TIMESTAMPTZ`.
- `client_assets`: PK `id`; FK `client_id -> clients(id)` com cascade; JSONs de analise como `TEXT`.
- `client_brand_analysis`: PK `id`; FK `client_id -> clients(id)` com cascade; textos extraidos e JSON bruto como `TEXT`.
- `agents`: PK `id`; `key` unico; `is_active BOOLEAN`; schemas e prompts em `TEXT`.
- `agent_versions`: PK `id`; FK `agent_id -> agents(id)` com cascade.
- `agent_execution_logs`: PK `id`; FKs para `agents`, `clients`, `campaigns`; tokens e latencia numericos; input/output em `TEXT`.
- `app_settings`: PK `key`.
- `campaign_plans`: PK `id`; datas de periodo mantidas como `TEXT` por compatibilidade com a UI; timestamps em `TIMESTAMPTZ`.
- `campaign_plan_clients`: PK `id`; FKs para planos/clientes com cascade.
- `campaign_generation_queue`: PK `id`; FKs para planos/clientes/campanhas; agendamento em `TIMESTAMPTZ`.
- `campaign_generation_logs`: PK `id`; FKs para fila/plano/cliente.
- `ai_model_prices`: PK `id`; `model` unico; precos `DOUBLE PRECISION`; `active BOOLEAN`.
- `ai_usage_logs`: PK `id`; FKs opcionais para cliente/campanha/plano/fila/agente; custos `DOUBLE PRECISION`.
- `notification_settings`: PK `id`; unique `(scope_type, scope_id, channel)` e indice unico parcial para configuracao global.
- `notification_logs`: PK `id`; FKs opcionais; status e payloads em `TEXT`.

## Indices criados

Foram adicionados indices para os campos de maior uso operacional:

- `organization_id`, quando presente em `clients`.
- `client_id`, `campaign_id`, `campaign_plan_id`, `queue_id`, `agent_id`.
- `status` e `created_at`.
- Indices especificos para fila por `status/scheduled_at`, logs de agentes, logs de IA, notificacoes e assets.

## Compatibilidade

- `AUTOINCREMENT` foi substituido por `BIGSERIAL`.
- `DATETIME`/`datetime('now')` foram substituidos por `TIMESTAMPTZ` e `CURRENT_TIMESTAMP`.
- Booleanos historicos `0/1` foram convertidos para `BOOLEAN` nas tabelas novas.
- Campos JSON continuam como `TEXT` para preservar comportamento atual e evitar alterar contratos da aplicacao.
- O adaptador de banco aceita parametros posicionais `?` e nomeados `@campo`, convertendo para `$1`, `$2` do PostgreSQL.
- As operacoes dos services/controllers agora sao assíncronas.

## Pontos SQLite removidos do runtime

- Removido uso de `db.prepare`, `.get`, `.all`, `.run` no runtime.
- Removido uso de `PRAGMA`, `sqlite_master`, `datetime()` e `INSERT OR IGNORE` nas migrations runtime.
- `better-sqlite3` ficou apenas como dependencia de desenvolvimento para o script pontual `migrate-sqlite-to-postgres`.

## Migração de dados

Comando:

```bash
npm run migrate-sqlite-to-postgres
```

O script:

1. Executa migrations PostgreSQL.
2. Le o SQLite atual.
3. Importa tabelas em ordem de dependencia.
4. Preserva IDs e atualiza sequencias.
5. Converte booleanos de `0/1` para `true/false`.
6. Valida contagens por tabela e imprime relatorio JSON.

Variaveis:

- `DATABASE_URL`: destino PostgreSQL.
- `SQLITE_DATABASE_PATH`: origem SQLite, default `backend/data/criativopro.sqlite`.
- `RESET_POSTGRES=true`: limpa tabelas antes de importar.

## Riscos e validacoes pendentes

- A validacao real contra PostgreSQL nao foi executada neste ambiente porque o comando `docker` nao esta disponivel.
- `pg_dump` e `pg_restore` precisam estar instalados no ambiente para `backup-db` e `restore-db`.
- Como os campos JSON continuam em `TEXT`, consultas JSON nativas do PostgreSQL nao foram introduzidas nesta etapa para manter comportamento.

## Checklist de validacao funcional

- `npm run typecheck`: aprovado.
- `npm run build`: aprovado.
- Validar em ambiente com PostgreSQL:
  - Login futuro/autenticacao.
  - Campanhas.
  - Geracao de imagens.
  - Agentes.
  - Custos de IA.
  - WhatsApp/notificacoes.
  - Fila e planejador.
  - `GET /health/database`.
  - Comparacao de contagens SQLite vs PostgreSQL no relatorio do migrador.
