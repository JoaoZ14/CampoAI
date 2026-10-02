export function farmDay(timeZone: string, value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}
export function farmLocalTime(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const p = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function farmInstant(value: string, timeZone: string) {
  const target = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(target)) throw new Error('Data inválida.');
  let instant = target;
  for (let n = 0; n < 3; n++) {
    const displayed = Date.parse(`${farmLocalTime(new Date(instant).toISOString(), timeZone)}:00Z`);
    instant += target - displayed;
  }
  if (farmLocalTime(new Date(instant).toISOString(), timeZone) !== value) throw new Error('Horário inválido neste fuso.');
  return new Date(instant).toISOString();
}
