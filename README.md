# SIMTELE-WEB 🚠

Panel interactivo de prevención y monitoreo inspirado en un sistema de transporte por cable. Proyecto educativo de **Programación Web I**.

> ⚠️ Todos los datos y umbrales son **ficticios y didácticos**. No representan límites operativos reales ni el sitio oficial de Mi Teleférico.

🔗 **Página publicada:** [pega aquí la URL de GitHub Pages]

## Integrantes

| Integrante | Responsabilidad |
| --- | --- |
| [Nombre 1] | [Ej.: HTML semántico y README] |
| [Nombre 2] | [Ej.: CSS, diseño adaptable y publicación] |
| [Nombre 3] | [Ej.: JavaScript módulos 1 y 3] |
| [Nombre 4] | [Ej.: JavaScript módulos 2 y 4 y pruebas] |

**Materia:** Programación Web I · **Docente:** [Nombre de la docente] · **Fecha:** [dd/mm/aaaa]

## Módulos

| Módulo | Qué hace | Técnicas usadas |
| --- | --- | --- |
| 🛑 Detención de emergencia (Línea Roja) | Calcula la distancia recorrida durante la reacción con d = (v/3.6) × t y avisa si supera el umbral ficticio de 50 m. | Formulario, parseFloat, if/else, DOM |
| 🔧 Mantenimiento (Línea Amarilla) | Agrega, muestra y elimina registros de componente, horas de uso y estado. | Arreglo de objetos, push, filter, tabla dinámica |
| 🌬️ Viento y oscilación (Línea Celeste) | Recibe 5 mediciones y muestra promedio, máximo, clasificación y un gráfico de barras. | Arreglos, forEach, sumas y condicionales |
| 📡 Sensores (Línea Verde) | Valida el código del sensor y registra solo los válidos. | Expresión regular, test(), validaciones |

## Cómo usar

1. Abre la página y elige un módulo con el menú superior.
2. Llena el formulario y presiona el botón del módulo.
3. Los resultados y errores aparecen debajo del formulario, sin recargar la página.
4. Los registros de mantenimiento y sensores se guardan en el navegador (localStorage), así que no se pierden al recargar.
5. El botón **Reiniciar** borra los datos guardados, y el botón de tema cambia entre modo claro y oscuro.

## Validaciones

- Campos vacíos, valores no numéricos y rangos fuera de lo permitido muestran un mensaje de error.
- Código de sensor: expresión regular `/^SEN-\d{3}$/` (ejemplo válido: `SEN-001`).

## Pruebas de aceptación

| Módulo | Entrada | Resultado esperado |
| --- | --- | --- |
| Detención | 72 km/h y 3 s | 60 m (con alerta por superar los 50 m ficticios) |
| Mantenimiento | agregar 2 componentes y eliminar 1 | 2 filas, luego 1 |
| Viento | 10, 20, 30, 40, 50 | promedio 30, máximo 50, clasificación "Moderado" |
| Sensores | `SEN-001` / `SEN-1` / vacío | válido / error / error |
| Celular | abrir en pantalla pequeña | menú y controles funcionan |

## Estructura del repositorio

- `index.html`: estructura semántica (header, nav, main, section, footer)
- `style.css`: estilos, colores por línea con variables CSS, modo oscuro y media queries
- `script.js`: lógica de los 4 módulos, validaciones, localStorage y eventos
- `README.md`: este archivo

## Tecnologías

HTML5 · CSS3 (variables, grid, flexbox, media queries) · JavaScript (DOM, eventos, arreglos, RegExp, localStorage) · GitHub Pages

## Créditos de diseño

Paleta inspirada en los colores de las líneas de Mi Teleférico y en la bandera de Bolivia. Proyecto sin fines comerciales.
