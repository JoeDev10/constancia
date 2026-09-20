import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { parsearComando, escuchar, hablar, callar, soportaReconocimiento, soportaVoz } from './voz.js';

// ── Configuración ────────────────────────────────────────────────
// Para agregar una actividad: una línea acá. El id es lo que se guarda en la tabla.
const ACTIVIDADES = [
  { id: 'ingles',   nombre: 'Inglés',   color: 'var(--ember)', hero: true },
  { id: 'gimnasio', nombre: 'Gimnasio', color: 'var(--lime)' },
  { id: 'qa',       nombre: 'QA',       color: 'var(--cyan)' },
  { id: 'baile',    nombre: 'Baile',    color: 'var(--pink)' },
];
const BLOQUE_MIN = 8;
const DIAS_HISTORIAL = 400; // cuánto atrás mirar para calcular rachas
const LETRAS_DIA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// ── Fechas (siempre en hora local del celular) ───────────────────
const pad = n => String(n).padStart(2, '0');
const isoLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoy = () => isoLocal(new Date());
function sumarDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoLocal(new Date(y, m - 1, d + n));
}
function lunesDe(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7; // lunes = 0
  return sumarDias(iso, -dow);
}
function fmtMin(m) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${pad(r)}` : `${h} h`;
}
const fmtHora = ts => new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

// ── Estado ───────────────────────────────────────────────────────
const state = {
  resumen: [],      // filas de resumen_diario: { fecha, actividad, minutos, bloques }
  hoyRegs: [],      // registros individuales de hoy
  editando: null,   // registro abierto en el sheet
  toastTimer: null,
};

const $ = sel => document.querySelector(sel);
const actividad = id => ACTIVIDADES.find(a => a.id === id) || { id, nombre: id, color: 'var(--muted)' };

// ── Supabase ─────────────────────────────────────────────────────
const demo = new URLSearchParams(location.search).has('demo');
const configurado = demo || (SUPABASE_URL && !SUPABASE_URL.includes('TU_PROYECTO') && SUPABASE_KEY && !SUPABASE_KEY.includes('TU_CLAVE'));
const supabase = demo
  ? (await import('./demo.js')).default          // ?demo → datos falsos en memoria
  : configurado ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

async function cargar() {
  const desde = sumarDias(hoy(), -DIAS_HISTORIAL);
  const [resumen, regs] = await Promise.all([
    supabase.from('resumen_diario').select('*').gte('fecha', desde).limit(5000),
    supabase.from('registros').select('*').eq('fecha', hoy()).order('created_at', { ascending: false }),
  ]);
  if (resumen.error) throw resumen.error;
  if (regs.error) throw regs.error;
  state.resumen = resumen.data;
  state.hoyRegs = regs.data;
}

async function registrar(actId, { minutos = BLOQUE_MIN, boton = null } = {}) {
  if (boton) { boton.disabled = true; boton.classList.add('busy'); }
  try {
    const { data, error } = await supabase
      .from('registros')
      .insert({ fecha: hoy(), actividad: actId, minutos })
      .select()
      .single();
    if (error) throw error;
    await cargar();
    render({ resaltar: actId });
    toast(`${actividad(actId).nombre} · ${minutos} min ✓`, () => abrirSheet(data));
    return data;
  } catch (e) {
    console.error(e);
    toast('No se pudo guardar. ¿Hay señal?', null, true);
    return null;
  } finally {
    if (boton) { boton.disabled = false; boton.classList.remove('busy'); }
  }
}

async function actualizar(id, minutos) {
  const { error } = await supabase.from('registros').update({ minutos }).eq('id', id);
  if (error) throw error;
}

async function eliminar(id) {
  const { error } = await supabase.from('registros').delete().eq('id', id);
  if (error) throw error;
}

// ── Cálculo de rachas y totales ──────────────────────────────────
function calcular(actId) {
  const porDia = new Map();
  for (const r of state.resumen) {
    if (r.actividad === actId) porDia.set(r.fecha, (porDia.get(r.fecha) || 0) + r.minutos);
  }
  const h = hoy();
  const lunes = lunesDe(h);

  let semana = 0;
  for (const [f, m] of porDia) if (f >= lunes && f <= h) semana += m;

  // La racha cuenta hacia atrás desde hoy; si hoy todavía no hay nada,
  // cuenta desde ayer y se marca "en riesgo" (todavía está viva, pero hay que hacerla hoy).
  let racha = 0;
  let cursor = porDia.has(h) ? h : sumarDias(h, -1);
  while (porDia.has(cursor)) { racha++; cursor = sumarDias(cursor, -1); }
  const enRiesgo = racha > 0 && !porDia.has(h);

  const dias = Array.from({ length: 7 }, (_, i) => {
    const f = sumarDias(lunes, i);
    return { letra: LETRAS_DIA[i], hecho: porDia.has(f), esHoy: f === h, futuro: f > h };
  });

  return { hoyMin: porDia.get(h) || 0, semana, racha, enRiesgo, dias };
}

// ── Render ───────────────────────────────────────────────────────
function cardHTML(act, s, i, resaltar) {
  const tag = s.enRiesgo
    ? `<span class="tag riesgo">falta hoy</span>`
    : act.hero ? `<span class="tag">prioridad</span>` : '';
  const dots = s.dias.map(d =>
    `<span class="dot ${d.hecho ? 'hecho' : ''} ${d.esHoy ? 'hoy' : ''} ${d.futuro ? 'futuro' : ''}"><i></i>${d.letra}</span>`
  ).join('');
  return `
    <article class="card ${act.hero ? 'hero' : ''}" style="--c:${act.color}; --d:${i * 70}ms">
      <div class="card-top"><span class="nombre">${act.nombre}</span>${tag}</div>
      <div class="racha ${s.racha === 0 ? 'cero' : ''}">
        <span class="num ${resaltar === act.id ? 'pop' : ''}">${s.racha}</span>
        <span class="lbl">${s.racha === 1 ? 'día seguido' : 'días seguidos'}</span>
      </div>
      <div class="stats">
        <div><span class="v">${fmtMin(s.hoyMin)}</span><span class="k">hoy</span></div>
        <div><span class="v">${fmtMin(s.semana)}</span><span class="k">semana</span></div>
      </div>
      <div class="dots">${dots}</div>
      <button class="btn-bloque" type="button" data-act="${act.id}">
        <span class="plus">+</span> ${BLOQUE_MIN} min
      </button>
    </article>`;
}

function render({ resaltar } = {}) {
  const h = hoy();
  $('#fecha').textContent = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  const hero = ACTIVIDADES.filter(a => a.hero);
  const resto = ACTIVIDADES.filter(a => !a.hero);
  $('#hero').innerHTML = hero.map((a, i) => cardHTML(a, calcular(a.id), i, resaltar)).join('');
  $('#grid').innerHTML = resto.map((a, i) => cardHTML(a, calcular(a.id), i + hero.length, resaltar)).join('');

  const lunes = lunesDe(h);
  const totalSemana = state.resumen.filter(r => r.fecha >= lunes && r.fecha <= h).reduce((s, r) => s + r.minutos, 0);
  $('#semana-total').innerHTML = `semana <b>${fmtMin(totalSemana)}</b>`;

  const totalHoy = state.hoyRegs.reduce((s, r) => s + r.minutos, 0);
  $('#hoy-total').textContent = state.hoyRegs.length
    ? `${state.hoyRegs.length} ${state.hoyRegs.length === 1 ? 'bloque' : 'bloques'} · ${fmtMin(totalHoy)}`
    : '';

  $('#hoy-lista').innerHTML = state.hoyRegs.length
    ? state.hoyRegs.map(r => {
        const a = actividad(r.actividad);
        return `
          <li><button class="reg" type="button" data-id="${r.id}" style="--c:${a.color}">
            <span class="pt"></span>
            <span class="act">${a.nombre}</span>
            <span class="hora">${fmtHora(r.created_at)}</span>
            <span class="min">${r.minutos}<small>min</small></span>
          </button></li>`;
      }).join('')
    : `<li class="vacio"><em>Todavía nada hoy.</em>Un bloque de ${BLOQUE_MIN} alcanza para no cortar la racha.</li>`;
}

// ── Toast ────────────────────────────────────────────────────────
function toast(msg, onAjustar, esError = false) {
  const el = $('#toast');
  clearTimeout(state.toastTimer);
  $('#toast-msg').textContent = msg;
  el.classList.toggle('error', esError);
  el.hidden = false;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  $('#toast-btn').onclick = () => { el.hidden = true; onAjustar && onAjustar(); };
  state.toastTimer = setTimeout(() => { el.hidden = true; }, esError ? 5000 : 7000);
}

// ── Sheet de ajuste ──────────────────────────────────────────────
function abrirSheet(reg) {
  state.editando = reg;
  const a = actividad(reg.actividad);
  $('#sheet-act').textContent = a.nombre;
  $('#sheet-act').style.setProperty('--c', a.color);
  $('#sheet-hora').textContent = fmtHora(reg.created_at);
  setMinutos(reg.minutos);
  $('#sheet').hidden = false;
  setTimeout(() => $('#sheet-min').focus({ preventScroll: true }), 50);
}
function cerrarSheet() { $('#sheet').hidden = true; state.editando = null; }
function setMinutos(n) {
  const v = Math.min(600, Math.max(1, Math.round(Number(n) || 0)));
  $('#sheet-min').value = v;
  document.querySelectorAll('#chips .chip').forEach(c => c.classList.toggle('activa', Number(c.dataset.min) === v));
}
const leerMinutos = () => Math.min(600, Math.max(1, Math.round(Number($('#sheet-min').value) || 0)));

async function guardarSheet() {
  const reg = state.editando; if (!reg) return;
  const minutos = leerMinutos();
  const btn = $('#sheet-guardar'); btn.disabled = true;
  try {
    if (minutos !== reg.minutos) await actualizar(reg.id, minutos);
    cerrarSheet();
    await cargar();
    render({ resaltar: reg.actividad });
    toast(`${actividad(reg.actividad).nombre} · ${minutos} min ✓`, () => abrirSheet({ ...reg, minutos }));
  } catch (e) {
    console.error(e); toast('No se pudo guardar.', null, true);
  } finally { btn.disabled = false; }
}

async function eliminarSheet() {
  const reg = state.editando; if (!reg) return;
  if (!confirm(`¿Eliminar este bloque de ${actividad(reg.actividad).nombre}?`)) return;
  try {
    await eliminar(reg.id);
    cerrarSheet();
    await cargar();
    render();
    toast('Bloque eliminado');
  } catch (e) {
    console.error(e); toast('No se pudo eliminar.', null, true);
  }
}

// ── Eventos ──────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const bloque = e.target.closest('.btn-bloque');
  if (bloque) return registrar(bloque.dataset.act, { boton: bloque });

  const reg = e.target.closest('.reg');
  if (reg) {
    const r = state.hoyRegs.find(x => x.id === reg.dataset.id);
    if (r) abrirSheet(r);
    return;
  }

  if (e.target.closest('[data-cerrar]')) return cerrarSheet();

  const step = e.target.closest('.step');
  if (step) return setMinutos(leerMinutos() + Number(step.dataset.step));

  const chip = e.target.closest('#chips .chip');
  if (chip) return setMinutos(chip.dataset.min);
});
$('#sheet-min').addEventListener('input', () => setMinutos($('#sheet-min').value));
$('#sheet-min').addEventListener('keydown', e => { if (e.key === 'Enter') guardarSheet(); });
$('#sheet-guardar').addEventListener('click', guardarSheet);
$('#sheet-eliminar').addEventListener('click', eliminarSheet);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) cerrarSheet(); });

// Al volver a la app (cambio de día, otra pestaña), refrescar.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && supabase) cargar().then(() => render()).catch(console.error);
});

// ── Voz ──────────────────────────────────────────────────────────
const AUDIO_KEY = 'constancia:audio';
let audioOn = (() => { try { return localStorage.getItem(AUDIO_KEY) !== 'off'; } catch { return true; } })();
function pintarAudio() {
  const b = $('#btn-audio');
  b.textContent = audioOn ? '🔊' : '🔇';
  b.classList.toggle('off', !audioOn);
}
$('#btn-audio').addEventListener('click', () => {
  audioOn = !audioOn;
  try { localStorage.setItem(AUDIO_KEY, audioOn ? 'on' : 'off'); } catch {}
  pintarAudio();
  if (!audioOn) callar(); else decir('Voz activada.');
});
pintarAudio();

const decir = texto => (audioOn && soportaVoz) ? hablar(texto) : Promise.resolve();

function fraseMin(m) {
  if (m === 1) return '1 minuto';
  if (m < 60) return `${m} minutos`;
  const h = Math.floor(m / 60), r = m % 60;
  const horas = h === 1 ? 'una hora' : `${h} horas`;
  return r ? `${horas} y ${r}` : horas;
}
const fraseRacha = n => n === 0 ? 'sin racha' : n === 1 ? 'racha de 1 día' : `racha de ${n} días`;

function ultimoRegistro(actId) {
  // state.hoyRegs viene ordenado por created_at desc
  return actId ? state.hoyRegs.find(r => r.actividad === actId) : state.hoyRegs[0];
}

function textoResumen(actId) {
  const lista = actId ? [actividad(actId)] : ACTIVIDADES;
  const partes = lista.map(a => {
    const s = calcular(a.id);
    const hoyTxt = s.hoyMin ? `hoy ${fraseMin(s.hoyMin)}` : 'hoy todavía nada';
    return `${a.nombre}: ${fraseRacha(s.racha)}, ${hoyTxt}, semana ${fraseMin(s.semana)}.`;
  });
  const pendientes = ACTIVIDADES.filter(a => calcular(a.id).enRiesgo).map(a => a.nombre);
  if (!actId && pendientes.length) partes.push(`Ojo: te falta hoy ${pendientes.join(' y ')} para no cortar la racha.`);
  return partes.join(' ');
}

async function ejecutarComando(cmd) {
  switch (cmd.tipo) {
    case 'registrar': {
      const minutos = cmd.minutos || BLOQUE_MIN;
      const reg = await registrar(cmd.actividad, { minutos });
      if (!reg) return decir('No pude guardar. Fijate la señal.');
      const s = calcular(cmd.actividad);
      return decir(`${actividad(cmd.actividad).nombre}, ${fraseMin(minutos)}. ${fraseRacha(s.racha)}. Hoy ${fraseMin(s.hoyMin)}.`);
    }
    case 'ajustar': {
      const reg = ultimoRegistro(cmd.actividad);
      if (!reg) return decir(cmd.actividad ? `Hoy no hay bloques de ${actividad(cmd.actividad).nombre}.` : 'Hoy no hay bloques para ajustar.');
      try {
        await actualizar(reg.id, cmd.minutos);
        await cargar(); render({ resaltar: reg.actividad });
        toast(`${actividad(reg.actividad).nombre} · ${cmd.minutos} min ✓`, () => abrirSheet({ ...reg, minutos: cmd.minutos }));
        return decir(`Listo, ${actividad(reg.actividad).nombre} quedó en ${fraseMin(cmd.minutos)}.`);
      } catch (e) { console.error(e); return decir('No pude ajustar.'); }
    }
    case 'borrar': {
      const reg = ultimoRegistro(cmd.actividad);
      if (!reg) return decir('No hay nada para borrar hoy.');
      try {
        await eliminar(reg.id);
        await cargar(); render();
        toast('Bloque eliminado');
        return decir(`Borré el último bloque de ${actividad(reg.actividad).nombre}, ${fraseMin(reg.minutos)}.`);
      } catch (e) { console.error(e); return decir('No pude borrar.'); }
    }
    case 'resumen': {
      const txt = textoResumen(cmd.actividad);
      toast(cmd.actividad ? `${actividad(cmd.actividad).nombre}: ${fraseRacha(calcular(cmd.actividad).racha)}` : 'Leyendo resumen…');
      return decir(txt);
    }
    case 'vacio':
      return decir('No escuché nada.');
    default:
      toast(`No entendí: "${cmd.texto}"`, null, true);
      return decir('No entendí. Probá: inglés veinte minutos, o cómo voy.');
  }
}

let detenerEscucha = null;
function cerrarEscucha() {
  if (detenerEscucha) { detenerEscucha(); detenerEscucha = null; }
  $('#escucha').hidden = true;
  $('#mic').classList.remove('escuchando');
}
function abrirEscucha() {
  callar();
  const panel = $('#escucha');
  panel.hidden = false; panel.classList.remove('quieta');
  $('#escucha-texto').textContent = '';
  $('#escucha-estado').textContent = 'Escuchando…';
  $('#escucha-form').hidden = soportaReconocimiento;
  if (!soportaReconocimiento) {
    panel.classList.add('quieta');
    $('#escucha-estado').textContent = 'Este navegador no reconoce voz · escribí el comando';
    setTimeout(() => $('#escucha-input').focus(), 50);
    return;
  }
  $('#mic').classList.add('escuchando');
  detenerEscucha = escuchar({
    onParcial: t => { $('#escucha-texto').textContent = t; },
    onFinal: async t => {
      $('#escucha-texto').textContent = t;
      $('#escucha-estado').textContent = 'Entendido';
      panel.classList.add('quieta');
      await procesarTexto(t);
    },
    onError: err => {
      const msg = err === 'not-allowed' ? 'Permití el micrófono en el navegador'
                : err === 'no-speech' ? 'No escuché nada · tocá el micrófono y hablá'
                : err === 'network' ? 'Sin conexión para reconocer voz'
                : `Error de voz: ${err}`;
      $('#escucha-estado').textContent = msg;
      panel.classList.add('quieta');
      $('#mic').classList.remove('escuchando');
      if (err === 'not-allowed' || err === 'network') $('#escucha-form').hidden = false;
    },
    onFin: () => { $('#mic').classList.remove('escuchando'); detenerEscucha = null; },
  });
}
async function procesarTexto(texto) {
  const cmd = parsearComando(texto, ACTIVIDADES.map(a => a.id));
  setTimeout(cerrarEscucha, 350);
  await ejecutarComando(cmd);
}

$('#mic').addEventListener('click', () => { $('#escucha').hidden ? abrirEscucha() : cerrarEscucha(); });
$('#escucha-form').addEventListener('submit', e => {
  e.preventDefault();
  const t = $('#escucha-input').value.trim(); $('#escucha-input').value = '';
  if (t) procesarTexto(t);
});
document.addEventListener('click', e => { if (e.target.closest('[data-cerrar-escucha]')) cerrarEscucha(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#escucha').hidden) cerrarEscucha(); });

// ── Arranque ─────────────────────────────────────────────────────
async function init() {
  $('#fecha').textContent = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  if (!configurado) {
    $('#hero').innerHTML = `<div class="aviso">Falta configurar Supabase.<p>Copiá <code>config.example.js</code> como <code>config.js</code> y completá la URL y la clave publicable del proyecto.</p></div>`;
    return;
  }
  $('#hero').innerHTML = `<div class="skel" style="min-height:300px"></div>`;
  $('#grid').innerHTML = `<div class="skel"></div><div class="skel"></div><div class="skel"></div>`;
  try {
    await cargar();
    render();
  } catch (e) {
    console.error(e);
    $('#hero').innerHTML = `<div class="aviso">No pude leer la base.<p>${e.message || e}</p><p>¿Corriste la migración en Supabase? ¿El proyecto está activo?</p></div>`;
    $('#grid').innerHTML = '';
  }
}
init();
