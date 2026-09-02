-- Sincroniza plan_catalog com product_plans e src/config/plans.js (oferta 2026-04).
-- Corrige códigos legados (personal, family_team, business_team) e preços/bullets desatualizados.
-- Rode no SQL Editor se migration_012–014 já estiverem aplicadas.

update public.plan_catalog
set
  version = '2026-04',
  plans = $plan$[
    {
      "code": "lite",
      "name": "Essencial",
      "priceBrl": 29,
      "period": "mês",
      "summary": "Até 35 análises por mês com política de uso justo; um número de WhatsApp. Entrada com custo menor antes de subir para o Starter.",
      "bullets": [
        "Até 35 análises com IA por mês (renova todo mês em horário de Brasília)",
        "Um número de WhatsApp",
        "Conteúdo técnico em linguagem clara; calc ajuda integrada"
      ]
    },
    {
      "code": "basic",
      "name": "Starter",
      "priceBrl": 49,
      "period": "mês",
      "summary": "Entrada no produto: um número, previsibilidade de custo e análises ilimitadas com política de uso justo.",
      "bullets": [
        "Um número de WhatsApp com análises ilimitadas (uso justo)",
        "Conteúdo técnico em linguagem clara; calculadora integrada (calc ajuda)",
        "Memória da conversa conforme a configuração do servidor"
      ],
      "highlight": true
    },
    {
      "code": "premium",
      "name": "Team",
      "priceBrl": 119,
      "period": "mês",
      "seats": 3,
      "summary": "Até três números numa única assinatura: mesmo nível de serviço para quem divide o uso com equipe ou família.",
      "bullets": [
        "Até 3 números de WhatsApp no mesmo plano",
        "Um responsável contrata; você define quem usa (painel administrativo)",
        "Indicado quando várias pessoas enviam mídia e perguntas no mesmo fluxo"
      ]
    },
    {
      "code": "pro",
      "name": "Pro",
      "priceBrl": 59,
      "period": "mês",
      "summary": "Plano intermediário (legado): respostas mais completas e relatório em PDF quando o servidor oferecer.",
      "bullets": [
        "Um número de WhatsApp",
        "Respostas mais detalhadas quando necessário",
        "Relatório em PDF da conversa quando estiver ativo no servidor"
      ]
    }
  ]$plan$::jsonb,
  notes = $notes$[
    "Posicionamento: o cliente compra clareza e tempo — menos erro operacional e menos ida e volta na busca por informação.",
    "Na vitrine, o Essencial (R$29) é a porta de entrada com teto mensal de análises; o Starter (R$49) é ilimitado no mesmo espírito de uso justo.",
    "Bullets de assentos (ex.: até 3 números) são ajustados automaticamente pelo backend conforme product_plans (Team 3, Business 5)."
  ]$notes$::jsonb,
  updated_at = now()
where id = 'default';

-- Ordem de exibição na vitrine PF (lite → starter → team).
update public.product_plans
set sort_order = 2, updated_at = now()
where code = 'basic' and customer_segment = 'personal';

update public.product_plans
set sort_order = 3, updated_at = now()
where code = 'premium' and customer_segment = 'personal';

update public.product_plans
set sort_order = 1, updated_at = now()
where code = 'premium' and customer_segment = 'company';
