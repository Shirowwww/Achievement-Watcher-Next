---
title: "Configuración de Goldberg Uplay, R1 y R2"
description: "Configura los logros de los juegos de Ubisoft compatibles con los cargadores Uplay R1 y R2, y repáralos con seguridad."
---

# Configuración de Goldberg Uplay (R1 y R2)

AW Next tiene una reparación aparte para los juegos de Ubisoft que se ejecutan con el emulador Goldberg Uplay. Nunca
toca las instalaciones oficiales de Ubisoft Connect: un juego solo se selecciona cuando AW Next ha demostrado el
cargador exacto y la generación que usa.

Un juego de Ubisoft carga solo la generación de cargador con la que se enlazó su ejecutable: aproximadamente de 2019
en adelante es **R2**, todo lo anterior es **R1**. AW Next detecta y repara la que corresponda, ya que
la generación equivocada dejaría una DLL que el juego nunca abre. Un juego de Ubisoft con dos ID de producto (un
juego base y su edición Complete) funciona en ambos casos: se lee una partida guardada con cualquiera de los dos ID, y un ID
de objetivo suelto que contenga se empareja con la lista de logros de Steam.

> [!WARNING]
> La reparación cambia archivos del juego. Úsala solo con juegos que poseas.

## Reparar un juego {#repair-a-game}

Desde **Game Health**:

1. Añade la biblioteca del juego en **Ajustes → Carpetas** y escanéala.
2. Abre el panel **Game Health** del juego y revisa **Diagnosticar configuración de Uplay R1/R2**.
3. Ejecuta **Aplicar la corrección de logros de Ubisoft** e inicia el juego una vez.

Desde **Ajustes → Emuladores → Ubisoft / Uplay R1/R2**:

<div align="center">
<picture><source srcset="../assets/shot/uplay-r2-panel-800.webp 800w, ../assets/shot/uplay-r2-panel.webp 928w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/uplay-r2-panel.png" width="720" height="536" alt="Ajustes - Ubisoft / Uplay R2"></picture><br>
<sub>El paquete de reparación integrado se verifica antes de tocar ningún juego</sub>
</div>

- **Arreglar automáticamente los juegos recién detectados**: el interruptor que también aparece en Steam / GBE Fork, aplicado
  también a los juegos de Ubisoft. Desactivado por defecto.
- **Reparar juegos Uplay R1/R2 detectados**: repara cada instalación detectada en un único lote confirmado.
- **Importar o reemplazar DLL** / **Restaurar DLL integradas**: usa tu propia compilación del cargador, o vuelve a
  la que incluye AW Next. Una DLL elegida manualmente no necesita una huella SHA-256 conocida, pero debe ser un
  cargador de Uplay válido y capaz de gestionar logros, con un nombre y una arquitectura coherentes.

Las DLL integradas están en `app/resources/uplayR2/` (R2) y `app/resources/uplayR1/` (R1). AW Next
comprueba sus hashes, su arquitectura PE y su capacidad para gestionar logros antes de que una reparación pueda usarlas, y
guarda un archivo de recuperación a su lado.

La misma transacción de reparación se ejecuta desde el menú contextual, Game Health, la reparación automática, Arreglar todo y el
botón de lote. Hace una instantánea de cada DLL, esquema e INI modificados en `<game>\.aw-backups\<timestamp>\`
y los restaura automáticamente si la validación falla después. Repetir una reparación idéntica no
hace nada.

## Vincular un juego sin emparejar con su versión de Steam {#linking-an-unmapped-game-to-its-steam-release}

AW Next empareja por sí solo la mayoría de los juegos de Ubisoft con su versión de Steam, para convertir los nombres de logros de Steam
en los ID de objetivo de Ubisoft que espera el cargador. Cuando no puede, elige tú la versión
con **Identificar el juego (ID de aplicación de Steam)** en el menú de clic derecho del juego. Se rechaza un emparejamiento que no se pueda
confirmar, porque uno equivocado escribiría la lista de logros de otro juego en la carpeta
de este.

Abrir una vez la página de logros del juego en Ubisoft Connect puede ayudar a AW Next a reconocer un título que
lo necesite, como Brawlhalla o The Crew 2. La elección que confirmas se recuerda para esa carpeta de
instalación exacta. El emparejamiento automático (el mapa integrado, el catálogo de Ubisoft en directo y la
regla de coincidencia de títulos) se describe en la [referencia de Uplay R1/R2](../uplay-reference.md).

## Un juego que nunca pide un logro {#a-game-that-never-asks-for-an-achievement}

Algunos títulos de Ubisoft piden primero al cargador la sesión de Ubisoft, y el cargador responde desde una
clave vacía. Esos juegos leen la clave vacía como sin sesión iniciada y nunca llaman a la API de logros. La configuración
parece correcta y no se registra nada. Avatar: Frontiers of Pandora se comporta así.

Cuando el registro de diagnóstico de Game Health lo demuestra, ofrece **Activar los logros sin conexión** en la comprobación
Configuración del emulador. Añade una clave de sesión de relleno junto al juego: no es una sesión real de
Ubisoft, no interviene ninguna cuenta, no se envía nada a ninguna parte, solo lo justo para superar esa comprobación. Nunca se
añade automáticamente, porque un token que no es legítimo puede romper algunos juegos.

**Inicia el juego una vez después de activarlo.** Hasta entonces la fila dice *Logros sin conexión activados,
abre el juego una vez*. El botón de al lado dice entonces **Desactivar los logros sin conexión**, que quita
la clave.

Esto se aplica solo a los cargadores R2; el INI de R1 lleva una clave sin relación. La [guía de Goldberg / GBE](emulator-setup.md)
cubre el equivalente de Steam de esta reparación.

## Los logros siguen en 0 % {#achievements-remain-at-0}

- Vuelve a ejecutar **Diagnosticar configuración de Uplay R1/R2** tras una actualización del juego, ya que las actualizaciones suelen quitar el esquema
  o restablecer el recuento de desbloqueos.
- Lee `upc_r2.log` (o `upc_r1.log`) junto a la DLL del cargador: registra cada número de objetivo que pide el
  juego. Mantén activado **Registro de diagnóstico**, en **Ajustes → Emuladores → Ubisoft / Uplay R1/R2**.
  Game Health lo necesita para distinguir un juego que nunca pidió nada de otro que pide un objetivo que el esquema
  no contiene. Está activado por defecto, y AW Next recorta el registro cuando supera los 25 MB.
- Revisa `%APPDATA%\Achievement Watcher Next\logs\parser.log`.

## Nota sobre el antivirus {#antivirus-note}

Si un antivirus elimina una DLL de cargador suelta, o pone en cuarentena el archivo de recuperación a mitad de camino, Game
Health informa de un problema del antivirus y ofrece permitir la carpeta y devolver los archivos. No necesitas
buscar un reemplazo por tu cuenta.

La identidad, los ID de objetivo y el registro del cargador se tratan en la [referencia de Uplay R1/R2](../uplay-reference.md).

<div align="center">

[← Documentación](README.md) · [Solución de problemas](troubleshooting.md) · [Página del proyecto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
