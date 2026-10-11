import nodemailer from 'nodemailer';
import type { Appointment, Business, Customer, EmailLog, Professional, Service } from '@prisma/client';
import { config } from '../lib/config';
import { prisma } from '../lib/prisma';
import { formatLocal } from '../lib/time';

export type FullAppointment = Appointment & { service: Service; professional: Professional; customer: Customer };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Link de "Agregar a Google Calendar". */
export function googleCalendarUrl(a: FullAppointment, b: Business): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${a.service.name} en ${b.name}`,
    dates: `${fmt(a.startsAt)}/${fmt(a.endsAt)}`,
    details: `Turno con ${a.professional.name}. Gestioná tu turno: ${manageUrl(a)}`,
    location: b.address ?? b.name,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export const manageUrl = (a: Pick<Appointment, 'manageToken'>) => `${config.webUrl}/turno/${a.manageToken}`;

/** Archivo .ics (Apple Calendar, Outlook, etc.). */
export function buildIcs(a: FullAppointment, b: Business): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc2 = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Turnos Online//ES',
    'BEGIN:VEVENT',
    `UID:${a.id}@turnos`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(a.startsAt)}`,
    `DTEND:${fmt(a.endsAt)}`,
    `SUMMARY:${esc2(`${a.service.name} en ${b.name}`)}`,
    `DESCRIPTION:${esc2(`Turno con ${a.professional.name}. Gestionar: ${manageUrl(a)}`)}`,
    `LOCATION:${esc2(b.address ?? b.name)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function layout(b: Business, title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0f0e0d;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#ece7df">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#1a1816;border:1px solid #2c2925;border-radius:16px;overflow:hidden">
<tr><td style="padding:28px 32px;border-bottom:3px solid ${esc(b.accentColor)}"><div style="font-size:22px;font-weight:700;letter-spacing:.5px;color:${esc(b.accentColor)}">${esc(b.name)}</div></td></tr>
<tr><td style="padding:32px"><h1 style="margin:0 0 16px;font-size:22px;color:#fff">${esc(title)}</h1>${body}</td></tr>
<tr><td style="padding:20px 32px;background:#141210;font-size:12px;color:#8d867b">${esc(b.address ?? '')}${b.address ? ' · ' : ''}${esc(b.cancellationPolicy)}</td></tr>
</table></td></tr></table></body></html>`;
}

function detailsTable(a: FullAppointment, b: Business): string {
  const rows: [string, string][] = [
    ['Servicio', a.service.name],
    [b.professionalLabel, a.professional.name],
    ['Día', formatLocal(a.startsAt, b.timezone, "cccc d 'de' LLLL")],
    ['Hora', `${formatLocal(a.startsAt, b.timezone, 'HH:mm')} hs`],
    ['Precio', `$${a.price.toLocaleString('es-AR')}`],
  ];
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 24px">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;color:#8d867b;font-size:14px;border-bottom:1px solid #2c2925">${esc(k)}</td><td align="right" style="padding:8px 0;font-size:14px;color:#fff;border-bottom:1px solid #2c2925">${esc(v)}</td></tr>`,
    )
    .join('')}</table>`;
}

const button = (href: string, label: string, color: string) =>
  `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 20px;border-radius:10px;background:${esc(color)};color:#111;font-weight:700;text-decoration:none;font-size:14px">${esc(label)}</a>`;

export function confirmationEmail(a: FullAppointment, b: Business) {
  const html = layout(
    b,
    `¡Listo, ${a.customer.name.split(' ')[0]}! Tu turno está confirmado`,
    `<p style="margin:0;color:#c9c2b6;font-size:15px;line-height:1.5">Te esperamos en ${esc(b.name)}. Estos son los datos de tu reserva:</p>
${detailsTable(a, b)}
${button(googleCalendarUrl(a, b), 'Agregar a Google Calendar', b.accentColor)}
${button(manageUrl(a), 'Cancelar o reprogramar', '#ece7df')}`,
  );
  return { subject: `Turno confirmado · ${a.service.name} · ${formatLocal(a.startsAt, b.timezone, "ccc d/LL HH:mm")} hs`, html };
}

export function cancellationEmail(a: FullAppointment, b: Business) {
  const html = layout(
    b,
    'Tu turno fue cancelado',
    `<p style="margin:0;color:#c9c2b6;font-size:15px;line-height:1.5">Cancelamos este turno. Cuando quieras, podés reservar uno nuevo.</p>${detailsTable(a, b)}${button(config.webUrl, 'Reservar de nuevo', b.accentColor)}`,
  );
  return { subject: `Turno cancelado · ${a.service.name}`, html };
}

export function rescheduleEmail(a: FullAppointment, b: Business) {
  const html = layout(
    b,
    'Tu turno fue reprogramado',
    `<p style="margin:0;color:#c9c2b6;font-size:15px;line-height:1.5">Estos son los nuevos datos de tu turno:</p>${detailsTable(a, b)}${button(googleCalendarUrl(a, b), 'Agregar a Google Calendar', b.accentColor)}${button(manageUrl(a), 'Gestionar turno', '#ece7df')}`,
  );
  return { subject: `Turno reprogramado · ${a.service.name} · ${formatLocal(a.startsAt, b.timezone, "ccc d/LL HH:mm")} hs`, html };
}

let transporter: nodemailer.Transporter | null = null;
const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
};

/**
 * En modo demo (o sin SMTP) el email NO se envía: se guarda en la bandeja de salida y se muestra en pantalla.
 * Así nadie recibe correos de una demo pública.
 */
export async function sendEmail(to: string | null | undefined, mail: { subject: string; html: string }): Promise<EmailLog | null> {
  if (!to) return null;
  const canSend = !config.demoMode && Boolean(config.smtp.host);
  let sent = false;
  if (canSend) {
    try {
      await getTransporter().sendMail({ from: config.smtp.from, to, subject: mail.subject, html: mail.html });
      sent = true;
    } catch (e) {
      console.error('No se pudo enviar el email:', e);
    }
  }
  return prisma.emailLog.create({ data: { to, subject: mail.subject, html: mail.html, sent } });
}
