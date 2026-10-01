# AG Assist — ciclo de qualidade 01

Data: 01/10/2026. Revisão e implementação locais, sem publicação ou alteração de dados reais.

## Objetivo e diagnóstico

AG Assist é o controle da operação; Lida é a assistente que trabalha pelo WhatsApp. A primeira prioridade é permitir ao produtor confiar no que aparece e no que foi salvo. O design existente foi preservado.

O app já tem uma base útil: quatro áreas de navegação, registros ligados à propriedade, despesas e tarefas com persistência no backend, histórico da Lida e interface adaptada ao celular. O backend possui validação de campos, isolamento por proprietário, RPC transacional, idempotência, auditoria e processamento durável de lembretes. Os testes existentes exercitam essas garantias em PostgreSQL local via PGlite.

Os maiores problemas encontrados estavam entre essas camadas: carregamento inicial confundido com ausência de fazendas, respostas atrasadas de outra propriedade, paginação incompatível com o tipo recebido por HTTP, mensagens técnicas expostas e formulários com proteção incompleta contra repetição. O atalho financeiro também reconhecia parte da frase e podia desconsiderar outra propriedade ou uma data informada.

## Ciclo A — integridade dos pedidos e da API

### P0: atalho de despesa podia perder informação do pedido

- Problema: a extração de combustível e valor ignorava partes adicionais da mensagem. Exemplos: “Registre 350 reais de diesel na Fazenda Sul” ou “... semana que vem”.
- Impacto: risco de gravar a despesa na propriedade ativa ou na data de hoje apesar da informação enviada.
- Decisão: restringir o atalho a uma frase inteira, simples e inequívoca. Os demais pedidos seguem para o agente e suas ferramentas; o fallback não significa que foram gravados.
- Implementado: gramática completa, rejeição de valores malformados, datas, condições, outra propriedade e valores adicionais. O pedido “consegue registrar para mim 350 reais de diesel que eu gastei?” continua suportado.
- Arquivos: `src/ai/agent/directExpense.js`, `test/rural.test.js`.
- Risco/limite: o caminho geral depende do modelo e das ferramentas. Ainda precisa de avaliação ampliada com conversas reais e falhas de provedores. O atalho informa explicitamente quando usa a data de hoje.

### P1: paginação falhava no contrato HTTP

- Problema: `?offset=50` chegava como string a um domínio que exige inteiro.
- Impacto: “Carregar mais” podia falhar em tarefas, atividades de campo e despesas.
- Implementado: conversão na fronteira HTTP, rejeição de parâmetros múltiplos/objetos, frações, negativos e valores acima do limite. Intervalos invertidos são rejeitados. Histórico ganha desempate por ID para datas iguais.
- Arquivos: `src/rural/httpQuery.js`, `src/routes/ruralRoutes.js`, `test/rural.test.js`.
- Validação: teste de 51 registros no banco local, páginas sem sobreposição e acesso negado para outro usuário; testes de parâmetros inválidos.
- Limite: paginação por offset pode deslocar páginas se houver inserções simultâneas. Cursor é a evolução indicada para históricos grandes.

### P1: erros de infraestrutura chegavam ao produtor

- Problema: `AppError` com status 500/503 podia expor mensagens de banco; cancelamento de tarefa lançava um erro comum que virava 500.
- Implementado: mensagens internas ocultas, código de erro e identificador de solicitação, cabeçalho `X-Request-ID`, cancelamento tratado como erro de domínio 400. Diagnóstico interno recebe a correlação.
- Arquivos: `src/app.js`, `src/middleware/errorHandler.js`, `src/routes/ruralRoutes.js`.
- Validação: erro de coluna não aparece no payload; instruções de correção 400 são preservadas.
- Limite: endpoints que respondem seus próprios erros, fora do middleware global, ainda precisam de revisão individual. Cadastro legado permanece fora deste ciclo de regressão.

## Ciclo B — confiança e recuperação no app

### P1: respostas de outra propriedade e falso estado vazio

- Problema: a tela podia mostrar registros da fazenda anterior sob o nome da nova. Antes de buscar propriedades, oferecia cadastrar a primeira fazenda.
- Implementado: carregamento inicial explícito, nova tentativa em falhas, cancelamento de consultas anteriores, verificação da propriedade selecionada e dados imediatamente ocultos na troca. Preferência de propriedade vinculada ao usuário. Troca de conta não reutiliza a tela carregada do usuário anterior.
- Resumo, agenda, histórico e clima são tratados separadamente; uma falha não descarta as outras respostas bem-sucedidas. Ausência de configuração do clima não vira uma mensagem técnica.
- Arquivos: `app/src/useFarmData.ts`, `app/src/App.tsx`.
- Validação: alternância rápida com respostas atrasadas, carregamento sem falso onboarding e histórico indisponível com agenda utilizável.
- Limite: o conjunto inicial ainda aguarda todas as consultas se resolverem, até o timeout; carregamento progressivo por seção é uma melhoria posterior.

### P1: repetição e confirmação incerta de gravações

- Implementado: bloqueio síncrono contra clique duplo; chave de idempotência preservada ao reenviar o mesmo pedido após falha; nova chave para uma nova ação; nenhuma repetição automática de escrita. Resposta HTTP 200 incompleta também é tratada como ausência de confirmação.
- Dados preenchidos permanecem após falha. Enquanto salva, a troca de propriedade e de tela fica bloqueada. Sem conexão, botões de gravação ficam desabilitados.
- Arquivos: `app/src/api.ts`, `app/src/App.tsx`, `app/src/FarmRecords.tsx`.
- Validação: clique duplo gera uma chamada; erro 503 e resposta HTML inválida mantêm o formulário; reenvio usa a mesma chave; uma nova despesa usa outra chave.
- Limite: rascunho e chave vivem em memória. Fechar ou recarregar o app pode perdê-los. A edição concorrente continua sem controle de versão/optimistic locking.

### P1/P2: configuração divergente e controles sem resultado útil

- Implementado: `/api/customer/workspace` retorna apenas vínculo, capacidades e contato público. A abertura do app deixa de consultar dados de cobrança. O número da Lida vem da configuração do servidor. Checkbox de lembrete respeita a flag e a configuração do template.
- “Abrir registro” mostra valor, data, descrição e demais campos reconhecidos, antes da correção rápida. O painel recebe foco e rolagem. Chevron sem ação foi removido dos resumos. Filtros de histórico deixam claro que atuam sobre os registros já carregados.
- Arquivos: `src/services/customerWorkspace.js`, controlador/rotas do cliente, `app/src/App.tsx`.
- Limite: as capacidades não substituem a verificação do backend em cada ação. Ter um template configurado não comprova sua aprovação ou entrega no Twilio.

### P2: acessibilidade, layout de erro e custo inicial

- Implementado: login em diálogo nativo, foco protegido, Escape e retorno ao botão de entrada; erro de credenciais em português; estado de filtro acessível; áreas de toque maiores; recuperação de erro ajustada ao celular. Troca de telas começa no topo. Redução de movimento preservada sem regra global de animação de 0,01 ms.
- Adicionada barreira de erro para evitar tela completamente branca em falha de renderização.
- Cadastro, registros e biblioteca de autenticação passam a carregar em arquivos separados. O arquivo principal caiu de aproximadamente 502 kB para 275,5 kB (84 kB gzip). A biblioteca de autenticação continua necessária ao abrir a sessão; isso não representa a mesma redução no total transferido.
- Arquivos: `app/src/App.tsx`, `api.ts`, `FarmRecords.tsx`, `ErrorBoundary.tsx`, `main.tsx`, `styles.css`.
- Validação: navegador em 1280 e 390 px; inspeção de login, início, agenda com falha, histórico e fazenda; detector da Impeccable sem ocorrências nos arquivos analisados.

## Jornada e próximos ciclos

Cada área tem uma responsabilidade: Início mostra o trabalho recente da Lida e a próxima ação; Atividade permite conferir o que foi alterado; Agenda organiza compromissos; Fazenda concentra contexto e registros. Cobrança permanece no portal legado. A separação atual ainda exige sair do app para algumas tarefas essenciais.

### P1 — fechar a gestão cotidiana

1. Cadastro e edição de talhões, safras e localização pelo app. Hoje esses dados são majoritariamente consultados e o usuário depende da Lida para completá-los.
2. Edição completa de despesa, incluindo valor, data e categoria, com auditoria. A correção rápida atual altera apenas a descrição.
3. Reagendamento e cancelamento com confirmação explícita e atualização do lembrete persistido. Hoje o cancelamento encaminha para WhatsApp.
4. Data/hora explicitamente no fuso da propriedade; hoje os formulários do app usam o fuso do dispositivo.
5. Rascunhos persistentes e detecção de edição concorrente para evitar perda de preenchimento ou sobrescrita silenciosa.

### P1 — validar o produto completo em ambiente controlado

- Cadastro e verificação, recuperação de senha, planos mensal/anual, checkout, webhooks e renovação precisam de regressão integrada. Não foram certificados por estes testes do app.
- Confirmar migrações efetivamente aplicadas, flags, templates aprovados, fila/worker e permissões de storage no ambiente de implantação. Testes locais não atestam o estado do Railway ou Supabase reais.
- Ampliar avaliação da Lida com pedidos ambíguos, primeira conversa, interrupções e retomada: fala do usuário → ferramentas → persistência → recibo → app. Validar áudio/foto com dados de teste consentidos.
- Revisar a sessão no dispositivo nativo, armazenamento de tokens, rate limits e políticas por endpoint. O ciclo confirmou regras rurais existentes, mas não constitui auditoria de segurança completa do sistema.

### P2 — escala e acabamento

- Busca/filtro de atividade no backend e paginação de talhões/safras, em vez de limitar a experiência às páginas carregadas.
- Agregações financeiras no PostgreSQL e resumo com payload menor. Hoje o total correto depende da leitura paginada de despesas pelo servidor, com custo crescente.
- Menos dependência de páginas legadas para conta, recuperação e planos; terminologia, estados de erro e retornos consistentes entre app e portal.
- Auditoria completa de contraste e tipografia, inclusive páginas legadas; teste com teclado virtual, leitor de tela e Android real. Build nativo web não equivale a teste do APK.

### P3 — depois da confiança operacional

Microinterações adicionais, personalização e refinamentos decorativos. Não adicionar cartões ou atalhos que não tenham uma ação implementada.

## Como verificar

Resultado desta rodada: 31 testes de domínio/banco e 30 verificações no navegador passaram. Os builds web e nativo web passaram, assim como a verificação de whitespace do diff. Estes resultados são locais; não representam certificação de produção ou de um APK instalado.

- `npm test`: suíte de domínio e PostgreSQL local.
- `npm --prefix app run build`: TypeScript e build web.
- `npm --prefix app run build:native -- --outDir ../test-artifacts/native`: build para Capacitor sem substituir o build web local. Para atualizar Android depois, usar o fluxo normal de build/sync do projeto.
- `npm run test:app-ui`: testes do app compilado com conta e APIs exclusivamente fictícias. Requer Playwright disponível (`PLAYWRIGHT_MODULE`, se externo ao projeto) e navegador instalado (`BROWSER_CHANNEL=chrome`, neste ambiente).
- Imagens da validação: `test-artifacts/app/`, ignoradas pelo Git.

Nenhuma migração nova foi necessária. Backend e frontend devem ser implantados juntos porque o app passa a usar `/api/customer/workspace`. A alteração é compatível com o portal existente, que continua usando `/api/customer/me`.
