import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { crearDb, type DB } from '../src/db';
import { crearApp } from '../src/app';
import { sembrar, PASSWORD_DEMO } from '../src/seed';
import { pacientes } from '../src/db/schema';

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
