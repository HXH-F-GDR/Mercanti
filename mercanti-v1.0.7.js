/* =====================================================================
   NEGOZIO DEI MERCANTI - motore unico
   Nella pagina del mercante servono:
   - window.MERCANTE_CONFIG (listino, colori, testi), scritto prima di questo script;
   - un contenitore con id="mc-shop" (di solito la radice del layout);
   - sotto ogni articolo acquistabile: <div class="mc-qty" data-mc="Nome come nel LISTINO"></div>;
   - la barra di conferma: <div id="mc-bar"></div>, subito dopo il pannello che scorre.
   Facoltativo, per i mercanti che comprano dagli utenti (VENDITE nel config):
   - categorie 'elenco': <div class="mc-sell" data-mc-sell="Nome categoria"></div>
     (menu degli oggetti + lista di quelli aggiunti);
   - categorie 'quantita': <div class="mc-qty" data-mc-vendi="Nome voce"></div> sulla riga.
   Il genitore di ogni .mc-qty riceve la classe mc-on quando la voce e' nel carrello.
   Formati miniatura nel post: quadro, icona (contain), banner (4:1, sopra il testo), carta (1:2).
   ===================================================================== */
;(function () {
var CFG = window.MERCANTE_CONFIG;
var root = document.getElementById('mc-shop');
var bar = document.getElementById('mc-bar');
if (!CFG || !root || !bar || root.getAttribute('data-mc-ok')) { return; }
root.setAttribute('data-mc-ok', '1');

/* ---------- valori comuni a tutti i mercanti (il config li puo' sovrascrivere) ---------- */

var DEF = {
 SECTION_ID: 65118748,
 TEST_MODE: false,
 MAX_QTA: 99,
 VALUTA: 'Jenny',
 TOPICS_PER_PAGE: 30,
 MAX_PAGES: 20,
 TESTO_CONFERMA: '',
 RARITA: { comune: 'Comune', epico: 'Epico', leggendario: 'Leggendario', ultra: 'Ultra-leggendario', unico: 'Unico' },
 FONT_POST: { titolo: 'Calistoga,serif', sc: "'Alegreya Sans SC',sans-serif", testo: 'Montserrat,sans-serif' }
};
var TEMA_DEF = {
 cornice: '#25344A', cornicebordo: '#C9B98D', fondo: '#151A30', bordo: '#572425',
 riga: '#1C2240', linea: '#8C7A47', testo: '#E6DFD6', titoli: '#E9DCB4',
 secondario: '#B3A9B8', accento: '#BD5561', bottone: '#572425', bottonetesto: '#E9DCB4',
 font: 'Georgia,serif', fontTitoli: 'Georgia,serif'
};
var RAR_ORDER = ['unico', 'ultra', 'leggendario', 'epico', 'comune'];

var C = {}, T = {}, k;
for (k in DEF) { if (DEF.hasOwnProperty(k)) { C[k] = DEF[k]; } }
for (k in CFG) { if (CFG.hasOwnProperty(k)) { C[k] = CFG[k]; } }
for (k in TEMA_DEF) { if (TEMA_DEF.hasOwnProperty(k)) { T[k] = TEMA_DEF[k]; } }
if (C.TEMA) { for (k in C.TEMA) { if (C.TEMA.hasOwnProperty(k)) { T[k] = C.TEMA[k]; } } }
var M = C.MERCANTE || { id: 'mercante', nome: 'Mercante', titolo: '' };
var F = C.FONT_POST;
var HAS_SELL = !!(C.VENDITE && C.VENDITE.length);
var LBL_GO = C.TESTO_CONFERMA || (HAS_SELL ? 'Conferma' : 'Acquista');

var IH = 'inn' + 'erHTML';
var CATS = [];   /* categorie del listino (acquisti) */
var ITEMS = [];  /* voci in vendita, in ordine */
var QTA = [];    /* quantita' nel carrello, stesso indice di ITEMS */
var SLOTS = [];  /* elemento .mc-qty di ogni voce (null se nella pagina manca) */
var SCATS = [];  /* categorie delle vendite */
var LINES = [];  /* righe vendute: { id, sc, v, q, num, prezzo, slot, gone } */
var USER = null;
var busy = false;

/* ---------- utilita' ---------- */

function byId(id) { return document.getElementById(id); }
function later(f) { setTimeout(f, 0); }
function pad2(n) { var s = ('0' + n).slice(-2); return s; }
function pad3(n) { var s = ('00' + n).slice(-3); return s; }
function norm(s) { var out = String(s || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, ''); return out; }
function esc(s) {
 var out = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
 return out;
}
function fmt(n) { var s = String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return s; }
function money(n) { var s = fmt(n) + ' ' + C.VALUTA; return s; }
function signed(n) { var s = (n > 0 ? '+' : (n < 0 ? '−' : '')) + money(Math.abs(n)); return s; }
function nowStr() {
 var d = new Date();
 var s = pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
 return s;
}
function formato(f) { var s = (f === 'banner' || f === 'carta' || f === 'icona') ? f : 'quadro'; return s; }
function rarLabel(r) { var s = (C.RARITA && C.RARITA[r]) ? C.RARITA[r] : (r || ''); return s; }
function qtaLabel(it, q) {
 var s = it.unita ? (q + ' ' + (q === 1 ? it.unita[0] : it.unita[1])) : String(q);
 return s;
}
function addClass(el, c) { if (el && (' ' + el.className + ' ').indexOf(' ' + c + ' ') < 0) { el.className = norm(el.className + ' ' + c); } }
function delClass(el, c) { if (el) { el.className = norm((' ' + el.className + ' ').replace(' ' + c + ' ', ' ')); } }
function setStatus(msg, isErr) {
 var s = byId('mc-status');
 if (!s) { return; }
 s.textContent = msg || '';
 s.className = isErr ? 'mc-err' : '';
}

/* Utente loggato (stesso metodo di Greed Island) */
function getCurrentUser() {
 var anchors = document.querySelectorAll('a[href*="act=Profile"], a[href*="showuser="]');
 for (var i = 0; i < anchors.length; i++) {
  var href = anchors[i].getAttribute('href') || '';
  var mid = href.match(/MID=(\d+)/) || href.match(/showuser=(\d+)/);
  var name = (anchors[i].textContent || '').replace(/\s+/g, ' ').trim();
  if (mid && name) { return { id: mid[1], name: name }; }
 }
 return null;
}

/* ---------- stile dei selettori e della barra (colori dal TEMA) ---------- */

function injectCss() {
 if (byId('mc-shop-css')) { return; }
 var css = '' +
 /* selettori sotto gli articoli */
 ':where(#mc-shop) .mc-qty{display:flex;justify-content:center;align-items:center;margin:6px 0 0;font-family:var(--mc-font)}' +
 '#mc-shop .mc-qty:empty{display:none}' +
 '#mc-shop button.mc-b{display:inline-block;flex:0 0 auto;width:28px;height:28px;min-width:0;margin:0;padding:0;border:1px solid var(--mc-linea);border-radius:4px;background:var(--mc-fondo);color:var(--mc-titoli);font-family:var(--mc-font);font-size:17px;line-height:26px;text-align:center;cursor:pointer;box-shadow:none}' +
 '#mc-shop input.mc-in{display:inline-block;flex:0 0 auto;width:42px;height:28px;min-height:0;margin:0 4px;padding:0 2px;border:1px solid var(--mc-linea);border-radius:4px;background:var(--mc-fondo);color:var(--mc-testo);font-family:var(--mc-font);font-size:14px;text-align:center;box-shadow:none}' +
 '#mc-shop .mc-on > .mc-qty input.mc-in{border-color:var(--mc-accento);color:var(--mc-titoli)}' +
 /* vendite: menu + lista */
 '#mc-shop .mc-sell{display:flex;flex-direction:column;gap:8px;margin:4px 0 0;font-family:var(--mc-font);font-size:15px;color:var(--mc-testo);text-align:left}' +
 '#mc-shop .mc-sell-h{font-family:var(--mc-font-titoli);font-size:15px;font-weight:700;color:var(--mc-titoli)}' +
 '#mc-shop .mc-sell-f{display:flex;flex-wrap:wrap;align-items:center;gap:8px}' +
 '#mc-shop .mc-sell-f select{display:block;flex:1 1 220px;width:auto;min-width:0;height:34px;min-height:0;margin:0;padding:0 8px;background:var(--mc-riga);color:var(--mc-testo);border:1px solid var(--mc-linea);border-radius:4px;font-family:var(--mc-font);font-size:14px;box-shadow:none}' +
 '#mc-shop .mc-sell-f input.mc-num{display:block;flex:0 0 76px;width:76px;height:34px;min-height:0;margin:0;padding:0 8px;background:var(--mc-riga);color:var(--mc-testo);border:1px solid var(--mc-linea);border-radius:4px;font-family:var(--mc-font);font-size:14px;text-align:center;box-shadow:none}' +
 '#mc-shop button.mc-add{display:inline-block;flex:0 0 auto;width:auto;height:34px;margin:0;padding:0 14px;border:1px solid var(--mc-linea);border-radius:4px;background:var(--mc-fondo);color:var(--mc-titoli);font-family:var(--mc-font-titoli);font-size:14px;font-weight:700;cursor:pointer;box-shadow:none}' +
 '#mc-shop .mc-sell-l{display:flex;flex-direction:column;gap:4px}' +
 '#mc-shop .mc-sell-l:empty{display:none}' +
 '#mc-shop .mc-line{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;padding:5px 8px;background:var(--mc-riga);border-left:3px solid var(--mc-accento);border-radius:3px}' +
 '#mc-shop .mc-line-n{flex:1 1 160px;min-width:0;font-weight:600;color:var(--mc-titoli)}' +
 '#mc-shop .mc-line-n small{display:block;font-size:12px;font-weight:400;color:var(--mc-secondario)}' +
 '#mc-shop .mc-line-p{flex:0 0 auto;font-weight:700;color:var(--mc-titoli);white-space:nowrap}' +
 '#mc-shop .mc-line .mc-qty{margin:0}' +
 /* barra di conferma */
 '#mc-bar{min-width:0;max-width:100%;font-family:var(--mc-font);color:var(--mc-testo);font-size:14px;line-height:1.4;text-align:left}' +
 '#mc-bar .mc-top{display:flex;align-items:baseline;gap:10px;margin:0 0 8px}' +
 '#mc-bar .mc-t{font-family:var(--mc-font-titoli);font-size:15px;font-weight:700;color:var(--mc-titoli)}' +
 '#mc-bar .mc-count{flex:1 1 auto;min-width:0;font-size:13px;font-style:italic;color:var(--mc-secondario)}' +
 '#mc-bar .mc-tot{flex:0 0 auto;font-family:var(--mc-font-titoli);font-size:16px;font-weight:700;color:var(--mc-titoli);white-space:nowrap}' +
 '#mc-bar .mc-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}' +
 '#mc-bar select,#mc-bar input.mc-txt{display:block;height:36px;min-height:0;margin:0;padding:0 8px;background:var(--mc-riga);color:var(--mc-testo);border:1px solid var(--mc-linea);border-radius:4px;font-family:var(--mc-font);font-size:14px;box-shadow:none}' +
 '#mc-bar select{flex:1 1 200px;width:auto;min-width:0}' +
 '#mc-bar input.mc-txt{flex:0 0 110px;width:110px}' +
 '#mc-bar button.mc-go{display:inline-block;flex:0 0 auto;width:auto;height:36px;margin:0;padding:0 20px;border:1px solid var(--mc-cornicebordo);border-radius:4px;background:var(--mc-bottone);color:var(--mc-bottonetesto);font-family:var(--mc-font-titoli);font-size:14px;font-weight:700;letter-spacing:.05em;cursor:pointer;box-shadow:none}' +
 '#mc-bar button.mc-go2{padding:0 12px;background:transparent;color:var(--mc-secondario);border-color:var(--mc-linea)}' +
 '#mc-shop button[disabled]{opacity:.5;cursor:default}' +
 '#mc-bar .mc-hint{margin:6px 0 0;font-size:12px;font-style:italic;color:var(--mc-secondario)}' +
 '#mc-bar #mc-status{margin:6px 0 0;font-size:13px;color:var(--mc-titoli)}' +
 '#mc-bar #mc-status.mc-err{color:var(--mc-accento);font-weight:600}' +
 '#mc-bar .mc-hint:empty,#mc-bar #mc-status:empty,#mc-bar #mc-result:empty{display:none}' +
 '#mc-bar #mc-result{margin:10px 0 0;padding:10px 0 0;border-top:1px dashed var(--mc-linea)}' +
 '#mc-bar .mc-preview{padding:12px 8px;background:#8FBEBA;border-radius:6px;overflow-wrap:break-word}' +
 '#mc-bar .mc-act{display:flex;justify-content:center;gap:8px;margin:10px 0 2px}' +
 '#mc-bar textarea{display:block;width:100%;min-height:110px;margin:8px 0 0;padding:6px;font-size:11px;background:var(--mc-riga);color:var(--mc-testo);border:1px solid var(--mc-linea);box-sizing:border-box}' +
 /* mobile */
 'body.ffm #mc-bar .mc-preview{padding:8px 4px}' +
 'body.ffm #mc-bar .mc-top{flex-wrap:wrap;row-gap:2px}' +
 'body.ffm #mc-bar .mc-t{flex:1 1 auto}' +
 'body.ffm #mc-bar .mc-count{order:3;flex:1 1 100%}' +
 'body.ffm #mc-bar select{flex:1 1 100%}' +
 'body.ffm #mc-bar input.mc-txt{flex:1 1 auto;width:auto;min-width:0}' +
 'body.ffm #mc-shop .mc-sell-f select{flex:1 1 100%}' +
 'body.ffm #mc-shop .mc-sell-f input.mc-num{flex:1 1 60px;width:auto;min-width:0}';
 var st = document.createElement('style');
 st.id = 'mc-shop-css';
 st.textContent = css;
 (document.head || document.body).appendChild(st);

 var vars = ['cornice', 'cornicebordo', 'fondo', 'bordo', 'riga', 'linea', 'testo', 'titoli', 'secondario', 'accento', 'bottone', 'bottonetesto'];
 for (var i = 0; i < vars.length; i++) { root.style.setProperty('--mc-' + vars[i], T[vars[i]]); }
 root.style.setProperty('--mc-font', T.font);
 root.style.setProperty('--mc-font-titoli', T.fontTitoli);
}

/* ---------- listino (acquisti) ---------- */

function qtyHtml(attr, id, inputId, label) {
 var s = '<button type="button" class="mc-b" ' + attr + '="-1" data-' + id[0] + '="' + id[1] + '" title="Togli">&minus;</button>' +
  '<input type="text" inputmode="numeric" class="mc-in" id="' + inputId + '" data-' + id[0] + '="' + id[1] + '" value="0" maxlength="3" aria-label="Quantit&agrave; ' + esc(label) + '">' +
  '<button type="button" class="mc-b" ' + attr + '="1" data-' + id[0] + '="' + id[1] + '" title="Aggiungi">+</button>';
 return s;
}

function readListino() {
 var lst = C.LISTINO || [], i, j, cat, v;
 for (i = 0; i < lst.length; i++) {
  cat = lst[i];
  var ci = CATS.length;
  CATS.push({ nome: cat.categoria, formato: formato(cat.formato) });
  for (j = 0; j < (cat.voci || []).length; j++) {
   v = cat.voci[j];
   if (v.off) { continue; }
   ITEMS.push({ cat: ci, nome: v.nome, prezzo: Number(v.prezzo) || 0, img: v.img || '', unita: cat.unita || null, formato: CATS[ci].formato });
   QTA.push(0);
   SLOTS.push(null);
  }
 }
}

function warn(msg) { if (window.console) { window.console.warn('Negozio: ' + msg); } }

function buildSlots() {
 var byName = {}, i, slots = root.querySelectorAll('.mc-qty[data-mc]');
 for (i = 0; i < ITEMS.length; i++) { byName[norm(ITEMS[i].nome)] = i; }
 for (i = 0; i < slots.length; i++) {
  var nm = norm(slots[i].getAttribute('data-mc'));
  if (!byName.hasOwnProperty(nm)) { warn('"' + nm + '" non e\' nel LISTINO (o e\' off)'); continue; }
  var idx = byName[nm];
  SLOTS[idx] = slots[i];
  slots[i][IH] = qtyHtml('data-op', ['i', idx], 'mc-q-' + idx, ITEMS[idx].nome);
 }
}

/* ---------- vendite ---------- */

function sellPrice(sc, v, num) {
 var p = sc.tipo === 'quantita' ? (Number(v.prezzo) || 0) : (Number((sc.prezzi || {})[v.rar]) || 0);
 if (sc.numerato && sc.bonusPrimo && num === 1) { p = Math.round(p * (1 + sc.bonusPrimo)); }
 return p;
}

function newLine(sc, vi, num, slot) {
 var sCat = SCATS[sc], v = sCat.voci[vi];
 var l = { id: LINES.length, sc: sc, vi: vi, v: v, q: 0, num: num, prezzo: sellPrice(sCat, v, num), slot: slot || null, gone: false };
 LINES.push(l);
 return l;
}

function readVendite() {
 var lst = C.VENDITE || [], i, j;
 for (i = 0; i < lst.length; i++) {
  var s = lst[i];
  SCATS.push({
   nome: s.categoria, tipo: (s.tipo === 'quantita' ? 'quantita' : 'elenco'), formato: formato(s.formato),
   variante: s.variante || '', prezzi: s.prezzi || {}, numerato: s.numerato || null, bonusPrimo: Number(s.bonusPrimo) || 0,
   voci: s.voci || [], el: null
  });
 }
 /* righe fisse per le categorie a quantita' */
 var vslots = root.querySelectorAll('.mc-qty[data-mc-vendi]'), byName = {};
 for (i = 0; i < SCATS.length; i++) {
  if (SCATS[i].tipo !== 'quantita') { continue; }
  for (j = 0; j < SCATS[i].voci.length; j++) { byName[norm(SCATS[i].voci[j].nome)] = [i, j]; }
 }
 for (i = 0; i < vslots.length; i++) {
  var nm = norm(vslots[i].getAttribute('data-mc-vendi'));
  if (!byName.hasOwnProperty(nm)) { warn('"' + nm + '" non e\' tra le VENDITE a quantita\''); continue; }
  var l = newLine(byName[nm][0], byName[nm][1], null, vslots[i]);
  vslots[i][IH] = qtyHtml('data-sop', ['l', l.id], 'mc-sq-' + l.id, l.v.nome);
 }
 /* menu per le categorie a elenco */
 var boxes = root.querySelectorAll('.mc-sell[data-mc-sell]'), byCat = {};
 for (i = 0; i < SCATS.length; i++) { byCat[norm(SCATS[i].nome)] = i; }
 for (i = 0; i < boxes.length; i++) {
  var cn = norm(boxes[i].getAttribute('data-mc-sell'));
  if (!byCat.hasOwnProperty(cn) || SCATS[byCat[cn]].tipo !== 'elenco') { warn('"' + cn + '" non e\' tra le VENDITE a elenco'); continue; }
  buildSellBox(byCat[cn], boxes[i]);
 }
}

function buildSellBox(sc, box) {
 var s = SCATS[sc], groups = {}, r, j, h;
 s.el = box;
 for (j = 0; j < s.voci.length; j++) {
  r = s.voci[j].rar || '';
  if (!groups[r]) { groups[r] = []; }
  groups[r].push(j);
 }
 h = '<div class="mc-sell-h">Vendi a ' + esc(M.nome) + '</div><div class="mc-sell-f">' +
  '<select id="mc-ss-' + sc + '" aria-label="Oggetto da vendere"><option value="">-- Scegli l\'oggetto --</option>';
 for (var o = 0; o < RAR_ORDER.length; o++) {
  r = RAR_ORDER[o];
  if (!groups[r]) { continue; }
  var lab = rarLabel(r) + ' · ' + money(Number(s.prezzi[r]) || 0) + (s.numerato && s.numerato[r] ? ' · serie da ' + s.numerato[r] : '');
  h += '<optgroup label="' + esc(lab) + '">';
  for (j = 0; j < groups[r].length; j++) { h += '<option value="' + groups[r][j] + '">' + esc(s.voci[groups[r][j]].nome) + '</option>'; }
  h += '</optgroup>';
 }
 h += '</select>';
 if (s.numerato) {
  h += '<input type="text" inputmode="numeric" class="mc-num" id="mc-sn-' + sc + '" maxlength="3" placeholder="N°" title="Numero dell\'esemplare, es. 001">';
 }
 h += '<button type="button" class="mc-add" data-sadd="' + sc + '">Aggiungi</button></div>' +
  '<div class="mc-sell-l" id="mc-sl-' + sc + '"></div>';
 box[IH] = h;
}

function lineDetail(l, withQty) {
 var s = SCATS[l.sc], parts = [];
 if (s.variante) { parts.push(s.variante + (l.num ? ' ' + pad3(l.num) + '/' + pad3(s.numerato[l.v.rar]) : '')); }
 if (l.v.rar) { parts.push(rarLabel(l.v.rar)); }
 if (l.num === 1 && s.bonusPrimo) { parts.push('+' + Math.round(s.bonusPrimo * 100) + '% numero 1'); }
 var out = parts.join(' · ');
 if (withQty) { out += (out ? ' — ' : '') + l.q + ' × ' + money(l.prezzo); }
 return out;
}

function renderSellList(sc) {
 var box = byId('mc-sl-' + sc);
 if (!box) { return; }
 var h = '', s = SCATS[sc];
 for (var i = 0; i < LINES.length; i++) {
  var l = LINES[i];
  if (l.sc !== sc || l.gone || l.slot) { continue; }
  h += '<div class="mc-line"><span class="mc-line-n">' + esc(l.v.nome) + '<small>' + esc(lineDetail(l, false)) + '</small></span>' +
   '<span class="mc-line-p">' + money(l.prezzo) + '</span>';
  if (s.numerato) {
   h += '<button type="button" class="mc-b" data-srem="' + l.id + '" title="Togli">&times;</button>';
  } else {
   h += '<span class="mc-qty">' + qtyHtml('data-sop', ['l', l.id], 'mc-sq-' + l.id, l.v.nome) + '</span>';
  }
  h += '</div>';
 }
 box[IH] = h;
 for (i = 0; i < LINES.length; i++) {
  var inp = byId('mc-sq-' + LINES[i].id);
  if (inp && LINES[i].sc === sc && !LINES[i].slot) { inp.value = String(LINES[i].q); }
 }
}

function addSell(sc) {
 if (busy) { return; }
 var s = SCATS[sc], sel = byId('mc-ss-' + sc);
 if (!sel || sel.value === '') { setStatus('Scegli l\'oggetto da vendere.', true); return; }
 var vi = parseInt(sel.value, 10), v = s.voci[vi], num = null, i;
 if (s.numerato) {
  var ni = byId('mc-sn-' + sc), lim = s.numerato[v.rar];
  num = parseInt((ni.value || '').replace(/\D/g, ''), 10);
  if (!num || num < 1 || num > lim) { setStatus('Scrivi il numero dell\'esemplare (da 001 a ' + pad3(lim) + ').', true); return; }
  for (i = 0; i < LINES.length; i++) {
   if (!LINES[i].gone && LINES[i].sc === sc && LINES[i].vi === vi && LINES[i].num === num) { setStatus('Hai gia\' aggiunto ' + v.nome + ' ' + pad3(num) + '.', true); return; }
  }
  newLine(sc, vi, num).q = 1;
  ni.value = '';
 } else {
  var found = null;
  for (i = 0; i < LINES.length; i++) { if (!LINES[i].gone && !LINES[i].slot && LINES[i].sc === sc && LINES[i].vi === vi) { found = LINES[i]; } }
  if (found) { found.q = Math.min(C.MAX_QTA, found.q + 1); } else { newLine(sc, vi, null).q = 1; }
 }
 sel.value = '';
 setStatus('');
 renderSellList(sc);
 updateSum();
}

function setLineQ(id, v, fromInput) {
 var l = LINES[id];
 if (busy || !l || l.gone) { return; }
 v = parseInt(v, 10) || 0;
 if (v < 0) { v = 0; }
 if (v > C.MAX_QTA) { v = C.MAX_QTA; }
 l.q = v;
 if (!l.slot && v === 0 && !fromInput) { l.gone = true; renderSellList(l.sc); updateSum(); return; }
 var inp = byId('mc-sq-' + id);
 if (inp && !(fromInput && inp.value === '') && inp.value !== String(v)) { inp.value = String(v); }
 if (l.slot) { if (v > 0) { addClass(l.slot.parentNode, 'mc-on'); } else { delClass(l.slot.parentNode, 'mc-on'); } }
 updateSum();
}

function removeLine(id) {
 var l = LINES[id];
 if (busy || !l) { return; }
 l.gone = true;
 renderSellList(l.sc);
 updateSum();
}

/* ---------- barra ---------- */

function buildBar() {
 bar[IH] = '<div class="mc-top"><span class="mc-t">Carrello</span><span class="mc-count" id="mc-count"></span><span class="mc-tot" id="mc-tot"></span></div>' +
  '<div class="mc-row">' +
  '<select id="mc-topic" title="La tua Lista della Spesa"><option value="">Caricamento liste...</option></select>' +
  '<input class="mc-txt" id="mc-topic-manual" type="text" inputmode="numeric" placeholder="ID topic" title="Se la tua Lista della Spesa non compare nel menu, scrivi qui l\'ID del topic">' +
  '<button type="button" class="mc-go" id="mc-go">' + esc(LBL_GO) + '</button>' +
  '<button type="button" class="mc-go mc-go2" id="mc-clear" title="Svuota il carrello">Svuota</button>' +
  '</div>' +
  '<div class="mc-hint" id="mc-topic-hint"></div>' +
  '<div id="mc-status"></div>' +
  '<div id="mc-result"></div>';
}

function setQta(i, v, fromInput) {
 if (busy || !ITEMS[i]) { return; }
 v = parseInt(v, 10) || 0;
 if (v < 0) { v = 0; }
 if (v > C.MAX_QTA) { v = C.MAX_QTA; }
 QTA[i] = v;
 var inp = byId('mc-q-' + i);
 if (inp && !(fromInput && inp.value === '') && inp.value !== String(v)) { inp.value = String(v); }
 var parent = SLOTS[i] ? SLOTS[i].parentNode : null;
 if (v > 0) { addClass(parent, 'mc-on'); } else { delClass(parent, 'mc-on'); }
 updateSum();
}

function cart() {
 var out = [];
 for (var i = 0; i < ITEMS.length; i++) { if (QTA[i] > 0) { out.push({ it: ITEMS[i], q: QTA[i], sub: ITEMS[i].prezzo * QTA[i] }); } }
 return out;
}
function cartSell() {
 var out = [];
 for (var i = 0; i < LINES.length; i++) { if (!LINES[i].gone && LINES[i].q > 0) { out.push({ l: LINES[i], sub: LINES[i].prezzo * LINES[i].q }); } }
 return out;
}
function total(c) { var t = 0; for (var i = 0; i < c.length; i++) { t += c[i].sub; } return t; }

function updateSum() {
 var c = cart(), sv = cartSell(), pezzi = 0, i, parts = [];
 for (i = 0; i < c.length; i++) { pezzi += c[i].q; }
 if (c.length) { parts.push(c.length + (c.length === 1 ? ' acquisto' : ' acquisti') + (pezzi !== c.length ? ' (' + pezzi + ' pezzi)' : '')); }
 if (sv.length) { parts.push(sv.length + (sv.length === 1 ? ' vendita' : ' vendite')); }
 if (!HAS_SELL && c.length) { parts = [c.length + (c.length === 1 ? ' articolo' : ' articoli') + (pezzi !== c.length ? ' (' + pezzi + ' pezzi)' : '')]; }
 byId('mc-count').textContent = parts.length ? parts.join(' · ') :
  (HAS_SELL ? 'vuoto: scegli cosa comprare o vendere' : 'vuoto: scegli le quantità nel listino');
 byId('mc-tot').textContent = sv.length ? ('Saldo ' + signed(total(sv) - total(c))) : money(total(c));
}

function clearAll() {
 var i;
 for (i = 0; i < ITEMS.length; i++) { if (QTA[i]) { setQta(i, 0); } }
 for (i = 0; i < LINES.length; i++) {
  if (LINES[i].slot) { if (LINES[i].q) { setLineQ(LINES[i].id, 0); } }
  else { LINES[i].gone = true; }
 }
 for (i = 0; i < SCATS.length; i++) { if (SCATS[i].tipo === 'elenco') { renderSellList(i); } }
 updateSum();
 setStatus('');
}

function bindUi() {
 root.addEventListener('click', function (e) {
  var b = e.target;
  if (!b || !b.getAttribute) { return; }
  var op = b.getAttribute('data-op'), sop = b.getAttribute('data-sop'), sadd = b.getAttribute('data-sadd'), srem = b.getAttribute('data-srem');
  if (op) {
   e.preventDefault();
   var i = parseInt(b.getAttribute('data-i'), 10);
   setQta(i, QTA[i] + parseInt(op, 10));
  } else if (sop) {
   e.preventDefault();
   var id = parseInt(b.getAttribute('data-l'), 10);
   setLineQ(id, LINES[id].q + parseInt(sop, 10));
  } else if (sadd !== null && sadd !== '') {
   e.preventDefault();
   addSell(parseInt(sadd, 10));
  } else if (srem !== null && srem !== '') {
   e.preventDefault();
   removeLine(parseInt(srem, 10));
  }
 });
 root.addEventListener('input', function (e) {
  var t = e.target;
  if (!t || t.className !== 'mc-in') { return; }
  var clean = t.value.replace(/\D/g, '');
  if (clean !== t.value) { t.value = clean; }
  if (t.getAttribute('data-l') !== null) { setLineQ(parseInt(t.getAttribute('data-l'), 10), clean, true); }
  else { setQta(parseInt(t.getAttribute('data-i'), 10), clean, true); }
 });
 root.addEventListener('change', function (e) {
  var t = e.target;
  if (!t || t.className !== 'mc-in' || t.value !== '') { return; }
  if (t.getAttribute('data-l') !== null) {
   var l = LINES[parseInt(t.getAttribute('data-l'), 10)];
   if (l && !l.slot) { setLineQ(l.id, 0); return; }
  }
  t.value = '0';
 });
 byId('mc-clear').addEventListener('click', clearAll);
 byId('mc-go').addEventListener('click', onGo);
}

/* ---------- HTML del post (una riga, stili inline, colori del mercante) ---------- */

function scStyle(size, color) {
 var s = 'font-family:' + F.sc + ';font-size:' + size + 'px;color:' + color + ';';
 return s;
}
/* miniature nel post: i banner stanno sopra il testo (cosi' su mobile il testo resta largo),
   quadri, icone e carte a sinistra */
var THUMB_POST = { quadro: [44, 44], icona: [44, 44], carta: [30, 60] };

function infoRow(label, val) {
 var s = '<tr><td style="width:95px;padding:2px 0;border:0;background:transparent;' + scStyle(14, T.secondario) + '">' + label + '</td>' +
  '<td style="padding:2px 0;border:0;background:transparent;color:' + T.testo + ';">' + val + '</td></tr>';
 return s;
}

function rowPost(nome, img, fmtThumb, detail, sub) {
 var h = '<div style="margin:4px 0 0;padding:6px 8px;background:' + T.riga + ';border-radius:4px;overflow:hidden;">';
 if (img && fmtThumb === 'banner') {
  h += '<img style="display:block;width:100%;max-width:260px;height:auto;aspect-ratio:4/1;object-fit:cover;margin:0 0 6px;border:1px solid ' + T.linea + ';border-radius:3px;" src="' + esc(img) + '">';
 } else if (img) {
  var sz = THUMB_POST[fmtThumb];
  var fit = fmtThumb === 'icona' ? 'object-fit:contain;padding:4px;box-sizing:border-box;background:' + T.fondo + ';' : 'object-fit:cover;';
  h += '<img style="float:left;width:' + sz[0] + 'px;height:' + sz[1] + 'px;' + fit + 'margin:0 10px 0 0;border:1px solid ' + T.linea + ';border-radius:3px;" src="' + esc(img) + '">';
 }
 h += '<div style="overflow:hidden;">';
 h += '<div style="font-weight:bold;color:' + T.titoli + ';">' + esc(nome) + '</div>';
 h += '<div style="font-size:12px;color:' + T.secondario + ';">' + detail + ' <span style="float:right;margin:0 0 0 8px;font-size:13px;font-weight:bold;white-space:nowrap;color:' + T.titoli + ';">' + sub + '</span></div>';
 h += '</div></div>';
 return h;
}

function catLabel(txt) {
 var s = '<div style="' + scStyle(15, T.accento) + 'margin:12px 0 0;">' + esc(txt) + '</div>';
 return s;
}
function sectionLabel(txt) {
 var s = '<div style="' + scStyle(18, T.titoli) + 'margin:16px 0 0;padding:0 0 3px;border-bottom:1px solid ' + T.linea + ';">' + esc(txt) + '</div>';
 return s;
}
function totRow(label, val, big) {
 var s = '<tr><td style="padding:4px 0 0;border:0;background:transparent;white-space:nowrap;' + scStyle(big ? 17 : 15, big ? T.titoli : T.secondario) + '">' + label + '</td>' +
  '<td style="padding:4px 10px 0 0;border:0;background:transparent;text-align:right;white-space:nowrap;' +
  (big ? 'font-family:' + F.titolo + ';font-size:20px;' : 'font-weight:bold;') + 'color:' + T.titoli + ';">' + val + '</td></tr>';
 return s;
}

function buildPost(c, sv) {
 var i, ci, rows;
 var h = '<div style="max-width:600px;margin:0 auto;padding:7px;background:' + T.cornice + ';border:1px solid ' + T.cornicebordo + ';border-radius:3px;text-align:left;">';
 h += '<div style="padding:14px 12px;background:' + T.fondo + ';border:1px solid ' + T.bordo + ';border-radius:2px;font-family:' + F.testo + ';font-size:13px;line-height:1.45;color:' + T.testo + ';">';
 h += '<div style="font-family:' + F.titolo + ';font-size:26px;color:' + T.titoli + ';text-align:center;letter-spacing:1px;">' + esc(M.nome) + '</div>';
 if (M.titolo) { h += '<div style="' + scStyle(15, T.secondario) + 'text-align:center;">' + esc(M.titolo) + '</div>'; }
 h += '<div style="height:1px;margin:10px 0 12px;background:linear-gradient(90deg,' + T.accento + ',' + T.fondo + ');"></div>';
 h += '<table style="width:100%;border-collapse:collapse;border:0;margin:0 0 4px;">' +
  infoRow(HAS_SELL ? 'Utente' : 'Acquirente', esc(USER.name)) + infoRow('Data', nowStr()) + '</table>';

 if (c.length) {
  if (sv.length) { h += sectionLabel('Acquisti'); }
  for (ci = 0; ci < CATS.length; ci++) {
   rows = '';
   for (i = 0; i < c.length; i++) {
    if (c[i].it.cat !== ci) { continue; }
    rows += rowPost(c[i].it.nome, c[i].it.img, c[i].it.formato, esc(qtaLabel(c[i].it, c[i].q)) + ' &times; ' + money(c[i].it.prezzo), money(c[i].sub));
   }
   if (rows) { h += catLabel(CATS[ci].nome) + rows; }
  }
 }
 if (sv.length) {
  h += sectionLabel('Vendite a ' + M.nome);
  for (ci = 0; ci < SCATS.length; ci++) {
   rows = '';
   for (i = 0; i < sv.length; i++) {
    var l = sv[i].l;
    if (l.sc !== ci) { continue; }
    rows += rowPost(l.v.nome, l.v.img || '', SCATS[ci].formato, esc(lineDetail(l, true)).replace(' × ', ' &times; '), money(sv[i].sub));
   }
   if (rows) { h += catLabel(SCATS[ci].nome) + rows; }
  }
 }

 h += '<table style="width:100%;border-collapse:collapse;border:0;margin:12px 0 0;border-top:1px solid ' + T.linea + ';">';
 if (sv.length && c.length) {
  h += totRow('Totale acquisti', money(total(c)), false) + totRow('Totale vendite', money(total(sv)), false) +
   totRow('Saldo', signed(total(sv) - total(c)), true);
 } else if (sv.length) {
  h += totRow('Totale vendite', money(total(sv)), true);
 } else {
  h += totRow('Totale', money(total(c)), true);
 }
 h += '</table>';
 h += '</div></div>';
 return h;
}

/* ---------- liste della spesa dell'utente (come nell'apertura pack) ---------- */

function rowOf(a) {
 var n = a, k2 = 0;
 while (n && k2 < 10) {
  if (n.tagName === 'LI' || n.tagName === 'TR') { return n; }
  n = n.parentNode; k2++;
 }
 return null;
}
function decodeTitle(t) {
 var d = new DOMParser().parseFromString('<b>' + String(t || '') + '</b>', 'text/html');
 var out = (d.body.textContent || '').replace(/\s+/g, ' ').trim();
 return out;
}

function loadMyLists() {
 var sel = byId('mc-topic'), hint = byId('mc-topic-hint');
 var mine = [];

 function fill(failed) {
  sel[IH] = '';
  var o;
  if (!mine.length) {
   o = document.createElement('option'); o.value = ''; o.text = 'Nessuna lista trovata';
   sel.appendChild(o);
   hint.textContent = failed ? 'Non riesco a leggere la sezione: scrivi l\'ID del topic della tua Lista della Spesa.' :
    'Non ho trovato topic aperti da te nella sezione: scrivi l\'ID del topic della tua Lista della Spesa.';
   return;
  }
  if (mine.length > 1) { o = document.createElement('option'); o.value = ''; o.text = '-- Scegli la tua Lista della Spesa --'; sel.appendChild(o); }
  for (var i = 0; i < mine.length; i++) {
   o = document.createElement('option'); o.value = mine[i].id; o.text = mine[i].title;
   sel.appendChild(o);
  }
  hint.textContent = '';
 }

 var perPage = 100, page = 0;
 function apiPage() {
  fetch('/api.php?f=' + C.SECTION_ID + '&a=2&n=' + perPage + '&st=' + (page * perPage) + '&cook' + 'ie=1&_=' + Date.now(), { credentials: 'same-origin' })
   .then(function (r) { if (!r.ok) { throw new Error('HTTP ' + r.status); } var j = r.json(); return j; })
   .then(function (data) {
    var th = (data && data.threads) ? data.threads : [];
    for (var i = 0; i < th.length; i++) {
     var t = th[i];
     if (!t.info || !t.info.start) { continue; }
     if (String(t.info.start.id) === String(USER.id)) { mine.push({ id: String(t.id), title: decodeTitle(t.title) }); }
    }
    if (th.length === perPage && page < C.MAX_PAGES) { page++; apiPage(); }
    else { fill(false); }
   })
   .catch(function () { mine = []; htmlPages(); });
 }

 var seen = {}, st = 0, pages = 0;
 function htmlPages() {
  fetch('/?f=' + C.SECTION_ID + '&st=' + st, { credentials: 'same-origin' })
   .then(function (r) { var tx = r.text(); return tx; })
   .then(function (html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var anchors = doc.querySelectorAll('a[href*="t="]');
    var fresh = 0;
    for (var i = 0; i < anchors.length; i++) {
     var href = anchors[i].getAttribute('href') || '';
     var m = href.match(/[?&]t=(\d+)/);
     if (!m || /[?&](st|view)=|#/.test(href)) { continue; }
     var title = (anchors[i].textContent || '').replace(/\s+/g, ' ').trim();
     if (!title || seen[m[1]]) { continue; }
     seen[m[1]] = true; fresh++;
     var row = rowOf(anchors[i]);
     var owner = row ? row.querySelector('a[href*="MID="], a[href*="showuser="]') : null;
     var oh = owner ? (owner.getAttribute('href') || '') : '';
     var om = oh.match(/MID=(\d+)/) || oh.match(/showuser=(\d+)/);
     if (om && om[1] === String(USER.id)) { mine.push({ id: m[1], title: title }); }
    }
    pages++;
    if (fresh > 0 && pages < C.MAX_PAGES) { st += C.TOPICS_PER_PAGE; htmlPages(); }
    else { fill(false); }
   })
   .catch(function () { fill(true); });
 }

 apiPage();
}

/* ---------- invio del post (stesso metodo di Greed Island / apertura pack) ---------- */

function postReply(sectionId, topicId, content, callback) {
 var host = 'https://' + location.hostname;
 fetch(host + '/?act=Post&CODE=02&f=' + sectionId + '&t=' + topicId, { credentials: 'same-origin' })
  .then(function (r) { var tx = r.text(); return tx; })
  .then(function (page) {
   var doc = new DOMParser().parseFromString(page, 'text/html');
   var form = doc.getElementById('REPLIER_POST');
   if (!form) { later(function () { callback(false); }); return null; }
   function campo(nome, fallback) {
    try { if (form[nome] && typeof form[nome].value !== 'undefined') { return form[nome].value; } } catch (e) {}
    return fallback;
   }
   var fd = new FormData();
   fd.set('st', campo('st', '0'));
   fd.set('act', campo('act', 'Post'));
   fd.set('s', campo('s', ''));
   fd.set('CODE', campo('CODE', '03'));
   fd.set('f', campo('f', String(sectionId)));
   fd.set('t', campo('t', String(topicId)));
   fd.set('Post', content);
   fd.set('enablesig', '1');
   fd.set('track_topic', '1');
   fd.set('charset', 'UTF-8');
   if (form.MAX_FILE_SIZE) { fd.set('MAX_FILE_SIZE', form.MAX_FILE_SIZE.value); }
   if (form.check) { fd.set('check', form.check.value); }
   var p = fetch(host + '/', { method: 'POST', body: fd, credentials: 'same-origin' })
    .then(function (r) { later(function () { callback(r.ok); }); });
   return p;
  })
  .catch(function () { later(function () { callback(false); }); });
}


function unlock() { busy = false; byId('mc-go').disabled = false; byId('mc-clear').disabled = false; }

/* Quando la barra si allarga, il pannello che scorre (l'elemento subito prima della barra)
   mantiene la sua altezza e i contenitori sopra crescono verso il basso invece di comprimerlo. */
var frozen = [];
function freezeBox(on) {
 var pan = bar.previousElementSibling, i;
 if (on) {
  if (frozen.length || !pan) { return; }
  var ov = window.getComputedStyle(pan).overflowY;
  if (ov !== 'auto' && ov !== 'scroll') { return; }
  frozen.push([pan, pan.style.height, pan.style.flex]);
  pan.style.height = pan.offsetHeight + 'px';
  pan.style.flex = '0 0 auto';
  /* tutti i contenitori sopra la barra (fino alla radice) perdono l'altezza fissa */
  for (var el = bar.parentNode; el && el !== root.parentNode; el = el.parentNode) {
   frozen.push([el, el.style.height, el.style.flex]);
   el.style.height = 'auto';
  }
 } else {
  for (i = 0; i < frozen.length; i++) { frozen[i][0].style.height = frozen[i][1]; frozen[i][0].style.flex = frozen[i][2]; }
  frozen = [];
 }
}

function closeResult() { byId('mc-result')[IH] = ''; setStatus(''); freezeBox(false); }

function actionButton(label, secondary, fn) {
 var b = document.createElement('button');
 b.type = 'button';
 b.className = secondary ? 'mc-go mc-go2' : 'mc-go';
 b.textContent = label;
 b.addEventListener('click', fn);
 return b;
}

function showResult(html, mode, topicId) {
 freezeBox(true);
 var res = byId('mc-result');
 res[IH] = '';
 var prev = document.createElement('div');
 prev.className = 'mc-preview';
 prev[IH] = html;
 var act = document.createElement('div');
 act.className = 'mc-act';

 if (mode === 'ok') {
  setStatus('Fatto! Il riepilogo e\' stato postato nella tua Lista della Spesa.');
  res.appendChild(prev);
  act.appendChild(actionButton('Vai al post', false, function () {
   location.replace('https://' + location.hostname + '/?t=' + topicId + '&view=getlastpost');
  }));
  res.appendChild(act);
  return;
 }
 if (mode === 'test') {
  setStatus('Modalita\' test: niente post. Questa e\' l\'anteprima.');
  res.appendChild(prev);
  act.appendChild(actionButton('Chiudi', true, closeResult));
  res.appendChild(act);
  unlock();
  return;
 }
 setStatus('Il post potrebbe non essere partito: controlla la tua Lista. Se manca, copia il codice qui sotto e postalo a mano.', true);
 res.appendChild(prev);
 var ta = document.createElement('textarea');
 ta.readOnly = true;
 ta.value = html;
 res.appendChild(ta);
}

/* ---------- conferma ---------- */

function onGo() {
 if (busy) { return; }
 var c = cart(), sv = cartSell();
 var manual = byId('mc-topic-manual').value.replace(/\D/g, '');
 var tSel = byId('mc-topic');
 var topicId = manual || tSel.value;
 var topicTitle = manual ? ('topic ' + manual) : (tSel.selectedIndex >= 0 ? tSel.options[tSel.selectedIndex].text : '');

 if (!c.length && !sv.length) { setStatus(HAS_SELL ? 'Il carrello e\' vuoto: scegli cosa comprare o vendere.' : 'Il carrello e\' vuoto: scegli le quantita\' nel listino.', true); return; }
 if (!topicId) { setStatus('Scegli la tua Lista della Spesa (o scrivi l\'ID del topic).', true); return; }

 var ask = '', i;
 if (c.length) {
  ask += (sv.length ? 'Acquisti da ' : 'Stai per acquistare da ') + M.nome + ':\n';
  for (i = 0; i < c.length; i++) { ask += '- ' + qtaLabel(c[i].it, c[i].q) + ' x ' + c[i].it.nome + ' (' + money(c[i].sub) + ')\n'; }
  ask += 'Totale acquisti: ' + money(total(c)) + '\n\n';
 }
 if (sv.length) {
  ask += 'Vendite a ' + M.nome + ':\n';
  for (i = 0; i < sv.length; i++) {
   var l = sv[i].l, d = lineDetail(l, false);
   ask += '- ' + l.q + ' x ' + l.v.nome + (d ? ' [' + d + ']' : '') + ' (' + money(sv[i].sub) + ')\n';
  }
  ask += 'Totale vendite: ' + money(total(sv)) + '\n\n';
  if (c.length) { ask += 'Saldo: ' + signed(total(sv) - total(c)) + '\n\n'; }
 }
 ask += 'Il post verra\' pubblicato in: ' + topicTitle + '\n\nConfermi?';
 if (!window.confirm(ask)) { return; }

 busy = true;
 byId('mc-go').disabled = true;
 byId('mc-clear').disabled = true;
 byId('mc-result')[IH] = '';

 var html = buildPost(c, sv);
 if (C.TEST_MODE) { showResult(html, 'test', topicId); return; }
 setStatus('Pubblico il post...');
 postReply(C.SECTION_ID, topicId, html, function (ok) {
  showResult(html, (ok ? 'ok' : 'fail'), topicId);
 });
}

/* ---------- avvio ---------- */

function init() {
 injectCss();
 USER = getCurrentUser();
 if (!USER) {
  bar[IH] = '<div class="mc-top"><span class="mc-t">Carrello</span><span class="mc-count">Devi essere loggato per usare il carrello.</span></div>';
  return;
 }
 readListino();
 buildSlots();
 readVendite();
 buildBar();
 bindUi();
 updateSum();
 if (C.TEST_MODE) { setStatus('Modalita\' test attiva.'); }
 loadMyLists();
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
else { init(); }

})();
