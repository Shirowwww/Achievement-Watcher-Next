---
title: "Configuración de logros con Goldberg y GBE Fork"
description: "Diagnostica o repara un juego de Steam emulado con Goldberg o GBE Fork, con copia de seguridad y confirmación antes de cada escritura."
---

# Configuración de logros con Goldberg y GBE Fork

AW Next lee las partidas de logros que producen Goldberg, GBE Fork y las estructuras de emuladores de Steam
compatibles. También puede diagnosticar y reparar la configuración local del emulador de un juego cuando el esquema,
el AppID o los archivos de ejecución están incompletos.

## ¿Cómo consigo notificaciones de logros con Goldberg o GBE Fork? {#how-do-i-get-achievement-notifications-with-goldberg-or-gbe-fork}

Goldberg y GBE Fork son emuladores de Steam: sustituyen a la biblioteca de Steam y registran los desbloqueos en un
archivo de partida, `achievements.json`, en `%APPDATA%\GSE Saves\<appid>`. Un segundo archivo con el mismo nombre,
en la carpeta `steam_settings` del juego, solo describe los logros. AW Next lee ambos y muestra
el popup de desbloqueo sobre el juego. Añade la carpeta del juego en **Ajustes → Carpetas**, ejecuta **Búsqueda inteligente**
y haz clic derecho en el juego y elige **Diagnosticar emulador** si se queda en 0 %. No se escribe nada en la
carpeta del juego hasta que pidas una reparación.

> [!WARNING]
> Las herramientas de reparación son opcionales. Modifican archivos dentro de la carpeta de juego seleccionada, así que úsalas solo
> con juegos que poseas y conserva cualquier copia de seguridad adicional que te importe.

## El esquema y los archivos de partida son distintos {#schema-and-save-files-are-different}

Dos archivos sin relación se llaman habitualmente `achievements.json`:

| | Archivo de esquema | Archivo de partida en ejecución |
|---|---|---|
| Ubicación habitual | `<game>\steam_settings\achievements.json` | `%APPDATA%\GSE Saves\<appid>\achievements.json` o `%APPDATA%\Goldberg SteamEmu Saves\<appid>\achievements.json` |
| Lo escribe | El juego o la configuración del emulador | El emulador mientras se ejecuta el juego |
| Finalidad | Nombres, descripciones e iconos de los logros | Qué logros se han desbloqueado |
| Cuando falta | La gestión de logros dentro del juego puede quedar incompleta; AW Next puede usar otra fuente de esquema | El juego muestra 0 % hasta que se escribe el primer desbloqueo |

Un archivo de esquema no demuestra que se haya desbloqueado nada, y una partida en ejecución sin ninguna entrada conseguida es un
0 % válido. Pueden existir ambas carpetas de partidas para un mismo juego: AW Next lee la que contiene los desbloqueos. Si una configuración de GBE o
Goldberg redirige las partidas a otro sitio (`local_save_path`), AW Next vigila la carpeta donde
acaban.

## Flujo recomendado {#recommended-workflow}

1. Añade la biblioteca de juegos o la raíz de las partidas en **Ajustes → Carpetas**.
2. Ejecuta **Búsqueda inteligente** o **Generar configuraciones**.
3. Si el juego muestra datos que faltan, haz clic derecho en él y elige **Diagnosticar emulador**.
4. Lee el informe antes de aplicar una reparación.
5. Usa **Aplicar arreglo de emulador** para instalar la DLL de ejecución y reparar `steam_settings` a la vez.
6. Inicia el juego, desbloquea un logro y actualiza AW Next si hace falta.

La configuración automática de los juegos recién descubiertos es opcional, en **Ajustes → Emuladores → Steam / GBE
Fork**. Con ella desactivada, un escaneo de la biblioteca no escribe nada en la carpeta de un juego (ni DLL, ni archivo de configuración,
ni siquiera un `achievements.json` que falte) hasta que pidas una reparación.

<div align="center">
<picture><source srcset="../assets/shot/steam-gbe-panel-800.webp 800w, ../assets/shot/steam-gbe-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/steam-gbe-panel.png" width="720" height="529" alt="Ajustes - Steam / GBE Fork"></picture><br>
<sub>La reparación automática, los interruptores de DLC e identidad y el descompresor opcional de SteamStub</sub>
</div>

## Acciones del menú contextual {#context-menu-actions}

<div align="center">
<picture><source srcset="../assets/shot/emulator-tools-800.webp 800w, ../assets/shot/emulator-tools.webp 1049w" sizes="(max-width: 700px) 100vw, 560px"><img src="../screenshot/emulator-tools.png" width="560" height="336" alt="Menú contextual Emulador y herramientas" loading="lazy" decoding="async"></picture><br>
<sub>Clic derecho en un juego → Emulador &amp; herramientas</sub>
</div>

### Diagnosticar emulador {#diagnose-emulator}

Informa del tipo de emulador detectado, el AppID, la ubicación de `steam_settings`, los recuentos de esquema y partidas, las
entradas o iconos que faltan, las rutas de guardado personalizadas y las discrepancias de AppID, y si el entorno de ejecución instalado es el que
AW Next puso allí. El diagnóstico es de solo lectura.

### Aplicar arreglo de emulador {#apply-emulator-fix}

Repara la DLL de ejecución y el esquema en un solo paso:

- descarga y guarda en caché una versión coincidente de GBE Fork e instala la arquitectura de DLL que necesita el juego
  (`steam_api.dll` o `steam_api64.dll`), conservando como copia de seguridad cualquier archivo existente;
- construye `steam_settings\achievements.json` (y su carpeta `images`) para que coincida con la lista de logros
  de Steam, y descarga los iconos;
- escribe `steam_appid.txt` cuando falta;
- escribe los archivos de configuración de GBE (`configs.app.ini`, `configs.main.ini`, `configs.user.ini`).

De cada archivo que reemplaza se hace antes copia de seguridad, y las reparaciones de esquema conservan además copias con marca de tiempo en
`steam_settings\.aw-backups`. El entorno de ejecución se instala como una sustitución normal de DLL; AW Next no
configura un lanzador ColdClient aparte.

Las compilaciones empaquetadas de Unreal Engine se reparan del mismo modo. Sus archivos de Steam están en
`Engine\Binaries\ThirdParty\Steamworks` en lugar de junto al ejecutable, y AW Next los encuentra, los instala
y los comprueba allí.

### Propiedad de DLC e identidad de la cuenta {#dlc-ownership-and-account-identity}

Dos interruptores en **Ajustes → Emuladores → Steam / GBE Fork**, ambos desactivados por defecto e independientes de
la reparación automática:

| Ajuste | Qué escribe |
|---|---|
| **Gestionar la propiedad de los DLC** | `configs.app.ini`, para que el emulador informe de todos los DLC como poseídos |
| **Escribir nombre de cuenta e idioma** | Tu nombre de cuenta e idioma, en `configs.user.ini` |

Ninguno afecta a los logros. Déjalos desactivados para mantener un juego sin tocar, o si gestionas los DLC o la identidad
a mano.

La tarjeta **Identidad del emulador** de debajo muestra lo que se escribe:

| Campo | Qué hace |
|---|---|
| **Nombre de la cuenta** | Se escribe mientras **Escribir nombre de cuenta e idioma** está activado. Vacío usa el nombre de tu perfil de AW Next. |
| **Steam ID** | Se escribe mientras ese interruptor está activado; vacío conserva el propio de cada juego. El botón del dado genera uno válido al azar, y un error de escritura se señala mientras escribes y nunca se escribe. |
| **Carpeta de partidas guardadas** | Se aplica en cuanto eliges una: todos los juegos corregidos o reparados a partir de entonces guardan allí (`local_save_path`), y AW Next la vigila para las notificaciones en directo. Vacío conserva `%APPDATA%\GSE Saves`. |

Para deshacer lo que escribió cualquiera de los dos interruptores, haz clic derecho en un juego y elige **Quitar la configuración de emulador de AW Next**.
Muestra exactamente lo que va a quitar antes de hacer nada. Solo quita la sección
de DLC, los interruptores y las claves de identidad que AW Next añadió, conserva todos los valores que fijaste tú o el repack y borra
un archivo solo cuando no queda nada más dentro.

### Usar tu propia DLL de emulador {#using-your-own-emulator-dll}

**Ajustes → Emuladores → DLL del emulador** importa tu propia `steam_api.dll` o `steam_api64.dll` y
la instala en lugar de la compilación descargada de GBE Fork, en cada arreglo y en cada arreglo automático. La
arquitectura que no importes sigue viniendo de la compilación oficial, igual que las herramientas de interfaz.

Un archivo importado se vuelve a validar en cada uso: debe ser un PE real de la arquitectura que su nombre
declara, y debe ser una DLL de emulador de Steam. Un archivo que no pasa se notifica y se ignora, nunca se
instala. **Usar la versión oficial** elimina la importación y vuelve a la versión descargada.

### Quitar DRM de Steam (Steamless) {#remove-steam-drm-steamless}

Intenta descomprimir SteamStub del ejecutable seleccionado cuando una sustitución de DLL no puede cargarse. El ejecutable
original se conserva como `*.steamstub.bak`. No hace nada con juegos sin SteamStub y no esquiva las
comprobaciones de propiedad del lado del servidor.

### Copia de seguridad y restauración {#back-up-and-restore}

Haz clic derecho en **Hacer copia de seguridad de GBE/Goldberg** para guardar una instantánea de la DLL y los archivos de `steam_settings` actuales, o en
**Restaurar la última copia de seguridad de GBE/Goldberg** para recuperar una. Una copia de seguridad anota cuándo la carpeta ya contenía
configuración que AW Next había escrito, de modo que nunca se confunda con el original intacto.

## Definir el AppID manualmente {#set-appid-manually}

Cuando el nombre de la carpeta de un juego coincide con varias versiones de Steam y el emparejamiento automático eligió la equivocada,
haz clic derecho en él y elige **Definir el AppID manualmente**. El AppID se escribe en `steam_appid.txt` y
se recuerda para esa carpeta de instalación, de modo que las reparaciones posteriores lo usan en lugar de volver a adivinar. **Borrar el AppID
manual**, en el mismo menú, lo quita.

## Problemas habituales {#common-problems}

### Falta el juego {#the-game-is-missing}

- Inicia el emulador una vez para que cree una partida en ejecución, o añade la biblioteca de juegos real para que la detección pueda
  encontrar `steam_settings`, `steam_appid.txt` o la DLL de la API de Steam.
- Comprueba que la carpeta añadida en los Ajustes está lo bastante arriba para contener la carpeta del juego, pero no es un disco entero
  de datos sin relación.
- Ejecuta **Generar configuraciones** y revisa el número de resultados.

### Todos los logros siguen bloqueados {#every-achievement-remains-locked}

Comprueba estas causas en orden:

1. **Todavía no se ha desbloqueado nada.** Una partida en ejecución ausente o vacía es lo esperado.
2. **Los nombres del esquema no coinciden con las claves de la partida.** Ejecuta **Diagnosticar emulador** y repara después el esquema.
3. **La ruta de guardado está personalizada.** Apunta AW Next a la raíz de partidas real o quita la sustitución
   de relleno.
4. **El AppID es incorrecto.** Usa **Definir el AppID manualmente** antes de ejecutar otra reparación.

### Faltan descripciones o iconos {#descriptions-or-icons-are-missing}

Ejecuta una reparación completa con la descarga de iconos activada. Cuando los metadatos en línea no están disponibles, AW Next puede reutilizar un
esquema local válido, pero no puede inventar descripciones que ninguna fuente tiene.

### Faltan las notificaciones en el juego pero la biblioteca se actualiza {#in-game-notifications-are-missing-but-the-library-updates}

AW Next lee la partida en ejecución, pero el esquema del emulador del propio juego o su overlay pueden estar incompletos. Comprueba
que `steam_settings\achievements.json` tiene los mismos nombres de API que la partida en ejecución y rutas de iconos
válidas.

## Limitaciones {#limitations}

Algunos juegos no informan de logros a través de Steamworks en absoluto, aunque se vendan en Steam, y no se pueden
rastrear mediante una ruta de partidas de Goldberg o GBE. AW Next tampoco puede reparar un juego cuya identidad real
o esquema de logros no pueda resolver con seguridad.

La [referencia técnica de Goldberg/GBE](../goldberg-gbe.md) cubre los formatos de archivo, las reglas de detección y los
detalles de implementación.

---

**Siguiente:** [Configuración de Uplay, R1 y R2](uplay-r2.md), el equivalente de Ubisoft para los juegos que no cargan
`steam_api.dll`.

<div align="center">

[← Documentación](README.md) · [Referencia técnica](../goldberg-gbe.md) · [Página del proyecto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
