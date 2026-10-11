# Página inicial do app

A tela “Seu resumo” reúne os registros da propriedade selecionada. Prioriza gastos do mês, tarefas, últimos registros confirmados e produção. Os detalhes continuam nas telas de registros, agenda e atividades.

## Dados e atualização

- `GET /api/rural/farms/:farmId/dashboard` consulta os dados existentes com autenticação e validação de propriedade. Não grava dados nem chama Gemini.
- Gastos e produção podem ser consultados por hoje, este mês, mês passado ou intervalo de até 366 dias. Os presets usam o fuso da propriedade. Datas personalizadas incluem o primeiro e o último dia na interface; a API usa `from` inclusivo e `to` exclusivo, com `period=custom`. Gastos somam centavos; produção permanece separada por ficha, tipo e unidade.
- A agenda contabiliza todas as tarefas pendentes e mostra primeiro as mais antigas, independentemente do período de gastos e produção. Os últimos registros também não são ocultados pelo período.
- O início mostra cada registro uma vez e consulta sua situação atual. O histórico das alterações continua disponível dentro dos detalhes, com paginação de 20 ações em `GET /api/rural/farms/:farmId/:entity/:recordId/history?offset=20`. Somente ações confirmadas do registro acessível são projetadas. A seleção dos cinco registros recentes examina até 1000 ações de escrita; não é uma contagem total de registros da propriedade.
- A troca de período cancela a consulta anterior e recarrega somente a dashboard; não repete consultas de clima ou usa IA.
- A carga do resumo não depende da conclusão da consulta de clima. O botão Atualizar e o retorno do navegador ao app recarregam os dados, com intervalo mínimo de 10 segundos entre atualizações automáticas.
- Ao trocar de propriedade, as solicitações anteriores são canceladas e os dados anteriores são retirados. Se uma atualização falhar, o app identifica os números mantidos como resultados da última consulta; uma falha inicial não aparece como saldo zero.
- Recursos indisponíveis para o usuário não são apresentados como totais zerados.

## Publicação e teste

Publique o backend e o build React juntos: o frontend utiliza a nova rota. Não há migração de banco adicional para esta tela. No Android, execute a sincronização Capacitor após o build nativo.

`npm test` inclui os testes de agregação, autorização, datas, unidades e projeção do histórico. `npm run test:dashboard-ui` usa autenticação e respostas fictícias, em quatro larguras, para verificar navegação, atualização, falhas, troca de propriedade e telas vazias sem modificar contas reais.

Para testar manualmente, peça à Lida para registrar um gasto e uma tarefa. Após a confirmação, abra a mesma propriedade no app, atualize o resumo e confira os registros e seus detalhes.

## Datas dos agendamentos no WhatsApp

O calendário da Lida contém data e horário locais e os dias de amanhã e depois de amanhã. Mensagens em fila mantêm a data de recebimento registrada pelo servidor. Antes de gravar ou reagendar uma tarefa com data relativa, o servidor confere o pedido usando o fuso da propriedade escolhida. “Amanhã às 9h”, recebido em 02/10 no horário local, é 03/10 às 09h. A conferência não faz chamadas à IA.

São tratados hoje, amanhã, depois de amanhã e daqui N dias, com horário explícito. Ao mudar somente o dia de uma tarefa existente, seu horário é mantido; “daqui N dias” sem horário preserva o horário local de referência. Um novo pedido “amanhã de manhã” sem hora exige esclarecimento. Horários inexistentes ou repetidos por mudança de horário de verão também exigem esclarecimento. Expressões mais complexas e datas absolutas continuam sendo interpretadas pelo agente e validadas pelo domínio.

A correção não altera automaticamente agendamentos antigos. Para corrigir um registro já salvo, solicite à Lida o dia e horário explícitos e confira seu comprovante.

## Navegação e primeiro uso

A aba Registros abre destinos por objetivo: Meus gastos, Minhas tarefas, Meus animais e áreas, Minha produção e Trabalhos do campo. Cadastros e produção dependem dos módulos habilitados; contas sem módulos usam Talhões e safras. O histórico geral de ações não é buscado na abertura do app. A API antiga continua disponível para compatibilidade.

Meus gastos consulta registros atuais, com paginação de 50 e os mesmos limites do período selecionado no resumo. Seus detalhes permitem corrigir descrição, valor e data. Minhas tarefas mostra explicitamente se há lembrete no WhatsApp e permite corrigir título, dia, horário e a opção de lembrete. A data usa o fuso da propriedade; alterar somente o horário preserva a opção de lembrete. Uma correção confirmada recarrega a lista.

O histórico de alterações fica nos detalhes de cada registro. Nos formulários dos módulos, a consulta ocorre somente ao expandir o histórico; uma falha nessa leitura não bloqueia a correção.

Quando o resumo não mostra trabalhos, gastos, tarefas ou produção, ele oferece um pedido guiado. A pessoa informa uma tarefa real e um horário para amanhã. Preparar o pedido só monta uma mensagem com o nome da propriedade; não salva dados e não envia WhatsApp. A pessoa revisa e envia no WhatsApp, confere a resposta da Lida e retorna ao app para atualizar. O pedido guiado informa expressamente que a tarefa ficará sem aviso automático.

Os comprovantes da Lida usam resultados confirmados e o nome da propriedade correspondente ao registro, mesmo quando outra propriedade estava ativa. Indicam onde consultar no app. Tarefa pendente informa lembrete ativado ou sem lembrete; concluir uma tarefa não promete aviso futuro. Depois de cadastrar uma propriedade, a resposta oferece uma primeira tarefa útil sem criar dados de exemplo.

Validação adicional: npm run test:clarity-ui usa contas e APIs fictícias para verificar navegação, edição de gastos, horário em outro fuso, preservação/desativação do lembrete, idempotência de correção e preparação do pedido sem gravação. npm run test:agro-ui valida o histórico nos módulos com PostgreSQL isolado.

## Leitura e caminhos simples

O app mantém quatro destinos: Início para conferir o resumo, Registros para encontrar o que foi salvo, Tarefas para saber o que fazer e Propriedade para animais, áreas e atividades. Gastos e trabalhos gerais têm uma única entrada em Registros; a tela Propriedade aponta para esse destino sem carregar uma segunda lista.

Abrir um registro no resumo, nos gastos ou nas tarefas apresenta uma página própria de detalhes. A pessoa toca em “Corrigir este registro” antes de receber os campos, em outro endereço. Cancelar descarta o rascunho sem gravar; salvar exige confirmação da API e volta aos detalhes atualizados. Falhas mantêm os campos e mostram o erro na página. O retorno à lista recupera os filtros do endereço de origem. O histórico é consultado somente quando expandido. Os formulários dos módulos continuam com suas validações específicas.

“Ajuda” e “Falar com a Lida” ficam disponíveis sem depender do menu de conta. A orientação explica pedidos no WhatsApp, consulta no app e correção, lembrando a propriedade selecionada. Com várias atividades, botões com o nome da criação ou plantação permitem escolher onde registrar; uma única atividade ativa já é selecionada.

As regras compartilhadas de leitura ficam em `app/src/accessibility.css`, depois dos estilos existentes: textos essenciais maiores, controles principais com pelo menos 48 px de altura, navegação com rótulos, foco visível, adaptação a telas estreitas e redução de movimento. O zoom do navegador permanece disponível. Login e cadastro permitem mostrar/ocultar a senha; o cadastro mostra “Passo N de 3” e impede envios simultâneos.

Os testes isolados verificam telas de 320 px, texto ampliado a 200% no resumo e em Registros, teclado nos detalhes, retorno do foco, cancelamento sem gravação, correções e lembretes. Eles não substituem teste com produtores. Para essa validação, peça a uma pessoa com pouca prática no celular, sem explicar o caminho, que encontre um gasto registrado pela Lida, confira a próxima tarefa e mude seu horário. Observe onde ela hesita antes de acrescentar novas telas.

## Tela Meus gastos

A tela mostra o total do período e, abaixo, os gastos do mais recente para o mais antigo. Cada registro apresenta categoria, data, descrição e valor em uma área inteira de toque. Abrir o registro permite conferir os detalhes e iniciar uma correção. Os filtros escolhidos são mantidos depois de salvar a correção.

O período inicial acompanha o Início; a pessoa pode escolher este mês, mês passado, últimos 30 ou 90 dias e todas as datas. “Filtrar” revela categoria e, quando existem, talhão e safra. Lista e total usam os mesmos filtros na API, inclusive para registros ainda não carregados na paginação. Um filtro sem resultados apresenta zero; falha de consulta apresenta total indisponível e opção de tentar novamente. As consultas usam os dados salvos, sem chamadas ao Gemini.

“Adicionar gasto” abre uma página de cadastro com valor, descrição, categoria e data. A data inicial usa o fuso da propriedade. Vincular a talhão ou safra é opcional. Valores como `350,25` e `1.234,56` são aceitos e enviados como números. Depois de receber a confirmação com o identificador, o app abre os detalhes do gasto criado; falhas mantêm o rascunho e a chave de idempotência para nova tentativa.

Os testes `test:app-ui` e `test:clarity-ui` verificam cadastro com vírgula e separador de milhar, falha e nova tentativa sem duplicação, filtros, totais vazios, correção sem perder filtros, tela de 320 px e texto ampliado a 200%. Usam contas e APIs fictícias. Para testar manualmente, registre um gasto pelo WhatsApp, confira o total e os detalhes no app, filtre a categoria e adicione um segundo gasto pelo botão da tela.

## Endereços e navegação

O React Router mantém os endereços web sob `/app`. A propriedade presente no endereço é a fonte da seleção; só são consultadas propriedades retornadas para o usuário autenticado. Um endereço de propriedade indisponível não é substituído silenciosamente por outra. A API continua responsável pela autorização de cada registro.

- `/:farmId`: Início; `/registros`: destinos dos registros.
- `/:farmId/gastos`: lista; `/gastos/novo`: cadastro; `/gastos/:id`: detalhes; `/gastos/:id/editar`: correção.
- `/:farmId/tarefas`: lista; `/tarefas/nova`: cadastro; `/tarefas/:id`: detalhes; `/tarefas/:id/editar`: correção.
- `/:farmId/trabalhos`: lista; `/trabalhos/novo`: cadastro; `/trabalhos/:id`: detalhes; `/trabalhos/:id/editar`: correção.
- `/:farmId/propriedade`, `/producao`, `/vendas`, `/agenda-da-propriedade`: seções das atividades. Os formulários específicos dos módulos ainda abrem dentro da seção.
- `/cadastro`: cadastro da conta. O login mantém o endereço solicitado e retorna a ele após autenticar.

Os filtros de gastos ficam na query string: `period`, `from`, `to`, `category`, `field_id` e `crop_season_id`. Detalhes abertos pela lista guardam o endereço de retorno. Um acesso direto sem origem oferece a lista correspondente. Trocar de propriedade em um detalhe abre a seção equivalente da nova propriedade, retirando o identificador do registro anterior. Endereços desconhecidos e registros removidos apresentam mensagens próprias. Voltar e avançar usam o histórico do navegador.

Cadastros e correções de gastos, trabalhos e tarefas avisam antes de abandonar um rascunho preenchido ou um envio em andamento. Recarregar a página também usa a proteção nativa do navegador. Não há gravação automática nem persistência de rascunhos no armazenamento local.

O servidor entrega o HTML do app na raiz de `app.useaggi.com` e nos acessos diretos às páginas. Endereços antigos sob `/app/*` redirecionam para o caminho sem esse prefixo, preservando os parâmetros. Arquivos JS/CSS inexistentes continuam retornando 404. O build web usa assets absolutos sob `/assets/`. API, webhooks e páginas de planos/conta/legal têm prioridade sobre o fallback do React. O build `native` usa assets relativos e roteamento por hash, compatível com a raiz local do Capacitor; não precisa de fallback do servidor para suas páginas. A alteração deve ser publicada com o backend para permitir atualizar links diretos em produção. Não exige migração de banco nem chamadas à IA.

`npm run test:routes-ui` verifica acesso direto, login preservando endereço, atualização, voltar/avançar, filtros, saída sem salvar, erros, propriedade indisponível, isolamento de registros e respostas atrasadas, com contas e APIs fictícias.
