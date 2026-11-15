import { useEffect, useState } from 'react';
import { api, qs } from '../api';
import type { Paciente } from '../tipos';
import { formatearRut } from '../formato';

/** Busca un paciente por nombre o RUT y lo selecciona. */
export function SelectorPaciente({ valor, onCambio }: { valor: Paciente | null; onCambio(p: Paciente | null): void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Paciente[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return; }
    const t = setTimeout(() => api.get<{ items: Paciente[] }>(`/pacientes${qs({ q: q.trim(), porPagina: 8 })}`).then((r) => setRes(r.items)).catch(() => setRes([])), 250);
    return () => clearTimeout(t);
  }, [q]);

  if (valor) {
    return (
      <div className="campo">
        Paciente
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--borde)', borderRadius: 8, padding: '8px 10px' }}>
          <span><strong>{valor.nombre}</strong> <span style={{ color: 'var(--texto-3)' }}>{formatearRut(valor.rut)}</span></span>
          <button type="button" className="btn link" onClick={() => onCambio(null)}>Cambiar</button>
        </div>
      </div>
    );
  }
  return (
    <label className="campo" style={{ position: 'relative' }}>
      Paciente
      <input autoFocus placeholder="Escriba nombre o RUT" value={q} onChange={(e) => setQ(e.target.value)} />
      {res.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--superficie)', border: '1px solid var(--borde)', borderRadius: 8, marginTop: 4, zIndex: 3, boxShadow: '0 6px 18px rgba(0,0,0,.12)' }}>
          {res.map((p) => (
            <button key={p.id} type="button" onClick={() => onCambio(p)}
              style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, background: 'none', padding: '8px 10px', cursor: 'pointer', color: 'var(--texto)' }}>
              {p.nombre} <span style={{ color: 'var(--texto-3)' }}>{formatearRut(p.rut)}</span>
            </button>
          ))}
        </div>
      )}
    </label>
  );
}
