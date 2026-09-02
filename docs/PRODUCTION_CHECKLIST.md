# Checklist de produção — AG Assist

Use este checklist ao colocar o fluxo de cadastro/trial em produção ou após cada deploy relevante.

## 1. Banco (Supabase SQL Editor)

Executar na ordem, se ainda não aplicadas:

1. `supabase/migration_017_sync_plan_catalog.sql`
2. `supabase/migration_018_signup_trial.sql`
3. `supabase/migration_019_legacy_signup_backfill.sql`

Validar colunas em `public.users`: `signup_completed_at`, `trial_started_at`, `trial_ends_at`, `welcome_sent_at`, `trial_expired_notified_at`, `signup_source`.

## 2. Variáveis de ambiente (VPS)

```env
PUBLIC_APP_URL=https://campoai-production-b7c7.up.railway.app
SIGNUP_URL=https://campoai-production-b7c7.up.railway.app/cadastro
PAYWALL_URL=https://campoai-production-b7c7.up.railway.app/planos
FREE_TRIAL_DAYS=14
FREE_USAGE_LIMIT=10
```

## 3. Twilio — templates WhatsApp

Criar e aprovar no [Content Template Builder](https://www.twilio.com/docs/content/create-templates-with-the-content-template-builder):

| Template | Variáveis | Env |
|----------|-----------|-----|
| `WELCOME_SIGNUP` | `{{1}}` = primeiro nome | `WELCOME_SIGNUP_CONTENT_SID` |
| `TRIAL_EXPIRED` | `{{1}}` = nome, `{{2}}` = URL planos | `TRIAL_EXPIRED_CONTENT_SID` |
| Paywall (opcional) | `{{1}}` texto, `{{2}}` URL | `PAYWALL_CONTENT_SID` |

Textos sugeridos: [`TWILIO_SIGNUP_TEMPLATES.md`](./TWILIO_SIGNUP_TEMPLATES.md).

**Fallback:** sem SID, o backend tenta texto livre no WhatsApp e SMS com link `wa.me`.

## 4. Resend — e-mail de boas-vindas

1. Verificar domínio (SPF/DKIM) em [resend.com](https://resend.com)
2. Definir `RESEND_API_KEY` e `SIGNUP_EMAIL_FROM=AG Assist <boas-vindas@seudominio.com>`
3. `SIGNUP_EMAIL_ENABLED=true`, `MOCK_EMAIL=false`
4. Teste: `npm run test:signup-email` (com `MOCK_EMAIL=true` localmente)

Detalhes: [`SIGNUP_WELCOME_EMAIL.md`](./SIGNUP_WELCOME_EMAIL.md).

## 5. Cron de expiração de trial

```env
TRIAL_EXPIRY_CRON_ENABLED=true
TRIAL_EXPIRY_CRON=0 9 * * *
TRIAL_EXPIRY_CRON_TZ=America/Sao_Paulo
```

Reiniciar o processo Node após alterar. Usuários com `trial_ends_at` no passado e sem assinatura recebem aviso com link para `/planos`.

## 6. Landing (Netlify)

Confirmar CTAs apontando para:

`https://campoai-production-b7c7.up.railway.app/cadastro?origin=landing`

Arquivo: `CampoAILanding/index.html`.

## 7. Smoke test pós-deploy

```bash
# Health + OpenAPI + planos
npm run smoke:deploy -- https://campoai-production-b7c7.up.railway.app

# Funil comercial completo (páginas, APIs, guards)
npm run validate:funnel -- https://campoai-production-b7c7.up.railway.app

# Migrações no Supabase
npm run confirm:migrations

# E-mail + WhatsApp + Asaas
npm run verify:integrations

# Testes locais (antes do deploy)
npm run test:signup-flow
```

**Manual em produção:**

1. `POST /api/signup/otp/send` com número de teste
2. Fluxo completo `/cadastro` até painel de sucesso
3. Mensagem no WhatsApp **sem** cadastro → recebe link `SIGNUP_URL`
4. Admin `/admin` → gráfico de cadastros usa `signup_completed_at`

## 8. Pendências legais

Termos e privacidade já preenchidos em `public/legal/` (EcoSystems Brasil, CNPJ 66.412.901/0001-07). Revisar anualmente ou ao mudar planos/preços.

## 9. Beta fechado

Ver [`BETA_LAUNCH.md`](./BETA_LAUNCH.md) para convite de 10–30 usuários e acompanhamento via `/admin`.
