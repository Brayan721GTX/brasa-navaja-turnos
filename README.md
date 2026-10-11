# Brasa & Navaja · Sistema de turnos online

Sistema completo de **reserva de turnos online** para comercios y profesionales, mostrado con una barbería ficticia de 3 barberos. Pensado para adaptarse en minutos a otros rubros (peluquería, consultorio, estética, gimnasio): rubro, textos, servicios, equipo y colores se configuran desde el panel.

> **Demo de portfolio:** los turnos no son reales y los datos se reinician solos todas las noches.

| | |
|---|---|
| 🌐 **Demo (cliente)** | https://brasa-navaja-turnos.netlify.app |
| 🔐 **Panel de administración** | https://brasa-navaja-turnos.netlify.app/login |
| 📘 **API documentada (Swagger)** | https://brasa-navaja-turnos.onrender.com/api/docs |

> El backend gratuito se duerme tras 15 minutos sin uso: la primera visita puede tardar cerca de un minuto en despertar (la interfaz muestra un aviso amable mientras tanto).

### Usuarios de prueba (también aparecen en la pantalla de login)

| Rol | Email | Contraseña |
|---|---|---|
| Administrador (ve todo) | `admin@brasaynavaja.demo` | `Demo1234!` |
| Profesional · Teo Ledesma (solo su agenda) | `teo@brasaynavaja.demo` | `Demo1234!` |
| Profesional · Lucas Ferrero (turno cortado + bloqueos) | `lucas@brasaynavaja.demo` | `Demo1234!` |

Las cuentas demo no se pueden borrar ni cambiar su contraseña. Los emails **no se envían a nadie**: se muestran en pantalla (y en el panel, en *Bandeja de emails*).

## Capturas

| Reserva en el celular | Elegir horario | Confirmación |
|:---:|:---:|:---:|
| ![Servicios](docs/screenshots/02-reserva-servicios-movil.png) | ![Horarios](docs/screenshots/03-reserva-horarios-movil.png) | ![Confirmación](docs/screenshots/04-confirmacion-movil.png) |

![Dashboard](docs/screenshots/07-dashboard.png)
![Agenda](docs/screenshots/08-agenda-dia.png)

| Equipo y horarios | Configuración por rubro | Modo claro |
|:---:|:---:|:---:|
| ![Equipo](docs/screenshots/09-equipo-y-horarios.png) | ![Configuración](docs/screenshots/10-configuracion-por-rubro.png) | ![Claro](docs/screenshots/05-reserva-modo-claro-movil.png) |

## Qué hace

**Para el cliente** (mobile first, sin crear cuenta)
- Reserva en 4 pasos con barra de progreso: servicio → profesional (o *"el primero disponible"*) → día y hora → datos.
- Solo muestra horarios **realmente libres**: según la duración del servicio, los horarios de cada profesional (incluye turno cortado), feriados, bloqueos y aviso mínimo.
- **Sin turnos duplicados**, aunque dos personas reserven al mismo milisegundo.
- Confirmación con animación, botón **Agregar a Google Calendar**, archivo `.ics` y botón de **WhatsApp** con mensaje armado.
- Link único para **ver, cancelar o reprogramar** el turno, respetando la política de cancelación configurable.

**Para el negocio** (admin y cada profesional, con su propia agenda)
- Agenda visual por **día y semana** con **arrastrar y soltar** para mover turnos; muestra horarios laborales, bloqueos y feriados.
- Carga manual de turnos (los que llaman por teléfono).
- Gestión de servicios, equipo, horarios semanales, feriados y bloqueos (vacaciones, almuerzo).
- Ficha de clientes con historial y notas.
- Dashboard: turnos de hoy y de la semana, ocupación por profesional, servicios más pedidos, ingresos estimados y tasa de cancelación.
- Configuración del negocio: nombre, logo, colores (vista en vivo), rubro, textos, etiquetas y políticas, con **plantillas por rubro**.

## Stack y arquitectura

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite + TypeScript, React Router, TanStack Query, Recharts. CSS propio con variables (sin plantillas) |
| Backend | Node.js + TypeScript + Express, API REST versionada `/api/v1`, OpenAPI/Swagger |
| Base de datos | PostgreSQL (Neon) con Prisma |
| Auth | JWT de acceso (1 h) + refresh token rotativo (30 días) guardado con hash |
| Validación | Zod en todos los endpoints |
| Tests | Vitest + Postgres real descartable |
| Deploy | Render (API) · Netlify (web) · Neon (base) · GitHub Actions (reset nocturno) |

```mermaid
flowchart LR
  C[Cliente / Admin\nReact + Vite] -- HTTPS /api/v1 --> A[API Express\nRender free]
  A -- Prisma --> N[(PostgreSQL\nNeon free)]
  G[GitHub Actions\ncron 03:00 ART] -- POST /internal/demo-reset --> A
  A -- modo demo --> E[Bandeja de emails\nen pantalla]
```

### Decisiones técnicas que importan

- **Turnos duplicados imposibles a nivel base de datos.** Además de calcular los horarios libres, la tabla `Appointment` tiene una restricción de exclusión de PostgreSQL (`EXCLUDE USING gist` sobre profesional + rango horario). Si dos reservas coinciden, la segunda recibe `409 SLOT_TAKEN`; con *"el primero disponible"* se prueba con el siguiente profesional libre. Está testeado con 10 reservas simultáneas (`api/tests/booking.test.ts`).
- **Zona horaria de Argentina.** Todo se guarda en UTC (`timestamptz`) y se calcula/muestra en `America/Argentina/Buenos_Aires` con Luxon. El motor de horarios (`api/src/services/slots.ts`) es una función pura y está cubierto por tests, incluyendo bordes de día y de franjas.
- **Una API pensada para otros clientes.** Versionada, documentada con OpenAPI (`/api/openapi.json`), con tokens de acceso/refresh: lista para consumirse desde una app Android.
- **Modo demo seguro.** Emails guardados en lugar de enviarse, cuentas demo protegidas, reset nocturno con secreto y respaldo al arrancar el servidor.
- **Marca por variables CSS.** Cambiar acento/fondo desde el panel cambia todo el sistema, en modo oscuro y claro.

## Correrlo en local

Requisitos: Node 20+ (no hace falta Docker ni instalar Postgres).

```bash
npm install

# 1) Base de datos local (Postgres embebido, deja corriendo en esta terminal)
npm run db:local -w api

# 2) En otra terminal: variables de entorno, datos de ejemplo y API
cp api/.env.example api/.env        # y usar las URLs de la base local (ver abajo)
npm run db:seed -w api
npm run dev:api

# 3) En otra terminal: frontend
npm run dev:web                     # http://localhost:5173
```

Para la base local, en `api/.env`:

```
DATABASE_URL="postgresql://dev:dev@localhost:54330/turnos_dev"
DIRECT_URL="postgresql://dev:dev@localhost:54330/turnos_dev"
DEMO_MODE=true
```

Para usar Neon, pegá en `DATABASE_URL` la cadena *pooled* (agregando `&pgbouncer=true`) y en `DIRECT_URL` la cadena directa.

### Tests

```bash
npm test          # levanta un Postgres descartable, aplica las migraciones y corre todo
```

### Capturas

```bash
npm run screenshots   # con web y API corriendo; usa el Edge instalado
```

## Deploy (todo en planes gratuitos)

1. **Neon**: crear un proyecto y copiar la cadena *pooled* y la directa. *(No se usa Render Postgres: el plan gratis se borra a los 30 días.)*
2. **Render** (Web Service gratis, `rootDir: api`): ver [`render.yaml`](render.yaml). Build `npm install --include=dev && npm run build`, start `npm run start:render` (aplica migraciones y arranca). Variables: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `CRON_SECRET`, `DEMO_MODE=true`, `CORS_ORIGINS`, `WEB_URL`, `NODE_VERSION=22`. La primera vez carga los datos de ejemplo sola.
3. **Netlify**: `base=web`, `build=npm run build`, `publish=dist` ([`netlify.toml`](netlify.toml)). Variables: `VITE_API_URL=https://TU-API.onrender.com/api/v1` y `VITE_SITE_URL=https://TU-SITIO.netlify.app` (para la vista previa al compartir por WhatsApp).
4. **GitHub Actions**: en *Settings → Secrets* cargar `API_URL` (con `/api/v1`) y `CRON_SECRET`. El workflow [`demo-reset.yml`](.github/workflows/demo-reset.yml) reinicia la demo todas las noches (03:00 hora de Argentina).

## Estructura

```
api/            Backend (Express + Prisma)
  prisma/       Esquema y migraciones (incluye la restricción anti-duplicados)
  src/services/ slots.ts (motor de horarios), availability, booking, email, stats…
  src/routes/   public, auth, admin
  tests/        Unitarios del motor de horarios + integración con Postgres real
web/            Frontend (React + Vite)
  src/pages/    Reserva, confirmación, gestión del turno, login y panel
docs/           Propuesta visual, capturas y guion del video
```

## Adaptarlo a otro rubro

Desde **Configuración → Adaptá el sistema a tu rubro** se aplica una plantilla (Barbería, Peluquería, Consultorio, Estética, Gimnasio) que cambia colores, textos y cómo se llama al profesional (*barbero, estilista, entrenador…*). Después se cargan los servicios y el equipo desde sus secciones. No hace falta tocar código.

---

Fotos: [Unsplash](https://unsplash.com) (licencia Unsplash, uso libre, sin marcas reales). Hecho como pieza de portfolio.
