# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primário:** produtor rural, gestor de fazenda, técnico ou consultor que está no campo e precisa de orientação prática sobre planta, animal e manejo — via WhatsApp, com texto, foto ou áudio.

**Secundário:** estudantes de agronomia, veterinária e zootecnia que querem treinar raciocínio de campo com casos reais.

**Operador interno:** proprietário do produto (painel `/admin`) que acompanha uso, assinaturas e organizações.

## Product Purpose

O **AG Assist** é um assistente rural acessível pelo WhatsApp. O usuário descreve uma situação (texto, foto ou áudio) e recebe orientação direta: possíveis causas, o que observar, próximos passos seguros e quando chamar um profissional. Não substitui receituário, ART ou parecer formal.

**Sucesso** significa: usuário cadastrado usa o trial, entende o valor no campo e converte para plano pago quando o trial acaba — sem fricção desnecessária no cadastro nem abandono no OTP.

## Positioning

Focado 100% no agro, no canal que o produtor já usa (WhatsApp), com IA multimodal (foto e áudio no campo) e trial híbrido (14 dias **ou** 10 análises — o que acabar primeiro).

## Operating Context

- **Campo:** celular com internet; WhatsApp como único canal de atendimento do assistente.
- **Aquisição:** landing em Netlify (`agassist.netlify.app`) → cadastro em `/cadastro` no backend.
- **Backend:** API Express no Railway (`campoai-production-b7c7.up.railway.app`).
- **Pós-cadastro:** boas-vindas no WhatsApp (+ e-mail opcional via Resend); uso bloqueado até `signup_completed_at`.
- **Conversão:** paywall ao atingir limite do trial → `/planos` → Asaas → portal `/area-do-cliente`.

## Capabilities and Constraints

| Superfície | Modo | Função |
|------------|------|--------|
| CampoAILanding | Persuade | Aquisição, planos, FAQ, notícias |
| `/cadastro` | Operate | Conta web (Google ou e-mail) + OTP SMS + trial |
| `/entrar` | Operate | Login web (Google ou e-mail/senha) |
| `/planos` | Operate | Checkout com sessão Auth + OTP + Asaas |
| `/area-do-cliente` | Operate | Portal do cliente (trial e pago): plano, uso, dados, números |
| `/admin` | Operate | Backoffice do proprietário: dashboard, usuários/trials, assinaturas, orgs, conversas, planos, notícias, configurações |
| WhatsApp | Operate | Produto principal |

**Trial:** `FREE_TRIAL_DAYS` (padrão 14) e `FREE_USAGE_LIMIT` (padrão 10 análises).

**Portal e WhatsApp:** o assistente no WhatsApp só exige linha em `users` com telefone + `signup_completed_at`. Login web é opcional para abrir a área do cliente. A conta titular tem um número principal; números extras ficam em `organization_seats`.

**Terminologia técnica:** repositório backend = `CampoAI` (nome de código, não exposto ao usuário final).

## Brand Commitments

| Elemento | Uso |
|----------|-----|
| Nome do produto | **AG Assist** — copy, títulos, e-mails, WhatsApp, UI |
| Logo visual | **CampoLead** — arquivo `Logo CampoLead (1)-Photoroom.png`; `alt` e texto adjacente devem dizer "AG Assist" |
| Tom | Direto, prático, rural; sem jargão de IA; sem prometer dosagem ou receita |
| Legal | Termos e privacidade em `/legal/*` (placeholders legais ainda pendentes) |

## Evidence on Hand

- Landing publicada: `CampoAILanding/index.html`
- Critiques Impeccable: `.impeccable/critique/` (cadastro, landing)
- Docs operacionais: `docs/SIGNUP_WELCOME_EMAIL.md`, `docs/TWILIO_SIGNUP_TEMPLATES.md`, `docs/PRODUCTION_CHECKLIST.md`, `docs/DEV_WORKFLOW.md`
- Assets: logo CampoLead na landing e Netlify

**Não fabricar:** depoimentos, métricas de conversão, clientes nomeados ou benchmarks não documentados.

## Product Principles

1. **WhatsApp primeiro** — o produto vive no canal que o usuário já usa; web é cadastro, planos e gestão.
2. **Cadastro antes do uso** — sem `signup_completed_at`, o assistente direciona para `/cadastro`.
3. **Trial generoso e claro** — 14 dias ou 10 análises; comunicar os dois limites em toda superfície de aquisição.
4. **Orientação responsável** — apoio no campo, não laudo; reforçar quando chamar profissional.
5. **Degradar com dignidade** — falha de e-mail ou template WhatsApp não bloqueia cadastro; há fallbacks (SMS, texto livre).

## Accessibility & Inclusion

- Formulários com `aria-invalid`, `aria-live`, skip link e alvos de toque ≥ 44px.
- PT-BR em todas as superfícies públicas.
- Respeitar `prefers-reduced-motion` em animações de UI.
