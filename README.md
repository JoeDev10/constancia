# Constancia

Registro de hábitos por bloques de 8 minutos, manejado por voz. Supabase + HTML/CSS/JS sin build.

**App:** https://joedev10.github.io/constancia/ — abrila en el celular y "Agregar a pantalla de inicio".

## Cómo se usa

Tocá el micrófono naranja y hablá. Ejemplos:

| Decís | Pasa |
|---|---|
| «inglés» | registra un bloque de 8 min de inglés |
| «inglés veinte minutos» · «gimnasio media hora» · «baile una hora y media» | registra con esos minutos |
| «cu a doce» · «que a» · «testing» | QA (el reconocedor lo transcribe de muchas formas; todas valen) |
| «fueron quince» · «me estiré a 25» · «ajustá a 12» | corrige el **último** bloque de hoy |
| «corregí inglés a doce» | corrige el último bloque de inglés de hoy |
| «borrá el último» · «eliminar qa» | borra el último bloque (de hoy / de esa actividad) |
| «cómo voy» · «resumen» · «racha de inglés» | lee en voz alta rachas, hoy y semana, y qué te falta hoy |

La app responde hablando (🔊 arriba a la derecha lo apaga). Los botones «+8 min» y la lista de «Hoy» siguen funcionando con el dedo; tocar un bloque de hoy abre el ajuste de minutos.

Si el navegador no soporta reconocimiento de voz, el micrófono abre un campo para escribir el comando. Funciona en Chrome (Android) y Safari (iOS 14.5+). Necesita HTTPS: por eso está en GitHub Pages.

## Archivos

- `index.html`, `styles.css`, `app.js` — la app.
- `voz.js` — parser de comandos (puro, testeable) + Web Speech API (reconocer y hablar).
- `config.js` — URL y clave publicable de Supabase (copiá `config.example.js` si clonás en otro proyecto).
- `supabase/migrations/…_registros.sql` — tabla `registros` + vista `resumen_diario` + policy.
- `demo.js` — abrí `index.html?demo` para probar la UI con datos falsos, sin tocar la base.

## Modelo

Una sola tabla, `registros`: `fecha`, `actividad`, `minutos`, `created_at`.
Cada bloque es una fila. La vista `resumen_diario` agrega por día y actividad; la app la usa para rachas y totales.

Las actividades viven en `ACTIVIDADES` (`app.js`) y sus alias de voz en `ALIAS` (`voz.js`). Agregar una es una línea en cada lado.

## Cómo se calculan las cosas

- **Racha**: días consecutivos con al menos un bloque, contando hacia atrás desde hoy. Si hoy todavía no registraste, cuenta desde ayer y se marca *«falta hoy»*.
- **Semana**: lunes a hoy.
- **Hoy**: fecha local del celular (no UTC).

## Correr local

```bash
python -m http.server 5173
```

y abrir http://localhost:5173 (es un módulo ES, necesita servirse por HTTP).

## Deploy

GitHub Pages desde `main`: cada push publica solo.

## Seguridad

Sin login: la policy deja leer/escribir con la clave publicable. Para una app personal alcanza;
si querés cerrarla, activá Supabase Auth y cambiá la policy a `auth.uid() = user_id`.
