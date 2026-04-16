# AgroAssist — Backend (Node.js)

API para o assistente agrícola **AgroAssist** via WhatsApp: recebe mensagens (texto/imagem), consulta **Gemini** (plano gratuito no Google AI Studio) ou **OpenAI**, controla limite gratuito no Supabase e responde pelo Twilio.

## Pré-requisitos

- Node.js 18+
- Conta [Supabase](https://supabase.com) (Postgres)
- Conta [Twilio](https://www.twilio.com) com WhatsApp (sandbox ou número aprovado)
- Chave **Gemini** (grátis): [Google AI Studio](https://aistudio.google.com/apikey) — recomendado para desenvolvimento sem cartão
- Opcional: chave [OpenAI](https://platform.openai.com) se usar `LLM_PROVIDER=openai` ou sem `GEMINI_API_KEY`

## Configuração

1. **Clone/copie** `.env.example` para `.env` e preencha:

   - `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (Settings → API no Supabase; use a **service role** só no servidor).
   - `GEMINI_API_KEY` (crie em [AI Studio](https://aistudio.google.com/apikey)) — **prioridade** se existir; ou `OPENAI_API_KEY`.
   - Opcional: `GEMINI_MODEL` — o padrão no código é `gemini-2.0-flash`. Se a API retornar 404 “model not found”, tente `gemini-2.0-flash-001` ou veja modelos disponíveis na [documentação de modelos](https://ai.google.dev/gemini-api/docs/models/gemini).
   - Opcional: `LLM_PROVIDER=gemini` ou `openai` se tiver as duas chaves e quiser forçar.
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (ex.: `whatsapp:+14155238886` no sandbox).

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

5. **Testes sem Twilio** (só log no console, sem enviar WhatsApp real):

   No `.env`, defina `MOCK_WHATSAPP=true`.

6. **Gemini retornou 429 / cota** (free tier esgotado ou limite por minuto):

   - Espere **~1 minuto** e tente de novo (RPM limit).
   - Veja [limites e uso](https://ai.google.dev/gemini-api/docs/rate-limits) e o painel do projeto no Google AI.
   - Para testar **só o backend** (WhatsApp + Supabase + contador) **sem chamar** Gemini/OpenAI: `MOCK_LLM=true` no `.env`.

## Deploy no Vercel

Segue a [documentação oficial Express on Vercel](https://vercel.com/docs/frameworks/backend/express):

- A app Express exporta-se com **`export default`** — ficheiro **`server.js`** na raiz do repo: `export default createApp();` (**sem** `serverless-http`).
- O código da app está em **`src/expressApp.js`**. **Não** uses `src/app.js` (nome reservado / conflitos).
- **Não** é obrigatório `vercel.json` para o caso básico; removido o `index.js` na raiz que às vezes não ia no Git.
- **Confirma no Git:** `server.js` (raiz) e `src/expressApp.js`.
- **Settings → General → Root Directory** no projeto Vercel: vazio (raiz do repo, onde está o `package.json`).
- Localmente: `npm run dev` / `npm start` → **`src/index.js`** com `listen()`.

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api-docs` | **Swagger UI** — documentação e testes no navegador |
| GET | `/openapi.json` | Especificação OpenAPI (JSON) |
| GET | `/health` | Status do serviço |
| POST | `/webhook/whatsapp` | Teste com JSON (Postman / Swagger) |
| POST | `/webhook/whatsapp/twilio` | **Webhook do Twilio** — mensagens reais do WhatsApp |

### Twilio (produção / teste com número)

1. Suba a API com **HTTPS** (Railway, Render, ngrok, etc.).
2. No [Twilio Console](https://console.twilio.com) → seu número ou **WhatsApp Sandbox** → em **When a message comes in** configure:
   - **URL:** `https://SEU-DOMINIO/webhook/whatsapp/twilio`
   - **HTTP:** POST
3. Salve e envie mensagem pelo WhatsApp para o número do Twilio.

O Twilio envia `application/x-www-form-urlencoded` (não JSON). Use `MOCK_WHATSAPP=false` e as mesmas credenciais Twilio do `.env`.

**Se o webhook retornar 500 no Vercel:** no painel do projeto → **Settings → Environment Variables**, confirme as mesmas chaves do `.env` local (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` ou `OPENAI_API_KEY`, `TWILIO_*`). O `.env` **não** sobe com o Git — sem essas variáveis o servidor devolve erro ao aceder ao Supabase ou à IA. Veja os **logs** da função em **Deployments → Functions** ou **Runtime Logs**.

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
- `imageUrl` — URL pública `http`/`https` opcional (OpenAI baixa a imagem).

**Comportamento:**

- Sem `message` nem `imageUrl` válida → envia a **mensagem inicial** de boas-vindas (não consome análise gratuita).
- Usuário gratuito com `usageCount >= 5` e `isPaid === false` → envia mensagem de **limite** e não chama a IA.
- Caso contrário → chama a OpenAI, incrementa `usage_count`, envia a resposta pelo WhatsApp.

## Pagamentos (futuro)

O arquivo `src/services/paymentService.js` reserva o lugar para webhooks e checkout; não há cobrança implementada.

## Estrutura

```
src/
  controllers/   # Orquestração HTTP
  services/      # Twilio, OpenAI, usuários, pagamento (stub)
  routes/
  models/        # Cliente Supabase e constantes do domínio
  middleware/
  utils/         # Tipo de mensagem, telefone, erros
```

## Limite gratuito

Constante `FREE_USAGE_LIMIT` em `src/models/userModel.js` (padrão: **5** interações com IA). Usuários com `is_paid = true` no banco não são bloqueados por esse limite.
