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
  $plan$[{"code":"basic","name":"Básico","priceBrl":29,"period":"mês","summary":"Orientação no dia a dia da roça: menos pesquisa solta, mais clareza para decidir sem enrolação.","bullets":["Um número de WhatsApp com análises ilimitadas (uso razoável no campo)","Lavoura, pecuária e sanidade em linguagem simples; calculadora integrada (calc ajuda)","Memória da conversa conforme a configuração do servidor"]},{"code":"pro","name":"PRO — melhor custo-benefício","priceBrl":59,"period":"mês","summary":"O plano que a gente quer que a maioria escolha: menos risco de erro, decisão melhor e tempo sobrando.","bullets":["Tudo do Básico + foco em resposta boa quando você mais precisa","Você não compra \"IA\": compra tranquilidade para não errar na hora H","Relatório em PDF da conversa quando estiver ativo no servidor"]},{"code":"premium","name":"Premium","priceBrl":119,"period":"mês","seats":3,"summary":"Para fazenda, família ou time: mais de um celular no mesmo plano, com o mesmo padrão de resposta.","bullets":["Tudo do PRO para até 3 números de WhatsApp no mesmo plano","Um responsável contrata; você define quem usa (painel administrativo)","Ideal quando várias pessoas mandam foto e áudio do mesmo talhão ou rebanho"]}]$plan$::jsonb,
  $notes$["Posicionamento: o produtor compra menos prejuízo por decisão mal informada e menos tempo perdido pesquisando — não compra \"tecnologia por tecnologia\".","Na página de planos, destaque visual no PRO (R$59): é o melhor custo-benefício para a maior parte dos produtores."]$notes$::jsonb
)
on conflict (id) do nothing;
