# Intercambio de regalos

Web para anotar la lista de regalos de cada participante. Next.js + un archivo JSON.

## Probar en tu PC
Necesitas Node.js 20.9 o superior.

    npm install
    node scripts/sembrar-local.mjs
    npm run dev

Abre http://localhost:3000. Los datos se guardan en `data/regalos.json` y el script `scripts/sembrar-local.mjs` crea 16 cuentas de prueba (clave `clave123`) y `.env.local` con `SORTEO_SECRETO`.

Para ejecutar la simulación de 10 000 sorteos:

    node scripts/probar-sorteos.mjs

## Desplegar en Vercel
1. Sube esta carpeta a un repositorio de GitHub.
2. En vercel.com: **Add New > Project**, importa el repositorio y pulsa **Deploy**.
3. Dentro del proyecto: pestaña **Storage > Create Storage > Blob**, acceso **Private**,
   ponle un nombre y pulsa **Create** (conectado a Production y Preview).
4. En **Settings > Environment Variables**, agrega `SORTEO_SECRETO` con una cadena larga y aleatoria.
5. Ve a **Deployments** y haz **Redeploy** del último despliegue.

Sin el paso 3 la web muestra el aviso "Falta conectar el almacenamiento".
Sin el paso 4 el sorteo devolverá error 503 al intentar revelar resultados.
Con Blob, el archivo `regalos.json` queda en tu Blob store y los datos se
mantienen aunque vuelvas a desplegar.

Sin GitHub: ejecuta `npx vercel` en la carpeta, haz los pasos 3 y 4, y luego `npx vercel --prod`.

## Reglas del sorteo y permisos
- Mínimo **16** participantes y máximo **17** (`MINIMO` y `MAXIMO` en `lib/sorteo.js`). El registro 18 se rechaza.
- El sorteo se habilita al llegar a **16** cuentas registradas. Antes de 16 el servidor rechaza cualquier intento.
- Cada participante sortea cuando quiera ingresando su clave (con bloqueo de 15 minutos tras 5 intentos errados) y siempre ve el mismo resultado.
- Los resultados se identifican por `id` de cuenta, se cifran con `AES-256-GCM` usando `SORTEO_SECRETO` + la cuenta y clave del participante, y nunca se envían resultados ajenos al navegador.
- La persona **17** puede registrarse tarde si al menos una de las 16 aún no sorteó; si las 16 ya sortearon, el servidor rechaza el registro y el organizador debe reiniciar el sorteo.
- Desde el primer sorteo no se pueden eliminar cuentas (sí cambiar el nombre).
- Cada participante crea su lista con su nombre y una clave (mínimo 6 caracteres). Todos pueden **ver** las listas; cada uno solo puede **editar la suya**.

## Archivos
- `app/page.js`: pantalla principal, listas y tarjeta de estado del sorteo
- `app/amigo-secreto.js`: modal del sorteo, animaciones y revelación de regalos
- `app/globals.css`: colores, estilo y animaciones
- `app/api/lista/route.js`: lectura, guardado y endpoint del sorteo
- `lib/sorteo.js`: límites (`MINIMO`, `MAXIMO`), cifrado con `SORTEO_SECRETO` y algoritmo del sorteo
- `lib/acciones.js`: validaciones y permisos
- `lib/seguridad.js`: claves y sesiones
- `lib/almacen.js`: almacenamiento del JSON
- `scripts/probar-sorteos.mjs`: prueba de 10 000 simulaciones del sorteo
- `scripts/sembrar-local.mjs`: generador de 16 cuentas de prueba locales
