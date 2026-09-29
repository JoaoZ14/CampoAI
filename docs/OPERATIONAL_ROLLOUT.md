# Ativação do AG Assist operacional

## Estado desta entrega

Implementação local incremental. Não altera dados de produção, credenciais, plano, preços, OTP ou cadastro. As flags novas ficam desligadas quando ausentes. O caminho antigo de texto/Ollama, imagem/áudio Gemini e PDF de conversa continua disponível com o agente desligado. A calculadora agora usa seu motor numérico também no comando `calc` de cálculo. Templates de diagnóstico deixaram de ser obrigatórios em consultas simples.

## Fluxo

```text
Webhook Twilio → valida assinatura → inbox persistente (SID único) → HTTP 200
                                       ↓ worker Node
                         cadastro + trial + uso existentes
                                       ↓
                 Context Builder (usuário autenticado + fazenda + contexto)
                                       ↓
                  Gemini function calling ↔ catálogo de ferramentas
                                       ↓
                  validação + ownership → RuralService → Postgres
                                       ↓
                   resposta / PDF → histórico + contador + WhatsApp

Tarefa ou alerta autorizado → scheduled_jobs → claim/lock → template Twilio
Cliente web autenticado → /api/rural → mesmo domínio (não depende do Gemini)
```

## Banco e permissões

Aplicar, depois das migrations existentes até 020, **021_rural_domain**, **022_rural_transactions**, **023_rural_followups**, nessa ordem. Os arquivos estão em `supabase/`. São migrations de execução única, dentro de transações; não executar `schema.sql` para atualizar produção. O schema base permanece o bootstrap histórico; novas instalações aplicam também as migrations novas.

- Propriedades, membros preparados para evolução, talhões e aliases, safras/ciclos.
- Operações, despesas, tarefas, ocorrências/follow-ups, itens/movimentos de estoque.
- Contexto, memórias confirmadas, auditoria, anexos privados, regras/alertas, inbox/jobs e cache climático.
- RLS ativo e privilégios de anon/authenticated revogados nas tabelas novas. Somente backend com service role. O servidor obtém `public.users.id` de JWT vinculado ou número validado pela assinatura Twilio. Nunca do modelo.
- Nesta versão, somente o proprietário tem acesso rural. `farm_members` e `organization_id` preparam gestão compartilhada; assento comercial NÃO concede acesso automático à fazenda. Não há UI de equipes rurais.
- FKs compostas impedem vínculos entre fazendas; validação adicional confere ciclo/talhão/safra. Índices por fazenda/data, uniques, checks de saldo e valores.

`apply_rural_action` é RPC exclusivo de service_role. Faz ownership novamente, bloqueia colunas de controle, aplica lote e auditoria na mesma transação. Chave SHA-256 de argumentos canônicos + usuário + SID. Compra calcula em centavos no backend e registra despesa + movimento juntos; trigger movimenta saldo. Plantio registra ciclo e operação vinculados juntos. Atualizações guardam antes/depois no audit. Movimento de estoque é imutável: correção é movimento compensatório informado, não alteração do saldo.

## Configuração e rollout

**Primeiro contato da Lida:** o template Twilio `boas_vindas` aprovado ainda apresenta o produto como suporte a dúvidas. A nova versão `boas_vindas_lida_operacional_v1` (`HXd85352daec5453eba1c39aa00807bff2`) foi enviada para aprovação do WhatsApp em 2026-09-29. Depois de aprovado e com o agente operacional validado no servidor, trocar `WELCOME_SIGNUP_CONTENT_SID` para esse SID. Até lá, manter o template antigo ativo; o fallback em texto usa o modo realmente habilitado por `AGENT_TOOLS_ENABLED`. O primeiro contato com a Lida não cria plantios ou animais a partir de uma apresentação informal: pergunta o nome da propriedade e grava apenas após resposta que autorize o cadastro.

1. Fazer backup e aplicar migrations em homologação.
2. Rodar `npm ci`, `npm test` e `npm run test:signup-flow`.
3. Copiar as variáveis desejadas de `.env.rural.example` para a configuração do servidor; o arquivo `.env` existente não foi alterado.
4. Configurar `REMINDER_CONTENT_SID`: template utilitário aprovado, variável `{{1}}` contendo assunto solicitado. Sem template, a criação de lembrete falha explicitamente. O template é obrigatório fora da janela de conversa ([Twilio](https://www.twilio.com/docs/whatsapp/key-concepts)).
5. Executar processo persistente `npm start` (Railway/VPS). O worker inicia a cada 15 segundos, independentemente dos crons de notícias/trial. Em Vercel, usar um worker Node externo ou scheduler externo autenticado que execute `npm run worker:rural`; não confiar em execução após resposta serverless. Não há endpoint cron público.
6. Habilitar `AGENT_TOOLS_ENABLED=true` e os módulos por flags, em homologação primeiro. Validar o webhook real, template, clima e Storage antes de ativar em produção.
7. Para rollback funcional, desligar a flag do agente; **manter o worker de lembretes habilitado** enquanto houver compromissos pendentes. Dados permanecem no banco. Não remover tabelas para reverter o rollout.

O endpoint JSON `/webhook/whatsapp` exige admin em produção ou com agente ativo: fornecer telefone em JSON não é autenticação. `TWILIO_SKIP_SIGNATURE` não é aceito em produção. A rota Twilio passa a responder apenas depois de persistir inbox quando agente está ativo.

## Flags e providers

- `AGENT_TOOLS_ENABLED`: roteamento operacional e API/dashboard rural.
- `FARM_MEMORY_ENABLED`: fatos úteis confirmados; não substituem dados financeiros/operacionais.
- `EXPENSES_ENABLED`, `INVENTORY_ENABLED`, `OCCURRENCES_ENABLED`: ferramentas/módulos específicos.
- `REMINDERS_ENABLED`: lembretes/tarefas com envio e alertas autorizados de estoque.
- `FARM_MEDIA_ENABLED`: retenção de mídia relevante de ocorrências.
- `FARM_REPORTS_ENABLED`: PDFs com dados estruturados.
- `WEATHER_ENABLED`: WeatherService. Provider intercambiável com `resolveLocation` e `forecast`.

Open-Meteo usa coordenadas primeiro; sem coordenadas, geocodifica cidade/UF e recusa resultados ambíguos. Cache persistente de 30 minutos, timeout de 10 segundos, fonte/unidades/horário no resultado. Endpoint gratuito apenas para desenvolvimento; em produção requer `OPEN_METEO_API_KEY` e endpoint comercial ([licença e preços](https://open-meteo.com/en/pricing)). Não existe fallback com previsão fabricada.

MarketPriceProvider usa URL HTTPS configurada em `MARKET_PRICES_URL` e o contrato `cotacoes.json` já usado pela landing. Sempre devolve fonte, unidade, UF e data. Cotações com mais de três dias são marcadas antigas; não há série histórica fictícia. O arquivo de cotações encontrado na landing continha preços antigos: não apresentá-los como atuais. Histórico de preços e novos fornecedores não estão implementados nesta versão.

`GeminiAgentProvider` mantém o SDK instalado `@google/generative-ai`, usa function declarations e function responses ([documentação do provider](https://ai.google.dev/gemini-api/docs/function-calling)). Interface interna `inputParts`/`turn` e catálogo não dependem do provider. O caminho operacional usa Gemini; Ollama permanece no caminho legado, sem adaptação de tools nesta entrega. Até 8 rodadas, 24 chamadas de ferramenta e 8 turnos recentes, com contexto rural limitado. Não há mock de IA em produção no caminho operacional.

## Persistência e entrega

Inbox deduplica SID antes de qualquer processamento. Em múltiplos workers, `FOR UPDATE SKIP LOCKED` reserva mensagens/jobs e serializa mensagens pendentes do mesmo telefone. A ação tem deduplicação transacional adicional. Mensagem interrompida após começar fica `uncertain`: um operador deve conferir ações e envio antes de reprocessar. Não repetir automaticamente uma conversa parcialmente executada.

Jobs passam por pending → locked → sending → completed. Lock expirado antes do envio é recuperado. Após iniciar envio, timeout/crash vira `uncertain`; não há reenvio cego. Banco e Twilio não compartilham transação: **não se promete exactly-once absoluto de entrega externa**. Essa escolha evita duplicação por resultado de envio desconhecido, com intervenção manual nos casos incertos. `completed` significa aceito pelo Twilio, não confirmação de leitura/entrega ao aparelho. Consulte o SID no Twilio para conciliação.

Lembretes são tarefas `remind=true`; podem ser concluídos, reagendados ou cancelados com confirmação persistida por dez minutos. Não existe exclusão destrutiva genérica exposta à IA. Estoque baixo gera aviso persistente; somente `set_inventory_alert`, pedido explícito, cria regra que autoriza envio via job. Reposição resolve aviso e cancela envio ainda não iniciado. Chuva automática e regras agronômicas avançadas ficam para fase posterior.

## Memória, mídia, relatórios e segurança

Contexto ativo expira em 12h; quando há uma única fazenda ela é selecionada sem perguntar. Ao consultar referências antigas, ferramentas consultam ciclos e registros do banco. Memórias exigem confirmação e respeitam expiração. Aliases normalizados são ensinados após confirmação.

Foto/áudio continuam multimodais. Com fazenda já conhecida, a referência de mídia Twilio fica pendente por até 24h; ao registrar ocorrência/follow-up com consentimento, salva no bucket privado `farm-media`, criado pela migration 023, com retenção de 30 dias e limite de 10 MB. Não registra toda mídia recebida permanentemente. Consulta de mídia é autenticada e fornece bytes ao modelo, nunca a service role ou URLs Twilio ao frontend. Worker remove objetos expirados e metadados. Casos sem fazenda conhecida podem exigir reenviar a foto depois de selecionar propriedade. Falha parcial no armazenamento deve ser conferida; não presumir que descrição significa foto armazenada.

PDF rural usa dados estruturados do domínio e o renderer PDFKit existente. Relatórios podem filtrar safra/talhão/período e incluem critério de escopo. Operações e ocorrências no relatório de safra são filtradas pelo período explícito da safra (não significa que todo evento no intervalo pertence ao mesmo ciclo); despesas usam vínculo de safra. O PDF de conversa permanece separado. Bucket de relatórios e URLs assinadas seguem configuração existente.

Policies separam registro de quantidade relatada de recomendação de dose. Emergências animais explícitas em texto recebem encaminhamento determinístico; questões de dose recebem resposta segura. Multimodal também recebe policies no sistema. Outputs de tools, contexto e fontes externas são dados, não instruções. Nenhuma ferramenta administrativa está disponível ao modelo. Respostas de sucesso sem ferramenta de gravação são bloqueadas por verificação adicional; essa verificação é defesa complementar, não prova formal sobre toda paráfrase que um LLM possa produzir. É necessário acompanhar avaliações e auditoria no rollout.

Logs contêm correlation_id, intenção indicativa, ferramenta/duração, rodada e tamanho da resposta, sem conteúdo bruto, OTP, token, cartão ou chave. Audit de gravação tem snapshots de dados rurais; admin expõe metadados de execução e estado de jobs, sem input/output integral. Definir retenção de auditoria/inbox de acordo com a política de privacidade antes de ampliar volume; a rotina de mídia já aplica a retenção definida acima.

## API e interface

`/api/rural` exige JWT Supabase e usuário vinculado; usa a mesma autorização do portal. GET/POST farms, PATCH farm, GET summary/weather/expenses-summary, POST report e leitura/escrita validada das entidades. `Idempotency-Key` opcional em mutações web, recomendada em clientes com retry. Consultas por intervalo usam início inclusivo e fim exclusivo. Listas paginam em 50; totais financeiros leem todas as páginas (limite de segurança 100 mil registros; nesse caso pede intervalo menor, sem total parcial silencioso).

Área do cliente acrescenta propriedade, safra, custos, avisos, tarefas, talhões, atividades, estoque, ocorrências e clima; preserva conta/plano/assentos. Cadastro simples, correção de área do talhão e conclusão de tarefa. Correções mais amplas continuam por ferramentas/API. Admin: detalhes de usuário mostram contagens rurais, ações e estado dos lembretes.

## Verificação local

`npm test`: Postgres isolado via PGlite, migrations reais e adapter do contrato Supabase para queries; sem acessar banco remoto ou enviar WhatsApp. Cobre A–L pelo domínio e agente com provider controlado, ownership, aliases, idempotência, transações, saldo, memória, contexto, claims sem tool, falhas, cancelamento, worker, cache, fonte/data de preços e PDF. Isso não prova compreensão de todas as frases pelo Gemini real.

`npm run test:signup-flow`: regressão do cadastro/trial existente.

`scripts/test-rural-ui.mjs`: Playwright disponível externamente via `PLAYWRIGHT_MODULE`, opcional `BROWSER_CHANNEL=msedge`. Fixtures exclusivamente no interceptador de testes, nunca no bundle do produto; verifica desktop/mobile, overflow, erros JS, cadastro e estados vazio/erro. Capturas em `test-artifacts/` ignorado pelo Git.

Foi executada também avaliação real do Gemini com frases sintéticas e Postgres descartável: cadastro de fazenda, criação de talhão/ciclo/operação de plantio e despesa de R$ 850. Os três fluxos passaram. O teste encontrou HTTP 503 no modelo configurado e levou à implementação de fallback temporário. Depois da primeira chamada de ferramenta, o provider fixa o modelo da conversa para preservar partes nativas e thought signatures; não alterna versões no meio de uma sequência de tools. O orçamento da conversa é de quatro minutos, além dos limites de rodadas.

Repetir esse teste consome API Gemini: `RUN_LIVE_AGENT_EVAL=true node scripts/test-rural-agent-live.mjs` (no PowerShell, definir `$env:RUN_LIVE_AGENT_EVAL='true'` antes do comando). O script usa a chave configurada e **não** usa o Supabase remoto nem envia WhatsApp. Não executá-lo como parte de CI padrão.

Confirmações de gravação são montadas no backend a partir dos resultados persistidos, em vez de repetir alegações do modelo. A suíte local inclui tentativa de resposta final com valor inventado e verifica que a confirmação mantém o valor realmente salvo.

Homologação externa ainda necessária: assinatura Twilio no domínio publicado, envio do template aprovado, Storage remoto e provider de clima comercial, além de cenários multimodais reais. Nenhum teste desta implementação aplicou migrations ou modificou o banco de produção.
