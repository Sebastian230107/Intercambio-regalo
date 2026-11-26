import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import {
  aplicarAccion,
  registrarParticipante,
} from '../lib/acciones.js';
import { protegerClave } from '../lib/seguridad.js';
import {
  descifrarResultado,
  MAXIMO,
  MINIMO,
  sortearPara,
} from '../lib/sorteo.js';

process.env.SORTEO_SECRETO = 'secreto-de-prueba-para-simulacion-10000';

assert.equal(MINIMO, 16, 'MINIMO debe ser 16');
assert.equal(MAXIMO, 17, 'MAXIMO debe ser 17');

// Pre-calculamos una sola vez un hash de clave válido para acelerar la simulación de 10 000 sorteos.
const CLAVE_DEMO = protegerClave('clave1234');

function crearParticipante(i) {
  return {
    id: `p-${i}-${randomUUID().slice(0, 8)}`,
    nombre: `Persona ${i}`,
    clave: CLAVE_DEMO,
  };
}

function mezclar(arr) {
  const copia = [...arr];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// 1. Verificar rechazo antes de 16, rechazo de 18, bloqueo de eliminación tras primer sorteo,
//    cambio de nombre permitido, cifrado atado a cuenta+clave e ignorar formato anterior.
{
  const datos = { participantes: [] };
  for (let i = 1; i <= 15; i++) {
    registrarParticipante(datos, crearParticipante(i));
  }
  assert.throws(() => sortearPara(datos, datos.participantes[0]), /al menos 16/);

  registrarParticipante(datos, crearParticipante(16));
  // Ignorar resultados de formato anterior
  datos.sorteo = {
    [datos.participantes[0].id]: 'formato-viejo-texto',
    'Persona 1': 'Persona 2',
  };

  const primero = sortearPara(datos, datos.participantes[0]);
  assert.equal(primero.primeraVez, true);
  assert.notEqual(primero.receptorId, datos.participantes[0].id);

  // Re-sortear devuelve exactamente el mismo resultado y primeraVez: false
  const repetido = sortearPara(datos, datos.participantes[0]);
  assert.equal(repetido.primeraVez, false);
  assert.equal(repetido.receptorId, primero.receptorId);

  // Cifrado atado a cuenta y clave
  const registro = datos.sorteo[datos.participantes[0].id];
  assert.equal(
    descifrarResultado(process.env.SORTEO_SECRETO, datos.participantes[1], registro),
    null,
    'No debe descifrarse con otra cuenta',
  );
  assert.equal(
    descifrarResultado(
      process.env.SORTEO_SECRETO,
      { ...datos.participantes[0], clave: protegerClave('otra-clave') },
      registro,
    ),
    null,
    'No debe descifrarse si cambia el hash de la clave',
  );

  // Desde el primer sorteo no se puede eliminar cuenta, pero sí cambiar nombre
  assert.throws(
    () =>
      aplicarAccion(datos, datos.participantes[0], {
        tipo: 'eliminarParticipante',
        participanteId: datos.participantes[0].id,
      }),
    /ya comenzó/,
  );
  aplicarAccion(datos, datos.participantes[0], {
    tipo: 'editarParticipante',
    participanteId: datos.participantes[0].id,
    nombre: 'Persona 1 Editada',
  });
  assert.equal(datos.participantes[0].nombre, 'Persona 1 Editada');

  // Agregar 17 cuando faltan 15 por sortear sí se permite, y 18 se rechaza
  registrarParticipante(datos, crearParticipante(17));
  assert.throws(() => registrarParticipante(datos, crearParticipante(18)), /máximo 17/);

  // Si los 16 ya sortearon, rechazar al 17
  const datosLlenos = { participantes: [] };
  for (let i = 1; i <= 16; i++) {
    registrarParticipante(datosLlenos, crearParticipante(i));
  }
  for (const p of datosLlenos.participantes) {
    sortearPara(datosLlenos, p);
  }
  assert.throws(
    () => registrarParticipante(datosLlenos, crearParticipante(17)),
    /organizador debe reiniciar/,
  );
}

// 2. Simular 10 000 sorteos con 16 personas y la 17 entrando en un momento al azar
const SIMULACIONES = 10_000;
let con17 = 0;
let solo16 = 0;

for (let s = 0; s < SIMULACIONES; s++) {
  const datos = { participantes: [] };
  for (let i = 1; i <= 16; i++) {
    registrarParticipante(datos, crearParticipante(i));
  }

  const orden16 = mezclar(datos.participantes);
  // Momento al azar para intentar entrar la persona 17: entre 0 y 16 sorteos ya realizados.
  const momento17 = randomInt(17);
  const resultados = new Map();

  for (let k = 0; k < 16; k++) {
    if (k === momento17) {
      registrarParticipante(datos, crearParticipante(17));
    }
    const p = orden16[k];
    const res = sortearPara(datos, p);
    assert.equal(res.primeraVez, true);
    assert.notEqual(res.receptorId, p.id);
    if (resultados.has(p.id)) {
      assert.equal(res.receptorId, resultados.get(p.id));
    }
    resultados.set(p.id, res.receptorId);
  }

  if (momento17 === 16) {
    // Las 16 ya sortearon: el registro 17 debe ser rechazado
    assert.throws(
      () => registrarParticipante(datos, crearParticipante(17)),
      /organizador debe reiniciar/,
    );
    solo16++;
  } else {
    // La persona 17 entró antes de que terminen las 16: ahora sortea al final (o en cualquier orden)
    const p17 = datos.participantes[16];
    const res17 = sortearPara(datos, p17);
    assert.notEqual(res17.receptorId, p17.id);
    resultados.set(p17.id, res17.receptorId);
    con17++;
  }

  // Verificar biyección perfecta (derangement)
  const total = datos.participantes.length;
  assert.equal(resultados.size, total);
  const receptoresUnicos = new Set(resultados.values());
  assert.equal(receptoresUnicos.size, total, 'Nadie puede recibir dos veces');
  for (const p of datos.participantes) {
    assert.ok(receptoresUnicos.has(p.id), 'Todos deben recibir un regalo');
    assert.notEqual(resultados.get(p.id), p.id, 'Nadie se saca a sí mismo');
  }
}

console.log(
  `OK: ${SIMULACIONES} simulaciones completadas sin errores (${con17} con 17 participantes, ${solo16} cerradas en 16).`,
);

