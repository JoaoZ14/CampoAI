-- Notícias do landing (cache GNews no Postgres).
-- Rode no SQL Editor do Supabase após as migrations anteriores.

create table if not exists public.news_articles (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  title text not null,
  source text,
  published_at timestamptz,
  image_url text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint news_articles_url_unique unique (url)
);

create index if not exists news_articles_published_at_idx
  on public.news_articles (published_at desc nulls last);

create index if not exists news_articles_fetched_at_idx
  on public.news_articles (fetched_at desc);

comment on table public.news_articles is
  'Cache de notícias do agro para GET /api/noticias (landing). Atualizado sob demanda com TTL.';

alter table public.news_articles enable row level security;
-- Sem policies: só service role (backend) acessa.
