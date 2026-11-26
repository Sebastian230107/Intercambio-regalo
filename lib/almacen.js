// La "base de datos" es un archivo JSON:
//  - En Vercel: dentro de Vercel Blob (almacenamiento privado).
//  - En tu PC:  en data/regalos.json
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BlobNotFoundError, BlobPreconditionFailedError, get, head, put } from '@vercel/blob';
import { ErrorDeLista } from './acciones';

const ARCHIVO = 'regalos.json';
const RUTA_LOCAL = path.join(process.cwd(), 'data', ARCHIVO);
const vacio = () => ({ participantes: [] });

const hayBlob = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

function revisarConfiguracion() {
  if (!hayBlob() && process.env.VERCEL) {
    throw new ErrorDeLista(
      'Falta conectar el almacenamiento. En Vercel crea un Blob store privado, conéctalo al proyecto y vuelve a desplegar.',
      503,
    );
  }
}

// ---------- Vercel Blob ----------

async function leerBlob() {
  let version;
  try {
    // La versión (etag) se pide antes de leer: si alguien guarda en medio,
    // la escritura falla y se reintenta con los datos nuevos.
    version = (await head(ARCHIVO)).etag;
  } catch (error) {
    if (error instanceof BlobNotFoundError) return { datos: vacio(), version: null };
    throw error;
  }
  const resultado = await get(ARCHIVO, { access: 'private', useCache: false });
  if (!resultado?.stream) throw new Error('No se pudo leer el archivo de la lista.');
  return { datos: await new Response(resultado.stream).json(), version };
}

function escribirBlob(datos, version) {
  return put(ARCHIVO, JSON.stringify(datos, null, 2), {
    access: 'private',
    contentType: 'application/json',
    // Sin versión = el archivo no existía: no debe sobrescribir nada.
    ...(version ? { allowOverwrite: true, ifMatch: version } : { allowOverwrite: false }),
  });
}

async function cambiarBlob(cambio) {
  const INTENTOS = 6;
  for (let intento = 1; ; intento++) {
    const { datos, version } = await leerBlob();
    const nuevos = cambio(datos);
    try {
      await escribirBlob(nuevos, version);
      return nuevos;
    } catch (error) {
      // Otra persona guardó al mismo tiempo (o creó el archivo primero).
      const choque = error instanceof BlobPreconditionFailedError || version === null;
      if (!choque || intento === INTENTOS) throw error;
      await new Promise((listo) => setTimeout(listo, intento * 150 + Math.random() * 150));
    }
  }
}

// ---------- Archivo local ----------

async function leerLocal() {
  try {
    return JSON.parse(await fs.readFile(RUTA_LOCAL, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return vacio();
    throw error;
  }
}

let cola = Promise.resolve();

function cambiarLocal(cambio) {
  // Los cambios se hacen uno por uno para que no se pisen entre sí.
  const turno = cola.then(async () => {
    const nuevos = cambio(await leerLocal());
    await fs.mkdir(path.dirname(RUTA_LOCAL), { recursive: true });
    await fs.writeFile(`${RUTA_LOCAL}.tmp`, JSON.stringify(nuevos, null, 2));
    await fs.rename(`${RUTA_LOCAL}.tmp`, RUTA_LOCAL);
    return nuevos;
  });
  cola = turno.catch(() => {});
  return turno;
}

// ---------- Lo que usa la app ----------

export async function leerLista() {
  revisarConfiguracion();
  return hayBlob() ? (await leerBlob()).datos : leerLocal();
}

export async function cambiarLista(cambio) {
  revisarConfiguracion();
  return hayBlob() ? cambiarBlob(cambio) : cambiarLocal(cambio);
}
