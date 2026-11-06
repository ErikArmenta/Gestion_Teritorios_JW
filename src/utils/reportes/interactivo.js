// Reporte interactivo: un archivo que se abre en cualquier navegador (también sin internet y desde WhatsApp).
// Logo y colores de la app, modo claro/oscuro, gráficas con detalle al tocar, tablas con búsqueda y orden,
// e imprimir. Todo el texto de usuario va escapado.
import { MARCA, calcularTotales, descargar, enDestino, escapar, esNumerica, logoPNG, metaCompleta, nombreSeguro, textoCelda, aFecha } from './comun';
import { graficaSVG, PALETA_CSS, coloresDona, colorDeSerie } from './graficas';

const colorSeguro = (c, defecto = MARCA.azul) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : defecto);

const CSS = `
:root{--acento:#2563EB;--bg:#F1F5F9;--card:#FFFFFF;--t1:#0F172A;--t2:#64748B;--rej:#E2E8F0;--borde:#E2E8F0;--zebra:#F8FAFC;--sombra:0 1px 2px rgba(15,23,42,.06),0 8px 24px rgba(15,23,42,.06)}
@media (prefers-color-scheme:dark){:root:not([data-tema=claro]){--bg:#0B1220;--card:#121B2E;--t1:#F1F5F9;--t2:#94A3B8;--rej:#22304A;--borde:#22304A;--zebra:#0F1829;--sombra:0 1px 2px rgba(0,0,0,.4)}}
:root[data-tema=oscuro]{--bg:#0B1220;--card:#121B2E;--t1:#F1F5F9;--t2:#94A3B8;--rej:#22304A;--borde:#22304A;--zebra:#0F1829;--sombra:0 1px 2px rgba(0,0,0,.4)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--t1);font:15px/1.5 Inter,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.cab{background:linear-gradient(135deg,#0F172A 0%,#1E293B 100%);color:#fff;padding:22px 16px 26px;border-bottom:4px solid var(--acento)}
.cab-in{max-width:1180px;margin:0 auto;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.logo{width:58px;height:58px;border-radius:14px;background:#fff;padding:3px;flex:none;box-shadow:0 4px 16px rgba(0,0,0,.3)}
.cab h1{margin:0;font-size:clamp(20px,4.5vw,28px);line-height:1.15;letter-spacing:-.02em}
.cab .sub{margin:4px 0 0;color:#93C5FD;font-weight:600;font-size:14px}
.meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.meta span{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:3px 10px;font-size:12px;color:#CBD5E1}
.meta b{color:#fff;font-weight:600}
.titulos{flex:1;min-width:220px}
.acciones{display:flex;gap:8px}
.btn{font:inherit;font-size:13px;font-weight:600;cursor:pointer;border-radius:10px;padding:8px 12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff}
.btn:hover{background:rgba(255,255,255,.16)}
main{max-width:1180px;margin:0 auto;padding:18px 16px 40px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:12px;margin-top:-34px}
@media (max-width:520px){.kpis{grid-template-columns:1fr 1fr}.kpi .v{font-size:24px}}
.kpi{background:var(--card);border-radius:16px;padding:14px 16px;box-shadow:var(--sombra);border:1px solid var(--borde);border-top:4px solid var(--c,var(--acento))}
.kpi .e{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--t2)}
.kpi .v{font-size:30px;font-weight:800;letter-spacing:-.02em;color:var(--c,var(--t1));line-height:1.1;margin:4px 0 2px;font-variant-numeric:tabular-nums}
.kpi .d{font-size:12.5px;color:var(--t2)}
.indice{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 4px}
.indice a{font-size:13px;font-weight:600;text-decoration:none;color:var(--t1);background:var(--card);border:1px solid var(--borde);border-radius:999px;padding:5px 12px}
.indice a:hover{border-color:var(--acento);color:var(--acento)}
.sec{background:var(--card);border:1px solid var(--borde);border-radius:18px;box-shadow:var(--sombra);padding:18px;margin-top:16px;scroll-margin-top:12px}
.sec h2{margin:0;font-size:18px;letter-spacing:-.01em;display:flex;align-items:center;gap:10px}
.sec h2:before{content:"";width:5px;height:20px;border-radius:3px;background:var(--c,var(--acento))}
.desc{margin:6px 0 0;color:var(--t2);font-size:13.5px}
.sec p.par{margin:10px 0 0;color:var(--t1)}
.graf{margin-top:12px;overflow-x:auto;-webkit-overflow-scrolling:touch}
.graf svg{width:100%;height:auto;display:block;overflow:visible}
.graf.ancha svg{min-width:560px}
.graf.dona svg{max-width:320px;margin:0 auto}
.pt{cursor:pointer;transition:opacity .15s}
.graf:hover .pt{opacity:.55}.graf .pt:hover{opacity:1}
.ley{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:10px;font-size:13px;color:var(--t2)}
.ley i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.ley b{color:var(--t1)}
.barra{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-top:12px}
.buscar{flex:1;min-width:180px;max-width:360px;font:inherit;font-size:16px;padding:9px 12px 9px 36px;border-radius:12px;border:1px solid var(--borde);background:var(--bg) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Ccircle cx='8' cy='8' r='6'/%3E%3Cpath d='m13 13 4 4'/%3E%3C/svg%3E") 11px 50%/16px no-repeat;color:var(--t1);outline:none}
.buscar:focus{border-color:var(--acento)}
.cuenta{font-size:12.5px;color:var(--t2)}
.tabla{overflow:auto;max-height:70vh;margin-top:10px;border:1px solid var(--borde);border-radius:12px}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th{position:sticky;top:0;background:var(--c,var(--acento));color:#fff;text-align:left;font-weight:700;padding:10px 12px;white-space:nowrap;cursor:pointer;user-select:none;z-index:1}
th.n,td.n{text-align:right;font-variant-numeric:tabular-nums}
th:after{content:"↕";opacity:.45;margin-left:6px;font-size:11px}
th[aria-sort=ascending]:after{content:"↑";opacity:1}th[aria-sort=descending]:after{content:"↓";opacity:1}
td{padding:9px 12px;border-top:1px solid var(--borde);vertical-align:top}
tbody tr:nth-child(even){background:var(--zebra)}
tbody tr:hover{background:color-mix(in srgb,var(--acento) 8%,transparent)}
tfoot td{font-weight:800;border-top:2px solid var(--c,var(--acento));background:color-mix(in srgb,var(--c,var(--acento)) 10%,var(--card))}
.chip{display:inline-block;font-weight:700;font-size:12px;padding:2px 9px;border-radius:999px;color:var(--k);background:color-mix(in srgb,var(--k) 15%,transparent);white-space:nowrap}
.vacio{padding:18px;text-align:center;color:var(--t2)}
footer{max-width:1180px;margin:0 auto;padding:0 16px 30px;color:var(--t2);font-size:12.5px;text-align:center}
.tip{position:fixed;z-index:9;pointer-events:none;background:#0F172A;color:#fff;font-size:13px;font-weight:600;padding:7px 10px;border-radius:9px;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:260px}
@media print{body{background:#fff}.acciones,.indice,.barra,.tip{display:none!important}.cab{-webkit-print-color-adjust:exact;print-color-adjust:exact}.sec{box-shadow:none;break-inside:avoid-page}.tabla{max-height:none;overflow:visible}th{position:static}.kpis{margin-top:12px}}
`;

const JS = `
(function(){
var raiz=document.documentElement,bt=document.getElementById('tema');
var guardado=null;try{guardado=localStorage.getItem('reporte_tema')}catch(e){}
if(guardado)raiz.setAttribute('data-tema',guardado);
bt&&bt.addEventListener('click',function(){var osc=raiz.getAttribute('data-tema')==='oscuro'||(!raiz.getAttribute('data-tema')&&matchMedia('(prefers-color-scheme: dark)').matches);var n=osc?'claro':'oscuro';raiz.setAttribute('data-tema',n);try{localStorage.setItem('reporte_tema',n)}catch(e){}});
var tip=document.getElementById('tip');
function mostrar(e,t){tip.textContent=t;tip.hidden=false;var x=Math.min(e.clientX+14,innerWidth-tip.offsetWidth-8),y=e.clientY-tip.offsetHeight-12;tip.style.left=Math.max(8,x)+'px';tip.style.top=(y<8?e.clientY+18:y)+'px'}
document.addEventListener('pointermove',function(e){var p=e.target.closest&&e.target.closest('.pt');if(p)mostrar(e,p.getAttribute('data-tip'));else tip.hidden=true});
document.addEventListener('pointerdown',function(e){var p=e.target.closest&&e.target.closest('.pt');if(p)mostrar(e,p.getAttribute('data-tip'));else tip.hidden=true});
function norm(s){return (s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase()}
document.querySelectorAll('[data-tabla]').forEach(function(sec){
var tb=sec.querySelector('tbody'),inp=sec.querySelector('.buscar'),cnt=sec.querySelector('.cuenta'),filas=[].slice.call(tb.rows),total=filas.length;
filas.forEach(function(r){r._t=norm(r.textContent)});
function contar(n){cnt.textContent=n===total?(total+(total===1?' fila':' filas')):(n+' de '+total+' filas')}
contar(total);
inp&&inp.addEventListener('input',function(){var q=norm(inp.value.trim()),n=0;filas.forEach(function(r){var v=!q||r._t.indexOf(q)>-1;r.style.display=v?'':'none';if(v)n++});contar(n)});
sec.querySelectorAll('th').forEach(function(th,i){th.addEventListener('click',function(){
var asc=th.getAttribute('aria-sort')!=='ascending';sec.querySelectorAll('th').forEach(function(o){o.removeAttribute('aria-sort')});th.setAttribute('aria-sort',asc?'ascending':'descending');
var num=th.classList.contains('n')||th.hasAttribute('data-fecha');
filas.sort(function(a,b){var x=a.cells[i],y=b.cells[i];var va=x.getAttribute('data-v'),vb=y.getAttribute('data-v');
if(num){va=va===''||va===null?-Infinity:+va;vb=vb===''||vb===null?-Infinity:+vb;return asc?va-vb:vb-va}
return asc?x.textContent.localeCompare(y.textContent,'es',{numeric:true}):y.textContent.localeCompare(x.textContent,'es',{numeric:true})});
filas.forEach(function(r){tb.appendChild(r)})})});
});
})();
`;

function kpisHTML(kpis) {
  if (!kpis?.length) return '';
  return `<section class="kpis">${kpis.map((k) => `<div class="kpi" style="--c:${colorSeguro(k.color)}"><div class="e">${escapar(k.etiqueta)}</div><div class="v">${escapar(k.valor)}</div>${k.detalle ? `<div class="d">${escapar(k.detalle)}</div>` : ''}</div>`).join('')}</section>`;
}

function leyendaHTML(g) {
  if (g.tipo === 'dona') {
    const colores = coloresDona(g);
    const vals = g.series[0]?.valores || [];
    const total = vals.reduce((s, v) => s + (Number(v) || 0), 0);
    return `<div class="ley">${g.etiquetas.map((e, i) => {
      const v = Number(vals[i]) || 0;
      return `<span><i style="background:${colorSeguro(colores[i])}"></i>${escapar(e)} <b>${v.toLocaleString('es-MX')}</b>${total ? ` · ${((v / total) * 100).toLocaleString('es-MX', { maximumFractionDigits: 1 })} %` : ''}</span>`;
    }).join('')}</div>`;
  }
  if ((g.series || []).length < 2) return '';
  return `<div class="ley">${g.series.map((s, i) => `<span><i style="background:${colorSeguro(colorDeSerie(s, i))}"></i>${escapar(s.nombre)}</span>`).join('')}</div>`;
}

function valorOrden(v, tipo) {
  if (v === null || v === undefined || v === '') return '';
  if (tipo === 'fecha' || tipo === 'fechaHora') { const d = aFecha(v); return d ? String(d.getTime()) : ''; }
  if (esNumerica(tipo)) { const n = Number(v); return Number.isFinite(n) ? String(n) : ''; }
  return null;
}

function tablaHTML(seccion, id) {
  const s = { ...seccion, columnas: seccion.columnas.filter((c) => enDestino(c, 'html')) };
  const cols = s.columnas;
  const th = cols.map((c) => `<th${esNumerica(c.tipo) ? ' class="n"' : ''}${c.tipo === 'fecha' || c.tipo === 'fechaHora' ? ' data-fecha' : ''} scope="col">${escapar(c.titulo)}</th>`).join('');
  const filas = s.filas.map((f) => `<tr>${cols.map((c) => {
    const v = f[c.clave];
    const orden = valorOrden(v, c.tipo);
    const texto = escapar(textoCelda(v, c.tipo));
    const chip = c.colores?.[v];
    const contenido = chip ? `<span class="chip" style="--k:${colorSeguro(chip)}">${texto}</span>` : texto;
    return `<td${esNumerica(c.tipo) ? ' class="n"' : ''}${orden !== null ? ` data-v="${escapar(orden)}"` : ''}>${contenido}</td>`;
  }).join('')}</tr>`).join('');
  const tot = calcularTotales(s);
  const pie = tot ? `<tfoot><tr>${cols.map((c) => `<td${esNumerica(c.tipo) ? ' class="n"' : ''}>${escapar(typeof tot[c.clave] === 'number' ? textoCelda(tot[c.clave], c.tipo) : (tot[c.clave] ?? ''))}</td>`).join('')}</tr></tfoot>` : '';
  return `<div class="barra"><input class="buscar" type="search" placeholder="Buscar en esta tabla…" aria-label="Buscar en ${escapar(s.titulo)}"><span class="cuenta"></span></div>`
    + `<div class="tabla"><table id="${id}"><thead><tr>${th}</tr></thead><tbody>${filas}</tbody>${pie}</table></div>`
    + (s.filas.length ? '' : '<div class="vacio">Sin datos</div>');
}

export async function exportarInteractivo(reporte) {
  const color = colorSeguro(reporte.color);
  const logo = await logoPNG();
  const secciones = (reporte.secciones || []).filter((s) => enDestino(s, 'html') && !(s.tipo === 'tabla' && !s.filas.length));
  const cuerpo = secciones.map((s, i) => {
    const id = `s${i + 1}`;
    const cab = `<h2>${escapar(s.titulo)}</h2>${s.descripcion ? `<p class="desc">${escapar(s.descripcion)}</p>` : ''}`;
    const estilo = s.color ? ` style="--c:${colorSeguro(s.color)}"` : '';
    if (s.tipo === 'texto') return `<section class="sec" id="${id}"${estilo}>${cab}${s.parrafos.map((p) => `<p class="par">${escapar(p)}</p>`).join('')}</section>`;
    if (s.tipo === 'grafica') {
      // Colores del tema: variables CSS como estilo (en atributos de SVG no todos los navegadores las leen)
      const svg = graficaSVG(s.grafica, { paleta: PALETA_CSS, leyenda: false })
        .replace(/ (fill|stroke)="(var\(--[a-z0-9]+\))"/g, ' style="$1:$2"');
      const clase = s.grafica.tipo === 'dona' ? 'graf dona' : 'graf ancha';
      return `<section class="sec" id="${id}"${estilo}>${cab}<div class="${clase}">${svg}</div>${leyendaHTML(s.grafica)}</section>`;
    }
    return `<section class="sec" id="${id}" data-tabla${estilo}>${cab}${tablaHTML(s, `t${i + 1}`)}</section>`;
  }).join('');
  const indice = secciones.length > 2
    ? `<nav class="indice">${secciones.map((s, i) => `<a href="#s${i + 1}">${escapar(s.titulo)}</a>`).join('')}</nav>` : '';
  const meta = metaCompleta(reporte).map((m) => `<span>${escapar(m.etiqueta)}: <b>${escapar(m.valor)}</b></span>`).join('');

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="generator" content="${escapar(MARCA.app)}">
<title>${escapar(reporte.titulo)}${reporte.subtitulo ? ` · ${escapar(reporte.subtitulo)}` : ''}</title>
${logo ? `<link rel="icon" href="${logo}">` : ''}
<style>${CSS.replace('--acento:#2563EB', `--acento:${color}`)}</style></head>
<body>
<header class="cab"><div class="cab-in">
${logo ? `<img class="logo" src="${logo}" alt="">` : ''}
<div class="titulos"><h1>${escapar(reporte.titulo)}</h1><p class="sub">${escapar([reporte.subtitulo, MARCA.app].filter(Boolean).join(' · '))}</p><div class="meta">${meta}</div></div>
<div class="acciones"><button class="btn" id="tema" type="button" title="Cambiar tema">◐ Tema</button><button class="btn" type="button" onclick="window.print()">Imprimir</button></div>
</div></header>
<main>${kpisHTML(reporte.kpis)}${indice}${cuerpo}</main>
<footer>${escapar(MARCA.app)} · Desarrollado por ${escapar(MARCA.autor)}</footer>
<div id="tip" class="tip" hidden></div>
<script>${JS}</script>
</body></html>`;
  descargar(new Blob([html], { type: 'text/html;charset=utf-8' }), `${nombreSeguro(reporte.archivo)}.html`);
}
