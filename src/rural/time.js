import { fail, normalizeName } from './validation.js';

export function localCalendar(now = new Date(), timezone = 'America/Sao_Paulo') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const p = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const today = `${p.year}-${p.month}-${p.day}`;
  return { timezone, local_date: today, local_time: `${p.hour}:${p.minute}`, tomorrow: addDays(today, 1), day_after_tomorrow: addDays(today, 2) };
}
export function addDays(day, amount) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
// Convert a wall-clock time using IANA rules, independently of the host timezone.
// Reject missing or repeated DST times instead of silently choosing an instant.
export function localInstant(day, time, timezone) {
  const target = Date.parse(`${day}T${time}:00Z`);
  const candidates = new Set();
  for (const delta of [-36, 0, 36]) {
    const sample = target + delta * 3600000;
    const calendar = localCalendar(new Date(sample), timezone);
    const displayed = Date.parse(`${calendar.local_date}T${calendar.local_time}:00Z`);
    const candidate = target - (displayed - sample);
    const actual = localCalendar(new Date(candidate), timezone);
    if (actual.local_date === day && actual.local_time === time) candidates.add(candidate);
  }
  if (candidates.size !== 1) fail('Esse horário não é único ou não existe no fuso da propriedade. Informe outro horário.');
  return new Date([...candidates][0]).toISOString();
}

const words = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
export function resolveTaskTime(text, { now = new Date(), timezone = 'America/Sao_Paulo', existingDueAt } = {}) {
  let plain = normalizeName(text || '');
  // A rescheduling request can mention the old day before the new target.
  if (/\b(mude|mudar|remarque|reagende|altere|troque|passe|adie)\b/.test(plain)) {
    const targets = [...plain.matchAll(/\bpara\b/g)];
    if (targets.length) plain = plain.slice(targets.at(-1).index + 4);
  }
  const offsets = [...plain.matchAll(/\b(depois de amanha|amanha|hoje)\b|\bdaqui(?: a)? (\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez) dias?\b/g)].map(match => match[1] ? ({ hoje: 0, amanha: 1, 'depois de amanha': 2 })[match[1]] : Number(match[2]) || words[match[2]]);
  if (offsets.length > 1) fail('Informe um dia e horário por agendamento para evitar confusão.');
  if (offsets[0] > 3650) fail('Informe uma data mais próxima para o agendamento.');
  const calendar = localCalendar(now, timezone);
  const relative = offsets.length === 1;
  // Absolute dates remain subject to schema validation and the declared date.
  if (!relative) return null;
  plain = plain.replace(/\b((?:as|pelas)\s+\d{1,2})\.(\d{2})\b/g, '$1:$2');
  if (/\b\d{1,2}[:.]\d(?!\d)\b/.test(plain)) fail('Informe os minutos com dois dígitos, como 9:03 ou 9:30.');
  const targetDay = addDays(calendar.local_date, offsets[0]);
  const explicitDay = plain.match(/\bdia\s+(\d{1,2})\b/);
  const explicitDate = plain.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  const isoDate = plain.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if ((explicitDay && Number(explicitDay[1]) !== Number(targetDay.slice(8))) || (isoDate && isoDate[0] !== targetDay) || (explicitDate && (Number(explicitDate[1]) !== Number(targetDay.slice(8)) || Number(explicitDate[2]) !== Number(targetDay.slice(5, 7)) || (explicitDate[3] && explicitDate[3] !== targetDay.slice(0, 4))))) fail('Você citou dias diferentes. Para qual data quer agendar?');
  const times = new Set();
  const clocks = /\b(?:as|pelas)\s+(\d{1,2})(?:(?:h|:)(\d{2})?)?(?:\s*horas?)?\b|\b(\d{1,2})(?:h(\d{2})?|:(\d{2}))\b/g;
  for (const match of plain.matchAll(clocks)) {
    let hour = Number(match[1] ?? match[3]);
    let minute = Number(match[2] ?? match[4] ?? match[5] ?? 0);
    const tail = plain.slice(match.index + match[0].length);
    const fraction = tail.match(/^\s+e\s+(meia|quinze|um quarto|\d{1,2})\b/);
    if (fraction) {
      if (minute !== 0) fail('Informe um único horário, como 9:30.');
      minute = ({ meia: 30, quinze: 15, 'um quarto': 15 })[fraction[1]] ?? Number(fraction[1]);
    }
    if (/^\s+menos\b/.test(tail)) fail('Informe o horário no formato 9:30 para evitar confusão.');
    if (/\b(?:da|a|de) (tarde|noite)\b/.test(plain) && hour < 12) hour += 12;
    if (/\b(?:da|a|de) noite\b/.test(plain) && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) fail('Informe um horário válido para a tarefa.');
    times.add(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  }
  if (times.size > 1) fail('Qual horário você quer usar nesse agendamento?');
  let time = [...times][0];
  if (!time && /\b(?:as|pelas)\s+\w+|\b\d{1,2}(?:h|[:.])/.test(plain)) fail('Informe o horário no formato 9h ou 9:30 para evitar confusão.');
  if (!time && existingDueAt) time = localCalendar(new Date(existingDueAt), timezone).local_time;
  if (!time && /\bdaqui\b/.test(plain) && !/\b(manha|tarde|noite)\b/.test(plain)) time = calendar.local_time;
  if (!time) fail('Para qual horário você quer agendar?');
  const hour = Number(time.slice(0, 2));
  if ((/\b(?:de|pela|da) manha\b/.test(plain) && hour >= 12) || (/\b(?:de|pela|da) tarde\b/.test(plain) && (hour < 12 || hour >= 18))) fail('Qual horário você quer usar nesse período do dia?');
  return localInstant(targetDay, time, timezone);
}

export async function taskValues(service, farmId, values, recordId, text, now) {
  const farm = await service.farm(farmId);
  // Capture receipt metadata before writing. A failed lookup after a committed
  // write must never make the acknowledgement claim that nothing was saved.
  service.taskTimezone = farm.timezone || 'America/Sao_Paulo';
  if (!values.due_at) return values;
  const existing = recordId ? await service.one('farm_tasks', farm.id, recordId) : null;
  const due = resolveTaskTime(text, { now, timezone: farm.timezone || 'America/Sao_Paulo', existingDueAt: existing?.due_at });
  return due ? { ...values, due_at: due } : values;
}
