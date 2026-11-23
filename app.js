// ---------- Zugangsdaten für Supabase  ----------
const SUPABASE_URL = "https://vzhacopmsznqmcfykhxn.supabase.co";
const SUPABASE_KEY = "sb_publishable_lWUwFUhCBZbTe6KFyAEy5A_Q2kEgE0M";

// Ausgaben-Tracker mit Supabase: Daten, Anzeige, Kategorien, Anmeldung

// ---------- Daten ----------
const DEFAULT_CATS = ["Wohnen","Krankenkasse","Steuern","Handy/Internet","Lebensmittel","Verpflegung auswärts","ÖV","Freizeit","Kleidung","Rücklagen","Abonnement","Versicherung"];
const COLORS = ["#2563eb","#dc2626","#d97706","#7c3aed","#059669","#0891b2","#db2777","#65a30d","#64748b","#ea580c","#4f46e5","#0d9488"];
let S = { exp: [], cats: DEFAULT_CATS.slice() };

// ---------- Supabase: Datenbank und Anmeldung ----------
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let user = null;

// Alle Daten (S) als ein JSON-Dokument in der Tabelle "daten" speichern. Row Level Security sorgt dafür, dass nur die eigene Zeile erreichbar ist.
async function save() {
  if (!user) return;
  const { error } = await sb.from("daten").upsert({ user_id: user.id, inhalt: S, updated_at: new Date().toISOString() });
  if (error) $("dataerr").textContent = "Speichern fehlgeschlagen: " + error.message;
}
async function loadData() {
  const { data, error } = await sb.from("daten").select("inhalt").maybeSingle();
  if (error) throw error;
  if (data && data.inhalt && Array.isArray(data.inhalt.exp) && Array.isArray(data.inhalt.cats)) S = data.inhalt;
}

const $ = id => document.getElementById(id);
const chf = n => n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const colorOf = c => COLORS[S.cats.indexOf(c) % COLORS.length] || COLORS[8];
const today = () => new Date().toISOString().slice(0, 10);
let month = today().slice(0, 7);
let ch1, ch2;

function shift(ym, d) {
  const [y, m] = ym.split("-").map(Number);
  const dt = new Date(y, m - 1 + d, 1);
  return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0");
}
const monthName = ym => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("de-CH", { month: "long", year: "numeric" }); };
const inMonth = ym => S.exp.filter(e => e.date.startsWith(ym));
const sum = a => a.reduce((s, e) => s + e.amt, 0);

// ---------- Anzeige ----------
function fillCats() {
  const cur = $("cat").value;
  $("cat").innerHTML = "";
  S.cats.forEach(c => { const o = document.createElement("option"); o.textContent = c; $("cat").appendChild(o); });
  if (S.cats.includes(cur)) $("cat").value = cur;
  // Auswahlliste zum Löschen (alle Kategorien, auch die Standard-Kategorien)
  $("catlist").innerHTML = "";
  S.cats.forEach(c => {
    const l = document.createElement("label");
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.value = c;
    l.appendChild(cb); l.appendChild(document.createTextNode(c));
    $("catlist").appendChild(l);
  });
}

function render() {
  const list = inMonth(month).sort((a, b) => b.date.localeCompare(a.date));
  $("month").value = month;
  $("mlabel").textContent = "Ausgaben im " + monthName(month);
  $("total").textContent = chf(sum(list));

  // Summen pro Kategorie
  const per = {};
  list.forEach(e => { per[e.cat] = per[e.cat] || { n: 0, t: 0 }; per[e.cat].n++; per[e.cat].t += e.amt; });
  const cats = Object.keys(per).sort((a, b) => per[b].t - per[a].t);
  const total = sum(list);
  $("sum").innerHTML = "";
  if (!cats.length) $("sum").innerHTML = '<tr><td class="empty" colspan="4">Noch keine Ausgaben in diesem Monat.</td></tr>';
  cats.forEach(c => {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.innerHTML = '<span class="dot" style="background:' + colorOf(c) + '"></span>';
    td.appendChild(document.createTextNode(c));
    tr.appendChild(td);
    [per[c].n, chf(per[c].t), Math.round(per[c].t / total * 100) + " %"].forEach(v => {
      const d = document.createElement("td"); d.className = "n"; d.textContent = v; tr.appendChild(d);
    });
    $("sum").appendChild(tr);
  });

  // Einträge
  $("list").innerHTML = "";
  if (!list.length) $("list").innerHTML = '<tr><td class="empty" colspan="5">Keine Einträge. Erfasse links deine erste Ausgabe.</td></tr>';
  list.forEach(e => {
    const tr = document.createElement("tr");
    [e.date.split("-").reverse().join("."), e.cat, e.note || ""].forEach(v => { const d = document.createElement("td"); d.textContent = v; tr.appendChild(d); });
    const a = document.createElement("td"); a.className = "n"; a.textContent = chf(e.amt); tr.appendChild(a);
    const x = document.createElement("td"); x.className = "n";
    const b = document.createElement("button"); b.className = "ghost"; b.textContent = "Löschen"; b.setAttribute("aria-label", "Eintrag löschen");
    b.onclick = () => { S.exp = S.exp.filter(z => z.id !== e.id); save(); render(); };
    x.appendChild(b); tr.appendChild(x);
    $("list").appendChild(tr);
  });

  drawCharts(cats, per);
}

function drawCharts(cats, per) {
  const INK = "#101828", LINE = "#d9dee7", PANEL = "#ffffff";
  Chart.defaults.color = INK;
  Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  if (ch1) ch1.destroy(); if (ch2) ch2.destroy();
  ch1 = new Chart($("c1"), {
    type: "doughnut",
    data: { labels: cats, datasets: [{ data: cats.map(c => +per[c].t.toFixed(2)), backgroundColor: cats.map(colorOf), borderColor: PANEL }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: c => " CHF " + chf(c.parsed) } } } }
  });
  // Balkendiagramm: Verteilung auf die Kategorien in den letzten 6 Monaten (gestapelt)
  const months = [5, 4, 3, 2, 1, 0].map(i => shift(month, -i));
  const sets = S.cats.map(c => ({
    label: c,
    data: months.map(m => +sum(S.exp.filter(e => e.cat === c && e.date.startsWith(m))).toFixed(2)),
    backgroundColor: colorOf(c)
  })).filter(d => d.data.some(v => v > 0));
  ch2 = new Chart($("c2"), {
    type: "bar",
    data: { labels: months.map(m => monthName(m).split(" ")[0].slice(0, 3)), datasets: sets },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => " " + c.dataset.label + ": CHF " + chf(c.parsed.y) } } },
      scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, grid: { color: LINE } } }
    }
  });
}

// ---------- Aktionen ----------
$("f").addEventListener("submit", ev => {
  ev.preventDefault();
  const amt = parseFloat($("amt").value), date = $("date").value, cat = $("cat").value;
  if (!(amt > 0)) return $("err").textContent = "Bitte einen Betrag grösser als 0 eingeben.";
  if (!date) return $("err").textContent = "Bitte ein Datum wählen.";
  $("err").textContent = "";
  S.exp.push({ id: Date.now() + Math.random(), amt: Math.round(amt * 100) / 100, date, cat, note: $("note").value.trim() });
  save(); month = date.slice(0, 7);
  $("amt").value = ""; $("note").value = "";
  render();
});
$("addcat").onclick = () => {
  const n = $("newcat").value.trim();
  if (!n || S.cats.some(c => c.toLowerCase() === n.toLowerCase())) return;
  S.cats.push(n); save(); $("newcat").value = ""; fillCats(); $("cat").value = n; render();
};
$("prev").onclick = () => { month = shift(month, -1); render(); };
$("next").onclick = () => { month = shift(month, 1); render(); };
$("month").onchange = e => { if (e.target.value) { month = e.target.value; render(); } };
// Bestätigungsfenster: gibt true zurück, wenn der Benutzer bestätigt (Esc oder Abbrechen = false)
function ask(title, text, yes) {
  return new Promise(res => {
    const d = $("confdlg");
    let result = false;
    $("conft").textContent = title; $("conftext").textContent = text; $("confyes").textContent = yes;
    $("confyes").onclick = () => { result = true; d.close(); };
    $("confno").onclick = () => d.close();
    d.onclose = () => res(result);
    d.showModal();
  });
}
$("opencats").onclick = () => { $("caterr").textContent = ""; fillCats(); $("catdlg").showModal(); };
$("catclose").onclick = () => $("catdlg").close();
$("reset").onclick = async () => {
  const ok = await ask("Sind Sie sicher?", "Alle Ausgaben und alle eigenen Kategorien werden unwiderruflich gelöscht. Das kann nicht rückgängig gemacht werden.", "Ja, alles löschen");
  if (!ok) return;
  S = { exp: [], cats: DEFAULT_CATS.slice() }; save(); fillCats(); render();
};

// Ausgewählte Kategorien löschen (auch Standard-Kategorien)
$("delcat").onclick = async () => {
  const sel = [...$("catlist").querySelectorAll("input:checked")].map(i => i.value);
  $("caterr").textContent = "";
  if (!sel.length) return $("caterr").textContent = "Bitte mindestens eine Kategorie auswählen.";
  if (sel.length >= S.cats.length) return $("caterr").textContent = "Mindestens eine Kategorie muss bestehen bleiben.";
  const n = S.exp.filter(e => sel.includes(e.cat)).length;
  const msg = n ? sel.length + " Kategorie(n) löschen? Dabei werden auch " + n + " zugehörige Ausgaben gelöscht." : sel.length + " Kategorie(n) löschen?";
  if (!(await ask("Sind Sie sicher?", msg, "Ja, löschen"))) return;
  S.cats = S.cats.filter(c => !sel.includes(c));
  S.exp = S.exp.filter(e => !sel.includes(e.cat));
  save(); fillCats(); render();
};

// ---------- Start: Anmeldung ----------
async function enter(session) {
  user = session.user;
  $("username").textContent = (user.user_metadata && user.user_metadata.name) || user.email;
  try { await loadData(); } catch (e) { $("loginerr").textContent = "Daten laden fehlgeschlagen: " + e.message; return; }
  $("loginview").hidden = true; $("app").hidden = false;
  $("date").value = today();
  fillCats(); render();
}
$("loginform").addEventListener("submit", async ev => {
  ev.preventDefault();
  $("loginerr").textContent = "";
  if (SUPABASE_URL.includes("DEIN-")) return $("loginerr").textContent = "Bitte zuerst SUPABASE_URL und SUPABASE_KEY im Code eintragen.";
  // Eingabe in Kleinbuchstaben; "admin" und "test" sind Kurzformen von admin@example.com und test@example.com
  let email = $("email").value.trim().toLowerCase();
  if (!email.includes("@")) email += "@example.com";
  const { data, error } = await sb.auth.signInWithPassword({ email, password: $("pw").value });
  if (error) return $("loginerr").textContent = "Anmeldung fehlgeschlagen: " + error.message;
  $("pw").value = "";
  enter(data.session);
});
$("logout").onclick = async () => { await sb.auth.signOut(); location.reload(); };
sb.auth.getSession().then(({ data }) => { if (data.session) enter(data.session); });