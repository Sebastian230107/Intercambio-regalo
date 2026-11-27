// Reglas para cambiar la lista. Cada acción recibe los datos y los modifica.
import { plazoVencido } from './fecha.js';
import { contarSorteos, MAXIMO, MINIMO } from './sorteo.js';

export class ErrorDeLista extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

const MAX_REGALOS = 50;

function texto(valor, maximo) {
  return typeof valor === 'string' ? valor.trim().slice(0, maximo) : '';
}

function nombreObligatorio(valor, maximo, mensaje) {
  const limpio = texto(valor, maximo);
  if (!limpio) throw new ErrorDeLista(mensaje);
  return limpio;
}

function buscar(lista, id, mensaje) {
  const encontrado = lista.find((item) => item.id === id);
  if (!encontrado) throw new ErrorDeLista(mensaje, 404);
  return encontrado;
}

function revisarNombreRepetido(datos, nombre, idPropio) {
  const repetido = datos.participantes.some(
    (p) => p.id !== idPropio && mismoNombre(p.nombre, nombre),
  );
  if (repetido) throw new ErrorDeLista(`Ya hay un participante llamado ${nombre}.`);
}

function leerRegalo(entrada = {}) {
  const regalo = {
    nombre: nombreObligatorio(entrada.nombre, 100, 'Escribe el nombre del regalo.'),
    detalle: texto(entrada.detalle, 300),
    precio: texto(String(entrada.precio ?? ''), 10).replace(',', '.'),
    enlace: texto(entrada.enlace, 1000),
  };
  if (regalo.precio && !/^\d+(\.\d{1,2})?$/.test(regalo.precio)) {
    throw new ErrorDeLista('El precio debe ser un número, por ejemplo 45 o 45.50.');
  }
  if (regalo.enlace) {
    // Acepta "tienda.com/producto" y le agrega https://
    if (!/^[a-z][a-z0-9+.-]*:/i.test(regalo.enlace)) regalo.enlace = `https://${regalo.enlace}`;
    let url;
    try {
      url = new URL(regalo.enlace);
    } catch {
      throw new ErrorDeLista('El enlace no es válido. Copia la dirección completa de la página.');
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new ErrorDeLista('El enlace debe empezar con http:// o https://');
    }
  }
  return regalo;
}

const mismoNombre = (a, b) => a.toLocaleLowerCase('es') === b.toLocaleLowerCase('es');

// ---------- Crear lista e ingresar ----------

export function leerCredenciales({ nombre, clave } = {}) {
  const limpio = nombreObligatorio(nombre, 60, 'Escribe tu nombre.');
  if (typeof clave !== 'string' || clave.length < 6 || clave.length > 64) {
    throw new ErrorDeLista('La clave debe tener entre 6 y 64 caracteres.');
  }
  return { nombre: limpio, clave };
}

export function registrarParticipante(datos, { id, nombre, clave }) {
  if (datos.participantes.length >= MAXIMO) {
    throw new ErrorDeLista(`El intercambio admite como máximo ${MAXIMO} participantes.`);
  }
  if (
    datos.participantes.length >= MINIMO &&
    contarSorteos(datos) >= datos.participantes.length
  ) {
    throw new ErrorDeLista(
      'El sorteo ya se completó con los 16 participantes. El organizador debe reiniciar el sorteo para agregar a alguien más.',
      409,
    );
  }
  revisarNombreRepetido(datos, nombre);
  const persona = { id, nombre, clave, regalos: [] };
  datos.participantes.push(persona);
  return persona;
}

function validarClaveConBloqueo(persona, esCorrecta) {
  const ahora = Date.now();
  persona.ultimoIntento = ahora;
  if (persona.bloqueadoHasta > ahora) return { bloqueado: true };
  if (esCorrecta(persona.clave)) {
    delete persona.intentos;
    delete persona.bloqueadoHasta;
    return { persona };
  }
  persona.intentos = (persona.intentos || 0) + 1;
  if (persona.intentos >= 5) {
    persona.bloqueadoHasta = ahora + 15 * 60 * 1000;
    delete persona.intentos;
    return { bloqueado: true };
  }
  return {};
}

// Anota el intento en la persona. Tras 5 claves erradas se bloquea 15 minutos.
export function intentarIngreso(datos, nombre, esCorrecta) {
  const persona = datos.participantes.find((p) => mismoNombre(p.nombre, nombre));
  if (!persona) throw new ErrorDeLista('Nombre o clave incorrectos.', 401);
  return validarClaveConBloqueo(persona, esCorrecta);
}

export function verificarClaveParaSorteo(persona, clave, esCorrecta) {
  if (!persona) throw new ErrorDeLista('Tu sesión terminó. Vuelve a entrar con tu clave.', 401);
  if (typeof clave !== 'string' || clave.length < 6 || clave.length > 64) {
    throw new ErrorDeLista('Escribe tu clave para ver tu amig@ secret@.');
  }
  return validarClaveConBloqueo(persona, esCorrecta);
}

// ---------- Organizador ----------
// Solo se llama después de comprobar la clave del organizador. Borra una cuenta
// completa (por ejemplo, un duplicado). Nunca edita la lista de nadie.
export function eliminarCuentaDuplicada(datos, participanteId) {
  if (contarSorteos(datos) > 0) {
    throw new ErrorDeLista('No se puede eliminar cuentas porque el sorteo ya comenzó.', 409);
  }
  const persona = buscar(datos.participantes, participanteId, 'Esa cuenta ya no existe.');
  datos.participantes = datos.participantes.filter((p) => p.id !== persona.id);
}

// ---------- Cambios en la lista propia ----------
// "yo" es el dueño de la sesión: ninguna acción puede tocar a otra persona.

const acciones = {
  editarParticipante(datos, yo, { nombre }) {
    const limpio = nombreObligatorio(nombre, 60, 'Escribe tu nombre.');
    revisarNombreRepetido(datos, limpio, yo.id);
    yo.nombre = limpio;
  },

  eliminarParticipante(datos, yo) {
    if (plazoVencido(datos)) {
      throw new ErrorDeLista('El plazo para anotar regalos terminó.', 403);
    }
    if (contarSorteos(datos) > 0) {
      throw new ErrorDeLista('No se puede eliminar tu cuenta porque el sorteo ya comenzó.', 409);
    }
    datos.participantes = datos.participantes.filter((p) => p.id !== yo.id);
  },

  agregarRegalo(datos, yo, { id, regalo }) {
    if (plazoVencido(datos)) {
      throw new ErrorDeLista('El plazo para anotar regalos terminó.', 403);
    }
    if (yo.regalos.length >= MAX_REGALOS) {
      throw new ErrorDeLista(`Cada lista admite hasta ${MAX_REGALOS} regalos.`);
    }
    yo.regalos.push({ id, ...leerRegalo(regalo) });
  },

  editarRegalo(datos, yo, { regaloId, regalo }) {
    if (plazoVencido(datos)) {
      throw new ErrorDeLista('El plazo para anotar regalos terminó.', 403);
    }
    const actual = buscar(yo.regalos, regaloId, 'Ese regalo ya no existe.');
    Object.assign(actual, leerRegalo(regalo));
  },

  eliminarRegalo(datos, yo, { regaloId }) {
    if (plazoVencido(datos)) {
      throw new ErrorDeLista('El plazo para anotar regalos terminó.', 403);
    }
    yo.regalos = yo.regalos.filter((r) => r.id !== regaloId);
  },
};

export function aplicarAccion(datos, yo, cuerpo) {
  if (!Object.hasOwn(acciones, cuerpo.tipo)) throw new ErrorDeLista('Acción no reconocida.');
  if (!yo) throw new ErrorDeLista('Tu sesión terminó. Vuelve a entrar con tu clave.', 401);
  if (cuerpo.participanteId !== yo.id) throw new ErrorDeLista('Solo puedes editar tu propia lista.', 403);
  acciones[cuerpo.tipo](datos, yo, cuerpo);
  return datos;
}
