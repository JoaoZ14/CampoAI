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
