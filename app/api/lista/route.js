import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  aplicarAccion,
  eliminarCuentaDuplicada,
  ErrorDeLista,
  intentarIngreso,
  leerCredenciales,
  registrarParticipante,
  verificarClaveParaSorteo,
} from '../../../lib/acciones';
import { cambiarLista, leerLista } from '../../../lib/almacen';
import { parsearFechaLima, verificarClaveOrganizador } from '../../../lib/fecha';
import {
  claveCorrecta,
  COOKIE,
  crearSesion,
  DURACION_SEGUNDOS,
  duenoDeSesion,
  protegerClave,
} from '../../../lib/seguridad';
import { MAXIMO, MINIMO, sortearPara } from '../../../lib/sorteo';

export const dynamic = 'force-dynamic';

const sinCache = { 'Cache-Control': 'no-store' };

// Al navegador solo se envían estos campos: nunca las claves ni resultados ajenos.
function responder(datos, yo, sesionNueva, extra = {}) {
  const cantidad = datos.participantes.length;
  const respuesta = NextResponse.json(
    {
      yo: yo?.id ?? null,
      participantes: datos.participantes.map(({ id, nombre, regalos }) => ({ id, nombre, regalos })),
      sorteo: {
        cantidad,
        minimo: MINIMO,
        maximo: MAXIMO,
        habilitado: cantidad >= MINIMO,
      },
      fechaLimite: datos.fechaLimite ?? null,
      ahora: Date.now(),
      ...extra,
    },
    { headers: sinCache },
  );
  if (sesionNueva !== undefined) {
    respuesta.cookies.set(COOKIE, sesionNueva, {
      httpOnly: true,
      sameSite: 'lax',
      secure: Boolean(process.env.VERCEL),
      path: '/',
      maxAge: sesionNueva ? DURACION_SEGUNDOS : 0,
    });
  }
  return respuesta;
}

function responderError(error) {
  if (error instanceof ErrorDeLista) {
    return NextResponse.json({ error: error.message }, { status: error.estado, headers: sinCache });
  }
  console.error(error);
  return NextResponse.json(
    { error: 'No se pudo acceder a la lista. Intenta otra vez en unos segundos.' },
    { status: 500, headers: sinCache },
  );
}

export async function GET(request) {
  try {
    const datos = await leerLista();
    return responder(datos, duenoDeSesion(datos, request.cookies.get(COOKIE)?.value));
  } catch (error) {
    return responderError(error);
  }
}

export async function POST(request) {
  try {
    const cuerpo = await request.json().catch(() => null);
    if (!cuerpo) throw new ErrorDeLista('La solicitud no es válida.');
    const sesion = request.cookies.get(COOKIE)?.value;
    const id = randomUUID();

    if (cuerpo.tipo === 'salir') return responder(await leerLista(), null, '');

    if (cuerpo.tipo === 'registrar') {
      const { nombre, clave } = leerCredenciales(cuerpo);
      const protegida = protegerClave(clave);
      let persona;
      const datos = await cambiarLista((actuales) => {
        persona = registrarParticipante(actuales, { id, nombre, clave: protegida });
        return actuales;
      });
      return responder(datos, persona, crearSesion(persona));
    }

    if (cuerpo.tipo === 'entrar') {
      const { nombre, clave } = leerCredenciales(cuerpo);
      let intento;
      // El resultado solo se informa después de guardar el intento.
      const datos = await cambiarLista((actuales) => {
        intento = intentarIngreso(actuales, nombre, (guardada) => claveCorrecta(clave, guardada));
        return actuales;
      });
      if (intento.bloqueado) {
        throw new ErrorDeLista('Demasiados intentos. Espera 15 minutos y vuelve a probar.', 429);
      }
      if (!intento.persona) throw new ErrorDeLista('Nombre o clave incorrectos.', 401);
      return responder(datos, intento.persona, crearSesion(intento.persona));
    }

    if (cuerpo.tipo === 'guardarFechaLimite') {
      let auth;
      const datos = await cambiarLista((actuales) => {
        auth = verificarClaveOrganizador(actuales, cuerpo.clave);
        if (auth.ok) {
          if (!cuerpo.fechaLimite) {
            delete actuales.fechaLimite;
          } else {
            actuales.fechaLimite = parsearFechaLima(cuerpo.fechaLimite);
          }
        }
        return actuales;
      });
      if (auth.bloqueado) {
        throw new ErrorDeLista('Demasiados intentos. Espera 15 minutos y vuelve a probar.', 429);
      }
      if (!auth.ok) {
        throw new ErrorDeLista('Clave de organizador incorrecta.', 401);
      }
      return responder(datos, duenoDeSesion(datos, sesion));
    }

    if (cuerpo.tipo === 'eliminarDuplicado') {
      let auth;
      // Un intento con clave errada se guarda, para que funcione el bloqueo.
      const datos = await cambiarLista((actuales) => {
        auth = verificarClaveOrganizador(actuales, cuerpo.clave);
        if (auth.ok) eliminarCuentaDuplicada(actuales, cuerpo.participanteId);
        return actuales;
      });
      if (auth.bloqueado) {
        throw new ErrorDeLista('Demasiados intentos. Espera 15 minutos y vuelve a probar.', 429);
      }
      if (!auth.ok) {
        throw new ErrorDeLista('Clave de organizador incorrecta.', 401);
      }
      return responder(datos, duenoDeSesion(datos, sesion));
    }

    if (cuerpo.tipo === 'sortear') {
      let intento;
      let resultado;
      let yo;
      const datos = await cambiarLista((actuales) => {
        yo = duenoDeSesion(actuales, sesion);
        intento = verificarClaveParaSorteo(yo, cuerpo.clave, (guardada) =>
          claveCorrecta(cuerpo.clave, guardada),
        );
        if (intento.persona) {
          resultado = sortearPara(actuales, yo);
        }
        return actuales;
      });
      if (intento.bloqueado) {
        throw new ErrorDeLista('Demasiados intentos. Espera 15 minutos y vuelve a probar.', 429);
      }
      if (!intento.persona) throw new ErrorDeLista('Clave incorrecta.', 401);
      const amigo = datos.participantes.find((p) => p.id === resultado.receptorId);
      if (!amigo) throw new ErrorDeLista('No se encontró al participante asignado.', 500);
      return responder(datos, yo, undefined, {
        amigo: { id: amigo.id, nombre: amigo.nombre, regalos: amigo.regalos },
        primeraVez: resultado.primeraVez,
      });
    }

    let yo;
    const datos = await cambiarLista((actuales) => {
      yo = duenoDeSesion(actuales, sesion);
      return aplicarAccion(actuales, yo, { ...cuerpo, id });
    });
    const sigue = datos.participantes.some((p) => p.id === yo.id);
    return sigue ? responder(datos, yo) : responder(datos, null, '');
  } catch (error) {
    return responderError(error);
  }
}
