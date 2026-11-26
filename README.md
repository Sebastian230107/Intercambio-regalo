# Intercambio de regalos

Web para anotar la lista de regalos de cada participante. Next.js + un archivo JSON.

## Probar en tu PC
Necesitas Node.js 20.9 o superior.

    npm install
    npm run dev

Abre http://localhost:3000. Los datos se guardan en `data/regalos.json`.

## Desplegar en Vercel
1. Sube esta carpeta a un repositorio de GitHub.
2. En vercel.com: **Add New > Project**, importa el repositorio y pulsa **Deploy**.
3. Dentro del proyecto: pestaña **Storage > Create Storage > Blob**, acceso **Private**,
   ponle un nombre y pulsa **Create** (conectado a Production y Preview).
4. Ve a **Deployments** y haz **Redeploy** del último despliegue.

Sin el paso 3 la web muestra el aviso "Falta conectar el almacenamiento".
Con Blob, el archivo `regalos.json` queda en tu Blob store y los datos se
mantienen aunque vuelvas a desplegar.

Sin GitHub: ejecuta `npx vercel` en la carpeta, haz el paso 3 y luego `npx vercel --prod`.

## Permisos
- Cada participante crea su lista con su nombre y una clave (mínimo 6 caracteres).
- Todos pueden **ver** las listas; cada uno solo puede **editar o eliminar la suya**.
- Cualquiera con el enlace puede ver las listas y registrarse.
- Las claves se guardan cifradas (hash). Tras 5 intentos errados se bloquea 15 minutos.
- No hay recuperación de clave.

Si usaste la versión anterior, borra `data/regalos.json` (o el de Blob) y empieza de cero.

## Archivos
- `app/page.js`: pantalla
- `app/globals.css`: colores y estilo
- `app/api/lista/route.js`: lectura y guardado
- `lib/acciones.js`: validaciones y permisos
- `lib/seguridad.js`: claves y sesiones
- `lib/almacen.js`: almacenamiento del JSON
