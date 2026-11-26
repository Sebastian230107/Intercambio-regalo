'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const REGALO_VACIO = { nombre: '', detalle: '', precio: '', enlace: '' };

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
  const [elegidoId, setElegidoId] = useState(null);
  const [yoId, setYoId] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const cambios = useRef(0);
  const panel = useRef(null);

  const cargar = useCallback(async () => {
    const antes = cambios.current;
    try {
      const datos = await pedir();
      // Si se guardó algo mientras tanto, esta lectura ya es antigua.
      if (antes !== cambios.current) return;
      setParticipantes(datos.participantes);
      setYoId(datos.yo);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    cargar();
    // Al volver a la pestaña se traen los cambios de los demás.
    window.addEventListener('focus', cargar);
    return () => window.removeEventListener('focus', cargar);
  }, [cargar]);

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
      setParticipantes(datos.participantes);
      setYoId(datos.yo);
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
        )}
      </main>
    </>
  );
}

function Acceso({ ocupado, onEnviar }) {
  const [tipo, setTipo] = useState('registrar');
  const [nombre, setNombre] = useState('');
  const [clave, setClave] = useState('');
  const esNuevo = tipo === 'registrar';

  return (
    <div className="acceso">
      <div className="pestanas">
        <button type="button" aria-pressed={esNuevo} onClick={() => setTipo('registrar')}>
          Soy nuevo
        </button>
        <button type="button" aria-pressed={!esNuevo} onClick={() => setTipo('entrar')}>
          Ya tengo lista
        </button>
      </div>
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

function Lista({ persona, esMia, ocupado, guardar }) {
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombre, setNombre] = useState(persona.nombre);
  // null = formulario cerrado, 'nuevo' = agregando, o el id del regalo que se edita
  const [formulario, setFormulario] = useState(null);
  const participanteId = persona.id;

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
          formulario === r.id ? (
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
              {esMia && <div className="acciones">
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

      {!esMia ? null : formulario === 'nuevo' ? (
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
