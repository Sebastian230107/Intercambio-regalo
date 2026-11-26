'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const ITEM_ALTO = 52;
const VUELTAS = 4;
const CONFETI = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  angulo: `${(i * 20) - 170}deg`,
  distancia: `${70 + (i % 4) * 28}px`,
  altura: `${-60 - (i % 3) * 35}px`,
  retraso: `${(i % 5) * 40}ms`,
  color: ['#f5bc3c', '#b8244a', '#0f5c4a', '#ffd166'][i % 4],
}));

function prefiereMenosMovimiento() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export default function AmigoSecreto({
  abierto,
  onCerrar,
  participantes,
  yo,
  onSortear,
}) {
  const dialogoRef = useRef(null);
  const timersRef = useRef([]);
  const rafRef = useRef(null);

  const [clave, setClave] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [fase, setFase] = useState('clave'); // 'clave' | 'caja' | 'ruleta' | 'revelado'
  const [resultado, setResultado] = useState(null); // { amigo, primeraVez }
  const [desplazamiento, setDesplazamiento] = useState(0);
  const [animarRuleta, setAnimarRuleta] = useState(false);

  function limpiarTemporizadores() {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  function programar(fn, ms) {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }

  useEffect(() => {
    const dialogo = dialogoRef.current;
    if (!dialogo) return;
    if (abierto && !dialogo.open) {
      dialogo.showModal();
    } else if (!abierto && dialogo.open) {
      dialogo.close();
    }
    if (!abierto) {
      limpiarTemporizadores();
      setClave('');
      setError('');
      setFase('clave');
      setResultado(null);
      setDesplazamiento(0);
      setAnimarRuleta(false);
    }
    return () => {
      limpiarTemporizadores();
    };
  }, [abierto]);

  const listaRuleta = useMemo(() => {
    if (!participantes?.length) return [];
    const items = [];
    for (let v = 0; v < VUELTAS; v++) {
      for (const p of participantes) {
        items.push({ key: `${v}-${p.id}`, id: p.id, nombre: p.nombre });
      }
    }
    return items;
  }, [participantes]);

  function iniciarSecuencia(datos) {
    setResultado(datos);
    if (!datos.primeraVez || prefiereMenosMovimiento()) {
      setFase('revelado');
      return;
    }

    const idx = participantes.findIndex((p) => p.id === datos.amigo.id);
    const filaObjetivo = (VUELTAS - 1) * participantes.length + Math.max(0, idx);
    const destino = -Math.max(0, filaObjetivo - 1) * ITEM_ALTO;

    setDesplazamiento(0);
    setAnimarRuleta(false);
    setFase('caja');

    programar(() => {
      setFase('ruleta');
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => {
          setAnimarRuleta(true);
          setDesplazamiento(destino);
        });
      });
      programar(() => {
        setFase('revelado');
      }, 3600);
    }, 950);
  }

  async function enviarClave(e) {
    e.preventDefault();
    if (ocupado) return;
    setOcupado(true);
    setError('');
    try {
      const datos = await onSortear(clave);
      setClave('');
      iniciarSecuencia(datos);
    } catch (err) {
      setError(err.message || 'No se pudo completar el sorteo.');
    } finally {
      setOcupado(false);
    }
  }

  function manejarCerrar() {
    limpiarTemporizadores();
    onCerrar();
  }

  const amigo = resultado?.amigo;

  return (
    <dialog
      ref={dialogoRef}
      className="modal-sorteo"
      aria-labelledby="titulo-modal-sorteo"
      onCancel={(e) => {
        e.preventDefault();
        manejarCerrar();
      }}
    >
      <div className="modal-contenido">
        <div className="modal-cabecera">
          <h2 id="titulo-modal-sorteo">
            {yo ? `Amig@ secret@ de ${yo.nombre}` : 'Amig@ secret@'}
          </h2>
          <button
            type="button"
            className="modal-cerrar"
            aria-label="Cerrar ventana"
            onClick={manejarCerrar}
          >
            ✕
          </button>
        </div>

        {fase === 'clave' && (
          <form className="modal-clave" onSubmit={enviarClave}>
            <p>
              Ingresa tu clave personal para revelar a quién le darás regalo. Siempre verás el
              mismo resultado.
            </p>
            {error && (
              <div className="aviso" role="alert">
                <span>{error}</span>
              </div>
            )}
            <label>
              Tu clave
              <input
                type="password"
                value={clave}
                minLength={6}
                maxLength={64}
                autoComplete="current-password"
                required
                autoFocus
                onChange={(e) => setClave(e.target.value)}
              />
            </label>
            <div className="botones">
              <button className="boton" disabled={ocupado}>
                {ocupado ? 'Verificando…' : 'Revelar resultado'}
              </button>
              <button type="button" className="boton secundario" onClick={manejarCerrar}>
                Cancelar
              </button>
            </div>
          </form>
        )}

        {fase === 'caja' && (
          <div className="escena-caja" aria-live="polite">
            <div className="caja-regalo" aria-hidden="true">
              <div className="caja-tapa">
                <span className="caja-lazo" />
              </div>
              <div className="caja-cuerpo">
                <span className="caja-cinta-v" />
              </div>
            </div>
            <p className="texto-estado-anim">Abriendo tu regalo…</p>
          </div>
        )}

        {fase === 'ruleta' && (
          <div className="escena-ruleta" aria-live="polite">
            <p className="texto-estado-anim">Girando la ruleta…</p>
            <div className="ruleta-marco">
              <span className="ruleta-flecha" aria-hidden="true">▶</span>
              <div className="ruleta-visor">
                <div className="ruleta-centro" aria-hidden="true" />
                <ul
                  className={`ruleta-lista${animarRuleta ? ' girando' : ''}`}
                  style={{ transform: `translateY(${desplazamiento}px)` }}
                >
                  {listaRuleta.map((item) => (
                    <li key={item.key} className="ruleta-item">
                      {item.nombre}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {fase === 'revelado' && amigo && (
          <div
            className={`revelacion${resultado.primeraVez ? ' con-confeti' : ' revelacion-directa'}`}
            aria-live="polite"
          >
            {resultado.primeraVez && (
              <div className="confeti-capa" aria-hidden="true">
                {CONFETI.map((c) => (
                  <span
                    key={c.id}
                    className="confeti-pieza"
                    style={{
                      '--cx': c.distancia,
                      '--cy': c.altura,
                      '--cr': c.angulo,
                      '--cd': c.retraso,
                      backgroundColor: c.color,
                    }}
                  />
                ))}
              </div>
            )}

            <div className="tarjeta-revelado">
              <span className="revelado-etiqueta">Tu amig@ secret@ es</span>
              <h3 className="revelado-nombre">{amigo.nombre}</h3>
            </div>

            <div className="revelado-regalos">
              <h4>Lista de regalos de {amigo.nombre}</h4>
              {amigo.regalos.length === 0 ? (
                <p className="sin-regalos">
                  {amigo.nombre} todavía no tiene regalos anotados.
                </p>
              ) : (
                <ul className="regalos">
                  {amigo.regalos.map((r) => (
                    <li key={r.id} className="regalo">
                      <div className="descripcion">
                        <h3>{r.nombre}</h3>
                        {r.detalle && <p>{r.detalle}</p>}
                        {r.enlace && (
                          <a href={r.enlace} target="_blank" rel="noopener noreferrer">
                            Ver en la tienda
                          </a>
                        )}
                      </div>
                      {r.precio && <span className="precio">S/ {Number(r.precio).toFixed(2)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="botones">
              <button type="button" className="boton" onClick={manejarCerrar}>
                Listo
              </button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}

