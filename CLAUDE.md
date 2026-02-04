# CLAUDE.md — Odonto SaaS Backend

## Visao Geral

Backend NestJS multi-tenant para SaaS odontologico. Cada clinica tem seus proprios dados isolados por `clinic_id`. A API segue o padrao REST com versionamento (`/api/v1/...`) e documentacao Swagger em `/api/docs`.

## Stack

- **Runtime:** Node.js 20 + TypeScript (ES2021, CommonJS)
- **Framework:** NestJS 10
- **ORM:** Prisma 5 + PostgreSQL 16
- **Auth:** JWT (passport-jwt) + Google OAuth + 2FA (TOTP via `otpauth` ou WhatsApp)
- **Pagamentos:** Stripe (subscriptions, invoices, webhooks)
- **WhatsApp:** Z-API (envio/recebimento via webhooks)
- **IA:** Anthropic Claude, OpenAI GPT, Google Gemini (configuravel por clinica)
- **Email:** Nodemailer (SMTP configuravel por clinica)
- **Realtime:** Socket.IO (notificacoes)
- **Seguranca:** Helmet, ThrottlerModule (rate limiting multi-tier), CORS

## Arquitetura

```
src/
├── main.ts                  # Bootstrap: Helmet, CORS, Swagger, rate limiting, validation pipe
├── app.module.ts            # Root module — importa todos os feature modules
├── common/                  # Guards, interceptors, filters, decorators compartilhados
│   ├── guards/              # JwtAuthGuard, RolesGuard
│   ├── interceptors/        # TransformInterceptor (wraps response), LoggingInterceptor
│   ├── filters/             # HttpExceptionFilter
│   └── decorators/          # @CurrentUser(), @Roles()
├── prisma/                  # PrismaService (singleton, global)
├── auth/                    # Login, register, 2FA, Google OAuth, password reset
├── clinics/                 # CRUD clinica + stats + branding + SMTP config
├── patients/                # CRUD pacientes + historico + portal token
├── dentists/                # CRUD dentistas + schedules + comissoes
├── appointments/            # CRUD agendamentos + status flow + lembretes
├── services/                # Procedimentos odontologicos (preco, duracao, categoria)
├── conversations/           # Historico de conversas WhatsApp/IA
├── ai/                      # Processamento de mensagens com IA (multi-provider)
├── ai-clinical/             # IA para decisoes clinicas (anamnese, planos de tratamento)
├── integrations/            # Z-API client (envio WhatsApp, QR code, webhook config)
├── webhooks/                # Recebimento de webhooks (Z-API, Stripe)
├── automations/             # Templates de mensagem, lembretes automaticos
├── notifications/           # Sistema de notificacoes (WebSocket + persistencia)
├── nps/                     # Pesquisas de satisfacao pos-consulta
├── odontogram/              # Odontograma digital (por dente, por face)
├── prescriptions/           # Receitas, atestados, encaminhamentos (PDF)
├── patient-portal/          # Portal do paciente (acesso via token, sem login)
├── reports/                 # Relatorios financeiros e operacionais
├── email/                   # Servico de envio de email (SMTP)
├── reminders/               # Cron de lembretes (24h e 1h antes)
├── plans/                   # Planos de assinatura (CRUD admin)
├── subscriptions/           # Gestao de assinaturas (trial, active, expired)
├── billing/                 # Faturamento (invoices, metricas de receita)
├── admin/                   # Painel admin (superadmin): stats, usuarios, clinicas
├── audit/                   # Log de auditoria (acoes do usuario)
└── health/                  # Health check endpoint (/health)
```

## Padroes Importantes

### TransformInterceptor
Todas as respostas da API sao wrappadas:
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```
Respostas paginadas retornam `data: { data: [...], meta: { total, page, limit } }`.

### Guards
- `JwtAuthGuard` — Protege todas as rotas autenticadas
- `RolesGuard` + `@Roles('superadmin')` — Restringe por role
- Rotas publicas usam `@Public()` decorator

### Multi-tenancy
- Quase todos os services filtram por `clinic_id` do usuario logado
- `@CurrentUser()` decorator extrai o usuario do JWT
- O `clinic_id` vem do token JWT (setado no login)

### Rate Limiting
Tres niveis configurados no `main.ts`:
- **Short:** 3 requests / 1 segundo
- **Medium:** 20 requests / 10 segundos
- **Long:** 100 requests / 60 segundos

### Validacao
- `ValidationPipe` global com `whitelist: true` e `transform: true`
- DTOs usam `class-validator` decorators
- Path params auto-convertidos para tipos corretos

## Comandos

```bash
# Desenvolvimento
npm run start:dev          # NestJS watch mode (porta 3000)
npm run prisma:studio      # Prisma Studio (GUI do banco)
npm run prisma:migrate     # Criar migration
npm run prisma:generate    # Gerar Prisma Client

# Build e Producao
npm run build              # Compila para dist/
npm run start:prod         # prisma db push + node dist/main

# Docker
npm run docker:dev         # PostgreSQL + Redis + API (dev)
npm run docker:prod        # Stack completa com Nginx

# Testes
npm run test               # Unit tests
npm run test:e2e           # End-to-end tests
npm run test:cov           # Coverage report

# Linting
npm run lint               # ESLint fix
npm run format             # Prettier
```

## Variaveis de Ambiente

```bash
DATABASE_URL=              # PostgreSQL connection string
JWT_SECRET=                # Secret para assinar tokens JWT
JWT_EXPIRATION="7d"        # Duracao do token
ANTHROPIC_API_KEY=         # API key Anthropic (Claude)
Z_API_URL="https://api.z-api.io"
Z_API_TOKEN=               # Token global Z-API (fallback)
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=                 # Email de envio
SMTP_PASS=                 # Senha SMTP
SMTP_FROM=                 # Remetente padrao
FRONTEND_URL=http://localhost:3001
GOOGLE_CLIENT_ID=          # OAuth Google
GOOGLE_CLIENT_SECRET=
PORT=3000
NODE_ENV=development
THROTTLE_TTL=60000
THROTTLE_LIMIT=10
```

**Nota:** Cada clinica pode ter suas proprias credenciais SMTP (campos `smtp_*` no model `Clinic`).

## Banco de Dados

### Models Principais
- `User` — Usuarios do sistema (email, senha, role, 2FA)
- `Clinic` — Clinicas (multi-tenant, branding, SMTP, Z-API)
- `Patient` — Pacientes (CPF, telefone, portal token)
- `Dentist` — Dentistas (CRO, especialidade, comissao)
- `Appointment` — Agendamentos (status flow, lembretes)
- `Service` — Servicos odontologicos
- `Conversation` — Historico de conversas (WhatsApp + IA)
- `Subscription` — Assinaturas (Stripe)
- `Invoice` — Faturas
- `AuditLog` — Log de auditoria
- `Odontogram` / `OdontogramTooth` — Odontograma digital
- `Prescription` — Receitas e atestados
- `NpsSurvey` — Pesquisas NPS
- `Plan` / `ClinicPlan` — Planos de assinatura

### Comandos Prisma
```bash
npx prisma db push         # Sync schema sem migration (dev rapido)
npx prisma migrate dev     # Criar migration formal
npx prisma generate        # Regenerar client apos mudar schema
npx prisma studio          # GUI para inspecionar dados
```

## Fluxo de Autenticacao

1. `POST /api/v1/auth/login` — Retorna JWT ou `requires_2fa: true`
2. Se 2FA: `POST /api/v1/auth/verify-2fa` com token + codigo
3. Google OAuth: `POST /api/v1/auth/google` troca ID token por JWT
4. Token JWT contem: `sub` (user_id), `email`, `role`, `clinic_id`

## Webhook WhatsApp (Z-API)

1. Z-API envia POST para `/api/v1/webhooks/zapi/:instanceId`
2. Webhook identifica clinica pelo `instanceId`
3. Mensagem e processada pela IA (se configurada)
4. Resposta e enviada de volta pelo Z-API
5. Conversa e salva no banco

## Deploy

### Infraestrutura
- **Docker:** Multi-stage build, Node 20 Alpine, usuario nao-root
- **Coolify / VPS:** docker-compose.prod.yml com Nginx reverse proxy
- **Health check:** GET `/health` (Terminus module)
- **Migrations:** `prisma db push` roda automaticamente no `start:prod`

### Workflow de deploy

O deploy e automatico via **webhook do Coolify**. Basta fazer push para `main`:

1. **Commit** — `git add <arquivos> && git commit -m "mensagem"`
2. **Push** — `git push origin main`
3. **Deploy** — Automatico! O webhook do GitHub notifica o Coolify, que inicia o build e deploy.

> **Nota:** O webhook esta configurado no GitHub (Settings > Webhooks) apontando para o Coolify. Nao e necessario disparar manualmente.

### Deploy manual (fallback)

Se precisar disparar deploy manual sem push, use a API do Coolify com o token salvo em `.coolify-token` (arquivo gitignored):

```bash
TOKEN=$(cat .coolify-token)
curl -s -X POST "https://coolify.marciosager.com/api/v1/deploy" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uuid":"o480kk4sk4444c04kocswcog","force":false}'
```
