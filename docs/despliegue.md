# Publicar Xpected en internet (versión completa, con datos reales)

La versión completa necesita su servidor encendido todo el tiempo: lee los partidos, calcula los pronósticos, los
congela antes de cada partido y alimenta el Laboratorio. Por eso no basta con subir una página: hay que alojar el
servidor en un servicio de hosting. Esta guía usa **Render** (lo más simple) y deja también la opción con **Docker**
para cualquier otro proveedor.

## Antes de empezar: déjala privada

- Los datos vienen de los marcadores públicos de ESPN, que se usan **solo en desarrollo** (`docs/data-licenses.md`).
  Publicar la app abierta al público con esos datos puede incumplir sus condiciones.
- Una app de información sobre apuestas para Colombia necesita revisión legal (Coljuegos, publicidad, protección de
  datos) antes de abrirse al público (Parte VI del plan).
- Por eso el servidor pide una **contraseña** si defines la variable `XPECTED_PASSWORD`. Úsala hasta tener la licencia
  de datos y la revisión legal: solo entra quien tenga la clave (el navegador la pide una vez; el usuario puede ser
  cualquiera).

## Opción A · Render (recomendada)

Lo que necesitas: una cuenta de GitHub y una cuenta de Render (las creas tú; ambas tienen registro gratuito).

### 1. Sube el código a GitHub (repositorio **privado**)

Con **GitHub Desktop** (sin comandos): *File → Add local repository* → elige la carpeta `xpected` → *create a
repository* → márcalo como **privado** → *Publish repository*.

O con comandos, dentro de la carpeta `xpected` (cambia `TU-USUARIO`; crea antes el repositorio vacío y privado en
github.com):

```bash
git init
```

```bash
git add .
```

```bash
git commit -m "Xpected 1.0"
```

```bash
git branch -M main
```

```bash
git remote add origin https://github.com/TU-USUARIO/xpected.git
```

```bash
git push -u origin main
```

El archivo `.gitignore` ya deja fuera `.env` (tus claves), `data/` y `dist/`. Los datos iniciales viajan en `lib/seed/`.

### 2. Crea el servicio en Render

1. En https://dashboard.render.com: **New → Blueprint**.
2. Conecta tu cuenta de GitHub y elige el repositorio `xpected`. Render lee `render.yaml` y propone el servicio.
3. Te pedirá el valor de **XPECTED_PASSWORD**: escribe una contraseña larga y guárdala.
4. Revisa el plan y pulsa **Apply**. El primer despliegue tarda 2–3 minutos.
5. Abre la dirección que te da Render (algo como `https://xpected.onrender.com`). El navegador pide usuario y
   contraseña: cualquier usuario y tu contraseña.

**Costo**: `render.yaml` usa el plan *Starter* (siempre encendido, unos 7 USD al mes) y un disco de 1 GB (unos
0,25 USD al mes) para que el historial no se pierda. Para probar gratis: en `render.yaml` cambia `plan: starter` por
`plan: free` y borra el bloque `disk`. Funciona igual, pero el servicio se apaga tras 15 minutos sin visitas (tarda
~1 minuto en despertar), no congela pronósticos mientras duerme y pierde el historial al reiniciarse.

### 3. Comprueba que funciona

- `https://TU-SITIO/healthz` responde `{"ok":true}` (no pide contraseña: es para Render).
- Desde tu computador, dentro de la carpeta `xpected` (PowerShell: `$env:XPECTED_PASSWORD="tu-clave"`;
  macOS/Linux: `export XPECTED_PASSWORD=tu-clave`):

```bash
node -r ./tools/con-clave.js tools/verify-live.js https://TU-SITIO
```

```bash
node -r ./tools/con-clave.js tools/verify-lab.js https://TU-SITIO
```

### 4. Publicar una versión nueva

Dentro de la carpeta `xpected`: actualiza los datos iniciales, guarda y sube; Render despliega solo.

```bash
node tools/actualizar-semilla.js
```

```bash
git add .
```

```bash
git commit -m "Nueva versión"
```

```bash
git push
```

## Opción B · Docker (Railway, Fly.io, un VPS…)

```bash
docker build -t xpected .
```

```bash
docker run -d --name xpected -p 80:8080 -e XPECTED_PASSWORD=tu-clave -v xpected-data:/app/data --restart unless-stopped xpected
```

El volumen `xpected-data` guarda el historial entre reinicios. Detrás de HTTPS (Caddy, Nginx o el proxy del proveedor)
no hace falta nada más: el servidor usa la variable `PORT` si el proveedor la define.

## Qué se agregó para publicar (sin cambiar lo existente)

| Archivo | Para qué |
| --- | --- |
| `server.js` (líneas nuevas) | contraseña opcional `XPECTED_PASSWORD` (HTTP Basic, comparación en tiempo constante), `/healthz` para el hosting, datos iniciales al arrancar |
| `lib/seed.js`, `lib/seed/` | copia el historial, los parámetros del laboratorio y el historial de pronósticos a `data/` si está vacía; nunca sobrescribe. `lib/` nunca se sirve al público |
| `Dockerfile`, `.dockerignore` | imagen con Node 22 sin dependencias; usuario sin privilegios; `.env` nunca entra |
| `render.yaml` | servicio de Render con disco, chequeo de salud y la contraseña como secreto |
| `tools/actualizar-semilla.js`, `tools/con-clave.js` | renovar los datos iniciales y auditar un servidor con contraseña |

## Problemas comunes

- **La página pide contraseña una y otra vez**: revisa que `XPECTED_PASSWORD` en Render sea la que escribes (sin
  espacios al final).
- **El Laboratorio dice que prepara el historial**: pasa solo la primera vez si `lib/seed/` no estaba; espera unos minutos.
- **No aparecen partidos**: la fuente pública no respondió; el estado se ve en la píldora de arriba a la derecha y en
  `/api/status`. Se recupera sola en la siguiente consulta.
