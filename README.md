# AgroAssist — Backend (Node.js)

API para o assistente rural **AgroAssist** via WhatsApp: recebe mensagens (texto/imagem), consulta **Google Gemini**, controla limite gratuito no Supabase e responde pela **Z-API**.

## Pré-requisitos

- Node.js 18+
- Conta [Supabase](https://supabase.com) (Postgres)
- Conta [Z-API](https://www.z-api.io/) com instância conectada ao WhatsApp (QR Code)
- Chave **Gemini** (obrigatória): [Google AI Studio](https://aistudio.google.com/apikey)

## Configuração

1. **Clone/copie** `.env.example` para `.env` e preencha:

   - `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (Settings → API no Supabase; use a **service role** só no servidor).
   - `GEMINI_API_KEY` (crie em [AI Studio](https://aistudio.google.com/apikey)).
   - Opcional: `GEMINI_MODEL` — o padrão no código é `gemini-2.0-flash`. Se a API retornar 404 “model not found”, tente `gemini-2.0-flash-001` ou veja modelos na [documentação](https://ai.google.dev/gemini-api/docs/models/gemini).
   - `ZAPI_INSTANCE_ID` e `ZAPI_INSTANCE_TOKEN` (painel Z-API → Instâncias).
   - `ZAPI_CLIENT_TOKEN` se você ativou o **Token de segurança da conta** em Segurança no painel (header `Client-Token` nas chamadas à API e recomendado para baixar mídias em URLs `*.z-api.io`).

2. **Crie a tabela** executando o SQL em `supabase/schema.sql` no **SQL Editor** do Supabase.

3. **Instale dependências** na pasta do projeto:

   ```bash
   npm install
   ```

4. **Rodar localmente**

   ```bash
   npm run dev
   ```

   Por padrão a API sobe em `http://localhost:3001` (ajuste `PORT` no `.env` se precisar).

5. **Testes sem Z-API** (só log no console, sem enviar WhatsApp real):

   No `.env`, defina `MOCK_WHATSAPP=true`.

6. **Gemini retornou 429 / cota** (free tier esgotado ou limite por minuto):

   - Espere **~1 minuto** e tente de novo (RPM limit).
   - Veja [limites e uso](https://ai.google.dev/gemini-api/docs/rate-limits) e o painel do projeto no Google.
   - Para testar **só o backend** (WhatsApp + Supabase + contador) **sem chamar** o Gemini: `MOCK_LLM=true` no `.env`.

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api-docs` | **Swagger UI** — documentação e testes no navegador |
| GET | `/openapi.json` | Especificação OpenAPI (JSON) |
| GET | `/health` | Status do serviço |
| POST | `/webhook/whatsapp` | Teste com JSON (Postman / Swagger) |
| POST | `/webhook/whatsapp/z-api` | **Webhook Z-API** (“Ao receber”) — mensagens reais do WhatsApp |

### Z-API (produção / teste com número)

1. Suba a API com **HTTPS** (Railway, Render, ngrok, etc.). A Z-API **não aceita webhook sem HTTPS**.
2. No [painel Z-API](https://app.z-api.io/) → **Instâncias** → sua instância → configure o webhook **Ao receber**:
   - **URL:** `https://SEU-DOMINIO/webhook/whatsapp/z-api`
   - **Método:** POST, corpo JSON (a Z-API envia o payload descrito na [documentação](https://developer.z-api.io/webhooks/on-message-received)).
3. O servidor processa apenas mensagens `ReceivedCallback` com `fromMe: false` e **não** grupos (`isGroup`).

Use `MOCK_WHATSAPP=false` e as variáveis `ZAPI_*` no `.env`.

### POST `/webhook/whatsapp`

Corpo JSON (exemplo Postman):

```json
{
  "phone": "+5511999999999",
  "message": "Minha laranjeira está com folhas amareladas",
  "imageUrl": "https://exemplo.com/foto.jpg"
}
```

- `phone` — obrigatório (será normalizado para formato `+` e dígitos).
- `message` — texto opcional.
- `imageUrl` — URL pública `http`/`https` opcional (o servidor baixa e envia ao Gemini).

**Comportamento:**

- Sem `message` nem `imageUrl` válida → envia a **mensagem inicial** de boas-vindas (não consome análise gratuita).
- Usuário gratuito com `usageCount >= 5` e `isPaid === false` → envia mensagem de **limite** e não chama a IA.
- Caso contrário → chama a IA, incrementa `usage_count`, envia a resposta pelo WhatsApp (Z-API).

## Velocidade e webhook

- **Z-API** (`/webhook/whatsapp/z-api`): por padrão o servidor **só responde 200 depois** de processar e enviar a resposta. Só ative `ZAPI_WEBHOOK_ASYNC_ACK=true` se precisar responder ao webhook antes (há risco de não entregar a mensagem se o processo cair).
- **Gemini**: `LLM_MAX_OUTPUT_TOKENS` padrão **4096** (evita cortar no meio; até **8192** se precisar). Se no terminal aparecer aviso `MAX_TOKENS`, aumente esse valor no `.env`. Retries em 503/429: 2 tentativas (`GEMINI_RETRY_*`).

## Pagamentos (futuro)

O arquivo `src/services/paymentService.js` reserva o lugar para webhooks e checkout; não há cobrança implementada.

## Estrutura

```
src/
  controllers/   # Orquestração HTTP
  services/      # Z-API, Gemini, usuários, pagamento (stub)
  routes/
  models/        # Cliente Supabase e constantes do domínio
  middleware/
  utils/         # Tipo de mensagem, telefone, erros
```

## Limite gratuito

Constante `FREE_USAGE_LIMIT` em `src/models/userModel.js` (padrão: **5** interações com IA). Usuários com `is_paid = true` no banco não são bloqueados por esse limite.
