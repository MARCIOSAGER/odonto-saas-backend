# Odonto SaaS — Backend

Backend API para plataforma SaaS de gestao de clinicas odontologicas. Multi-tenant, com atendimento automatizado via WhatsApp (IA), agendamentos, prontuario digital, odontograma, NPS e faturamento via Stripe.

## Tech Stack

| Tecnologia | Uso |
|---|---|
| NestJS 10 | Framework HTTP + WebSocket |
| Prisma 5 | ORM + migrations |
| PostgreSQL 16 | Banco de dados |
| Redis 7 | Cache (opcional, via Docker) |
| JWT + Passport | Autenticacao |
| Stripe | Pagamentos e assinaturas |
| Z-API | Integracao WhatsApp |
| Anthropic / OpenAI / Google | IA para atendimento |
| Nodemailer | Envio de emails (SMTP) |
| Socket.IO | Notificacoes em tempo real |
| Swagger | Documentacao da API |
| Docker | Containerizacao |

## Pre-requisitos

- Node.js >= 20
- PostgreSQL 16 (ou Docker)
- Conta Z-API (para WhatsApp)
- API Key de IA (Anthropic, OpenAI ou Google)
- Conta Stripe (para faturamento)

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

# Sincronizar schema com o banco
npx prisma db push

# Iniciar em modo desenvolvimento
npm run start:dev
```

A API estara disponivel em `http://localhost:3000`.
Documentacao Swagger em `http://localhost:3000/api/docs`.

## Variaveis de Ambiente

| Variavel | Descricao | Obrigatoria |
|---|---|---|
| `DATABASE_URL` | Connection string PostgreSQL | Sim |
| `JWT_SECRET` | Secret para tokens JWT | Sim |
| `JWT_EXPIRATION` | Duracao do token (ex: "7d") | Nao |
| `ANTHROPIC_API_KEY` | API key Anthropic (Claude) | Nao* |
| `Z_API_URL` | URL base da Z-API | Nao* |
| `Z_API_TOKEN` | Token global Z-API | Nao* |
| `SMTP_HOST` | Host SMTP | Nao* |
| `SMTP_PORT` | Porta SMTP | Nao* |
| `SMTP_USER` | Usuario SMTP | Nao* |
| `SMTP_PASS` | Senha SMTP | Nao* |
| `SMTP_FROM` | Remetente padrao | Nao* |
| `FRONTEND_URL` | URL do frontend | Sim |
| `GOOGLE_CLIENT_ID` | OAuth Google | Nao |
| `GOOGLE_CLIENT_SECRET` | OAuth Google | Nao |
| `PORT` | Porta da API (padrao: 3000) | Nao |
| `NODE_ENV` | Ambiente (development/production) | Nao |

*Necessarias para funcionalidades especificas (IA, WhatsApp, email).

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

## Seguranca

- Helmet (security headers)
- Rate limiting multi-tier (3/1s, 20/10s, 100/60s)
- CORS com whitelist de origens
- Validacao de input com class-validator
- Senhas com bcrypt
- 2FA via TOTP ou WhatsApp
- Audit log de acoes sensiveis
- Docker: usuario nao-root em producao

## Licenca

MIT
