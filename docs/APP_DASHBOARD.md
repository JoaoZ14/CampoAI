# Página inicial do app

A tela “Seu resumo” reúne os registros da propriedade selecionada. Prioriza gastos do mês, tarefas, últimos registros confirmados e produção. Os detalhes continuam nas telas de registros, agenda e atividades.

## Dados e atualização

- `GET /api/rural/farms/:farmId/dashboard` consulta os dados existentes com autenticação e validação de propriedade. Não grava dados nem chama Gemini.
- Gastos e produção usam o mês da propriedade, conforme seu fuso horário. Gastos somam centavos; produção permanece separada por ficha, tipo e unidade.
- A agenda contabiliza todas as tarefas pendentes e mostra primeiro as mais antigas. O histórico mostra ações de escrita bem-sucedidas e somente os campos públicos necessários.
- A carga do resumo não depende da conclusão da consulta de clima. O botão Atualizar e o retorno do navegador ao app recarregam os dados, com intervalo mínimo de 10 segundos entre atualizações automáticas.
- Ao trocar de propriedade, as solicitações anteriores são canceladas e os dados anteriores são retirados. Se uma atualização falhar, o app identifica os números mantidos como resultados da última consulta; uma falha inicial não aparece como saldo zero.
- Recursos indisponíveis para o usuário não são apresentados como totais zerados.

## Publicação e teste

Publique o backend e o build React juntos: o frontend utiliza a nova rota. Não há migração de banco adicional para esta tela. No Android, execute a sincronização Capacitor após o build nativo.

`npm test` inclui os testes de agregação, autorização, datas, unidades e projeção do histórico. `npm run test:dashboard-ui` usa autenticação e respostas fictícias, em quatro larguras, para verificar navegação, atualização, falhas, troca de propriedade e telas vazias sem modificar contas reais.

Para testar manualmente, peça à Lida para registrar um gasto e uma tarefa. Após a confirmação, abra a mesma propriedade no app, atualize o resumo e confira os registros e seus detalhes.
