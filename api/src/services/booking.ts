import { randomBytes } from 'node:crypto';
import type { Appointment, AppointmentSource, Prisma, Professional } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError, badRequest, conflict, notFound } from '../lib/errors';
import { toLocalDate } from '../lib/time';
import { eligibleProfessionals, getBusiness, loadContext, slotsForProfessional, slotsFromContext } from './availability';

export const newManageToken = () => randomBytes(24).toString('base64url');

/** Postgres rechaza con 23P01 (exclusion_violation) cuando dos turnos activos del mismo profesional se pisan. */
export function isOverlapError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes('appointment_no_overlap') || msg.includes('23P01');
}

export interface CustomerInput {
  name: string;
  phone: string;
  email?: string | null;
}

export async function upsertCustomer(tx: Prisma.TransactionClient, c: CustomerInput) {
  const email = c.email ? c.email.trim().toLowerCase() : null;
  if (email) {
    return tx.customer.upsert({
      where: { email },
      update: { name: c.name.trim(), phone: c.phone.trim() },
      create: { name: c.name.trim(), phone: c.phone.trim(), email },
    });
  }
  const existing = await tx.customer.findFirst({ where: { phone: c.phone.trim(), email: null } });
  if (existing) return tx.customer.update({ where: { id: existing.id }, data: { name: c.name.trim() } });
  return tx.customer.create({ data: { name: c.name.trim(), phone: c.phone.trim() } });
}

export interface BookInput {
  serviceId: string;
  /** null/undefined = "el primero disponible" */
  professionalId?: string | null;
  startsAt: Date;
  customer: CustomerInput;
  notes?: string | null;
  source: AppointmentSource;
  /** Admin: puede cargar fuera de horario o aviso mínimo; igual no puede pisar otro turno. */
  skipRules?: boolean;
}

export async function bookAppointment(input: BookInput): Promise<Appointment> {
  const business = await getBusiness();
  const { service, pros } = await eligibleProfessionals(input.serviceId, input.professionalId);
  let candidates: Professional[] = pros;

  // El admin puede asignar a un profesional puntual aunque no figure en el servicio
  if (input.skipRules && input.professionalId && candidates.length === 0) {
    const p = await prisma.professional.findUnique({ where: { id: input.professionalId } });
    if (!p) throw notFound('Profesional no encontrado');
    candidates = [p];
  }

  if (!input.skipRules) {
    const date = toLocalDate(input.startsAt, business.timezone);
    const ctx = await loadContext(business, { fromDate: date, toDate: date, professionals: candidates });
    const wanted = input.startsAt.getTime();
    const stillFree = candidates.filter((p) =>
      slotsForProfessional(ctx, p.id, date, service.durationMin).some((s) => s.getTime() === wanted),
    );
    if (stillFree.length === 0) throw conflict('Ese horario ya no está disponible. Elegí otro, por favor.', 'SLOT_TAKEN');
    // Mismo criterio que la pantalla: primero el profesional menos ocupado
    const preferred = slotsFromContext(ctx, candidates, date, service.durationMin).find(
      (s) => new Date(s.startsAt).getTime() === wanted,
    )?.professionalId;
    candidates = [...stillFree].sort((a, b) => (a.id === preferred ? -1 : b.id === preferred ? 1 : 0));
  }

  const endsAt = new Date(input.startsAt.getTime() + service.durationMin * 60_000);

  for (const pro of candidates) {
    try {
      return await prisma.$transaction(async (tx) => {
        const customer = await upsertCustomer(tx, input.customer);
        return tx.appointment.create({
          data: {
            manageToken: newManageToken(),
            professionalId: pro.id,
            serviceId: service.id,
            customerId: customer.id,
            startsAt: input.startsAt,
            endsAt,
            price: service.price,
            notes: input.notes ?? null,
            source: input.source,
          },
        });
      });
    } catch (e) {
      // Otra persona reservó este mismo horario en el mismo instante: se prueba con el siguiente profesional
      if (isOverlapError(e)) continue;
      throw e;
    }
  }
  throw conflict('Ese horario acaba de ser reservado por otra persona. Elegí otro, por favor.', 'SLOT_TAKEN');
}

export interface MoveInput {
  startsAt: Date;
  professionalId?: string;
  skipRules?: boolean;
}

/** Reprograma (día/hora y opcionalmente profesional) conservando duración y precio. */
export async function moveAppointment(id: string, input: MoveInput): Promise<Appointment> {
  const appt = await prisma.appointment.findUnique({ where: { id } });
  if (!appt) throw notFound('Turno no encontrado');
  if (appt.status === 'CANCELLED') throw badRequest('No se puede mover un turno cancelado');
  const business = await getBusiness();
  const durationMs = appt.endsAt.getTime() - appt.startsAt.getTime();
  const professionalId = input.professionalId ?? appt.professionalId;

  if (!input.skipRules) {
    const pro = await prisma.professional.findUnique({ where: { id: professionalId } });
    if (!pro || !pro.active) throw badRequest('Profesional no disponible');
    const date = toLocalDate(input.startsAt, business.timezone);
    const ctx = await loadContext(business, { fromDate: date, toDate: date, professionals: [pro], excludeAppointmentId: id });
    const free = slotsForProfessional(ctx, pro.id, date, Math.round(durationMs / 60_000)).some(
      (s) => s.getTime() === input.startsAt.getTime(),
    );
    if (!free) throw conflict('Ese horario no está disponible. Elegí otro, por favor.', 'SLOT_TAKEN');
  }

  try {
    return await prisma.appointment.update({
      where: { id },
      data: { startsAt: input.startsAt, endsAt: new Date(input.startsAt.getTime() + durationMs), professionalId },
    });
  } catch (e) {
    if (isOverlapError(e)) throw conflict('Ese horario se superpone con otro turno.', 'SLOT_TAKEN');
    throw e;
  }
}

/** Política de cancelación: se puede cancelar o reprogramar hasta N horas antes del turno. */
export function assertCanSelfManage(appt: Pick<Appointment, 'startsAt' | 'status'>, cancellationHours: number, now = new Date()) {
  if (appt.status !== 'CONFIRMED') throw new AppError(409, 'NOT_ACTIVE', 'Este turno ya no está activo.');
  if (appt.startsAt.getTime() <= now.getTime()) throw new AppError(409, 'PAST', 'Este turno ya pasó.');
  const limit = appt.startsAt.getTime() - cancellationHours * 3_600_000;
  if (now.getTime() > limit) {
    throw new AppError(
      409,
      'TOO_LATE',
      `Solo se puede cancelar o reprogramar con ${cancellationHours} hs de anticipación. Escribinos por WhatsApp y lo resolvemos.`,
    );
  }
}
