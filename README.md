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
   - O catálogo de planos (landing e `GET /api/plans`) fica na tabela **`plan_catalog`** no Postgres (Supabase), não no `.env`. Rode `supabase/migration_003_plan_catalog.sql` se ainda não estiver no seu banco; edite pelo painel `/admin` (seção Planos) ou pelo SQL Editor.

2. **Crie as tabelas** executando o SQL em `supabase/schema.sql` no **SQL Editor** do Supabase (inclui `users`, `chat_messages`, organizações, assentos e `plan_catalog`). Se o projeto **já existia** antes dessa versão, rode também `supabase/migration_002_organizations.sql` e `supabase/migration_003_plan_catalog.sql` conforme o que ainda não tiver aplicado.

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
| GET | `/admin/` | **Painel do proprietário** — dashboard, BI, usuários, organizações e histórico de mensagens |
| GET | `/area-do-cliente/` | **Portal do cliente** — login, plano, uso e gestão de números (titular empresa) |
| GET | `/api/plans` | Catálogo público de planos (JSON, sem login) |
| GET | `/admin/api/dashboard` | Resumo agregado (overview + analytics + organizações + avisos) — **recomendado** para o painel |
| GET | `/admin/api/analytics` | Métricas de BI (pagamento, mensagens, cadastros, top uso) |
| GET | `/admin/api/chat-messages` | Histórico paginado de `chat_messages` (com telefone) |

### Documentos legais (público)

- **`/legal/termos-de-uso`** — Termos de uso do AG Assist (HTML em `public/legal/termos-de-uso.html`).
- **`/legal/politica-de-privacidade`** — Política de privacidade / LGPD (HTML em `public/legal/politica-de-privacidade.html`).

Substitua os placeholders `[RAZÃO SOCIAL]`, `[CNPJ]`, etc. antes de divulgar em produção. Com **`PUBLIC_APP_URL`** definido no `.env`, a **mensagem de boas-vindas** no WhatsApp acrescenta links para esses documentos.

### Painel `/admin/` (gestão completa)

1. No **Supabase** → **Authentication** → **Providers**, mantenha **Email** ativo e crie um usuário (e-mail + senha) para você.
2. No `.env`, defina `ADMIN_EMAILS` com **o mesmo e-mail** (minúsculas; pode listar vários separados por vírgula).
3. Em **Authentication** → **URL Configuration**, inclua nas **Redirect URLs** a URL do painel, por exemplo `http://localhost:3001/admin/` e, em produção, `https://SEU-DOMINIO/admin/`.
4. Opcional: `PUBLIC_APP_URL` — URL pública do app (redirect do Supabase Auth, **links de Termos e Privacidade na boas-vindas do WhatsApp**, etc.). O painel `/admin` **sempre** chama a API no **mesmo host** da página; não use `PUBLIC_APP_URL` para apontar o painel a outro servidor.
5. Acesse `http://localhost:PORT/admin/` (ou `/admin` — redireciona para `/admin/`).

As rotas `/admin/api/*` (exceto `/admin/api/config`) exigem header `Authorization: Bearer <access_token>` do Supabase; o navegador envia isso automaticamente após o login.

### Área do cliente `/area-do-cliente/`

- Login por **e-mail + senha** cadastrados no checkout da página `/planos`.
- Defina `CUSTOMER_AUTH_SECRET` no `.env` para assinar sessão do cliente.
- API do portal:
  - `POST /api/customer/auth/login`
  - `GET /api/customer/me`
  - `POST /api/customer/seats` e `DELETE /api/customer/seats` (somente titular da conta empresa).

**Se o painel vier vazio ou der erro de coluna/tabela:** confira `SUPABASE_SERVICE_ROLE_KEY` no servidor, rode a migração SQL acima e confira se `ADMIN_EMAILS` inclui o e-mail com que você faz login.

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



Estou lançando o AG Assist: um assistente rural direto do WhatsApp.

Você manda texto, foto ou áudio e recebe orientação direta ao ponto: possíveis causas, o que observar, próximos passos seguros e quando chamar um profissional. Tudo 100% focado no agro.

Também é ótimo para estudantes (Agronomia, Vet, Zootecnia, Técnico Agropecuário) para estudar casos e treinar raciocínio de campo.

Quer testar? acesse o link abaixo e tenha 10 analises gratuitas para conhecer o seu novo assistente.

https://agassist.netlify.app

#agro #agtech #agricultura #pecuaria #veterinaria #zootecnia #agronomia #IA #Desenvolvimento #dev 


Dicas do que colocar nas imagens (carrossel)
Sugestão de 6–8 cards simples (pouco texto, bem legível):

Capa (promessa)
“AG Assist”
“Assistente rural no WhatsApp”
“Texto • Foto • Áudio”
Para quem é
Produtor / Gestor
Técnico / Consultor
Estudantes do agro
Como usar (3 passos)
Envie a situação
Mande foto/áudio (se tiver)
Receba orientação prática
O que você recebe
Possíveis causas
O que observar
Próximos passos seguros
Quando chamar um profissional
Exemplos de perguntas (bem prático)
“Folha manchada e amarelada — o que pode ser?”
“Bezerro com diarreia — o que observar agora?”
“Falha no pasto — causas mais comuns?”
Diferenciais / segurança
“100% focado no agro”
“Sem dosagens e sem receita”
“Orientação prática e responsável”
Benefício (valor)
“Mais clareza, menos achismo”
“Decisão mais rápida no campo”
“Evita prejuízo com ação errada”