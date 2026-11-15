import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { crearDb, type DB } from '../src/db';
import { crearApp } from '../src/app';
import { sembrar, PASSWORD_DEMO } from '../src/seed';
import { pacientes, tokensRecuperacion } from '../src/db/schema';
import { bandejaSimulada } from '../src/services/correo';

let app: Express;
let db: DB;
let empresaIds: number[];
const tokens: Record<string, string> = {};

async function login(email: string) {
  const r = await request(app).post('/api/auth/login').send({ email, password: PASSWORD_DEMO });
  expect(r.status).toBe(200);
  return r.body.token as string;
}
const como = (quien: string) => ({ Authorization: `Bearer ${tokens[quien]}` });

beforeAll(async () => {
  db = await crearDb({ memoria: true });
  const s = await sembrar(db);
  empresaIds = s.empresas.map((e) => e.id);
  app = crearApp(db);
  tokens.admin = await login('admin@example.com');
  tokens.operador = await login('operador@example.com');
  tokens.gerente1 = await login('gerente1@example.com');
}, 60_000);

describe('autenticación', () => {
  it('rechaza contraseña incorrecta y rutas sin token', async () => {
    expect((await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'x' })).status).toBe(401);
    expect((await request(app).get('/api/pacientes')).status).toBe(401);
  });

  it('bloquea la cuenta tras 5 intentos fallidos', async () => {
    for (let i = 0; i < 5; i++) await request(app).post('/api/auth/login').send({ email: 'gerente3@example.com', password: 'mala' });
    const r = await request(app).post('/api/auth/login').send({ email: 'gerente3@example.com', password: PASSWORD_DEMO });
    expect(r.status).toBe(423);
  });
});

describe('roles', () => {
  it('el gerente no accede a datos clínicos ni a usuarios', async () => {
    expect((await request(app).get('/api/pacientes').set(como('gerente1'))).status).toBe(403);
    expect((await request(app).get('/api/examenes').set(como('gerente1'))).status).toBe(403);
    expect((await request(app).get('/api/usuarios').set(como('gerente1'))).status).toBe(403);
  });

  it('el gerente solo ve el dashboard y reporte de su empresa', async () => {
    const propio = await request(app).get('/api/dashboard').set(como('gerente1'));
    expect(propio.status).toBe(200);
    expect(propio.body.filtro.empresaId).toBe(empresaIds[0]);
    expect((await request(app).get(`/api/dashboard?empresaId=${empresaIds[1]}`).set(como('gerente1'))).status).toBe(403);
    expect((await request(app).get(`/api/reportes/${empresaIds[1]}`).set(como('gerente1'))).status).toBe(403);
  });

  it('el operador gestiona agenda pero no ve reportes financieros', async () => {
    expect((await request(app).get('/api/citas').set(como('operador'))).status).toBe(200);
    expect((await request(app).get('/api/dashboard').set(como('operador'))).status).toBe(403);
    expect((await request(app).get(`/api/reportes/${empresaIds[0]}`).set(como('operador'))).status).toBe(403);
  });
});

describe('pacientes y exámenes', () => {
  let pacienteId: number;
  let examenId: number;

  it('valida el RUT y guarda el RUT cifrado', async () => {
    expect((await request(app).post('/api/pacientes').set(como('operador'))
      .send({ rut: '11.111.111-2', nombre: 'Prueba', empresaId: empresaIds[0] })).status).toBe(400);
    const r = await request(app).post('/api/pacientes').set(como('operador'))
      .send({ rut: '11.111.111-1', nombre: 'Paciente Prueba', empresaId: empresaIds[0] });
    expect(r.status).toBe(201);
    expect(r.body.rut).toBe('11111111-1');
    pacienteId = r.body.id;
    const [fila] = await db.select().from(pacientes).where((await import('drizzle-orm')).eq(pacientes.id, pacienteId));
    expect(fila.rutCifrado).not.toContain('11111111');
  });

  it('busca por RUT (índice ciego) y por nombre', async () => {
    const porRut = await request(app).get('/api/pacientes?q=11.111.111-1').set(como('operador'));
    expect(porRut.body.items.map((p: { id: number }) => p.id)).toEqual([pacienteId]);
    const porNombre = await request(app).get('/api/pacientes?q=paciente prueba').set(como('operador'));
    expect(porNombre.body.items[0].id).toBe(pacienteId);
  });

  it('crea examen con observaciones cifradas y adjunta un PDF', async () => {
    const r = await request(app).post('/api/examenes').set(como('operador')).send({
      pacienteId, tipo: 'cardiologia', fecha: '2026-11-10', estado: 'completado', nivelHallazgo: 'moderado', observaciones: 'Soplo leve',
    });
    expect(r.status).toBe(201);
    expect(r.body.observaciones).toBe('Soplo leve');
    examenId = r.body.id;

    const sub = await request(app).post(`/api/examenes/${examenId}/archivos`).set(como('operador'))
      .attach('archivos', Buffer.from('%PDF-1.4 prueba'), { filename: 'ecg.pdf', contentType: 'application/pdf' });
    expect(sub.status).toBe(201);
    const malo = await request(app).post(`/api/examenes/${examenId}/archivos`).set(como('operador'))
      .attach('archivos', Buffer.from('x'), { filename: 'virus.exe', contentType: 'application/x-msdownload' });
    expect(malo.status).toBe(400);

    const hist = await request(app).get(`/api/pacientes/${pacienteId}/historial`).set(como('operador'));
    expect(hist.body.examenes[0].archivos[0].nombre).toBe('ecg.pdf');
    const desc = await request(app).get(`/api/archivos/${sub.body[0].id}/descarga`).set(como('operador'));
    expect(desc.status).toBe(200);
  });

  it('filtra exámenes por empresa y tipo', async () => {
    const r = await request(app).get(`/api/examenes?empresaId=${empresaIds[0]}&tipo=cardiologia`).set(como('admin'));
    expect(r.status).toBe(200);
    expect(r.body.items.every((e: { tipo: string; empresaId: number }) => e.tipo === 'cardiologia' && e.empresaId === empresaIds[0])).toBe(true);
  });

  it('pagina pacientes y exámenes sin repetir ni perder registros', async () => {
    const p1 = await request(app).get('/api/pacientes?porPagina=50&pagina=1').set(como('operador'));
    expect(p1.body.items).toHaveLength(50);
    expect(p1.body.total).toBeGreaterThan(100);
    const paginas = Math.ceil(p1.body.total / 50);
    const ids = new Set<number>();
    for (let i = 1; i <= paginas; i++) {
      const r = await request(app).get(`/api/pacientes?porPagina=50&pagina=${i}`).set(como('operador'));
      r.body.items.forEach((p: { id: number }) => ids.add(p.id));
    }
    expect(ids.size).toBe(p1.body.total);

    const ex = await request(app).get('/api/examenes?porPagina=200&pagina=2').set(como('admin'));
    expect(ex.body.pagina).toBe(2);
    expect(ex.body.items.length).toBe(Math.min(200, ex.body.total - 200));
    expect((await request(app).get('/api/examenes?porPagina=5000').set(como('admin'))).status).toBe(400);
  });
});

describe('protocolos, evaluaciones y aptitud', () => {
  let protocoloId: number;
  let cargoId: number;
  let trabajadorId: number;
  let evaluacionId: number;

  it('el admin configura un protocolo y un cargo; el operador solo los ve', async () => {
    const p = await request(app).post('/api/protocolos').set(como('admin'))
      .send({ nombre: 'Protocolo prueba', vigenciaMeses: 12, examenes: ['cardiologia', 'broncopulmonar'] });
    expect(p.status).toBe(201);
    protocoloId = p.body.id;
    expect((await request(app).post('/api/protocolos').set(como('operador')).send({ nombre: 'X', vigenciaMeses: 1, examenes: ['odontologia'] })).status).toBe(403);
    const c = await request(app).post('/api/cargos').set(como('admin')).send({ empresaId: empresaIds[0], nombre: 'Cargo prueba', protocoloIds: [protocoloId] });
    expect(c.status).toBe(201);
    cargoId = c.body.id;
    const lista = await request(app).get(`/api/cargos?empresaId=${empresaIds[0]}`).set(como('operador'));
    expect(lista.body.find((x: { id: number }) => x.id === cargoId).protocoloIds).toEqual([protocoloId]);
    expect((await request(app).get('/api/protocolos').set(como('gerente1'))).status).toBe(403);
  });

  it('un trabajador con cargo sin evaluación aparece "sin evaluación"', async () => {
    expect((await request(app).post('/api/pacientes').set(como('operador'))
      .send({ rut: '22.222.222-2', nombre: 'Trabajador Bateria', empresaId: empresaIds[1], cargoId })).status).toBe(400); // cargo de otra empresa
    const t = await request(app).post('/api/pacientes').set(como('operador'))
      .send({ rut: '22.222.222-2', nombre: 'Trabajador Bateria', empresaId: empresaIds[0], cargoId });
    expect(t.status).toBe(201);
    expect(t.body.cargo).toBe('Cargo prueba');
    trabajadorId = t.body.id;
    const a = await request(app).get(`/api/aptitud?q=Trabajador Bateria&protocoloId=${protocoloId}`).set(como('admin'));
    expect(a.body.items).toHaveLength(1);
    expect(a.body.items[0].estado).toBe('sin_evaluacion');
  });

  it('crear una evaluación genera la batería de exámenes pendientes', async () => {
    const ev = await request(app).post('/api/evaluaciones').set(como('operador'))
      .send({ pacienteId: trabajadorId, protocoloId, tipo: 'preocupacional', fecha: '2026-11-10' });
    expect(ev.status).toBe(201);
    evaluacionId = ev.body.id;
    expect(ev.body.examenes.map((e: { tipo: string }) => e.tipo).sort()).toEqual(['broncopulmonar', 'cardiologia']);
    expect(ev.body.pendientes).toBe(2);
    expect(ev.body.vigenciaSugerida).toBe('2027-11-10');
    // no se puede abrir otra del mismo protocolo mientras esta siga en curso
    expect((await request(app).post('/api/evaluaciones').set(como('operador'))
      .send({ pacienteId: trabajadorId, protocoloId, tipo: 'periodica', fecha: '2026-11-11' })).status).toBe(409);
    // ni cerrarla con exámenes pendientes
    expect((await request(app).post(`/api/evaluaciones/${evaluacionId}/cerrar`).set(como('operador')).send({ aptitud: 'apto' })).status).toBe(400);
  });

  it('un hallazgo abre un seguimiento automáticamente', async () => {
    const ev = await request(app).get(`/api/evaluaciones/${evaluacionId}`).set(como('operador'));
    const [e1, e2] = ev.body.examenes;
    await request(app).patch(`/api/examenes/${e1.id}`).set(como('operador')).send({ estado: 'completado', resultado: 'apto', nivelHallazgo: 'ninguno' });
    await request(app).patch(`/api/examenes/${e2.id}`).set(como('operador'))
      .send({ estado: 'completado', resultado: 'apto_con_restricciones', nivelHallazgo: 'moderado', observaciones: 'Hipertensión leve' });
    const s = await request(app).get(`/api/seguimientos?pacienteId=${trabajadorId}`).set(como('operador'));
    expect(s.body.items).toHaveLength(1);
    expect(s.body.items[0]).toMatchObject({ tipo: 'recontrol', estado: 'abierto', examenId: e2.id });
    // editar de nuevo el mismo examen no duplica el seguimiento
    await request(app).patch(`/api/examenes/${e2.id}`).set(como('operador')).send({ nivelHallazgo: 'moderado' });
    expect((await request(app).get(`/api/seguimientos?pacienteId=${trabajadorId}`).set(como('operador'))).body.total).toBe(1);
  });

  it('se cierra con la aptitud sugerida y queda vigente; luego no se puede modificar', async () => {
    const ev = await request(app).get(`/api/evaluaciones/${evaluacionId}`).set(como('operador'));
    expect(ev.body.aptitudSugerida).toBe('apto_con_restricciones');
    expect((await request(app).post(`/api/evaluaciones/${evaluacionId}/cerrar`).set(como('operador'))
      .send({ aptitud: 'apto_con_restricciones' })).status).toBe(400); // faltan restricciones
    const c = await request(app).post(`/api/evaluaciones/${evaluacionId}/cerrar`).set(como('operador'))
      .send({ aptitud: 'apto_con_restricciones', restricciones: 'Control de presión mensual' });
    expect(c.status).toBe(200);
    expect(c.body).toMatchObject({ estado: 'cerrada', vigenteHasta: '2027-11-10' });
    expect((await request(app).patch(`/api/examenes/${ev.body.examenes[0].id}`).set(como('operador')).send({ nivelHallazgo: 'critico' })).status).toBe(400);
    const a = await request(app).get(`/api/aptitud?q=Trabajador Bateria&protocoloId=${protocoloId}`).set(como('admin'));
    expect(a.body.items[0]).toMatchObject({ estado: 'vigente', aptitud: 'apto_con_restricciones', restricciones: 'Control de presión mensual' });
  });

  it('el gerente ve la aptitud de su empresa, sin diagnósticos, y puede exportarla', async () => {
    const a = await request(app).get('/api/aptitud?porPagina=200').set(como('gerente1'));
    expect(a.status).toBe(200);
    expect(a.body.items.every((f: { empresaId: number }) => f.empresaId === empresaIds[0])).toBe(true);
    const texto = JSON.stringify(a.body);
    expect(texto).not.toContain('Hipertensión');
    expect(texto).not.toMatch(/observaciones|nivelHallazgo|motivo/);
    expect(a.body.resumen.trabajadores).toBeGreaterThan(50);
    expect(a.body.resumen.porEstado.vencido + a.body.resumen.porEstado.por_vencer).toBeGreaterThan(0);
    expect((await request(app).get(`/api/aptitud?empresaId=${empresaIds[1]}`).set(como('gerente1'))).status).toBe(403);
    expect((await request(app).get('/api/seguimientos').set(como('gerente1'))).status).toBe(403);

    const csv = await request(app).get('/api/aptitud?formato=csv&estado=vencido').set(como('gerente1'));
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split('\r\n')[0]).toContain('Vigente hasta');
    expect(csv.text).toContain('Vencido');
  });

  it('el dashboard incluye el % de trabajadores habilitados', async () => {
    const d = await request(app).get('/api/dashboard').set(como('gerente1'));
    expect(d.body.aptitud.porcentajeHabilitados).toBeGreaterThan(0);
    expect(d.body.aptitud.porcentajeHabilitados).toBeLessThan(100);
  });

  it('avisa al gerente por correo de los vencimientos', async () => {
    const n = await request(app).post('/api/aptitud/notificar').set(como('admin')).send({ empresaId: empresaIds[0] });
    expect(n.body).toMatchObject({ enviado: true, para: 'gerente.cordillera@example.com' });
    expect(n.body.cantidad).toBeGreaterThan(0);
    const correo = bandejaSimulada.at(-1)!;
    expect(correo.texto).toMatch(/VENCIDO|vence el/);
    expect(correo.texto).not.toContain('Hallazgo');
  });

  it('no apto crea un seguimiento de no apto temporal; los seguimientos se cierran con resultado', async () => {
    const ev = await request(app).post('/api/evaluaciones').set(como('operador'))
      .send({ pacienteId: trabajadorId, protocoloId, tipo: 'periodica', fecha: '2026-11-12' });
    for (const e of ev.body.examenes) {
      await request(app).patch(`/api/examenes/${e.id}`).set(como('operador')).send({ estado: 'completado', resultado: 'no_apto', nivelHallazgo: 'critico' });
    }
    await request(app).post(`/api/evaluaciones/${ev.body.id}/cerrar`).set(como('operador'))
      .send({ aptitud: 'no_apto', restricciones: 'Reevaluar tras tratamiento', fechaReevaluacion: '2026-12-15' });
    const a = await request(app).get(`/api/aptitud?q=Trabajador Bateria&protocoloId=${protocoloId}`).set(como('admin'));
    expect(a.body.items[0].estado).toBe('no_apto');

    const s = await request(app).get(`/api/seguimientos?pacienteId=${trabajadorId}&estado=abierto`).set(como('operador'));
    const temporal = s.body.items.find((x: { tipo: string }) => x.tipo === 'no_apto_temporal');
    expect(temporal.fechaCompromiso).toBe('2026-12-15');
    expect((await request(app).patch(`/api/seguimientos/${temporal.id}`).set(como('operador')).send({ cerrar: { resultado: 'Alta médica' } })).status).toBe(200);
    expect((await request(app).patch(`/api/seguimientos/${temporal.id}`).set(como('operador')).send({ cerrar: { resultado: 'otra vez' } })).status).toBe(400);
    const resumen = await request(app).get('/api/seguimientos/resumen').set(como('operador'));
    expect(resumen.body.abiertos).toBeGreaterThan(0);
  });
});

describe('contraseñas', () => {
  const ultimoEnlace = () => {
    const c = bandejaSimulada.at(-1)!;
    return /token=([\w-]+)/.exec(c.texto)![1];
  };
  let nuevoId: number;

  it('un usuario creado por el admin debe cambiar la contraseña al entrar', async () => {
    expect((await request(app).post('/api/usuarios').set(como('admin'))
      .send({ email: 'nuevo@example.com', nombre: 'Nuevo Operador', rol: 'operador', password: 'solo-letras-aqui' })).status).toBe(400);
    const c = await request(app).post('/api/usuarios').set(como('admin'))
      .send({ email: 'nuevo@example.com', nombre: 'Nuevo Operador', rol: 'operador', password: 'Inicial-2026x' });
    expect(c.status).toBe(201);
    expect(c.body.debeCambiarPassword).toBe(true);
    nuevoId = c.body.id;

    const l = await request(app).post('/api/auth/login').send({ email: 'nuevo@example.com', password: 'Inicial-2026x' });
    expect(l.body.usuario.debeCambiarPassword).toBe(true);
    const t = { Authorization: `Bearer ${l.body.token}` };
    expect((await request(app).get('/api/citas').set(t)).status).toBe(403);
    expect((await request(app).get('/api/auth/me').set(t)).status).toBe(200);

    expect((await request(app).post('/api/auth/cambiar-password').set(t).send({ actual: 'mala', nueva: 'Propia-2026z' })).status).toBe(400);
    const cambio = await request(app).post('/api/auth/cambiar-password').set(t).send({ actual: 'Inicial-2026x', nueva: 'Propia-2026z' });
    expect(cambio.status).toBe(200);
    expect(cambio.body.usuario.debeCambiarPassword).toBe(false);
    // el token anterior queda invalidado; el nuevo funciona
    expect((await request(app).get('/api/citas').set(t)).status).toBe(401);
    expect((await request(app).get('/api/citas').set({ Authorization: `Bearer ${cambio.body.token}` })).status).toBe(200);
  });

  it('"olvidé mi contraseña" responde igual exista o no el correo, y el enlace sirve una sola vez', async () => {
    const antes = bandejaSimulada.length;
    const noExiste = await request(app).post('/api/auth/olvide').send({ email: 'nadie@example.com' });
    expect(bandejaSimulada.length).toBe(antes);
    const existe = await request(app).post('/api/auth/olvide').send({ email: 'nuevo@example.com' });
    expect(existe.body).toEqual(noExiste.body);
    expect(bandejaSimulada.length).toBe(antes + 1);
    const token = ultimoEnlace();

    expect((await request(app).post('/api/auth/restablecer').send({ token, password: 'corta1' })).status).toBe(400);
    expect((await request(app).post('/api/auth/restablecer').send({ token, password: 'Recuperada-2026' })).status).toBe(200);
    expect((await request(app).post('/api/auth/restablecer').send({ token, password: 'Otra-vez-2026' })).status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({ email: 'nuevo@example.com', password: 'Recuperada-2026' })).status).toBe(200);
  });

  it('un enlace vencido no sirve', async () => {
    await request(app).post('/api/auth/olvide').send({ email: 'nuevo@example.com' });
    const token = ultimoEnlace();
    await db.update(tokensRecuperacion).set({ expira: new Date(Date.now() - 1000) });
    expect((await request(app).post('/api/auth/restablecer').send({ token, password: 'Vencida-2026' })).status).toBe(400);
  });

  it('el admin puede restablecer con contraseña temporal o enviando un enlace', async () => {
    expect((await request(app).post(`/api/usuarios/${nuevoId}/restablecer`).set(como('operador')).send({ modo: 'temporal' })).status).toBe(403);
    const tmp = await request(app).post(`/api/usuarios/${nuevoId}/restablecer`).set(como('admin')).send({ modo: 'temporal' });
    expect(tmp.body.passwordTemporal).toMatch(/^(?=.*[A-Za-z])(?=.*\d).{12}$/);
    const l = await request(app).post('/api/auth/login').send({ email: 'nuevo@example.com', password: tmp.body.passwordTemporal });
    expect(l.body.usuario.debeCambiarPassword).toBe(true);

    const enl = await request(app).post(`/api/usuarios/${nuevoId}/restablecer`).set(como('admin')).send({ modo: 'enlace' });
    expect(enl.body.enviadoA).toBe('nuevo@example.com');
    expect(bandejaSimulada.at(-1)!.para).toBe('nuevo@example.com');
  });

  it('desactivar a un usuario corta su sesión de inmediato', async () => {
    const l = await request(app).post('/api/auth/login').send({ email: 'gerente2@example.com', password: PASSWORD_DEMO });
    const t = { Authorization: `Bearer ${l.body.token}` };
    expect((await request(app).get('/api/dashboard').set(t)).status).toBe(200);
    await request(app).patch(`/api/usuarios/${l.body.usuario.id}`).set(como('admin')).send({ activo: false });
    expect((await request(app).get('/api/dashboard').set(t)).status).toBe(401);
  });
});

describe('límites de inicio de sesión', () => {
  it('60 trabajadores desde la misma red pueden entrar sin bloquearse', async () => {
    for (let i = 0; i < 60; i++) {
      const r = await request(app).post('/api/auth/login').send({ email: 'operador@example.com', password: PASSWORD_DEMO });
      expect(r.status).toBe(200);
    }
  });

  it('frena los intentos repetidos contra un mismo correo', async () => {
    const intento = () => request(app).post('/api/auth/login').send({ email: 'no-existe@example.com', password: 'x' });
    for (let i = 0; i < 10; i++) expect((await intento()).status).toBe(401);
    expect((await intento()).status).toBe(429);
    // otro correo desde la misma IP sigue funcionando
    expect((await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: PASSWORD_DEMO })).status).toBe(200);
  });
});

describe('dashboard y reportes', () => {
  it('calcula KPIs coherentes', async () => {
    const r = await request(app).get('/api/dashboard').set(como('admin'));
    const k = r.body.kpis;
    expect(k.dotacionExaminada).toBeGreaterThan(0);
    expect(k.cobertura).toBeGreaterThan(0);
    expect(k.cobertura).toBeLessThanOrEqual(100);
    expect(k.ausentismo).toBeGreaterThan(0);
    expect(r.body.tendenciaMensual.length).toBeGreaterThanOrEqual(5);
    expect(r.body.recomendaciones.length).toBeGreaterThan(0);
  });

  it('genera el PDF del reporte gerencial', async () => {
    const hoy = new Date();
    const periodo = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const r = await request(app).get(`/api/reportes/${empresaIds[0]}/pdf?periodo=${periodo}`).set(como('gerente1'))
      .buffer(true).parse((res, cb) => { const b: Buffer[] = []; res.on('data', (c: Buffer) => b.push(c)); res.on('end', () => cb(null, Buffer.concat(b))); });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect((r.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('envía el reporte al gerente (modo simulado sin SMTP)', async () => {
    const r = await request(app).post(`/api/reportes/${empresaIds[0]}/enviar`).set(como('admin'));
    expect(r.body).toMatchObject({ enviado: true, simulado: true });
  });
});
