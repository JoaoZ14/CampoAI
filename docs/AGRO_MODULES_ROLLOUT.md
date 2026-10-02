# Módulos agro — implementação e ativação

Atualizado em 01/10/2026. Código implementado e testado localmente; esta entrega não aplicou migrações, alterou variáveis ou publicou em produção. A marca permanece AG Assist e a assistente permanece Lida.

## O que foi entregue

Um estabelecimento pode ter várias atividades. Cada atividade usa fichas adequadas à operação, eventos com campos específicos, agenda e financeiro vinculados. Talhões antigos continuam disponíveis; cavalos, lotes, viveiros e colmeias não dependem de talhões fictícios.

Os 13 perfis são:

- **Horta e hortaliças:** canteiros, plantio, colheitas parciais, cuidados e histórico. Totais separados por kg, maço, caixa ou unidade.
- **Lavouras e grãos:** áreas, plantio, produção colhida, cuidados e custos vinculados. Safras/ciclos existentes continuam no fluxo anterior.
- **Fruticultura:** pomar, plantios, colheitas e histórico de cuidados.
- **Equinos e CTs:** ficha individual, identificação, proprietário informado, local, treinos em minutos, passadas em segundos e penalidades separadas, cuidados, alimentação, pesagens e observações reprodutivas.
- **Bovinos de corte:** animais e lotes, pesagens, entradas/saídas/baixas, alimentação e mudanças de local. Variação média diária calculada somente para um animal com pesagens em datas diferentes.
- **Bovinos de leite:** os registros anteriores e produção em litros, individual ou por lote, com manhã/tarde/noite ou total do dia. Um mesmo alvo/data não aceita total diário sobreposto às ordenhas.
- **Aves:** lotes, saldo do plantel, ovos em unidades inteiras, alimentação e baixas.
- **Suínos:** animais/lotes, pesagens, alimentação, entradas, saídas, baixas e histórico de cuidados.
- **Ovinos e caprinos:** espécie explícita, animais/lotes, pesagens, leite, alimentação, movimentos e cuidados.
- **Aquicultura:** viveiro/tanque, povoamento e baixas em número de animais, alimentação em kg, despesca em kg e observações.
- **Apicultura:** colmeia ou apiário, inspeções, mel em kg, alimentação e mudança de local. Saldo do apiário conta colmeias.
- **Silvicultura:** área, implantação, manutenção e colheita em m³, kg ou unidades, sem conversão presumida.
- **Outra atividade rural:** instalação/unidade de trabalho, observações, cuidados, locais, agenda, despesas e serviços. Sem indicador especializado.

Todos têm criação, consulta, correção e histórico. Produção, custos e saldos usam dados persistidos. Os registros anulados permanecem visíveis, mas saem dos totais. Repetição de uma mesma solicitação reaproveita a chave de idempotência.

Vendas/serviços guardam cliente informado, descrição, valor e vencimento. Recebimentos parciais são registros separados; não podem ultrapassar o valor devido. Despesas continuam separadas. Os saldos não são lucro nem rateio automático. Cancelar/reduzir uma venda que já recebeu dinheiro exige corrigir os recebimentos primeiro.

Consumo de alimento pode apontar um item de estoque **em kg**. Nesse caso, registro e baixa são uma transação; corrigir/anular o consumo ajusta o estoque na mesma transação. Sem vínculo, registra apenas o consumo relatado. Não converte saco, fardo ou galão automaticamente.

No app, abra **Fazenda → Suas atividades**. Escolha a atividade e a ficha; use Fichas, Histórico, Agenda ou Vendas e recebimentos. O formulário permite corrigir valores completos, datas e campos opcionais. A agenda permite alterar o dia/horário da mesma tarefa. A Agenda principal mantém a conclusão de tarefas. Datas/horários novos usam o fuso cadastrado no estabelecimento.

Os relatórios rurais também incluem os módulos. Filtros `activity_id` ou `production_unit_id` selecionam uma atividade/ficha; não combine com filtros de talhão/safra. `from` inclui a data inicial e `to` exclui a final. Sem filtro, o relatório da propriedade inclui registros antigos e módulos, explicitamente identificados.

## Como ativar

1. Confirme que as migrações **021, 022 e 023** já foram aplicadas. Faça backup conforme o procedimento do banco.
2. Aplique **supabase/migration_024_agro_modules.sql** uma vez no Supabase SQL Editor ou no processo de migração do projeto. É uma transação com novas tabelas, vínculos, índices, gatilhos e atualização do RPC auditado. Não reaplique migrações anteriores às cegas.
3. Publique o backend e o build React desta entrega, mantendo inicialmente `AGRO_MODULES_ENABLED=false`.
4. No ambiente do servidor, rode `npm run verify:agro-schema`. Essa checagem apenas consulta a presença de tabelas/colunas; não grava nem valida os gatilhos por si só.
5. Configure as capacidades abaixo e reinicie o serviço para carregar as variáveis.
6. Faça o roteiro funcional abaixo com uma conta/propriedade de teste. Use dados fictícios identificados como teste.

```dotenv
AGENT_TOOLS_ENABLED=true
AGRO_MODULES_ENABLED=true
EXPENSES_ENABLED=true
INVENTORY_ENABLED=true
```

`AGRO_MODULES_ENABLED` é nova e fica desligada quando ausente. Financeiro e consumo vinculado ao estoque respeitam suas próprias flags. `FARM_MEMORY_ENABLED`, `WEATHER_ENABLED`, `OCCURRENCES_ENABLED` e `FARM_MEDIA_ENABLED` continuam configurando as funções existentes.

Para envio de lembretes: `REMINDERS_ENABLED=true`, template aprovado em `REMINDER_CONTENT_SID` e worker rural em funcionamento (`npm run worker:rural`). Sem entrega configurada, a tarefa pode ficar na agenda; o app não oferece envio WhatsApp como disponível. Para PDF: `FARM_REPORTS_ENABLED=true` e bucket/armazenamento de relatórios já configurados. `REPORTS_ENABLED` é do relatório de conversa e não substitui a flag de relatório rural.

Para Capacitor, gere `npm --prefix app run build:native` e sincronize pelo fluxo Android existente. `VITE_API_BASE_URL` deve apontar para o backend acessível ao aparelho. Nesta entrega foi validado o build de assets para Capacitor; APK, instalação, assinatura e teste em aparelho não foram executados.

Se precisar desabilitar: defina `AGRO_MODULES_ENABLED=false` e reinicie o backend. Preserve tabelas e registros; não remova a migração nem restaure a versão antiga do RPC para apagar a ampliação. O fluxo antigo continua disponível, mas registros vinculados aos módulos aguardam reativação para edição.

## Roteiro de teste pelo WhatsApp

Envie uma mensagem por vez. Confira a resposta, abra o app e valide o registro antes da próxima. Se faltar um dado essencial ou houver nomes iguais, a Lida deve perguntar. Estes são cenários fictícios de aceitação, não uma conversa garantida do Gemini.

### CT

1. “Cadastre uma atividade de equinos chamada CT Serra Azul na minha propriedade.”
2. “Cadastre a Luna, égua de identificação LUNA-01, na atividade CT Serra Azul. O proprietário é João e ela está na baia 2.”
3. “Registre que hoje fiz um treino técnico de 25 minutos com a Luna. O cavaleiro foi Pedro.”
4. “Corrija esse treino para 30 minutos.”
5. “Registre uma passada da Luna na prova de treino de hoje: 18,42 segundos e zero segundos de penalidade, com Pedro.”
6. “Registre 180 reais de ferrageamento da Luna hoje na atividade CT Serra Azul.”
7. “Agende o próximo ferrageamento da Luna para 15 de outubro de 2026 às 9h.”
8. “Mude esse ferrageamento para 16 de outubro de 2026 às 11h.”
9. “Registre um serviço de treinamento da Luna para João: 500 reais, venda hoje e vencimento em 20 de outubro de 2026.”
10. “Registre que recebi 200 reais por Pix hoje desse serviço.”
11. “Mostre o histórico da Luna e quanto ainda tenho a receber desse serviço.”

Esperado: um animal, treino corrigido, passada com campos distintos, despesa vinculada, mesma tarefa remarcada, venda de R$ 500, recebimento de R$ 200 e saldo de R$ 300. O menor tempo medido e o menor tempo acrescido das penalidades informadas são indicadores diferentes; não são classificação oficial de prova.

### Gado, leite e operação diversificada

- Crie uma atividade de corte e cadastre um animal bovino com brinco 145. Registre duas pesagens reais em datas diferentes; confira a variação por dia. Não invente uma pesagem só para preencher indicador.
- Cadastre um lote de 20 bovinos, registre entrada de 2 e baixa de 1; saldo esperado 21. Corrija/anule a baixa e confira o saldo. Uma saída que gere saldo negativo deve falhar sem gravação parcial.
- Crie atividade leiteira e ficha de vaca ou lote. Registre 12,5 litros na ordenha da manhã e 8 litros à noite na mesma data: total 20,5 L. Tentar registrar também o total do dia nessa ficha/data deve ser rejeitado.
- Cadastre lote de 30 poedeiras e registre 18 ovos. Uma baixa de 2 deixa 28 aves e não altera ovos já produzidos. Ovos fracionários devem ser rejeitados.
- Cadastre viveiro com 1.000 peixes e registre 80 kg de despesca. O sistema não deduz número de peixes a partir dos kg; registre a saída de animais separadamente se esse número for conhecido.
- Cadastre colmeia e registre 12 kg de mel; não aceite caixas como unidade de mel. Canteiro de cebolinha pode registrar 20 maços e 4 kg, apresentados em totais separados.
- Crie estoque de ração em kg, dê entrada de 10 kg e registre consumo vinculado de 3 kg: saldo 7. Corrija para 4: saldo 6. Anule: saldo 10. Consumo além do disponível deve falhar sem alterar evento ou saldo.

### Falhas que precisam fazer parte do teste

- Nome de animal duplicado: identificar a ficha correta antes de gravar.
- Outra propriedade/cliente: negar acesso e vínculos cruzados.
- Mesmo webhook repetido: não duplicar registro.
- Falha antes ou depois da gravação: confirmar apenas o que está persistido; no app, manter o rascunho e repetir com a mesma chave enquanto o conteúdo for igual.
- Correção de recebimento acima do saldo: rejeitar, preservando os valores anteriores.
- Troca de atividade e de propriedade: não mostrar dados da seleção anterior como se fossem da atual.
- Dispositivo em outro fuso: salvar o horário da propriedade corretamente.

## Verificação local e custos

- `npm test`: 48 testes, incluindo a migração executada em PostgreSQL PGlite, registros, correções, unidades, isolamento, transações, permissões, relatórios e regressões anteriores.
- `npm run test:agro-ui`: 38 verificações em navegador desktop e mobile com login sintético, servidor isolado e serviço/banco reais locais. Testa cadastro, falhas/repetição, pagamentos, remarcação e leite. Exige Playwright instalado; o ambiente Codex usou o runtime já disponível.
- `npm run test:app-ui`: 30 verificações dos fluxos anteriores, com APIs interceptadas.
- Builds React web e assets Capacitor validados. Os testes não acionam Gemini, Twilio, pagamentos ou Supabase externos.

O agente usa seis ferramentas compartilhadas para os módulos, contratos consultados sob demanda e contexto inicial limitado a 30 atividades, sem carregar o rebanho inteiro. Resumos para o agente trazem até 20 fichas, com indicação de lista parcial. Os cálculos e saldos ficam no servidor; telas e banco não gastam tokens Gemini. Isso evita replicar um catálogo de ferramentas por espécie. Ainda falta medir tokens e custo por ação em conversas reais; esta entrega não comprova redução percentual nem estabelece novo teto de cobrança.

## Limites e próxima validação

Os fluxos acima têm evidência local. Não houve validação com produtor, treinador, veterinário ou uso real do Gemini/Twilio nesta entrega. Começar com contas de teste e usuários convidados antes de anunciar excelência universal.

Ainda precisam de planejamento e validação:

- Pertencimento de animais individuais a lotes e transferências de composição. Os grupos atuais têm saldo inicial + movimentos próprios; não somar suas contagens com fichas individuais para contar o mesmo animal duas vezes.
- Protocolos reprodutivos estruturados, genealogia, sanidade especializada, carências e prescrição. Hoje reprodução e cuidados são eventos relatados, sem automação clínica.
- Para leite, não registrar a mesma produção simultaneamente no lote e nas vacas individuais: a sobreposição entre fichas distintas não é deduplicada automaticamente.
- Regras oficiais de competição, classificação e dados completos de eventos esportivos.
- Rateio de despesas compartilhadas, custo por cabeça com população/período definidos, custos de produção e lucro. Despesas sem vínculo específico não devem ser atribuídas a uma ficha por suposição.
- Mensalidades recorrentes de hospedagem, contratos, cobrança ao cliente, entregas e controle fiscal. Vendas e recebimentos atuais são manuais; não geram cobrança Asaas nem emissão fiscal.
- Inventário com conversões declaradas, baixa automática por vendas e contagem automática em kg de despesca/colheita. Venda e movimento de estoque/plantel são fatos distintos.
- Permissões de equipe, conta externa do dono do cavalo e compartilhamento seletivo de fichas. Um nome de proprietário na ficha não dá acesso ao app.
- Fila offline persistente, reconciliação e sincronização em segundo plano. Rascunhos atuais não sobrevivem obrigatoriamente ao fechamento do app.
- Medições especializadas de água, biomassa, mortalidade percentual, produtividade, taxas reprodutivas e previsão de produção. O módulo genérico não fabrica esses indicadores.
- Teste de concorrência e volume em PostgreSQL remoto. Os gatilhos usam bloqueios para preservar saldos; o teste PGlite local não simula vários clientes concorrentes em produção.

Próxima etapa de produto: acompanhar um CT, uma operação de corte/leite e uma operação diversificada nos mesmos roteiros; registrar onde faltaram dados, quantas perguntas a Lida fez, correções necessárias, tempo até concluir e tokens por ação. Priorizar o que impediu trabalho real antes de adicionar novos indicadores.
