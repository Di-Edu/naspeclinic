/**
 * Datos de ejemplo 100% ficticios para desarrollo y demo.
 * Uso: npm run seed   (borra y recrea los datos de la base local)
 */
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { TIPOS_EXAMEN, examenEnTexto, type Aptitud, type NivelHallazgo, type TipoExamen } from '@naspeclinic/shared';
import type { DB } from './db';
import {
  empresas, sedes, usuarios, pacientes, examenes, citas, dotaciones,
  protocolos, protocoloExamenes, cargos, cargoProtocolos, evaluaciones, seguimientos,
} from './db/schema';
import { cifrar, hashRut } from './lib/cifrado';
import { sumarMeses } from './services/aptitud';
import { sumarDias, PLAZO_DIAS } from './services/seguimientos';

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
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const NOMBRES = ['Juan', 'Pedro', 'Camila', 'Valentina', 'Diego', 'Matías', 'Francisca', 'José', 'Carolina', 'Felipe', 'Constanza', 'Rodrigo', 'Javiera', 'Cristián', 'Daniela', 'Sebastián'];
const APELLIDOS = ['González', 'Muñoz', 'Rojas', 'Díaz', 'Pérez', 'Soto', 'Contreras', 'Silva', 'Martínez', 'Sepúlveda', 'Morales', 'Rodríguez', 'López', 'Fuentes', 'Araya', 'Castillo'];

/** Protocolos de ejemplo. Las vigencias son referenciales y las configura la clínica. */
const PROTOCOLOS: { nombre: string; descripcion: string; vigenciaMeses: number; examenes: TipoExamen[] }[] = [
  { nombre: 'Gran altura geográfica', descripcion: 'Trabajo sobre 3.000 msnm', vigenciaMeses: 12, examenes: ['cardiologia', 'broncopulmonar', 'vitamina_c'] },
  { nombre: 'Exposición a sílice', descripcion: 'Vigilancia de polvo con sílice', vigenciaMeses: 24, examenes: ['broncopulmonar'] },
  { nombre: 'Salud bucal en faena', descripcion: 'Control odontológico para turnos prolongados', vigenciaMeses: 12, examenes: ['odontologia'] },
  { nombre: 'Susceptibilidad genética', descripcion: 'Marcadores genéticos de susceptibilidad', vigenciaMeses: 36, examenes: ['geneticos'] },
];

/** Cargo → protocolos que exige. */
const CARGOS: Record<string, string[]> = {
  'Operador de equipo pesado': ['Gran altura geográfica', 'Exposición a sílice'],
  'Mecánico': ['Gran altura geográfica', 'Salud bucal en faena'],
  'Geólogo': ['Gran altura geográfica', 'Exposición a sílice', 'Susceptibilidad genética'],
  'Supervisor de turno': ['Gran altura geográfica'],
  'Eléctrico': ['Gran altura geográfica', 'Salud bucal en faena'],
  'Prevencionista': ['Gran altura geográfica'],
  'Perforista': ['Gran altura geográfica', 'Exposición a sílice', 'Susceptibilidad genética'],
};

const RESTRICCIONES = [
  'Evitar trabajo en altura física sobre 1,8 m',
  'Uso obligatorio de protección respiratoria',
  'No conducir vehículos pesados hasta nuevo control',
  'Turnos de máximo 8 horas en altura geográfica',
];
const CIERRES = ['Evaluado por especialista, sin contraindicación laboral', 'Recontrol con valores normales', 'Tratamiento completado, alta'];
const GRAVEDAD: Record<Aptitud, number> = { apto: 0, apto_con_restricciones: 1, no_apto: 2 };

export async function sembrar(db: DB, opts: { mesesAtras?: number; hoy?: Date } = {}) {
  const r = prng(42);
  const rCitas = prng(2026);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const hoy = opts.hoy ?? new Date();
  const hoyIso = iso(hoy);
  const meses = opts.mesesAtras ?? 12;

  await db.execute(sql`truncate auditoria, tokens_recuperacion, seguimientos, archivos, citas, examenes, evaluaciones,
    cargo_protocolos, cargos, protocolo_examenes, protocolos, pacientes, dotaciones, usuarios, empresas, sedes restart identity cascade`);

  const sedesC = await db.insert(sedes).values([{ nombre: 'Santiago' }, { nombre: 'Antofagasta' }, { nombre: 'Sur' }]).returning();
  const emps = await db.insert(empresas).values([
    { nombre: 'Minera Cordillera Norte (demo)', rut: rut(76111222), emailGerente: 'gerente.cordillera@example.com' },
    { nombre: 'Minera Desierto Alto (demo)', rut: rut(76333444), emailGerente: 'gerente.desierto@example.com' },
    { nombre: 'Cobre del Sur (demo)', rut: rut(76555666), emailGerente: 'gerente.cobresur@example.com' },
  ]).returning();

  const hash = await bcrypt.hash(PASSWORD_DEMO, 10);
  const [admin] = await db.insert(usuarios).values([
    { email: 'admin@example.com', nombre: 'Admin Naspeclinic', rol: 'admin', passwordHash: hash },
    { email: 'operador@example.com', nombre: 'Operador Antofagasta', rol: 'operador', passwordHash: hash },
    ...emps.map((e, i) => ({ email: `gerente${i + 1}@example.com`, nombre: `Gerente ${e.nombre}`, rol: 'gerente' as const, empresaId: e.id, passwordHash: hash })),
  ]).returning();

  // Protocolos y cargos
  const prots = await db.insert(protocolos).values(PROTOCOLOS.map(({ examenes: _e, ...p }) => p)).returning();
  await db.insert(protocoloExamenes).values(PROTOCOLOS.flatMap((p, i) => p.examenes.map((tipo) => ({ protocoloId: prots[i].id, tipo }))));
  const protPorNombre = new Map(prots.map((p, i) => [p.nombre, { ...p, examenes: PROTOCOLOS[i].examenes }]));
  const cargosPorEmpresa = new Map<number, { id: number; nombre: string }[]>();
  for (const e of emps) {
    const cs = await db.insert(cargos).values(Object.keys(CARGOS).map((nombre) => ({ empresaId: e.id, nombre }))).returning();
    await db.insert(cargoProtocolos).values(cs.flatMap((c) => CARGOS[c.nombre].map((n) => ({ cargoId: c.id, protocoloId: protPorNombre.get(n)!.id }))));
    cargosPorEmpresa.set(e.id, cs);
  }

  // Dotación declarada por empresa y mes
  const tamanos = [80, 60, 45];
  const dots: (typeof dotaciones.$inferInsert)[] = [];
  for (let m = meses - 1; m >= 0; m--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - m, 1);
    const periodo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    emps.forEach((e, i) => dots.push({ empresaId: e.id, periodo, trabajadores: tamanos[i] + Math.floor(r() * 6) }));
  }
  await db.insert(dotaciones).values(dots);

  // Trabajadores (~85% de la dotación de cada empresa), cada uno con un cargo
  const pacs: { id: number; empresaId: number; cargo: string | null }[] = [];
  let cuerpo = 12_000_000;
  for (const [i, e] of emps.entries()) {
    const valores = Array.from({ length: Math.round(tamanos[i] * 0.85) }, () => {
      cuerpo += 1 + Math.floor(r() * 50_000);
      const nombre = `${pick(NOMBRES)} ${pick(APELLIDOS)} ${pick(APELLIDOS)}`;
      const cargo = pick(cargosPorEmpresa.get(e.id)!);
      return {
        rutHash: hashRut(rut(cuerpo)), rutCifrado: cifrar(rut(cuerpo)), nombre,
        email: `${nombre.split(' ')[0].toLowerCase()}.${cuerpo}@example.com`,
        telefono: `+569${String(Math.floor(r() * 1e8)).padStart(8, '0')}`,
        cargo: cargo.nombre, cargoId: cargo.id, empresaId: e.id,
      };
    });
    pacs.push(...(await db.insert(pacientes).values(valores).returning({ id: pacientes.id, empresaId: pacientes.empresaId, cargo: pacientes.cargo })));
  }

  // Evaluaciones por protocolo: la última de cada una determina la vigencia de hoy
  const sedeDeEmpresa = [sedesC[1].id, sedesC[1].id, sedesC[2].id];
  type Plan = {
    ev: typeof evaluaciones.$inferInsert;
    exs: (typeof examenes.$inferInsert & { nivelHallazgo: NivelHallazgo })[];
  };
  const planes: Plan[] = [];
  const cts: (typeof citas.$inferInsert)[] = [];
  for (const p of pacs) {
    const sedeId = r() < 0.8 ? sedeDeEmpresa[emps.findIndex((e) => e.id === p.empresaId)] : sedesC[0].id;
    for (const nombreProt of CARGOS[p.cargo!]) {
      if (r() < 0.05) continue; // sin evaluación
      const prot = protPorNombre.get(nombreProt)!;
      // Fecha: repartida en ~110% de la vigencia → ~9% vencidos y ~8% por vencer
      const diasAtras = Math.floor(r() * prot.vigenciaMeses * 30.4 * 1.1);
      const f = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - diasAtras, 8 + Math.floor(r() * 9), r() < 0.5 ? 0 : 30);
      const fecha = iso(f);
      const enCurso = diasAtras < 12 && r() < 0.35;
      const exs = prot.examenes.map((tipo) => {
        const h = r();
        const nivel: NivelHallazgo = h < 0.035 ? 'critico' : h < 0.16 ? 'moderado' : 'ninguno';
        const pendiente = enCurso && r() < 0.6;
        return {
          pacienteId: p.id, empresaId: p.empresaId, sedeId, tipo, fecha,
          estado: pendiente ? 'pendiente' as const : 'completado' as const,
          resultado: pendiente ? null : nivel === 'critico' ? 'no_apto' as const : nivel === 'moderado' ? 'apto_con_restricciones' as const : 'apto' as const,
          nivelHallazgo: pendiente ? 'ninguno' as const : nivel,
          observacionesCifradas: !pendiente && nivel !== 'ninguno'
            ? cifrar(`Hallazgo ${nivel === 'critico' ? 'crítico' : 'moderado'} en evaluación de ${examenEnTexto(tipo)}. Derivar a especialista.`) : null,
          creadoPor: admin.id,
        };
      });
      const aptitud = exs.reduce<Aptitud>((peor, e) => (e.resultado && GRAVEDAD[e.resultado] > GRAVEDAD[peor] ? e.resultado : peor), 'apto');
      const cerrada = !enCurso || exs.every((e) => e.estado === 'completado');
      planes.push({
        ev: {
          pacienteId: p.id, empresaId: p.empresaId, protocoloId: prot.id, sedeId,
          tipo: r() < 0.12 ? 'preocupacional' : 'periodica', fecha,
          estado: cerrada ? 'cerrada' : 'en_curso',
          aptitud: cerrada ? aptitud : null,
          restricciones: cerrada && aptitud !== 'apto' ? pick(RESTRICCIONES) : null,
          vigenteHasta: cerrada && aptitud !== 'no_apto' ? sumarMeses(fecha, prot.vigenciaMeses) : null,
          cerradaPor: cerrada ? admin.id : null, cerradaEn: cerrada ? f : null, creadoPor: admin.id,
        },
        exs,
      });
      // Cita de la evaluación (solo para las de los últimos meses, que alimentan la agenda y el ausentismo)
      if (diasAtras < meses * 30) {
        cts.push({ pacienteId: p.id, empresaId: p.empresaId, sedeId, tipoExamen: prot.examenes[0], fechaHora: f, estado: 'confirmada' });
        // Generador aparte: el principal queda correlacionado con la fecha y sesgaba el ausentismo
        const azar = rCitas();
        if (azar < 0.12) {
          const otra = new Date(f); otra.setDate(otra.getDate() - 7);
          cts.push({ pacienteId: p.id, empresaId: p.empresaId, sedeId, tipoExamen: prot.examenes[0], fechaHora: otra, estado: azar < 0.08 ? 'ausente' : 'cancelada' });
        }
      }
    }
  }

  // Insertar evaluaciones y su batería de exámenes
  const segs: (typeof seguimientos.$inferInsert)[] = [];
  let totalExamenes = 0;
  for (let i = 0; i < planes.length; i += 150) {
    const lote = planes.slice(i, i + 150);
    const evIds = await db.insert(evaluaciones).values(lote.map((x) => x.ev)).returning({ id: evaluaciones.id });
    const exsLote = lote.flatMap((x, j) => x.exs.map((e) => ({ ...e, evaluacionId: evIds[j].id })));
    const exIds = await db.insert(examenes).values(exsLote).returning({ id: examenes.id });
    totalExamenes += exIds.length;
    // Seguimientos: hallazgos (derivación/recontrol) y no aptos temporales
    exsLote.forEach((e, k) => {
      if (e.nivelHallazgo === 'ninguno') return;
      const critico = e.nivelHallazgo === 'critico';
      const compromiso = sumarDias(e.fecha as string, critico ? PLAZO_DIAS.critico : PLAZO_DIAS.moderado);
      // Lo que venció hace más de 2 meses casi siempre ya se resolvió; lo reciente puede estar atrasado
      const atraso = Math.round((Date.parse(hoyIso) - Date.parse(compromiso)) / 86_400_000);
      const cerrado = atraso > 60 ? r() < 0.97 : atraso > 0 ? r() < 0.6 : r() < 0.15;
      segs.push({
        pacienteId: e.pacienteId, empresaId: e.empresaId, examenId: exIds[k].id, evaluacionId: e.evaluacionId,
        tipo: critico ? 'derivacion' : 'recontrol',
        motivoCifrado: cifrar(`Hallazgo ${critico ? 'crítico' : 'moderado'} en ${examenEnTexto(e.tipo as TipoExamen)}`),
        fechaCompromiso: compromiso, estado: cerrado ? 'cerrado' : 'abierto',
        cierreCifrado: cerrado ? cifrar(pick(CIERRES)) : null,
        cerradoPor: cerrado ? admin.id : null, cerradoEn: cerrado ? new Date(`${compromiso}T15:00:00Z`) : null, creadoPor: admin.id,
      });
    });
    lote.forEach((x, j) => {
      if (x.ev.aptitud !== 'no_apto') return;
      const compromiso = sumarDias(x.ev.fecha as string, 30);
      const atraso = Math.round((Date.parse(hoyIso) - Date.parse(compromiso)) / 86_400_000);
      const cerrado = atraso > 60 ? r() < 0.97 : atraso > 0 ? r() < 0.5 : false;
      segs.push({
        pacienteId: x.ev.pacienteId, empresaId: x.ev.empresaId, evaluacionId: evIds[j].id, tipo: 'no_apto_temporal',
        motivoCifrado: cifrar(`No apto en evaluación de protocolo. ${x.ev.restricciones ?? ''}`.trim()),
        fechaCompromiso: compromiso, estado: cerrado ? 'cerrado' : 'abierto',
        cierreCifrado: cerrado ? cifrar('Tratamiento indicado; trabajador citado a nueva evaluación') : null,
        cerradoPor: cerrado ? admin.id : null, cerradoEn: cerrado ? new Date(`${compromiso}T15:00:00Z`) : null, creadoPor: admin.id,
      });
    });
  }
  for (let i = 0; i < segs.length; i += 200) await db.insert(seguimientos).values(segs.slice(i, i + 200));

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
  for (let i = 0; i < cts.length; i += 200) await db.insert(citas).values(cts.slice(i, i + 200));

  return {
    empresas: emps, sedes: sedesC, protocolos: prots, pacientes: pacs.length,
    evaluaciones: planes.length, examenes: totalExamenes, seguimientos: segs.length, citas: cts.length,
  };
}

// Ejecución directa: npm run seed
if (process.argv[1]?.replace(/\\/g, '/').endsWith('src/seed.ts')) {
  const { crearDb } = await import('./db');
  const res = await sembrar(await crearDb());
  console.log(`Listo: ${res.empresas.length} empresas, ${res.pacientes} trabajadores, ${res.evaluaciones} evaluaciones, ${res.examenes} exámenes, ${res.seguimientos} seguimientos, ${res.citas} citas.`);
  console.log(`Usuarios: admin@example.com, operador@example.com, gerente1..3@example.com — contraseña: ${PASSWORD_DEMO}`);
  process.exit(0);
}
