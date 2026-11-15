/**
 * Datos de ejemplo 100% ficticios para desarrollo y demo.
 * Uso: npm run seed   (borra y recrea los datos de la base local)
 */
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { TIPOS_EXAMEN, TIPO_EXAMEN_LABEL, type TipoExamen } from '@naspeclinic/shared';
import type { DB } from './db';
import { empresas, sedes, usuarios, pacientes, examenes, citas, dotaciones } from './db/schema';
import { cifrar, hashRut } from './lib/cifrado';

/** Contraseña de todos los usuarios de demo (solo desarrollo). */
export const PASSWORD_DEMO = 'Demo-Naspeclinic-2026';

// PRNG determinista para que la demo sea siempre igual
function prng(semilla: number) {
  let s = semilla;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

function dv(cuerpo: number) {
  let suma = 0, f = 2;
  for (const d of String(cuerpo).split('').reverse()) { suma += Number(d) * f; f = f === 7 ? 2 : f + 1; }
  const r = 11 - (suma % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}
const rut = (cuerpo: number) => `${cuerpo}-${dv(cuerpo)}`;

const NOMBRES = ['Juan', 'Pedro', 'Camila', 'Valentina', 'Diego', 'Matías', 'Francisca', 'José', 'Carolina', 'Felipe', 'Constanza', 'Rodrigo', 'Javiera', 'Cristián', 'Daniela', 'Sebastián'];
const APELLIDOS = ['González', 'Muñoz', 'Rojas', 'Díaz', 'Pérez', 'Soto', 'Contreras', 'Silva', 'Martínez', 'Sepúlveda', 'Morales', 'Rodríguez', 'López', 'Fuentes', 'Araya', 'Castillo'];
const CARGOS = ['Operador de equipo pesado', 'Mecánico', 'Geólogo', 'Supervisor de turno', 'Eléctrico', 'Prevencionista', 'Perforista'];

export async function sembrar(db: DB, opts: { mesesAtras?: number; hoy?: Date } = {}) {
  const r = prng(42);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const hoy = opts.hoy ?? new Date();
  const meses = opts.mesesAtras ?? 6;

  await db.execute(sql`truncate auditoria, archivos, citas, examenes, pacientes, dotaciones, usuarios, empresas, sedes restart identity cascade`);

  const sedesC = await db.insert(sedes).values([{ nombre: 'Santiago' }, { nombre: 'Antofagasta' }, { nombre: 'Sur' }]).returning();
  const emps = await db.insert(empresas).values([
    { nombre: 'Minera Cordillera Norte (demo)', rut: rut(76111222), emailGerente: 'gerente.cordillera@example.com' },
    { nombre: 'Minera Desierto Alto (demo)', rut: rut(76333444), emailGerente: 'gerente.desierto@example.com' },
    { nombre: 'Cobre del Sur (demo)', rut: rut(76555666), emailGerente: 'gerente.cobresur@example.com' },
  ]).returning();

  const hash = await bcrypt.hash(PASSWORD_DEMO, 10);
  await db.insert(usuarios).values([
    { email: 'admin@example.com', nombre: 'Admin Naspeclinic', rol: 'admin', passwordHash: hash },
    { email: 'operador@example.com', nombre: 'Operador Antofagasta', rol: 'operador', passwordHash: hash },
    ...emps.map((e, i) => ({ email: `gerente${i + 1}@example.com`, nombre: `Gerente ${e.nombre}`, rol: 'gerente' as const, empresaId: e.id, passwordHash: hash })),
  ]);

  // Dotación declarada por empresa y mes
  const tamanos = [80, 60, 45];
  const dots: (typeof dotaciones.$inferInsert)[] = [];
  for (let m = meses - 1; m >= 0; m--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - m, 1);
    const periodo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    emps.forEach((e, i) => dots.push({ empresaId: e.id, periodo, trabajadores: tamanos[i] + Math.floor(r() * 6) }));
  }
  await db.insert(dotaciones).values(dots);

  // Pacientes (~85% de la dotación de cada empresa)
  const pacs: { id: number; empresaId: number }[] = [];
  let cuerpo = 12_000_000;
  for (const [i, e] of emps.entries()) {
    const valores = Array.from({ length: Math.round(tamanos[i] * 0.85) }, () => {
      cuerpo += 1 + Math.floor(r() * 50_000);
      const nombre = `${pick(NOMBRES)} ${pick(APELLIDOS)} ${pick(APELLIDOS)}`;
      return {
        rutHash: hashRut(rut(cuerpo)), rutCifrado: cifrar(rut(cuerpo)), nombre,
        email: `${nombre.split(' ')[0].toLowerCase()}.${cuerpo}@example.com`,
        telefono: `+569${String(Math.floor(r() * 1e8)).padStart(8, '0')}`,
        cargo: pick(CARGOS), empresaId: e.id,
      };
    });
    pacs.push(...(await db.insert(pacientes).values(valores).returning({ id: pacientes.id, empresaId: pacientes.empresaId })));
  }

  // Exámenes y citas repartidos en los últimos meses
  const exs: (typeof examenes.$inferInsert)[] = [];
  const cts: (typeof citas.$inferInsert)[] = [];
  const sedeDeEmpresa = [sedesC[1].id, sedesC[1].id, sedesC[2].id];
  for (const p of pacs) {
    const sedeId = r() < 0.8 ? sedeDeEmpresa[emps.findIndex((e) => e.id === p.empresaId)] : sedesC[0].id;
    const n = 1 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const dia = new Date(hoy.getFullYear(), hoy.getMonth() - Math.floor(r() * meses), 1 + Math.floor(r() * 27), 8 + Math.floor(r() * 9), r() < 0.5 ? 0 : 30);
      if (dia > hoy) dia.setMonth(dia.getMonth() - 1);
      const tipo: TipoExamen = pick(TIPOS_EXAMEN);
      const azar = r();
      const estadoCita = azar < 0.08 ? 'ausente' : azar < 0.13 ? 'cancelada' : 'confirmada';
      cts.push({ pacienteId: p.id, empresaId: p.empresaId, sedeId, tipoExamen: tipo, fechaHora: dia, estado: estadoCita });
      if (estadoCita !== 'confirmada') continue;
      const h = r();
      const nivel = h < 0.05 ? 'critico' : h < 0.2 ? 'moderado' : 'ninguno';
      exs.push({
        pacienteId: p.id, empresaId: p.empresaId, sedeId, tipo, fecha: dia.toISOString().slice(0, 10),
        estado: r() < 0.92 ? 'completado' : 'en_proceso',
        resultado: nivel === 'critico' ? 'no_apto' : nivel === 'moderado' ? 'apto_con_restricciones' : 'apto',
        nivelHallazgo: nivel,
        observacionesCifradas: nivel !== 'ninguno' ? cifrar(`Hallazgo ${nivel === 'critico' ? 'crítico' : 'moderado'} en evaluación de ${TIPO_EXAMEN_LABEL[tipo].toLowerCase()}. Derivar a especialista.`) : null,
      });
    }
  }
  // Agenda futura: próximos 14 días
  for (let d = 1; d <= 14; d++) {
    for (let k = 0; k < 6; k++) {
      const p = pick(pacs);
      cts.push({
        pacienteId: p.id, empresaId: p.empresaId, sedeId: pick(sedesC).id, tipoExamen: pick(TIPOS_EXAMEN),
        fechaHora: new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + d, 8 + k, 0), estado: r() < 0.6 ? 'confirmada' : 'pendiente',
      });
    }
  }
  for (let i = 0; i < exs.length; i += 200) await db.insert(examenes).values(exs.slice(i, i + 200));
  for (let i = 0; i < cts.length; i += 200) await db.insert(citas).values(cts.slice(i, i + 200));

  return { empresas: emps, sedes: sedesC, pacientes: pacs.length, examenes: exs.length, citas: cts.length };
}

// Ejecución directa: npm run seed
if (process.argv[1]?.replace(/\\/g, '/').endsWith('src/seed.ts')) {
  const { crearDb } = await import('./db');
  const res = await sembrar(await crearDb());
  console.log(`Listo: ${res.empresas.length} empresas, ${res.pacientes} pacientes, ${res.examenes} exámenes, ${res.citas} citas.`);
  console.log(`Usuarios: admin@example.com, operador@example.com, gerente1..3@example.com — contraseña: ${PASSWORD_DEMO}`);
  process.exit(0);
}
