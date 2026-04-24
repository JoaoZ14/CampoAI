-- Business (CNPJ): aumenta assentos WhatsApp para 5 e valor mensal.
-- Rode no SQL Editor se a migration_012 já tinha sido aplicada com 3 números / R$ 119.

update public.product_plans
set
  price_brl = 199.00,
  max_whatsapp_seats = 5,
  summary =
    'Plano empresarial (CNPJ): até 5 números, faturamento e cadastro alinhados à empresa e o mesmo padrão de resposta para a equipe.',
  updated_at = now()
where code = 'premium'
  and customer_segment = 'company';
