import { createApp } from '../src/app.js';

const port = Number(process.env.PREVIEW_PORT) || 8767;
const server = createApp().listen(port, '0.0.0.0', () => {
  console.log(`AGGI app preview: http://127.0.0.1:${port}/app/`);
});

process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
