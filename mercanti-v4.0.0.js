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
   Facoltativo, per i mercanti che ritirano lotti (RICICLO nel config):
   - in ogni scheda di rarita': <div class="mc-rec" data-mc-rec="Espansione|rarita'"></div>.
   Facoltativo, per le riparazioni (RIPARAZIONI nel config): <div class="mc-rep"></div> nel punto del modulo.
   Ogni ordine richiede la scheda del PG (sezione SECTION_SCHEDE): da li' si leggono status (sconti, furto) e statistiche.
   Il genitore di ogni .mc-qty / .mc-rec riceve la classe mc-on quando la voce e' nel carrello.
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
 SECTION_SCHEDE: 65112407,
 FIREBASE_DB_URL: 'https://spam-limitato-e-illimitato-default-rtdb.europe-west1.firebasedatabase.app',
 DB_MERCANTI: '/mercanti',
 FURTO_BASE: 10,
 FURTO_BONUS: 5,
 FURTO_PASSO: 100,
 FURTO_MAX_VALORE: 50000,
 FURTO_RAR_MAX: 'epico',
 FURTO_BLOCCO_GIORNI: 30,
 TEST_MODE: false,
 MAX_QTA: 99,
 VALUTA: 'Jenny',
 TOPICS_PER_PAGE: 30,
 MAX_PAGES: 20,
 TESTO_CONFERMA: '',
 RARITA: { comune: 'Comune', epico: 'Epico', leggendario: 'Leggendario', ultra: 'Ultra-leggendario', unico: 'Unico' },
 RARITA_PL: { comune: 'Comuni', epico: 'Epici', leggendario: 'Leggendari', ultra: 'Ultra-leggendari', unico: 'Unici' },
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
var HAS_REC = !!(C.RICICLO && C.RICICLO.length);
var HAS_REP = !!(C.RIPARAZIONI && C.RIPARAZIONI.length);
var LBL_GO = C.TESTO_CONFERMA || (HAS_REP ? 'Conferma' : (HAS_REC ? 'Ricicla' : (HAS_SELL ? 'Conferma' : 'Acquista')));

var IH = 'inn' + 'erHTML';
var CATS = [];   /* categorie del listino (acquisti) */
var ITEMS = [];  /* voci in vendita, in ordine */
var QTA = [];    /* quantita' nel carrello, stesso indice di ITEMS */
var SLOTS = [];  /* elemento .mc-qty di ogni voce (null se nella pagina manca) */
var SCATS = [];  /* categorie delle vendite */
var LINES = [];  /* righe vendute: { id, sc, v, q, num, prezzo, slot, gone } */
var RSCH = [];   /* schede del riciclo */
var RCATS = [];  /* tipi di oggetto riparabili */
var REPS = [];   /* riparazioni nel carrello: { cat, lv, nome, mat, sub } */
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
/* Nomi nei post: <span></span> dopo la prima lettera di ogni parola, cosi' Keyword Tooltips non li riconosce */
function noTip(name) {
 var words = String(name).split(' '), out = [], m;
 for (var i = 0; i < words.length; i++) {
  m = words[i].match(/^([^A-Za-z\u00C0-\u024F0-9]*[A-Za-z\u00C0-\u024F0-9])([\s\S]+)$/);
  out.push(m ? esc(m[1]) + '<span></span>' + esc(m[2]) : esc(words[i]));
 }
 var s = out.join(' ');
 return s;
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
function rarPlural(r) { var s = (C.RARITA_PL && C.RARITA_PL[r]) ? C.RARITA_PL[r] : rarLabel(r); return s; }
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
 /* riciclo */
 '#mc-shop .mc-rec{display:flex;flex-direction:column;gap:8px;margin:10px 0 0;font-family:var(--mc-font);font-size:14px;color:var(--mc-testo);text-align:left;text-transform:none;letter-spacing:normal}' +
 '#mc-shop .mc-tgs{display:flex}' +
 '#mc-shop button.mc-tg{display:block;flex:1 1 0;width:auto;height:30px;margin:0;padding:0 8px;border:1px solid var(--mc-linea);background:transparent;color:var(--mc-secondario);font-family:var(--mc-font-titoli);font-size:13px;font-weight:700;cursor:pointer;box-shadow:none}' +
 '#mc-shop button.mc-tg + button.mc-tg{border-left:0}' +
 '#mc-shop button.mc-tg-on{background:var(--mc-bottone);color:var(--mc-bottonetesto);border-color:var(--mc-cornicebordo)}' +
 '#mc-shop .mc-rec .mc-sell-f select{flex:1 1 140px}' +
 '#mc-shop .mc-rec .mc-line-n{flex:1 1 100px;font-size:14px}' +
 '#mc-shop .mc-rec-p{font-size:13px;font-style:italic;color:var(--mc-secondario)}' +
 '#mc-shop .mc-rec-p:empty{display:none}' +
 '#mc-shop .mc-rec-p b{font-style:normal;color:var(--mc-titoli)}' +
 '#mc-shop .mc-rec-p .mc-miss{color:var(--mc-accento)}' +
 /* riparazioni */
 '#mc-shop .mc-rep{display:flex;flex-direction:column;gap:8px;margin:10px 0 0;font-family:var(--mc-font);font-size:14px;color:var(--mc-testo);text-align:left;text-transform:none;letter-spacing:normal}' +
 '#mc-shop .mc-rep .mc-sell-f select{flex:1 1 180px}' +
 '#mc-shop .mc-rep .mc-sell-f select.mc-lv{flex:0 0 120px;width:120px}' +
 '#mc-shop .mc-rep input.mc-nm{display:block;flex:1 1 220px;width:auto;min-width:0;height:34px;min-height:0;margin:0;padding:0 8px;background:var(--mc-riga);color:var(--mc-testo);border:1px solid var(--mc-linea);border-radius:4px;font-family:var(--mc-font);font-size:14px;box-shadow:none}' +
 '#mc-shop .mc-rep-c{font-size:13px;font-style:italic;color:var(--mc-secondario)}' +
 '#mc-shop .mc-rep-c:empty{display:none}' +
 '#mc-shop .mc-rep-c b{font-style:normal;color:var(--mc-titoli)}' +
 /* furto, PG */
 '#mc-shop .mc-qty{flex-wrap:wrap;row-gap:4px}' +
 '#mc-shop button.mc-sb{display:inline-block;flex:0 0 auto;width:auto;height:28px;min-width:0;margin:0 0 0 6px;padding:0 9px;border:1px dashed var(--mc-accento);border-radius:4px;background:transparent;color:var(--mc-accento);font-family:var(--mc-font);font-size:12px;font-weight:700;line-height:26px;cursor:pointer;box-shadow:none}' +
 '#mc-shop .mc-stl,#mc-shop .mc-blk{display:inline-block;font-family:var(--mc-font);font-size:12px;font-style:italic;line-height:1.3;color:var(--mc-accento)}' +
 '#mc-shop .mc-blk{color:var(--mc-secondario)}' +
 '#mc-bar .mc-pginfo{margin:-2px 0 8px;font-size:13px;color:var(--mc-secondario)}' +
 '#mc-bar .mc-pginfo:empty{display:none}' +
 '#mc-bar .mc-pginfo b{color:var(--mc-titoli)}' +
 '#mc-bar .mc-pginfo.mc-err{color:var(--mc-accento);font-weight:600}' +
 '#mc-bar button.mc-spbtn{display:inline-block;width:auto;height:28px;margin:4px 0 0;padding:0 10px;border:1px solid var(--mc-cornicebordo);border-radius:4px;background:var(--mc-bottone);color:var(--mc-bottonetesto);font-family:var(--mc-font);font-size:12px;font-weight:700;cursor:pointer;box-shadow:none}' +
 /* barra di conferma */
 '#mc-bar{min-width:0;max-width:100%;font-family:var(--mc-font);color:var(--mc-testo);font-size:14px;line-height:1.4;text-align:left}' +
 '#mc-bar .mc-top{display:flex;align-items:baseline;gap:10px;margin:0 0 8px}' +
 '#mc-bar .mc-t{font-family:var(--mc-font-titoli);font-size:15px;font-weight:700;color:var(--mc-titoli)}' +
 '#mc-bar .mc-count{flex:1 1 auto;min-width:0;font-size:13px;font-style:italic;color:var(--mc-secondario)}' +
 '#mc-bar .mc-tot{flex:0 0 auto;font-family:var(--mc-font-titoli);font-size:16px;font-weight:700;color:var(--mc-titoli);white-space:nowrap}' +
 '#mc-bar .mc-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 6px}' +
 '#mc-bar select,#mc-bar input.mc-txt{display:block;height:36px;min-height:0;margin:0;padding:0 8px;background:var(--mc-riga);color:var(--mc-testo);border:1px solid var(--mc-linea);border-radius:4px;font-family:var(--mc-font);font-size:14px;box-shadow:none}' +
 '#mc-bar select{flex:1 1 200px;width:auto;min-width:0}' +
 '#mc-bar input.mc-txt{flex:0 0 110px;width:110px}' +
 '#mc-bar button.mc-go{display:inline-block;flex:0 0 auto;width:auto;height:36px;margin:0;padding:0 20px;border:1px solid var(--mc-cornicebordo);border-radius:4px;background:var(--mc-bottone);color:var(--mc-bottonetesto);font-family:var(--mc-font-titoli);font-size:14px;font-weight:700;letter-spacing:.05em;cursor:pointer;box-shadow:none}' +
 '#mc-bar button.mc-go2{padding:0 12px;background:transparent;color:var(--mc-secondario);border-color:var(--mc-linea)}' +
 '#mc-shop button[disabled]{opacity:.5;cursor:default}' +
 '#mc-bar .mc-hint{margin:-2px 0 6px;font-size:12px;font-style:italic;color:var(--mc-secondario)}' +
 '#mc-bar #mc-status{margin:6px 0 0;font-size:13px;color:var(--mc-titoli)}' +
 '#mc-bar #mc-status.mc-err{color:var(--mc-accento);font-weight:600}' +
 '#mc-bar .mc-hint:empty,#mc-bar #mc-status:empty,#mc-bar #mc-result:empty{display:none}' +
 '#mc-bar #mc-result{margin:10px 0 0;padding:10px 0 0;border-top:1px dashed var(--mc-linea)}' +
 '#mc-bar .mc-preview{padding:12px 8px;background:#8FBEBA;border-radius:6px}' +
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
 'body.ffm #mc-shop .mc-rep .mc-sell-f select.mc-lv{flex:1 1 100%;width:auto}' +
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
   ITEMS.push({ cat: ci, nome: v.nome, prezzo: Number(v.prezzo) || 0, img: v.img || '', unita: cat.unita || null, formato: CATS[ci].formato,
    rar: v.rar || cat.rar || '', key: slug(M.id + ' ' + v.nome) });
   QTA.push(0);
   STEAL.push(false);
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
  renderSlot(idx);
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

/* ---------- riciclo (lotti di oggetti in cambio di Jenny o materiali) ---------- */

function recCount(s) { var n = 0; for (var k2 in s.q) { if (s.q.hasOwnProperty(k2)) { n += s.q[k2]; } } return n; }
function recLots(s) { var l = Math.floor(recCount(s) / s.lotto); return l; }
function recMatText(s, lots) {
 var out = [];
 for (var i = 0; i < s.mat.length; i++) { out.push((s.mat[i][1] * lots) + ' ' + s.mat[i][0]); }
 return out.join(', ');
}
function recReward(s, lots) { var t = (s.mode === 'mat' && s.mat) ? recMatText(s, lots) : money(lots * s.jenny); return t; }
function recTitle(s, lots) {
 var t = rarPlural(s.rar) + ' · ' + lots + (lots === 1 ? ' lotto' : ' lotti') + ' da ' + s.lotto;
 return t;
}

function readRiciclo() {
 var lst = C.RICICLO || [], i, j, e, sc, key = {};
 for (i = 0; i < lst.length; i++) {
  e = lst[i];
  for (j = 0; j < (e.schede || []).length; j++) {
   sc = e.schede[j];
   var voci = [];
   for (var v = 0; v < (e.voci || []).length; v++) { if (e.voci[v].rar === sc.rar) { voci.push(e.voci[v]); } }
   key[norm(e.espansione + '|' + sc.rar)] = RSCH.length;
   RSCH.push({ k: RSCH.length, exp: e.espansione, rar: sc.rar, lotto: Number(sc.lotto) || 1, jenny: Number(sc.jenny) || 0,
    mat: sc.materiali || null, voci: voci, q: {}, order: [], mode: 'jenny', el: null });
  }
 }
 var boxes = root.querySelectorAll('.mc-rec[data-mc-rec]');
 for (i = 0; i < boxes.length; i++) {
  var nm = norm(boxes[i].getAttribute('data-mc-rec'));
  if (!key.hasOwnProperty(nm)) { warn('"' + nm + '" non e\' nel RICICLO'); continue; }
  buildRecBox(RSCH[key[nm]], boxes[i]);
 }
}

function buildRecBox(s, box) {
 s.el = box;
 var h = '';
 if (s.mat) {
  h += '<div class="mc-tgs"><button type="button" class="mc-tg mc-tg-on" data-rmode="jenny" data-rk="' + s.k + '">Jenny</button>' +
   '<button type="button" class="mc-tg" data-rmode="mat" data-rk="' + s.k + '">Materiali</button></div>';
 }
 h += '<div class="mc-sell-f"><select id="mc-rs-' + s.k + '" aria-label="Oggetto da consegnare"><option value="">-- Aggiungi un oggetto --</option>';
 for (var i = 0; i < s.voci.length; i++) { h += '<option value="' + i + '">' + esc(s.voci[i].nome) + '</option>'; }
 h += '</select><button type="button" class="mc-add" data-radd="' + s.k + '">Aggiungi</button></div>' +
  '<div class="mc-sell-l" id="mc-rl-' + s.k + '"></div><div class="mc-rec-p" id="mc-rp-' + s.k + '"></div>';
 box[IH] = h;
}

function renderRecList(s) {
 var box = byId('mc-rl-' + s.k), h = '', i, vi;
 if (!box) { return; }
 for (i = 0; i < s.order.length; i++) {
  vi = s.order[i];
  h += '<div class="mc-line"><span class="mc-line-n">' + esc(s.voci[vi].nome) + '</span>' +
   '<span class="mc-qty">' + qtyHtml('data-rop', ['rv', s.k + '_' + vi], 'mc-rq-' + s.k + '_' + vi, s.voci[vi].nome) + '</span></div>';
 }
 box[IH] = h;
 for (i = 0; i < s.order.length; i++) { byId('mc-rq-' + s.k + '_' + s.order[i]).value = String(s.q[s.order[i]]); }
 updateRecProg(s);
}

function updateRecProg(s) {
 var p = byId('mc-rp-' + s.k), n = recCount(s);
 if (s.el) { if (n > 0) { addClass(s.el.parentNode, 'mc-on'); } else { delClass(s.el.parentNode, 'mc-on'); } }
 if (!p) { return; }
 if (!n) { p[IH] = ''; return; }
 var lots = recLots(s), rest = n % s.lotto;
 var h = n + (n === 1 ? ' oggetto' : ' oggetti') + ' · <b>' + lots + (lots === 1 ? ' lotto' : ' lotti') + '</b>';
 if (lots) { h += ' → <b>' + esc(recReward(s, lots)) + '</b>'; }
 if (rest) { h += '<br><span class="mc-miss">ne mancano ' + (s.lotto - rest) + ' per completare il lotto, oppure togline ' + rest + '</span>'; }
 p[IH] = h;
}

function addRec(k) {
 if (busy) { return; }
 var s = RSCH[k], sel = byId('mc-rs-' + k);
 if (!sel || sel.value === '') { setStatus('Scegli l\'oggetto da consegnare.', true); return; }
 var vi = parseInt(sel.value, 10);
 if (s.q.hasOwnProperty(vi)) { s.q[vi] = Math.min(C.MAX_QTA, s.q[vi] + 1); } else { s.q[vi] = 1; s.order.push(vi); }
 sel.value = '';
 setStatus('');
 renderRecList(s);
 updateSum();
}

function setRecQ(k, vi, v, fromInput) {
 var s = RSCH[k];
 if (busy || !s || !s.q.hasOwnProperty(vi)) { return; }
 v = parseInt(v, 10) || 0;
 if (v < 0) { v = 0; }
 if (v > C.MAX_QTA) { v = C.MAX_QTA; }
 if (v === 0 && !fromInput) {
  delete s.q[vi];
  var o = [];
  for (var i = 0; i < s.order.length; i++) { if (s.order[i] !== vi) { o.push(s.order[i]); } }
  s.order = o;
  renderRecList(s);
  updateSum();
  return;
 }
 s.q[vi] = v;
 var inp = byId('mc-rq-' + k + '_' + vi);
 if (inp && !(fromInput && inp.value === '') && inp.value !== String(v)) { inp.value = String(v); }
 updateRecProg(s);
 updateSum();
}

function setRecMode(k, mode) {
 var s = RSCH[k];
 if (busy || !s || !s.mat) { return; }
 s.mode = mode === 'mat' ? 'mat' : 'jenny';
 var bt = s.el.querySelectorAll('button.mc-tg');
 for (var i = 0; i < bt.length; i++) {
  if (bt[i].getAttribute('data-rmode') === s.mode) { addClass(bt[i], 'mc-tg-on'); } else { delClass(bt[i], 'mc-tg-on'); }
 }
 updateRecProg(s);
 updateSum();
}

function cartRec() {
 var out = [];
 for (var i = 0; i < RSCH.length; i++) {
  var s = RSCH[i], n = recCount(s);
  if (n > 0) { out.push({ s: s, n: n, lots: recLots(s), sub: (s.mode === 'mat' && s.mat) ? 0 : recLots(s) * s.jenny }); }
 }
 return out;
}
function recMats(rc) {
 var tot = {}, order = [], i, j, m;
 for (i = 0; i < rc.length; i++) {
  if (rc[i].s.mode !== 'mat' || !rc[i].s.mat) { continue; }
  for (j = 0; j < rc[i].s.mat.length; j++) {
   m = rc[i].s.mat[j];
   if (!tot.hasOwnProperty(m[0])) { tot[m[0]] = 0; order.push(m[0]); }
   tot[m[0]] += m[1] * rc[i].lots;
  }
 }
 var out = [];
 for (i = 0; i < order.length; i++) { if (tot[order[i]]) { out.push(tot[order[i]] + ' ' + order[i]); } }
 return out.join(', ');
}
function recItemsText(s) {
 var out = [];
 for (var i = 0; i < s.order.length; i++) { out.push(noTip(s.voci[s.order[i]].nome) + ' &times;' + s.q[s.order[i]]); }
 var t = out.join(' &middot; ');
 return t;
}

/* ---------- riparazioni (costo in Jenny e materiali in base al livello) ---------- */

function repMatText(mats) {
 var out = [];
 for (var i = 0; i < mats.length; i++) { out.push(mats[i][1] + ' ' + mats[i][0]); }
 var t = out.join(', ');
 return t;
}

function readRiparazioni() {
 var lst = C.RIPARAZIONI || [], i;
 for (i = 0; i < lst.length; i++) { RCATS.push({ nome: lst[i].categoria, livelli: lst[i].livelli || [] }); }
 var box = root.querySelector('.mc-rep');
 if (!box || !RCATS.length) { return; }
 var h = '<div class="mc-sell-f"><select id="mc-pc" aria-label="Tipo di oggetto"><option value="">-- Tipo di oggetto --</option>';
 for (i = 0; i < RCATS.length; i++) { h += '<option value="' + i + '">' + esc(RCATS[i].nome) + '</option>'; }
 h += '</select><select id="mc-pl" class="mc-lv" aria-label="Livello"><option value="">Livello</option></select></div>' +
  '<div class="mc-sell-f"><input type="text" class="mc-nm" id="mc-pn" maxlength="80" placeholder="Nome dell\'oggetto da riparare">' +
  '<button type="button" class="mc-add" data-padd="1">Aggiungi</button></div>' +
  '<div class="mc-rep-c" id="mc-pcost"></div>' +
  '<div class="mc-sell-l" id="mc-plist"></div>';
 box[IH] = h;
 byId('mc-pc').addEventListener('change', fillRepLevels);
 byId('mc-pl').addEventListener('change', showRepCost);
}

function fillRepLevels() {
 var sel = byId('mc-pl'), ci = byId('mc-pc').value, o;
 sel[IH] = '';
 o = document.createElement('option'); o.value = ''; o.text = 'Livello'; sel.appendChild(o);
 if (ci !== '') {
  var lv = RCATS[parseInt(ci, 10)].livelli;
  for (var i = 0; i < lv.length; i++) { o = document.createElement('option'); o.value = String(i); o.text = 'Livello ' + (i + 1); sel.appendChild(o); }
 }
 showRepCost();
}

function showRepCost() {
 var box = byId('mc-pcost'), ci = byId('mc-pc').value, li = byId('mc-pl').value;
 if (ci === '' || li === '') { box[IH] = ''; return; }
 var L = RCATS[parseInt(ci, 10)].livelli[parseInt(li, 10)];
 box[IH] = 'Costo: <b>' + esc(repMatText(L.materiali || [])) + '</b> + <b>' + money(disc(Number(L.jenny) || 0)) + '</b>';
}

function addRep() {
 if (busy) { return; }
 var ci = byId('mc-pc').value, li = byId('mc-pl').value, nm = norm(byId('mc-pn').value);
 if (ci === '') { setStatus('Scegli il tipo di oggetto da riparare.', true); return; }
 if (li === '') { setStatus('Scegli il livello dell\'oggetto da riparare.', true); return; }
 if (!nm) { setStatus('Scrivi il nome dell\'oggetto da riparare.', true); return; }
 var cat = RCATS[parseInt(ci, 10)], L = cat.livelli[parseInt(li, 10)];
 REPS.push({ cat: cat.nome, lv: parseInt(li, 10) + 1, nome: nm, mat: L.materiali || [], jb: Number(L.jenny) || 0 });
 byId('mc-pn').value = '';
 setStatus('');
 renderRepList();
 updateSum();
}

function removeRep(i) {
 if (busy) { return; }
 REPS.splice(i, 1);
 renderRepList();
 updateSum();
}

function renderRepList() {
 var box = byId('mc-plist'), h = '';
 if (!box) { return; }
 for (var i = 0; i < REPS.length; i++) {
  var r = REPS[i];
  h += '<div class="mc-line"><span class="mc-line-n">' + esc(r.nome) + '<small>' + esc(r.cat) + ' · Livello ' + r.lv + ' — ' + esc(repMatText(r.mat)) + '</small></span>' +
   '<span class="mc-line-p">' + money(disc(r.jb)) + '</span>' +
   '<button type="button" class="mc-b" data-prem="' + i + '" title="Togli">&times;</button></div>';
 }
 box[IH] = h;
 var wrap = root.querySelector('.mc-rep');
 if (wrap) { if (REPS.length) { addClass(wrap.parentNode, 'mc-on'); } else { delClass(wrap.parentNode, 'mc-on'); } }
}

function cartRep() {
 var out = [];
 for (var i = 0; i < REPS.length; i++) { var r = REPS[i]; out.push({ cat: r.cat, lv: r.lv, nome: r.nome, mat: r.mat, jb: r.jb, sub: disc(r.jb) }); }
 return out;
}
function repMats(rp) {
 var tot = {}, order = [], i, j, m;
 for (i = 0; i < rp.length; i++) {
  for (j = 0; j < rp[i].mat.length; j++) {
   m = rp[i].mat[j];
   if (!tot.hasOwnProperty(m[0])) { tot[m[0]] = 0; order.push(m[0]); }
   tot[m[0]] += m[1];
  }
 }
 var out = [];
 for (i = 0; i < order.length; i++) { out.push(tot[order[i]] + ' ' + order[i]); }
 var t = out.join(', ');
 return t;
}

/* ---------- scheda del PG: status, statistiche, sconto e Sponsor ---------- */

/* status che danno uno sconto (vale solo il piu' alto) o il furto; re = come si riconosce nella scheda */
var STATUS_DEF = C.STATUS || [
 { k: 'presidente', re: 'presidente', sconto: 25 },
 { k: 'zodiaco', re: 'zodiaco', sconto: 20 },
 { k: 'lottatore', re: 'lottator', sconto: 20, sponsor: true },
 { k: 'hunter', re: '^hunter$', sconto: 10 },
 { k: 'criminale', re: 'criminale', sconto: 10 },
 { k: 'ragno', re: 'ragno', sconto: 0, furto: true }
];
var MDB = String(C.FIREBASE_DB_URL).replace(/\/+$/, '') + C.DB_MERCANTI;
var PG = null;     /* { id, titolo, link, status, keys, des, fort, sponsor, furti } */
var pgReq = 0;

function apiTopics(sectionId, onDone) {
 var mine = [], perPage = 100, page = 0, seen = {}, st = 0, pages = 0;
 function apiPage() {
  fetch('/api.php?f=' + sectionId + '&a=2&n=' + perPage + '&st=' + (page * perPage) + '&cook' + 'ie=1&_=' + Date.now(), { credentials: 'same-origin' })
   .then(function (r) { if (!r.ok) { throw new Error('HTTP ' + r.status); } var j = r.json(); return j; })
   .then(function (data) {
    var th = (data && data.threads) ? data.threads : [];
    for (var i = 0; i < th.length; i++) {
     var t = th[i];
     if (!t.info || !t.info.start) { continue; }
     if (String(t.info.start.id) === String(USER.id)) { mine.push({ id: String(t.id), title: decodeTitle(t.title) }); }
    }
    if (th.length === perPage && page < C.MAX_PAGES) { page++; apiPage(); }
    else { onDone(mine, false); }
   })
   .catch(function () { mine = []; htmlPages(); });
 }
 function htmlPages() {
  fetch('/?f=' + sectionId + '&st=' + st, { credentials: 'same-origin' })
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
    else { onDone(mine, false); }
   })
   .catch(function () { onDone(mine, true); });
 }
 apiPage();
}

function fillTopicSelect(sel, hint, mine, failed, txt) {
 sel[IH] = '';
 var o;
 if (!mine.length) {
  o = document.createElement('option'); o.value = ''; o.text = txt.nessuna;
  sel.appendChild(o);
  hint.textContent = failed ? txt.errore : txt.vuota;
  return;
 }
 if (mine.length > 1) { o = document.createElement('option'); o.value = ''; o.text = txt.scegli; sel.appendChild(o); }
 for (var i = 0; i < mine.length; i++) {
  o = document.createElement('option'); o.value = mine[i].id; o.text = mine[i].title;
  sel.appendChild(o);
 }
 hint.textContent = '';
}

function sumNumbers(txt) {
 var m = String(txt || '').replace(/\./g, '').match(/[+\-−]?\s*\d+/g), s = 0, i;
 if (!m) { return null; }
 for (i = 0; i < m.length; i++) { s += parseInt(m[i].replace(/\s/g, '').replace('−', '-'), 10) || 0; }
 return s;
}

function parseScheda(doc) {
 var out = { status: [], stats: {}, ok: false }, i;
 var dp = doc.querySelector('.dati-pg');
 if (dp) {
  var sp = dp.querySelectorAll('span');
  for (i = 0; i < sp.length - 1; i++) {
   if (norm(sp[i].textContent).toLowerCase() === 'status:') {
    var parts = String(sp[i + 1].textContent || '').split('|');
    for (var j = 0; j < parts.length; j++) {
     var p = norm(parts[j]);
     if (p && p.toLowerCase() !== 'nessuno' && p.toLowerCase() !== 'n/d') { out.status.push(p); }
    }
    out.ok = true;
    break;
   }
  }
 }
 var grid = doc.querySelector('.stats-grid');
 if (grid) {
  var cards = grid.querySelectorAll('.stat-card');
  for (i = 0; i < cards.length; i++) {
   var lab = cards[i].querySelector('.stat-label'), val = cards[i].querySelector('.stat-value');
   if (lab && val) { out.stats[norm(lab.textContent).toLowerCase()] = sumNumbers(val.textContent); }
  }
  out.ok = true;
 }
 return out;
}

function statusKeys(list) {
 var keys = {}, i, j;
 for (i = 0; i < list.length; i++) {
  var s = String(list[i]).toLowerCase().replace(/’/g, "'");
  for (j = 0; j < STATUS_DEF.length; j++) {
   if (new RegExp(STATUS_DEF[j].re).test(s)) { keys[STATUS_DEF[j].k] = list[i]; }
  }
 }
 return keys;
}

/* sconto piu' alto tra gli status del PG; quello dello Sponsor vale solo dal mercante scelto */
function scontoPg() {
 var best = { perc: 0, da: '' };
 if (!PG) { return best; }
 for (var j = 0; j < STATUS_DEF.length; j++) {
  var d = STATUS_DEF[j];
  if (!PG.keys.hasOwnProperty(d.k) || !d.sconto) { continue; }
  if (d.sponsor && PG.sponsor !== M.id) { continue; }
  if (d.sconto > best.perc) { best = { perc: d.sconto, da: PG.keys[d.k] + (d.sponsor ? ' - Sponsor' : '') }; }
 }
 return best;
}

/* fino a X,5 per difetto, da X,6 per eccesso */
function arrot(v) { var r = Math.round(v * 100) / 100; var o = Math.ceil(r - 0.5); return o; }
function disc(prezzo) {
 var p = scontoPg().perc;
 var out = p ? arrot(prezzo * (100 - p) / 100) : prezzo;
 return out;
}
function hasSponsorStatus() {
 for (var j = 0; j < STATUS_DEF.length; j++) { if (STATUS_DEF[j].sponsor && PG && PG.keys.hasOwnProperty(STATUS_DEF[j].k)) { return true; } }
 return false;
}

function mfb(method, path, body, cb) {
 var opts = { method: method };
 if (body !== undefined) { opts.body = JSON.stringify(body); }
 fetch(MDB + path + '.json', opts)
  .then(function (r) { if (!r.ok) { throw new Error('HTTP ' + r.status); } var j = r.json(); return j; })
  .then(function (data) { later(function () { cb(null, data); }); })
  .catch(function (e) { later(function () { cb(e, null); }); });
}

function loadPg(id) {
 var req = ++pgReq;
 PG = null;
 onPgChange();
 if (!id) { pgInfo(''); return; }
 pgInfo('Leggo la scheda...');
 fetch('/?t=' + id, { credentials: 'same-origin' })
  .then(function (r) { if (!r.ok) { throw new Error('HTTP ' + r.status); } var tx = r.text(); return tx; })
  .then(function (html) {
   if (req !== pgReq) { return; }
   var doc = new DOMParser().parseFromString(html, 'text/html');
   var sc = parseScheda(doc);
   if (!sc.ok) { pgInfo('Non trovo una scheda PG in questo topic: controlla la scelta.', true); return; }
   var tit = norm((doc.querySelector('title') || {}).textContent || ('Scheda ' + id));
   var pg = { id: String(id), titolo: tit, link: 'https://' + location.hostname + '/?t=' + id, status: sc.status, keys: statusKeys(sc.status),
    des: sc.stats.destrezza || 0, fort: sc.stats.fortuna || 0, hasFort: sc.stats.hasOwnProperty('fortuna'), sponsor: null, sponsorNome: '', furti: {} };
   if (C.TEST_MODE) { PG = pg; pgInfoRender(); onPgChange(); return; }
   mfb('GET', '/sponsor/' + pg.id, undefined, function (e1, sp) {
    if (req !== pgReq) { return; }
    if (sp && sp.mercante) { pg.sponsor = sp.mercante; pg.sponsorNome = sp.nome || sp.mercante; }
    mfb('GET', '/furti/' + pg.id, undefined, function (e2, fu) {
     if (req !== pgReq) { return; }
     if (e1 || e2) { pgInfo('Non riesco a leggere i dati dei mercanti: riprova tra poco.', true); return; }
     pg.furti = fu || {};
     PG = pg;
     pgInfoRender();
     onPgChange();
    });
   });
  })
  .catch(function () { if (req === pgReq) { pgInfo('Non riesco ad aprire la scheda: controlla la scelta.', true); } });
}

function pgInfo(html, isErr) {
 var el = byId('mc-pginfo');
 el[IH] = html;
 el.className = 'mc-pginfo' + (isErr ? ' ' + 'mc-err' : '');
}

function pgInfoRender() {
 if (!PG) { pgInfo(''); return; }
 var sc = scontoPg(), parts = [];
 parts.push('Status: <b>' + (PG.status.length ? esc(PG.status.join(', ')) : 'nessuno') + '</b>');
 parts.push(sc.perc ? 'sconto qui <b>' + sc.perc + '%</b> (' + esc(sc.da) + ')' : 'nessuno sconto qui');
 parts = parts.concat(pgInfoExtra());
 var h = parts.join(' · ');
 if (hasSponsorStatus()) {
  if (PG.sponsor) { h += '<br>Sponsor: <b>' + esc(PG.sponsorNome) + '</b>' + (PG.sponsor === M.id ? ' (questo mercante)' : ''); }
  else { h += '<br>Non hai ancora registrato lo Sponsor. <button type="button" class="' + 'mc-spbtn" data-sponsor="1">Scegli ' + esc(M.nome) + ' come Sponsor</button>'; }
 }
 pgInfo(h);
}

function registerSponsor() {
 if (busy || !PG || PG.sponsor) { return; }
 if (!window.confirm('Vuoi registrare ' + M.nome + ' come Sponsor di ' + PG.titolo + '?\n\nLo Sponsor si puo\' cambiare solo durante i Censimenti, chiedendo allo staff.')) { return; }
 var val = { mercante: M.id, nome: M.nome, pg: PG.titolo, utente: USER.name, utenteId: USER.id, ts: Date.now() };
 if (C.TEST_MODE) { PG.sponsor = M.id; PG.sponsorNome = M.nome; pgInfoRender(); onPgChange(); return; }
 mfb('PUT', '/sponsor/' + PG.id, val, function (err) {
  if (err) { setStatus('Non riesco a registrare lo Sponsor (forse e\' gia\' registrato): ricarica la pagina.', true); return; }
  PG.sponsor = M.id; PG.sponsorNome = M.nome;
  pgInfoRender();
  onPgChange();
 });
}

function bindPg() {
 var sel = byId('mc-pg'), man = byId('mc-pg-manual'), timer = null;
 sel.addEventListener('change', function () { man.value = ''; loadPg(sel.value); });
 man.addEventListener('input', function () {
  var v = man.value.replace(/\D/g, '');
  if (v !== man.value) { man.value = v; }
  if (timer) { clearTimeout(timer); }
  timer = setTimeout(function () { loadPg(v || sel.value); }, 700);
 });
 bar.addEventListener('click', function (e) {
  if (e.target && e.target.getAttribute && e.target.getAttribute('data-sponsor')) { e.preventDefault(); registerSponsor(); }
 });
 apiTopics(C.SECTION_SCHEDE, function (mine, failed) {
  fillTopicSelect(sel, byId('mc-pg-hint'), mine, failed, {
   nessuna: 'Nessuna scheda trovata', scegli: '-- Scegli il PG --',
   errore: 'Non riesco a leggere la sezione delle schede: scrivi l\'ID del topic della scheda.',
   vuota: 'Non ho trovato schede aperte da te: scrivi l\'ID del topic della scheda.'
  });
  if (mine.length === 1) { loadPg(mine[0].id); }
 });
}

/* ---------- furto (status Ragno) ---------- */

var RAR_RANK = { comune: 1, raro: 2, epico: 3, leggendario: 4, ultra: 5, unico: 6 };
var STEAL = [];  /* tentativo di furto per voce, stesso indice di ITEMS */

function slug(s) { var out = String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); return out; }
function rnd(n) {
 var cr = window.crypto || window.msCrypto;
 if (cr && cr.getRandomValues) {
  var buf = new Uint32Array(1), lim = Math.floor(4294967296 / n) * n;
  do { cr.getRandomValues(buf); } while (buf[0] >= lim);
  var r = (buf[0] % n) + 1;
  return r;
 }
 var r2 = Math.floor(Math.random() * n) + 1;
 return r2;
}
function dateStr(ts) { var d = new Date(ts); var s = pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear(); return s; }
function rubabile(it) {
 if (it.prezzo > C.FURTO_MAX_VALORE) { return false; }
 if (!it.rar) { return true; }
 var r = RAR_RANK[String(it.rar).toLowerCase()];
 var ok = r !== undefined && r <= RAR_RANK[C.FURTO_RAR_MAX];
 return ok;
}
function isRagno() {
 for (var j = 0; j < STATUS_DEF.length; j++) { if (STATUS_DEF[j].furto && PG && PG.keys.hasOwnProperty(STATUS_DEF[j].k)) { return true; } }
 return false;
}
function furtoChance() {
 var tot = PG ? (PG.des + PG.fort) : 0;
 var c = C.FURTO_BASE + C.FURTO_BONUS * Math.floor(tot / C.FURTO_PASSO);
 return c;
}
function furtoRec(it) { var f = (PG && PG.furti) ? PG.furti[it.key] : null; return f || null; }
function bloccato(it) { var f = furtoRec(it); var b = !!(f && f.esito === 'fallito' && f.scadenza > Date.now()); return b; }
function pgInfoExtra() {
 var out = [];
 if (isRagno()) { out.push('furto <b>' + furtoChance() + '%</b> (Destrezza ' + PG.des + ' + Fortuna ' + PG.fort + ')'); }
 return out;
}

function renderSlot(i) {
 var slot = SLOTS[i], it = ITEMS[i], h;
 if (!slot) { return; }
 if (bloccato(it)) {
  h = '<span class="mc-blk">Furto fallito: acquistabile dal ' + dateStr(furtoRec(it).scadenza) + '</span>';
 } else if (STEAL[i]) {
  h = '<span class="mc-stl">Tentativo di furto · ' + furtoChance() + '%</span><button type="button" class="mc-sb" data-steal="' + i + '">Annulla</button>';
 } else {
  h = qtyHtml('data-op', ['i', i], 'mc-q-' + i, it.nome);
  if (isRagno() && rubabile(it) && !furtoRec(it)) { h += '<button type="button" class="mc-sb" data-steal="' + i + '">Tenta il furto</button>'; }
 }
 slot[IH] = h;
 var inp = byId('mc-q-' + i);
 if (inp) { inp.value = String(QTA[i]); }
 if (QTA[i] > 0 || STEAL[i]) { addClass(slot.parentNode, 'mc-on'); } else { delClass(slot.parentNode, 'mc-on'); }
}

function setSteal(i) {
 if (busy || !ITEMS[i]) { return; }
 STEAL[i] = !STEAL[i];
 if (STEAL[i]) { QTA[i] = 0; }
 renderSlot(i);
 updateSum();
}

function onPgChange() {
 for (var i = 0; i < ITEMS.length; i++) {
  if (STEAL[i] && !(isRagno() && rubabile(ITEMS[i]) && !furtoRec(ITEMS[i]))) { STEAL[i] = false; }
  if (bloccato(ITEMS[i])) { QTA[i] = 0; STEAL[i] = false; }
  renderSlot(i);
 }
 renderRepList();
 updateSum();
}

function cartSteal() {
 var out = [];
 for (var i = 0; i < ITEMS.length; i++) { if (STEAL[i]) { out.push({ it: ITEMS[i], i: i }); } }
 return out;
}

/* tira i dadi, registra il tentativo su Firebase (una volta sola per PG e oggetto) e poi lo mostra */
function resolveFurti(st, cb) {
 var ch = furtoChance(), now = Date.now(), res = [], i;
 for (i = 0; i < st.length; i++) {
  var d = rnd(100), ok = d <= ch;
  res.push({ it: st[i].it, d: d, soglia: ch, esito: ok ? 'riuscito' : 'fallito', scadenza: ok ? 0 : now + C.FURTO_BLOCCO_GIORNI * 86400000 });
 }
 if (C.TEST_MODE) { cb(null, res, 'TEST'); return; }
 mfb('GET', '/furti/' + PG.id, undefined, function (e0, fu) {
  if (e0) { cb('Non riesco a leggere i furti del PG: riprova tra poco.'); return; }
  fu = fu || {};
  for (var a = 0; a < res.length; a++) { if (fu[res[a].it.key]) { cb('Questo PG ha gia\' tentato il furto di ' + res[a].it.nome + '.'); return; } }
  var tiri = [];
  for (a = 0; a < res.length; a++) { tiri.push(res[a].it.nome + ': d100 ' + res[a].d + ' su ' + res[a].soglia + ' (' + res[a].esito + ')'); }
  mfb('POST', '/log', { utente: USER.name, utenteId: USER.id, pg: PG.titolo, pgId: PG.id, mercante: M.id, furti: tiri, ts: now }, function (e1, r) {
   if (e1 || !r || !r.name) { cb('Non riesco a registrare il furto: nessun dado e\' stato tenuto, riprova tra poco.'); return; }
   var logId = r.name, n = 0;
   function next() {
    if (n >= res.length) { cb(null, res, logId); return; }
    var x = res[n];
    var val = { oggetto: x.it.nome, esito: x.esito, tiro: x.d, soglia: x.soglia, ts: now, log: logId, utente: USER.name, utenteId: USER.id };
    if (x.scadenza) { val.scadenza = x.scadenza; }
    mfb('PUT', '/furti/' + PG.id + '/' + x.it.key, val, function (e2) {
     if (e2) { cb('Il furto di ' + x.it.nome + ' risulta gia\' tentato: ricarica la pagina.'); return; }
     PG.furti[x.it.key] = val;
     n++;
     next();
    });
   }
   next();
  });
 });
}

/* ---------- barra ---------- */

function buildBar() {
 bar[IH] = '<div class="mc-top"><span class="mc-t">Carrello</span><span class="mc-count" id="mc-count"></span><span class="mc-tot" id="mc-tot"></span></div>' +
  '<div class="mc-row">' +
  '<select id="mc-pg" title="Il PG che fa l\'ordine"><option value="">Caricamento schede...</option></select>' +
  '<input class="mc-txt" id="mc-pg-manual" type="text" inputmode="numeric" placeholder="ID scheda" title="Se la scheda del PG non compare nel menu, scrivi qui l\'ID del topic">' +
  '</div>' +
  '<div class="mc-hint" id="mc-pg-hint"></div>' +
  '<div class="mc-pginfo" id="mc-pginfo"></div>' +
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
 if (busy || !ITEMS[i] || bloccato(ITEMS[i]) || STEAL[i]) { return; }
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
 for (var i = 0; i < ITEMS.length; i++) { if (QTA[i] > 0) { var u = disc(ITEMS[i].prezzo); out.push({ it: ITEMS[i], q: QTA[i], unit: u, sub: u * QTA[i] }); } }
 return out;
}
function cartSell() {
 var out = [];
 for (var i = 0; i < LINES.length; i++) { if (!LINES[i].gone && LINES[i].q > 0) { out.push({ l: LINES[i], sub: LINES[i].prezzo * LINES[i].q }); } }
 return out;
}
function total(c) { var t = 0; for (var i = 0; i < c.length; i++) { t += c[i].sub; } return t; }

function updateSum() {
 var c = cart(), sv = cartSell(), rc = cartRec(), rp = cartRep(), pezzi = 0, i, parts = [], lots = 0;
 for (i = 0; i < c.length; i++) { pezzi += c[i].q; }
 for (i = 0; i < rc.length; i++) { lots += rc[i].lots; }
 if (c.length) { parts.push(c.length + (c.length === 1 ? ' acquisto' : ' acquisti') + (pezzi !== c.length ? ' (' + pezzi + ' pezzi)' : '')); }
 if (sv.length) { parts.push(sv.length + (sv.length === 1 ? ' vendita' : ' vendite')); }
 if (rc.length) { parts.push(lots + (lots === 1 ? ' lotto' : ' lotti')); }
 if (rp.length) { parts.push(rp.length + (rp.length === 1 ? ' riparazione' : ' riparazioni')); }
 if (!HAS_SELL && !HAS_REC && !HAS_REP && c.length) { parts = [c.length + (c.length === 1 ? ' articolo' : ' articoli') + (pezzi !== c.length ? ' (' + pezzi + ' pezzi)' : '')]; }
 var nf = cartSteal().length;
 if (nf) { parts.push(nf + (nf === 1 ? ' furto' : ' furti')); }
 byId('mc-count').textContent = parts.length ? parts.join(' \u00b7 ') :
  (HAS_REP ? 'vuoto: aggiungi oggetti da riciclare o riparare' : (HAS_REC ? 'vuoto: aggiungi gli oggetti da consegnare' : (HAS_SELL ? 'vuoto: scegli cosa comprare o vendere' : 'vuoto: scegli le quantit\u00e0 nel listino')));
 var inc = total(sv) + total(rc), spend = total(c) + total(rp), mats = recMats(rc) || repMats(rp), t;
 if (!spend && !inc && !mats && nf) { byId('mc-tot').textContent = money(0); return; }
 if (spend && (sv.length || rc.length)) { t = 'Saldo ' + signed(inc - spend); }
 else if (spend) { t = money(spend); }
 else if (sv.length || rc.length) { t = (inc || !mats ? '+' + money(inc) : ''); }
 else { t = money(0); }
 if (mats) { t += (t ? ' + materiali' : 'Materiali'); }
 byId('mc-tot').textContent = t;
}

function clearAll() {
 var i;
 for (i = 0; i < ITEMS.length; i++) { if (QTA[i]) { setQta(i, 0); } if (STEAL[i]) { STEAL[i] = false; renderSlot(i); } }
 for (i = 0; i < LINES.length; i++) {
  if (LINES[i].slot) { if (LINES[i].q) { setLineQ(LINES[i].id, 0); } }
  else { LINES[i].gone = true; }
 }
 for (i = 0; i < SCATS.length; i++) { if (SCATS[i].tipo === 'elenco') { renderSellList(i); } }
 for (i = 0; i < RSCH.length; i++) { RSCH[i].q = {}; RSCH[i].order = []; renderRecList(RSCH[i]); }
 REPS = [];
 renderRepList();
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
  } else if (b.getAttribute('data-rop')) {
   e.preventDefault();
   var rv = b.getAttribute('data-rv').split('_'), rk = parseInt(rv[0], 10), rvi = parseInt(rv[1], 10);
   setRecQ(rk, rvi, RSCH[rk].q[rvi] + parseInt(b.getAttribute('data-rop'), 10));
  } else if (b.getAttribute('data-radd') !== null && b.getAttribute('data-radd') !== '') {
   e.preventDefault();
   addRec(parseInt(b.getAttribute('data-radd'), 10));
  } else if (b.getAttribute('data-steal') !== null && b.getAttribute('data-steal') !== '') {
   e.preventDefault();
   setSteal(parseInt(b.getAttribute('data-steal'), 10));
  } else if (b.getAttribute('data-padd')) {
   e.preventDefault();
   addRep();
  } else if (b.getAttribute('data-prem') !== null && b.getAttribute('data-prem') !== '') {
   e.preventDefault();
   removeRep(parseInt(b.getAttribute('data-prem'), 10));
  } else if (b.getAttribute('data-rmode')) {
   e.preventDefault();
   setRecMode(parseInt(b.getAttribute('data-rk'), 10), b.getAttribute('data-rmode'));
  }
 });
 root.addEventListener('input', function (e) {
  var t = e.target;
  if (!t || t.className !== 'mc-in') { return; }
  var clean = t.value.replace(/\D/g, '');
  if (clean !== t.value) { t.value = clean; }
  if (t.getAttribute('data-l') !== null) { setLineQ(parseInt(t.getAttribute('data-l'), 10), clean, true); }
  else if (t.getAttribute('data-rv') !== null) { var p2 = t.getAttribute('data-rv').split('_'); setRecQ(parseInt(p2[0], 10), parseInt(p2[1], 10), clean, true); }
  else { setQta(parseInt(t.getAttribute('data-i'), 10), clean, true); }
 });
 root.addEventListener('change', function (e) {
  var t = e.target;
  if (!t || t.className !== 'mc-in' || t.value !== '') { return; }
  if (t.getAttribute('data-l') !== null) {
   var l = LINES[parseInt(t.getAttribute('data-l'), 10)];
   if (l && !l.slot) { setLineQ(l.id, 0); return; }
  }
  if (t.getAttribute('data-rv') !== null) { var p3 = t.getAttribute('data-rv').split('_'); setRecQ(parseInt(p3[0], 10), parseInt(p3[1], 10), 0); return; }
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
 h += '<div style="font-weight:bold;color:' + T.titoli + ';">' + nome + '</div>';
 h += '<div style="font-size:12px;color:' + T.secondario + ';">' + detail + ' <span style="float:right;max-width:100%;margin:0 0 0 8px;font-size:13px;font-weight:bold;text-align:right;color:' + T.titoli + ';">' + sub + '</span></div>';
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
 var s = '<div style="overflow:hidden;padding:4px 0 0;' + scStyle(big ? 17 : 15, big ? T.titoli : T.secondario) + '">' + label +
  ' <span style="float:right;max-width:100%;margin:0 0 0 10px;text-align:right;' +
  (big ? 'font-family:' + F.titolo + ';font-size:20px;' : 'font-family:' + F.testo + ';font-size:13px;font-weight:bold;') + 'color:' + T.titoli + ';">' + val + '</span></div>';
 return s;
}

function buildPost(c, sv, rc, rp, fr, logId) {
 var i, ci, rows;
 var h = '<div style="max-width:600px;margin:0 auto;padding:7px;background:' + T.cornice + ';border:1px solid ' + T.cornicebordo + ';border-radius:3px;text-align:left;">';
 h += '<div style="padding:14px 12px;background:' + T.fondo + ';border:1px solid ' + T.bordo + ';border-radius:2px;font-family:' + F.testo + ';font-size:13px;line-height:1.45;overflow-wrap:normal;word-break:normal;color:' + T.testo + ';">';
 h += '<div style="font-family:' + F.titolo + ';font-size:26px;color:' + T.titoli + ';text-align:center;letter-spacing:1px;">' + esc(M.nome) + '</div>';
 if (M.titolo) { h += '<div style="' + scStyle(15, T.secondario) + 'text-align:center;">' + esc(M.titolo) + '</div>'; }
 h += '<div style="height:1px;margin:10px 0 12px;background:linear-gradient(90deg,' + T.accento + ',' + T.fondo + ');"></div>';
 h += '<table style="width:100%;border-collapse:collapse;border:0;margin:0 0 4px;">' +
  infoRow('Utente', esc(USER.name)) +
  infoRow('PG', '<a style="color:' + T.titoli + ';font-weight:bold;" href="' + esc(PG.link) + '">' + esc(PG.titolo) + '</a>') +
  infoRow('Status', PG.status.length ? esc(PG.status.join(', ')) : 'Nessuno') +
  (scontoPg().perc ? infoRow('Sconto', scontoPg().perc + '% (' + esc(scontoPg().da) + ')') : '') +
  infoRow('Data', nowStr()) + '</table>';

 if (c.length) {
  if (sv.length) { h += sectionLabel('Acquisti'); }
  for (ci = 0; ci < CATS.length; ci++) {
   rows = '';
   for (i = 0; i < c.length; i++) {
    if (c[i].it.cat !== ci) { continue; }
    rows += rowPost(noTip(c[i].it.nome), c[i].it.img, c[i].it.formato, esc(qtaLabel(c[i].it, c[i].q)) + ' &times; ' + money(c[i].unit) + (c[i].unit !== c[i].it.prezzo ? ' (invece di ' + money(c[i].it.prezzo) + ')' : ''), money(c[i].sub));
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
    rows += rowPost(noTip(l.v.nome), l.v.img || '', SCATS[ci].formato, esc(lineDetail(l, true)).replace(' × ', ' &times; '), money(sv[i].sub));
   }
   if (rows) { h += catLabel(SCATS[ci].nome) + rows; }
  }
 }

 if (rc.length) {
  h += sectionLabel('Lotti consegnati a ' + M.nome);
  var lastExp = null;
  for (i = 0; i < rc.length; i++) {
   if (rc[i].s.exp !== lastExp) { h += catLabel(rc[i].s.exp); lastExp = rc[i].s.exp; }
   h += rowPost(esc(recTitle(rc[i].s, rc[i].lots)), '', 'quadro', recItemsText(rc[i].s), esc(recReward(rc[i].s, rc[i].lots)));
  }
 }

 if (fr && fr.length) {
  h += sectionLabel('Tentativi di furto');
  for (i = 0; i < fr.length; i++) {
   var okf = fr[i].esito === 'riuscito';
   h += rowPost(noTip(fr[i].it.nome), fr[i].it.img, fr[i].it.formato,
    'd100: ' + fr[i].d + (okf ? ' &le; ' : ' &gt; ') + fr[i].soglia + ' &middot; <b style="color:' + (okf ? T.titoli : T.accento) + ';">' + (okf ? 'Riuscito, oggetto ottenuto gratis' : 'Fallito, acquistabile dal ' + dateStr(fr[i].scadenza)) + '</b>',
    okf ? money(0) : '&mdash;');
  }
 }
 if (rp.length) {
  h += sectionLabel('Riparazioni');
  for (i = 0; i < rp.length; i++) {
   h += rowPost(esc(rp[i].nome), '', 'quadro', esc(rp[i].cat + ' \u00b7 Livello ' + rp[i].lv) + '<br>' + esc(repMatText(rp[i].mat)), money(rp[i].sub));
  }
 }

 var cT = total(c), rT = total(rp), spend = cT + rT, inc = total(sv) + total(rc), matsIn = recMats(rc), matsOut = repMats(rp);
 var mix = (c.length ? 1 : 0) + (sv.length ? 1 : 0) + (rc.length ? 1 : 0) + (rp.length ? 1 : 0);
 h += '<div style="margin:12px 0 0;padding:2px 2px 0 0;border-top:1px solid ' + T.linea + ';">';
 if (mix > 1 && c.length) { h += totRow('Totale acquisti', money(cT), false); }
 if (mix > 1 && rp.length) { h += totRow('Costo riparazioni', money(rT), false); }
 if (mix > 1 && sv.length) { h += totRow('Totale vendite', money(total(sv)), false); }
 if (mix > 1 && rc.length && total(rc)) { h += totRow('Jenny dal riciclo', money(total(rc)), false); }
 if (matsIn) { h += totRow('Materiali ricevuti', esc(matsIn), false); }
 if (matsOut) { h += totRow('Materiali da consegnare', esc(matsOut), false); }
 if (spend && inc) { h += totRow('Saldo', signed(inc - spend), true); }
 else if (spend) { h += totRow(rp.length ? 'Jenny da pagare' : 'Totale', money(spend), true); }
 else if (sv.length && !rc.length) { h += totRow('Totale vendite', money(inc), true); }
 else if (inc || !matsIn) { h += totRow('Jenny ricevuti', money(inc), true); }
 h += '</div>';
 if (logId) { h += '<div style="font-size:10px;color:' + T.secondario + ';text-align:right;margin-top:10px;">Furti registrati - registro ' + esc(logId) + '</div>'; }
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
 apiTopics(C.SECTION_ID, function (mine, failed) {
  fillTopicSelect(byId('mc-topic'), byId('mc-topic-hint'), mine, failed, {
   nessuna: 'Nessuna lista trovata', scegli: '-- Scegli la tua Lista della Spesa --',
   errore: 'Non riesco a leggere la sezione: scrivi l\'ID del topic della tua Lista della Spesa.',
   vuota: 'Non ho trovato topic aperti da te nella sezione: scrivi l\'ID del topic della tua Lista della Spesa.'
  });
 });
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
  var sc = pan, ov = window.getComputedStyle(pan).overflowY;
  if (ov !== 'auto' && ov !== 'scroll' && pan.firstElementChild) { sc = pan.firstElementChild; ov = window.getComputedStyle(sc).overflowY; }
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
 var c = cart(), sv = cartSell(), rc = cartRec(), rp = cartRep(), st = cartSteal();
 var manual = byId('mc-topic-manual').value.replace(/\D/g, '');
 var tSel = byId('mc-topic');
 var topicId = manual || tSel.value;
 var topicTitle = manual ? ('topic ' + manual) : (tSel.selectedIndex >= 0 ? tSel.options[tSel.selectedIndex].text : '');

 for (var ri = 0; ri < rc.length; ri++) {
  var rr = rc[ri], rest = rr.n % rr.s.lotto;
  if (rest) { setStatus(rarPlural(rr.s.rar) + ' (' + rr.s.exp + '): hai ' + rr.n + ' oggetti, ma i lotti sono da ' + rr.s.lotto + '. Aggiungine ' + (rr.s.lotto - rest) + ' o togline ' + rest + '.', true); return; }
 }
 if (!PG) { setStatus('Scegli la scheda del PG che fa l\'ordine (e attendi che venga letta).', true); return; }
 if (!c.length && !sv.length && !rc.length && !rp.length && !st.length) { setStatus(HAS_REP ? 'Il carrello e\' vuoto: aggiungi oggetti da riciclare o riparare.' : HAS_REC ? 'Il carrello e\' vuoto: aggiungi gli oggetti da consegnare.' : HAS_SELL ? 'Il carrello e\' vuoto: scegli cosa comprare o vendere.' : 'Il carrello e\' vuoto: scegli le quantita\' nel listino.', true); return; }
 if (!topicId) { setStatus('Scegli la tua Lista della Spesa (o scrivi l\'ID del topic).', true); return; }

 var ask = 'PG: ' + PG.titolo + (scontoPg().perc ? ' \u00b7 sconto ' + scontoPg().perc + '%' : '') + '\n\n', i;
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
  if (c.length && !rc.length) { ask += 'Saldo: ' + signed(total(sv) - total(c)) + '\n\n'; }
 }
 if (rc.length) {
  ask += 'Lotti consegnati a ' + M.nome + ':\n';
  for (i = 0; i < rc.length; i++) { ask += '- ' + rc[i].s.exp + ' \u00b7 ' + recTitle(rc[i].s, rc[i].lots) + ' (' + rc[i].n + ' oggetti) \u2192 ' + recReward(rc[i].s, rc[i].lots) + '\n'; }
  ask += '\n';
 }
 if (rp.length) {
  ask += 'Riparazioni:\n';
  for (i = 0; i < rp.length; i++) { ask += '- ' + rp[i].nome + ' (' + rp[i].cat + ', Livello ' + rp[i].lv + ')\n'; }
  ask += 'Da consegnare: ' + repMats(rp) + ' + ' + money(total(rp)) + '\n\n';
 }
 if (st.length) {
  ask += 'Tentativi di furto (' + furtoChance() + '% ciascuno, una sola volta per oggetto):\n';
  for (i = 0; i < st.length; i++) { ask += '- ' + st[i].it.nome + '\n'; }
  ask += 'Se fallisce, l\'oggetto non sara\' acquistabile per ' + C.FURTO_BLOCCO_GIORNI + ' giorni.\n\n';
 }
 ask += 'Il post verra\' pubblicato in: ' + topicTitle + '\n\nConfermi?';
 if (!window.confirm(ask)) { return; }

 busy = true;
 byId('mc-go').disabled = true;
 byId('mc-clear').disabled = true;
 byId('mc-result')[IH] = '';

 function publish(fr, logId) {
  var html = buildPost(c, sv, rc, rp, fr, logId);
  if (fr.length) { for (var a = 0; a < ITEMS.length; a++) { STEAL[a] = false; renderSlot(a); } updateSum(); }
  if (C.TEST_MODE) { showResult(html, 'test', topicId); return; }
  setStatus('Pubblico il post...');
  postReply(C.SECTION_ID, topicId, html, function (ok) {
   showResult(html, (ok ? 'ok' : 'fail'), topicId);
  });
 }
 if (!st.length) { publish([], null); return; }
 setStatus('Tento il furto...');
 resolveFurti(st, function (err, res, logId) {
  if (err) { unlock(); setStatus(err, true); return; }
  publish(res, logId);
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
 readRiciclo();
 readRiparazioni();
 buildBar();
 bindUi();
 bindPg();
 updateSum();
 if (C.TEST_MODE) { setStatus('Modalita\' test attiva.'); }
 loadMyLists();
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
else { init(); }

})();
