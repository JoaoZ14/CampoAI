import 'dotenv/config';
import { runWeeklyNewsSend } from '../src/jobs/weeklyNewsCron.js';

/**
 * Uso:
 *   npm run weekly-news -- +5524988123456
 *   npm run weekly-news -- --phone +5524988123456
 * Sem argumento: envia para todos em public.users (cron idem), salvo se
 * WEEKLY_NEWS_TO_PHONE estiver definido — aí só esse número (teste legado).
 */
function parseTestPhone(argv) {
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--phone' && args[i + 1]) {
      return args[i + 1].trim();
    }
    if (!a.startsWith('-') && /\d/.test(a)) {
      return a.trim();
    }
  }
  return '';
}

const toPhone = parseTestPhone(process.argv);
const r = await runWeeklyNewsSend(toPhone ? { toPhone } : {});
if (toPhone) {
  console.log('[weekly-news] Destino de teste (CLI); .env WEEKLY_NEWS_TO_PHONE não foi alterado.');
}
console.log(r);
process.exit(r.ok ? 0 : 1);
