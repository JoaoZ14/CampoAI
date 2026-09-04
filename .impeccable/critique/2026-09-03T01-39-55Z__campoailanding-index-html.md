---
target: navbar landing
total_score: 19
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 2
timestamp: 2026-09-03T01-39-55Z
slug: campoailanding-index-html
---
# Critique — navbar landing (CampoAILanding/index.html)

Method: dual-agent (A: 4417c3f6-ee4d-4c79-949a-b8d6d6b5c3f3 · B: d7133111-25ea-43f7-b64f-674d9b2cab60)

Scope: sticky header, logo, `.header-nav-desktop`, `#menu-toggle`, `#menu` / `.nav-sheet`, links Entrar + Começar grátis.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Sem `aria-current` / estilo ativo nas âncoras; sheet sem move focus |
| 2 | Match System / Real World | 3 | Copy PT-BR ok; “FAQ” em inglês; WhatsApp ausente na chrome |
| 3 | User Control and Freedom | 3 | Scrim + fechar ok; handle sem swipe; sem focus trap |
| 4 | Consistency and Standards | 2 | Entrar igual visualmente a FAQ; raios CTA 6px vs 14px no sheet |
| 5 | Error Prevention | 2 | Novato pode ir em Entrar achando que é o começo |
| 6 | Recognition Rather Than Recall | 2 | Mobile: Entrar/CTA só no hamburger; logo sem wordmark |
| 7 | Flexibility and Efficiency | n/a | Persuade landing — chrome de aquisição |
| 8 | Aesthetic and Minimalist Design | 3 | Sticky limpa + um CTA; “Menu” genérico dilui |
| 9 | Error Recovery | 2 | Saída Railway `/entrar` sem ponte clara de volta |
| 10 | Help and Documentation | n/a | Persuade — FAQ é âncora, não ajuda da chrome |
| **Total** | | **19/32** | **Acceptable** |

## Design Specificity Verdict

**LLM:** Parcialmente AG Assist. Tokens (verde campo, field-soft no toggle, sheet de baixo) são do produto. A IA (Como funciona | Planos | FAQ | Entrar | Começar grátis) é template SaaS de trial. Logo = folha sem wordmark “AG Assist” no header, apesar do PRODUCT.md pedir texto adjacente.

**Deterministic scan:** `detect.mjs` exit 0 em modo **DEGRADED** (parsers HTML ausentes: htmlparser2/css-select/css-tree). JSON `[]` — undercount, não limpeza. Zero findings usáveis sobre nav.

**Visual overlays:** Browser visualization skipped — sem automação de browser nesta sessão.

## Overall Impression

Chrome competente, mas esconde o que importa no viewport do produtor: no mobile, **Entrar** e **Começar grátis** somem atrás do hamburger. Por isso parece que “não tem botão Entrar” se a pessoa olha só o sticky fechado. Maior oportunidade: CTA + conta persistentes no sticky ≤768px, e wordmark AG Assist no logo.

## What's Working

1. Bottom sheet mobile (polegar, alvos 52px, scrim, reduced-motion, aria no toggle) — campo, não dashboard encolhido.
2. Hierarquia quando os dois estão visíveis: Começar grátis (`.btn-primary`) pesa mais que Entrar.
3. Tokens na chrome (sem roxo genérico); skip-link e focus-visible corretos.

## Priority Issues

### [P1] Sticky mobile esconde conversão e Entrar
- **Why:** Usuário primário no celular. ≤768px some o desktop nav; só logo + toggle no topo. Entrar exige abrir menu → 4º item.
- **Fix:** CTA sticky visível + Entrar secundário visível (ou primeiro no sheet com peso de conta).
- **Suggested command:** `/impeccable adapt`

### [P1] Header sem wordmark “AG Assist”
- **Why:** Só folha + alt; pós-scroll a marca some. PRODUCT.md pede texto adjacente.
- **Fix:** lockup folha + “AG Assist” visível no `.logo`.
- **Suggested command:** `/impeccable layout`

### [P2] Entrar parece FAQ
- **Why:** Mesma tipografia/cor dos âncoras in-page; trabalho diferente (conta web).
- **Fix:** Cluster explorar | conta; Entrar muted ou btn-secondary; no sheet separado das âncoras.
- **Suggested command:** `/impeccable layout` (+ `/impeccable clarify` se label virar “Já tenho conta”)

### [P2] Sem estado ativo nas âncoras
- **Why:** Sticky não diz a seção atual.
- **Fix:** `aria-current` + underline field na seção visível.
- **Suggested command:** `/impeccable polish`

### [P3] Chrome web-login, produto WhatsApp
- **Why:** Canal real só no footer; header só Railway.
- **Fix:** Distill chrome (marca + um caminho) ou rótulo do sheet = AG Assist, não “Menu”.
- **Suggested command:** `/impeccable distill`

## Persona Red Flags

**Jordan:** Folha sem nome; Entrar vs Começar grátis confunde; 5 escolhas no desktop antes do hero.

**Casey:** Toggle fora da zona do polegar; Entrar invisível no sticky; Railway = outra origem.

**Produtor no campo:** Sheet ok, gatilho ruim; WhatsApp invisível na barra; Começar grátis soa app, não conversa.

## Minor Observations

- Gap 28px no desktop pode apertar em laptop estreito.
- Raios inconsistentes (6 / 12 / 14px).
- Sem focus trap no sheet; handle sem swipe.
- DESIGN.md ainda diz “portal só assinante” (stale vs PRODUCT atual).

## Questions to Consider

1. Se o produtor usa polegar, por que Começar grátis some do sticky no viewport que importa?
2. Por que Entrar tem o mesmo peso visual que FAQ?
3. A folha no sticky é marca ou favicon grande?
