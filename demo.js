// Cliente falso en memoria para probar la UI sin Supabase: abrí index.html?demo
// Imita solo las llamadas que usa app.js.

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hace = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

let seq = 0;
const nuevo = (fecha, actividad, minutos, hora = '09:00') => ({
  id: `demo-${++seq}`, fecha, actividad, minutos,
  created_at: `${fecha}T${hora}:00`,
});

const registros = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12].map(n => nuevo(hace(n), 'ingles', 8)),
  nuevo(hace(2), 'ingles', 16), nuevo(hace(1), 'ingles', 12),
  nuevo(hace(0), 'ingles', 8, '07:42'),
  ...[1, 3, 5].map(n => nuevo(hace(n), 'gimnasio', 45)),
  nuevo(hace(0), 'gimnasio', 40, '08:30'),
  ...[1, 2].map(n => nuevo(hace(n), 'qa', 8)),
  nuevo(hace(4), 'baile', 30),
];

function resumen() {
  const m = new Map();
  for (const r of registros) {
    const k = `${r.fecha}|${r.actividad}`;
    const cur = m.get(k) || { fecha: r.fecha, actividad: r.actividad, minutos: 0, bloques: 0 };
    cur.minutos += r.minutos; cur.bloques++; m.set(k, cur);
  }
  return [...m.values()];
}

function builder(tabla) {
  let op = 'select', filtros = [], payload = null, orden = null, single = false;
  const b = {
    select() { if (op === 'select' || op === 'insert') {} return b; },
    insert(p) { op = 'insert'; payload = p; return b; },
    update(p) { op = 'update'; payload = p; return b; },
    delete() { op = 'delete'; return b; },
    eq(c, v) { filtros.push(r => r[c] === v); return b; },
    gte(c, v) { filtros.push(r => r[c] >= v); return b; },
    limit() { return b; },
    order(c, { ascending = true } = {}) { orden = { c, ascending }; return b; },
    single() { single = true; return b; },
    then(res) {
      const latencia = 250 + Math.random() * 250;
      setTimeout(() => {
        let data = null;
        if (op === 'insert') {
          const r = nuevo(payload.fecha, payload.actividad, payload.minutos, new Date().toTimeString().slice(0, 5));
          r.created_at = new Date().toISOString();
          registros.push(r); data = r;
        } else if (op === 'update') {
          registros.filter(r => filtros.every(f => f(r))).forEach(r => Object.assign(r, payload));
        } else if (op === 'delete') {
          for (let i = registros.length - 1; i >= 0; i--) if (filtros.every(f => f(registros[i]))) registros.splice(i, 1);
        } else {
          const src = tabla === 'resumen_diario' ? resumen() : registros.map(r => ({ ...r }));
          data = src.filter(r => filtros.every(f => f(r)));
          if (orden) data.sort((a, b) => (a[orden.c] < b[orden.c] ? -1 : 1) * (orden.ascending ? 1 : -1));
          if (single) data = data[0] ?? null;
        }
        res({ data, error: null });
      }, latencia);
    },
  };
  return b;
}

export default { from: builder };
