import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { config } from '../lib/config';
import { AppError, notFound } from '../lib/errors';
import { parse, wrap } from '../middleware/http';
import { getBusiness, getMonthAvailability, getSlots } from '../services/availability';
import { assertCanSelfManage, bookAppointment, moveAppointment } from '../services/booking';
import {
  buildIcs,
  cancellationEmail,
  confirmationEmail,
  googleCalendarUrl,
  manageUrl,
  rescheduleEmail,
  sendEmail,
  type FullAppointment,
} from '../services/email';

export const publicRouter = Router();

const bookingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Demasiados intentos. Probá de nuevo en unos minutos.' } },
});

const fullInclude = { service: true, professional: true, customer: true } as const;

const loadByToken = async (token: string): Promise<FullAppointment> => {
  const appt = await prisma.appointment.findUnique({ where: { manageToken: token }, include: fullInclude });
  if (!appt) throw notFound('No encontramos este turno. Revisá el link.');
  return appt;
};

async function toPublicAppointment(a: FullAppointment) {
  const business = await getBusiness();
  let canManage = true;
  let manageReason: string | null = null;
  try {
    assertCanSelfManage(a, business.cancellationHours);
  } catch (e) {
    canManage = false;
    manageReason = e instanceof AppError ? e.message : null;
  }
  return {
    token: a.manageToken,
    status: a.status,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    price: a.price,
    service: { id: a.service.id, name: a.service.name, durationMin: a.service.durationMin },
    professional: { id: a.professional.id, name: a.professional.name },
    customer: { name: a.customer.name, email: a.customer.email, phone: a.customer.phone },
    canManage,
    manageReason,
    cancellationPolicy: business.cancellationPolicy,
    calendarUrl: googleCalendarUrl(a, business),
    manageUrl: manageUrl(a),
  };
}

publicRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

publicRouter.get(
  '/business',
  wrap(async (_req, res) => {
    const b = await getBusiness();
    res.json({
      name: b.name,
      tagline: b.tagline,
      industry: b.industry,
      logoUrl: b.logoUrl,
      accentColor: b.accentColor,
      baseColor: b.baseColor,
      heroTitle: b.heroTitle,
      heroSubtitle: b.heroSubtitle,
      bookingIntro: b.bookingIntro,
      cancellationPolicy: b.cancellationPolicy,
      cancellationHours: b.cancellationHours,
      professionalLabel: b.professionalLabel,
      professionalPlural: b.professionalPlural,
      whatsappNumber: b.whatsappNumber,
      phone: b.phone,
      email: b.email,
      address: b.address,
      instagram: b.instagram,
      timezone: b.timezone,
      maxDaysAhead: b.maxDaysAhead,
      demoMode: config.demoMode,
    });
  }),
);

publicRouter.get(
  '/services',
  wrap(async (_req, res) => {
    const services = await prisma.service.findMany({
      where: { active: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: { professionals: { select: { professionalId: true } } },
    });
    res.json(
      services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        durationMin: s.durationMin,
        price: s.price,
        category: s.category,
        professionalIds: s.professionals.map((p) => p.professionalId),
      })),
    );
  }),
);

publicRouter.get(
  '/professionals',
  wrap(async (_req, res) => {
    const pros = await prisma.professional.findMany({
      where: { active: true },
      orderBy: { position: 'asc' },
      include: { services: { select: { serviceId: true } } },
    });
    res.json(
      pros.map((p) => ({
        id: p.id,
        name: p.name,
        bio: p.bio,
        photoUrl: p.photoUrl,
        color: p.color,
        serviceIds: p.services.map((s) => s.serviceId),
      })),
    );
  }),
);

const availabilityQuery = z.object({
  serviceId: z.string().min(1),
  professionalId: z.string().min(1).optional(),
});

publicRouter.get(
  '/availability/slots',
  wrap(async (req, res) => {
    const q = parse(availabilityQuery.extend({ date: z.string() }), req.query);
    const slots = await getSlots(q);
    res.json({ date: q.date, slots });
  }),
);

publicRouter.get(
  '/availability/days',
  wrap(async (req, res) => {
    const q = parse(availabilityQuery.extend({ month: z.string() }), req.query);
    res.json({ month: q.month, days: await getMonthAvailability(q) });
  }),
);

const bookingBody = z.object({
  serviceId: z.string().min(1),
  professionalId: z.string().min(1).nullish(),
  startsAt: z.coerce.date(),
  customer: z.object({
    name: z.string().trim().min(2, 'Ingresá tu nombre').max(80),
    phone: z.string().trim().min(6, 'Ingresá un teléfono válido').max(30),
    email: z.string().trim().toLowerCase().email('Ingresá un email válido').max(120),
  }),
  notes: z.string().trim().max(300).nullish(),
});

publicRouter.post(
  '/appointments',
  bookingLimiter,
  wrap(async (req, res) => {
    const body = parse(bookingBody, req.body);
    const created = await bookAppointment({ ...body, source: 'ONLINE' });
    const appt = await loadByToken(created.manageToken);
    const business = await getBusiness();
    const mail = await sendEmail(appt.customer.email, confirmationEmail(appt, business));
    res.status(201).json({
      appointment: await toPublicAppointment(appt),
      // En modo demo el email no se envía: se muestra en pantalla
      emailPreview: config.demoMode && mail ? { to: mail.to, subject: mail.subject, html: mail.html } : null,
    });
  }),
);

publicRouter.get(
  '/appointments/:token',
  wrap(async (req, res) => {
    res.json(await toPublicAppointment(await loadByToken(req.params.token)));
  }),
);

publicRouter.get(
  '/appointments/:token/calendar.ics',
  wrap(async (req, res) => {
    const appt = await loadByToken(req.params.token);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="turno.ics"');
    res.send(buildIcs(appt, await getBusiness()));
  }),
);

publicRouter.post(
  '/appointments/:token/cancel',
  bookingLimiter,
  wrap(async (req, res) => {
    const appt = await loadByToken(req.params.token);
    const business = await getBusiness();
    assertCanSelfManage(appt, business.cancellationHours);
    await prisma.appointment.update({ where: { id: appt.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    const fresh = await loadByToken(req.params.token);
    const mail = await sendEmail(fresh.customer.email, cancellationEmail(fresh, business));
    res.json({
      appointment: await toPublicAppointment(fresh),
      emailPreview: config.demoMode && mail ? { to: mail.to, subject: mail.subject, html: mail.html } : null,
    });
  }),
);

publicRouter.post(
  '/appointments/:token/reschedule',
  bookingLimiter,
  wrap(async (req, res) => {
    const body = parse(z.object({ startsAt: z.coerce.date(), professionalId: z.string().min(1).optional() }), req.body);
    const appt = await loadByToken(req.params.token);
    const business = await getBusiness();
    assertCanSelfManage(appt, business.cancellationHours);
    await moveAppointment(appt.id, { startsAt: body.startsAt, professionalId: body.professionalId });
    const fresh = await loadByToken(req.params.token);
    const mail = await sendEmail(fresh.customer.email, rescheduleEmail(fresh, business));
    res.json({
      appointment: await toPublicAppointment(fresh),
      emailPreview: config.demoMode && mail ? { to: mail.to, subject: mail.subject, html: mail.html } : null,
    });
  }),
);
