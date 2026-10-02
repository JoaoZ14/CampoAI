# AG Assist / futuro AGGI — descoberta de produto

Data: 01/10/2026. Público inicial de pesquisa escolhido pelo fundador: produção diversificada, com horta, lavoura e pequenas criações, no Brasil. Esse recorte não limita o produto a essas atividades.

Atualização de escopo: o fundador pediu cobertura também para centros de treinamento de três tambores, criação de equinos e pecuária bovina. A estratégia de núcleo comum e módulos por atividade está em [AGRO_MODULAR_PLAN.md](AGRO_MODULAR_PLAN.md). A base de 13 perfis e os fluxos de cadastro, histórico, agenda e financeiro foram implementados localmente; funcionalidades e limites estão em [AGRO_MODULES_ROLLOUT.md](AGRO_MODULES_ROLLOUT.md). CTs e produtores de gado devem participar da descoberta. Utilidade e funcionamento em produção ainda exigem avaliação.

## O que sabemos e o que ainda é hipótese

Esta análise combina fontes públicas e leitura das capacidades locais do projeto. Ainda não entrevistamos produtores nesta etapa. As prioridades abaixo são hipóteses de produto, não um ranking estatístico de dores ou disposição a pagar. Documentos técnicos antigos ajudam a identificar atividades e registros; não medem a frequência atual dos problemas.

Pequeno produtor não é sinônimo de agricultor familiar. Para pesquisar, segmentar pela operação: trabalho individual/familiar, ajuda eventual ou equipe permanente; produção para consumo e/ou venda; número de atividades e canais de venda; registros existentes e acesso à internet.

Hipótese central: quem alterna entre várias atividades precisa registrar acontecimentos com pouco esforço, recuperar informações confiáveis e acompanhar compromissos.

## Dores e oportunidades levantadas antes da implementação modular

Os exemplos entre aspas são cenários fictícios para teste, não falas coletadas.

O diagnóstico abaixo registra a situação anterior à entrega modular. As lacunas de fichas, produção e vendas/recebimentos básicos receberam implementação; priorização, entregas, perdas, rateio e validação com usuários continuam pendentes.

1. **Dinheiro sem visão por atividade.** “Comprei diesel, sementes e ração; qual atividade está consumindo mais?” O Sebrae recomenda sistemas simples de controle de despesas e custos [1]. Já existem despesas, vínculos com talhão/safra e somas. Falta receita/venda/recebimento estruturado. Mostrar saídas e entradas com nomes claros; não apresentar saldo de caixa como lucro. Margens exigem critérios de custo, consumo próprio e rateio de despesas compartilhadas.
2. **Compromissos guardados na cabeça.** “Preciso lembrar da entrega e mudar o horário.” Já existem tarefas, lembretes e alteração pelo agente. Validar entrega real, confirmação de alteração, fuso e facilidade de correção no app. A hipótese é aliviar a carga de lembrar; sua importância precisa aparecer em relatos reais.
3. **Histórico espalhado de plantios e colheitas.** “Quando plantei esse canteiro? Quanto colhi?” As referências de olericultura descrevem várias operações de cultivo e comercialização [2]. Já existem talhões, ciclos e operações com data e quantidade. Evoluir canteiros, unidades compreensíveis, colheitas parciais, destino e perdas; datas estimadas não garantem maturação. Não somar kg, maços, caixas e unidades sem conversão definida.
4. **Vendas, entregas e pagamentos desencontrados.** “Entreguei alface para dois clientes; quem pagou?” Organização da saída da produção se relaciona com perdas e comercialização [3]. Não há módulo específico de pedidos, vendas e recebíveis. Registrar cliente, itens/unidades, valor, entrega, vencimento e pagamento parcial. Distinguir venda, recebimento e consumo próprio; o app não cria compradores por si só.
5. **Pequenas criações sem acompanhamento próprio.** “Quantos ovos vendi e quantos ficaram para casa?” A referência de manejo da Embrapa registra evolução do plantel e destino dos ovos [4]. Hoje há registros genéricos; falta modelo específico de lote/plantel, produção, consumo, perdas e movimentações. Começar com a criação mais frequente no grupo de teste, sem construir todos os módulos pecuários.
6. **Insumos que acabam ou somem do controle.** “Quanto de ração ainda tenho?” Já há estoque e movimentações. Validar entradas, consumo, saldo inicial, unidade e correção. Alertas dependem de saldo atualizado; não prometer reposição correta a partir de dados incompletos. Frequência desta dor ainda precisa de entrevista.
7. **Problemas de campo sem histórico útil.** “A mancha voltou; o que fiz da outra vez?” Já há ocorrências e mídia. Organizar fotos, datas, local, ações e evolução para recuperação e apoio técnico. Uma imagem pode apoiar a triagem; não garante diagnóstico. É fluxo mais caro de IA e deve ocorrer sob demanda.
8. **Planejamento diante do clima.** Já há integração meteorológica. Confirmar localização, atualização, fonte e capacidade real de entrega de alertas. Previsão ajuda a organizar uma decisão; não autoriza recomendação automática universal de manejo. Validar a relevância por atividade e região.
9. **Sistema trabalhoso com conexão ruim.** Pesquisa on-line realizada em 2020 identificou custos e conectividade como desafios entre os respondentes [5]. WhatsApp, confirmação curta e poucos campos são hipóteses de redução de atrito. O app atual bloqueia gravação sem conexão e pode perder rascunhos ao fechar; fila offline persistente e reconciliação ainda são trabalho futuro. Não afirmar que há suporte offline completo.

## Diferenças a testar entre operações

- Trabalho individual/familiar: captura rápida, áudio opcional, pouco cadastro inicial, linguagem comum e separação entre venda e consumo da casa.
- Operação com equipe: responsáveis, permissões, execução versus planejamento, histórico de alterações e comparação por unidade produtiva. Essas funções não devem ser anunciadas como prontas.
- O porte sozinho não determina o fluxo. Um pequeno produtor com muitos clientes pode ter maior complexidade de vendas que uma área maior com um único comprador.

## Recorte proposto para o próximo ciclo

**Três resultados para validar primeiro:** registrar o dia sem retrabalho; acompanhar compromissos; enxergar o dinheiro da produção.

1. Consolidar confiabilidade de despesas, operações e agenda que já existem. Pedido explícito deve gerar registro confirmado ou pergunta objetiva para completar informação; nunca confirmação sem gravação.
2. Se vendas e recebimentos aparecerem como dor recorrente nas entrevistas, construir um fluxo mínimo integrado ao registro de colheita: colheu, vendeu, recebeu. Essa é a principal lacuna financeira encontrada no código local.
3. Acrescentar controle de pequenas criações somente para a atividade mais frequente no piloto. Equipes, comparativos avançados e documentação para crédito ficam para uma fase posterior, conforme evidência.

Onboarding proposto: perguntar como chamar o lugar e o que o produtor faz; permitir o primeiro registro útil; completar localização e estrutura quando a ação precisar delas. Não exigir que descreva toda a propriedade antes de ter valor.

## IA e custo

Arquitetura proposta, ainda não implementada por este estudo:

- Formulário do app, gravação, consulta filtrada, somas, saldos e comprovante de ação: código e banco, sem necessidade de gerar uma resposta no Gemini.
- Mensagem informal: interpretar somente os dados necessários; perguntar apenas o que está faltando; confirmar com os dados efetivamente gravados.
- Histórico: recuperar fatos relevantes do banco, em vez de enviar toda a conversa e toda a propriedade a cada mensagem.
- Resumo e lembrete simples: modelos de texto com dados reais. Mensagens entregues pelo WhatsApp continuam tendo custos próprios de provedor.
- Fotos, áudio e dúvidas técnicas: IA sob demanda; medir consumo, erros e retrabalho antes de expandir automações. Nenhuma estimativa monetária sem volumes, modelo e tarifas verificadas.

## Entrevistas e piloto

Proposta exploratória: 8 a 12 entrevistas de 20–30 minutos. Incluir operações individuais/familiares e com equipe, diferentes canais de venda e condições de conectividade. A amostra serve para aprender, não para representar o Brasil.

Perguntas abertas sobre fatos recentes:

1. Conte como foi ontem: quais atividades você fez e com quem?
2. Qual foi a última compra? Onde anotou e como encontra isso depois?
3. Na última venda ou colheita, como acompanhou quantidade, entrega e pagamento? Se puder, mostre o registro sem dados pessoais de terceiros.
4. Qual foi a última coisa que precisou lembrar ou alterar? O que aconteceu?
5. Quando faltou insumo, perdeu produção ou recebeu informação errada pela última vez? O que já tentou para evitar isso?
6. Quem usa o celular para registrar? Em que lugares falta sinal? Costuma mandar áudio?
7. Qual pergunta sobre sua produção você gostaria de responder hoje e não consegue? Como resolve atualmente?

Não começar com “você usaria um app de IA?”. Registrar episódio, frequência relatada, consequência, solução atual e esforço. Pedir autorização antes de guardar fotos, áudios ou dados reais. Não enviar mensagens ou marcar entrevistas sem autorização do fundador.

Depois das entrevistas, piloto proposto de 14 dias com um único fluxo prioritário. Observar se o produtor registra espontaneamente, recupera a informação, corrige erros e resolve uma necessidade real. Separar uso espontâneo de uso provocado pela equipe. Verificar os registros no banco e medir chamadas/tokens e falhas por ação concluída. Conversar sobre continuidade e preço somente após o valor ser experimentado.

Critério de decisão: implementar o que aparece em episódios recentes de diferentes participantes e melhora uma tarefa observável. Se ninguém usa sem insistência, revisar o fluxo ou a hipótese. Não confundir elogio ao protótipo com demanda ou retenção.

## Fontes

[1] [Sebrae — Custos para produzir no campo](https://polosebraeagro.sebrae.com.br/solucoes/custos-para-produzir-no-campo/). Material de capacitação, sem medição de prevalência.

[2] [Embrapa — Produção de hortaliças para agricultura familiar](https://www.infoteca.cnptia.embrapa.br/infoteca/handle/doc/1020866?locale=pt_BR), 2015. Referência técnica e descrição das atividades.

[3] [Embrapa — Orientações quanto ao manuseio pré e pós-colheita de frutas e hortaliças visando à redução de suas perdas](https://www.infoteca.cnptia.embrapa.br/bitstream/doc/1003270/1/CT205finalizado.pdf), 2014. Referência sobre pontos de perda; não comprova redução de perdas pelo nosso app.

[4] [Embrapa — Galinha caipira: manejo produtivo](https://sistemasdeproducao.cnptia.embrapa.br/FontesHTML/AgriculturaFamiliar/RegiaoMeioNorteBrasil/GalinhaCaipira/manejoprodutivo.htm), janeiro de 2003. Usado apenas como referência de tipos de registro, não para prescrição sanitária atual.

[5] [Embrapa — Tendências, desafios e oportunidades da Agricultura Digital no Brasil](https://www.embrapa.br/en/busca-de-publicacoes/-/publicacao/1138840/tendencias-desafios-e-oportunidades-da-agricultura-digital-no-brasil), 2021, pesquisa on-line de 2020. Amostra de respondentes; não extrapolar percentuais para todos os produtores.

Capacidades do projeto: `src/rural/schemas.js`, `src/ai/tools/catalog.js` e `docs/QUALITY_CYCLE_01.md`, versão local em 01/10/2026. Capacidade em código não comprova funcionamento/configuração em produção. Este estudo não altera funcionalidades nem publica mudanças.
