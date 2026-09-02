/**
 * Especificação OpenAPI 3.0 para documentação e testes no Swagger UI.
 */
export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'AG Assist API',
    description:
      'Backend do assistente agrícola via WhatsApp. Use **Try it out** para testar os endpoints.',
    version: '1.0.0',
  },
  servers: [
    {
      url: '/',
      description:
        'Mesmo host e porta em que o Swagger está aberto (ex.: http://localhost:3001)',
    },
  ],
  tags: [
    { name: 'Health', description: 'Verificação do serviço' },
    { name: 'Landing', description: 'Endpoints públicos do site (notícias, planos)' },
    { name: 'Signup', description: 'Cadastro gratuito com OTP SMS' },
    { name: 'Admin', description: 'Painel administrativo (Bearer Supabase + ADMIN_EMAILS)' },
    { name: 'Webhook', description: 'Simulação do webhook WhatsApp (Postman-style)' },
  ],
  paths: {
    '/api/noticias': {
      get: {
        tags: ['Landing'],
        summary: 'Lista de notícias do agro (cache Supabase + GNews)',
        description:
          'Retorna itens cacheados em `news_articles`. Se a última sync for mais antiga que o TTL (LANDING_NEWS_TTL_HOURS, padrão 24), atualiza via GNews antes de responder.',
        operationId: 'getNoticias',
        responses: {
          '200': {
            description: 'Lista de notícias',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    fetchedAt: { type: 'string', format: 'date-time' },
                    source: { type: 'string', example: 'gnews' },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          title: { type: 'string' },
                          url: { type: 'string', format: 'uri' },
                          source: { type: 'string' },
                          publishedAt: { type: 'string' },
                          image: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/signup/otp/send': {
      post: {
        tags: ['Signup'],
        summary: 'Enviar OTP por SMS para cadastro',
        operationId: 'postSignupOtpSend',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['phone'],
                properties: {
                  phone: {
                    type: 'string',
                    description: 'Telefone com DDD (será normalizado)',
                    example: '5511999999999',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'SMS enviado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    phone: { type: 'string' },
                  },
                },
              },
            },
          },
          '400': { description: 'Telefone inválido' },
          '429': { description: 'Aguarde antes de reenviar' },
        },
      },
    },
    '/api/signup/otp/verify': {
      post: {
        tags: ['Signup'],
        summary: 'Validar OTP e obter token de verificação',
        operationId: 'postSignupOtpVerify',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['phone', 'code'],
                properties: {
                  phone: { type: 'string', example: '5511999999999' },
                  code: { type: 'string', example: '123456' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Código válido',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    verificationToken: { type: 'string' },
                  },
                },
              },
            },
          },
          '400': { description: 'Código inválido ou expirado' },
        },
      },
    },
    '/api/signup/complete': {
      post: {
        tags: ['Signup'],
        summary: 'Concluir cadastro e iniciar trial',
        operationId: 'postSignupComplete',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'phone', 'verificationToken'],
                properties: {
                  name: { type: 'string', example: 'João Silva' },
                  phone: { type: 'string', example: '5511999999999' },
                  email: { type: 'string', format: 'email' },
                  verificationToken: { type: 'string' },
                  signupSource: { type: 'string', example: 'landing' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Cadastro concluído',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    message: { type: 'string' },
                    whatsappOpenUrl: { type: 'string', format: 'uri' },
                    userId: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
          '400': { description: 'Token inválido ou dados incompletos' },
        },
      },
    },
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Status do serviço',
        operationId: 'getHealth',
        responses: {
          '200': {
            description: 'Serviço no ar',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    service: { type: 'string', example: 'AG Assist API' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/webhook/whatsapp': {
      post: {
        tags: ['Webhook'],
        summary: 'Receber mensagem (texto, imagem e/ou áudio por URL)',
        description:
          'Busca ou cria o usuário pelo telefone, aplica limite gratuito, chama o Gemini quando aplicável e envia resposta via Twilio (ou mock). Áudio: URL http(s) acessível (no WhatsApp real o Twilio envia MediaUrl).',
        operationId: 'postWhatsAppWebhook',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['phone'],
                properties: {
                  phone: {
                    type: 'string',
                    description: 'Telefone em E.164 ou formato comum (será normalizado)',
                    example: '+5511999999999',
                  },
                  message: {
                    type: 'string',
                    description: 'Texto da mensagem (opcional se houver mídia)',
                    example: 'Minha laranjeira está com folhas amarelas',
                  },
                  imageUrl: {
                    type: 'string',
                    format: 'uri',
                    description: 'URL pública http(s) da imagem',
                    example:
                      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Leaf.jpg/320px-Leaf.jpg',
                  },
                  audioUrl: {
                    type: 'string',
                    format: 'uri',
                    description:
                      'URL http(s) de áudio (ogg, mp3, etc.) — no Twilio use a URL da mídia recebida',
                  },
                },
              },
              examples: {
                welcome: {
                  summary: 'Só telefone (mensagem inicial)',
                  value: { phone: '+5511999999999' },
                },
                texto: {
                  summary: 'Só texto',
                  value: {
                    phone: '+5511999999999',
                    message: 'Minha laranjeira está com folhas amarelas nas pontas',
                  },
                },
                textoEImagem: {
                  summary: 'Texto + imagem',
                  value: {
                    phone: '+5511999999999',
                    message: 'O que pode ser essas manchas?',
                    imageUrl:
                      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Leaf.jpg/320px-Leaf.jpg',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Processado (ver campo step)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    step: {
                      type: 'string',
                      enum: [
                        'welcome',
                        'ai_reply',
                        'ai_error',
                        'limit_reached',
                        'unsupported_video',
                        'report_pdf_sent',
                        'report_insufficient_history',
                        'report_error',
                      ],
                    },
                    userId: { type: 'string', format: 'uuid' },
                    usageCount: { type: 'integer' },
                    isPaid: { type: 'boolean' },
                    replyPreview: { type: 'string' },
                  },
                },
              },
            },
          },
          '400': { description: 'Corpo inválido (ex.: telefone ausente)' },
          '500': { description: 'Erro interno ou serviço externo' },
          '502': { description: 'Falha Gemini ou Twilio' },
        },
      },
    },
    '/webhook/whatsapp/twilio': {
      post: {
        tags: ['Webhook'],
        summary: 'Webhook Twilio (WhatsApp real)',
        description:
          'URL pública HTTPS para "When a message comes in" no Twilio. Content-Type: application/x-www-form-urlencoded. O Swagger não envia esse formato facilmente — use o WhatsApp ou um cliente HTTP.',
        operationId: 'postTwilioWhatsappWebhook',
        requestBody: {
          content: {
            'application/x-www-form-urlencoded': {
              schema: {
                type: 'object',
                properties: {
                  From: {
                    type: 'string',
                    example: 'whatsapp:+5511999999999',
                    description: 'Remetente (WhatsApp)',
                  },
                  Body: { type: 'string', example: 'Minha vaca está mancando' },
                  NumMedia: { type: 'string', example: '0' },
                  MediaUrl0: {
                    type: 'string',
                    description: 'URL da primeira mídia se NumMedia > 0',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'OK — TwiML vazio',
            content: {
              'text/xml': {
                schema: { type: 'string', example: '<Response></Response>' },
              },
            },
          },
        },
      },
    },
    '/admin/api/dashboard': {
      get: {
        tags: ['Admin'],
        summary: 'Dashboard agregado (overview + analytics + orgs)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Bundle do painel' }, '401': { description: 'Não autenticado' } },
      },
    },
    '/admin/api/users': {
      get: {
        tags: ['Admin'],
        summary: 'Listar usuários (busca e filtros)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['trial_active', 'trial_expired', 'paid', 'blocked', 'no_signup'] } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'offset', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { '200': { description: 'Lista paginada' } },
      },
    },
    '/admin/api/users/{userId}': {
      get: {
        tags: ['Admin'],
        summary: 'Detalhe do usuário',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Usuário + org + mensagens recentes' } },
      },
      patch: {
        tags: ['Admin'],
        summary: 'Atualizar usuário (trial, uso, billing)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Usuário atualizado' } },
      },
    },
    '/admin/api/subscription-requests': {
      get: {
        tags: ['Admin'],
        summary: 'Solicitações de checkout /planos',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Lista paginada' } },
      },
    },
    '/admin/api/news/refresh': {
      post: {
        tags: ['Admin'],
        summary: 'Forçar sync de notícias (GNews)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Notícias atualizadas' } },
      },
    },
    '/admin/api/settings': {
      get: {
        tags: ['Admin'],
        summary: 'Configurações não-secretas do ambiente',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'URLs e flags de integração' } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token Supabase Auth (mesmo do login /admin)',
      },
    },
  },
};
