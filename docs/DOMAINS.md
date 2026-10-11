# Domínios do AGGI

- `https://useaggi.com`: landing estática, hospedada separadamente do backend.
- `https://app.useaggi.com`: React e API Express no mesmo serviço Railway.
- A API mantém `/api/*`; planos, conta, legal, admin e webhooks mantêm seus caminhos existentes.

## Código preparado

O React usa a raiz do subdomínio: `/`, `/cadastro`, `/:farmId/gastos` e `/:farmId/gastos/:id`. O Express entrega o HTML para acessos diretos e atualizações dessas páginas. Arquivos inexistentes e rotas desconhecidas de API/webhook continuam retornando 404, sem cair no HTML do app.

Os antigos `/app`, `/app/` e `/app/*` recebem redirecionamento 308 para os caminhos na raiz, preservando a query string. Fragmentos de autenticação são preservados pelo navegador. O hostname Railway anterior continua atendendo o serviço; os links publicados passam a usar o novo domínio. Não há redirecionamento automático de hostname, para permitir conferir o novo domínio antes de desativar endereços antigos.

`/cadastro` agora abre o fluxo React. `/entrar` continua disponível para o login legado/Google e retornos antigos de autenticação. `/area-do-cliente` permanece disponível para gestão da assinatura. Nenhuma migração de banco é necessária.

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
