import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt } from 'node:crypto';
import { ErrorDeLista } from './acciones.js';

export const MINIMO = 16;
export const MAXIMO = 17;

function obtenerSecreto() {
  const secreto = process.env.SORTEO_SECRETO;
  if (!secreto || !secreto.trim()) {
    throw new ErrorDeLista(
      'Falta configurar la variable SORTEO_SECRETO en el servidor para realizar el sorteo.',
      503,
    );
  }
  return secreto;
}

function derivarClave(secreto, persona) {
  return createHmac('sha256', secreto).update(`${persona.id}:${persona.clave.hash}`).digest();
}

function esRegistroValido(registro) {
  return Boolean(
    registro &&
      typeof registro === 'object' &&
      !Array.isArray(registro) &&
      registro.v === 2 &&
      typeof registro.iv === 'string' &&
      typeof registro.tag === 'string' &&
      typeof registro.dato === 'string',
  );
}

export function cifrarResultado(secreto, persona, receptorId) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', derivarClave(secreto, persona), iv);
  cipher.setAAD(Buffer.from(persona.id, 'utf8'));
  const dato = Buffer.concat([cipher.update(receptorId, 'utf8'), cipher.final()]).toString('base64');
  const tag = cipher.getAuthTag().toString('base64');
  return { v: 2, iv: iv.toString('base64'), tag, dato };
}

export function descifrarResultado(secreto, persona, registro) {
  if (!esRegistroValido(registro) || !persona?.clave?.hash) return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      derivarClave(secreto, persona),
      Buffer.from(registro.iv, 'base64'),
    );
    decipher.setAAD(Buffer.from(persona.id, 'utf8'));
    decipher.setAuthTag(Buffer.from(registro.tag, 'base64'));
    const plano = Buffer.concat([
      decipher.update(Buffer.from(registro.dato, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return plano || null;
  } catch {
    return null;
  }
}

export function contarSorteos(datos) {
  if (!datos?.sorteo || typeof datos.sorteo !== 'object' || Array.isArray(datos.sorteo)) return 0;
  const ids = new Set((datos.participantes || []).map((p) => p.id));
  let total = 0;
  for (const [giverId, registro] of Object.entries(datos.sorteo)) {
    if (ids.has(giverId) && esRegistroValido(registro)) total++;
  }
  return total;
}

function leerSorteosValidos(datos, secreto) {
  const porId = new Map(datos.participantes.map((p) => [p.id, p]));
  const asignados = new Map();
  if (!datos.sorteo || typeof datos.sorteo !== 'object' || Array.isArray(datos.sorteo)) {
    return asignados;
  }
  for (const [giverId, registro] of Object.entries(datos.sorteo)) {
    const giver = porId.get(giverId);
    if (!giver) continue;
    const receptorId = descifrarResultado(secreto, giver, registro);
    if (receptorId && receptorId !== giverId && porId.has(receptorId)) {
      asignados.set(giverId, receptorId);
    }
  }
  return asignados;
}

export function sortearPara(datos, yo) {
  if (!yo) {
    throw new ErrorDeLista('Tu sesión terminó. Vuelve a entrar con tu clave.', 401);
  }
  if (datos.participantes.length < MINIMO) {
    throw new ErrorDeLista(
      `El sorteo se habilita cuando haya al menos ${MINIMO} participantes.`,
      400,
    );
  }

  const secreto = obtenerSecreto();
  const asignados = leerSorteosValidos(datos, secreto);

  if (asignados.has(yo.id)) {
    return { receptorId: asignados.get(yo.id), primeraVez: false };
  }

  const receptoresUsados = new Set(asignados.values());
  const pendientes = datos.participantes.filter((p) => p.id !== yo.id && !asignados.has(p.id));
  const disponibles = datos.participantes.filter(
    (p) => p.id !== yo.id && !receptoresUsados.has(p.id),
  );

  let candidatos = disponibles;
  if (pendientes.length === 1 && disponibles.length === 2) {
    const otroId = pendientes[0].id;
    if (disponibles.some((d) => d.id === otroId)) {
      candidatos = disponibles.filter((d) => d.id === otroId);
    }
  }

  if (candidatos.length === 0) {
    throw new ErrorDeLista('No quedan opciones válidas para completar el sorteo.', 409);
  }

  const elegido = candidatos[randomInt(candidatos.length)];
  const sorteoActual =
    datos.sorteo && typeof datos.sorteo === 'object' && !Array.isArray(datos.sorteo)
      ? { ...datos.sorteo }
      : {};
  sorteoActual[yo.id] = cifrarResultado(secreto, yo, elegido.id);
  datos.sorteo = sorteoActual;

  return { receptorId: elegido.id, primeraVez: true };
}
