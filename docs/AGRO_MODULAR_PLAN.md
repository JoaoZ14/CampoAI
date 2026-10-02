# AG Assist / futuro AGGI — cobertura do agro por módulos

Data: 01/10/2026. Planejamento ampliado a pedido do fundador. A marca atual permanece AG Assist. As hipóteses de pesquisa continuam distintas das funcionalidades implementadas.

## Entrega local desta etapa

A base modular está implementada: 13 perfis, atividades e fichas, eventos com unidades específicas, correções, agenda vinculada, despesas, vendas e recebimentos parciais. App e Lida usam o mesmo serviço e a mesma persistência auditada. CTs e bovinos têm registros próprios; grupos, viveiros e apiários têm saldo derivado. Alimentação pode movimentar o estoque em uma transação.

Os testes locais não substituem avaliação de utilidade com usuários reais. Protocolos reprodutivos, composição de lotes, rateios, equipes e indicadores avançados continuam planejados. A ativação exige migração 024 e feature flag; produção não foi alterada nesta entrega. Consulte [AGRO_MODULES_ROLLOUT.md](AGRO_MODULES_ROLLOUT.md) para funcionalidades efetivas, limites, testes e sequência de implantação.

## Decisão de produto

O produto deve apoiar operações agrícolas, pecuárias e centros de treinamento e criação de equinos, inclusive quando coexistem no mesmo estabelecimento. Produção diversificada é um público acessível para pesquisa, não uma fronteira do produto.

Atender diferentes atividades exige uma base comum de gestão, módulos específicos e validação de cada fluxo. “Muito bem” significa que um usuário real consegue cadastrar, consultar, corrigir e acompanhar os dados relevantes à sua atividade, com confirmação fiel e testes de ponta a ponta. Conhecimento no prompt não comprova controle operacional.

## Situação encontrada antes desta etapa

- A Lida já tem instruções sobre agricultura, pecuária e equinos em `src/services/llmPrompts.js`. Isso permite orientação contextual, sem comprovar qualidade ou cobertura técnica de cada assunto.
- Há despesas, tarefas, estoque e operações genéricas. São úteis a diferentes operações quando configuradas e validadas.
- O modelo rural está concentrado em `farms`, `fields`, `crop_seasons` e `field_cycles`. Despesas e tarefas têm vínculos com talhão/ciclo; ocorrências exigem `field_id`.
- Não há entidades estruturadas para animais, lotes, pesagens, reprodução, produção de leite, treinos, provas ou clientes de hospedagem de equinos.
- Não há módulo específico de vendas, recebimentos e cobrança de serviços. Não anunciar custo por cavalo, ganho de peso ou rentabilidade de atividade com dados genéricos insuficientes.

## Núcleo comum proposto

1. **Estabelecimento e atividades:** fazenda, sítio ou CT pode ter várias atividades. O texto e as telas devem respeitar o contexto; um CT não precisa cadastrar uma lavoura para trabalhar.
2. **Pessoas e locais:** responsáveis, contatos externos, fornecedores e clientes; canteiros, talhões, piquetes, baias e instalações com tipos próprios. Contato do dono do cavalo não equivale automaticamente a usuário autorizado do sistema.
3. **Diário, agenda e documentos:** registros com data, atividade, autor, anexos e alvo claro; compromissos, correções e histórico.
4. **Financeiro:** despesas, receitas, vendas/serviços e pagamentos. Vínculos opcionais com atividade, animal, lote ou unidade de produção; rateio explícito de despesas comuns.
5. **Estoque:** entradas, saídas, unidades e ajustes. Consumo previsto e consumo realizado são informações distintas.
6. **Controle de acesso e confiabilidade:** isolamento por cliente, autorização, idempotência, auditoria e confirmação somente após gravação persistida.

Uma operação mista habilita vários módulos. Uma operação especializada vê apenas as funções pertinentes. “Outro tipo de atividade” pode ter diário e gestão básica, mas não deve receber indicadores especializados sem módulo validado.

## CT de três tambores e criação de equinos

Necessidades candidatas, a confirmar com gestores de CT:

- Cadastro individual do cavalo, identificação, proprietário, situação e baia/piquete.
- Histórico de entradas e saídas do CT; cavalo próprio versus hospedado ou em treinamento.
- Agenda e registro de cuidados realizados, alimentação informada pelo responsável, ferrageamento e atendimentos veterinários. Registrar planos orientados por profissional, sem inventar prescrição.
- Treino por cavalo e cavaleiro, data, duração, observações e situação de execução.
- Prova e resultados: evento, passada, tempo medido em segundos, penalidades em campos distintos e resultado oficial informado. Não supor regulamento de prova nem confundir duração do treino com tempo de passada.
- Custos diretos por cavalo, gastos comuns com critério de rateio e histórico de feno/ração.
- Clientes, serviços de hospedagem/treinamento, vencimentos e recebimentos.

Cenários fictícios de aceitação:

1. “Cadastre a Luna, minha égua, no CT Serra Azul.” Depois, consultar e corrigir a ficha pelo app e WhatsApp, sem criar talhão fictício.
2. “Marque o ferrageamento da Luna sexta às 9h.” Resolver a data no fuso do estabelecimento, confirmar a data completa e permitir mudança para 11h.
3. “Registre a passada da Luna na prova X: 18,42 segundos, sem penalidade.” Persistir o resultado, consultar o histórico e não tratar isso como receita ou quantidade de estoque.
4. “Paguei 180 reais pelo ferrageamento da Luna.” Criar uma despesa vinculada ao cavalo; repetição do webhook não duplica a gravação.

## Bovinos de corte e de leite

Necessidades candidatas:

- Identificação individual e/ou lote conforme o sistema de manejo, categoria, situação e localização.
- Entradas, nascimentos, transferências, vendas e baixas com histórico; mudança de lote não apaga a localização anterior.
- Pesagem com data e unidade. Ganho médio diário exige duas medições válidas, dias decorridos e definição clara da população comparada.
- Registro de eventos reprodutivos e acompanhamento dos compromissos informados pelo responsável.
- Histórico de cuidados e intervenções realizadas, com origem e profissional quando pertinente.
- Corte: composição de lotes, pesagens, consumo informado, custos e venda.
- Leite: produção individual ou por lote, unidade e intervalo explícitos, destino e venda. Não somar duas medições que representem a mesma produção.

Cenários fictícios de aceitação:

1. “O animal de brinco 145 pesou 320 kg hoje.” Identificar o animal do cliente e registrar a pesagem. Perguntar se a identificação for ambígua; não cadastrar outro animal silenciosamente.
2. “Transfira o lote de novilhas para o piquete 2.” Registrar movimentação e preservar o histórico, sem mexer no saldo de um insumo.
3. “Hoje o lote leiteiro produziu 180 litros.” Registrar no lote correto, com data, período e origem necessários para evitar sobreposição.
4. “Quanto gastei com o lote este mês?” Somar custos vinculados e explicitar os gastos não atribuídos; não fabricar custo por cabeça nem lucro.

## Outras atividades e crescimento

A mesma base pode receber módulos para aves, suínos, ovinos/caprinos, aquicultura, apicultura, fruticultura e outras atividades. Cada módulo precisa de entidades, unidades, eventos e indicadores próprios. Exemplos: colmeia não é lote bovino; tanque e biomassa não são talhão; produção de ovos não é produção de leite.

Não habilitar um módulo por meio de palavras adicionadas ao prompt. Para cada expansão, definir os três trabalhos mais importantes, implementar registros e consultas reais, verificar limites e testar com usuários daquele segmento. Novos segmentos podem usar funções comuns desde que os limites estejam claros.

## Arquitetura e evolução propostas

- Introduzir atividade do estabelecimento como vínculo transversal, preservando os registros existentes e os vínculos de lavoura. O campo textual `main_activity` não substitui múltiplas atividades estruturadas.
- Projetar identificação individual e lotes/grupos com eventos e histórico de pertencimento. Pequenas aves em grupo não exigem uma ficha para cada ave; equinos hospedados exigem identificação individual.
- Manter esquema e validação específicos por domínio; evitar uma tabela JSON genérica usada para calcular qualquer indicador.
- Conferir em servidor que todos os vínculos pertencem ao mesmo cliente/estabelecimento. Um ID citado pelo modelo não concede acesso.
- Migrar por acréscimo, com compatibilidade da API, backfill verificado e regressão dos fluxos atuais. Não renomear ou reaproveitar talhões como animais.
- Adaptar app, agente e relatórios ao mesmo contrato de capacidades. Feature flag habilitada não substitui teste de funcionamento e configuração.

Ordem: (1) atividades e vínculos comuns; (2) animais, grupos e eventos básicos compartilhados; (3) fluxos operacionais de CT e bovinos, além dos agrícolas atuais; (4) vendas, serviços e recebimentos associados; (5) indicadores e aprofundamento conforme validação. Os quatro primeiros têm implementação e evidência local nesta etapa; o quinto continua gradual. Não anunciar a ampliação como validada em produção antes de testar seus fluxos.

## Controle de tokens

- Selecionar ferramentas pelo pedido e pelas atividades do estabelecimento. Uma operação mista pode exigir mais de um módulo na mesma mensagem.
- Carregar apenas animais, lotes e fatos relevantes; nunca todo o rebanho em cada chamada.
- Gravações, cálculos, pesquisas, agenda e comprovantes ficam no código/banco. O modelo interpreta a mensagem e solicita os dados faltantes.
- Separar orientação técnica de execução administrativa. Ambos podem existir na mesma conversa, com consumo medido por ação concluída.
- Sem dados para cálculo ou módulo disponível, informar o limite com precisão; não produzir números ou simular gravação para parecer útil.

## Pesquisa e critérios de entrega

Incluir gestores de CTs, produtores de corte, produtores de leite e operações mistas nas entrevistas. Cobertura de um segmento exige demonstrar criação, leitura, correção e histórico de seus registros; simular repetição, ambiguidade, propriedade errada, falha de infraestrutura e envio de lembrete. Testes locais não certificam produção.

Registrar como planejado, experimental ou validado por fluxo, e não uma afirmação universal de suporte ao agro. Nenhuma promessa de desempenho excelente para todos os segmentos sem evidência.

## Referências

- [Embrapa — Identificação dos animais e registro de ocorrências](https://old.cnpgc.embrapa.br/publicacoes/doc/doc71/identificacao.html): referência histórica dos registros de bovinos, usada para tipos de dados e não para protocolo sanitário atual.
- [Embrapa — Gisleite](https://gisleite.cnpgl.embrapa.br/analisa_entrada.php): exemplo de gestão com identificação animal, reprodução, produção, movimentação e registros econômicos. Essas funcionalidades não passam automaticamente a existir no AG Assist.
- [Senar — Manejo de cavalos](https://ead.senar.org.br/cursos/manejo-de-cavalos): referência do domínio de manejo de equinos. As propostas de treinos, provas e hospedagem acima são hipóteses de produto, não recursos atribuídos a essa fonte.

Base técnica examinada: `src/rural/schemas.js`, `src/rural/service.js`, `src/services/llmPrompts.js`, `src/ai/tools/catalog.js`. Este documento amplia o plano; os módulos específicos descritos ainda não foram implementados.
