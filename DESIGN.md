---
name: AGGI
description: Assistente rural no WhatsApp — tokens compartilhados entre cadastro, planos e landing
colors:
  green-dark: "#17362d"
  green-light: "#285447"
  bg-page: "#f8f9f4"
  bg-light: "#edf1e7"
  text: "#20362e"
  text-muted: "#52645a"
  field: "#b8d66b"
  lime: "#bddb70"
  field-dark: "#214c34"
  field-soft: "#e2ebce"
  card: "#ffffff"
  error-bg: "#fdecea"
  error-text: "#8a2a2a"
typography:
  body:
    fontFamily: "'DM Sans', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
  display:
    fontFamily: "'DM Serif Display', Georgia, serif"
    fontWeight: 400
    lineHeight: 1.05
rounded:
  default: "14px"
  pill: "999px"
spacing:
  card-padding: "1.5rem"
  container-inline: "clamp(1.25rem, 5vw, 2.5rem)"
components:
  button-primary:
    backgroundColor: "{colors.green-dark}"
    textColor: "#ffffff"
    rounded: "{rounded.default}"
    padding: "0.7rem 1.2rem"
  button-secondary:
    backgroundColor: "{colors.bg-light}"
    textColor: "{colors.green-dark}"
    rounded: "{rounded.default}"
    padding: "0.7rem 1.2rem"
  card-panel:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.default}"
    padding: "{spacing.card-padding}"
---

## Overview

Sistema visual alinhado à landing (`agassist.netlify.app`) e reutilizado em `/planos`, `/cadastro`, `/entrar`, `/area-do-cliente` e `/legal`. Paleta verde campo com acento lima. Tipografia: DM Sans no corpo, DM Serif Display nos títulos. A marca é o logo **AGGI** (ícone da folha + wordmark). O admin mantém o visual interno anterior.

Fonte de tokens: `public/planos/styles.css` (`:root`).

## Colors

| Token | Valor | Uso |
|-------|-------|-----|
| `--green-dark` | `#17362d` | Títulos, texto de botão, foco |
| `--green-light` | `#285447` | Hover de texto |
| `--bg-page` | `#f8f9f4` | Fundo da página |
| `--bg-light` | `#edf1e7` | Faixas e stepper inativo |
| `--lime` | `#bddb70` | Botão primário |
| `--text` | `#20362e` | Corpo |
| `--text-muted` | `#52645a` | Hints, legendas |
| `--field` | `#b8d66b` | Destaque, não usar como cor de texto |
| `--card` | `#ffffff` | Cards e formulários |

## Typography

- **Corpo:** DM Sans 400, 1rem, line-height 1.65
- **Títulos (h1, h2):** DM Serif Display 400, cor `--green-dark`
- **Marca no header:** DM Serif Display 400, ~1.42rem, ao lado do logo

## Layout

- Container: `max-width: 1140px`, padding inline `clamp(1.25rem, 5vw, 2.5rem)`
- Formulários de cadastro: `max-width: 520px` centralizado
- Header sticky com safe-area (`env(safe-area-inset-*)`)
- Mobile: botões full-width abaixo de 480px em ações empilhadas

## Elevation & Depth

- `--shadow-sm`: `0 1px 2px rgba(42, 56, 42, 0.06)` — cards
- `--shadow-md`: `0 4px 14px rgba(42, 56, 42, 0.08)` — elevação moderada
- Bordas: `--border-subtle: rgba(42, 56, 42, 0.1)`

## Shapes

- Border radius padrão: `14px` (`--radius`); botões em pílula (`999px`)
- Inputs e botões: min-height 44px (alvo de toque)
- Stepper: pills com número circular

## Components

### Header (`site-header`)

Logo AGGI (`/brand/aggi-lockup.png`). Nav com links Início, Planos, Termos, Privacidade.

### Stepper (`signup-stepper`)

Dois passos: "Seus dados" → "Confirme o SMS". Estados: `.is-active`, `.is-done`.

### Botões

- `.btn-primary` — fundo verde escuro, texto branco
- `.btn-secondary` — fundo claro, borda sutil
- `.link-btn` — texto sublinhado, cor field-dark (reenviar código, alterar número)
- `.is-loading` — spinner no botão primário

### Formulário

Labels em negrito 500. `aria-invalid` com borda vermelha. `.field-error` abaixo do campo. Checkbox de termos com links para `/legal/*`.

### Feedback

`.feedback` — fundo field-soft; `.feedback.is-error` — fundo vermelho claro.

### Sucesso pós-cadastro

`#success-panel` substitui o form; CTA "Abrir WhatsApp" + link para landing.

## Do's and Don'ts

**Do**

- Usar "AGGI" em copy e `alt` do logo
- Manter trial "14 dias ou 10 análises" visível no hero
- Footer legal com Termos e Privacidade em fluxos de cadastro

**Don't**

- Expor "CampoLead" como nome do produto ao usuário
- Prometer "minha conta web" para usuários trial (portal é só assinante)
- Usar roxo ou paletas fora dos tokens definidos
