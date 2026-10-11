# Oferta 2026-10

Mensal: Essencial R$ 39 / 40 análises / 1 número; Starter R$ 79 / 100 análises / 1 número; Team R$ 179 / 250 análises compartilhadas / até 3 números; Business R$ 299 / 400 análises compartilhadas / até 5 números e contratação com CNPJ.

Anual: desconto de 20%, pago em uma cobrança. Totais R$ 374,40; R$ 758,40; R$ 1.718,40; R$ 2.870,40. A franquia continua mensal. Renova no primeiro dia do mês civil em America/Sao_Paulo, não acumula e não há cobrança automática de excedente.

## Como o uso conta

Cada pedido concluído usando IA conta uma análise, inclusive foto, áudio, relatório com IA e esclarecimentos processados pela IA. Falhas e respostas sem IA não contam. O app pode registrar, editar e consultar manualmente durante a assinatura ativa, sem consumir essa franquia. A definição comercial acompanha a contagem atual do agente; a simulação anterior usava pedidos como unidade de custo, não uma conversa inteira.

O servidor reserva uma análise antes de chamar a IA. A reserva e o contador usam a linha do titular, com bloqueio transacional no PostgreSQL: dois números não gastam a mesma última análise. Falhas ou respostas sem IA devolvem a reserva. Reservas abandonadas por interrupção do processo expiram após 30 minutos e são recuperadas na próxima tentativa. Os contadores são acessíveis apenas pelo servidor; anon/authenticated não podem invocar as funções.

Termos aceitos ficam em users.subscription_terms. O catálogo não altera retroativamente a franquia do cliente. O checkout compara preço, franquia e números mostrados ao usuário com a oferta vigente antes de cobrar. Se mudaram, exige atualizar a página. Falha de banco não autoriza cobrar um preço de fallback.

## Publicar

1. Faça backup do banco e suspenda novos checkouts e o processamento de mensagens durante a troca. Isso evita contratos criados entre a atualização de preço e a atualização do código, ou limites novos sendo lidos pela versão antiga do servidor.
2. No SQL Editor do Supabase, aplique supabase/migration_025_pricing_2026_10.sql após as migrações existentes. Também é necessária para um banco novo criado com schema.sql. Ela preserva os termos dos usuários já pagos antes de atualizar product_plans e plan_catalog. Pode ser repetida sem sobrescrever snapshots existentes.
3. Publique backend e landing desta revisão juntos, depois reabra o checkout e o processamento de mensagens. O backend precisa das novas colunas e funções antes de receber tráfego desta revisão.
4. Confira /api/plans: versão 2026-10, quatro ofertas, valores 39/79/179/299 e limites 40/100/250/400. Confira mensal/anual na página /planos.
5. Em sandbox, teste uma nova assinatura individual e uma Team/Business; confira snapshot, números autorizados, consumo compartilhado e mensagem ao atingir o limite. Não faça cobranças reais para testar.

A migração não chama o Asaas e não reajusta cobranças já contratadas. Clientes legados com ilimitado continuam com ilimitado. Um reajuste desses contratos exige uma decisão comercial separada; não faz parte desta entrega. Organizações legadas provisionadas manualmente sem titular conservam o modelo antigo e precisam de conciliação antes de converter sua assinatura.

## Margem

Valores e limites vêm da simulação aprovada, preservando uma opção de entrada e reservando margem para IA, mensagens, pagamento e suporte. A simulação não é faturamento real nem garantia de lucro: tokens por pedido, suporte, taxas da conta, tributos, inadimplência e custos fixos precisam ser medidos. As franquias limitam quantidade de pedidos; não impõem um teto monetário por chamada nem por token. Acompanhamento de consumo continua necessário, sobretudo para mídia e usuários legados com ilimitado.

## Verificação local

npm test inclui testes isolados de preços, cobrança anual, checkout desatualizado, migração repetida, preservação de legado, renovação, reembolso de falha, concorrência e acesso dos assentos. npm run test:pricing-ui verifica a vitrine e os valores no navegador sem enviar SMS ou cobrar. A landing tem npm run test:landing.
