# Templates Twilio para cadastro e trial

Crie os templates no **Twilio Console → Messaging → Content Template Builder** e aguarde aprovação do Meta/WhatsApp.

## WELCOME_SIGNUP (pós-cadastro)

**Quando:** logo após `POST /api/signup/complete`.

**Variáveis:**
- `{{1}}` — primeiro nome do usuário

**Texto sugerido:**
```
Olá, {{1}}! Que bom ter você aqui.

Sou o AG Assist: seu apoio no WhatsApp para dúvidas de planta, animal e manejo no campo.

Mande uma foto, um áudio ou sua pergunta — vamos começar?
```

**Env:** `WELCOME_SIGNUP_CONTENT_SID=H...`

**Fallback:** se o SID não estiver configurado, o backend tenta texto livre no WhatsApp e, se falhar, SMS com link `wa.me`.

---

## TRIAL_EXPIRED (cron diário)

**Quando:** `trial_ends_at` passou e o usuário ainda não é assinante (`TRIAL_EXPIRY_CRON_ENABLED=true`).

**Variáveis:**
- `{{1}}` — primeiro nome
- `{{2}}` — URL da página de planos (com `?phone=` e `origin=trial_expired_cron`)

**Texto sugerido:**
```
Olá, {{1}}! Seu período de teste gratuito do AG Assist acabou.

Para continuar, escolha um plano: {{2}}
```

**Env:** `TRIAL_EXPIRED_CONTENT_SID=H...`

---

## Checklist de produção

1. Criar e aprovar os dois templates no Meta
2. Copiar os Content SIDs para `.env`
3. Definir `SIGNUP_URL` e `PAYWALL_URL` com domínio público HTTPS
4. Ver checklist completo em [`PRODUCTION_CHECKLIST.md`](./PRODUCTION_CHECKLIST.md)
4. Ativar `TRIAL_EXPIRY_CRON_ENABLED=true` quando estiver pronto para avisos proativos
