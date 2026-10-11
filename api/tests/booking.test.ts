import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { assertCanSelfManage, bookAppointment, isOverlapError, moveAppointment } from '../src/services/booking';
import { getSlots } from '../src/services/availability';
import { at, createFixtures, customer, futureDate, resetDb } from './helpers/fixtures';

const date = futureDate(7);

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('prevención de turnos duplicados', () => {
  it('10 reservas simultáneas del mismo horario: gana una sola, el resto recibe SLOT_TAKEN', async () => {
    const { service, pros } = await createFixtures(1);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        bookAppointment({ serviceId: service.id, professionalId: pros[0].id, startsAt: at(date, '10:00'), customer: customer(i + 1), source: 'ONLINE' }),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(9);
    for (const f of failed) expect(f.reason).toMatchObject({ status: 409, code: 'SLOT_TAKEN' });
    expect(await prisma.appointment.count()).toBe(1);
  });

  it('turnos que se solapan parcialmente también se rechazan', async () => {
    const { service, pros } = await createFixtures(1);
    await bookAppointment({ serviceId: service.id, professionalId: pros[0].id, startsAt: at(date, '10:00'), customer: customer(1), source: 'ONLINE' });
    // 10:00-10:45 ocupado: 10:30 pisa los últimos 15 minutos
    await expect(
      bookAppointment({ serviceId: service.id, professionalId: pros[0].id, startsAt: at(date, '10:30'), customer: customer(2), source: 'ONLINE' }),
    ).rejects.toMatchObject({ code: 'SLOT_TAKEN' });
    // y 10:45 (justo cuando termina) sí es válido
    await expect(
      bookAppointment({ serviceId: service.id, professionalId: pros[0].id, startsAt: at(date, '10:45'), customer: customer(3), source: 'ONLINE' }),
    ).resolves.toBeTruthy();
  });

  it('"el primero disponible": 4 pedidos simultáneos con 2 profesionales → 2 reservan (uno en cada agenda) y 2 fallan', async () => {
    const { service, pros } = await createFixtures(2);
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, (_, i) =>
        bookAppointment({ serviceId: service.id, professionalId: null, startsAt: at(date, '11:00'), customer: customer(i + 1), source: 'ONLINE' }),
      ),
    );
    const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof bookAppointment>>> => r.status === 'fulfilled');
    expect(ok).toHaveLength(2);
    expect(new Set(ok.map((r) => r.value.professionalId)).size).toBe(2);
    expect(await prisma.appointment.count({ where: { professionalId: { in: pros.map((p) => p.id) } } })).toBe(2);
  });

  it('la restricción vive en la base: un insert directo que se pisa es rechazado por Postgres', async () => {
    const { service, pros } = await createFixtures(1);
    const c = await prisma.customer.create({ data: { name: 'A', phone: '123456' } });
    const base = { professionalId: pros[0].id, serviceId: service.id, customerId: c.id, price: 1 };
    await prisma.appointment.create({ data: { ...base, manageToken: 't1', startsAt: at(date, '12:00'), endsAt: at(date, '12:45') } });
    const err = await prisma.appointment
      .create({ data: { ...base, manageToken: 't2', startsAt: at(date, '12:15'), endsAt: at(date, '13:00') } })
      .catch((e) => e);
    expect(isOverlapError(err)).toBe(true);
  });

  it('un turno cancelado libera el horario', async () => {
    const { service, pros } = await createFixtures(1);
    const a = await bookAppointment({ serviceId: service.id, professionalId: pros[0].id, startsAt: at(date, '15:00'), customer: customer(1), source: 'ONLINE' });
    await prisma.appointment.update({ where: { id: a.id }, data: { status: 'CANCELLED' } });
    await expect(
      bookAppointment({ serviceId: service.id, professionalId: pros[0].id, startsAt: at(date, '15:00'), customer: customer(2), source: 'ONLINE' }),
    ).resolves.toBeTruthy();
  });

  it('dos profesionales distintos pueden tener turno a la misma hora', async () => {
    const { service, pros } = await createFixtures(2);
    await bookAppointment({ serviceId: service.id, professionalId: pros[0].id, startsAt: at(date, '10:00'), customer: customer(1), source: 'ONLINE' });
    await expect(
      bookAppointment({ serviceId: service.id, professionalId: pros[1].id, startsAt: at(date, '10:00'), customer: customer(2), source: 'ONLINE' }),
    ).resolves.toBeTruthy();
  });
});

describe('disponibilidad real contra la base', () => {
  it('un horario reservado desaparece de la lista y los solapados también', async () => {
    const { service, pros } = await createFixtures(1);
    await bookAppointment({ serviceId: service.id, professionalId: pros[0].id, startsAt: at(date, '10:00'), customer: customer(1), source: 'ONLINE' });
    const slots = (await getSlots({ serviceId: service.id, professionalId: pros[0].id, date })).map((s) => s.startsAt);
    expect(slots).not.toContain(at(date, '10:00').toISOString());
    expect(slots).not.toContain(at(date, '10:30').toISOString());
    expect(slots).toContain(at(date, '10:45').toISOString());
    expect(slots).toContain(at(date, '09:00').toISOString());
    // 09:15 + 45' = 10:00 → entra justo
    expect(slots).toContain(at(date, '09:15').toISOString());
    expect(slots).not.toContain(at(date, '09:30').toISOString());
  });

  it('feriados y bloqueos quitan horarios', async () => {
    const { service, pros } = await createFixtures(1);
    await prisma.timeBlock.create({ data: { professionalId: pros[0].id, startsAt: at(date, '13:00'), endsAt: at(date, '14:00'), reason: 'Almuerzo' } });
    const slots = (await getSlots({ serviceId: service.id, professionalId: pros[0].id, date })).map((s) => s.startsAt);
    expect(slots).not.toContain(at(date, '13:00').toISOString());
    expect(slots).not.toContain(at(date, '13:30').toISOString());
    expect(slots).toContain(at(date, '14:00').toISOString());

    await prisma.holiday.create({ data: { date, name: 'Feriado' } });
    expect(await getSlots({ serviceId: service.id, professionalId: pros[0].id, date })).toEqual([]);
  });

  it('"cualquiera": un horario ocupado en un profesional sigue disponible si el otro está libre', async () => {
    const { service, pros } = await createFixtures(2);
    await bookAppointment({ serviceId: service.id, professionalId: pros[0].id, startsAt: at(date, '10:00'), customer: customer(1), source: 'ONLINE' });
    const slots = await getSlots({ serviceId: service.id, date });
    const ten = slots.find((s) => s.startsAt === at(date, '10:00').toISOString());
    expect(ten?.professionalId).toBe(pros[1].id);
  });
});

describe('cancelar y reprogramar', () => {
  it('respeta la política: no se puede cancelar dentro de las horas límite', () => {
    const soon = { startsAt: new Date(Date.now() + 2 * 3_600_000), status: 'CONFIRMED' as const };
    expect(() => assertCanSelfManage(soon, 4)).toThrow(/4 hs/);
    const later = { startsAt: new Date(Date.now() + 10 * 3_600_000), status: 'CONFIRMED' as const };
    expect(() => assertCanSelfManage(later, 4)).not.toThrow();
    expect(() => assertCanSelfManage({ ...later, status: 'CANCELLED' as const }, 4)).toThrow();
  });

  it('reprogramar mueve el turno y libera el horario viejo', async () => {
    const { service, pros } = await createFixtures(1);
    const a = await bookAppointment({ serviceId: service.id, professionalId: pros[0].id, startsAt: at(date, '10:00'), customer: customer(1), source: 'ONLINE' });
    const moved = await moveAppointment(a.id, { startsAt: at(date, '16:00') });
    expect(moved.startsAt.toISOString()).toBe(at(date, '16:00').toISOString());
    expect(moved.endsAt.getTime() - moved.startsAt.getTime()).toBe(45 * 60_000);
    const slots = (await getSlots({ serviceId: service.id, professionalId: pros[0].id, date })).map((s) => s.startsAt);
    expect(slots).toContain(at(date, '10:00').toISOString());
    expect(slots).not.toContain(at(date, '16:00').toISOString());
  });

  it('no se puede reprogramar encima de otro turno (ni siquiera el admin)', async () => {
    const { service, pros } = await createFixtures(1);
    await bookAppointment({ serviceId: service.id, professionalId: pros[0].id, startsAt: at(date, '10:00'), customer: customer(1), source: 'ONLINE' });
    const b = await bookAppointment({ serviceId: service.id, professionalId: pros[0].id, startsAt: at(date, '14:00'), customer: customer(2), source: 'ONLINE' });
    await expect(moveAppointment(b.id, { startsAt: at(date, '10:15') })).rejects.toMatchObject({ code: 'SLOT_TAKEN' });
    await expect(moveAppointment(b.id, { startsAt: at(date, '10:15'), skipRules: true })).rejects.toMatchObject({ code: 'SLOT_TAKEN' });
  });

  it('un cliente que vuelve a reservar reutiliza su ficha (mismo email)', async () => {
    const { service, pros } = await createFixtures(1);
    await bookAppointment({ serviceId: service.id, professionalId: pros[0].id, startsAt: at(date, '10:00'), customer: customer(1), source: 'ONLINE' });
    await bookAppointment({ serviceId: service.id, professionalId: pros[0].id, startsAt: at(date, '12:00'), customer: customer(1), source: 'ONLINE' });
    expect(await prisma.customer.count()).toBe(1);
  });
});
