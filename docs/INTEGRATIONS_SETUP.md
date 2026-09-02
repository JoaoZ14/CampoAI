# Setup de integrações — e-mail e WhatsApp

Checklist para colocar Resend e templates Twilio em produção. Rode `npm run verify:integrations` após cada alteração.

## Status atual (verificado automaticamente)

O script `scripts/verify-integrations.mjs` valida:

| Integração | Variável | Status esperado |
|------------|----------|-----------------|
| Resend API | `RESEND_API_KEY` | Configurada |
| Remetente e-mail | `SIGNUP_EMAIL_FROM` | Domínio próprio em produção |
| Boas-vindas WhatsApp | `WELCOME_SIGNUP_CONTENT_SID` | SID aprovado no Meta |
| Trial expirado | `TRIAL_EXPIRED_CONTENT_SID` | SID aprovado no Meta |
| Paywall (opcional) | `PAYWALL_CONTENT_SID` | Fallback texto livre se ausente |
| Resumo semanal | `WEEKLY_NEWS_WHATSAPP_CONTENT_SID` | SID aprovado |
| Asaas webhook | `ASAAS_WEBHOOK_TOKEN` | Token configurado |
| Checkout | `ASAAS_CHECKOUT_API_SECRET` | Secret configurado |

## 1. Resend — domínio próprio

### Por que

`onboarding@resend.dev` só entrega para o e-mail da conta Resend. Em produção, use domínio próprio.

### Passos

1. Acesse [resend.com/domains](https://resend.com/domains)
2. Adicione seu domínio (ex. `agassist.com.br`)
3. Configure registros DNS (SPF, DKIM) conforme instruções
4. Aguarde verificação (pode levar até 48h)
5. Atualize no Railway:

```env
SIGNUP_EMAIL_FROM=AG Assist <boas-vindas@seudominio.com>
SIGNUP_EMAIL_ENABLED=true
MOCK_EMAIL=false
```

6. Teste:

```bash
npm run test:signup-email -- --email destinatario@exemplo.com
```

Detalhes: [`SIGNUP_WELCOME_EMAIL.md`](./SIGNUP_WELCOME_EMAIL.md)

## 2. Twilio — templates WhatsApp

### Templates obrigatórios para beta

| Template | Env | Doc |
|----------|-----|-----|
| WELCOME_SIGNUP | `WELCOME_SIGNUP_CONTENT_SID` | [`TWILIO_SIGNUP_TEMPLATES.md`](./TWILIO_SIGNUP_TEMPLATES.md) |
| TRIAL_EXPIRED | `TRIAL_EXPIRED_CONTENT_SID` | idem |

### Passos

1. Twilio Console → Messaging → Content Template Builder
2. Criar template com textos sugeridos em `TWILIO_SIGNUP_TEMPLATES.md`
3. Submeter para aprovação Meta (24–72h)
4. Copiar Content SID (formato `HX...` ou `H...`)
5. Colar no Railway e reiniciar

### Fallback

Sem SID aprovado, o backend tenta texto livre no WhatsApp e SMS com link `wa.me`. Funciona, mas com menor taxa de entrega fora da janela de 24h.

## 3. Asaas — produção

### Sandbox → produção

Quando estiver pronto para cobrar de verdade:

```env
ASAAS_SANDBOX=false
ASAAS_API_KEY=<chave de produção>
```

### Webhook

1. Painel Asaas → Integrações → Webhooks
2. URL: `https://campoai-production-b7c7.up.railway.app/webhook/asaas`
3. Token: mesmo valor de `ASAAS_WEBHOOK_TOKEN`
4. Eventos: `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`

## 4. Verificação pós-configuração

```bash
npm run verify:integrations
npm run validate:funnel -- https://campoai-production-b7c7.up.railway.app
```

Exit code 0 = tudo ok. Exit code 2 = avisos (aceitável no beta). Exit code 1 = falha crítica.
