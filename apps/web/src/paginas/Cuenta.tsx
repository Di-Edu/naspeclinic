import { useState, type FormEvent, type ReactNode } from 'react';
import { problemaPassword } from '@naspeclinic/shared';
import { api } from '../api';
import { useSesion } from '../sesion';
import { Modal, mensajeError } from '../util';
import { Logo } from '../App';

/** Dos campos (nueva + confirmar) con la política de contraseñas a la vista. */
function CamposNueva({ nueva, confirmar, setNueva, setConfirmar }: {
  nueva: string; confirmar: string; setNueva(v: string): void; setConfirmar(v: string): void;
}) {
  const problema = nueva ? problemaPassword(nueva) : null;
  const distinta = confirmar.length > 0 && confirmar !== nueva;
  return (
    <>
      <label className="campo">Nueva contraseña
        <input type="password" autoComplete="new-password" required value={nueva} onChange={(e) => setNueva(e.target.value)} aria-invalid={!!problema} />
        <span style={{ color: problema ? 'var(--critico-texto)' : 'var(--texto-3)' }}>{problema ?? 'Mínimo 10 caracteres, con letras y números.'}</span>
      </label>
      <label className="campo">Repetir nueva contraseña
        <input type="password" autoComplete="new-password" required value={confirmar} onChange={(e) => setConfirmar(e.target.value)} aria-invalid={distinta} />
        {distinta && <span style={{ color: 'var(--critico-texto)' }}>Las contraseñas no coinciden</span>}
      </label>
    </>
  );
}
const nuevaValida = (nueva: string, confirmar: string) => !problemaPassword(nueva) && nueva === confirmar;

function FormCambio({ onListo, onCancelar, textoBoton }: { onListo(): void; onCancelar?(): void; textoBoton: string }) {
  const { cambiarPassword } = useSesion();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true); setError(null);
    try { await cambiarPassword(actual, nueva); onListo(); } catch (err) { setError(mensajeError(err)); setEnviando(false); }
  }
  return (
    <form className="form" onSubmit={enviar}>
      <label className="campo">Contraseña actual
        <input type="password" autoComplete="current-password" required value={actual} onChange={(e) => setActual(e.target.value)} />
      </label>
      <CamposNueva nueva={nueva} confirmar={confirmar} setNueva={setNueva} setConfirmar={setConfirmar} />
      {error && <div className="aviso error" role="alert">{error}</div>}
      <div className="acciones">
        {onCancelar && <button type="button" className="btn" onClick={onCancelar}>Cancelar</button>}
        <button className="btn primario" disabled={enviando || !nuevaValida(nueva, confirmar)}>{enviando ? 'Guardando…' : textoBoton}</button>
      </div>
    </form>
  );
}

/** Modal "Cambiar contraseña" desde el menú. */
export function ModalCambiarPassword({ onCerrar }: { onCerrar(): void }) {
  const [listo, setListo] = useState(false);
  return (
    <Modal titulo="Cambiar contraseña" onCerrar={onCerrar}>
      {listo ? (
        <div className="form">
          <div className="aviso ok" role="status">Contraseña actualizada. Se cerraron sus sesiones en otros dispositivos.</div>
          <div className="acciones"><button className="btn primario" onClick={onCerrar}>Listo</button></div>
        </div>
      ) : <FormCambio textoBoton="Cambiar contraseña" onListo={() => setListo(true)} onCancelar={onCerrar} />}
    </Modal>
  );
}

/** Pantalla completa (estilo login) para flujos sin menú. */
function PantallaSimple({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="login">
      <section className="marca-panel">
        <div className="logo" style={{ padding: 0 }}>
          <Logo tam={40} />
          <div>Naspeclinic<small>Salud Integral Ocupacional</small></div>
        </div>
        <div><h1>{titulo}</h1></div>
        <p style={{ fontSize: '0.8rem' }}>Santiago · Antofagasta · Sur de Chile</p>
      </section>
      <section className="form-panel"><div style={{ width: 'min(380px, 100%)' }}>{children}</div></section>
    </div>
  );
}

/** Cambio obligatorio tras recibir una contraseña asignada por el admin. */
export function CambioObligatorio() {
  const { usuario, salir } = useSesion();
  return (
    <PantallaSimple titulo="Cree su propia contraseña">
      <h1 style={{ marginBottom: 6 }}>Hola, {usuario?.nombre.split(' ')[0]}</h1>
      <p style={{ color: 'var(--texto-2)', marginTop: 0 }}>
        Su contraseña actual fue asignada por un administrador. Por seguridad, debe reemplazarla antes de continuar.
      </p>
      <FormCambio textoBoton="Guardar y continuar" onListo={() => { /* la sesión se actualiza sola */ }} />
      <p style={{ textAlign: 'center', marginTop: 16 }}><button className="btn link" onClick={() => salir()}>Cerrar sesión</button></p>
    </PantallaSimple>
  );
}

/** Formulario "¿Olvidó su contraseña?" (se muestra dentro del login). */
export function FormOlvide({ onVolver }: { onVolver(): void }) {
  const [email, setEmail] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true); setError(null);
    try { setMensaje((await api.post<{ mensaje: string }>('/auth/olvide', { email })).mensaje); }
    catch (err) { setError(mensajeError(err)); }
    setEnviando(false);
  }
  return (
    <form className="form" onSubmit={enviar}>
      <h1 style={{ marginBottom: 6 }}>Recuperar contraseña</h1>
      {mensaje ? (
        <div className="aviso ok" role="status">{mensaje}</div>
      ) : (
        <>
          <p style={{ color: 'var(--texto-2)', margin: 0 }}>Ingrese su correo y le enviaremos un enlace para crear una nueva contraseña.</p>
          <label className="campo">Correo electrónico
            <input type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && <div className="aviso error" role="alert">{error}</div>}
          <button className="btn primario" disabled={enviando} style={{ justifyContent: 'center' }}>{enviando ? 'Enviando…' : 'Enviar enlace'}</button>
        </>
      )}
      <p style={{ textAlign: 'center', margin: '6px 0 0' }}><button type="button" className="btn link" onClick={onVolver}>← Volver a iniciar sesión</button></p>
    </form>
  );
}

/** Página pública /restablecer?token=… a la que lleva el correo. */
export function Restablecer() {
  const tokenUrl = new URLSearchParams(window.location.search).get('token') ?? '';
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const irAlLogin = () => { window.location.href = '/'; };

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = await api.post<{ mensaje: string }>('/auth/restablecer', { token: tokenUrl, password: nueva });
      setEstado({ ok: true, texto: r.mensaje });
    } catch (err) { setEstado({ ok: false, texto: mensajeError(err) }); }
    setEnviando(false);
  }

  return (
    <PantallaSimple titulo="Restablecer contraseña">
      {!tokenUrl ? (
        <div className="form">
          <div className="aviso error">El enlace está incompleto. Ábralo directamente desde el correo o solicite uno nuevo.</div>
          <button className="btn primario" onClick={irAlLogin} style={{ justifyContent: 'center' }}>Ir a iniciar sesión</button>
        </div>
      ) : estado?.ok ? (
        <div className="form">
          <div className="aviso ok" role="status">{estado.texto}</div>
          <button className="btn primario" onClick={irAlLogin} style={{ justifyContent: 'center' }}>Iniciar sesión</button>
        </div>
      ) : (
        <form className="form" onSubmit={enviar}>
          <h1 style={{ marginBottom: 6 }}>Nueva contraseña</h1>
          <CamposNueva nueva={nueva} confirmar={confirmar} setNueva={setNueva} setConfirmar={setConfirmar} />
          {estado && <div className="aviso error" role="alert">{estado.texto}</div>}
          <button className="btn primario" disabled={enviando || !nuevaValida(nueva, confirmar)} style={{ justifyContent: 'center' }}>
            {enviando ? 'Guardando…' : 'Guardar contraseña'}
          </button>
          <p style={{ textAlign: 'center', margin: '6px 0 0' }}><button type="button" className="btn link" onClick={irAlLogin}>← Volver a iniciar sesión</button></p>
        </form>
      )}
    </PantallaSimple>
  );
}
