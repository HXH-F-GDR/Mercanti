/* =====================================================================
   NEGOZIO DEI MERCANTI - motore unico
   Il listino, i colori e i testi stanno in window.MERCANTE_CONFIG,
   scritto nella pagina di ogni mercante prima di questo script.
   Il carrello va in un elemento con id="mc-shop".
   ===================================================================== */
;(function () {
var CFG = window.MERCANTE_CONFIG;
var root = document.getElementById('mc-shop');
if (!CFG || !root || root.getAttribute('data-mc-ok')) { return; }
root.setAttribute('data-mc-ok', '1');

/* ---------- valori comuni a tutti i mercanti (il config li puo' sovrascrivere) ---------- */

var DEF = {
 SECTION_ID: 65118748,
 FIREBASE_DB_URL: 'https://spam-limitato-e-illimitato-default-rtdb.europe-west1.firebasedatabase.app',
 DB_ROOT: '/mercanti',
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
var DB = String(C.FIREBASE_DB_URL).replace(/\/+$/, '') + C.DB_ROOT;
var CATS = [];   /* categorie con almeno una voce in vendita */
var ITEMS = [];  /* voci in vendita, in ordine */
var QTA = [];    /* quantita' nel carrello, stesso indice di ITEMS */
var USER = null;
var busy = false;

/* ---------- utilita' ---------- */

function byId(id) { return document.getElementById(id); }
function later(f) { setTimeout(f, 0); }
function trim(s) { var out = String(s || '').replace(/^\s+|\s+$/g, ''); return out; }
function pad2(n) { var s = ('0' + n).slice(-2); return s; }
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
function setStatus(msg, isErr) {
 var s = byId('mc-status');
 s.textContent = msg;
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

/* ---------- stile dell'interfaccia (colori dal TEMA del mercante) ---------- */

function injectCss() {
 if (byId('mc-shop-css')) { return; }
 var css = '' +
 '#mc-shop{font-family:var(--mc-font);color:var(--mc-testo);font-size:15px;line-height:1.45;text-align:left}' +
 '#mc-shop *{box-sizing:border-box}' +
 '#mc-shop .mc-cat{margin:0 0 20px}' +
 '#mc-shop .mc-cat-h{font-family:var(--mc-font-titoli);font-size:16px;font-weight:700;line-height:1.3;color:var(--mc-titoli);margin:0}' +
 '#mc-shop .mc-cat-n{font-size:13px;font-style:italic;color:var(--mc-secondario);margin:2px 0 4px}' +
 '#mc-shop table.mc-t{width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0 6px;border:0;margin:0;background:transparent}' +
 '#mc-shop table.mc-t td{border:0;padding:6px 8px;vertical-align:middle;background:var(--mc-riga);color:var(--mc-testo)}' +
 '#mc-shop table.mc-t td:first-child{border-radius:4px 0 0 4px}' +
 '#mc-shop table.mc-t td:last-child{border-radius:0 4px 4px 0}' +
 '#mc-shop tr.mc-on td:first-child{box-shadow:inset 3px 0 0 var(--mc-accento)}' +
 '#mc-shop tr.mc-on .mc-nome{color:var(--mc-titoli)}' +
 '#mc-shop td.mc-th{padding:5px 5px 5px 8px}' +
 '#mc-shop td.mc-th--quadro{width:62px}' +
 '#mc-shop td.mc-th--banner{width:124px}' +
 '#mc-shop td.mc-th--carta{width:50px}' +
 '#mc-shop td.mc-th img{display:block;margin:0;max-width:none;object-fit:cover;border:1px solid var(--mc-linea);border-radius:3px}' +
 '#mc-shop td.mc-th--quadro img{width:48px;height:48px}' +
 '#mc-shop td.mc-th--banner img{width:110px;height:28px}' +
 '#mc-shop td.mc-th--carta img{width:36px;height:72px}' +
 '#mc-shop .mc-nome{font-weight:600;line-height:1.25;color:var(--mc-testo)}' +
 '#mc-shop .mc-prz{font-size:13px;color:var(--mc-secondario)}' +
 '#mc-shop td.mc-q{width:126px;text-align:right;white-space:nowrap}' +
 '#mc-shop button.mc-b{display:inline-block;vertical-align:middle;width:30px;height:30px;min-width:0;margin:0;padding:0;border:1px solid var(--mc-linea);border-radius:4px;background:var(--mc-fondo);color:var(--mc-titoli);font-family:var(--mc-font);font-size:18px;line-height:28px;text-align:center;cursor:pointer;box-shadow:none}' +
 '#mc-shop input.mc-in{display:inline-block;vertical-align:middle;width:46px;height:30px;min-height:0;margin:0 4px;padding:0 4px;border:1px solid var(--mc-linea);border-radius:4px;background:var(--mc-fondo);color:var(--mc-testo);font-family:var(--mc-font);font-size:15px;text-align:center;box-shadow:none}' +
 '#mc-shop .mc-foot{padding-top:16px;border-top:1px dashed var(--mc-linea)}' +
 '#mc-shop .mc-lbl{font-family:var(--mc-font-titoli);font-size:14px;font-weight:700;color:var(--mc-titoli);margin:16px 0 6px}' +
 '#mc-shop .mc-lbl.mc-first{margin-top:0}' +
 '#mc-shop table.mc-s{width:100%;table-layout:fixed;border-collapse:collapse;border:0;margin:0;background:transparent}' +
 '#mc-shop table.mc-s td{border:0;padding:2px 0;background:transparent;color:var(--mc-secondario);font-size:14px;vertical-align:top}' +
 '#mc-shop table.mc-s td.mc-r{width:120px;text-align:right;color:var(--mc-testo)}' +
 '#mc-shop table.mc-s tr.mc-tot td{padding-top:8px;border-top:1px solid var(--mc-linea);font-family:var(--mc-font-titoli);font-size:16px;font-weight:700;color:var(--mc-titoli)}' +
 '#mc-shop .mc-vuoto{font-size:14px;font-style:italic;color:var(--mc-secondario)}' +
 '#mc-shop select,#mc-shop input.mc-txt{display:block;width:100%;height:auto;min-height:36px;margin:0;padding:6px 8px;background:var(--mc-riga);color:var(--mc-testo);border:1px solid var(--mc-linea);border-radius:4px;font-family:var(--mc-font);font-size:14px;box-shadow:none}' +
 '#mc-shop input.mc-txt{margin-top:6px}' +
 '#mc-shop .mc-hint{font-size:12px;font-style:italic;color:var(--mc-secondario);margin:4px 0 0}' +
 '#mc-shop .mc-act{text-align:center;margin-top:16px}' +
 '#mc-shop button.mc-go{display:inline-block;width:auto;height:auto;margin:4px;padding:9px 26px;border:1px solid var(--mc-cornicebordo);border-radius:4px;background:var(--mc-bottone);color:var(--mc-bottonetesto);font-family:var(--mc-font-titoli);font-size:15px;font-weight:700;letter-spacing:.05em;cursor:pointer;box-shadow:none}' +
 '#mc-shop button.mc-go2{background:transparent;color:var(--mc-secondario);border-color:var(--mc-linea)}' +
 '#mc-shop button[disabled]{opacity:.5;cursor:default}' +
 '#mc-shop #mc-status{text-align:center;margin-top:10px;min-height:20px;font-size:14px;color:var(--mc-titoli)}' +
 '#mc-shop #mc-status.mc-err{color:var(--mc-accento);font-weight:600}' +
 '#mc-shop .mc-preview{margin-top:12px;padding:12px 8px;background:#8FBEBA;border-radius:6px}' +
 '#mc-shop textarea{display:block;width:100%;min-height:120px;margin-top:8px;padding:6px;font-size:11px;background:var(--mc-riga);color:var(--mc-testo);border:1px solid var(--mc-linea)}' +
 /* mobile */
 'body.ffm #mc-shop table.mc-t td{padding:5px 6px}' +
 'body.ffm #mc-shop td.mc-th--quadro{width:50px}' +
 'body.ffm #mc-shop td.mc-th--quadro img{width:38px;height:38px}' +
 'body.ffm #mc-shop td.mc-th--banner{width:82px}' +
 'body.ffm #mc-shop td.mc-th--banner img{width:68px;height:17px}' +
 'body.ffm #mc-shop td.mc-th--carta{width:42px}' +
 'body.ffm #mc-shop td.mc-th--carta img{width:28px;height:56px}' +
 'body.ffm #mc-shop td.mc-q{width:106px}' +
 'body.ffm #mc-shop button.mc-b{width:28px;height:28px;line-height:26px}' +
 'body.ffm #mc-shop input.mc-in{width:38px;height:28px;margin:0 3px}' +
 'body.ffm #mc-shop .mc-nome{font-size:14px}' +
 'body.ffm #mc-shop .mc-prz{font-size:12px}' +
 'body.ffm #mc-shop table.mc-s td.mc-r{width:100px}';
 var st = document.createElement('style');
 st.id = 'mc-shop-css';
 st.textContent = css;
 (document.head || document.body).appendChild(st);

 var vars = ['cornice', 'cornicebordo', 'fondo', 'bordo', 'riga', 'linea', 'testo', 'titoli', 'secondario', 'accento', 'bottone', 'bottonetesto'];
 for (var i = 0; i < vars.length; i++) { root.style.setProperty('--mc-' + vars[i], T[vars[i]]); }
 root.style.setProperty('--mc-font', T.font);
 root.style.setProperty('--mc-font-titoli', T.fontTitoli);
}

/* ---------- interfaccia ---------- */

function buildUi() {
 var lst = C.LISTINO || [], h = '', i, j, cat, v, idx, f;
 for (i = 0; i < lst.length; i++) {
  cat = lst[i];
  var voci = [];
  for (j = 0; j < (cat.voci || []).length; j++) { if (!cat.voci[j].off) { voci.push(cat.voci[j]); } }
  if (!voci.length) { continue; }
  f = formato(cat.formato);
  var ci = CATS.length;
  CATS.push({ nome: cat.categoria, formato: f });
  h += '<div class="mc-cat"><div class="mc-cat-h">' + esc(cat.categoria) + '</div>';
  if (cat.nota) { h += '<div class="mc-cat-n">' + esc(cat.nota) + '</div>'; }
  h += '<table class="mc-t"><tbody>';
  for (j = 0; j < voci.length; j++) {
   v = voci[j];
   idx = ITEMS.length;
   ITEMS.push({ cat: ci, nome: v.nome, prezzo: Number(v.prezzo) || 0, img: v.img || '', unita: cat.unita || null, formato: f });
   QTA.push(0);
   h += '<tr id="mc-row-' + idx + '">' +
    '<td class="mc-th mc-th--' + f + '">' + (v.img ? '<img src="' + esc(v.img) + '" alt="">' : '') + '</td>' +
    '<td><div class="mc-nome">' + esc(v.nome) + '</div><div class="mc-prz">' + money(v.prezzo) +
    (cat.unita ? ' / ' + esc(cat.unita[0]) : '') + '</div></td>' +
    '<td class="mc-q"><button type="button" class="mc-b" data-op="-1" data-i="' + idx + '">&minus;</button>' +
    '<input type="text" inputmode="numeric" class="mc-in" id="mc-q-' + idx + '" data-i="' + idx + '" value="0" maxlength="3">' +
    '<button type="button" class="mc-b" data-op="1" data-i="' + idx + '">+</button></td></tr>';
  }
  h += '</tbody></table></div>';
 }
 if (!ITEMS.length) { root[IH] = '<div class="mc-vuoto">Al momento non c\'e\' nulla in vendita.</div>'; return false; }

 h += '<div class="mc-foot">' +
  '<div class="mc-lbl mc-first">Il tuo carrello</div><div id="mc-sum"></div>' +
  '<div class="mc-lbl">Lista della Spesa</div>' +
  '<select id="mc-topic"><option value="">Caricamento...</option></select>' +
  '<div class="mc-hint" id="mc-topic-hint"></div>' +
  '<input class="mc-txt" id="mc-topic-manual" type="text" placeholder="Non la trovi? Scrivi qui l\'ID del topic">' +
  '<div class="mc-act"><button type="button" class="mc-go" id="mc-go">Acquista</button>' +
  '<button type="button" class="mc-go mc-go2" id="mc-clear">Svuota</button></div>' +
  '<div id="mc-status"></div><div id="mc-result"></div></div>';
 root[IH] = h;
 return true;
}

function setQta(i, v, fromInput) {
 if (busy || !ITEMS[i]) { return; }
 v = parseInt(v, 10) || 0;
 if (v < 0) { v = 0; }
 if (v > C.MAX_QTA) { v = C.MAX_QTA; }
 QTA[i] = v;
 var inp = byId('mc-q-' + i);
 if (inp && !(fromInput && inp.value === '') && inp.value !== String(v)) { inp.value = String(v); }
 var row = byId('mc-row-' + i);
 if (row) { row.className = v > 0 ? 'mc-on' : ''; }
 updateSum();
}

function cart() {
 var out = [];
 for (var i = 0; i < ITEMS.length; i++) { if (QTA[i] > 0) { out.push({ it: ITEMS[i], q: QTA[i], sub: ITEMS[i].prezzo * QTA[i] }); } }
 return out;
}
function total(c) { var t = 0; for (var i = 0; i < c.length; i++) { t += c[i].sub; } return t; }

function updateSum() {
 var c = cart(), box = byId('mc-sum');
 if (!c.length) { box[IH] = '<div class="mc-vuoto">Il carrello e\' vuoto.</div>'; return; }
 var h = '<table class="mc-s"><tbody>';
 for (var i = 0; i < c.length; i++) {
  h += '<tr><td>' + esc(qtaLabel(c[i].it, c[i].q)) + ' &times; ' + esc(c[i].it.nome) + '</td><td class="mc-r">' + money(c[i].sub) + '</td></tr>';
 }
 h += '<tr class="mc-tot"><td>Totale</td><td class="mc-r">' + money(total(c)) + '</td></tr></tbody></table>';
 box[IH] = h;
}

function bindUi() {
 root.addEventListener('click', function (e) {
  var b = e.target;
  if (!b || !b.getAttribute) { return; }
  var op = b.getAttribute('data-op');
  if (op) {
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
 });
 byId('mc-go').addEventListener('click', onGo);
}

/* ---------- Firebase (REST): solo registro degli acquisti ---------- */

function fbReq(method, path, body, cb) {
 var opts = { method: method };
 if (body !== undefined) { opts.body = JSON.stringify(body); }
 fetch(DB + path + '.json', opts)
  .then(function (r) { if (!r.ok) { throw new Error('HTTP ' + r.status); } var j = r.json(); return j; })
  .then(function (data) { later(function () { cb(null, data); }); })
  .catch(function (e) { later(function () { cb(e, null); }); });
}
function logStart(entry, cb) {
 if (C.TEST_MODE) { cb(null, 'TEST'); return; }
 fbReq('POST', '/log', entry, function (err, res) {
  if (err || !res || !res.name) { cb(err || new Error('log'), null); return; }
  cb(null, res.name);
 });
}
function logUpdate(logId, data, cb) {
 if (C.TEST_MODE) { cb(); return; }
 fbReq('PATCH', '/log/' + logId, data, function () { cb(); });
}

/* ---------- HTML del post (una riga, stili inline, colori del mercante) ---------- */

function scStyle(size, color) {
 var s = 'font-family:' + F.sc + ';font-size:' + size + 'px;color:' + color + ';';
 return s;
}
var THUMB_POST = { quadro: [44, 44], banner: [96, 24], carta: [30, 60] };

function infoRow(label, val) {
 var s = '<tr><td style="width:110px;padding:2px 0;border:0;background:transparent;' + scStyle(14, T.secondario) + '">' + label + '</td>' +
  '<td style="padding:2px 0;border:0;background:transparent;color:' + T.testo + ';">' + val + '</td></tr>';
 return s;
}

function itemRowPost(r) {
 var it = r.it, sz = THUMB_POST[it.formato];
 var cell = 'border:0;background:' + T.riga + ';vertical-align:middle;';
 var h = '<tr>';
 h += '<td style="' + cell + 'width:' + (sz[0] + 12) + 'px;padding:5px 6px;border-radius:4px 0 0 4px;">';
 if (it.img) {
  h += '<img style="display:block;width:' + sz[0] + 'px;height:' + sz[1] + 'px;object-fit:cover;border:1px solid ' + T.linea + ';border-radius:3px;" src="' + esc(it.img) + '">';
 }
 h += '</td>';
 h += '<td style="' + cell + 'padding:5px 8px;"><div style="font-weight:bold;color:' + T.titoli + ';">' + esc(it.nome) + '</div>' +
  '<div style="font-size:12px;color:' + T.secondario + ';">' + esc(qtaLabel(it, r.q)) + ' &times; ' + money(it.prezzo) + '</div></td>';
 h += '<td style="' + cell + 'width:110px;padding:5px 10px;text-align:right;font-weight:bold;color:' + T.titoli + ';border-radius:0 4px 4px 0;">' + money(r.sub) + '</td>';
 h += '</tr>';
 return h;
}

function buildPost(c, logId) {
 var h = '<div style="max-width:600px;margin:0 auto;padding:7px;background:' + T.cornice + ';border:1px solid ' + T.cornicebordo + ';border-radius:3px;text-align:left;">';
 h += '<div style="padding:16px 18px;background:' + T.fondo + ';border:1px solid ' + T.bordo + ';border-radius:2px;font-family:' + F.testo + ';font-size:13px;line-height:1.45;color:' + T.testo + ';">';
 h += '<div style="font-family:' + F.titolo + ';font-size:26px;color:' + T.titoli + ';text-align:center;letter-spacing:1px;">' + esc(M.nome) + '</div>';
 if (M.titolo) { h += '<div style="' + scStyle(15, T.secondario) + 'text-align:center;">' + esc(M.titolo) + '</div>'; }
 h += '<div style="height:1px;margin:10px 0 12px;background:linear-gradient(90deg,' + T.accento + ',' + T.fondo + ');"></div>';
 h += '<table style="width:100%;border-collapse:collapse;border:0;margin:0 0 4px;">' +
  infoRow('Acquirente', esc(USER.name)) + infoRow('Data', nowStr()) + '</table>';

 for (var ci = 0; ci < CATS.length; ci++) {
  var rows = '';
  for (var i = 0; i < c.length; i++) { if (c[i].it.cat === ci) { rows += itemRowPost(c[i]); } }
  if (!rows) { continue; }
  h += '<div style="' + scStyle(15, T.accento) + 'margin:12px 0 2px;">' + esc(CATS[ci].nome) + '</div>';
  h += '<table style="width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0 4px;border:0;margin:0;">' + rows + '</table>';
 }

 h += '<table style="width:100%;border-collapse:collapse;border:0;margin:10px 0 0;border-top:1px solid ' + T.linea + ';"><tr>' +
  '<td style="padding:8px 0 0;border:0;background:transparent;' + scStyle(17, T.titoli) + '">Totale</td>' +
  '<td style="padding:8px 10px 0 0;border:0;background:transparent;text-align:right;font-family:' + F.titolo + ';font-size:20px;color:' + T.titoli + ';">' + money(total(c)) + '</td></tr></table>';
 h += '<div style="font-size:10px;color:' + T.secondario + ';text-align:right;margin-top:10px;">Acquisto automatico - registro ' + esc(logId) + '</div>';
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
   hint.textContent = failed ? 'Non riesco a leggere la sezione: scrivi l\'ID del topic qui sotto.' :
    'Non ho trovato topic aperti da te nella sezione: scrivi l\'ID del topic qui sotto.';
   return;
  }
  if (mine.length > 1) { o = document.createElement('option'); o.value = ''; o.text = '-- Scegli la tua lista --'; sel.appendChild(o); }
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

/* ---------- risultato ---------- */

function unlock() { busy = false; byId('mc-go').disabled = false; byId('mc-clear').disabled = false; }

function showResult(html, mode, topicId) {
 var res = byId('mc-result');
 res[IH] = '';
 var prev = document.createElement('div');
 prev.className = 'mc-preview';
 prev[IH] = html;

 if (mode === 'ok') {
  setStatus('Fatto! L\'acquisto e\' stato postato nella tua Lista della Spesa.');
  res.appendChild(prev);
  var act = document.createElement('div'); act.className = 'mc-act';
  var go = document.createElement('button'); go.type = 'button'; go.className = 'mc-go'; go.textContent = 'Vai al post';
  go.addEventListener('click', function () {
   location.replace('https://' + location.hostname + '/?t=' + topicId + '&view=getlastpost');
  });
  act.appendChild(go); res.appendChild(act);
  return;
 }
 if (mode === 'test') {
  setStatus('Modalita\' test: niente post e niente registro. Questa e\' l\'anteprima.');
  res.appendChild(prev);
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

 if (!c.length) { setStatus('Il carrello e\' vuoto.', true); return; }
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
 setStatus('Registro l\'acquisto...');

 var articoli = [];
 for (i = 0; i < c.length; i++) { articoli.push({ nome: c[i].it.nome, qta: c[i].q, prezzo: c[i].it.prezzo }); }
 var entry = {
  utente: USER.name, utenteId: USER.id, mercante: M.id || M.nome, topic: topicId,
  articoli: articoli, totale: total(c),
  data: new Date().toISOString(), ts: Date.now(), stato: 'in attesa'
 };

 logStart(entry, function (err, logId) {
  if (err) { unlock(); setStatus('Non riesco a registrare l\'acquisto: riprova tra poco.', true); return; }
  var html = buildPost(c, logId);
  if (C.TEST_MODE) { showResult(html, 'test', topicId); return; }
  setStatus('Pubblico il post...');
  postReply(C.SECTION_ID, topicId, html, function (ok) {
   logUpdate(logId, { stato: (ok ? 'postato' : 'post non riuscito') }, function () {
    showResult(html, (ok ? 'ok' : 'fail'), topicId);
   });
  });
 });
}

/* ---------- avvio ---------- */

function init() {
 injectCss();
 USER = getCurrentUser();
 if (!USER) { root[IH] = '<div class="mc-vuoto">Devi essere loggato per fare acquisti.</div>'; return; }
 if (!buildUi()) { return; }
 bindUi();
 updateSum();
 if (C.TEST_MODE) { setStatus('Modalita\' test attiva.'); }
 loadMyLists();
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
else { init(); }

})();
