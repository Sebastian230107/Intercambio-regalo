// Claves y sesiones. La clave nunca se guarda como texto: solo su huella (hash).
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'sesion';
export const DURACION_SEGUNDOS = 60 * 60 * 24 * 60; // 60 días

const iguales = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const calcular = (clave, sal) => scryptSync(clave, sal, 32).toString('hex');

export function protegerClave(clave) {
  const sal = randomBytes(16).toString('hex');
  return { sal, hash: calcular(clave, sal) };
}

export function claveCorrecta(clave, guardada) {
  return Boolean(guardada) && iguales(calcular(clave, guardada.sal), guardada.hash);
}

// La sesión va firmada con la huella de la clave, que solo conoce el servidor.
const firmar = (persona, vence) =>
  createHmac('sha256', persona.clave.hash).update(`${persona.id}.${vence}`).digest('hex');

export function crearSesion(persona) {
  const vence = Date.now() + DURACION_SEGUNDOS * 1000;
  return `${persona.id}.${vence}.${firmar(persona, vence)}`;
}

// Devuelve al participante dueño de la sesión, o null si no es válida.
export function duenoDeSesion(datos, sesion = '') {
  const [id, vence, firma] = sesion.split('.');
  const persona = datos.participantes.find((p) => p.id === id);
  if (!persona?.clave || !firma || !(Number(vence) > Date.now())) return null;
  return iguales(firma, firmar(persona, Number(vence))) ? persona : null;
}
