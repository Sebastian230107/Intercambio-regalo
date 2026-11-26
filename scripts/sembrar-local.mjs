import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { protegerClave } from '../lib/seguridad.js';

if (process.env.VERCEL || process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) {
  console.error('Este script es solo para desarrollo local y nunca debe tocar Vercel Blob.');
  process.exit(1);
}

const raiz = process.cwd();
const rutaJson = path.join(raiz, 'data', 'regalos.json');
const rutaEnv = path.join(raiz, '.env.local');

const nombres = [
  'Ana', 'Bruno', 'Camila', 'Diego', 'Elena', 'Fabian', 'Gabriela', 'Hugo',
  'Irene', 'Javier', 'Karla', 'Luis', 'Mariana', 'Nicolas', 'Olga', 'Pablo',
];

const participantes = nombres.map((nombre, idx) => ({
  id: randomUUID(),
  nombre,
  clave: protegerClave('clave123'),
  regalos: [
    {
      id: randomUUID(),
      nombre: `Regalo sugerido ${idx + 1}`,
      detalle: 'Color favorito o sorpresa',
      precio: '50.00',
      enlace: '',
    },
  ],
}));

await fs.mkdir(path.dirname(rutaJson), { recursive: true });
await fs.writeFile(rutaJson, JSON.stringify({ participantes }, null, 2));
console.log(`Generadas ${participantes.length} cuentas de prueba en ${rutaJson} (clave: clave123).`);

try {
  await fs.access(rutaEnv);
  console.log('.env.local ya existe; no se sobrescribió.');
} catch {
  await fs.writeFile(rutaEnv, 'SORTEO_SECRETO=desarrollo-local-secreto-no-usar-en-produccion\n');
  console.log('Creado .env.local con SORTEO_SECRETO para desarrollo local.');
}

