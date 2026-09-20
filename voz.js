// Parser de comandos por voz (español rioplatense, tolerante a cómo transcribe el celular).
// Es puro: texto → { tipo, actividad, minutos }. app.js decide qué hacer con eso.
//
// Ejemplos que entiende:
//   "inglés"                         → registrar inglés, 8 min
//   "inglés veinte minutos"          → registrar inglés, 20 min
//   "gimnasio media hora"            → registrar gimnasio, 30 min
//   "baile una hora y media"         → registrar baile, 90 min
//   "fueron quince" / "ajustá a 15"  → ajustar el último bloque de hoy a 15
//   "corregí inglés a doce"          → ajustar el último bloque de inglés de hoy a 12
//   "borrá el último" / "eliminar qa"→ borrar el último bloque (de hoy / de esa actividad)
//   "cómo voy" / "resumen" / "racha" → leer el estado en voz alta

const NUMEROS = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100,
};

// Alias por actividad. Las claves son los ids de ACTIVIDADES en app.js.
// QA se transcribe de mil formas ("cu a", "que a", "ka", "Q&A"), por eso tantos alias.
const ALIAS = {
  ingles:   ['ingles', 'english', 'idioma'],
  gimnasio: ['gimnasio', 'gym', 'gim', 'entrenamiento', 'entrenar', 'entrene', 'pesas', 'ejercicio'],
  qa:       ['qa', 'q a', 'cu a', 'cua', 'que a', 'ka', 'k a', 'kiu ei', 'quiu ei', 'q&a', 'cuei', 'testing', 'calidad', 'pruebas', 'test'],
  baile:    ['baile', 'bailar', 'baile', 'danza', 'bachata', 'salsa'],
};

const PALABRAS = {
  borrar:  ['borra', 'borrar', 'elimina', 'eliminar', 'quita', 'quitar', 'saca', 'sacar', 'anula', 'anular', 'deshace', 'deshacer'],
  ajustar: ['ajusta', 'ajustar', 'corregi', 'corrige', 'corregir', 'cambia', 'cambiar', 'actualiza', 'actualizar',
            'fueron', 'fue', 'en realidad', 'estire', 'estiré', 'me estire', 'modifica', 'modificar', 'pone', 'poner'],
  resumen: ['resumen', 'como voy', 'como vengo', 'como vamos', 'estado', 'racha', 'rachas', 'cuanto llevo', 'cuanto hice',
            'que hice', 'que me falta', 'que falta', 'como estoy', 'reporte', 'leeme', 'decime'],
};

export function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // saca tildes
    .replace(/[^a-z0-9ñ&\s]/g, ' ')                       // saca puntuación
    .replace(/\s+/g, ' ')
    .trim();
}

const tiene = (t, lista) => lista.some(p => new RegExp(`(^|\\s)${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(t));

export function detectarActividad(t, ids = Object.keys(ALIAS)) {
  for (const id of ids) if (tiene(t, ALIAS[id] || [id])) return id;
  return null;
}

// Devuelve minutos o null. Entiende dígitos, números en palabras, horas y medias horas.
export function extraerMinutos(t) {
  const digitos = t.match(/(\d+)\s*(h|hora|horas)?/);
  if (digitos) {
    const n = Number(digitos[1]);
    if (digitos[2]) return n * 60 + (/y media/.test(t) ? 30 : 0);
    return n;
  }

  if (/hora y media/.test(t) || /una hora y media/.test(t)) return 90;
  if (/media hora/.test(t)) return 30;
  if (/cuarto de hora/.test(t)) return 15;
  if (/tres cuartos/.test(t)) return 45;

  const palabras = t.split(' ');
  let valor = null;
  for (let i = 0; i < palabras.length; i++) {
    const p = palabras[i];
    if (p in NUMEROS) {
      let n = NUMEROS[p];
      // "cuarenta y cinco" → 45
      if (n >= 30 && n < 100 && palabras[i + 1] === 'y' && palabras[i + 2] in NUMEROS && NUMEROS[palabras[i + 2]] < 10) {
        n += NUMEROS[palabras[i + 2]]; i += 2;
      }
      // "una hora" / "dos horas" → 60 / 120
      if (/^horas?$/.test(palabras[i + 1] || '')) n *= 60;
      valor = n;
      break;
    }
  }
  return valor;
}

export function parsearComando(texto, ids) {
  const t = normalizar(texto);
  if (!t) return { tipo: 'vacio', texto: t };

  const actividad = detectarActividad(t, ids);
  const minutos = extraerMinutos(t);

  if (tiene(t, PALABRAS.borrar))  return { tipo: 'borrar', actividad, texto: t };
  if (tiene(t, PALABRAS.resumen)) return { tipo: 'resumen', actividad, texto: t };
  if (tiene(t, PALABRAS.ajustar)) {
    return minutos ? { tipo: 'ajustar', actividad, minutos, texto: t } : { tipo: 'desconocido', texto: t };
  }
  if (actividad) return { tipo: 'registrar', actividad, minutos: minutos || null, texto: t };
  // Solo un número ("veinte") → ajustar el último bloque
  if (minutos && t.split(' ').length <= 3) return { tipo: 'ajustar', actividad: null, minutos, texto: t };
  return { tipo: 'desconocido', texto: t };
}

// ── Reconocimiento + síntesis (Web Speech API) ───────────────────
export const soportaReconocimiento = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
export const soportaVoz = typeof window !== 'undefined' && 'speechSynthesis' in window;

export function escuchar({ onParcial, onFinal, onError, onFin, lang = 'es-AR' }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = true;
  rec.maxAlternatives = 3;
  rec.continuous = false;
  let final = '';
  rec.onresult = e => {
    let parcial = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) final += r[0].transcript; else parcial += r[0].transcript;
    }
    if (parcial) onParcial && onParcial(parcial);
    if (final) { onFinal && onFinal(final.trim()); final = ''; }
  };
  rec.onerror = e => onError && onError(e.error);
  rec.onend = () => onFin && onFin();
  rec.start();
  return () => { try { rec.abort(); } catch {} };
}

let vozElegida = null;
function elegirVoz() {
  if (!soportaVoz) return null;
  const voces = speechSynthesis.getVoices();
  const pref = ['es-AR', 'es-US', 'es-MX', 'es-419', 'es-ES', 'es'];
  for (const p of pref) {
    const v = voces.find(v => v.lang.replace('_', '-').toLowerCase().startsWith(p.toLowerCase()));
    if (v) return v;
  }
  return null;
}
if (soportaVoz) {
  vozElegida = elegirVoz();
  speechSynthesis.addEventListener('voiceschanged', () => { vozElegida = elegirVoz(); });
}

export function hablar(texto) {
  if (!soportaVoz) return Promise.resolve();
  return new Promise(resolve => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-AR';
    if (vozElegida) u.voice = vozElegida;
    u.rate = 1.05;
    u.onend = resolve; u.onerror = resolve;
    speechSynthesis.speak(u);
  });
}
export const callar = () => { if (soportaVoz) speechSynthesis.cancel(); };
