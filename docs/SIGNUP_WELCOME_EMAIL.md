# E-mail de boas-vindas (cadastro)

Enviado automaticamente após `POST /api/signup/complete` **quando o usuário informou e-mail** no formulário `/cadastro`.

O e-mail repete o tom acolhedor do WhatsApp e inclui um botão **Começar no WhatsApp** com o link `wa.me` do número do AG Assist (mesmo usado no site).

## Configuração (Resend)

1. Crie conta em [resend.com](https://resend.com)
2. **API Keys** → gere uma chave
3. **Domains** → adicione um **domínio que você controla** (DNS) e configure SPF/DKIM
4. No `.env`:

```env
RESEND_API_KEY=re_xxxxxxxx
SIGNUP_EMAIL_FROM=AG Assist <boas-vindas@seudominio.com>
```

5. Reinicie a API

### Domínio Netlify (`*.netlify.app`)

**Não funciona** como remetente no Resend: você não controla os registros DNS do subdomínio Netlify. Erro típico:

> The agassist.netlify.app domain is not verified

**Teste imediato** (sem verificar domínio):

```env
SIGNUP_EMAIL_FROM=AG Assist <onboarding@resend.dev>
MOCK_EMAIL=false
```

O Resend só entrega `onboarding@resend.dev` para o **e-mail da conta** com que você se cadastrou no Resend (não para qualquer Gmail). Confira em Resend → Settings qual é esse e-mail e use-o no teste:

```powershell
npm run test:signup-email -- --email SEU_EMAIL_DA_CONTA_RESEND --name "João"
```

**Produção:** compre/use um domínio (ex. `agassist.com.br`), aponte DNS no Resend e use `boas-vindas@seudominio.com`.

## Variáveis

| Variável | Obrigatória | Descrição |
|---|---|---|
| `RESEND_API_KEY` | Sim* | Chave da API Resend |
| `SIGNUP_EMAIL_FROM` | Sim* | Remetente com domínio verificado |
| `SIGNUP_EMAIL_ENABLED` | Não | `false` desliga envio (padrão: ligado se houver API key) |
| `MOCK_EMAIL` | Não | `true` só loga no console, sem enviar |

\* Obrigatórias para envio real. Sem elas, o cadastro continua funcionando; o e-mail é ignorado.

## Teste local

```bash
# Só loga no console (sem enviar)
npm run test:signup-email -- seu@email.com --mock

# Envio real via Resend
npm run test:signup-email -- seu@email.com

# Com nome customizado
npm run test:signup-email -- --email seu@email.com --name "João"
```

Ou com variáveis no `.env`:

```env
MOCK_EMAIL=true
RESEND_API_KEY=re_test
SIGNUP_EMAIL_FROM=AG Assist <onboarding@resend.dev>
```

## Comportamento

- Falha no e-mail **não bloqueia** o cadastro (mesmo padrão do fallback WhatsApp/SMS)
- Só envia se o campo e-mail foi preenchido no cadastro
- O botão usa `getSignupWhatsappOpenUrl()` — depende de `TWILIO_WHATSAPP_FROM` configurado

## Conteúdo

Assunto: `{Nome}, seu AG Assist está pronto`

Corpo alinhado ao template WhatsApp WELCOME_SIGNUP (sem mencionar limite de trial na primeira mensagem).
