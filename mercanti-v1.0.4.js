/* =====================================================================
   NEGOZIO DEI MERCANTI - motore unico
   Nella pagina del mercante servono:
   - window.MERCANTE_CONFIG (listino, colori, testi), scritto prima di questo script;
   - un contenitore con id="mc-shop" (di solito la radice del layout);
   - sotto ogni articolo acquistabile: <div class="mc-qty" data-mc="Nome come nel LISTINO"></div>;
   - la barra di conferma: <div id="mc-bar"></div>.
   Il genitore di ogni .mc-qty riceve la classe mc-on quando l'articolo e' nel carrello.
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
 FONT_POST: { titolo: 'Calistoga,serif', sc: "'Alegreya Sans SC',sans-serif", testo: 'Montserrat,sans-serif' }
};
var TEMA_DEF = {
 cornice: '#25344A', cornicebordo: '#C9B98D', fondo: '#151A30', bordo: '#572425',
 riga: '#1C2240', linea: '#8C7A47', testo: '#E6DFD6', titoli: '#E9DCB4',
 secondario: '#B3A9B8', accento: '#BD5561', bottone: '#572425', bottonetesto: '#E9DCB4',
 font: 'Georgia,serif', fontTitoli: 'Georgia,serif'
};

var C = {}, T = {}, k;
for (k in DEF) { if (DEF.hasOwnProperty(k)) { C[k] = DEF[k]; } }
for (k in CFG) { if (CFG.hasOwnProperty(k)) { C[k] = CFG[k]; } }
for (k in TEMA_DEF) { if (TEMA_DEF.hasOwnProperty(k)) { T[k] = TEMA_DEF[k]; } }
if (C.TEMA) { for (k in C.TEMA) { if (C.TEMA.hasOwnProperty(k)) { T[k] = C.TEMA[k]; } } }
var M = C.MERCANTE || { id: 'mercante', nome: 'Mercante', titolo: '' };
var F = C.FONT_POST;

var IH = 'inn' + 'erHTML';
var CATS = [];   /* categorie del listino */
var ITEMS = [];  /* voci in vendita, in ordine */
var QTA = [];    /* quantita' nel carrello, stesso indice di ITEMS */
var SLOTS = [];  /* elemento .mc-qty di ogni voce (null se nella pagina manca) */
var USER = null;
var busy = false;

/* ---------- utilita' ---------- */

function byId(id) { return document.getElementById(id); }
function later(f) { setTimeout(f, 0); }
function pad2(n) { var s = ('0' + n).slice(-2); return s; }
function norm(s) { var out = String(s || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, ''); return out; }
function esc(s) {
 var out = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
 return out;
}
function fmt(n) { var s = String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return s; }
function money(n) { var s = fmt(n) + ' ' + C.VALUTA; return s; }
function nowStr() {
 var d = new Date();
 var s = pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
 return s;
}
function formato(f) { var s = (f === 'banner' || f === 'carta') ? f : 'quadro'; return s; }
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
 '#mc-shop .mc-qty{display:flex;justify-content:center;align-items:center;margin:6px 0 0;font-family:var(--mc-font)}' +
 '#mc-shop .mc-qty:empty{display:none}' +
 '#mc-shop button.mc-b{display:inline-block;flex:0 0 auto;width:28px;height:28px;min-width:0;margin:0;padding:0;border:1px solid var(--mc-linea);border-radius:4px;background:var(--mc-fondo);color:var(--mc-titoli);font-family:var(--mc-font);font-size:17px;line-height:26px;text-align:center;cursor:pointer;box-shadow:none}' +
 '#mc-shop input.mc-in{display:inline-block;flex:0 0 auto;width:42px;height:28px;min-height:0;margin:0 4px;padding:0 2px;border:1px solid var(--mc-linea);border-radius:4px;background:var(--mc-fondo);color:var(--mc-testo);font-family:var(--mc-font);font-size:14px;text-align:center;box-shadow:none}' +
 '#mc-shop .mc-on > .mc-qty input.mc-in{border-color:var(--mc-accento);color:var(--mc-titoli)}' +
 /* barra di conferma */
 '#mc-bar{font-family:var(--mc-font);color:var(--mc-testo);font-size:14px;line-height:1.4;text-align:left}' +
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
 '#mc-bar button[disabled]{opacity:.5;cursor:default}' +
 '#mc-bar .mc-hint{margin:6px 0 0;font-size:12px;font-style:italic;color:var(--mc-secondario)}' +
 '#mc-bar #mc-status{margin:6px 0 0;font-size:13px;color:var(--mc-titoli)}' +
 '#mc-bar #mc-status.mc-err{color:var(--mc-accento);font-weight:600}' +
 '#mc-bar .mc-hint:empty,#mc-bar #mc-status:empty,#mc-bar #mc-result:empty{display:none}' +
 '#mc-bar #mc-result{margin:10px 0 0;padding:10px 0 0;border-top:1px dashed var(--mc-linea)}' +
 '#mc-bar{min-width:0;max-width:100%}' +
 '#mc-bar .mc-preview{padding:12px 8px;background:#8FBEBA;border-radius:6px;overflow-wrap:anywhere}' +
 'body.ffm #mc-bar .mc-preview{padding:8px 4px}' +
 '#mc-bar .mc-act{display:flex;justify-content:center;gap:8px;margin:10px 0 2px}' +
 '#mc-bar textarea{display:block;width:100%;min-height:110px;margin:8px 0 0;padding:6px;font-size:11px;background:var(--mc-riga);color:var(--mc-testo);border:1px solid var(--mc-linea);box-sizing:border-box}' +
 /* mobile */
 'body.ffm #mc-bar select{flex:1 1 100%}' +
 'body.ffm #mc-bar input.mc-txt{flex:1 1 auto;width:auto;min-width:0}' +
 'body.ffm #mc-bar input.mc-txt{max-width:none}';
 var st = document.createElement('style');
 st.id = 'mc-shop-css';
 st.textContent = css;
 (document.head || document.body).appendChild(st);

 var vars = ['cornice', 'cornicebordo', 'fondo', 'bordo', 'riga', 'linea', 'testo', 'titoli', 'secondario', 'accento', 'bottone', 'bottonetesto'];
 for (var i = 0; i < vars.length; i++) { root.style.setProperty('--mc-' + vars[i], T[vars[i]]); }
 root.style.setProperty('--mc-font', T.font);
 root.style.setProperty('--mc-font-titoli', T.fontTitoli);
}

/* ---------- listino e selettori ---------- */

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

function buildSlots() {
 var byName = {}, i, slots = root.querySelectorAll('.mc-qty[data-mc]');
 for (i = 0; i < ITEMS.length; i++) { byName[norm(ITEMS[i].nome)] = i; }
 for (i = 0; i < slots.length; i++) {
  var nm = norm(slots[i].getAttribute('data-mc'));
  if (!byName.hasOwnProperty(nm)) {
   if (window.console) { window.console.warn('Negozio: "' + nm + '" non e\' nel LISTINO (o e\' off)'); }
   continue;
  }
  var idx = byName[nm];
  SLOTS[idx] = slots[i];
  slots[i][IH] = '<button type="button" class="mc-b" data-op="-1" data-i="' + idx + '" title="Togli">&minus;</button>' +
   '<input type="text" inputmode="numeric" class="mc-in" id="mc-q-' + idx + '" data-i="' + idx + '" value="0" maxlength="3" aria-label="Quantit&agrave; ' + esc(ITEMS[idx].nome) + '">' +
   '<button type="button" class="mc-b" data-op="1" data-i="' + idx + '" title="Aggiungi">+</button>';
 }
}

function buildBar() {
 bar[IH] = '<div class="mc-top"><span class="mc-t">Carrello</span><span class="mc-count" id="mc-count"></span><span class="mc-tot" id="mc-tot"></span></div>' +
  '<div class="mc-row">' +
  '<select id="mc-topic" title="La tua Lista della Spesa"><option value="">Caricamento liste...</option></select>' +
  '<input class="mc-txt" id="mc-topic-manual" type="text" inputmode="numeric" placeholder="ID topic" title="Se la tua Lista della Spesa non compare nel menu, scrivi qui l\'ID del topic">' +
  '<button type="button" class="mc-go" id="mc-go">Acquista</button>' +
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
function total(c) { var t = 0; for (var i = 0; i < c.length; i++) { t += c[i].sub; } return t; }

function updateSum() {
 var c = cart(), pezzi = 0;
 for (var i = 0; i < c.length; i++) { pezzi += c[i].q; }
 byId('mc-count').textContent = c.length ?
  (c.length + (c.length === 1 ? ' articolo' : ' articoli') + (pezzi !== c.length ? ' (' + pezzi + ' pezzi)' : '')) :
  'vuoto: scegli le quantità nel listino';
 byId('mc-tot').textContent = money(total(c));
}

function bindUi() {
 root.addEventListener('click', function (e) {
  var b = e.target;
  if (!b || !b.getAttribute) { return; }
  var op = b.getAttribute('data-op');
  if (op) {
   e.preventDefault();
   var i = parseInt(b.getAttribute('data-i'), 10);
   setQta(i, QTA[i] + parseInt(op, 10));
  }
 });
 root.addEventListener('input', function (e) {
  var t = e.target;
  if (!t || t.className !== 'mc-in') { return; }
  var clean = t.value.replace(/\D/g, '');
  if (clean !== t.value) { t.value = clean; }
  setQta(parseInt(t.getAttribute('data-i'), 10), clean, true);
 });
 root.addEventListener('change', function (e) {
  var t = e.target;
  if (t && t.className === 'mc-in' && t.value === '') { t.value = '0'; }
 });
 byId('mc-clear').addEventListener('click', function () {
  for (var i = 0; i < ITEMS.length; i++) { if (QTA[i]) { setQta(i, 0); } }
  setStatus('');
 });
 byId('mc-go').addEventListener('click', onGo);
}

/* ---------- HTML del post (una riga, stili inline, colori del mercante) ---------- */

function scStyle(size, color) {
 var s = 'font-family:' + F.sc + ';font-size:' + size + 'px;color:' + color + ';';
 return s;
}
/* miniature nel post: i banner stanno sopra il testo (cosi' su mobile il testo resta largo),
   quadri e carte a sinistra */
var THUMB_POST = { quadro: [44, 44], carta: [30, 60] };

function infoRow(label, val) {
 var s = '<tr><td style="width:95px;padding:2px 0;border:0;background:transparent;' + scStyle(14, T.secondario) + '">' + label + '</td>' +
  '<td style="padding:2px 0;border:0;background:transparent;color:' + T.testo + ';">' + val + '</td></tr>';
 return s;
}

function itemRowPost(r) {
 var it = r.it, h = '';
 h += '<div style="margin:4px 0 0;padding:6px 8px;background:' + T.riga + ';border-radius:4px;overflow:hidden;">';
 if (it.img && it.formato === 'banner') {
  h += '<img style="display:block;width:100%;max-width:260px;height:auto;aspect-ratio:4/1;object-fit:cover;margin:0 0 6px;border:1px solid ' + T.linea + ';border-radius:3px;" src="' + esc(it.img) + '">';
 } else if (it.img) {
  var sz = THUMB_POST[it.formato];
  h += '<img style="float:left;width:' + sz[0] + 'px;height:' + sz[1] + 'px;object-fit:cover;margin:0 10px 0 0;border:1px solid ' + T.linea + ';border-radius:3px;" src="' + esc(it.img) + '">';
 }
 h += '<div style="overflow:hidden;">';
 h += '<div style="font-weight:bold;color:' + T.titoli + ';">' + esc(it.nome) + '</div>';
 h += '<table style="width:100%;border-collapse:collapse;border:0;margin:0;"><tr>' +
  '<td style="padding:0;border:0;background:transparent;font-size:12px;color:' + T.secondario + ';">' + esc(qtaLabel(it, r.q)) + ' &times; ' + money(it.prezzo) + '</td>' +
  '<td style="padding:0 0 0 8px;border:0;background:transparent;text-align:right;white-space:nowrap;vertical-align:bottom;font-weight:bold;color:' + T.titoli + ';">' + money(r.sub) + '</td>' +
  '</tr></table>';
 h += '</div></div>';
 return h;
}

function buildPost(c) {
 var h = '<div style="max-width:600px;margin:0 auto;padding:7px;background:' + T.cornice + ';border:1px solid ' + T.cornicebordo + ';border-radius:3px;text-align:left;">';
 h += '<div style="padding:14px 12px;background:' + T.fondo + ';border:1px solid ' + T.bordo + ';border-radius:2px;font-family:' + F.testo + ';font-size:13px;line-height:1.45;color:' + T.testo + ';">';
 h += '<div style="font-family:' + F.titolo + ';font-size:26px;color:' + T.titoli + ';text-align:center;letter-spacing:1px;">' + esc(M.nome) + '</div>';
 if (M.titolo) { h += '<div style="' + scStyle(15, T.secondario) + 'text-align:center;">' + esc(M.titolo) + '</div>'; }
 h += '<div style="height:1px;margin:10px 0 12px;background:linear-gradient(90deg,' + T.accento + ',' + T.fondo + ');"></div>';
 h += '<table style="width:100%;border-collapse:collapse;border:0;margin:0 0 4px;">' +
  infoRow('Acquirente', esc(USER.name)) + infoRow('Data', nowStr()) + '</table>';

 for (var ci = 0; ci < CATS.length; ci++) {
  var rows = '';
  for (var i = 0; i < c.length; i++) { if (c[i].it.cat === ci) { rows += itemRowPost(c[i]); } }
  if (!rows) { continue; }
  h += '<div style="' + scStyle(15, T.accento) + 'margin:12px 0 0;">' + esc(CATS[ci].nome) + '</div>' + rows;
 }

 h += '<table style="width:100%;border-collapse:collapse;border:0;margin:10px 0 0;border-top:1px solid ' + T.linea + ';"><tr>' +
  '<td style="padding:8px 0 0;border:0;background:transparent;' + scStyle(17, T.titoli) + '">Totale</td>' +
  '<td style="padding:8px 10px 0 0;border:0;background:transparent;text-align:right;font-family:' + F.titolo + ';font-size:20px;color:' + T.titoli + ';">' + money(total(c)) + '</td></tr></table>';
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

/* ---------- esito (la barra si allarga) ---------- */

function unlock() { busy = false; byId('mc-go').disabled = false; byId('mc-clear').disabled = false; }

/* Quando la barra si allarga, il pannello che scorre (l'elemento subito prima della barra)
   mantiene la sua altezza e il box cresce verso il basso invece di comprimerlo. */
function freezeBox(on) {
 var box = bar.parentNode, pan = bar.previousElementSibling;
 if (!box || !pan) { return; }
 if (on) {
  var ov = window.getComputedStyle(pan).overflowY;
  if (ov !== 'auto' && ov !== 'scroll') { return; }
  pan.style.height = pan.offsetHeight + 'px';
  pan.style.flex = '0 0 auto';
  box.style.height = 'auto';
 } else {
  pan.style.height = ''; pan.style.flex = ''; box.style.height = '';
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
  setStatus('Fatto! L\'acquisto e\' stato postato nella tua Lista della Spesa.');
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

/* ---------- acquisto ---------- */

function onGo() {
 if (busy) { return; }
 var c = cart();
 var manual = byId('mc-topic-manual').value.replace(/\D/g, '');
 var tSel = byId('mc-topic');
 var topicId = manual || tSel.value;
 var topicTitle = manual ? ('topic ' + manual) : (tSel.selectedIndex >= 0 ? tSel.options[tSel.selectedIndex].text : '');

 if (!c.length) { setStatus('Il carrello e\' vuoto: scegli le quantita\' nel listino.', true); return; }
 if (!topicId) { setStatus('Scegli la tua Lista della Spesa (o scrivi l\'ID del topic).', true); return; }

 var righe = [], i;
 for (i = 0; i < c.length; i++) { righe.push('- ' + qtaLabel(c[i].it, c[i].q) + ' x ' + c[i].it.nome + ' (' + money(c[i].sub) + ')'); }
 var ask = 'Stai per acquistare da ' + M.nome + ':\n' + righe.join('\n') + '\n\nTotale: ' + money(total(c)) +
  '\nIl post verra\' pubblicato in: ' + topicTitle + '\n\nConfermi?';
 if (!window.confirm(ask)) { return; }

 busy = true;
 byId('mc-go').disabled = true;
 byId('mc-clear').disabled = true;
 byId('mc-result')[IH] = '';

 var html = buildPost(c);
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
  bar[IH] = '<div class="mc-top"><span class="mc-t">Carrello</span><span class="mc-count">Devi essere loggato per fare acquisti.</span></div>';
  return;
 }
 readListino();
 buildSlots();
 buildBar();
 bindUi();
 updateSum();
 if (C.TEST_MODE) { setStatus('Modalita\' test attiva.'); }
 loadMyLists();
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
else { init(); }

})();
