# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primário:** produtor rural, gestor de fazenda, técnico ou consultor que está no campo e precisa de orientação prática sobre planta, animal e manejo — via WhatsApp, com texto, foto ou áudio.

**Secundário:** estudantes de agronomia, veterinária e zootecnia que querem treinar raciocínio de campo com casos reais.

**Operador interno:** proprietário do produto (painel `/admin`) que acompanha uso, assinaturas e organizações.

## Product Purpose

O **AGGI** é o sistema. No WhatsApp, a assistente se chama **Lida**. O usuário descreve uma situação (texto, foto ou áudio) e recebe orientação direta: possíveis causas, o que observar, próximos passos seguros e quando chamar um profissional. Não substitui receituário, ART ou parecer formal.

A Lida também executa pedidos operacionais: cadastrar propriedades e talhões, registrar atividades e despesas, consultar os dados já salvos e organizar tarefas. O app **AGGI** em `/app/` permite acompanhar essas ações e registrar atividades, despesas e tarefas diretamente. Um registro só é apresentado como concluído depois da confirmação de persistência; ambiguidades de propriedade, valores ou datas precisam ser resolvidas antes da gravação.

Com a migração 024 e `AGRO_MODULES_ENABLED=true`, uma propriedade pode organizar várias atividades e fichas de animais, grupos, áreas, viveiros, colmeias e instalações. Os 13 perfis incluem agricultura, equinos/CT, bovinos, aves, suínos, ovinos/caprinos, aquicultura, apicultura e silvicultura. Registros específicos, correções, agenda, vendas e recebimentos usam persistência auditada compartilhada entre app e Lida. O nível de cobertura e os limites de cada fluxo estão em `docs/AGRO_MODULES_ROLLOUT.md`; não há promessa de validação universal no agro.

**Sucesso** significa: usuário cadastrado usa o trial, entende o valor no campo e converte para plano pago quando o trial acaba — sem fricção desnecessária no cadastro nem abandono no OTP.

## Positioning

Focado 100% no agro, no canal que o produtor já usa (WhatsApp), com IA multimodal (foto e áudio no campo) e trial híbrido (14 dias **ou** 10 análises — o que acabar primeiro).

## Operating Context

- **Campo:** celular com internet; WhatsApp como único canal de atendimento do assistente.
- **Controle:** app React no navegador, com configuração para empacotamento Android pelo Capacitor. Sem conexão, alterações ficam bloqueadas; não há fila de gravação offline.
- **Aquisição:** landing em Netlify (`agassist.netlify.app`) → cadastro em `/cadastro` no backend.
- **Backend:** API Express no Railway (`campoai-production-b7c7.up.railway.app`).
- **Pós-cadastro:** boas-vindas no WhatsApp (+ e-mail opcional via Resend); uso bloqueado até `signup_completed_at`.
- **Conversão:** paywall ao atingir limite do trial → `/planos` → Asaas → portal `/area-do-cliente`.

## Capabilities and Constraints

O app `/app/` concentra Início, Atividade, Agenda e Fazenda. O histórico mostra alterações feitas pela Lida e pelo app, com consulta do registro e correção rápida de descrição, título ou área. Os módulos adicionam fichas, histórico, agenda vinculada e edição de vendas/recebimentos/despesas dentro da atividade. Gestão completa de talhões/safras, rateios e indicadores avançados continuam pendentes. Plano e cobrança da assinatura continuam no portal do cliente; registrar um serviço vendido pelo produtor não gera cobrança da assinatura.

Disponibilidade operacional depende das flags do servidor. A opção de lembrete só é oferecida quando a funcionalidade e o template de envio estão configurados. O link para a Lida vem do número público configurado no backend.

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
| Nome do produto | **AGGI** — sistema, copy institucional, títulos, planos, e-mails e UI |
| Nome da assistente | **Lida** — persona do WhatsApp. O sistema continua AGGI; só a assistente tem nome |
| Logo visual | **AGGI** — `aggi-lockup.png` (ícone + nome), `aggi-mark.png` (ícone) e `aggi-wordmark.png` (nome). Em fundo escuro, o nome vai em branco |
| Tom | Direto, prático, rural; sem jargão de IA; sem prometer dosagem ou receita |
| Legal | Termos e privacidade em `/legal/*` (placeholders legais ainda pendentes) |

## Evidence on Hand

- Landing publicada: `CampoAILanding/index.html`
- Critiques Impeccable: `.impeccable/critique/` (cadastro, landing)
- Docs operacionais: `docs/SIGNUP_WELCOME_EMAIL.md`, `docs/TWILIO_SIGNUP_TEMPLATES.md`, `docs/PRODUCTION_CHECKLIST.md`, `docs/DEV_WORKFLOW.md`
- Assets: `CampoAI/public/brand/`, `CampoAI/app/src/assets/brand/` e `CampoAILanding/assets/brand/`

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
