# OSF Señalética TV

Aplicación de escritorio (Electron) para las TVs publicitarias de las sucursales de
**Organización San Francisco — Broker de Seguros**.

Descarga del servidor de OSF las imágenes y videos que el diseñador carga en el panel web
y los reproduce en bucle, a pantalla completa, en la TV de la sucursal.

## Cómo funciona

| Ventana | Qué hace |
|---|---|
| **Panel de administración** | Launcher con inicio de sesión (usuario y contraseña validados por el servidor), estado de actualizaciones, estado de sincronización, secuencia actual, vista previa y controles de la TV, elección de monitor y sucursal. |
| **Pantalla de la TV** | Totalmente limpia: sólo muestra las imágenes y videos, con un fundido entre piezas. Se ubica sola en el monitor de la TV y se reacomoda si cambia la resolución o se desconecta. |

- **Offline-first:** el contenido se guarda en caché local; si se corta internet, la TV sigue mostrando la última secuencia.
- **Actualizaciones automáticas:** la app instalada busca nuevas versiones en GitHub Releases, las descarga sola y se aplican al reiniciar (o con el botón *Reiniciar y actualizar*).
- **Arranque con Windows** y apertura automática de la TV (configurable).

## API de OSF

Base: `https://osfbrokerdeseguros.com/api` — toda la integración está en `src/main/api/`.

| Uso | Método y ruta | Notas |
|---|---|---|
| Inicio de sesión | `POST /auth/login` *(a confirmar)* | Body `{ username, password }` → `{ token, user: { name, branch }, expiresAt }` |
| Contenido | `GET /screens?sucursal=<nombre>` | Requiere `Authorization: Bearer <token>`. Sin `sucursal` devuelve todas. |

La respuesta de `/screens` se traduce en `src/main/api/playlist-mapper.js`, que acepta un
arreglo o `{ items: [...] }` con campos `id`, `url`/`src`, `type`/`mimeType`, `duration` (s) u
`durationMs`, `order`, `active`. Si el formato real difiere, sólo se ajusta ese archivo.

Variables de entorno opcionales: `OSF_API_MODE` (`http` | `mock`), `OSF_API_BASE_URL`,
`OSF_API_LOGIN_PATH`, `OSF_API_PLAYLIST_PATH`, `OSF_SYNC_INTERVAL_MS`.

## Desarrollo

Requisitos: Node.js 20+ y Windows 10/11.

```bash
npm install
npm run dev     # modo demo (sin servidor): cualquier usuario y una contraseña de 4+ caracteres
npm start       # modo según OSF_API_MODE (mock por defecto sin empaquetar)
npm test        # tests unitarios (node:test)
npm run lint    # ESLint
npm run dist    # genera el instalador en dist/OSF-Senaletica-Setup-<versión>.exe
```

## Publicar una versión para las sucursales

1. Subir la versión en `package.json` (p. ej. `1.0.1`) y hacer commit.
2. Crear y subir el tag: `git tag v1.0.1 && git push origin main --tags`.
3. GitHub Actions compila el instalador y lo publica en **Releases** junto con `latest.yml`.
4. Las PCs con la app instalada se actualizan solas. Para una sucursal nueva, descargar
   `OSF-Senaletica-Setup-x.y.z.exe` desde Releases e instalarlo (no requiere permisos de administrador).

## Instalación en una sucursal

1. Conectar la TV a la PC por HDMI como **segundo monitor** (modo *Extender*).
2. Ejecutar el instalador `.exe` y abrir **OSF Señalética**.
3. Iniciar sesión con el usuario de la sucursal.
4. En **Pantallas**, verificar el monitor de la TV y la sucursal. La TV se abre sola.
5. **TV vertical:** las piezas se diseñan en **9:16**. Con la TV colgada en vertical, en
   **Pantallas › Orientación de la TV** elegir la rotación (90° a la derecha o a la izquierda)
   con la que el contenido se vea derecho. Alternativa: poner la pantalla en *Vertical* desde
   Windows (Configuración › Pantalla › Orientación) y dejar la app en *Horizontal (sin rotar)*.

## Estructura

```
src/
  main/            Proceso principal (Node)
    api/           Cliente HTTP, adaptador de la API de OSF y mapper de la playlist
    core/          Logger y persistencia JSON atómica
    services/      Auth, sesión cifrada, ajustes, caché de medios, sincronización, monitores, actualizaciones
    windows/       Creación y endurecimiento de ventanas
    ipc-router.js  Canales IPC validados por origen
    media-protocol.js  Protocolo osf-media:// para servir la caché al reproductor
    main.js        Composition root
  preload/         Puentes contextBridge (sandbox)
  renderer/admin/  Panel de administración (propuesta de diseño A)
  renderer/player/ Reproductor de la TV
  shared/          Constantes compartidas
tests/             Tests unitarios
```

Ver [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) para patrones, seguridad y calidad.
