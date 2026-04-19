-- Catálogo de planos (editável pelo painel /admin). Rode no SQL Editor se o projeto já existia.

create table if not exists public.plan_catalog (
  id text primary key default 'default',
  version text not null default '2026-04',
  plans jsonb not null,
  notes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint plan_catalog_singleton check (id = 'default')
);

comment on table public.plan_catalog is 'Catálogo de planos (uma linha id=default); leitura pública via API Node';

alter table public.plan_catalog enable row level security;

insert into public.plan_catalog (id, version, plans, notes)
values (
  'default',
  '2026-04',
  $plan$[{"code":"personal","name":"Pessoal","priceBrl":59,"period":"mês","summary":"Um número de WhatsApp com acesso ilimitado à IA (uso razoável no campo).","bullets":["Só o seu WhatsApp; sem cadastro de empresa","Após o checkout (quando integrar pagamento), o número liberado automaticamente","Memória da conversa e relatório em PDF conforme configuração do servidor"]},{"code":"family_team","name":"Família ou equipe","priceBrl":139,"period":"mês","seats":3,"summary":"Até 3 números de WhatsApp no mesmo plano (fazenda, família ou time pequeno).","bullets":["Um responsável contrata; você cadastra os 3 números que podem usar","Cada número com o mesmo tipo de acesso à IA","Gestão dos números pelo painel administrativo (AG Assist)"]},{"code":"business_team","name":"Empresa","priceBrl":379,"period":"mês","seats":10,"summary":"Até 10 números de WhatsApp para cooperativa, empresa rural ou consultoria.","bullets":["Até 10 números cadastrados pelo administrador do plano","Ideal para equipes que falam com produtores ou uso interno","Suporte à gestão de assentos pelo painel administrativo"]}]$plan$::jsonb,
  $notes$["Plano pessoal: o produtor usa só o WhatsApp; não precisa criar conta de empresa.","Planos equipe: a organização é só para gestão de números e cobrança — cada pessoa continua no próprio WhatsApp."]$notes$::jsonb
)
on conflict (id) do nothing;
