// ============================================================
//  Fechas del calendario de la gente, no instantes UTC.
//
//  Vive en su propio modulo (y no dentro de publico.js, donde nacio) porque ya
//  la usan dos zonas sin relacion entre si: el portal publico y el aviso del
//  respaldo. Que persistencia.js tuviera que importar del router publico para
//  saber que dia es seria una dependencia rara -- y arrastraria el router, la
//  BD y la auditoria detras.
// ============================================================

// Fecha del calendario LOCAL en formato YYYY-MM-DD.
// NO vale toISOString(), que da la fecha en UTC: Chile va cuatro horas por
// detras, asi que a las 20:00 hora local ya es el dia siguiente en UTC. Ese
// desfase ya mordio dos veces en este proyecto: los eventos de HOY desaparecian
// del portal cuatro horas antes de tiempo, y la clave diaria del aviso del
// respaldo se gastaba dos veces en una misma noche. Las fechas de `evento.fecha`
// son dias del calendario de la gente, no instantes UTC, y asi es como las
// cuenta tambien recordatorios.js (diasHasta).
export function fechaLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
