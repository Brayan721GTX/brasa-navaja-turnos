import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { parse, requireAuth, requireRole, scopedProfessionalId, wrap } from '../middleware/http';
import { getBusiness } from '../services/availability';
import { bookAppointment, moveAppointment } from '../services/booking';
import { hashPassword } from '../services/auth';
import { cancellationEmail, rescheduleEmail, sendEmail } from '../services/email';
import { getDashboard } from '../services/stats';

export const adminRouter = Router();
adminRouter.use(requireAuth);

const adminOnly = requireRole('ADMIN');
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido (usá #RRGGBB)');
const idParam = (req: { params: Record<string, string> }) => req.params.id;

/* ───────────── Dashboard ───────────── */

adminRouter.get(
  '/dashboard',
  wrap(async (req, res) => {
    res.json(await getDashboard(scopedProfessionalId(req.user!)));
  }),
);

/* ───────────── Turnos ───────────── */

const apptInclude = {
  service: { select: { id: true, name: true, durationMin: true } },
  professional: { select: { id: true, name: true, color: true } },
  customer: { select: { id: true, name: true, phone: true, email: true } },
} as const;

const toApptDto = (a: Prisma.AppointmentGetPayload<{ include: typeof apptInclude }>) => ({
  id: a.id,
  startsAt: a.startsAt.toISOString(),
  endsAt: a.endsAt.toISOString(),
  status: a.status,
  source: a.source,
  price: a.price,
  notes: a.notes,
  service: a.service,
  professional: a.professional,
  customer: a.customer,
});

adminRouter.get(
  '/appointments',
  wrap(async (req, res) => {
    const q = parse(
      z.object({
        from: z.coerce.date(),
        to: z.coerce.date(),
        professionalId: z.string().optional(),
        includeCancelled: z.enum(['true', 'false']).optional(),
      }),
      req.query,
    );
    const professionalId = scopedProfessionalId(req.user!, q.professionalId);
    const list = await prisma.appointment.findMany({
      where: {
        startsAt: { gte: q.from, lt: q.to },
        ...(professionalId ? { professionalId } : {}),
        ...(q.includeCancelled === 'true' ? {} : { status: { not: 'CANCELLED' } }),
      },
      orderBy: { startsAt: 'asc' },
      include: apptInclude,
    });
    res.json(list.map(toApptDto));
  }),
);

const manualBody = z.object({
  serviceId: z.string().min(1),
  professionalId: z.string().min(1),
  startsAt: z.coerce.date(),
  customer: z.object({
    name: z.string().trim().min(2).max(80),
    phone: z.string().trim().min(6).max(30),
    email: z.string().trim().email().max(120).nullish().or(z.literal('').transform(() => null)),
  }),
  notes: z.string().trim().max(300).nullish(),
});

adminRouter.post(
  '/appointments',
  wrap(async (req, res) => {
    const body = parse(manualBody, req.body);
    const professionalId = scopedProfessionalId(req.user!, body.professionalId)!;
    const created = await bookAppointment({ ...body, professionalId, source: 'ADMIN', skipRules: true });
    const full = await prisma.appointment.findUniqueOrThrow({ where: { id: created.id }, include: apptInclude });
    res.status(201).json(toApptDto(full));
  }),
);

const patchApptBody = z.object({
  startsAt: z.coerce.date().optional(),
  professionalId: z.string().min(1).optional(),
  status: z.enum(['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']).optional(),
  notes: z.string().trim().max(300).nullable().optional(),
});

adminRouter.patch(
  '/appointments/:id',
  wrap(async (req, res) => {
    const body = parse(patchApptBody, req.body);
    const existing = await prisma.appointment.findUnique({ where: { id: idParam(req) } });
    if (!existing) throw notFound('Turno no encontrado');
    if (req.user!.role === 'PROFESSIONAL' && existing.professionalId !== req.user!.professionalId) throw forbidden();
    if (req.user!.role === 'PROFESSIONAL' && body.professionalId && body.professionalId !== existing.professionalId) {
      throw forbidden('Solo el administrador puede pasar un turno a otro profesional');
    }

    const business = await getBusiness();
    let moved = false;
    if (body.startsAt || body.professionalId) {
      const startsAt = body.startsAt ?? existing.startsAt;
      moved = startsAt.getTime() !== existing.startsAt.getTime() || (!!body.professionalId && body.professionalId !== existing.professionalId);
      if (moved) await moveAppointment(existing.id, { startsAt, professionalId: body.professionalId, skipRules: true });
    }
    if (body.status || body.notes !== undefined) {
      await prisma.appointment.update({
        where: { id: existing.id },
        data: {
          ...(body.status ? { status: body.status, cancelledAt: body.status === 'CANCELLED' ? new Date() : null } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
        },
      }).catch((e) => {
        // Volver a "confirmado" un turno cancelado puede pisar a otro: la base lo impide
        if (e instanceof Error && e.message.includes('appointment_no_overlap')) {
          throw conflict('No se puede reactivar: ese horario ya fue ocupado por otro turno.', 'SLOT_TAKEN');
        }
        throw e;
      });
    }

    const full = await prisma.appointment.findUniqueOrThrow({ where: { id: existing.id }, include: { service: true, professional: true, customer: true } });
    if (full.customer.email) {
      if (body.status === 'CANCELLED' && existing.status !== 'CANCELLED') await sendEmail(full.customer.email, cancellationEmail(full, business));
      else if (moved) await sendEmail(full.customer.email, rescheduleEmail(full, business));
    }
    const dto = await prisma.appointment.findUniqueOrThrow({ where: { id: existing.id }, include: apptInclude });
    res.json(toApptDto(dto));
  }),
);

/* ───────────── Servicios ───────────── */

const serviceBody = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).nullish(),
  durationMin: z.number().int().min(5).max(480),
  price: z.number().int().min(0).max(10_000_000),
  category: z.string().trim().max(40).nullish(),
  active: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
  professionalIds: z.array(z.string()).default([]),
});

const serviceDto = (s: Prisma.ServiceGetPayload<{ include: { professionals: true } }>) => ({
  id: s.id,
  name: s.name,
  description: s.description,
  durationMin: s.durationMin,
  price: s.price,
  category: s.category,
  active: s.active,
  position: s.position,
  professionalIds: s.professionals.map((p) => p.professionalId),
});

adminRouter.get(
  '/services',
  wrap(async (_req, res) => {
    const list = await prisma.service.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }], include: { professionals: true } });
    res.json(list.map(serviceDto));
  }),
);

adminRouter.post(
  '/services',
  adminOnly,
  wrap(async (req, res) => {
    const { professionalIds, ...data } = parse(serviceBody, req.body);
    const s = await prisma.service.create({
      data: { ...data, professionals: { create: professionalIds.map((professionalId) => ({ professionalId })) } },
      include: { professionals: true },
    });
    res.status(201).json(serviceDto(s));
  }),
);

adminRouter.put(
  '/services/:id',
  adminOnly,
  wrap(async (req, res) => {
    const { professionalIds, ...data } = parse(serviceBody, req.body);
    const id = idParam(req);
    if (!(await prisma.service.findUnique({ where: { id } }))) throw notFound('Servicio no encontrado');
    const s = await prisma.$transaction(async (tx) => {
      await tx.professionalService.deleteMany({ where: { serviceId: id } });
      return tx.service.update({
        where: { id },
        data: { ...data, professionals: { create: professionalIds.map((professionalId) => ({ professionalId })) } },
        include: { professionals: true },
      });
    });
    res.json(serviceDto(s));
  }),
);

adminRouter.delete(
  '/services/:id',
  adminOnly,
  wrap(async (req, res) => {
    const id = idParam(req);
    const used = await prisma.appointment.count({ where: { serviceId: id } });
    if (used > 0) {
      // Con historial no se borra: se desactiva para no perder estadísticas ni fichas
      await prisma.service.update({ where: { id }, data: { active: false } });
      return res.json({ deleted: false, deactivated: true });
    }
    await prisma.service.delete({ where: { id } });
    res.json({ deleted: true, deactivated: false });
  }),
);

/* ───────────── Profesionales ───────────── */

const proInclude = { services: true, hours: true, user: { select: { id: true, email: true, isDemo: true } } } as const;

const proDto = (p: Prisma.ProfessionalGetPayload<{ include: typeof proInclude }>) => ({
  id: p.id,
  name: p.name,
  bio: p.bio,
  photoUrl: p.photoUrl,
  color: p.color,
  position: p.position,
  active: p.active,
  serviceIds: p.services.map((s) => s.serviceId),
  hours: p.hours.map((h) => ({ weekday: h.weekday, startMinute: h.startMinute, endMinute: h.endMinute })),
  account: p.user ? { email: p.user.email, isDemo: p.user.isDemo } : null,
});

adminRouter.get(
  '/professionals',
  wrap(async (req, res) => {
    const only = scopedProfessionalId(req.user!);
    const list = await prisma.professional.findMany({
      where: only ? { id: only } : {},
      orderBy: { position: 'asc' },
      include: proInclude,
    });
    res.json(list.map(proDto));
  }),
);

const proBody = z.object({
  name: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(240).nullish(),
  photoUrl: z.string().url().max(500).nullish().or(z.literal('').transform(() => null)),
  color: hexColor.default('#C8895A'),
  position: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  serviceIds: z.array(z.string()).default([]),
  /** Solo al crear: usuario de acceso para que el profesional vea su agenda */
  account: z.object({ email: z.string().email(), password: z.string().min(8).max(100) }).optional(),
});

adminRouter.post(
  '/professionals',
  adminOnly,
  wrap(async (req, res) => {
    const { serviceIds, account, ...data } = parse(proBody, req.body);
    const created = await prisma.$transaction(async (tx) => {
      const pro = await tx.professional.create({
        data: { ...data, services: { create: serviceIds.map((serviceId) => ({ serviceId })) } },
      });
      if (account) {
        const email = account.email.toLowerCase();
        if (await tx.user.findUnique({ where: { email } })) throw conflict('Ya existe un usuario con ese email');
        await tx.user.create({
          data: { email, name: pro.name, role: 'PROFESSIONAL', passwordHash: await hashPassword(account.password), professionalId: pro.id },
        });
      }
      return tx.professional.findUniqueOrThrow({ where: { id: pro.id }, include: proInclude });
    });
    res.status(201).json(proDto(created));
  }),
);

adminRouter.put(
  '/professionals/:id',
  adminOnly,
  wrap(async (req, res) => {
    const { serviceIds, account: _ignored, ...data } = parse(proBody, req.body);
    const id = idParam(req);
    const current = await prisma.professional.findUnique({ where: { id }, include: { user: true } });
    if (!current) throw notFound('Profesional no encontrado');
    if (current.user?.isDemo && data.active === false) throw forbidden('No se puede desactivar a un profesional con cuenta de demo.');
    const updated = await prisma.$transaction(async (tx) => {
      await tx.professionalService.deleteMany({ where: { professionalId: id } });
      return tx.professional.update({
        where: { id },
        data: { ...data, services: { create: serviceIds.map((serviceId) => ({ serviceId })) } },
        include: proInclude,
      });
    });
    res.json(proDto(updated));
  }),
);

adminRouter.delete(
  '/professionals/:id',
  adminOnly,
  wrap(async (req, res) => {
    const id = idParam(req);
    const pro = await prisma.professional.findUnique({ where: { id }, include: { user: true } });
    if (!pro) throw notFound('Profesional no encontrado');
    if (pro.user?.isDemo) throw forbidden('Las cuentas de demo no se pueden borrar.');
    const used = await prisma.appointment.count({ where: { professionalId: id } });
    if (used > 0) {
      await prisma.professional.update({ where: { id }, data: { active: false } });
      if (pro.user) await prisma.user.update({ where: { id: pro.user.id }, data: { active: false } });
      return res.json({ deleted: false, deactivated: true });
    }
    await prisma.professional.delete({ where: { id } });
    res.json({ deleted: true, deactivated: false });
  }),
);

const hoursBody = z.object({
  hours: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(1439),
        endMinute: z.number().int().min(1).max(1440),
      }),
    )
    .max(40),
});

adminRouter.put(
  '/professionals/:id/hours',
  adminOnly,
  wrap(async (req, res) => {
    const { hours } = parse(hoursBody, req.body);
    const id = idParam(req);
    for (const h of hours) if (h.startMinute >= h.endMinute) throw badRequest('Cada franja debe terminar después de empezar');
    for (let wd = 0; wd < 7; wd++) {
      const day = hours.filter((h) => h.weekday === wd).sort((a, b) => a.startMinute - b.startMinute);
      for (let i = 1; i < day.length; i++) if (day[i].startMinute < day[i - 1].endMinute) throw badRequest('Hay franjas que se superponen en el mismo día');
    }
    if (!(await prisma.professional.findUnique({ where: { id } }))) throw notFound('Profesional no encontrado');
    await prisma.$transaction([
      prisma.workingHours.deleteMany({ where: { professionalId: id } }),
      prisma.workingHours.createMany({ data: hours.map((h) => ({ ...h, professionalId: id })) }),
    ]);
    res.json({ hours });
  }),
);

/* ───────────── Feriados ───────────── */

adminRouter.get(
  '/holidays',
  wrap(async (_req, res) => {
    res.json(await prisma.holiday.findMany({ orderBy: { date: 'asc' } }));
  }),
);

adminRouter.post(
  '/holidays',
  adminOnly,
  wrap(async (req, res) => {
    const body = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string().trim().min(2).max(80) }), req.body);
    const h = await prisma.holiday.upsert({ where: { date: body.date }, update: { name: body.name }, create: body });
    res.status(201).json(h);
  }),
);

adminRouter.delete(
  '/holidays/:id',
  adminOnly,
  wrap(async (req, res) => {
    await prisma.holiday.deleteMany({ where: { id: idParam(req) } });
    res.status(204).end();
  }),
);

/* ───────────── Bloqueos (vacaciones, almuerzo, trámites) ───────────── */

adminRouter.get(
  '/blocks',
  wrap(async (req, res) => {
    const only = scopedProfessionalId(req.user!);
    const list = await prisma.timeBlock.findMany({
      where: { endsAt: { gte: new Date(Date.now() - 86_400_000) }, ...(only ? { OR: [{ professionalId: only }, { professionalId: null }] } : {}) },
      orderBy: { startsAt: 'asc' },
      include: { professional: { select: { id: true, name: true, color: true } } },
    });
    res.json(
      list.map((b) => ({
        id: b.id,
        professionalId: b.professionalId,
        professional: b.professional,
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        reason: b.reason,
      })),
    );
  }),
);

adminRouter.post(
  '/blocks',
  wrap(async (req, res) => {
    const body = parse(
      z.object({
        professionalId: z.string().min(1).nullish(),
        startsAt: z.coerce.date(),
        endsAt: z.coerce.date(),
        reason: z.string().trim().max(120).nullish(),
      }),
      req.body,
    );
    if (body.endsAt <= body.startsAt) throw badRequest('El bloqueo debe terminar después de empezar');
    let professionalId: string | null = body.professionalId ?? null;
    if (req.user!.role === 'PROFESSIONAL') professionalId = req.user!.professionalId;
    else if (!professionalId && req.user!.role !== 'ADMIN') throw forbidden();
    const b = await prisma.timeBlock.create({ data: { professionalId, startsAt: body.startsAt, endsAt: body.endsAt, reason: body.reason ?? null } });
    res.status(201).json({ ...b, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString() });
  }),
);

adminRouter.delete(
  '/blocks/:id',
  wrap(async (req, res) => {
    const block = await prisma.timeBlock.findUnique({ where: { id: idParam(req) } });
    if (!block) throw notFound('Bloqueo no encontrado');
    if (req.user!.role === 'PROFESSIONAL' && block.professionalId !== req.user!.professionalId) throw forbidden();
    await prisma.timeBlock.delete({ where: { id: block.id } });
    res.status(204).end();
  }),
);

/* ───────────── Clientes ───────────── */

adminRouter.get(
  '/customers',
  wrap(async (req, res) => {
    const { q } = parse(z.object({ q: z.string().trim().max(60).optional() }), req.query);
    const only = scopedProfessionalId(req.user!);
    const customers = await prisma.customer.findMany({
      where: {
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { email: { contains: q, mode: 'insensitive' } }] } : {}),
        ...(only ? { appointments: { some: { professionalId: only } } } : {}),
      },
      orderBy: { name: 'asc' },
      take: 200,
      include: { appointments: { select: { startsAt: true, status: true, price: true } } },
    });
    res.json(
      customers.map((c) => {
        const done = c.appointments.filter((a) => a.status === 'COMPLETED');
        const last = done.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0];
        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          email: c.email,
          notes: c.notes,
          totalAppointments: c.appointments.length,
          completed: done.length,
          cancelled: c.appointments.filter((a) => a.status === 'CANCELLED').length,
          totalSpent: done.reduce((s, a) => s + a.price, 0),
          lastVisit: last?.startsAt.toISOString() ?? null,
        };
      }),
    );
  }),
);

adminRouter.get(
  '/customers/:id',
  wrap(async (req, res) => {
    const only = scopedProfessionalId(req.user!);
    const c = await prisma.customer.findUnique({
      where: { id: idParam(req) },
      include: {
        appointments: {
          where: only ? { professionalId: only } : {},
          orderBy: { startsAt: 'desc' },
          include: { service: { select: { name: true } }, professional: { select: { name: true } } },
        },
      },
    });
    if (!c || (only && c.appointments.length === 0)) throw notFound('Cliente no encontrado');
    res.json({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      notes: c.notes,
      history: c.appointments.map((a) => ({
        id: a.id,
        startsAt: a.startsAt.toISOString(),
        status: a.status,
        price: a.price,
        service: a.service.name,
        professional: a.professional.name,
      })),
    });
  }),
);

adminRouter.patch(
  '/customers/:id',
  wrap(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(80).optional(),
        phone: z.string().trim().min(6).max(30).optional(),
        notes: z.string().trim().max(500).nullable().optional(),
      }),
      req.body,
    );
    const c = await prisma.customer.update({ where: { id: idParam(req) }, data: body }).catch(() => null);
    if (!c) throw notFound('Cliente no encontrado');
    res.json(c);
  }),
);

/* ───────────── Configuración del negocio ───────────── */

const businessBody = z.object({
  name: z.string().trim().min(2).max(60),
  tagline: z.string().trim().max(120),
  industry: z.string().trim().min(2).max(40),
  logoUrl: z.string().max(500_000).nullish(),
  accentColor: hexColor,
  baseColor: hexColor,
  heroTitle: z.string().trim().min(2).max(100),
  heroSubtitle: z.string().trim().max(240),
  bookingIntro: z.string().trim().max(240),
  cancellationPolicy: z.string().trim().max(400),
  cancellationHours: z.number().int().min(0).max(168),
  professionalLabel: z.string().trim().min(2).max(30),
  professionalPlural: z.string().trim().min(2).max(30),
  whatsappNumber: z.string().trim().max(20).nullish(),
  phone: z.string().trim().max(30).nullish(),
  email: z.string().trim().email().max(120).nullish().or(z.literal('').transform(() => null)),
  address: z.string().trim().max(160).nullish(),
  instagram: z.string().trim().max(60).nullish(),
  slotStepMinutes: z.number().int().refine((n) => [5, 10, 15, 20, 30, 60].includes(n), 'Paso inválido'),
  minNoticeMinutes: z.number().int().min(0).max(10_080),
  maxDaysAhead: z.number().int().min(1).max(180),
});

adminRouter.get(
  '/business',
  adminOnly,
  wrap(async (_req, res) => {
    res.json(await getBusiness());
  }),
);

adminRouter.put(
  '/business',
  adminOnly,
  wrap(async (req, res) => {
    const body = parse(businessBody, req.body);
    const b = await prisma.business.update({ where: { id: 1 }, data: body });
    res.json(b);
  }),
);

/* ───────────── Bandeja de emails (modo demo) ───────────── */

adminRouter.get(
  '/emails',
  adminOnly,
  wrap(async (_req, res) => {
    const list = await prisma.emailLog.findMany({ orderBy: { createdAt: 'desc' }, take: 30 });
    res.json(list.map((e) => ({ id: e.id, to: e.to, subject: e.subject, html: e.html, sent: e.sent, createdAt: e.createdAt.toISOString() })));
  }),
);
