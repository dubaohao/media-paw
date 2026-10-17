<p align="center"> [<a href="README.md">中文</a>] | [<a href="README_en.md">English</a>] | [Español]</p>

# 📑Introducción
media-paw es una extensión de rastreo de recursos que puede ayudarlo a filtrar y enumerar los recursos de la página actual.

# 📖Instalación
## 🐴Chrome
TODO
## 🦄Edge
TODO
## 🦊Firefox
TODO
## 📱Edge Android
TODO

#  Métodos de instalación
## Instalación de la tienda de aplicaciones
Instálelo directamente desde la tienda de extensiones oficial utilizando el enlace proporcionado.
## Instalación código fuente
Este proyecto está construido con el framework [Plasmo](https://www.plasmo.com/). El directorio fuente no se puede cargar directamente; primero debe compilarlo:
1. Clonar el repositorio Git.
2. `npm install`
3. `npm run build`
4. Abra la página de gestión de extensiones y active "Developer Mode."
5. Clic en "Load unpacked" y seleccione el directorio `build/chrome-mv3-prod`.
## Instalación CRX
1. **Clic derecho** y guarde el archivo CRX desde [Releases](https://github.com/dubaohao/media-paw/releases).
2. Abra la página de gestión de extensiones y active "Developer Mode."
3. Arrastre el archivo CRX a la página de extensiones.

# 🛠️Desarrollo
```shell
npm install
npm run dev
```
La compilación de desarrollo se genera en `build/chrome-mv3-dev` (el nombre de la extensión lleva el prefijo `DEV ｜ `) con recarga en caliente. Cargue ese directorio y sus cambios se reconstruirán automáticamente.
- `npm run build`: compilación de producción, genera `build/chrome-mv3-prod`
- `npm run package`: empaqueta en zip/crx

# 📚Compatibilidad
Después de la versión 1.0.17, se requiere el kernel Chromium versión 93 o superior.
Utilice la versión 1.0.16 si es inferior a 93.
Para una funcionalidad completa, utilice la versión 104 o superior.

# 🤚🏻Descargo de responsabilidad
Esta extensión está pensada para descargar vídeos de tu propiedad o a los que tengas acceso autorizado. Está prohibido utilizar esta herramienta para descargar contenidos protegidos por derechos de autor sin autorización. Los usuarios son los únicos responsables de sus acciones, y el desarrollador no es responsable de ningún comportamiento de los usuarios. Esta herramienta se proporciona "tal cual" y el promotor no asume ninguna responsabilidad directa o indirecta.

# 🚫 Protección de los derechos de autor y política de exclusión voluntaria
Respetamos los derechos de propiedad intelectual y los intereses legítimos de todos los sitios web y sus operadores.
Si no permite que esta herramienta funcione en su sitio web, siga el procedimiento que se indica a continuación para presentar una solicitud. Añadiremos su dominio al proyecto de "Opt-Out List."
- Crear un nuevo **Issue** en este repositorio.
- **Utilice el siguiente formato de título:** `[Opt-Out Request] SuDominio.com`

En la descripción de la incidencia, facilite la siguiente información para su verificación:
- **Dominio del sitio web:** (ej., `ejemplo.com`)
- **Contacto Email:** (Para verificar la identidad cuando sea necesario).

Nos comprometemos a atender su solicitud y añadiremos los dominios verificados al "Opt-Out list" en posteriores actualizaciones de la versión.
Tenga en cuenta que se trata de un proyecto de código abierto, y las actualizaciones y versiones requieren un cierto ciclo. Gracias por su comprensión y cooperación.



# 🔒Política de privacidad
La extensión recopila y procesa toda la información localmente sin enviarla a servidores remotos y no incluye ningún rastreador.

# 💖Agradecimientos
- [Plasmo](https://github.com/PlasmoHQ/plasmo)
- [React](https://github.com/facebook/react)
- [hls.js](https://github.com/video-dev/hls.js)
- [mux.js](https://github.com/videojs/mux.js)
- [Momo707577045](https://github.com/Momo707577045)
- [mpd-parser](https://github.com/videojs/mpd-parser)
- [StreamSaver.js](https://github.com/jimmywarting/StreamSaver.js)

# �Proyecto de referencia
Este proyecto es una remodelación de cat-catch. El repositorio original y la documentación a continuación están desactualizados y son solo de referencia:
- Repositorio original: https://github.com/xifangczy/cat-catch
- Documentación original: https://o2bmm.gitbook.io/cat-catch/

# �📜Licencia
Licencia GPL-3.0

La versión 1.0 utiliza la licencia MIT.

La versión 2.0 ha cambiado a la licencia GPL v3.

Para que la extensión de rastreo de recursos se desarrolle bien, se espera que las extensiones que utilicen el código fuente de media-paw sigan siendo de código abierto.
