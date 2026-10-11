import { prisma } from '../lib/prisma';
import { resetDemoData } from './demo';

resetDemoData(prisma)
  .then((r) => console.log(`Seed listo: ${r.appointments} turnos, ${r.customers} clientes.`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
