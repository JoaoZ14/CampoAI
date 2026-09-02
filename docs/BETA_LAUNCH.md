# Beta fechado — AG Assist

Guia operacional para lançar o beta com 10–30 produtores reais e acompanhar conversão via `/admin`.

## Pré-requisitos (rodar antes de convidar usuários)

```bash
npm run confirm:migrations
npm run verify:integrations
npm run validate:funnel -- https://campoai-production-b7c7.up.railway.app
npm run test:signup-flow
```

Todos devem passar (avisos são aceitáveis; falhas não).

## Meta do beta

| Métrica | Meta |
|---------|------|
| Usuários convidados | 10–30 |
| Cadastros concluídos | ≥ 80% dos convidados |
| Uso no WhatsApp (≥ 3 análises) | ≥ 50% dos cadastrados |
| Conversão trial → pago | ≥ 10% (referência inicial) |
| Tempo de resposta médio | < 30s no WhatsApp |

## Como convidar

1. **Indicação direta** — consultores, cooperativas, produtores conhecidos
2. **Grupos de produtores** — postar link de cadastro com contexto claro
3. **Parceiros técnicos** — agrônomos que já atendem clientes no campo

**Link de cadastro:**
```
https://campoai-production-b7c7.up.railway.app/cadastro?origin=beta
```

**Mensagem sugerida:**
```
Estou testando o AG Assist — assistente rural no WhatsApp para dúvidas de planta, animal e manejo.

Cadastro gratuito (14 dias ou 10 análises): [link]

Manda foto, áudio ou texto direto no WhatsApp depois de se cadastrar.
```

## Acompanhamento diário no `/admin`

Acesse: `https://campoai-production-b7c7.up.railway.app/admin`

### Checklist diário (5 min)

- [ ] **Dashboard** — novos cadastros (`signup_completed_at` nas últimas 24h)
- [ ] **Usuários** — quem está em trial, quem atingiu limite de análises
- [ ] **Conversas** — qualidade das respostas da IA (erros, reclamações)
- [ ] **Assinaturas** — novos pagamentos via Asaas
- [ ] **Receita** — MRR acumulado

### Sinais de alerta

| Sinal | Ação |
|-------|------|
| Cadastro sem mensagem no WhatsApp | Verificar `WELCOME_SIGNUP_CONTENT_SID` e logs Twilio |
| OTP não chega | Verificar saldo Twilio e `TWILIO_SMS_FROM` |
| Paywall sem link | Verificar `PAYWALL_URL` e template paywall |
| Checkout falha | Verificar `ASAAS_SANDBOX` (trocar para produção quando pronto) |
| IA não responde | Verificar `GEMINI_API_KEY` e quota |

## Suporte manual esperado

Durante o beta, estes casos vão para suporte humano (WhatsApp `(24) 98868-5043`):

- Cancelamento de assinatura → cancelar no painel Asaas
- Troca de plano → ajustar manualmente no Asaas + `/admin`
- Problemas de pagamento → verificar webhook Asaas
- Reclamação de resposta da IA → revisar conversa em `/admin` → Conversas

## Critérios para sair do beta

O beta pode evoluir para lançamento ativo quando:

1. ≥ 5 checkouts reais concluídos sem erro
2. Domínio Resend verificado (e-mail de boas-vindas para qualquer destinatário)
3. Template `TRIAL_EXPIRED` aprovado no Meta
4. `ASAAS_SANDBOX=false` em produção
5. Nenhum incidente crítico em 7 dias consecutivos

## Scripts úteis pós-deploy

```bash
# Smoke rápido
npm run smoke:deploy -- https://campoai-production-b7c7.up.railway.app

# Validar funil completo
npm run validate:funnel -- https://campoai-production-b7c7.up.railway.app

# Testar e-mail (conta Resend)
npm run test:signup-email -- --email seu@email.com
```

## Registro de feedback

Para cada usuário beta, anotar:

- Nome / telefone
- Data de cadastro
- Quantas análises usou
- Converteu? (sim/não)
- Feedback qualitativo (1 frase)
- Problema encontrado (se houver)

Isso alimenta decisões de produto antes do lançamento amplo.
