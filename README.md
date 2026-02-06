# Odonto SaaS — Backend

Backend API para plataforma SaaS de gestao de clinicas odontologicas. Multi-tenant, com atendimento automatizado via WhatsApp (IA), agendamentos, prontuario digital, odontograma, NPS e faturamento via Stripe.

**Production-ready com LGPD compliance, criptografia end-to-end, cache inteligente, observability completa e auto-scaling.**

## Tech Stack

| Tecnologia | Uso |
|---|---|
| NestJS 10 | Framework HTTP + WebSocket |
| Prisma 5 | ORM + migrations + query monitoring |
| PostgreSQL 16 | Banco de dados + connection pooling |
| Redis 7 | Cache (recomendado para producao) |
| JWT + Passport | Autenticacao + 2FA |
| Stripe | Pagamentos e assinaturas |
| Z-API | Integracao WhatsApp |
| Anthropic / OpenAI / Google | IA para atendimento |
| Nodemailer | Envio de emails (SMTP) |
| Socket.IO | Notificacoes em tempo real |
| BullMQ | Filas de processamento assíncrono |
| Swagger | Documentacao da API |
| Docker | Containerizacao + multi-stage builds |

## Pre-requisitos

- Node.js >= 20
- PostgreSQL 16 (ou Docker)
- Redis 7 (recomendado para producao — cache e filas)
- Conta Z-API (para WhatsApp)
- API Key de IA (Anthropic, OpenAI ou Google)
- Conta Stripe (para faturamento)
- Chave de criptografia (gerada automaticamente em dev, obrigatória em prod)

## Instalacao

```bash
# Clonar repositorio
git clone <repo-url>
cd Odonto_Saas

# Instalar dependencias
npm install

# Copiar variaveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais

# Gerar Prisma Client
npx prisma generate

# Rodar migrations (desenvolvimento)
npx prisma migrate dev

# Iniciar em modo desenvolvimento
npm run start:dev
```

A API estara disponivel em `http://localhost:3000`.
Documentacao Swagger em `http://localhost:3000/api/docs`.

## Variaveis de Ambiente

### Essenciais

| Variavel | Descricao | Obrigatoria |
|---|---|---|
| `DATABASE_URL` | Connection string PostgreSQL | Sim |
| `JWT_SECRET` | Secret para tokens JWT (min 32 chars) | Sim |
| `ENCRYPTION_KEY` | Chave AES-256 para LGPD (64 hex chars) | Sim (prod) |
| `FRONTEND_URL` | URL do frontend | Sim |
| `NODE_ENV` | Ambiente (development/production) | Recomendado |

### Performance & Cache

| Variavel | Descricao | Obrigatoria |
|---|---|---|
| `REDIS_HOST` | Host Redis para cache e filas | Recomendado (prod) |
| `REDIS_PORT` | Porta Redis (padrao: 6379) | Nao |
| `REDIS_PASSWORD` | Senha Redis (se necessario) | Nao |

### Integrações

| Variavel | Descricao | Obrigatoria |
|---|---|---|
| `ANTHROPIC_API_KEY` | API key Anthropic (Claude) | Nao* |
| `Z_API_URL` | URL base da Z-API | Nao* |
| `Z_API_TOKEN` | Token global Z-API | Nao* |
| `SMTP_HOST` | Host SMTP | Nao* |
| `SMTP_PORT` | Porta SMTP | Nao* |
| `SMTP_USER` | Usuario SMTP | Nao* |
| `SMTP_PASS` | Senha SMTP | Nao* |
| `SMTP_FROM` | Remetente padrao | Nao* |
| `GOOGLE_CLIENT_ID` | OAuth Google | Nao |
| `GOOGLE_CLIENT_SECRET` | OAuth Google | Nao |

### Outras

| Variavel | Descricao | Obrigatoria |
|---|---|---|
| `JWT_EXPIRATION` | Duracao do token (ex: "7d") | Nao |
| `PORT` | Porta da API (padrao: 3000) | Nao |
| `CORS_ORIGINS` | Origens permitidas (separadas por virgula) | Nao |

*Necessarias para funcionalidades especificas (IA, WhatsApp, email).

**Gerando ENCRYPTION_KEY:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Docker

### Desenvolvimento
```bash
npm run docker:dev
```
Sobe PostgreSQL + Redis + API com hot-reload.

### Producao
```bash
npm run docker:prod
```
Stack completa com Nginx reverse proxy, limites de recursos e health checks.

## Estrutura de Modulos

| Modulo | Descricao |
|---|---|
| `auth` | Login, registro, 2FA (TOTP/WhatsApp), Google OAuth, reset de senha |
| `clinics` | CRUD clinica, branding, SMTP, stats |
| `patients` | CRUD pacientes, historico, portal token |
| `dentists` | CRUD dentistas, agenda, comissoes |
| `appointments` | Agendamentos, status flow, lembretes |
| `services` | Procedimentos odontologicos |
| `conversations` | Historico de conversas WhatsApp/IA |
| `ai` | Processamento de mensagens com IA multi-provider |
| `ai-clinical` | IA para decisoes clinicas |
| `integrations` | Z-API client (WhatsApp) |
| `webhooks` | Recebimento Z-API e Stripe webhooks |
| `automations` | Templates de mensagem, workflows |
| `notifications` | Notificacoes (WebSocket + persistencia) |
| `nps` | Pesquisas de satisfacao |
| `odontogram` | Odontograma digital |
| `prescriptions` | Receitas, atestados (PDF) |
| `patient-portal` | Portal do paciente (sem login) |
| `reports` | Relatorios financeiros |
| `email` | Servico de envio SMTP |
| `reminders` | Cron de lembretes automaticos |
| `plans` | Planos de assinatura (admin) |
| `subscriptions` | Gestao de assinaturas |
| `billing` | Faturamento e invoices |
| `admin` | Painel superadmin |
| `audit` | Log de auditoria |
| `health` | Health check endpoint |

## API

### Autenticacao
- `POST /api/v1/auth/register` — Criar conta
- `POST /api/v1/auth/login` — Login (retorna JWT ou requires_2fa)
- `POST /api/v1/auth/verify-2fa` — Verificar codigo 2FA
- `POST /api/v1/auth/google` — Login com Google
- `POST /api/v1/auth/forgot-password` — Solicitar reset de senha
- `POST /api/v1/auth/reset-password` — Redefinir senha

### Clinica
- `GET /api/v1/clinics/my` — Dados da clinica do usuario
- `PATCH /api/v1/clinics/my` — Atualizar clinica
- `GET /api/v1/clinics/my/stats` — Estatisticas do dashboard

### Pacientes
- `GET /api/v1/patients` — Listar pacientes (paginado)
- `POST /api/v1/patients` — Criar paciente
- `GET /api/v1/patients/:id` — Detalhes do paciente
- `PATCH /api/v1/patients/:id` — Atualizar paciente

### Agendamentos
- `GET /api/v1/appointments` — Listar (filtros: date, start_date, end_date)
- `POST /api/v1/appointments` — Criar agendamento
- `PATCH /api/v1/appointments/:id` — Atualizar
- `PATCH /api/v1/appointments/:id/status` — Mudar status

### Demais endpoints
Consulte a documentacao Swagger em `/api/docs` para a lista completa de endpoints.

## Performance & Escalabilidade

### Cache Inteligente (Redis)
- **Services, Dentists, AI Settings**: Cache de 5 minutos com invalidação automática
- **Dashboard Stats**: Cache de 5 minutos para métricas agregadas
- **Public Branding**: Cache de 24 horas
- **Graceful degradation**: Funciona sem Redis (fallback para in-memory)
- **Redução de queries**: ~70% em listagens frequentes, 100% em webhooks WhatsApp

### Otimização de Queries
- **12 índices compostos** otimizados para queries mais frequentes
- **SQL aggregation**: Substituição de loops JS por `GROUP BY` e `SUM` no banco
- **Connection pooling**: 10 conexões simultâneas com timeout de 30s
- **N+1 query elimination**: Joins otimizados em listagens
- **Cursor-based pagination**: Para grandes volumes de dados

### Processamento Assíncrono
- **BullMQ queues**: Email, WhatsApp, PDF, AI (via Redis)
- **Distributed cron locks**: Prevenção de execução duplicada em múltiplas instâncias (PostgreSQL-based)
- **Retry strategies**: Backoff exponencial para jobs falhados
- **Job cleanup**: Remoção automática de jobs completados/falhados

### Métricas de Performance
- Listagens de serviços: ~60-70% mais rápidas
- Webhooks WhatsApp: 100% menos queries DB
- Reports financeiros: ~85% mais rápidos (SQL aggregation)
- Dashboard stats: Cache reduz tempo de resposta de ~500ms para <50ms

## Observability

### Logging Estruturado
- **HTTP requests**: JSON logs com userId, clinicId, correlationId, duration
- **Slow request detection**: Warn em >1s, Error em >3s
- **Error tracking**: Stack traces completos com contexto da request
- **Correlation IDs**: Rastreamento end-to-end de requests

### Query Performance Monitoring
- **Slow query alerts**: Automático para queries >1s (warn) ou >3s (error)
- **Query details**: SQL, params, duration, target (logged)
- **Production debugging**: Identifica N+1 queries e índices faltantes

### Health & Metrics
- **GET /health**: Prisma DB ping check
- **GET /health/ping**: Uptime, memory usage, Node.js version, environment
- **Process metrics**: Heap used/total, RSS, uptime formatado

### Real-time Monitoring
- Logs estruturados compatíveis com ELK, Datadog, CloudWatch
- Alertas automáticos para slow queries e requests
- Métricas de sistema em tempo real via health endpoint

## Seguranca

### LGPD Compliance
- **Criptografia AES-256-GCM**: Campos sensíveis (CPF, RG, endereço, telefone, email) criptografados em repouso
- **Blind indexes (HMAC-SHA256)**: Busca em campos criptografados sem expor dados
- **Formato encriptado**: `enc:v1:<iv>:<authTag>:<ciphertext>` com autenticação
- **Prisma middleware**: Encrypt-on-write, decrypt-on-read transparente
- **Key rotation ready**: Suporta migração de chaves via versioning

### Autenticação & Autorização
- **JWT validation**: Secret validado no startup (min 32 chars)
- **2FA robusto**: TOTP (6 dígitos, bcrypt 12 rounds) + WhatsApp fallback
- **Google OAuth**: Login social integrado
- **Rate limiting anti-brute-force**: 3 tentativas máximas em 2FA
- **Portal tokens**: 90 dias de expiração para acesso sem senha
- **Role-based access**: Guard customizado com decorators

### API Security
- **Helmet**: Headers de segurança (CSP, HSTS, X-Frame-Options)
- **Rate limiting multi-tier**: Portal (10/60s), Global (3/1s, 20/10s, 100/60s)
- **CORS whitelist**: Configurável via `CORS_ORIGINS`
- **Input validation**: class-validator + whitelist automático
- **Stack traces**: Ocultos em produção

### Webhook Security
- **Stripe**: Validação de assinatura com rawBody
- **Z-API**: Header `client-token` obrigatório
- **ASAAS**: Token dedicado via `ASAAS_WEBHOOK_TOKEN`

### Infrastructure
- **Docker**: Multi-stage builds, usuário não-root em produção
- **Secrets management**: Nunca commita secrets (`.env` no `.gitignore`)
- **Audit log**: Todas ações sensíveis registradas (CREATE/UPDATE/DELETE)
- **Database**: Connection pooling com limites para prevenir DoS

## Testes

```bash
# Todos os testes
npm run test

# Watch mode
npm run test:watch

# Coverage
npm run test:cov

# E2E tests
npm run test:e2e
```

**Cobertura atual**:
- 284 testes unitários (16 suites)
- 54 testes E2E (3 suites)
- CI/CD automático via GitHub Actions

## Deploy

### Via Docker (Recomendado)
```bash
# Build da imagem
docker build -t odonto-saas-api .

# Run em produção
docker run -p 3000:3000 --env-file .env.production odonto-saas-api
```

### Coolify (Auto-deploy)
Push para `main` → Coolify detecta via GitHub App → Build + Deploy automático

### Comandos de Produção
```bash
# Gerar Prisma Client
npx prisma generate

# Aplicar migrations (versionadas, rastreáveis)
npx prisma migrate deploy

# Iniciar API
npm run start:prod
```

**Nota:** O comando `start:prod` já executa `prisma migrate deploy` automaticamente antes de iniciar a API.

## Monitoramento

### Logs
- **Estruturados em JSON**: Compatível com ELK, Datadog, CloudWatch
- **Níveis**: INFO (requests normais), WARN (slow requests/queries), ERROR (falhas)
- **Contexto completo**: userId, clinicId, correlationId, duration, stack traces

### Alertas Recomendados
1. **Slow queries** (>3s): Indica necessidade de índices ou otimização
2. **Slow requests** (>3s): Pode indicar gargalo de rede ou processamento
3. **5xx errors**: Requer investigação imediata
4. **Memory usage** (>80% heap): Possível memory leak
5. **Uptime drops**: Verificar crashloop ou OOM

### Dashboards Sugeridos
- Taxa de requisições (req/s)
- Latência P50, P95, P99
- Taxa de erro (4xx, 5xx)
- Query duration (avg, max)
- Cache hit rate
- Memory & CPU usage

## Licenca

MIT
