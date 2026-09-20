# Constancia

Registro de hábitos por bloques de 8 minutos. Supabase + HTML/CSS/JS sin build.

## Archivos

- `index.html`, `styles.css`, `app.js` — la app. Estático, se sirve desde cualquier lado.
- `config.js` — URL y clave publicable de Supabase (copiá `config.example.js`).
- `supabase/migrations/…_registros.sql` — tabla `registros` + vista `resumen_diario` + policy.
- `demo.js` — abrí `index.html?demo` para probar la UI con datos falsos, sin base.

## Modelo

Una sola tabla, `registros`: `fecha`, `actividad`, `minutos`, `created_at`.
Cada tap en "+8 min" inserta una fila con 8; desde el toast o tocando el bloque en "Hoy" ajustás los minutos reales.

Las actividades viven en `ACTIVIDADES` al principio de `app.js`. Agregar una es una línea.

## Cómo se calculan las cosas

- **Racha**: días consecutivos con al menos un bloque, contando hacia atrás desde hoy. Si hoy todavía no registraste, la racha cuenta desde ayer y se marca *"hoy no la cortes"*.
- **Semana**: lunes a hoy.
- **Hoy**: suma de los bloques de la fecha local del celular (no UTC).

## Correr local

Necesita servirse por HTTP (es un módulo ES):

```bash
npx serve .
```

## Publicar

Es estático: Vercel, Netlify, Cloudflare Pages o GitHub Pages. Subí la carpeta tal cual.
Después, en el celular: "Agregar a pantalla de inicio" → queda como app.

## Seguridad

Sin login: la policy deja leer/escribir con la clave publicable. Para una app personal está bien;
si querés cerrarla, activá Supabase Auth y cambiá la policy a `auth.uid() = user_id`.
