'use client';

import { useEffect, useRef, useState } from 'react';

function paraInputLima(iso) {
  if (!iso) return '';
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const m = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  return `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}`;
}

export default function PanelOrganizador({
  abierto,
  onCerrar,
  fechaLimite,
  onGuardar,
}) {
  const dialogoRef = useRef(null);
  const [clave, setClave] = useState('');
  const [fecha, setFecha] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialogo = dialogoRef.current;
    if (!dialogo) return;
    if (abierto && !dialogo.open) {
      setFecha(paraInputLima(fechaLimite));
      setClave('');
      setError('');
      dialogo.showModal();
    } else if (!abierto && dialogo.open) {
      dialogo.close();
    }
  }, [abierto, fechaLimite]);

  async function enviar(nuevaFecha) {
    if (ocupado) return;
    setOcupado(true);
    setError('');
    try {
      await onGuardar({ clave, fechaLimite: nuevaFecha });
      setClave('');
      onCerrar();
    } catch (e) {
      setError(e.message || 'No se pudo guardar la fecha límite.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <dialog
      ref={dialogoRef}
      className="modal-sorteo"
      aria-labelledby="titulo-organizador"
      onCancel={(e) => {
        e.preventDefault();
        onCerrar();
      }}
    >
      <div className="modal-contenido">
        <div className="modal-cabecera">
          <h2 id="titulo-organizador">Panel del organizador</h2>
          <button
            type="button"
            className="modal-cerrar"
            aria-label="Cerrar ventana"
            onClick={onCerrar}
          >
            ✕
          </button>
        </div>

        <form
          className="modal-clave"
          onSubmit={(e) => {
            e.preventDefault();
            enviar(fecha);
          }}
        >
          <p>
            Define la fecha y hora límite para anotar regalos en hora de Lima (UTC-5).
          </p>
          {error && (
            <div className="aviso" role="alert">
              <span>{error}</span>
            </div>
          )}
          <label>
            Fecha y hora límite (hora de Lima)
            <input
              type="datetime-local"
              value={fecha}
              required
              onChange={(e) => setFecha(e.target.value)}
            />
          </label>
          <label>
            Clave del organizador
            <input
              type="password"
              value={clave}
              minLength={12}
              autoComplete="current-password"
              required
              onChange={(e) => setClave(e.target.value)}
            />
          </label>
          <div className="botones">
            <button className="boton" disabled={ocupado}>
              {ocupado ? 'Guardando…' : 'Guardar fecha límite'}
            </button>
            {fechaLimite && (
              <button
                type="button"
                className="boton secundario"
                disabled={ocupado || clave.length < 12}
                onClick={() => enviar(null)}
              >
                Quitar fecha límite
              </button>
            )}
            <button type="button" className="boton secundario" onClick={onCerrar}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

