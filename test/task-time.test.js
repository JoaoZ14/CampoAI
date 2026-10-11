import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localCalendar, localInstant, resolveTaskTime } from '../src/rural/time.js';
import { buildContext } from '../src/ai/context/buildContext.js';
import { runAgent } from '../src/ai/agent/runAgent.js';
import { RuralRepository } from '../src/rural/repository.js';
import { RuralService } from '../src/rural/service.js';
import { database } from './support/database.js';
import { intentHint, isExplicitWriteRequest } from '../src/ai/policies/intent.js';
import { enqueueRuralMessage, runRuralWorker } from '../src/jobs/ruralWorker.js';
import { actionReceipt } from '../src/ai/policies/receipts.js';

test('scheduling and rescheduling requests require a real tool, while hypothetical requests do not authorize writes', () => {
  assert.equal(intentHint('Agende olhar na baia amanhã às 9h'), 'task');
  assert.equal(isExplicitWriteRequest('Mude a visita para amanhã às 10h'), true);
  assert.equal(isExplicitWriteRequest('Reagende a visita para sexta-feira'), true);
  assert.equal(isExplicitWriteRequest('Seria interessante reagendar a visita?'), false);
});

test('tomorrow at nine is October 3 locally, including when UTC is already October 3', () => {
  for (const now of ['2026-10-02T12:00:00Z', '2026-10-03T02:30:00Z']) {
    assert.equal(resolveTaskTime('Agende olhar na baia amanhã de manhã às 9h', { now: new Date(now), timezone: 'America/Sao_Paulo' }), '2026-10-03T12:00:00.000Z');
    assert.equal(localCalendar(new Date(now)).tomorrow, '2026-10-03');
  }
});
test('relative dates respect rollover, local offsets and reported minutes', () => {
  assert.equal(resolveTaskTime('Amanhã às 9:30', { now: new Date('2026-12-31T20:00:00Z'), timezone: 'America/Manaus' }), '2027-01-01T13:30:00.000Z');
  assert.equal(resolveTaskTime('Depois de amanhã às 9h', { now: new Date('2026-10-02T10:00:00Z') }), '2026-10-04T12:00:00.000Z');
  assert.equal(resolveTaskTime('Daqui cinco dias', { now: new Date('2026-10-02T15:35:00Z') }), '2026-10-07T15:35:00.000Z');
  assert.equal(resolveTaskTime('Daqui a 2 dias', { now: new Date('2026-10-02T15:35:00Z') }), '2026-10-04T15:35:00.000Z');
  assert.equal(resolveTaskTime('Amanhã às 3 da tarde', { now: new Date('2026-10-02T15:00:00Z') }), '2026-10-03T18:00:00.000Z');
  assert.equal(resolveTaskTime('Amanhã às 9 e meia', { now: new Date('2026-10-02T15:00:00Z') }), '2026-10-03T12:30:00.000Z');
  assert.equal(resolveTaskTime('Amanhã às 9.30', { now: new Date('2026-10-02T15:00:00Z') }), '2026-10-03T12:30:00.000Z');
  assert.equal(resolveTaskTime('Amanhã às 9h', { now: new Date('2026-10-02T23:30:00Z'), timezone: 'Asia/Kathmandu' }), '2026-10-04T03:15:00.000Z');
});
test('missing and conflicting hours require clarification; changing only the day preserves the existing time', () => {
  const options = { now: new Date('2026-10-02T12:00:00Z') };
  assert.throws(() => resolveTaskTime('Amanhã de manhã', options), /horário/);
  assert.throws(() => resolveTaskTime('Amanhã às 9h ou às 10h', options), /horário/);
  assert.equal(resolveTaskTime('Mude a tarefa de hoje para amanhã', { ...options, existingDueAt: '2026-10-04T14:15:00Z' }), '2026-10-03T14:15:00.000Z');
  assert.equal(resolveTaskTime('Agende em 2099-10-04 às 9h', options), null);
  assert.throws(() => resolveTaskTime('Amanhã às 25h', options), /válido/);
  assert.throws(() => resolveTaskTime('Amanhã dia 4 às 9h', options), /dias diferentes/);
  assert.throws(() => resolveTaskTime('Mude para amanhã às 9:3', { ...options, existingDueAt: '2026-10-04T14:15:00Z' }), /minutos/);
  assert.throws(() => resolveTaskTime('Mude para amanhã às nove', { ...options, existingDueAt: '2026-10-04T14:15:00Z' }), /formato/);
});
test('DST gaps and ambiguous wall-clock times are not silently shifted', () => {
  assert.throws(() => localInstant('2026-03-08', '02:30', 'America/New_York'), /não existe|não é único/);
  assert.throws(() => localInstant('2026-11-01', '01:30', 'America/New_York'), /não existe|não é único/);
  assert.equal(localInstant('2026-03-08', '09:00', 'America/New_York'), '2026-03-08T13:00:00.000Z');
});

test('receipts distinguish saved tasks from WhatsApp reminders and identify where to find the record', () => {
  const task = { title: 'Conferir a água', due_at: '2099-10-03T12:00:00Z', status: 'pending', remind: false };
  const noReminder = actionReceipt('create_task', task, 'America/Sao_Paulo', 'Sítio Boa Vista');
  assert.match(noReminder, /03\/10\/2099.*09:00/);
  assert.match(noReminder, /Sem lembrete no WhatsApp/);
  assert.match(noReminder, /Propriedade: Sítio Boa Vista/);
  assert.match(noReminder, /Minhas tarefas no app/);
  assert.doesNotMatch(noReminder, /ativado/);
  assert.match(actionReceipt('update_task', { ...task, remind: true }, 'America/Sao_Paulo', 'Fazenda Horizonte'), /Lembrete no WhatsApp ativado/);
  assert.doesNotMatch(actionReceipt('update_task', { ...task, status: 'completed', remind: true }), /ativado|Agendei|09:00/);
  assert.equal(actionReceipt('set_active_context', { farm_id: randomUUID() }), null);
  assert.equal(actionReceipt('cancel_reminder', { confirmation_required: true }), null);
});

let pg, repo, user, farm;
before(async () => {
  for (const key of ['AGENT_TOOLS_ENABLED', 'REMINDERS_ENABLED', 'EXPENSES_ENABLED']) process.env[key] = 'true';
  process.env.REMINDER_CONTENT_SID = 'HX' + '1'.repeat(32);
  const db = await database(); pg = db.pg; repo = new RuralRepository(db.db);
  user = { id: randomUUID() };
  await pg.query('insert into users(id,phone) values($1,$2)', [user.id, '+5511980000040']);
  farm = await new RuralService(user, repo, randomUUID()).save('farms', null, { name: 'Sítio de teste', timezone: 'America/Sao_Paulo' });
});
after(async () => pg?.close());
test('context and persisted task use one reference clock, overriding an incorrect model date', async () => {
  const service = new RuralService(user, repo, randomUUID());
  const referenceTime = new Date('2099-10-03T02:30:00Z');
  const context = await buildContext(service, referenceTime);
  assert.equal(context.local_date, '2099-10-02'); assert.equal(context.tomorrow, '2099-10-03');
  let count = 0;
  const reply = await runAgent({ user, service, referenceTime, text: 'Agende olhar na baia amanhã de manhã às 9h', provider: {
    inputParts: async ({ text }) => [{ text }],
    turn: async () => count++ === 0 ? { calls: [{ name: 'create_task', args: { farm_id: farm.id, values: { title: 'Olhar na baia', due_at: '2099-10-04T12:00:00Z', remind: true } } }] } : { calls: [], text: 'Agendei.' },
  } });
  const task = (await service.list('farm_tasks', farm.id))[0];
  assert.equal(task.due_at, '2099-10-03T12:00:00.000Z');
  const jobs = (await pg.query('select * from scheduled_jobs where task_id=$1', [task.id])).rows;
  assert.equal(jobs.length, 1); assert.equal(new Date(jobs[0].run_at).toISOString(), task.due_at);
  assert.match(reply, /03\/10\/2099.*09:00/);
});
test('rescheduling corrects the same task and reminder, without creating a duplicate', async () => {
  const service = new RuralService(user, repo, randomUUID());
  const task = await service.save('farm_tasks', farm.id, { title: 'Revisar baia', due_at: '2099-10-04T14:15:00Z', remind: true });
  let count = 0;
  await runAgent({ user, service: new RuralService(user, repo, randomUUID()), referenceTime: '2099-10-02T18:00:00Z', text: 'Mude a revisão da baia para amanhã', provider: {
    inputParts: async ({ text }) => [{ text }],
    turn: async () => count++ === 0 ? { calls: [{ name: 'update_task', args: { farm_id: farm.id, record_id: task.id, values: { due_at: '2099-10-05T12:00:00Z' } } }] } : { calls: [], text: 'Atualizei.' },
  } });
  const updated = await service.one('farm_tasks', farm.id, task.id);
  assert.equal(updated.due_at, '2099-10-03T14:15:00.000Z');
  const jobs = (await pg.query('select * from scheduled_jobs where task_id=$1', [task.id])).rows;
  assert.equal(jobs.length, 1); assert.equal(new Date(jobs[0].run_at).toISOString(), updated.due_at);
});
test('a model-invented morning hour is rejected before any write', async () => {
  const service = new RuralService(user, repo, randomUUID());
  const before = (await service.list('farm_tasks', farm.id)).length;
  const reply = await runAgent({ user, service, referenceTime: '2099-10-02T18:00:00Z', text: 'Agende conferir a baia amanhã de manhã', provider: {
    inputParts: async ({ text }) => [{ text }],
    turn: async () => ({ calls: [{ name: 'create_task', args: { farm_id: farm.id, values: { title: 'Conferir a baia', due_at: '2099-10-03T12:00:00Z', remind: false } } }] }),
  } });
  assert.match(reply, /qual horário/i); assert.equal((await service.list('farm_tasks', farm.id)).length, before);
});
test('queued messages carry their original server receipt time across midnight', async () => {
  const sid = 'SM' + randomUUID().replaceAll('-', '');
  await enqueueRuralMessage({ messageSid: sid, phone: '+5511980000040', message: 'Amanhã às 9h' }, repo);
  await pg.query('update assistant_inbox set created_at=$1 where id=$2', ['2026-10-03T02:30:00Z', sid]);
  let received;
  await runRuralWorker({ repo, processMessage: async payload => { received = payload.receivedAt; } });
  assert.equal(new Date(received).toISOString(), '2026-10-03T02:30:00.000Z');
  assert.equal(resolveTaskTime('Amanhã às 9h', { now: new Date(received) }), '2026-10-03T12:00:00.000Z');
});


test('a receipt uses the actual selected property, even when the initial active property is different', async () => {
  const otherFarm = await new RuralService(user, repo, randomUUID()).save('farms', null, { name: 'Outra propriedade de teste' });
  await new RuralService(user, repo, randomUUID()).setActive(farm.id);
  let calls = 0;
  const reply = await runAgent({ user, service: new RuralService(user, repo, randomUUID()), text: 'Registre a compra de adubo na Outra propriedade de teste', provider: {
    inputParts: async ({ text }) => [{ text }],
    turn: async () => calls++ === 0 ? { calls: [{ name: 'create_expense', args: { farm_id: otherFarm.id, values: { description: 'Adubo', category: 'insumos', amount: 120, expense_date: '2026-10-03' } } }] } : { calls: [], text: 'Registrei na fazenda errada.' },
  } });
  assert.match(reply, /Propriedade: Outra propriedade de teste/);
  assert.match(reply, /Meus gastos no app/);
  assert.doesNotMatch(reply, /Sítio de teste|errada/);
  assert.equal((await repo.list('farm_expenses', otherFarm.id))[0].description, 'Adubo');
});

test('successful property registration offers a useful next request without creating a sample task', async () => {
  const newUser = { id: randomUUID() };
  await pg.query('insert into users(id,phone) values($1,$2)', [newUser.id, '+5511980000041']);
  let calls = 0;
  const reply = await runAgent({ user: newUser, service: new RuralService(newUser, repo, randomUUID()), text: 'Cadastre minha propriedade Sítio Novo', provider: {
    inputParts: async ({ text }) => [{ text }],
    turn: async () => calls++ === 0 ? { calls: [{ name: 'create_farm', args: { name: 'Sítio Novo' } }] } : { calls: [], text: 'Cadastrei.' },
  } });
  assert.match(reply, /Sítio Novo/); assert.match(reply, /uma tarefa que precisa fazer/); assert.match(reply, /Minhas tarefas/);
  const registered = (await repo.farms(newUser.id))[0];
  assert.equal((await repo.list('farm_tasks', registered.id)).length, 0);
});
