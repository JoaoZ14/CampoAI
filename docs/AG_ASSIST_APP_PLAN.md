# AG Assist App — plano de produto e implementação

**Estado:** primeira implementação web em `app/`, com API de atividade em `/api/rural/farms/:farmId/activity`. **Premissa inicial:** titular da conta é o usuário da primeira versão; equipe e consultores entram após definir permissões. A Lida continua a conversa no WhatsApp. O app é a mesa de trabalho onde o produtor vê, controla e corrige o que foi feito.

**Já entregue nesta etapa:** login por e-mail e senha, seleção e cadastro de propriedade, Hoje com clima quando disponível, agenda com criação e conclusão de tarefas, visão da fazenda, histórico paginado de gravações e correção rápida de título/descrição/área em registros compatíveis. O portal antigo permanece. Empacotamento Capacitor, permissões de equipe, confirmações no app, push e sincronização offline ainda são próximas etapas.

## Promessa do produto

O produtor delega uma tarefa à Lida pelo WhatsApp: “anota o plantio de milho no Talhão Norte”, “me lembra de conferir a bomba amanhã” ou “quanto gastei nesta safra?”. A Lida registra ou consulta dados reais e devolve uma resposta curta. No app, o produtor encontra o registro, a origem, a hora e o estado da tarefa; pode corrigir o dado ou acompanhar o que ficou pendente. Cada ação deve terminar com um resultado verificável, não só com uma mensagem convincente.

O app também resolve tarefas rápidas sem conversa: consultar agenda, conferir custos, localizar um talhão, registrar uma atividade ou despesa, acompanhar estoque e abrir um relatório. A interface não precisa reproduzir o chat.

## Modelo de controle da Lida

Cada trabalho iniciado no WhatsApp deve ter uma trilha legível para o titular:

1. **Pedido recebido:** canal, horário e propriedade vinculada.
2. **Ação proposta ou executada:** tipo, campos relevantes e origem dos dados.
3. **Resultado:** concluído, aguardando confirmação, precisa de informação, falhou ou envio incerto.
4. **Próximo passo:** conferir registro, corrigir, confirmar, responder à Lida ou tentar novamente quando for seguro.

O app mostra a *ação* e seus dados, não precisa expor toda a conversa. Se não houver alteração persistida, nunca mostrar “registrado”. Operações ambíguas, cancelamentos, envios externos e alterações de maior impacto exigem regras de confirmação definidas no backend. A interface não deve prometer aprovação de ações antes de existir um fluxo persistente para isso.

## Primeira versão útil

| Área | O produtor consegue fazer | Base atual / trabalho necessário |
| --- | --- | --- |
| **Hoje** | Ver tarefas vencidas e próximas, alertas, clima da propriedade selecionada e últimas ações | `summary` e `weather` já existem; compor resumo orientado ao dia |
| **Atividade da Lida** | Ver o que foi registrado ou alterado, abrir o registro e entender falhas ou pendências | `assistant_actions` existe internamente; criar API autenticada de leitura, com escopo e redação seguros |
| **Propriedades** | Alternar fazendas; consultar talhões, safras e ciclos | API rural já lista e grava entidades; criar navegação e filtros claros |
| **Agenda** | Criar, reagendar e concluir tarefas; saber se haverá lembrete no WhatsApp | `farm_tasks` e worker existem; interface e estado do envio precisam ser expostos com cuidado |
| **Registros** | Consultar e corrigir atividades e despesas, com filtros de período/safra/talhão | API rural existe; construir formulários, validação e paginação |
| **Conta** | Ver conexão do WhatsApp, plano e acesso à gestão atual | `/api/customer` e portal atual; integrar gradualmente |

**Navegação mobile sugerida:** Hoje · Agenda · Fazenda · Atividade, com Conta no menu superior. Em desktop, a mesma estrutura pode usar navegação lateral. Na tela Hoje, uma ação visível “Falar com a Lida” abre o WhatsApp; “Registrar” oferece atalhos para tarefa, atividade e despesa.

**Primeiro teste de valor:** o produtor dita pelo WhatsApp uma atividade e uma tarefa, vê ambas no app em menos de um minuto, corrige um dado e conclui a tarefa no app. Esse fluxo precisa funcionar antes de adicionar novos módulos.

## Utilidades além do controle

Priorizar utilidades que aproveitam dados já existentes e trazem decisão diária:

1. **Agenda operacional:** tarefas por data, propriedade e talhão; lembretes realmente agendados. É a utilidade de maior frequência para o primeiro lançamento.
2. **Custos da safra:** despesas por período, categoria, talhão e custo/ha, sempre com escopo indicado. Já há totalização no backend.
3. **Clima da propriedade:** previsão com fonte, atualização e localização; exibir indisponibilidade quando não houver dado válido. O provider atual depende de configuração comercial em produção.
4. **Estoque e ocorrências:** saldos, mínimo, movimentações e acompanhamento de problemas de campo, após os fluxos principais estarem estáveis.
5. **Relatórios compartilháveis:** gerar a partir dos dados estruturados existentes, com filtros e indicação do que entrou no cálculo.

**Fase posterior:** fotos e documentos de campo, notificações push, uso offline com fila de sincronização, acesso por equipe/consultor e cotações. Cada item depende de regras adicionais de armazenamento, autorização, proveniência ou qualidade de dados; cotações nunca devem aparecer sem fonte, unidade e data.

## Arquitetura proposta

- Criar um frontend **React + TypeScript + Vite** dentro do repositório `CampoAI`, por exemplo `app/`, com build web independente do portal HTML atual. Reaproveitar identidade visual do `DESIGN.md`; manter componentes e tokens próprios do app.
- Usar a **API Express atual** como única porta de escrita e leitura operacional. O cliente envia JWT do Supabase Auth; autorização, flags, validação, trilha e idempotência continuam no servidor. Nenhuma chave `service_role` vai para React/Capacitor.
- Desenvolver primeiro no navegador e em viewport mobile. Preparar `apiBaseUrl` por ambiente, roteamento compatível com web e WebView, deep links de login/retorno e armazenamento de sessão apropriado antes do pacote nativo.
- Adicionar **Capacitor** sobre o build estático do React e sincronizar os assets no projeto Android/iOS. Recursos nativos entram por adaptadores pequenos com alternativa web (por exemplo câmera/upload); a lógica de negócio fica compartilhada.
- Na primeira versão, exigir conexão para gravar e mostrar claramente estado offline. Cache de leitura pode vir depois; fila offline de escrita exige IDs estáveis, resolução de conflitos e proteção contra duplicidade, então é uma etapa separada.
- Manter o portal antigo durante a migração. Redirecionar gradualmente as áreas operacionais para o app após testes; cadastro, checkout e admin não precisam ser reescritos neste projeto.

## Lacunas reais do backend antes de uma experiência confiável

1. **Linha do tempo do cliente:** existe auditoria de `assistant_actions`, mas a API rural não a expõe ao titular. Criar resposta específica para UI, paginada, limitada ao dono e sem payloads sensíveis.
2. **Estados de trabalho:** diferenciar ação persistida, confirmação pendente no contexto do WhatsApp, falha do processamento e resultado de envio de lembrete. Uma ação gravada não prova que uma mensagem chegou ao telefone.
3. **Confirmação pelo app:** decidir quais ações podem ser aprovadas ali. Se aprováveis, implementar pedido persistente, expiração e execução idempotente; o contexto temporário do WhatsApp não é suficiente para uma caixa de aprovações universal.
4. **Permissões de equipe:** dados rurais hoje são vinculados ao `owner_user_id`. Números adicionais de WhatsApp não equivalem automaticamente a acesso ao app. Antes de convidar equipe, definir papéis e autorização por propriedade.
5. **Contrato de dados do resumo:** `summary` contém listas recentes, não um histórico completo. A tela deve pedir páginas e filtros próprios para registros antigos e não chamar uma amostra de “total”.

## Ordem de entrega

1. **Contrato de produto:** mapear as 8–10 ações reais mais frequentes da Lida e quais precisam de confirmação; validar mapa de telas e textos com 2–3 produtores.
2. **Fundação web:** React, login, seleção de propriedade, layout responsivo, estados de carga/erro/offline, testes de navegação.
3. **Ciclo de confiança:** API de atividade + tela Hoje + detalhe de ação/registro + correção. Testar a jornada WhatsApp → app → correção.
4. **Utilidade diária:** agenda e tarefas, depois custos e registros de campo; medir uso real antes de expandir.
5. **Empacotamento:** Android primeiro, iOS depois; validar autenticação, deep links, teclado, safe areas, upload, rede fraca e atualização do app em aparelhos reais.
6. **Expansão:** permissões de equipe, notificações, offline e módulos adicionais conforme demanda observada.

## Critérios para liberar a primeira versão

- Uma ação da Lida aparece no app com propriedade, horário, resultado e link para o registro correto.
- Um dado corrigido no app é usado na próxima consulta da Lida; a alteração fica auditável.
- Usuário sem acesso a uma propriedade não consegue lê-la nem alterá-la pela API.
- Tarefas e despesas funcionam com datas, moeda e fuso brasileiros; listas grandes paginam.
- Estado sem dados, API indisponível, rede fraca e sessão expirada têm mensagens e saída claras.
- Testes reais no navegador mobile e no pacote Android cobrem login, retorno do WhatsApp, escrita e retomada após perda de conexão.

## Decisões pendentes

- Quem acessa o primeiro lançamento: só titular, equipe ou consultor? **Premissa atual: titular.**
- A primeira utilidade além do controle será agenda, custos, clima ou estoque? **Proposta atual: agenda.**
- Quais ações de maior impacto exigem confirmação no app, no WhatsApp ou em ambos?
- Como chamar “Atividade da Lida” na interface: “O que a Lida fez”, “Atividade” ou outro termo validado com produtores?
