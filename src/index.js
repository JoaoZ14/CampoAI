import 'dotenv/config';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3001;
const app = createApp();

const server = app.listen(port, () => {
  console.log(`AgroAssist rodando em http://localhost:${port}`);
  console.log(`Webhook JSON: POST http://localhost:${port}/webhook/whatsapp`);
  console.log(`Webhook Twilio: POST http://localhost:${port}/webhook/whatsapp/twilio`);
  console.log(`Health:  GET  http://localhost:${port}/health`);
  console.log(`Swagger: GET  http://localhost:${port}/api-docs`);
  console.log(`Painel dev: http://localhost:${port}/admin/`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[EADDRINUSE] A porta ${port} já está em uso. Encerre o outro processo ou use outra porta, por exemplo:\n` +
        `  set PORT=3333 && npm run dev   (CMD)\n` +
        `  $env:PORT=3333; npm run dev   (PowerShell)`
    );
    process.exit(1);
  }
  throw err;
});
