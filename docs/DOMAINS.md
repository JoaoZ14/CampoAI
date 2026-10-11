# Domínios do AGGI

- `https://useaggi.com`: landing estática, hospedada separadamente do backend.
- `https://app.useaggi.com`: React e API Express no mesmo serviço Railway.
- `https://planos.useaggi.com`: opcional, planos e checkout no mesmo serviço Railway, com uma raiz própria.
- A API mantém `/api/*`; planos, conta, legal, admin e webhooks mantêm seus caminhos existentes.

## Código preparado

O React usa a raiz do subdomínio: `/`, `/cadastro`, `/:farmId/gastos` e `/:farmId/gastos/:id`. O Express entrega o HTML para acessos diretos e atualizações dessas páginas. Arquivos inexistentes e rotas desconhecidas de API/webhook continuam retornando 404, sem cair no HTML do app.

Os antigos `/app`, `/app/` e `/app/*` recebem redirecionamento 308 para os caminhos na raiz, preservando a query string. Fragmentos de autenticação são preservados pelo navegador. O hostname Railway anterior continua atendendo o serviço; os links publicados passam a usar o novo domínio. Não há redirecionamento automático de hostname, para permitir conferir o novo domínio antes de desativar endereços antigos.

`/cadastro` agora abre o fluxo React. `/entrar` continua disponível para o login legado/Google e retornos antigos de autenticação. `/area-do-cliente` permanece disponível para gestão da assinatura. O roteamento de domínios não exige migração de banco; a revisão atual de preços exige a migração 025 antes da publicação.

## Publicação e DNS

1. No serviço Railway que executa `CampoAI`, adicionar o domínio personalizado `app.useaggi.com`. Configurar no provedor DNS os registros de destino/verificação exatamente como exibidos pelo Railway e aguardar HTTPS ativo. [Documentação Railway](https://docs.railway.com/networking/domains/working-with-domains).
2. Na hospedagem da landing (Netlify, se mantida), adicionar `useaggi.com` como domínio principal. Aplicar os registros DNS fornecidos por essa hospedagem para o domínio raiz. Se usar `www.useaggi.com`, configurar também esse domínio e seu redirecionamento para `useaggi.com`. [Documentação Netlify](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/).
3. Publicar backend e build web juntos. Build Railway: `npm run build`; start: `npm start`. Publicar também as alterações de `CampoAILanding`.
4. Atualizar as variáveis públicas do servidor:

```env
PUBLIC_APP_URL=https://app.useaggi.com
SIGNUP_URL=https://app.useaggi.com/cadastro
PAYWALL_URL=https://app.useaggi.com/planos
WEEKLY_NEWS_MORE_URL=https://useaggi.com/#noticias
```

Não alterar chaves secretas para essa mudança. No build web, `VITE_API_BASE_URL` deve ficar vazio: o app usa a API na mesma origem. A landing consulta `/api/plans` e `/api/noticias` no subdomínio; o CORS existente do Express permite essas consultas públicas.

## Planos em outro subdomínio (opcional)

Não é necessário criar outro serviço ou outro processo Node. O Railway pode encaminhar dois domínios ao mesmo serviço/porta, e o Express escolhe a página pela combinação de hostname e caminho. Isso separa os endereços públicos, mantendo a API usada pelas telas na mesma origem de cada tela. Não constitui isolamento físico da API.

1. Em Settings → Networking → Public Networking do serviço CampoAI, adicione `planos.useaggi.com`, usando a mesma porta do domínio do app (a porta em `PORT`). No DNS, crie o CNAME e o TXT com os nomes e valores exatos fornecidos pelo Railway para esse domínio. Não copie o destino de outro domínio por suposição. Aguarde verificação e HTTPS. [Domínios Railway](https://docs.railway.com/networking/domains/working-with-domains).
2. Somente depois de publicar esta revisão e verificar o DNS, configure:

```env
PUBLIC_APP_URL=https://app.useaggi.com
SIGNUP_URL=https://app.useaggi.com/cadastro
PAYWALL_URL=https://planos.useaggi.com/
```

3. `/` no domínio do app abre o React. `/` no domínio de planos abre o checkout. Links antigos em `/planos?phone=...&origin=...` redirecionam para PAYWALL_URL, preservando os parâmetros. JS, CSS, login, API de checkout e conta legada continuam com seus caminhos no domínio de planos. `/cadastro` nesse domínio redireciona para o app. Páginas desconhecidas no domínio de planos não abrem o React.
4. Adicione `https://planos.useaggi.com/entrar` e `https://planos.useaggi.com/entrar?next=**` à allowlist de redirects do Supabase para o login legado/Google do checkout. O login do app e o login do checkout usam o mesmo cadastro, mas sessões do navegador não são compartilhadas automaticamente entre os subdomínios; pode ser necessário entrar novamente para assinar. Não transportar tokens na URL para contornar isso.
5. Os links atuais da landing para `app.useaggi.com/planos` continuam válidos pelo redirecionamento. Mude-os diretamente para o novo domínio somente depois que ele estiver acessível.

O plano Hobby do Railway permite dois domínios personalizados por serviço; Trial permite um. Se usar app + planos nesse serviço, mantenha os webhooks no hostname Railway existente para não exigir um terceiro domínio. O webhook Asaas continua `https://campoai-production-b7c7.up.railway.app/webhook/asaas`. [Limites de domínios Railway](https://docs.railway.com/networking/domains/working-with-domains).

## Quando a raiz retorna JSON

Uma resposta `404 {"ok":false,"error":"Rota não encontrada."}` vem do Express, não de uma página configurada no DNS. A versão antiga atendia apenas `/app/`. A versão atual entrega o React em `/`. Verifique no deployment Railway qual branch e commit estão efetivamente publicados: enviar commits a `main` não atualiza um serviço conectado a `production`.

O arquivo `railway.json` desta revisão define `npm run build`, `npm start` e healthcheck em `/health`. O build precisa gerar `app/dist/index.html`; não configure o root directory do serviço como `app`, porque o mesmo serviço executa o Express na raiz do repositório CampoAI. Verifique nos logs que o build do Vite ocorreu. `app/dist` não deve ser versionado para resolver esse problema. [Configuração Railway](https://docs.railway.com/config-as-code/reference).

Antes de publicar toda a revisão atual de `main`, aplique a migração 025 conforme `docs/PRICING_2026_10.md`: ela é exigida pelos novos preços/limites, não pelo roteamento de domínios.

## Supabase Auth

Em Authentication → URL Configuration:

- Site URL: `https://app.useaggi.com/`.
- Allowlist de Redirect URLs: `https://app.useaggi.com/`, `https://app.useaggi.com/cadastro` e `https://app.useaggi.com/entrar` (login legado/Google, incluindo suas queries).
- Para o retorno legado com destino variável, incluir `https://app.useaggi.com/entrar?next=**`; os destinos são validados como caminhos da mesma origem pelo cliente legado. [Configuração de redirects do Supabase](https://supabase.com/docs/guides/auth/redirect-urls).
- Manter temporariamente os retornos antigos do Railway, incluindo `/app/`, `/cadastro` e `/entrar`, para links de confirmação já enviados. Manter as URLs locais de desenvolvimento fora do fluxo público.

Confirmar que os modelos de e-mail personalizados do Supabase usam o link de confirmação fornecido pelo Auth, sem hostname antigo fixo. A confirmação de cadastro React agora retorna à raiz do app. Usuários que acessavam o hostname antigo precisarão entrar novamente no novo domínio; suas contas e registros permanecem os mesmos.

## Capacitor

`app/.env.native` usa `VITE_API_BASE_URL=https://app.useaggi.com`. O build nativo continua com assets relativos e HashRouter, sem carregar o site remoto como interface. Só gerar/publicar uma nova versão Android depois que o domínio/API HTTPS estiverem acessíveis. Não foram alterados o identificador do aplicativo nem os arquivos nativos já sincronizados.

## Conferência

- Abrir a landing e conferir Entrar, Criar conta, planos, termos e privacidade.
- Abrir `/cadastro`, criar uma conta de teste e conferir o retorno da confirmação de e-mail.
- Entrar e abrir diretamente uma página real de gasto; atualizar a página e usar voltar/avançar.
- Abrir um endereço antigo `/app/:farmId/gastos?category=combustivel` e verificar o redirecionamento com o filtro.
- Conferir login legado, planos e assinatura, sem efetuar cobrança no teste.
- Conferir `/health`, os endpoints usados pelo WhatsApp/Asaas e as consultas públicas da landing. Os webhooks antigos podem continuar no hostname Railway durante a transição; caso alterados nos provedores, manter exatamente os caminhos atuais.

Testes locais isolados: `npm run test:domains` e `npm run test:routes-ui`. Para o build nativo, usar `npm run build:native -- --outDir ../test-artifacts/native-build` e executar o teste de rotas com `NATIVE_APP_DIR=test-artifacts/native-build`. Esses testes usam dados fictícios e não enviam mensagens nem fazem chamadas à IA.
