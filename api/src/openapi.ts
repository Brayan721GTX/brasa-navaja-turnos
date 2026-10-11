/**
 * Especificación OpenAPI 3.0 de la API v1. Se sirve en /api/openapi.json y se muestra con Swagger UI en /api/docs.
 * Pensada para generar clientes (por ejemplo, una app Android con Retrofit/OpenAPI Generator).
 */

type Json = Record<string, unknown>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const jsonBody = (schema: Json, required = true) => ({ required, content: { 'application/json': { schema } } });
const ok = (description: string, schema?: Json) => ({
  description,
  ...(schema ? { content: { 'application/json': { schema } } } : {}),
});
const errors = {
  '400': ok('Datos inválidos', ref('Error')),
  '401': ok('No autenticado', ref('Error')),
  '403': ok('Sin permisos', ref('Error')),
  '404': ok('No encontrado', ref('Error')),
  '409': ok('Conflicto (por ejemplo, horario ya reservado)', ref('Error')),
};
const secured = [{ bearerAuth: [] }];
const q = (name: string, description: string, required = false, schema: Json = { type: 'string' }) => ({ name, in: 'query', required, description, schema });
const p = (name: string, description = 'Identificador') => ({ name, in: 'path', required: true, description, schema: { type: 'string' } });

const op = (tag: string, summary: string, extra: Json = {}, auth = false) => ({
  tags: [tag],
  summary,
  ...(auth ? { security: secured } : {}),
  responses: { '200': ok('OK'), ...errors },
  ...extra,
});

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Turnos Online API',
    version: '1.0.0',
    description:
      'API REST para un sistema de turnos online multi-rubro (demo: barbería Brasa & Navaja).\n\n' +
      '- **Público**: catálogo, disponibilidad real y reservas sin cuenta.\n' +
      '- **Admin**: agenda, servicios, profesionales, clientes, dashboard y configuración (JWT).\n' +
      '- Todas las fechas viajan en **ISO 8601 UTC**; el negocio opera en `America/Argentina/Buenos_Aires`.\n' +
      '- Autenticación: `POST /auth/login` devuelve `accessToken` (1 h) y `refreshToken` (30 días, rotativo).',
  },
  servers: [{ url: '/api/v1', description: 'Versión 1' }],
  tags: [
    { name: 'Público', description: 'Sin autenticación' },
    { name: 'Auth', description: 'Login y sesión' },
    { name: 'Turnos', description: 'Agenda (admin / profesional)' },
    { name: 'Catálogo', description: 'Servicios y profesionales' },
    { name: 'Calendario', description: 'Horarios, feriados y bloqueos' },
    { name: 'Clientes', description: 'Fichas e historial' },
    { name: 'Negocio', description: 'Configuración y dashboard' },
  ],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: { code: { type: 'string', example: 'SLOT_TAKEN' }, message: { type: 'string' }, details: {} },
          },
        },
      },
      Customer: {
        type: 'object',
        required: ['name', 'phone'],
        properties: { name: { type: 'string', example: 'Martín Gómez' }, phone: { type: 'string', example: '+54 9 11 5555-0000' }, email: { type: 'string', format: 'email' } },
      },
      Slot: { type: 'object', properties: { startsAt: { type: 'string', format: 'date-time' }, professionalId: { type: 'string' } } },
      PublicAppointment: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          status: { type: 'string', enum: ['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'] },
          startsAt: { type: 'string', format: 'date-time' },
          endsAt: { type: 'string', format: 'date-time' },
          price: { type: 'integer', description: 'Pesos argentinos' },
          service: { type: 'object' },
          professional: { type: 'object' },
          customer: { type: 'object' },
          canManage: { type: 'boolean' },
          manageReason: { type: 'string', nullable: true },
          calendarUrl: { type: 'string', format: 'uri' },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
          expiresIn: { type: 'integer' },
          user: { type: 'object', properties: { id: { type: 'string' }, email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string', enum: ['ADMIN', 'PROFESSIONAL'] }, professionalId: { type: 'string', nullable: true }, isDemo: { type: 'boolean' } } },
        },
      },
    },
  },
  paths: {
    '/public/health': { get: op('Público', 'Estado del servicio (sirve para despertar el servidor)') },
    '/public/business': { get: op('Público', 'Datos y marca del negocio (nombre, colores, textos, políticas)') },
    '/public/services': { get: op('Público', 'Servicios activos con los profesionales que los realizan') },
    '/public/professionals': { get: op('Público', 'Profesionales activos y servicios que ofrecen') },
    '/public/availability/slots': {
      get: op('Público', 'Horarios libres de un día', {
        description:
          'Tiene en cuenta duración del servicio, horarios del profesional, turnos existentes, feriados, bloqueos y aviso mínimo. ' +
          'Sin `professionalId` devuelve la unión de todos ("el primero disponible") con el profesional sugerido en cada horario.',
        parameters: [q('serviceId', 'ID del servicio', true), q('professionalId', 'ID del profesional (opcional)'), q('date', 'Día local YYYY-MM-DD', true)],
        responses: { '200': ok('Horarios', { type: 'object', properties: { date: { type: 'string' }, slots: { type: 'array', items: ref('Slot') } } }), ...errors },
      }),
    },
    '/public/availability/days': {
      get: op('Público', 'Qué días del mes tienen disponibilidad', {
        parameters: [q('serviceId', 'ID del servicio', true), q('professionalId', 'ID del profesional (opcional)'), q('month', 'Mes YYYY-MM', true)],
      }),
    },
    '/public/appointments': {
      post: op('Público', 'Reservar un turno (sin cuenta)', {
        description:
          'Garantía anti-duplicados: la base de datos tiene una restricción de exclusión por profesional y rango horario, ' +
          'así que si dos personas reservan a la vez, la segunda recibe `409 SLOT_TAKEN`. En modo demo la respuesta incluye `emailPreview`.',
        requestBody: jsonBody({
          type: 'object',
          required: ['serviceId', 'startsAt', 'customer'],
          properties: { serviceId: { type: 'string' }, professionalId: { type: 'string', nullable: true }, startsAt: { type: 'string', format: 'date-time' }, customer: ref('Customer'), notes: { type: 'string' } },
        }),
        responses: { '201': ok('Turno creado', { type: 'object', properties: { appointment: ref('PublicAppointment'), emailPreview: { type: 'object', nullable: true } } }), ...errors },
      }),
    },
    '/public/appointments/{token}': { get: op('Público', 'Ver un turno por su link secreto', { parameters: [p('token', 'Token del link')] }) },
    '/public/appointments/{token}/calendar.ics': { get: op('Público', 'Descargar el turno como archivo .ics', { parameters: [p('token')] }) },
    '/public/appointments/{token}/cancel': {
      post: op('Público', 'Cancelar el turno (respeta la política de cancelación)', { parameters: [p('token')] }),
    },
    '/public/appointments/{token}/reschedule': {
      post: op('Público', 'Reprogramar el turno a otro horario libre', {
        parameters: [p('token')],
        requestBody: jsonBody({ type: 'object', required: ['startsAt'], properties: { startsAt: { type: 'string', format: 'date-time' }, professionalId: { type: 'string' } } }),
      }),
    },

    '/auth/login': {
      post: op('Auth', 'Iniciar sesión (admin o profesional)', {
        requestBody: jsonBody({ type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } }),
        responses: { '200': ok('Sesión', ref('LoginResponse')), ...errors },
      }),
    },
    '/auth/refresh': { post: op('Auth', 'Renovar sesión (el refresh token se usa una sola vez)', { requestBody: jsonBody({ type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } }) }) },
    '/auth/logout': { post: op('Auth', 'Cerrar sesión', { requestBody: jsonBody({ type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } }) }) },
    '/auth/me': { get: op('Auth', 'Usuario actual', {}, true) },
    '/auth/change-password': { post: op('Auth', 'Cambiar contraseña (no disponible para cuentas demo)', { requestBody: jsonBody({ type: 'object', properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string' } } }) }, true) },

    '/admin/dashboard': { get: op('Negocio', 'Métricas: turnos de hoy/semana, ocupación, servicios top, ingresos y cancelaciones', {}, true) },
    '/admin/appointments': {
      get: op('Turnos', 'Listar turnos en un rango (los profesionales solo ven los suyos)', { parameters: [q('from', 'Desde (ISO)', true), q('to', 'Hasta (ISO)', true), q('professionalId', 'Filtrar por profesional'), q('includeCancelled', 'true para incluir cancelados')] }, true),
      post: op('Turnos', 'Cargar un turno a mano (llamado telefónico)', {}, true),
    },
    '/admin/appointments/{id}': { patch: op('Turnos', 'Mover (drag & drop), cambiar estado o notas', { parameters: [p('id')], requestBody: jsonBody({ type: 'object', properties: { startsAt: { type: 'string', format: 'date-time' }, professionalId: { type: 'string' }, status: { type: 'string', enum: ['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'] }, notes: { type: 'string' } } }) }, true) },

    '/admin/services': { get: op('Catálogo', 'Listar servicios', {}, true), post: op('Catálogo', 'Crear servicio (admin)', {}, true) },
    '/admin/services/{id}': { put: op('Catálogo', 'Editar servicio (admin)', { parameters: [p('id')] }, true), delete: op('Catálogo', 'Borrar o desactivar servicio (admin)', { parameters: [p('id')] }, true) },
    '/admin/professionals': { get: op('Catálogo', 'Listar profesionales con horarios', {}, true), post: op('Catálogo', 'Crear profesional con acceso opcional (admin)', {}, true) },
    '/admin/professionals/{id}': { put: op('Catálogo', 'Editar profesional (admin)', { parameters: [p('id')] }, true), delete: op('Catálogo', 'Borrar o desactivar profesional (admin)', { parameters: [p('id')] }, true) },
    '/admin/professionals/{id}/hours': { put: op('Calendario', 'Reemplazar los horarios semanales de un profesional (admin)', { parameters: [p('id')] }, true) },
    '/admin/holidays': { get: op('Calendario', 'Listar feriados', {}, true), post: op('Calendario', 'Agregar feriado (admin)', {}, true) },
    '/admin/holidays/{id}': { delete: op('Calendario', 'Quitar feriado (admin)', { parameters: [p('id')] }, true) },
    '/admin/blocks': { get: op('Calendario', 'Listar bloqueos (vacaciones, almuerzo)', {}, true), post: op('Calendario', 'Crear bloqueo', {}, true) },
    '/admin/blocks/{id}': { delete: op('Calendario', 'Quitar bloqueo', { parameters: [p('id')] }, true) },
    '/admin/customers': { get: op('Clientes', 'Buscar clientes', { parameters: [q('q', 'Nombre, teléfono o email')] }, true) },
    '/admin/customers/{id}': {
      get: op('Clientes', 'Ficha del cliente con historial de turnos', { parameters: [p('id')] }, true),
      patch: op('Clientes', 'Editar datos o notas del cliente', { parameters: [p('id')] }, true),
    },
    '/admin/business': { get: op('Negocio', 'Configuración completa (admin)', {}, true), put: op('Negocio', 'Actualizar marca, rubro, textos, colores y políticas (admin)', {}, true) },
    '/admin/emails': { get: op('Negocio', 'Bandeja de emails de la demo (admin)', {}, true) },
    '/internal/demo-reset': { post: op('Negocio', 'Resetea los datos de demo (requiere header X-Cron-Secret; solo en modo demo)') },
  },
} as const;
