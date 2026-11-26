'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AmigoSecreto from './amigo-secreto';
import PanelOrganizador from './organizador';

const REGALO_VACIO = { nombre: '', detalle: '', precio: '', enlace: '' };
const SORTEO_INICIAL = { cantidad: 0, minimo: 16, maximo: 17, habilitado: false };

function formatearFechaLima(iso) {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(new Date(iso))
    .replace(/^([a-záéíóúñ]+),\s+/i, '$1 ');
}

function formatearCuentaRegresiva(ms) {
  const totalSeg = Math.max(0, Math.floor(ms / 1000));
  const dias = Math.floor(totalSeg / 86400);
  const horas = Math.floor((totalSeg % 86400) / 3600);
  const min = Math.floor((totalSeg % 3600) / 60);
  const seg = totalSeg % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (dias > 0) return `${dias}d ${pad(horas)}h ${pad(min)}m ${pad(seg)}s`;
  if (horas > 0) return `${pad(horas)}h ${pad(min)}m ${pad(seg)}s`;
  return `${pad(min)}m ${pad(seg)}s`;
}

const contar = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

async function pedir(opciones) {
  let respuesta;
  try {
    respuesta = await fetch('/api/lista', { cache: 'no-store', ...opciones });
  } catch {
    throw new Error('No hay conexión. Revisa tu internet e intenta otra vez.');
  }
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok || !datos) {
    const error = new Error(datos?.error || 'No se pudo completar la acción.');
    error.estado = respuesta.status;
    throw error;
  }
  return datos;
}

export default function Inicio() {
  const [participantes, setParticipantes] = useState(null);
  const [sorteo, setSorteo] = useState(SORTEO_INICIAL);
  const [elegidoId, setElegidoId] = useState(null);
  const [yoId, setYoId] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [organizadorAbierto, setOrganizadorAbierto] = useState(false);
  const [fechaLimite, setFechaLimite] = useState(null);
  const [desfaseMs, setDesfaseMs] = useState(0);
  const [restanteMs, setRestanteMs] = useState(null);
  const [celebrando, setCelebrando] = useState(false);
  const cambios = useRef(0);
  const panel = useRef(null);
  const prevHabilitado = useRef(false);

  const aplicarRespuesta = useCallback((datos) => {
    setParticipantes(datos.participantes);
    if (datos.sorteo) setSorteo(datos.sorteo);
    setYoId(datos.yo);
    const desfase = typeof datos.ahora === 'number' ? datos.ahora - Date.now() : 0;
    setDesfaseMs(desfase);
    setFechaLimite(datos.fechaLimite ?? null);
    if (datos.fechaLimite) {
      setRestanteMs(Date.parse(datos.fechaLimite) - (Date.now() + desfase));
    } else {
      setRestanteMs(null);
    }
  }, []);

  const cargar = useCallback(async () => {
    const antes = cambios.current;
    try {
      const datos = await pedir();
      // Si se guardó algo mientras tanto, esta lectura ya es antigua.
      if (antes !== cambios.current) return;
      aplicarRespuesta(datos);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [aplicarRespuesta]);

  useEffect(() => {
    if (!fechaLimite) {
      setRestanteMs(null);
      return undefined;
    }
    const objetivo = Date.parse(fechaLimite);
    const actualizar = () => {
      setRestanteMs(objetivo - (Date.now() + desfaseMs));
    };
    actualizar();
    if (objetivo - (Date.now() + desfaseMs) <= 0) return undefined;
    const id = setInterval(actualizar, 1000);
    return () => clearInterval(id);
  }, [fechaLimite, desfaseMs]);

  useEffect(() => {
    cargar();
    const alVolver = () => {
      if (document.visibilityState === 'visible') cargar();
    };
    // Al volver a la pestaña se traen los cambios de los demás.
    window.addEventListener('focus', cargar);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.removeEventListener('focus', cargar);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [cargar]);

  useEffect(() => {
    if (participantes === null || sorteo.cantidad >= sorteo.maximo) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') cargar();
    }, 60_000);
    return () => clearInterval(id);
  }, [cargar, participantes, sorteo.cantidad, sorteo.maximo]);

  useEffect(() => {
    let id;
    if (sorteo.habilitado && !prevHabilitado.current && participantes !== null) {
      setCelebrando(true);
      id = setTimeout(() => setCelebrando(false), 1800);
    }
    prevHabilitado.current = sorteo.habilitado;
    return () => {
      if (id) clearTimeout(id);
    };
  }, [sorteo.habilitado, participantes]);

  // Devuelve los datos nuevos si se guardó, o null si falló.
  async function guardar(accion) {
    setOcupado(true);
    setError('');
    cambios.current++;
    try {
      const datos = await pedir({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accion),
      });
      aplicarRespuesta(datos);
      return datos;
    } catch (e) {
      setError(e.message);
      // Un 401 al editar significa que la sesión ya no vale.
      if (e.estado === 401 && accion.tipo !== 'entrar') setYoId(null);
      return null;
    } finally {
      cambios.current++;
      setOcupado(false);
    }
  }

  async function sortearConClave(clave) {
    cambios.current++;
    try {
      const datos = await pedir({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'sortear', clave }),
      });
      aplicarRespuesta(datos);
      return { amigo: datos.amigo, primeraVez: datos.primeraVez };
    } catch (e) {
      if (e.estado === 401) setYoId(null);
      throw e;
    } finally {
      cambios.current++;
    }
  }

  async function guardarFechaOrganizador({ clave, fechaLimite: nuevaFecha }) {
    cambios.current++;
    try {
      const datos = await pedir({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'guardarFechaLimite',
          clave,
          fechaLimite: nuevaFecha || null,
        }),
      });
      aplicarRespuesta(datos);
    } finally {
      cambios.current++;
    }
  }

  const plazoCerrado = Boolean(fechaLimite && restanteMs !== null && restanteMs <= 0);
  const yo = participantes?.find((p) => p.id === yoId);
  const elegido = participantes?.find((p) => p.id === elegidoId) ?? yo ?? participantes?.[0];
  const totalRegalos = participantes?.reduce((suma, p) => suma + p.regalos.length, 0) ?? 0;

  function elegir(id) {
    setElegidoId(id);
    // En el celular la lista queda debajo de los nombres.
    if (window.matchMedia('(max-width: 760px)').matches) {
      requestAnimationFrame(() => panel.current?.scrollIntoView({ block: 'start' }));
    }
  }

  return (
    <>
      <header className="envoltura">
        <div className="cinta" aria-hidden="true">
          <Mono />
        </div>
        <div className="contenido titulo">
          <h1>Intercambio de regalos</h1>
          <p>
            {participantes?.length
              ? `${contar(participantes.length, 'participante', 'participantes')} y ${contar(totalRegalos, 'regalo anotado', 'regalos anotados')}`
              : 'Anota lo que le gustaría recibir a cada persona.'}
          </p>
        </div>
      </header>

      <main className="contenido">
        {error && (
          <div className="aviso" role="alert">
            <span>{error}</span>
            <button type="button" className="boton secundario" onClick={cargar}>
              Actualizar lista
            </button>
          </div>
        )}

        {participantes === null ? (
          !error && <p className="cargando" role="status">Cargando la lista…</p>
        ) : (
          <>
            {fechaLimite && (
              <AvisoPlazo
                fechaLimite={fechaLimite}
                restanteMs={restanteMs}
                plazoCerrado={plazoCerrado}
              />
            )}

            <TarjetaSorteo
              sorteo={sorteo}
              yo={yo}
              celebrando={celebrando}
              onAbrir={() => setModalAbierto(true)}
            />

            <div className="columnas">
              <section aria-labelledby="titulo-participantes" className="participantes">
                {yo ? (
                  <div className="sesion">
                    <p>
                      Entraste como <strong>{yo.nombre}</strong>
                    </p>
                    <div className="acciones">
                      <button type="button" className="enlace" onClick={() => elegir(yo.id)}>
                        Ver mi lista
                      </button>
                      <button
                        type="button"
                        className="enlace"
                        disabled={ocupado}
                        onClick={() => guardar({ tipo: 'salir' })}
                      >
                        Cerrar sesión
                      </button>
                    </div>
                  </div>
                ) : (
                  <Acceso
                    ocupado={ocupado}
                    registroCerrado={sorteo.cantidad >= sorteo.maximo}
                    onEnviar={async (accion) => {
                      const datos = await guardar(accion);
                      if (datos) elegir(datos.yo);
                      return Boolean(datos);
                    }}
                  />
                )}
              <h2 id="titulo-participantes">Participantes</h2>
              <ul className="etiquetas">
                {participantes.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="etiqueta"
                      aria-pressed={p.id === elegido?.id}
                      onClick={() => elegir(p.id)}
                    >
                      <strong>
                        {p.nombre}
                        {p.id === yoId && ' (tú)'}
                      </strong>
                      <span>
                        {p.regalos.length ? contar(p.regalos.length, 'regalo', 'regalos') : 'Sin regalos aún'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel" ref={panel} aria-live="polite">
              {elegido ? (
                <Lista
                  key={`${elegido.id}-${elegido.id === yoId}`}
                  persona={elegido}
                  esMia={elegido.id === yoId}
                  plazoCerrado={plazoCerrado}
                  ocupado={ocupado}
                  guardar={guardar}
                />
              ) : (
                <div className="vacio">
                  <h2>Aún no hay participantes</h2>
                  <p>Crea la primera lista con tu nombre y una clave.</p>
                </div>
              )}
            </section>
          </div>

          <footer className="pie-organizador">
            <button
              type="button"
              className="enlace-discreto"
              onClick={() => setOrganizadorAbierto(true)}
            >
              Soy el organizador
            </button>
          </footer>

          <AmigoSecreto
            abierto={modalAbierto}
            onCerrar={() => setModalAbierto(false)}
            participantes={participantes}
            yo={yo}
            onSortear={sortearConClave}
          />

          <PanelOrganizador
            abierto={organizadorAbierto}
            onCerrar={() => setOrganizadorAbierto(false)}
            fechaLimite={fechaLimite}
            onGuardar={guardarFechaOrganizador}
          />
        </>
        )}
      </main>
    </>
  );
}

function AvisoPlazo({ fechaLimite, restanteMs, plazoCerrado }) {
  const urgente = !plazoCerrado && restanteMs !== null && restanteMs < 3_600_000;
  return (
    <div
      className={`aviso-plazo${plazoCerrado ? ' vencido' : urgente ? ' urgente' : ''}`}
      role="status"
      aria-live="polite"
    >
      <p className="aviso-plazo-texto">
        {plazoCerrado
          ? 'El plazo para anotar regalos terminó'
          : `Tienes hasta el ${formatearFechaLima(fechaLimite)} para anotar tus regalos`}
      </p>
      {!plazoCerrado && restanteMs !== null && (
        <span className="cuenta-regresiva" aria-label="Tiempo restante">
          {formatearCuentaRegresiva(restanteMs)}
        </span>
      )}
    </div>
  );
}

function TarjetaSorteo({ sorteo, yo, celebrando, onAbrir }) {
  const { cantidad, minimo, maximo, habilitado } = sorteo;
  const faltan = Math.max(0, minimo - cantidad);
  const proporcion = Math.min(1, cantidad / minimo);
  const puedeSortear = habilitado && Boolean(yo);

  return (
    <section
      className={`tarjeta-sorteo${habilitado ? ' habilitado' : ''}${celebrando ? ' celebrando' : ''}`}
      aria-labelledby="titulo-sorteo"
    >
      <div className="sorteo-info">
        <div className="sorteo-encabezado">
          <h2 id="titulo-sorteo">Sorteo del amig@ secret@</h2>
          <span className="sorteo-contador">
            {cantidad} de {minimo} registrados
          </span>
        </div>
        <div
          className="progreso-barra"
          role="progressbar"
          aria-valuenow={Math.min(cantidad, minimo)}
          aria-valuemin={0}
          aria-valuemax={minimo}
          aria-label={`${cantidad} de ${minimo} registrados`}
        >
          <div className="progreso-relleno" style={{ transform: `scaleX(${proporcion})` }} />
        </div>
        <p className="sorteo-mensaje">
          {!habilitado
            ? `Faltan ${contar(faltan, 'participante', 'participantes')} para habilitar el sorteo.`
            : cantidad < maximo
              ? '¡Sorteo habilitado! Queda el cupo 17 disponible.'
              : `¡Cupo completo! (${cantidad} de ${maximo} participantes).`}
        </p>
        {!yo && (
          <p className="sorteo-invitacion">
            {cantidad < maximo
              ? 'Regístrate o entra con tu clave para participar en el sorteo.'
              : 'Entra con tu clave para conocer a tu amig@ secret@.'}
          </p>
        )}
      </div>

      <div className="sorteo-accion">
        <button
          type="button"
          className={`boton boton-sorteo${celebrando ? ' destello' : ''}`}
          disabled={!puedeSortear}
          onClick={onAbrir}
        >
          {!habilitado && (
            <svg className="candado" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M17 10h-1V7a4 4 0 0 0-8 0v3H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-7-3a2 2 0 1 1 4 0v3h-4V7Z"
              />
            </svg>
          )}
          Conocer mi amig@ secret@
        </button>
      </div>
    </section>
  );
}

function Acceso({ ocupado, registroCerrado, onEnviar }) {
  const [tipo, setTipo] = useState(registroCerrado ? 'entrar' : 'registrar');
  const [nombre, setNombre] = useState('');
  const [clave, setClave] = useState('');

  useEffect(() => {
    if (registroCerrado) setTipo('entrar');
  }, [registroCerrado]);

  const esNuevo = !registroCerrado && tipo === 'registrar';

  return (
    <div className="acceso">
      {!registroCerrado ? (
        <div className="pestanas">
          <button type="button" aria-pressed={esNuevo} onClick={() => setTipo('registrar')}>
            Soy nuevo
          </button>
          <button type="button" aria-pressed={!esNuevo} onClick={() => setTipo('entrar')}>
            Ya tengo lista
          </button>
        </div>
      ) : (
        <p className="registro-cerrado">
          Se completaron los 17 cupos. Entra con tu nombre y clave.
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await onEnviar({ tipo, nombre, clave })) setClave('');
        }}
      >
        <label>
          Tu nombre
          <input
            value={nombre}
            maxLength={60}
            autoComplete="username"
            required
            onChange={(e) => setNombre(e.target.value)}
          />
        </label>
        <label>
          {esNuevo ? 'Crea una clave (mínimo 6 caracteres)' : 'Tu clave'}
          <input
            type="password"
            value={clave}
            minLength={6}
            maxLength={64}
            autoComplete={esNuevo ? 'new-password' : 'current-password'}
            required
            onChange={(e) => setClave(e.target.value)}
          />
        </label>
        <button className="boton" disabled={ocupado}>
          {esNuevo ? 'Crear mi lista' : 'Entrar'}
        </button>
        {esNuevo && <p>Guarda tu clave: la necesitas para editar tu lista desde otro equipo.</p>}
      </form>
    </div>
  );
}

function Lista({ persona, esMia, plazoCerrado, ocupado, guardar }) {
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombre, setNombre] = useState(persona.nombre);
  // null = formulario cerrado, 'nuevo' = agregando, o el id del regalo que se edita
  const [formulario, setFormulario] = useState(null);
  const participanteId = persona.id;
  const puedeEditarRegalos = esMia && !plazoCerrado;

  useEffect(() => {
    if (plazoCerrado) setFormulario(null);
  }, [plazoCerrado]);

  return (
    <>
      {editandoNombre ? (
        <form
          className="nuevo renombrar"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await guardar({ tipo: 'editarParticipante', participanteId, nombre })) setEditandoNombre(false);
          }}
        >
          <input
            aria-label="Nuevo nombre"
            value={nombre}
            maxLength={60}
            required
            autoFocus
            onChange={(e) => setNombre(e.target.value)}
          />
          <button className="boton" disabled={ocupado}>Guardar nombre</button>
          <button type="button" className="boton secundario" onClick={() => setEditandoNombre(false)}>
            Cancelar
          </button>
        </form>
      ) : (
        <div className="encabezado">
          <h2>Lista de {persona.nombre}</h2>
          {esMia && <div className="acciones">
            <button
              type="button"
              className="enlace"
              onClick={() => {
                setNombre(persona.nombre);
                setEditandoNombre(true);
              }}
            >
              Cambiar nombre
            </button>
            {!plazoCerrado && (
              <button
                type="button"
                className="enlace peligro"
                disabled={ocupado}
                onClick={() => {
                  if (window.confirm('¿Eliminar tu lista y salir del intercambio?')) {
                    guardar({ tipo: 'eliminarParticipante', participanteId });
                  }
                }}
              >
                Eliminar mi lista
              </button>
            )}
          </div>}
        </div>
      )}

      {persona.regalos.length === 0 && formulario !== 'nuevo' && (
        <p className="sin-regalos">
          {persona.nombre} todavía no tiene regalos anotados.
        </p>
      )}

      <ul className="regalos">
        {persona.regalos.map((r) =>
          puedeEditarRegalos && formulario === r.id ? (
            <li key={r.id}>
              <FormularioRegalo
                inicial={r}
                textoBoton="Guardar cambios"
                ocupado={ocupado}
                onCancelar={() => setFormulario(null)}
                onGuardar={async (regalo) => {
                  if (await guardar({ tipo: 'editarRegalo', participanteId, regaloId: r.id, regalo })) {
                    setFormulario(null);
                  }
                }}
              />
            </li>
          ) : (
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
              {puedeEditarRegalos && <div className="acciones">
                <button type="button" className="enlace" onClick={() => setFormulario(r.id)}>
                  Editar
                </button>
                <button
                  type="button"
                  className="enlace peligro"
                  disabled={ocupado}
                  onClick={() => {
                    if (window.confirm(`¿Eliminar "${r.nombre}" de la lista?`)) {
                      guardar({ tipo: 'eliminarRegalo', participanteId, regaloId: r.id });
                    }
                  }}
                >
                  Eliminar
                </button>
              </div>}
            </li>
          ),
        )}
      </ul>

      {!puedeEditarRegalos ? null : formulario === 'nuevo' ? (
        <FormularioRegalo
          inicial={REGALO_VACIO}
          textoBoton="Guardar regalo"
          ocupado={ocupado}
          onCancelar={() => setFormulario(null)}
          onGuardar={async (regalo) => {
            if (await guardar({ tipo: 'agregarRegalo', participanteId, regalo })) setFormulario(null);
          }}
        />
      ) : (
        <button type="button" className="boton agregar" onClick={() => setFormulario('nuevo')}>
          Agregar regalo
        </button>
      )}
    </>
  );
}

function FormularioRegalo({ inicial, textoBoton, ocupado, onGuardar, onCancelar }) {
  const [regalo, setRegalo] = useState({ ...REGALO_VACIO, ...inicial });
  const campo = (clave) => ({
    value: regalo[clave],
    onChange: (e) => setRegalo({ ...regalo, [clave]: e.target.value }),
  });

  return (
    <form
      className="formulario"
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar(regalo);
      }}
    >
      <label className="ancho">
        Regalo
        <input {...campo('nombre')} placeholder="Ej. Audífonos inalámbricos" maxLength={100} required autoFocus />
      </label>
      <label className="ancho">
        Detalles (opcional)
        <textarea {...campo('detalle')} placeholder="Talla, color, marca…" maxLength={300} rows={2} />
      </label>
      <label>
        Precio aproximado en soles (opcional)
        <input {...campo('precio')} inputMode="decimal" placeholder="45.50" maxLength={10} />
      </label>
      <label>
        Enlace de la tienda (opcional)
        <input {...campo('enlace')} inputMode="url" placeholder="https://…" maxLength={1000} />
      </label>
      <div className="botones ancho">
        <button className="boton" disabled={ocupado}>{ocupado ? 'Guardando…' : textoBoton}</button>
        <button type="button" className="boton secundario" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

function Mono() {
  return (
    <svg viewBox="0 0 160 120" className="mono">
      <path d="M76 62 52 116l-2-20-18 6 30-48z" fill="#d99a1e" />
      <path d="M84 62l24 54 2-20 18 6-30-48z" fill="#d99a1e" />
      <path d="M80 56C60 14 14 6 12 34s36 38 68 22z" fill="#f5bc3c" />
      <path d="M80 56c20-42 66-50 68-22s-36 38-68 22z" fill="#f5bc3c" />
      <path d="M72 50C56 30 30 22 28 35s20 20 44 15zM88 50c16-20 42-28 44-15s-20 20-44 15z" fill="#c98a12" />
      <rect x="64" y="40" width="32" height="32" rx="10" fill="#ffd166" />
    </svg>
  );
}
