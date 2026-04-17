/**
 * Especificação OpenAPI 3.0 para documentação e testes no Swagger UI.
 */
export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'AgroAssist API',
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
    { name: 'Webhook', description: 'Simulação do webhook WhatsApp (Postman-style)' },
  ],
  paths: {
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
                    service: { type: 'string', example: 'AgroAssist API' },
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
        summary: 'Receber mensagem (texto e/ou imagem)',
        description:
          'Busca ou cria o usuário pelo telefone, aplica limite gratuito, chama o Gemini quando aplicável e envia resposta via Twilio (ou mock).',
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
                    description: 'Texto da mensagem (opcional se houver imageUrl)',
                    example: 'Minha laranjeira está com folhas amarelas',
                  },
                  imageUrl: {
                    type: 'string',
                    format: 'uri',
                    description: 'URL pública http(s) da imagem',
                    example:
                      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Leaf.jpg/320px-Leaf.jpg',
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
                      enum: ['welcome', 'ai_reply', 'limit_reached'],
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
  },
};
