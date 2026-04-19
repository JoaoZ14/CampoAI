import 'dotenv/config';
import { runWeeklyNewsSend } from '../src/jobs/weeklyNewsCron.js';

const r = await runWeeklyNewsSend();
console.log(r);
process.exit(r.ok ? 0 : 1);
