# Arquitectura y calidad

## Patrones de diseño aplicados

| Patrón | Dónde | Para qué |
|---|---|---|
| Composition Root / Inyección de dependencias | `src/main/main.js` | Todas las dependencias se crean en un solo lugar; los servicios reciben lo que necesitan y son testeables. |
| Adapter + Strategy | `api/osf-api.js` (`HttpOsfApi`, `MockOsfApi`) | La app depende de un contrato, no del servidor. Se trabaja sin backend con el modo demo. |
| Factory | `createOsfApi()` | Elige la implementación según configuración. |
| Mapper / Anti-Corruption Layer | `api/playlist-mapper.js` | Aísla el formato del servidor del modelo interno. |
| Repository | `services/media-cache.js`, `core/json-file-store.js` | Acceso a archivos locales detrás de una interfaz simple. |
| Observer | Servicios que extienden `EventEmitter` | La UI reacciona a cambios (sesión, sincronización, actualizaciones, monitores) sin consultas periódicas. |
| Facade | Preloads (`window.osf`, `window.player`) | La UI sólo ve operaciones de alto nivel, nunca Node ni IPC crudo. |
| Strategy (render) | `renderer/player/player.js` | Cada tipo de medio (imagen/video) sabe crearse, cargarse y avanzar. |

## Seguridad (alineado con OWASP y las guías oficiales de Electron)

- `contextIsolation`, `sandbox` y sin `nodeIntegration` en todas las ventanas.
- Content-Security-Policy estricta en ambas páginas (sin scripts inline ni recursos externos).
- Navegación, ventanas emergentes y `<webview>` bloqueados.
- IPC: cada handler verifica que el mensaje venga de la ventana esperada; las entradas se validan (`sanitizeSettings`).
- Token de sesión cifrado con DPAPI de Windows (`safeStorage`); la contraseña nunca se guarda ni se registra en logs.
- Sólo HTTPS hacia la API y para descargar medios; verificación SHA-256 opcional si el servidor envía `checksum`.
- Protocolo `osf-media://` que sólo sirve nombres con formato de hash: no permite leer otros archivos del disco.
- Instancia única por equipo.

## Confiabilidad

- Offline-first: manifiesto y medios en caché; la TV sigue funcionando sin internet.
- Escrituras atómicas (tmp + rename) para tolerar cortes de luz.
- Reintentos de sincronización con espera; si una pieza falla, el reproductor pasa a la siguiente.
- Se evita que la pantalla entre en reposo mientras la TV está abierta (`powerSaveBlocker`).
- Logs con rotación en `%APPDATA%/OSF Senaletica/logs/app.log`.

## Calidad del producto (referencia ISO/IEC 25010)

| Característica | Cómo se aborda |
|---|---|
| Adecuación funcional | Requisitos del cliente: login contra servidor, 2 ventanas, ajuste automático a la TV, actualizaciones. |
| Eficiencia de desempeño | Descargas concurrentes limitadas, caché local, sin polling en la UI, liberación de videos al cambiar de pieza. |
| Compatibilidad | Windows 10/11 x64, cualquier resolución de TV. |
| Usabilidad / Accesibilidad | Controles nativos con etiquetas, foco visible, contraste AA, mensajes de error en español. |
| Fiabilidad | Ver sección anterior. |
| Seguridad | Ver sección de seguridad (prácticas alineadas con ISO/IEC 27001 Anexo A: control de acceso, criptografía, registro). |
| Mantenibilidad | Módulos pequeños con una responsabilidad, ESLint, tests unitarios, configuración centralizada. |
| Portabilidad | Instalador NSIS por usuario, actualización automática vía GitHub Releases. |

> Nota: estas referencias describen prácticas alineadas con las normas; no constituyen una certificación.
