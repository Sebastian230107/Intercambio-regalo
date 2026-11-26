import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  aplicarAccion,
  ErrorDeLista,
  intentarIngreso,
  leerCredenciales,
  registrarParticipante,
} from '../../../lib/acciones';
import { cambiarLista, leerLista } from '../../../lib/almacen';
import {
  claveCorrecta,
  COOKIE,
  crearSesion,
  DURACION_SEGUNDOS,
  duenoDeSesion,
  protegerClave,
} from '../../../lib/seguridad';

export const dynamic = 'force-dynamic';

const sinCache = { 'Cache-Control': 'no-store' };

// Al navegador solo se envían estos campos: nunca las claves.
function responder(datos, yo, sesionNueva) {
  const respuesta = NextResponse.json(
    {
      yo: yo?.id ?? null,
      participantes: datos.participantes.map(({ id, nombre, regalos }) => ({ id, nombre, regalos })),
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
