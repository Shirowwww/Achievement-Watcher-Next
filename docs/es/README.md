---
title: "Documentación"
description: "Guías para instalar, configurar y reparar Achievement Watcher Next: fuentes, notificaciones, presets, overlay y solución de problemas."
permalink: /es/README.html
---

<div align="center">

# Documentación de AW Next

Guías para la configuración, el uso diario y el mantenimiento.

[Inicio](../index.html) · [Descargar](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest) · [Galería de presets](../gallery/) · [Galería de temas](../gallery/themes/) · [Registro de cambios](../changelog.md) · [Seguridad](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/SECURITY.md) · [Informar de un problema](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) · [Discord](https://discord.gg/DjTMrDsXTh)

<picture><source srcset="../assets/shot/home-800.webp 800w, ../assets/shot/home.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/home.png" width="800" height="492" alt="La biblioteca de AW Next"></picture>

</div>

## Empieza aquí {#start-here}

Lee en orden o salta a lo que necesites. Cada página termina con un enlace a la siguiente.

| # | Guía | Qué cubre |
|---|------|-----------|
| 1 | [Primeros pasos](getting-started.md) | Instalación, primer inicio, Simple y Avanzado, encontrar juegos, actualizaciones |
| 2 | [Fuentes compatibles](sources.md) | Todas las fuentes que lee AW Next y lo que necesita cada una |
| 3 | [Notificaciones](notifications.md) | Modos de entrega, Automático, sonidos, posición, capturas de pantalla |
| 4 | [Presets y el Diseñador de presets](presets.md) | El aspecto del popup, diseñar el tuyo, compartir archivos `.awpreset` |
| 5 | [Overlay](overlay.md) | La lista de logros en el juego: búsqueda, filtros, rareza |
| 6 | [Mando](controller.md) | Manejar la aplicación y el overlay con un gamepad |
| 7 | [Game Health](game-health.md) | El informe por juego y sus reparaciones guiadas |
| 8 | [Solución de problemas](troubleshooting.md) | Problemas de detección, progreso, notificaciones y tiempo de juego |

## Cuando lo necesites {#when-you-need-it}

| Guía | Qué cubre |
|---|---|
| [FAQ](faq.md) | Respuestas breves a las preguntas habituales |
| [Linux y Steam Deck](linux.md) | El AppImage y sus actualizaciones, escritorios, el atajo del overlay, Steam, Proton y lanzadores |
| [Herramientas avanzadas](advanced.md) | Mantenimiento, vaciado de cachés, restablecimientos, juegos manuales, diagnóstico |
| [Configuración de Goldberg / GBE](emulator-setup.md) | Diagnosticar o reparar un juego de Steam emulado |
| [Configuración de Uplay, R1 y R2](uplay-r2.md) | El equivalente de Ubisoft |
| [Comparación](comparison.md) | En qué se diferencia AW Next de Achievement Watcher 2.x y de Achievements |
| [Galerías de la comunidad](community-galleries.md) | Presets y temas de otras personas, y el envío de los tuyos |

**Ajustes → Ayuda** es la referencia más rápida mientras la aplicación está abierta. Se adapta a tu configuración (atajo del
overlay, asignaciones del mando, modo de notificación, tema, fuentes activadas) y filtra sus temas mientras
escribes.

## Referencia para desarrolladores {#developer-reference}

Para colaboradores y cualquiera que compile AW Next desde el código fuente.

| Tema | Referencia |
|---|---|
| Contribuir, ramas, pruebas, estilo de los commits | [CONTRIBUTING.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CONTRIBUTING.md) |
| Preparación del desarrollo, ejecución, empaquetado | [BUILD.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/BUILD.md) |
| Límites entre aplicación, renderizador y Watchdog; el contrato del analizador | [Architecture](../architecture.md) |
| Formatos de archivo de Goldberg / GBE, detección, invariantes de reparación | [Referencia de Goldberg / GBE](../goldberg-gbe.md) |
| Cómo se identifican, reparan y leen los juegos de Uplay R1/R2 | [Referencia de Uplay R1/R2](../uplay-reference.md) |
| Versionado, publicación, CI, validación de la actualización automática | [Flujo de publicación](../RELEASE_WORKFLOW.md) |
| El instalador, el desinstalador y el actualizador | [Instalador, desinstalador y actualizaciones](../INSTALLER_AND_UPDATES.md) |
| Traducción, formato Intl, enrutado de enlaces, el linter de idiomas | [Localización](../localization.md) |
| Archivos de idioma y paridad de claves | [app/locale/README.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/app/locale/README.md) |
| El archivo de tema portable y su versionado | [Formato .awtheme](../awtheme-format.md) |

## Dónde están tus datos {#where-your-data-lives}

Todo lo que escribe AW Next está en **`%APPDATA%\Achievement Watcher Next`** (`~/.config/Achievement
Watcher Next` en Linux, con la misma estructura). Las rutas de abajo son relativas a esa carpeta. Una actualización lo conserva todo, y
el primer inicio importa una carpeta antigua de Achievement Watcher sin modificarla.

| Qué | Dónde |
|---|---|
| Ajustes, índices y bases de datos | `cfg\` (`options.ini` es el archivo de ajustes) |
| Registros | `logs\` |
| Presets que creaste o importaste | `presets\Users Presets\` |
| Imágenes que un preset usa como fondo | `presets\images\` |
| Sonidos que añadiste | `sounds\` |
| Temas que guardaste o importaste | `theme-packs\` |
| Imágenes que usa el tema Personalizado | `theme-images\` |
| Un tema de hoja de estilos que dejaste | `themes\` |
| Copias de seguridad de logros y las hechas antes de una reparación de GBE | `backups\achievements\`, `backups\gbe\` |
| Portadas e iconos de juegos | `covers\`, `gameIcons\` |
| Capturas de pantalla | `Pictures\Achievement Watcher Next` (o la carpeta que elegiste) |
| Cuentas con sesión iniciada | `steam_session.enc`, `epic_tokens.enc`, `cfg\xbox-auth.json`, `cfg\psn-auth.json` |
| **Se puede volver a obtener:** esquemas, iconos y rareza de una plataforma | `steam_cache\`, `uplay_cache\` |
| **Se puede volver a obtener:** herramientas descargadas y resultados de escaneos de carpetas | `cache\` (salvo `cache\uplayR2`, que contiene una DLL que aportaste) |
| Partidas de GBE Fork (escritas por el emulador) | `%APPDATA%\GSE Saves` |
| Partidas clásicas de Goldberg (igual) | `%APPDATA%\Goldberg SteamEmu Saves` |

**Ajustes → Avanzado → Vaciar cachés** vacía las dos filas que se pueden volver a obtener y nada más. Nada
de `cfg\`, `presets\`, `theme-packs\`, `theme-images\`, `themes\`, `sounds\`, `covers\`,
`gameIcons\` o `backups\` se regenera, así que cópialos antes de reinstalar.

Antes de informar de un problema, ejecuta **Ajustes → Avanzado → Diagnóstico**, reprodúcelo una vez y quita después
los datos privados de los registros que adjuntes.

### Qué sale de este PC {#what-leaves-this-pc}

AW Next no tiene analítica, ni telemetría, ni cuenta propia. Solo envía las consultas que necesita
y guarda en caché cada respuesta para que la biblioteca siga funcionando sin conexión.

| Pide | A | Llevando |
|---|---|---|
| Listas de logros, iconos, rareza global | Los puntos de acceso públicos de Steam, la página de SteamCommunity, SteamHunters, Exophase | El AppID de un juego y el idioma de la interfaz |
| Portadas y logotipos | La CDN de Steam, SteamDB, SteamGridDB | El AppID o el título de un juego |
| Comprobaciones y descargas de actualizaciones | El canal de versiones de GitHub | Nada más que la solicitud |
| Herramientas de reparación, cuando ejecutas una reparación | Los proyectos GBE Fork, Steamless, API-bypass y CrakFiles | Nada más que la solicitud |
| Tu biblioteca y desbloqueos, **solo si conectas una cuenta** | Steam, Epic, Xbox Network o PlayStation Network | El token de sesión de la cuenta; en los desbloqueos de Steam, el Steam ID público |
| Tu biblioteca y desbloqueos de RetroAchievements, **solo si rellenas la tarjeta de la cuenta** | retroachievements.org | Tu nombre de usuario y tu clave Web API, guardados cifrados en este PC |
| Presets y temas de la comunidad, **solo si abres la galería o publicas en ella** | El servicio de la galería, `aw-gallery.shirow.dedyn.io` | La solicitud del listado; un archivo solo cuando pulsas Publicar |

Cuando el ejecutable de un juego lleva un icono real de 256 px, AW Next lo lee del archivo y lo usa como
logotipo sin consultar la red.

Este sitio web no usa cookies, no ejecuta analítica y carga sus fuentes y scripts desde su propio servidor.
Las páginas de la galería obtienen su listado del servicio de la galería indicado arriba y recurren a la copia
publicada junto a ellas cuando no se puede acceder a él.

No se sube nada más: ni tu biblioteca, ni el tiempo de juego, las carpetas o las capturas de pantalla. La emisión opcional
`Websocket @localhost:8082` escucha solo en `127.0.0.1`, de modo que solo los programas de este PC pueden
leerla. Lo único que envías deliberadamente es un preset o tema que publicas en una galería (consulta
[Las galerías de la comunidad](community-galleries.md)).
