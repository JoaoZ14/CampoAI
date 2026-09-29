# AG Assist operacional

## Arquitetura encontrada antes da implementação

Express/ES modules em `src/app.js`; processo persistente em `src/index.js` e entrada Vercel em `api/index.js`. Landing separada em CampoAILanding. Sem troca de stack.

- WhatsApp: routes → assinatura Twilio → twilioInboundController → incomingMessageService. A rota JSON de desenvolvimento precisa ser desativada em produção quando o agente está ativo, pois telefone informado não autentica usuário.
- Cadastro: signupRoutes, signupService, signupOtpService, welcomeService; OTP SMS, vínculo com Supabase Auth e trial. Login web usa JWT Supabase validado por customerAuth. Organizações/assentos são independentes do domínio rural.
- Cobrança: billingRoutes, phoneOtpService, asaasSubscriptionService, asaasWebhookController, productPlanRepository, planCatalogService e userService. A verificação de uso ocorre antes da IA; preservar contadores e planos.
- IA: aiService usa @google/generative-ai; texto pode usar Ollama, mídia usa Gemini. Histórico limitado em chat_messages via chatHistoryService. Mídia era baixada em inlineData e guardada somente como marcador no histórico.
- PDF: reportIntent → Gemini resume conversa → reportPdfService (PDFKit) → reportStorageService (bucket privado/URL assinada).
- Calculadora: fieldCalcService já contém motor determinístico; caminho compute anteriormente voltava para LLM.
- Cliente: public/area-do-cliente (HTML/CSS/JS), customerPortalRoutes/Service. Admin: public/admin, adminRoutes/Service/Analytics e requireAdminAuth.
- Persistência: Supabase service role no servidor, schema.sql e migrations 002–020. Crons existentes: notícias semanais e expiração de trial, iniciados apenas no processo Node.

## Nova fronteira

WhatsApp autenticado → cadastro/uso existentes → agente → catálogo de ferramentas validado → serviços rurais → Supabase.
Gemini recebe apenas contexto limitado e resultados de ferramentas como dados. Nenhum user_id vem do modelo. O domínio e a API web funcionam sem Gemini.

As migrations e as flags são necessárias antes do rollout. Instruções operacionais e limitações estão em OPERATIONAL_ROLLOUT.md.
