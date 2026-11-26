import { createHash, timingSafeEqual } from 'node:crypto';
import { ErrorDeLista } from './acciones.js';

export const ZONA_LIMA = 'America/Lima';

function sha256(texto) {
  return createHash('sha256').update(String(texto), 'utf8').digest();
}

export function plazoVencido(datos, ahora = Date.now()) {
  if (!datos?.fechaLimite) return false;
  const ms = Date.parse(datos.fechaLimite);
  return Number.isFinite(ms) && ms <= ahora;
}

export function parsearFechaLima(valor) {
  if (typeof valor !== 'string') {
    throw new ErrorDeLista('La fecha límite no es válida.');
  }
  const limpio = valor.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(limpio);
  if (!match) {
    throw new ErrorDeLista('Usa el formato de fecha y hora válido (AAAA-MM-DDTHH:MM).');
  }
  const [, anio, mes, dia, hora, minuto] = match;
  const ms = Date.parse(`${anio}-${mes}-${dia}T${hora}:${minuto}:00-05:00`);
  if (!Number.isFinite(ms)) {
    throw new ErrorDeLista('La fecha indicada no existe.');
  }

  // Verificar que los componentes coincidan en America/Lima (evita 31 de febrero, etc.)
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_LIMA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const mapa = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  if (
    mapa.year !== anio ||
    mapa.month !== mes ||
    mapa.day !== dia ||
    mapa.hour !== hora ||
    mapa.minute !== minuto
  ) {
    throw new ErrorDeLista('La fecha indicada no es válida.');
  }

  if (ms <= Date.now()) {
    throw new ErrorDeLista('La fecha límite debe ser posterior a la hora actual de Lima.');
  }
  return new Date(ms).toISOString();
}

export function verificarClaveOrganizador(datos, clave) {
  const esperada = process.env.CLAVE_ORGANIZADOR;
  if (!esperada || esperada.length < 12) {
    throw new ErrorDeLista(
      'Falta configurar CLAVE_ORGANIZADOR (mínimo 12 caracteres) en el servidor.',
      503,
    );
  }
  if (typeof clave !== 'string' || !clave) {
    throw new ErrorDeLista('Escribe la clave del organizador.', 401);
  }

  const ahora = Date.now();
  const registro =
    datos.organizador && typeof datos.organizador === 'object' ? { ...datos.organizador } : {};
  registro.ultimoIntento = ahora;

  if (registro.bloqueadoHasta > ahora) {
    datos.organizador = registro;
    return { bloqueado: true };
  }

  const coincide = timingSafeEqual(sha256(clave), sha256(esperada));
  if (coincide) {
    delete datos.organizador;
    return { ok: true };
  }

  registro.intentos = (registro.intentos || 0) + 1;
  if (registro.intentos >= 5) {
    registro.bloqueadoHasta = ahora + 15 * 60 * 1000;
    delete registro.intentos;
    datos.organizador = registro;
    return { bloqueado: true };
  }

  datos.organizador = registro;
  return { ok: false };
}

