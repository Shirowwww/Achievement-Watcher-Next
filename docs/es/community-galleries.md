---
title: "Las galerías de la comunidad"
description: "Consigue un preset de notificación o un tema hecho por otra persona, o envía el tuyo a la galería de la comunidad."
---

# Las galerías de la comunidad

Dos galerías, un servicio, un solo conjunto de reglas.

| | | |
|---|---|---|
| [Galería de presets](../gallery/) | `.awpreset` | El popup de notificación: diseño, tipografía, colores, movimiento y sonido |
| [Galería de temas](../gallery/themes/) | `.awtheme` | El resto de la aplicación: ventana, barra de título, biblioteca, listas de logros, ajustes y overlay |

Para descargar de cualquiera de las dos, coge el archivo y usa después **Ajustes → Presets de notificación → Importar** o
**Ajustes → Apariencia → Importar**. Esta página trata el otro lado: cómo añadir uno, qué se comprueba
y qué puede decir una tarjeta.

## Enviar uno {#sending-one}

El proceso es el mismo para ambos, y nada sale de tu navegador hasta que pulsas **Publicar**.

1. **Expórtalo.** Usa Ajustes → Presets de notificación → Exportar para un preset, o Ajustes → Apariencia →
   Exportar para un tema. El archivo ya lleva el nombre, la descripción, la versión, las etiquetas y la versión de AW Next
   que necesita.
2. **Elige el archivo** en el panel *Envía el tuyo* de la página de la galería, o suéltalo sobre el panel. Elegirlo
   no envía nada: el archivo espera mientras rellenas el resto, y el panel indica lo que contiene.
3. **Comprueba lo que debe decir la tarjeta.** Cuatro campos se rellenan a partir del paquete en cuanto lo eliges:
   un **nombre**, una **descripción** de una línea, **etiquetas** y un **crédito**. El crédito es el autor que la
   aplicación registró al exportar, así que es el nombre con el que te presentas, y solo está vacío si elegiste no
   recibir crédito. Escribe una etiqueta y pulsa Intro para convertirla en una ficha; haz clic en una ficha para quitarla.

   **El nombre es el único campo que hay que rellenar.** Encabeza la tarjeta y da la dirección con la que se
   publica el archivo, y un nombre elegido por otra persona es lo que acaba reescribiendo un moderador.
   Publicar queda inactivo hasta que haya uno. Los otros tres pueden quedar vacíos, y entonces la tarjeta no lleva
   nada ahí.
4. **Pulsa Publicar.** Tarda unos segundos, porque la imagen se renderiza, no se adivina. Después
   espera: nada aparece en una galería antes de que un responsable lo apruebe.

Todo lo que hay en esos campos es una **sugerencia**. Sustituye al paquete solo donde está rellenado, se
limpia exactamente igual que un manifiesto, y un responsable ve los cuatro junto a la imagen renderizada antes de que
se publique nada. Nada de eso decide un nombre de archivo ni una dirección: el servicio construye la dirección a partir
del nombre, conserva letras minúsculas, dígitos y guiones, y rechaza cualquier otra cosa.

Tu navegador lee los campos del paquete (su `manifest.json` y nada más). El archivo en sí
sale solo cuando pulsas Publicar.

| | Preset | Tema |
|---|---|---|
| Paquete | 4 MB como máximo | 8 MB como máximo |
| Frecuencia | Cinco envíos por hora desde una misma dirección, presets y temas juntos | |

## La imagen no la envías tú {#the-picture-is-not-yours-to-send}

No puedes adjuntar una captura de pantalla a ninguna de las dos galerías. El servicio renderiza la imagen a partir de tu paquete.

En un **preset**, dibuja el popup a partir del paquete, en el mismo documento aislado que usa la aplicación,
una vez en un navegador sin red ni scripts propios, al tamaño con el que la aplicación lo muestra. Lo dibuja
en cada estado que un preset tiene que manejar: un desbloqueo normal, uno raro de bronce, plata y oro,
el popup del 100 % y un paso de progreso. Una tarjeta muestra uno cada vez, con un botón de flecha a cada lado para
recorrerlos, y la imagen ampliada es la que se está mostrando. Comprueba los seis al diseñar: un
preset que solo se lee bien en uno de ellos lo muestra aquí.

Un **tema** son colores y números, así que el servidor dibuja una muestra fija de la interfaz de AW Next con
tu tema (barra de título, fila del perfil, biblioteca, lista de desbloqueados recientemente, superficie de ajustes) y la fotografía.
Es la muestra que enseñan los Ajustes antes de una importación, al mismo tamaño. Se asienta siempre sobre los mismos cuatro
degradados de fondo, de modo que un tema transparente no se renderiza como un diseño desvaído y dos
renderizados de un mismo archivo coinciden.

El texto de la muestra es una constante del código fuente de la aplicación, así que una tarjeta no puede llevar una biblioteca, cuenta, ruta o
juego tuyo, ni mostrar una versión del envío que no enviaste.

## Qué viaja en un archivo {#what-travels-in-a-file}

Un **`.awpreset`** contiene el documento y la hoja de estilos del preset, sus imágenes, fuentes y sonido,
y los ajustes del diseñador que hay detrás. Nada sobre tu equipo.

Un **`.awtheme`** contiene colores, degradados, ajustes de encaje, ajustes de efectos y cualquier imagen de fondo que elegiste,
y nada más: ni hoja de estilos, ni marcado, ni script. Una imagen viaja como bytes con un nombre construido a partir de
su capa, nunca como una ruta fuera de tu carpeta de imágenes. La lista completa está en
[el formato `.awtheme`](../awtheme-format.md).

Un **tema de hoja de estilos de usuario no se puede exportar.** Un `.css` que dejaste en
`%APPDATA%\Achievement Watcher Next\themes` no es un `.awtheme`, y Exportar lo rechaza. Comparte el
`.css` en sí.

## Fondos y otros recursos {#backgrounds-and-other-assets}

Todo lo que hay dentro de un paquete se redistribuye a quien lo descargue, así que debe ser tuyo
para poder redistribuirlo:

- Tu propia obra gráfica, o algo con una licencia que lo permita. Un fondo de pantalla que encontraste no suele ser ni lo uno
  ni lo otro, y una fuente comprada tampoco.
- Nada con un logotipo, una marca de agua o texto incrustado. Un tema es un aspecto, no una colocación.
- Nada que no pasara por un fondo de escritorio en el trabajo.

Un tema hecho solo de colores es bienvenido y el más fácil de aceptar.

## Crédito y licencia {#credit-and-licence}

El nombre de una tarjeta es lo que acabe diciendo el campo **Crédito**. Empieza con el autor que la aplicación
registró al exportar, así que normalmente es correcto. Cámbialo si te presentas con otro nombre, o vacíalo
y la tarjeta no llevará nombre. Un responsable puede añadir un enlace a tu perfil al aprobarla.

**Todo lo que figura en cualquiera de las galerías se publica bajo
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).** Al enviar aceptas eso, confirmas
que es obra tuya y que todo lo que contiene es tuyo para cederlo.

## Qué se comprueba {#what-is-checked}

Un envío tiene que superar dos capas.

**El lector propio de la aplicación.** `app/util/presetPackage.js` y `app/util/themePackage.js`, los módulos que
se ejecutan al Importar, validan el paquete: el manifiesto, la versión del formato, la versión mínima de la aplicación, cada
ruta que contiene, los tipos de archivo, los tamaños y el punto de entrada. El servicio de la galería usa esos archivos
tal cual, así que una regla añadida allí se aplica aquí en la siguiente compilación, y no se puede listar nada que la aplicación
rechazaría.

**Los límites propios de la galería**, que una importación privada no necesita:

| | |
|---|---|
| Nombre de archivo | Letras minúsculas, dígitos y guiones, de 2 a 48 caracteres, construido por el servicio a partir del nombre |
| Paquete | 4 MB para un preset, 8 MB para un tema |
| Imagen | Renderizada por el servicio, una vez por estado, y rechazada si alguna sale del tamaño que sirve un listado (500 KB como máximo cada una) |
| Nombre | Único en su galería, ya que dos entradas con un mismo nombre chocan al importar |

No se ejecuta nada de un paquete mientras se comprueba, y el sitio web nunca renderiza uno: una tarjeta muestra una
imagen producida por el servicio. Un preset se ejecuta solo en la aplicación, en la misma ventana de notificación aislada
que usa un preset incluido, y un tema no puede ejecutar nada en ningún sitio.

## Qué se rechaza {#what-gets-refused}

- La obra de otra persona, salvo que haya dicho que sí y le des crédito.
- Recursos que no puedes redistribuir.
- Un popup que se hace pasar por otra cosa: un cuadro de diálogo del sistema, un anuncio, una dirección que visitar.
- Un anuncio, logotipo o llamada a la acción incrustado en una imagen de fondo.
- Una paleta que hace ilegible el texto.
- Un casi duplicado de algo ya listado.

Un rechazo conserva la suma de comprobación y borra los bytes, así que volver a enviar el mismo archivo se reconoce
en lugar de ponerse en cola dos veces.

## Actualizar o retirar el tuyo {#updating-or-removing-yours}

Envía el archivo más reciente del mismo modo, con la versión del paquete aumentada, y di en la
descripción que sustituye a una tarjeta anterior para que un responsable pueda retirar esa. Para que se
retire una entrada, [abre una incidencia](https://github.com/Shirowwww/Achievement-Watcher-Next/issues/new/choose) y
di de qué tarjeta se trata.

## Cuando el panel no está {#when-the-panel-is-not-there}

Ningún servidor de la galería responde, y la página lista una copia publicada junto a ella. Todo lo que ya está en una
galería se puede seguir descargando. Solo el envío de algo nuevo tiene que esperar, así que inténtalo de nuevo más tarde.

El proyecto gestiona el servicio que hace aparecer el panel, y no forma parte de este repositorio, así que
no hay nada que instalar para él.

## Temas de Steam Achievement Notifier {#themes-from-steam-achievement-notifier}

No están listados aquí y no lo estarán.

Los temas de SAN son archivos `.san` que la gente se pasa directamente. El repositorio de SAN no tiene carpeta de temas,
lista en la wiki ni canal, así que una compilación no tiene nada a lo que apuntar. Los archivos pertenecen a quienes los hicieron y
no tienen licencia de redistribución, y el repositorio de SAN no lleva ninguna licencia. Copiar
cualquiera de los dos aquí republicaría el trabajo de otras personas sin permiso.

AW Next lee en cambio los tuyos. **Ajustes → Presets de notificación → Importar tema SAN** lee un archivo `.san`,
o el `usertheme.json` de un tema ya descomprimido, e **Importar desde SAN en este PC** lee
los ajustes propios de SAN. En cualquier caso el tema se convierte en un preset de AW Next, dibujado con el motor propio de SAN
al tamaño de SAN, y se exporta como `.awpreset` igual que cualquier otro. Lo que llega está en
[Presets](presets.md#import-a-theme-from-steam-achievement-notifier).

Si importaste uno que es tuyo, expórtalo y envía ese. Entonces es tu preset, con crédito a tu nombre.

- [Steam Achievement Notifier](https://github.com/SteamAchievementNotifier/SteamAchievementNotifier)

---

**Siguiente:** [Presets y el Diseñador de presets](presets.md): qué es un preset y cómo hacer uno.

<div align="center">

[← Documentación](README.md) · [Galería de presets](../gallery/) · [Galería de temas](../gallery/themes/) · [Página del proyecto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
