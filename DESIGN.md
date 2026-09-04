---
name: AG Assist
description: Assistente rural no WhatsApp — tokens compartilhados entre cadastro, planos e landing
colors:
  green-dark: "#2a382a"
  green-light: "#3d4f3d"
  bg-page: "#fdfcfa"
  bg-light: "#f6f3ec"
  text: "#3a3a38"
  text-muted: "#5c5c58"
  field: "#a97440"
  field-dark: "#8a5f36"
  field-soft: "rgba(169, 116, 64, 0.14)"
  card: "#ffffff"
  error-bg: "#fdecea"
  error-text: "#8a2a2a"
typography:
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
  display:
    fontFamily: "'Source Serif 4', Georgia, serif"
    fontWeight: 700
    lineHeight: 1.1
rounded:
  default: "6px"
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

Sistema visual alinhado à landing (`agassist.netlify.app`) e reutilizado em `/planos`, `/cadastro`, `/entrar` e `/area-do-cliente`. Paleta verde campo + acento terroso (field). Tipografia: Inter para corpo, Source Serif 4 para títulos. Logo CampoLead com texto de marca **AG Assist**.

Fonte de tokens: `public/planos/styles.css` (`:root`).

## Colors

| Token | Valor | Uso |
|-------|-------|-----|
| `--green-dark` | `#2a382a` | Header, botões primários, títulos |
| `--green-light` | `#3d4f3d` | Hover, acentos secundários |
| `--bg-page` | `#fdfcfa` | Fundo da página |
| `--bg-light` | `#f6f3ec` | Painéis secundários, stepper inativo |
| `--text` | `#3a3a38` | Corpo |
| `--text-muted` | `#5c5c58` | Hints, legendas |
| `--field` | `#a97440` | Foco, links, stepper ativo |
| `--field-soft` | `rgba(169,116,64,0.14)` | Feedback, seleção |
| `--card` | `#ffffff` | Cards e formulários |

## Typography

- **Corpo:** Inter 400, 1rem, line-height 1.65
- **Títulos (h1, h2):** Source Serif 4, 600–700, cor `--green-dark`
- **Marca no header:** Source Serif 4 700, ~1.15rem, ao lado do logo

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

- Border radius padrão: `6px` (`--radius`)
- Inputs e botões: min-height 44px (alvo de toque)
- Stepper: pills com número circular

## Components

### Header (`site-header`)

Logo CampoLead + `.brand-text` "AG Assist". Nav com links Início, Planos, Termos, Privacidade.

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

- Usar "AG Assist" em copy e `alt` do logo
- Manter trial "14 dias ou 10 análises" visível no hero
- Footer legal com Termos e Privacidade em fluxos de cadastro

**Don't**

- Expor "CampoLead" como nome do produto ao usuário
- Prometer "minha conta web" para usuários trial (portal é só assinante)
- Usar roxo ou paletas fora dos tokens definidos
