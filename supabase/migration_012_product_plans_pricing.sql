-- Atualiza preços e posicionamento em `product_plans` (vitrine/checkout).
-- Rode no SQL Editor do Supabase em projetos já existentes.
-- Ajuste `plan_catalog` no admin se os bullets ainda descreverem o plano PRO.

-- PF: um plano principal a R$49 (1 WhatsApp).
update public.product_plans
set
  name = 'Starter',
  price_brl = 49.00,
  summary =
    'Entrada no serviço: um número de WhatsApp, análises ilimitadas com política de uso justo e suporte no ritmo do seu trabalho.',
  max_whatsapp_seats = 1,
  highlight = true,
  sort_order = 1,
  active = true,
  updated_at = now()
where code = 'basic'
  and customer_segment = 'personal';

-- PF: equipe/família até 3 números.
update public.product_plans
set
  name = 'Team',
  price_brl = 119.00,
  summary =
    'Até 3 números na mesma assinatura: equipe ou família com o mesmo nível de serviço, gestão centralizada e previsibilidade de custo.',
  max_whatsapp_seats = 3,
  highlight = false,
  sort_order = 2,
  active = true,
  updated_at = now()
where code = 'premium'
  and customer_segment = 'personal';

-- PJ: até 5 números (única oferta ativa na aba Empresa se PRO estiver inativo).
update public.product_plans
set
  name = 'Business',
  price_brl = 199.00,
  summary =
    'Plano empresarial (CNPJ): até 5 números, faturamento e cadastro alinhados à empresa e o mesmo padrão de resposta para a equipe.',
  max_whatsapp_seats = 5,
  highlight = true,
  sort_order = 3,
  active = true,
  updated_at = now()
where code = 'premium'
  and customer_segment = 'company';

-- PRO: fora da vitrine (código ainda aceito em OTP/legado até você limpar fluxos).
update public.product_plans
set
  active = false,
  highlight = false,
  updated_at = now()
where code = 'pro';
