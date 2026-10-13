/* =====================================================================
   FARAI - Bioware e Cyberforge con lancio di dado (motore separato)
   Nella pagina servono:
   - window.FARAI_CONFIG (listino, fasce del dado, colori), scritto prima di questo script;
   - un contenitore con id="fr-shop" (la radice del layout);
   - sotto ogni articolo: <div class="fr-qty" data-fr="Nome come nel config"></div>;
   - la barra: <div id="fr-bar"></div>, subito dopo il pannello che scorre.
   Ogni Bioware acquistato tira 1d20 + 1 ogni FORTUNA_PASSO di Fortuna Totale (max FORTUNA_MAX).
   La Fortuna viene letta dalla scheda del PG (.stat-card con etichetta "Fortuna").
   Ogni estrazione viene registrata su Firebase prima di essere mostrata.
   ===================================================================== */
;(function () {
var CFG = window.FARAI_CONFIG;
var root = document.getElementById('fr-shop');
var bar = document.getElementById('fr-bar');
if (!CFG || !root || !bar || root.getAttribute('data-fr-ok')) { return; }
root.setAttribute('data-fr-ok', '1');

var DEF = {
 SECTION_ID: 65118748,
 FIREBASE_DB_URL: 'https://spam-limitato-e-illimitato-default-rtdb.europe-west1.firebasedatabase.app',
 DB_ROOT: '/farai',
 TEST_MODE: false,
 VALUTA: 'Huntercoin',
 FORTUNA_PASSO: 50,
 FORTUNA_MAX: 5,
 DADO: 20,
 TOPICS_PER_PAGE: 30,
 MAX_PAGES: 20,
 FONT_POST: { titolo: 'Calistoga,serif', sc: "'Alegreya Sans SC',sans-serif", testo: 'Montserrat,sans-serif' }
};
var TEMA_DEF = {
 cornice: '#1B1B1F', cornicebordo: '#7ED6DE', fondo: '#FFFFFF', bordo: '#7ED6DE', riga: '#F4FAFB',
 linea: '#C9D3D8', testo: '#23272E', titoli: '#1B1B1F', secondario: '#3A3F47', accento: '#0B6B74',
 prezzo: '#6D28D9', bottone: '#1B1B1F', bottonetesto: '#7ED6DE',
 font: 'system-ui,sans-serif', fontTitoli: 'system-ui,sans-serif', fontMono: 'monospace'
};
var C = {}, T = {}, k;
for (k in DEF) { if (DEF.hasOwnProperty(k)) { C[k] = DEF[k]; } }
for (k in CFG) { if (CFG.hasOwnProperty(k)) { C[k] = CFG[k]; } }
for (k in TEMA_DEF) { if (TEMA_DEF.hasOwnProperty(k)) { T[k] = TEMA_DEF[k]; } }
if (C.TEMA) { for (k in C.TEMA) { if (C.TEMA.hasOwnProperty(k)) { T[k] = C.TEMA[k]; } } }
var M = C.MERCANTE || { nome: 'Farai', titolo: '' };
var F = C.FONT_POST;

var IH = 'inn' + 'erHTML';
var DB = String(C.FIREBASE_DB_URL).replace(/\/+$/, '') + C.DB_ROOT;
var ITEMS = [], QTA = [], SLOTS = [];
var SCHEDA = null;   /* { url, titolo, fortuna, bonus } */
var USER = null, busy = false, schedaReq = 0;

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
function addClass(el, c) { if (el && (' ' + el.className + ' ').indexOf(' ' + c + ' ') < 0) { el.className = norm(el.className + ' ' + c); } }
function delClass(el, c) { if (el) { el.className = norm((' ' + el.className + ' ').replace(' ' + c + ' ', ' ')); } }
function setStatus(msg, isErr) {
 var s = byId('fr-status');
 if (!s) { return; }
 s.textContent = msg || '';
 s.className = isErr ? 'fr-err' : '';
}
function warn(msg) { if (window.console) { window.console.warn('Farai: ' + msg); } }

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

/* ---------- dado ---------- */

function rnd(n) {
 var cr = window.crypto || window.msCrypto;
 if (cr && cr.getRandomValues) {
  var buf = new Uint32Array(1);
  var lim = Math.floor(4294967296 / n) * n;
  do { cr.getRandomValues(buf); } while (buf[0] >= lim);
  var r = (buf[0] % n) + 1;
  return r;
 }
 var r2 = Math.floor(Math.random() * n) + 1;
 return r2;
}
function fortunaBonus(f) { var b = Math.min(C.FORTUNA_MAX, Math.floor((Number(f) || 0) / C.FORTUNA_PASSO)); if (b < 0) { b = 0; } return b; }
function fasciaOf(tot) {
 var fs = C.FASCE || [], i;
 for (i = 0; i < fs.length; i++) { if (tot >= fs[i].min && tot <= fs[i].max) { return fs[i]; } }
 return fs.length ? (tot < fs[0].min ? fs[0] : fs[fs.length - 1]) : { min: 0, max: 0, perc: '', esito: '' };
}

/* ---------- stile ---------- */

function injectCss() {
 if (byId('fr-shop-css')) { return; }
 var css = '' +
 ':where(#fr-shop) .fr-qty{display:flex;align-items:center;justify-content:flex-end;margin:0;font-family:var(--fr-font)}' +
 '#fr-shop .fr-qty:empty{display:none}' +
 '#fr-shop button.fr-b{display:inline-block;flex:0 0 auto;width:28px;height:28px;min-width:0;margin:0;padding:0;border:1px solid var(--fr-linea);border-radius:3px;background:var(--fr-fondo);color:var(--fr-titoli);font-family:var(--fr-font);font-size:17px;line-height:26px;text-align:center;cursor:pointer;box-shadow:none}' +
 '#fr-shop input.fr-in{display:inline-block;flex:0 0 auto;width:40px;height:28px;min-height:0;margin:0 4px;padding:0 2px;border:1px solid var(--fr-linea);border-radius:3px;background:var(--fr-fondo);color:var(--fr-testo);font-family:var(--fr-mono);font-size:14px;text-align:center;box-shadow:none}' +
 '#fr-shop .fr-on > .fr-qty input.fr-in{border-color:var(--fr-cornicebordo);background:var(--fr-riga);font-weight:700}' +
 '#fr-bar{min-width:0;max-width:100%;font-family:var(--fr-font);color:var(--fr-testo);font-size:14px;line-height:1.4;text-align:left}' +
 '#fr-bar .fr-top{display:flex;align-items:baseline;gap:10px;margin:0 0 8px}' +
 '#fr-bar .fr-t{font-family:var(--fr-font-titoli);font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--fr-titoli)}' +
 '#fr-bar .fr-count{flex:1 1 auto;min-width:0;font-family:var(--fr-mono);font-size:12px;color:var(--fr-secondario)}' +
 '#fr-bar .fr-tot{flex:0 0 auto;font-weight:700;font-size:16px;color:var(--fr-prezzo);white-space:nowrap}' +
 '#fr-bar .fr-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 8px}' +
 '#fr-bar select,#fr-bar input.fr-txt{display:block;height:36px;min-height:0;margin:0;padding:0 8px;background:var(--fr-fondo);color:var(--fr-testo);border:1px solid var(--fr-linea);border-radius:3px;font-family:var(--fr-font);font-size:14px;box-shadow:none}' +
 '#fr-bar input.fr-url{flex:1 1 100%;width:100%}' +
 '#fr-bar select{flex:1 1 200px;width:auto;min-width:0}' +
 '#fr-bar input.fr-id{flex:0 0 110px;width:110px}' +
 '#fr-bar button.fr-go{display:inline-block;flex:0 0 auto;width:auto;height:36px;margin:0;padding:0 20px;border:1px solid var(--fr-bottone);border-radius:3px;background:var(--fr-bottone);color:var(--fr-bottonetesto);font-family:var(--fr-font-titoli);font-size:14px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;box-shadow:none}' +
 '#fr-bar button.fr-go2{padding:0 12px;background:transparent;color:var(--fr-secondario);border-color:var(--fr-linea)}' +
 '#fr-shop button[disabled]{opacity:.5;cursor:default}' +
 '#fr-bar .fr-pg{margin:-2px 0 8px;font-family:var(--fr-mono);font-size:12px;color:var(--fr-secondario)}' +
 '#fr-bar .fr-pg b{color:var(--fr-titoli)}' +
 '#fr-bar .fr-pg.fr-err{color:#B91C1C}' +
 '#fr-bar .fr-hint{margin:-2px 0 6px;font-size:12px;color:var(--fr-secondario)}' +
 '#fr-bar #fr-status{margin:6px 0 0;font-size:13px;font-weight:600;color:var(--fr-accento)}' +
 '#fr-bar #fr-status.fr-err{color:#B91C1C}' +
 '#fr-bar .fr-pg:empty,#fr-bar .fr-hint:empty,#fr-bar #fr-status:empty,#fr-bar #fr-result:empty{display:none}' +
 '#fr-bar #fr-result{margin:10px 0 0;padding:10px 0 0;border-top:1px dashed var(--fr-linea)}' +
 '#fr-bar .fr-preview{padding:12px 8px;background:#8FBEBA;border-radius:6px}' +
 '#fr-bar .fr-act{display:flex;justify-content:center;gap:8px;margin:10px 0 2px}' +
 '#fr-bar textarea{display:block;width:100%;min-height:110px;margin:8px 0 0;padding:6px;font-size:11px;border:1px solid var(--fr-linea);box-sizing:border-box}' +
 'body.ffm #fr-bar .fr-preview{padding:8px 4px}' +
 'body.ffm #fr-bar .fr-top{flex-wrap:wrap;row-gap:2px}' +
 'body.ffm #fr-bar .fr-t{flex:1 1 auto}' +
 'body.ffm #fr-bar .fr-count{order:3;flex:1 1 100%}' +
 'body.ffm #fr-bar select{flex:1 1 100%}' +
 'body.ffm #fr-bar input.fr-id{flex:1 1 auto;width:auto;min-width:0}';
 var st = document.createElement('style');
 st.id = 'fr-shop-css';
 st.textContent = css;
 (document.head || document.body).appendChild(st);
 var vars = ['cornice', 'cornicebordo', 'fondo', 'bordo', 'riga', 'linea', 'testo', 'titoli', 'secondario', 'accento', 'prezzo', 'bottone', 'bottonetesto'];
 for (var i = 0; i < vars.length; i++) { root.style.setProperty('--fr-' + vars[i], T[vars[i]]); }
 root.style.setProperty('--fr-font', T.font);
 root.style.setProperty('--fr-font-titoli', T.fontTitoli);
 root.style.setProperty('--fr-mono', T.fontMono);
}

/* ---------- listino ---------- */

function readListino() {
 var groups = [['bioware', C.BIOWARE || []], ['cyberforge', C.CYBERFORGE || []]], g, i, v;
 for (g = 0; g < groups.length; g++) {
  for (i = 0; i < groups[g][1].length; i++) {
   v = groups[g][1][i];
   ITEMS.push({ tipo: groups[g][0], nome: v.nome, bonus: v.bonus || '', prezzo: Number(v.prezzo) || 0, max: Number(v.max) || 99, img: v.img || '' });
   QTA.push(0);
   SLOTS.push(null);
  }
 }
 var byName = {}, slots = root.querySelectorAll('.fr-qty[data-fr]');
 for (i = 0; i < ITEMS.length; i++) { byName[norm(ITEMS[i].nome)] = i; }
 for (i = 0; i < slots.length; i++) {
  var nm = norm(slots[i].getAttribute('data-fr'));
  if (!byName.hasOwnProperty(nm)) { warn('"' + nm + '" non e\' nel config'); continue; }
  var idx = byName[nm];
  SLOTS[idx] = slots[i];
  slots[i][IH] = '<button type="button" class="fr-b" data-op="-1" data-i="' + idx + '" title="Togli">&minus;</button>' +
   '<input type="text" inputmode="numeric" class="fr-in" id="fr-q-' + idx + '" data-i="' + idx + '" value="0" maxlength="2" aria-label="Quantit&agrave; ' + esc(ITEMS[idx].nome) + '">' +
   '<button type="button" class="fr-b" data-op="1" data-i="' + idx + '" title="Aggiungi">+</button>';
 }
}

function setQta(i, v, fromInput) {
 if (busy || !ITEMS[i]) { return; }
 v = parseInt(v, 10) || 0;
 if (v < 0) { v = 0; }
 if (v > ITEMS[i].max) { v = ITEMS[i].max; setStatus('Limite per PG: ' + ITEMS[i].max + ' (' + ITEMS[i].nome + ').', true); }
 QTA[i] = v;
 var inp = byId('fr-q-' + i);
 if (inp && !(fromInput && inp.value === '') && inp.value !== String(v)) { inp.value = String(v); }
 var parent = SLOTS[i] ? SLOTS[i].parentNode : null;
 if (v > 0) { addClass(parent, 'fr-on'); } else { delClass(parent, 'fr-on'); }
 updateSum();
}

function cart() {
 var out = [];
 for (var i = 0; i < ITEMS.length; i++) { if (QTA[i] > 0) { out.push({ it: ITEMS[i], q: QTA[i], sub: ITEMS[i].prezzo * QTA[i] }); } }
 return out;
}
function total(c) { var t = 0; for (var i = 0; i < c.length; i++) { t += c[i].sub; } return t; }

function updateSum() {
 var c = cart(), bio = 0, cyb = 0, parts = [];
 for (var i = 0; i < c.length; i++) { if (c[i].it.tipo === 'bioware') { bio += c[i].q; } else { cyb += c[i].q; } }
 if (bio) { parts.push(bio + ' Bioware (' + bio + (bio === 1 ? ' tiro' : ' tiri') + ')'); }
 if (cyb) { parts.push(cyb + ' Cyberforge'); }
 byId('fr-count').textContent = parts.length ? parts.join(' · ') : 'vuoto: scegli gli innesti nel listino';
 byId('fr-tot').textContent = money(total(c));
}

/* ---------- scheda del PG ---------- */

function parseSchedaUrl(raw) {
 var s = norm(raw), t = s.match(/[?&]t=(\d+)/), st = s.match(/[?&]st=(\d+)/), en = s.match(/#entry(\d+)/);
 if (!t) { return null; }
 var out = { t: t[1], st: st ? st[1] : '', entry: en ? en[1] : '' };
 out.fetch = '/?t=' + out.t + (out.st ? '&st=' + out.st : '');
 out.link = 'https://' + location.hostname + out.fetch + (out.entry ? '#entry' + out.entry : '');
 return out;
}

function sumNumbers(txt) {
 var m = String(txt || '').replace(/\./g, '').match(/[+\-−]?\s*\d+/g), s = 0, i;
 if (!m) { return null; }
 for (i = 0; i < m.length; i++) { s += parseInt(m[i].replace(/\s/g, '').replace('−', '-'), 10) || 0; }
 return s;
}

function findFortuna(doc, entry) {
 var grids = doc.querySelectorAll('.stats-grid'), grid = null, i;
 if (!grids.length) { return null; }
 if (entry) {
  var anchor = doc.getElementById('entry' + entry) || doc.getElementById('ee' + entry) || doc.querySelector('[name="entry' + entry + '"]');
  if (anchor) {
   for (i = 0; i < grids.length; i++) {
    /* 4 = DOCUMENT_POSITION_FOLLOWING: la prima griglia dopo l'ancora del post */
    if (anchor.compareDocumentPosition(grids[i]) & 4) { grid = grids[i]; break; }
   }
  }
 }
 if (!grid) { grid = grids[0]; }
 var cards = grid.querySelectorAll('.stat-card');
 for (i = 0; i < cards.length; i++) {
  var lab = cards[i].querySelector('.stat-label'), val = cards[i].querySelector('.stat-value');
  if (lab && val && norm(lab.textContent).toLowerCase() === 'fortuna') {
   var n = sumNumbers(val.textContent);
   if (n !== null) { return { valore: n, testo: norm(val.textContent) }; }
  }
 }
 return null;
}

function showScheda(msg, isErr) {
 var el = byId('fr-pg');
 el[IH] = msg;
 el.className = 'fr-pg' + (isErr ? ' fr-err' : '');
}

function loadScheda() {
 var raw = byId('fr-url').value;
 SCHEDA = null;
 if (!norm(raw)) { showScheda(''); return; }
 var u = parseSchedaUrl(raw);
 if (!u) { showScheda('Link non valido: incolla il link del topic della scheda (deve contenere ?t=).', true); return; }
 var req = ++schedaReq;
 showScheda('Leggo la scheda...');
 fetch(u.fetch, { credentials: 'same-origin' })
  .then(function (r) { if (!r.ok) { throw new Error('HTTP ' + r.status); } var tx = r.text(); return tx; })
  .then(function (html) {
   if (req !== schedaReq) { return; }
   var doc = new DOMParser().parseFromString(html, 'text/html');
   var f = findFortuna(doc, u.entry);
   var tit = norm((doc.querySelector('title') || {}).textContent || ('topic ' + u.t));
   if (!f) { showScheda('Non trovo la Fortuna in questa scheda: controlla il link.', true); return; }
   SCHEDA = { url: u.link, titolo: tit, fortuna: f.valore, testo: f.testo, bonus: fortunaBonus(f.valore) };
   showScheda('Scheda: <b>' + esc(tit) + '</b> · Fortuna Totale <b>' + f.valore + '</b>' +
    (f.testo !== String(f.valore) ? ' (' + esc(f.testo) + ')' : '') + ' → tiro <b>1d' + C.DADO + ' + ' + SCHEDA.bonus + '</b>');
  })
  .catch(function () { if (req === schedaReq) { showScheda('Non riesco ad aprire la scheda: controlla il link.', true); } });
}

/* ---------- barra ---------- */

function buildBar() {
 bar[IH] = '<div class="fr-top"><span class="fr-t">Operazione</span><span class="fr-count" id="fr-count"></span><span class="fr-tot" id="fr-tot"></span></div>' +
  '<div class="fr-row"><input class="fr-txt fr-url" id="fr-url" type="text" placeholder="Link della scheda del PG che riceve gli innesti" title="Incolla il link del topic della scheda"></div>' +
  '<div class="fr-pg" id="fr-pg"></div>' +
  '<div class="fr-row">' +
  '<select id="fr-topic" title="La tua Lista della Spesa"><option value="">Caricamento liste...</option></select>' +
  '<input class="fr-txt fr-id" id="fr-topic-manual" type="text" inputmode="numeric" placeholder="ID topic" title="Se la tua Lista della Spesa non compare nel menu, scrivi qui l\'ID del topic">' +
  '<button type="button" class="fr-go" id="fr-go">Conferma</button>' +
  '<button type="button" class="fr-go fr-go2" id="fr-clear">Svuota</button>' +
  '</div>' +
  '<div class="fr-hint" id="fr-topic-hint"></div>' +
  '<div id="fr-status"></div>' +
  '<div id="fr-result"></div>';
}

function bindUi() {
 root.addEventListener('click', function (e) {
  var b = e.target;
  if (!b || !b.getAttribute) { return; }
  var op = b.getAttribute('data-op');
  if (op) {
   e.preventDefault();
   var i = parseInt(b.getAttribute('data-i'), 10);
   setStatus('');
   setQta(i, QTA[i] + parseInt(op, 10));
  }
 });
 root.addEventListener('input', function (e) {
  var t = e.target;
  if (!t || t.className !== 'fr-in') { return; }
  var clean = t.value.replace(/\D/g, '');
  if (clean !== t.value) { t.value = clean; }
  setQta(parseInt(t.getAttribute('data-i'), 10), clean, true);
 });
 root.addEventListener('change', function (e) {
  var t = e.target;
  if (t && t.className === 'fr-in' && t.value === '') { t.value = '0'; }
 });
 var url = byId('fr-url'), timer = null;
 url.addEventListener('change', loadScheda);
 url.addEventListener('input', function () { if (timer) { clearTimeout(timer); } timer = setTimeout(loadScheda, 700); });
 byId('fr-clear').addEventListener('click', function () {
  for (var i = 0; i < ITEMS.length; i++) { if (QTA[i]) { setQta(i, 0); } }
  setStatus('');
 });
 byId('fr-go').addEventListener('click', onGo);
}

/* ---------- Firebase (REST): registro delle estrazioni ---------- */

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

/* ---------- HTML del post (una riga, stili inline) ---------- */

function scStyle(size, color) { var s = 'font-family:' + F.sc + ';font-size:' + size + 'px;color:' + color + ';'; return s; }

function infoRow(label, val) {
 var s = '<tr><td style="width:95px;padding:2px 0;border:0;background:transparent;vertical-align:top;' + scStyle(14, T.secondario) + '">' + label + '</td>' +
  '<td style="padding:2px 0;border:0;background:transparent;color:' + T.testo + ';">' + val + '</td></tr>';
 return s;
}
function sectionLabel(txt) {
 var s = '<div style="margin:16px 0 0;padding:0 0 3px;border-bottom:2px solid ' + T.titoli + ';' + scStyle(18, T.titoli) + '">' +
  '<span style="display:inline-block;width:7px;height:15px;margin:0 8px 0 0;vertical-align:-1px;background:' + T.cornicebordo + ';"></span>' + esc(txt) + '</div>';
 return s;
}
function thumb(img) {
 if (!img) { return ''; }
 var s = '<img style="float:left;width:44px;height:44px;object-fit:contain;margin:0 10px 0 0;" src="' + esc(img) + '">';
 return s;
}
function bioRow(r) {
 var fa = r.fascia, col = fa.colore || T.accento;
 var h = '<div style="margin:6px 0 0;padding:8px;background:' + T.riga + ';border-left:3px solid ' + col + ';overflow:hidden;">' + thumb(r.img);
 h += '<div style="overflow:hidden;">';
 h += '<div style="font-weight:bold;color:' + T.titoli + ';">' + esc(r.nome) + '</div>';
 if (r.bonus) { h += '<div style="font-size:12px;color:#15803D;">' + esc(r.bonus) + '</div>'; }
 h += '<div style="margin:4px 0 0;font-size:12px;color:' + T.secondario + ';"><span style="display:inline-block;padding:1px 6px;margin:0 6px 0 0;white-space:nowrap;background:' + T.titoli + ';color:' + T.cornicebordo + ';font-weight:bold;">' +
  '1d' + C.DADO + ': ' + r.d + ' + ' + r.bonusF + ' = ' + r.tot + '</span>' +
  '<b style="color:' + col + ';">Operazione riuscita al ' + esc(fa.perc) + '</b></div>';
 if (fa.esito) { h += '<div style="font-size:12px;color:' + T.testo + ';">' + esc(fa.esito) + '</div>'; }
 h += '<div style="font-size:12px;text-align:right;font-weight:bold;color:' + T.prezzo + ';">' + money(r.prezzo) + '</div>';
 h += '</div></div>';
 return h;
}
function cyRow(c) {
 var h = '<div style="margin:6px 0 0;padding:8px;background:' + T.riga + ';border-left:3px solid ' + T.cornicebordo + ';overflow:hidden;">' + thumb(c.it.img);
 h += '<div style="overflow:hidden;"><div style="font-weight:bold;color:' + T.titoli + ';">' + esc(c.it.nome) + '</div>';
 if (c.it.bonus) { h += '<div style="font-size:12px;color:#15803D;">' + esc(c.it.bonus) + '</div>'; }
 h += '<div style="font-size:12px;color:' + T.secondario + ';">' + c.q + ' &times; ' + money(c.it.prezzo) +
  ' <span style="float:right;max-width:100%;margin:0 0 0 8px;font-weight:bold;color:' + T.prezzo + ';">' + money(c.sub) + '</span></div>';
 h += '</div></div>';
 return h;
}

function buildPost(c, rolls, logId) {
 var i;
 var h = '<div style="max-width:600px;margin:0 auto;padding:6px;background:' + T.cornice + ';border:2px solid ' + T.cornicebordo + ';border-radius:8px;text-align:left;">';
 h += '<div style="padding:14px 12px;background:' + T.fondo + ';border:1px solid ' + T.bordo + ';border-radius:3px;font-family:' + F.testo + ';font-size:13px;line-height:1.45;overflow-wrap:normal;word-break:normal;color:' + T.testo + ';">';
 h += '<div style="font-family:' + F.titolo + ';font-size:26px;color:' + T.titoli + ';text-align:center;letter-spacing:1px;">' + esc(M.nome) + '</div>';
 if (M.titolo) { h += '<div style="' + scStyle(15, T.accento) + 'text-align:center;">' + esc(M.titolo) + '</div>'; }
 h += '<div style="height:2px;margin:10px 0 12px;background:' + T.cornicebordo + ';"></div>';
 h += '<table style="width:100%;border-collapse:collapse;border:0;margin:0 0 4px;">' +
  infoRow('Utente', esc(USER.name)) +
  infoRow('Scheda PG', '<a style="color:' + T.accento + ';font-weight:bold;" href="' + esc(SCHEDA.url) + '">' + esc(SCHEDA.titolo) + '</a>') +
  infoRow('Fortuna', 'Totale ' + SCHEDA.fortuna + ' → bonus +' + SCHEDA.bonus) +
  infoRow('Data', nowStr()) + '</table>';
 if (rolls.length) {
  h += sectionLabel('Bioware');
  for (i = 0; i < rolls.length; i++) { h += bioRow(rolls[i]); }
 }
 var cy = [];
 for (i = 0; i < c.length; i++) { if (c[i].it.tipo === 'cyberforge') { cy.push(c[i]); } }
 if (cy.length) {
  h += sectionLabel('Cyberforge');
  for (i = 0; i < cy.length; i++) { h += cyRow(cy[i]); }
 }
 h += '<div style="overflow:hidden;margin:12px 0 0;padding:6px 2px 0 0;border-top:2px solid ' + T.titoli + ';' + scStyle(17, T.titoli) + '">Totale ' +
  '<span style="float:right;max-width:100%;margin:0 0 0 10px;text-align:right;font-family:' + F.titolo + ';font-size:20px;color:' + T.prezzo + ';">' + money(total(c)) + '</span></div>';
 h += '<div style="font-size:10px;color:' + T.secondario + ';text-align:right;margin-top:10px;">Estrazione automatica - registro ' + esc(logId) + '</div>';
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
 var sel = byId('fr-topic'), hint = byId('fr-topic-hint');
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

/* ---------- esito (la barra si allarga, il box cresce verso il basso) ---------- */

function unlock() { busy = false; byId('fr-go').disabled = false; byId('fr-clear').disabled = false; }

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
  for (var el = bar.parentNode; el && el !== root.parentNode; el = el.parentNode) {
   frozen.push([el, el.style.height, el.style.flex]);
   el.style.height = 'auto';
  }
 } else {
  for (i = 0; i < frozen.length; i++) { frozen[i][0].style.height = frozen[i][1]; frozen[i][0].style.flex = frozen[i][2]; }
  frozen = [];
 }
}
function closeResult() { byId('fr-result')[IH] = ''; setStatus(''); freezeBox(false); }
function actionButton(label, secondary, fn) {
 var b = document.createElement('button');
 b.type = 'button';
 b.className = secondary ? 'fr-go fr-go2' : 'fr-go';
 b.textContent = label;
 b.addEventListener('click', fn);
 return b;
}

function showResult(html, mode, topicId) {
 freezeBox(true);
 var res = byId('fr-result');
 res[IH] = '';
 var prev = document.createElement('div');
 prev.className = 'fr-preview';
 prev[IH] = html;
 var act = document.createElement('div');
 act.className = 'fr-act';
 if (mode === 'ok') {
  setStatus('Fatto! L\'operazione e\' stata postata nella tua Lista della Spesa.');
  res.appendChild(prev);
  act.appendChild(actionButton('Vai al post', false, function () {
   location.replace('https://' + location.hostname + '/?t=' + topicId + '&view=getlastpost');
  }));
  res.appendChild(act);
  return;
 }
 if (mode === 'test') {
  setStatus('Modalita\' test: niente post e niente registro. Questa e\' l\'anteprima.');
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
 var c = cart(), i, j;
 var manual = byId('fr-topic-manual').value.replace(/\D/g, '');
 var tSel = byId('fr-topic');
 var topicId = manual || tSel.value;
 var topicTitle = manual ? ('topic ' + manual) : (tSel.selectedIndex >= 0 ? tSel.options[tSel.selectedIndex].text : '');

 if (!c.length) { setStatus('Scegli almeno un innesto nel listino.', true); return; }
 if (!SCHEDA) { setStatus('Incolla il link della scheda del PG e attendi che venga letta la Fortuna.', true); return; }
 if (!topicId) { setStatus('Scegli la tua Lista della Spesa (o scrivi l\'ID del topic).', true); return; }

 var nBio = 0, ask = 'Operazione da ' + M.nome + ' per: ' + SCHEDA.titolo + '\n\n';
 for (i = 0; i < c.length; i++) {
  ask += '- ' + c[i].q + ' x ' + c[i].it.nome + ' (' + money(c[i].sub) + ')\n';
  if (c[i].it.tipo === 'bioware') { nBio += c[i].q; }
 }
 ask += '\nTotale: ' + money(total(c)) + '\n';
 if (nBio) { ask += 'Per ogni Bioware verra\' lanciato 1d' + C.DADO + ' + ' + SCHEDA.bonus + ' (Fortuna ' + SCHEDA.fortuna + '): il risultato e\' definitivo.\n'; }
 ask += 'Il post verra\' pubblicato in: ' + topicTitle + '\n\nConfermi?';
 if (!window.confirm(ask)) { return; }

 busy = true;
 byId('fr-go').disabled = true;
 byId('fr-clear').disabled = true;
 byId('fr-result')[IH] = '';
 setStatus('Lancio i dadi...');

 var rolls = [], articoli = [];
 for (i = 0; i < c.length; i++) {
  articoli.push({ nome: c[i].it.nome, qta: c[i].q, prezzo: c[i].it.prezzo });
  if (c[i].it.tipo !== 'bioware') { continue; }
  for (j = 0; j < c[i].q; j++) {
   var d = rnd(C.DADO), tot = d + SCHEDA.bonus, fa = fasciaOf(tot);
   rolls.push({ nome: c[i].it.nome, bonus: c[i].it.bonus, img: c[i].it.img, prezzo: c[i].it.prezzo, d: d, bonusF: SCHEDA.bonus, tot: tot, fascia: fa });
  }
 }
 var tiri = [];
 for (i = 0; i < rolls.length; i++) { tiri.push(rolls[i].nome + ': 1d' + C.DADO + ' ' + rolls[i].d + ' + ' + rolls[i].bonusF + ' = ' + rolls[i].tot + ' (' + rolls[i].fascia.perc + ')'); }
 var entry = {
  utente: USER.name, utenteId: USER.id, topic: topicId,
  scheda: SCHEDA.url, schedaTitolo: SCHEDA.titolo, fortuna: SCHEDA.fortuna, bonus: SCHEDA.bonus,
  articoli: articoli, tiri: tiri, totale: total(c),
  data: new Date().toISOString(), ts: Date.now(), stato: 'estratto'
 };
 logStart(entry, function (err, logId) {
  if (err) { unlock(); setStatus('Non riesco a registrare l\'estrazione: nessun dado e\' stato tenuto, riprova tra poco. (' + (err.message || 'errore') + ')', true); return; }
  var html = buildPost(c, rolls, logId);
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
 if (!USER) {
  bar[IH] = '<div class="fr-top"><span class="fr-t">Operazione</span><span class="fr-count">Devi essere loggato per richiedere un\'operazione.</span></div>';
  return;
 }
 readListino();
 buildBar();
 bindUi();
 updateSum();
 if (C.TEST_MODE) { setStatus('Modalita\' test attiva.'); }
 loadMyLists();
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
else { init(); }

})();
