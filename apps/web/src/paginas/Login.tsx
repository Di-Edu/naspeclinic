import { useState, type FormEvent } from 'react';
import { useSesion } from '../sesion';
import { mensajeError } from '../util';
import { Logo } from '../App';

/** Usuarios de la demo (datos ficticios). Se ocultan en producción con VITE_DEMO=0. */
const DEMO = import.meta.env.VITE_DEMO !== '0';
const DEMO_PASS = 'Demo-Naspeclinic-2026';
const CUENTAS = [
  ['admin@example.com', 'Admin'],
  ['operador@example.com', 'Operador'],
  ['gerente1@example.com', 'Gerente minera'],
] as const;

export function Login() {
  const { entrar } = useSesion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent, cred?: [string, string]) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await entrar(cred?.[0] ?? email, cred?.[1] ?? password);
    } catch (err) {
      setError(mensajeError(err));
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <section className="marca-panel">
        <div className="logo" style={{ padding: 0 }}>
          <Logo tam={40} />
          <div>Naspeclinic<small>Salud Integral Ocupacional</small></div>
        </div>
        <div>
          <h1>Salud ocupacional para la industria minera</h1>
          <p>Exámenes, agenda y reportes ejecutivos de cada faena en un solo lugar.</p>
        </div>
        <p style={{ fontSize: '0.8rem' }}>Santiago · Antofagasta · Sur de Chile</p>
      </section>
      <section className="form-panel">
        <form className="form" onSubmit={enviar}>
          <h1 style={{ marginBottom: 6 }}>Iniciar sesión</h1>
          <label className="campo">
            Correo electrónico
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="campo">
            Contraseña
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <div className="aviso error" role="alert">{error}</div>}
          <button className="btn primario" disabled={enviando} style={{ justifyContent: 'center' }}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
          {DEMO && (
            <div className="demo">
              Demo con datos ficticios — entrar como:
              <div>
                {CUENTAS.map(([correo, etq]) => (
                  <button key={correo} type="button" className="btn chico" disabled={enviando} onClick={(e) => enviar(e, [correo, DEMO_PASS])}>
                    {etq}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
