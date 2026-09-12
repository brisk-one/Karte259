/* Gemeinsame Bausteine der drei Seiten: Kopfzeile mit Navigation, Umschalter für die Gestaltung,
   Zahlenformate, Laden der Daten und sortierbare Tabellen. */

const nf = new Intl.NumberFormat("de-DE");
const nf1 = new Intl.NumberFormat("de-DE", {maximumFractionDigits: 1});
const dtf = new Intl.DateTimeFormat("de-DE", {timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit",
                                              hour: "2-digit", minute: "2-digit"});
const hmf = new Intl.DateTimeFormat("de-DE", {timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit"});
const $ = id => document.getElementById(id);
const SVGNS = "http://www.w3.org/2000/svg";

const fmtTime = s => { if (!s) return "k. A."; const d = new Date(s); return isNaN(d) ? s : dtf.format(d) + " Uhr"; };
const fmtDay = s => { if (!s) return ""; const p = String(s).split("-"); return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : s; };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function svgEl(tag, attrs) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function signed(v, unit) {
  if (v == null) return el("span", "na", "–");
  return el("span", v > 0 ? "up" : (v < 0 ? "down" : "na"), (v > 0 ? "+" : "") + nf.format(v) + (unit || ""));
}
async function loadData(name) {
  const r = await fetch("data/" + name + ".json", {cache: "no-cache"});
  if (!r.ok) throw new Error(name + ": HTTP " + r.status);
  return r.json();
}

/* ---------- Gestaltung umschalten ---------- */
const THEMES = {
  classic: {label: "Classic", next: "futuristic",
    icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 13V5l6-3 6 3v8"/><path d="M2 13h12M6 13V9h4v4"/></svg>'},
  futuristic: {label: "Futuristic", next: "classic",
    icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="2"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3M3.2 3.2l2.1 2.1M10.7 10.7l2.1 2.1M12.8 3.2l-2.1 2.1M5.3 10.7l-2.1 2.1"/></svg>'},
};
function applyTheme(name) {
  document.documentElement.dataset.theme = name;
  const b = $("theme-toggle");
  if (b) {
    const t = THEMES[name];
    b.innerHTML = t.icon + "<span>" + t.label + "</span>";
    b.title = "Zur Fassung " + THEMES[t.next].label + " wechseln";
    b.setAttribute("aria-label", b.title);
  }
  document.dispatchEvent(new CustomEvent("themechange", {detail: name}));
}
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem("k259-theme"); } catch (e) { /* Speicher gesperrt */ }
  applyTheme(THEMES[saved] ? saved : "classic");
}
function toggleTheme() {
  const next = THEMES[document.documentElement.dataset.theme].next;
  try { localStorage.setItem("k259-theme", next); } catch (e) { /* Speicher gesperrt */ }
  applyTheme(next);
}

/* ---------- Kopfzeile ---------- */
const PAGES = [["./", "Punkteübersicht", "index"], ["dashboard.html", "Lagebild", "dashboard"],
               ["karte.html", "Karte", "karte"]];
function buildAppbar(current, title) {
  const bar = $("appbar");
  if (!bar) return;
  const w = el("div", "wrap");
  const h = el("h1", null, title);
  const world = el("span", "world", "Welt 259");
  const nav = el("nav");
  PAGES.forEach(([href, label, id]) => {
    const a = el("a", id === current ? "on" : null, label);
    a.href = href;
    if (id === current) a.setAttribute("aria-current", "page");
    nav.appendChild(a);
  });
  const btn = el("button");
  btn.id = "theme-toggle";
  btn.type = "button";
  btn.addEventListener("click", toggleTheme);
  nav.appendChild(btn);
  w.append(h, world, nav);
  bar.replaceChildren(w);
  initTheme();
}

/* ---------- Tabellen ----------
   Spalten: [Beschriftung, Klasse, sortierbar]. Sortiert wird nur, wo eine Ordnung sinnvoll ist,
   also bei Zahlen und Zeitpunkten, nicht bei Namen. */
function table(cols, rows, opts) {
  opts = opts || {};
  const t = el("table"), thead = el("thead");
  if (opts.groups) {
    const g = el("tr", "group");
    opts.groups.forEach(([label, span]) => { const c = el("th", null, label); c.colSpan = span; g.appendChild(c); });
    thead.appendChild(g);
  }
  const hr = el("tr");
  cols.forEach(([label, cls, sortable], i) => {
    const c = el("th", (cls || "") + (sortable ? " sortable" : ""), label);
    if (sortable) {
      c.tabIndex = 0;
      c.addEventListener("click", () => sortTable(t, i));
      c.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sortTable(t, i); } });
    }
    hr.appendChild(c);
  });
  thead.appendChild(hr);
  t.appendChild(thead);
  const tb = el("tbody");
  rows.forEach(cells => {
    const tr = el("tr");
    cells.forEach(([content, cls, sv]) => {
      const td = el("td", cls || null);
      if (content instanceof Node) td.appendChild(content); else td.textContent = content;
      if (sv != null) td.dataset.v = sv;
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  if (opts.sort != null) sortTable(t, opts.sort, opts.dir || "desc");
  return t;
}
function sortTable(t, col, force) {
  const hr = t.tHead.rows[t.tHead.rows.length - 1];
  const ths = [...hr.cells];
  const dir = force || (ths[col].getAttribute("aria-sort") === "descending" ? "asc" : "desc");
  ths.forEach(c => c.removeAttribute("aria-sort"));
  ths[col].setAttribute("aria-sort", dir === "asc" ? "ascending" : "descending");
  const val = tr => {
    const td = tr.cells[col];
    const raw = td.dataset.v != null ? td.dataset.v : td.textContent;
    const n = parseFloat(String(raw).replace(/\./g, "").replace(",", ".").replace(/[^\d,.\-]/g, ""));
    return isNaN(n) ? null : n;
  };
  [...t.tBodies[0].rows].sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;              // Zeilen ohne Wert immer ans Ende
    if (y == null) return -1;
    return dir === "asc" ? x - y : y - x;
  }).forEach(r => t.tBodies[0].appendChild(r));
}
