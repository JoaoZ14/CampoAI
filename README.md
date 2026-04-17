# AG Assist — Backend (Node.js)

API para o assistente rural **AG Assist** via WhatsApp: recebe mensagens (texto/imagem), consulta **Google Gemini**, controla limite gratuito no Supabase e responde pelo Twilio.

## Pré-requisitos

- Node.js 18+
- Conta [Supabase](https://supabase.com) (Postgres)
- Conta [Twilio](https://www.twilio.com) com WhatsApp (sandbox ou número aprovado)
- Chave **Gemini** (obrigatória): [Google AI Studio](https://aistudio.google.com/apikey)

## Configuração

1. **Clone/copie** `.env.example` para `.env` e preencha:

   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e **`SUPABASE_ANON_KEY`** (Settings → API no Supabase; a **service role** só no servidor; a **anon** é pública e usada pelo login do painel `/admin`).
   - **`ADMIN_EMAILS`** — lista de e-mails (separados por vírgula) que podem acessar o painel; devem ser os mesmos cadastrados no **Supabase Auth**.
   - `GEMINI_API_KEY` (crie em [AI Studio](https://aistudio.google.com/apikey)).
   - Opcional: `GEMINI_MODEL` — o padrão no código é `gemini-2.5-flash` (o `gemini-2.0-flash` deixou de estar disponível para contas novas na API). Para usar **Gemini 3 Flash**, defina o ID que aparecer na [documentação](https://ai.google.dev/gemini-api/docs/models/gemini) ou no AI Studio (ex.: `gemini-3-flash-preview` enquanto preview).
   - Opcional: **`PAYWALL_URL`** — link (https) incluído na mensagem quando o usuário gratuito **atinge o limite** de análises (ex.: página de planos ou checkout).
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (ex.: `whatsapp:+14155238886` no sandbox).

2. **Crie as tabelas** executando o SQL em `supabase/schema.sql` no **SQL Editor** do Supabase (inclui `users` e `chat_messages` para memória da conversa). Se o projeto já existia, rode só o bloco `chat_messages` do arquivo.

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
   - Para testar **só o backend** (WhatsApp + Supabase + contador) **sem chamar** o Gemini: `MOCK_LLM=true` no `.env`.

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api-docs` | **Swagger UI** — documentação e testes no navegador |
| GET | `/openapi.json` | Especificação OpenAPI (JSON) |
| GET | `/health` | Status do serviço |
| POST | `/webhook/whatsapp` | Teste com JSON (Postman / Swagger) |
| POST | `/webhook/whatsapp/twilio` | **Webhook do Twilio** — mensagens reais do WhatsApp |
| GET | `/admin/` | **Painel do desenvolvedor** — login Supabase (e-mail/senha) e visão de usuários |

### Painel `/admin/` (gestão)

1. No **Supabase** → **Authentication** → **Providers**, mantenha **Email** ativo e crie um usuário (e-mail + senha) para você.
2. No `.env`, defina `ADMIN_EMAILS` com **o mesmo e-mail** (minúsculas; pode listar vários separados por vírgula).
3. Em **Authentication** → **URL Configuration**, inclua nas **Redirect URLs** a URL do painel, por exemplo `http://localhost:3001/admin/` e, em produção, `https://SEU-DOMINIO/admin/`.
4. Acesse `http://localhost:PORT/admin/` (ou `/admin` — redireciona para `/admin/`).

A API do painel (`GET /admin/api/overview`, `GET /admin/api/users`) exige header `Authorization: Bearer <access_token>` do Supabase; o navegador envia isso automaticamente após o login na página.

### Twilio (produção / teste com número)

1. Suba a API com **HTTPS** (Railway, Render, ngrok, etc.).
2. No [Twilio Console](https://console.twilio.com) → seu número ou **WhatsApp Sandbox** → em **When a message comes in** configure:
   - **URL:** `https://SEU-DOMINIO/webhook/whatsapp/twilio`
   - **HTTP:** POST
3. Salve e envie mensagem pelo WhatsApp para o número do Twilio.

O Twilio envia `application/x-www-form-urlencoded` (não JSON). Use `MOCK_WHATSAPP=false` e as mesmas credenciais Twilio do `.env`.

### POST `/webhook/whatsapp`

Corpo JSON (exemplo Postman):

```json
{
  "phone": "+5511999999999",
  "message": "Minha laranjeira está com folhas amareladas",
  "imageUrl": "https://exemplo.com/foto.jpg",
  "audioUrl": "https://exemplo.com/audio.ogg"
}
```

- `phone` — obrigatório (será normalizado para formato `+` e dígitos).
- `message` — texto opcional.
- `imageUrl` — URL pública `http`/`https` opcional (o servidor baixa e envia ao Gemini como imagem).
- `audioUrl` — URL pública de **áudio** opcional (ogg, mp3, etc.; o Gemini processa o áudio multimodal).

**Comportamento:**

- Sem `message`, nem `imageUrl` nem `audioUrl` válidos → envia a **mensagem inicial** de boas-vindas (não consome análise gratuita).
- Usuário gratuito com `usageCount >= 10` e `isPaid === false` → mensagem de **limite**. Com **`PAYWALL_CONTENT_SID`** (template no [Content Template Builder](https://www.twilio.com/docs/content/create-templates-with-the-content-template-builder) do Twilio), o WhatsApp pode mostrar **botões embaixo da bolha**. Sem isso, usa texto + **`PAYWALL_URL`** (duas bolhas ou uma, conforme `PAYWALL_SINGLE_BUBBLE`).
- Pedido de **relatório/PDF da conversa** (só texto; intenções como “gera um relatório” ou “PDF do que falamos”) → gera PDF, envia pelo WhatsApp, incrementa uso (`REPORTS_ENABLED=false` desativa).
- Caso contrário → chama a IA, incrementa `usage_count`, envia a resposta pelo WhatsApp.

## Velocidade e Twilio

- **Twilio** (`/webhook/whatsapp/twilio`): por padrão o servidor **responde 200 ao Twilio na hora** e processa a mensagem em background — assim o Twilio **não corta** a conexão por timeout (~15s) enquanto o Gemini gera a resposta. Para depurar com o 200 só após o processamento completo, use `TWILIO_WEBHOOK_SYNC=true`. Há indicador de digitação (quando a API da Twilio aceitar) e mensagem opcional `WHATSAPP_IA_ACK_TEXT` antes da IA; se a IA falhar, o usuário recebe um texto de erro no WhatsApp em vez de silêncio.
- **Áudio (WhatsApp)**: mensagens de voz chegam como mídia `audio/*` no Twilio; o servidor baixa o arquivo e envia ao Gemini como entrada multimodal. **Vídeo** ainda não é analisado — o usuário recebe uma mensagem pedindo texto, foto ou áudio.
- **Gemini**: `LLM_MAX_OUTPUT_TOKENS` padrão **4096** (evita cortar no meio; até **8192** se precisar). Se no terminal aparecer aviso `MAX_TOKENS`, aumente esse valor no `.env`. Por padrão **não há retentativas no mesmo modelo** (`GEMINI_RETRY_ATTEMPTS=1`). Se o principal der **503**, o backend tenta em seguida **`gemini-2.5-flash-lite`** (ou `GEMINI_AUTO_FALLBACK_MODEL`). Opcional: `GEMINI_MODEL_FALLBACK` para um modelo extra na cadeia. `GEMINI_DISABLE_AUTO_FALLBACK=true` desliga o fallback automático. Para insistir no mesmo modelo após 503, aumente `GEMINI_RETRY_ATTEMPTS` e `GEMINI_RETRY_MS`.

## Pagamentos (futuro)

O arquivo `src/services/paymentService.js` reserva o lugar para webhooks e checkout; não há cobrança automática integrada. Para o **botão de URL embaixo da mensagem** (não só link azul no texto): no Twilio, **Messaging → Content Template Builder**, crie um conteúdo WhatsApp com botão do tipo **URL** (texto com `{{1}}`, URL com `{{2}}`), publique e copie o **Content SID** (`H…`) para **`PAYWALL_CONTENT_SID`**. Defina **`PAYWALL_URL`** para o endereço real; o backend envia `{{2}}` automaticamente (ou use **`PAYWALL_CONTENT_VARIABLES_JSON`** se o template tiver outros placeholders). Só `body` na API **não** gera esses botões.

## Estrutura

```
src/
  controllers/   # Orquestração HTTP
  services/      # Twilio, Gemini, usuários, pagamento (stub)
  routes/
  models/        # Cliente Supabase e constantes do domínio
  middleware/
  utils/         # Tipo de mensagem, telefone, erros
```

## Limite gratuito

Constante `FREE_USAGE_LIMIT` em `src/models/userModel.js` (padrão: **10** interações com IA). Usuários com `is_paid = true` no banco não são bloqueados por esse limite.

## Memória da conversa

Mensagens de texto trocadas com a IA são guardadas em **`chat_messages`** (últimas N linhas, padrão **24** — ajuste `CHAT_HISTORY_MAX_MESSAGES`). Isso alimenta o Gemini para **continuar o assunto** entre mensagens. Mídias entram no histórico como `[Foto enviada]` / `[Áudio enviado]`. Desative com `CHAT_HISTORY_ENABLED=false`. A apresentação longa (“sou o AG Assist”) continua só na **mensagem de boas-vindas**; o prompt pede para não repetir isso em cada resposta.

## Relatório em PDF

Se o usuário pedir um **relatório ou PDF da conversa** (ex.: “gera um relatório”, “quero um PDF do que conversamos”), o backend gera o texto com o **Gemini**, monta o **PDF** no servidor, faz **upload** no **Supabase Storage** e envia pelo **Twilio** como anexo (URL assinada). Exige **histórico** (`CHAT_HISTORY_ENABLED` ativo e pelo menos **2 mensagens** salvas antes do pedido). Desative com `REPORTS_ENABLED=false`.

**Supabase:** crie um bucket privado (nome padrão `reports`, ou defina `SUPABASE_REPORTS_BUCKET`). O cliente usa a **service role** — não é necessário tornar o bucket público; o Twilio recebe uma **URL assinada** válida por `REPORT_PDF_SIGNED_URL_SECONDS` (padrão 3600 s).
