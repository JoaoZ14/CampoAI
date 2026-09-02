# Fluxo de desenvolvimento — AG Assist

Checklist por feature. Siga esta ordem para manter backend, banco, UI e deploy alinhados.

## Diagrama

```
PRODUCT.md (escopo) → código + migração → testes → UI (se houver)
    → critique/audit Impeccable → README + .env.example → deploy → smoke test
```

## Passo a passo

### 1. Definir no PRODUCT.md

- Nova capability, jornada ou restrição de produto
- Superfície afetada e modo (Persuade / Operate)
- Decisões de copy e marca (AG Assist + logo CampoLead)

### 2. Backend + migração

- **CampoAI:** controllers, services, routes em `src/`
- Migração numerada em `supabase/migration_NNN_descricao.sql`
- Atualizar `supabase/schema.sql` se for greenfield local
- **Nunca** editar migração já aplicada em produção

### 3. Testes

- Scripts em `scripts/` (`npm run test:*`)
- `MOCK_WHATSAPP=true`, `MOCK_LLM=true`, `MOCK_EMAIL=true` para testes locais sem custo

### 4. UI (quando aplicável)

- **CampoAI:** `/public/<superfície>/` (cadastro, planos, admin, área-do-cliente)
- **CampoAILanding:** só aquisição; consumir APIs do backend
- Reutilizar tokens de `public/planos/styles.css`

### 5. Qualidade de UI

- `/impeccable critique` ou `audit` em superfícies públicas
- Corrigir P0 antes de deploy

### 6. Documentação

- `README.md` — endpoints e setup
- `.env.example` — novas variáveis comentadas
- `docs/` — fluxos operacionais (e-mail, Twilio, produção)

### 7. Deploy

| Repo | Destino | Quando |
|------|---------|--------|
| CampoAI | Railway (`campoai-production-b7c7.up.railway.app`) | API, cadastro, planos, admin |
| CampoAILanding | Netlify (`agassist.netlify.app`) | Landing, CTAs |

**Coordenação de URLs:** mudou `SIGNUP_URL` ou `PAYWALL_URL`? Atualize CTAs na landing.

### 8. Smoke test

Ver [`PRODUCTION_CHECKLIST.md`](./PRODUCTION_CHECKLIST.md).

## Git

- Branch: `feat/nome-curto`
- Commits: `feat(signup): …`, `fix(analytics): …`, `docs: …`
- PR → merge em `main` → deploy

## Repositórios

| Pasta | Escopo |
|-------|--------|
| `CampoAI/` | API, WhatsApp, billing, cadastro, admin, portal assinante |
| `CampoAILanding/` | Landing estática, cotações, notícias (via API) |
| `iadoagro/` (raiz) | Workspace; `.impeccable`, skills — sem git na raiz |

## Artefatos de referência

- [`PRODUCT.md`](../PRODUCT.md) — verdade de produto
- [`DESIGN.md`](../DESIGN.md) — tokens e componentes visuais
- [`PRODUCTION_CHECKLIST.md`](./PRODUCTION_CHECKLIST.md) — deploy
