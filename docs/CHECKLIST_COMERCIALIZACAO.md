# Checklist de comercialização — AG Assist

Use este arquivo para se localizar no caminho até o beta e o lançamento. Marque `[x]` conforme for concluindo.

**Status geral:** beta fechado (10–30 usuários) → lançamento ativo → escala

**Última validação automática:** migrações ok · funil em produção ok · 3 assinantes · 4 avisos de integração pendentes

---

## Fase 0 — Onde você está agora

- [x] Produto core no ar (WhatsApp + IA)
- [x] Landing publicada (`agassist.netlify.app`)
- [x] API em produção (`campoai-production-b7c7.up.railway.app`)
- [x] Cadastro + trial + paywall implementados
- [x] Checkout Asaas integrado
- [x] Portal do assinante (`/area-do-cliente`)
- [x] Admin (`/admin`)
- [x] Termos e privacidade preenchidos
- [x] Migrações 017–019 aplicadas
- [ ] Hardening de segurança em produção (deploy pendente)
- [ ] 1 checkout real end-to-end validado manualmente

---

## Fase 1 — Deploy e validação técnica

### Deploy no Railway

- [ ] Commit e push das mudanças recentes (hardening + scripts)
- [ ] Deploy concluído sem erro no Railway
- [ ] Variáveis de ambiente conferidas no painel Railway

### Rodar validações (na pasta `CampoAI`)

```bash
npm run confirm:migrations
npm run verify:integrations
npm run validate:funnel -- https://campoai-production-b7c7.up.railway.app
npm run test:signup-flow
npm run smoke:deploy -- https://campoai-production-b7c7.up.railway.app
```

- [ ] `confirm:migrations` — passou
- [ ] `verify:integrations` — passou (avisos ok no beta)
- [ ] `validate:funnel` — passou
- [ ] `test:signup-flow` — passou
- [ ] `smoke:deploy` — passou

### Teste manual obrigatório (1 vez)

- [ ] Cadastro real em `/cadastro` com OTP SMS
- [ ] Mensagem de boas-vindas chegou no WhatsApp
- [ ] Enviei foto/texto no WhatsApp e recebi resposta da IA
- [ ] Paywall apareceu ao atingir limite (ou simulei usuário expirado)
- [ ] Checkout em `/planos` com cartão (sandbox ou produção)
- [ ] Login no portal `/area-do-cliente` após assinatura
- [ ] Assinatura refletida no `/admin`

---

## Fase 2 — Integrações (fechar avisos)

Detalhes em [`INTEGRATIONS_SETUP.md`](./INTEGRATIONS_SETUP.md).

### E-mail (Resend)

- [x] Domínio próprio adicionado no Resend
- [ ] SPF/DKIM configurados e verificados
- [x] `SIGNUP_EMAIL_FROM` atualizado no Railway (ex. `boas-vindas@seudominio.com`)
- [ ] Teste de envio: `npm run test:signup-email -- --email seu@email.com`
- [ ] E-mail de boas-vindas chegou após cadastro real

### WhatsApp (Twilio / Meta)

- [x] `WELCOME_SIGNUP_CONTENT_SID` configurado
- [ ] `TRIAL_EXPIRED_CONTENT_SID` criado e aprovado no Meta
- [ ] `PAYWALL_CONTENT_SID` criado e aprovado (opcional — tem fallback)
- [x] `WEEKLY_NEWS_WHATSAPP_CONTENT_SID` configurado
- [ ] Cron de trial expirado ativo: `TRIAL_EXPIRY_CRON_ENABLED=true`

### Pagamentos (Asaas)

- [x] `ASAAS_API_KEY` configurada
- [x] `ASAAS_WEBHOOK_TOKEN` configurado
- [x] `ASAAS_CHECKOUT_API_SECRET` configurado
- [ ] Webhook Asaas apontando para `…/webhook/asaas`
- [ ] Eventos `PAYMENT_RECEIVED` e `PAYMENT_CONFIRMED` ativos
- [ ] `ASAAS_SANDBOX=false` (só quando for cobrar de verdade)
- [ ] Chave de produção Asaas no Railway

### Observabilidade (opcional mas recomendado)

- [ ] Conta Sentry criada
- [ ] `SENTRY_DSN` configurado no Railway
- [ ] Teste: forçar erro 500 e confirmar alerta no Sentry

---

## Fase 3 — Beta fechado (10–30 usuários)

Guia completo: [`BETA_LAUNCH.md`](./BETA_LAUNCH.md).

### Preparação

- [ ] Link de convite pronto: `https://campoai-production-b7c7.up.railway.app/cadastro?origin=beta`
- [ ] Mensagem de convite escrita
- [ ] Lista de 10–30 contatos definida
- [ ] Canal de suporte definido (WhatsApp `(24) 98868-5043`)

### Convite e acompanhamento

- [ ] Primeiros 5 convites enviados
- [ ] 10 convites enviados
- [ ] 20 convites enviados
- [ ] 30 convites enviados (meta máxima do beta)

### Métricas (acompanhar no `/admin`)

| Métrica | Meta | Atual |
|---------|------|-------|
| Cadastros concluídos | ≥ 80% dos convidados | ___ / ___ |
| Usuários com ≥ 3 análises | ≥ 50% dos cadastrados | ___ / ___ |
| Conversão trial → pago | ≥ 10% | ___ / ___ |
| Checkouts sem erro | 100% | ___ / ___ |

### Rotina diária (5 min no `/admin`)

- [ ] Novos cadastros nas últimas 24h
- [ ] Trials perto de expirar
- [ ] Conversas com erro ou reclamação
- [ ] Novos pagamentos
- [ ] Anotar feedback qualitativo

---

## Fase 4 — Critérios para sair do beta

Só avance para lançamento ativo quando todos estiverem marcados:

- [ ] ≥ 5 checkouts reais concluídos sem erro
- [ ] Domínio Resend verificado (e-mail para qualquer destinatário)
- [ ] Template `TRIAL_EXPIRED` aprovado
- [ ] `ASAAS_SANDBOX=false` em produção
- [ ] Nenhum incidente crítico em 7 dias seguidos
- [ ] Hardening deployado e validado em produção

---

## Fase 5 — Lançamento ativo

- [ ] Tráfego orgânico ou pago liberado
- [ ] Preços e planos revisados na landing e em `/planos`
- [ ] FAQ atualizado com dúvidas do beta
- [ ] Processo de cancelamento documentado (manual via Asaas por enquanto)
- [ ] CI mínimo (GitHub Actions com testes em PR)
- [ ] Runbook de backup Supabase documentado

---

## Referência rápida

| O quê | Onde |
|-------|------|
| Admin | `/admin` |
| Cadastro | `/cadastro` |
| Planos / checkout | `/planos` |
| Portal assinante | `/area-do-cliente` |
| Termos | `/legal/termos-de-uso` |
| Privacidade | `/legal/politica-de-privacidade` |
| API health | `/health` |
| Swagger | `/api-docs` |

### Scripts úteis

```bash
npm run confirm:migrations      # banco ok?
npm run verify:integrations     # Resend/Twilio/Asaas ok?
npm run validate:funnel         # funil em produção ok?
npm run smoke:deploy            # health + openapi + planos
npm run test:signup-flow        # lógica de trial (local)
npm run test:signup-email       # teste de e-mail Resend
```

### Docs relacionados

- [`PRODUCTION_CHECKLIST.md`](./PRODUCTION_CHECKLIST.md) — deploy e variáveis
- [`INTEGRATIONS_SETUP.md`](./INTEGRATIONS_SETUP.md) — Resend, Twilio, Asaas
- [`BETA_LAUNCH.md`](./BETA_LAUNCH.md) — operação do beta
- [`SIGNUP_WELCOME_EMAIL.md`](./SIGNUP_WELCOME_EMAIL.md) — e-mail de boas-vindas
- [`TWILIO_SIGNUP_TEMPLATES.md`](./TWILIO_SIGNUP_TEMPLATES.md) — textos dos templates

---

## Notas pessoais

_Use este espaço para anotar bloqueios, decisões e próximos passos._

```
Data: ___/___/______
Onde parei:
Próximo passo:
Bloqueio (se houver):
```
