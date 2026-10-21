# Pagamentos e acesso

Esta revisão separa a criação da recorrência da confirmação do pagamento. A
assinatura `ACTIVE` no Asaas, por si só, não libera o plano. Acesso pago depende
das cobranças confirmadas/recebidas da assinatura e do período que elas cobrem.

## Publicação

1. Confira o catálogo atual no banco. Esta migração não altera preços, planos,
   franquias nem assinaturas no Asaas. Não reaplique a migração histórica 025
   sobre um catálogo já atualizado: ela contém os preços daquela revisão.
2. Após a 025 **já instalada**, aplique
   `supabase/migration_026_asaas_payment_access.sql` pelo SQL Editor do Supabase.
   Em um banco novo, instale as migrações anteriores em ordem primeiro.
3. Publique o backend e os arquivos públicos juntos. A versão anterior ainda
   libera acesso ao criar a assinatura; não mantenha instâncias antigas rodando.
4. Configure `ASAAS_WEBHOOK_TOKEN` com o mesmo token do webhook no Asaas. Sem
   token o endpoint responde 503; token incorreto recebe 401. O endereço continua
   `https://campoai-production-b7c7.up.railway.app/webhook/asaas`.
5. No Asaas, habilite os eventos financeiros e de recorrência descritos abaixo.
   Confira nos logs da fila que as entregas recebem 200. Se a fila estiver
   pausada, corrija a causa e retome o envio pelo painel Asaas.
6. Valide o fluxo com credenciais e conta sandbox, sem usar cartões reais. A
   suíte local usa APIs simuladas e banco em memória; ela não substitui essa
   validação do ambiente configurado no Asaas.

## Eventos

Habilite `PAYMENT_CREATED`, `PAYMENT_UPDATED`, `PAYMENT_CONFIRMED`,
`PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_RESTORED`,
`PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`, `PAYMENT_REFUND_IN_PROGRESS`,
`PAYMENT_REFUND_DENIED`, `PAYMENT_RECEIVED_IN_CASH_UNDONE`,
`PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`,
`PAYMENT_AWAITING_CHARGEBACK_REVERSAL`, `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`,
`PAYMENT_AWAITING_RISK_ANALYSIS`, `PAYMENT_APPROVED_BY_RISK_ANALYSIS`,
`PAYMENT_REPROVED_BY_RISK_ANALYSIS`, `PAYMENT_AUTHORIZED`,
`PAYMENT_ANTICIPATED`, `PAYMENT_DUNNING_RECEIVED`, `SUBSCRIPTION_CREATED`,
`SUBSCRIPTION_UPDATED`, `SUBSCRIPTION_INACTIVATED` e `SUBSCRIPTION_DELETED`.

Eventos de outros produtos sem assinatura vinculada são ignorados. Quando o
cliente é deste app e o checkout ainda está gravando a assinatura, o endpoint
pede reenvio, para não perder uma confirmação que chegou cedo.

## Regras de sincronização

- Cada evento relevante consulta o estado atual no Asaas; o status de um evento
  antigo não reativa uma cobrança que já foi estornada.
- A sincronização de uma assinatura é serializada com uma reserva de cinco
  minutos. O registro do evento e a atualização do acesso são uma transação.
  Falhas recebem 503; eventos repetidos recebem 200 sem reaplicar a atualização.
- O histórico é consultado por páginas, sem consultar o Asaas em cada mensagem
  do WhatsApp. Limite operacional: mil cobranças por conciliação; históricos
  maiores exigem ajuste pelo suporte. Há timeout por requisição e por conciliação.
- Pagamento pendente, cartão apenas autorizado e aprovação de análise de risco
  não contam como pagamento confirmado.
- O período pago começa no vencimento da cobrança e termina no próximo ciclo,
  à meia-noite de Brasília. Fins de mês são ajustados ao último dia válido.
- O ciclo contratado fica registrado. Uma mudança posterior da recorrência no
  Asaas não transforma um pagamento mensal antigo em um ano de acesso.
- Cancelar/inativar a renovação preserva o período já pago. A aplicação e a reserva
  transacional de IA verificam a validade mesmo sem chegar um novo webhook.
- Estorno integral e chargeback retiram a cobertura do pagamento afetado.
  Estorno parcial não cancela toda a assinatura. Itens de estorno `PENDING` ou
  `CANCELLED` não são devoluções concluídas. Outras cobranças válidas continuam
  contando para o período coberto.
- Contadores mensais não são zerados ao receber eventos. Franquias, preços e
  condições aceitas continuam no snapshot do contrato.

## Tentativas interrompidas e recuperação

Antes de criar uma recorrência, o checkout procura uma assinatura com o
`externalReference` do usuário. Antes do POST, grava uma marca de resultado
incerto. Se a rede ou o banco falharem depois da criação, uma nova tentativa não
faz outro POST às cegas. A assinatura anterior só é recuperada quando valor,
ciclo e condições são compatíveis. Não são armazenados número do cartão ou CVV.

O suporte pode conferir uma assinatura já vinculada:

```powershell
npm run billing:reconcile -- --subscription sub_1234567890
```

Para recuperar uma tentativa incerta ainda sem ID local:

```powershell
npm run billing:reconcile -- --user UUID_DO_USUARIO
```

Substitua os identificadores dos exemplos pelos reais. O comando usa as
credenciais do ambiente: consulte o Asaas via GET e atualize o vínculo/acesso no
banco correspondente. **Não cria cobranças nem pede os dados do cartão.**

Se não houver uma correspondência única ou as condições forem diferentes, a
marca de incerteza é preservada. Confira os logs e o painel Asaas antes de liberar
outra contratação. Não limpe essa marca apenas para permitir um novo pagamento.

Contas legadas já pagas, ainda sem estado financeiro reconciliado, preservam as
condições anteriores. Para iniciar a verificação dos respectivos períodos, use
uma conciliação por assinatura; confira o ciclo atual no Asaas antes da primeira
conciliação de contratos legados que já tiveram mudanças manuais.

## Catálogo e telas

O checkout não tem catálogo alternativo com preços antigos. Falha da API, resposta
inválida ou catálogo marcado como fallback mostram um botão de tentar novamente.
O resultado do checkout mostra confirmação financeira somente quando
`paymentConfirmed` é verdadeiro. O SMS de confirmação só é prometido quando seu
envio terminou com sucesso. A área do cliente diferencia pagamento pendente,
atraso, período encerrado, cancelamento, estorno e contestação.

## Validação

- `npm test`: inclui testes financeiros com PostgreSQL em memória.
- `npm run test:pricing-ui`: catálogo, indisponibilidade e recuperação.
- `npm run test:checkout-ui`: login, SMS e pagamento simulados no navegador.

Referências: [assinaturas](https://docs.asaas.com/docs/assinaturas),
[eventos de cobrança](https://docs.asaas.com/docs/webhook-para-cobrancas),
[idempotência](https://docs.asaas.com/docs/how-to-implement-idempotence-in-webhooks),
[estornos](https://docs.asaas.com/docs/estornos).
