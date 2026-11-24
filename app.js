// ---------- 1. Einstellungen und Variablen ----------

const SUPABASE_URL = "https://vzhacopmsznqmcfykhxn.supabase.co";
const SUPABASE_KEY = "sb_publishable_lWUwFUhCBZbTe6KFyAEy5A_Q2kEgE0M";

// Die 12 Kategorien, die jeder neue Benutzer am Anfang hat
const STANDARD_KATEGORIEN = ["Wohnen", "Krankenkasse", "Steuern", "Handy/Internet", "Lebensmittel", "Verpflegung auswärts", "ÖV", "Freizeit", "Kleidung", "Rücklagen", "Abonnement", "Versicherung"];

// Farben für die Kategorien in den Diagrammen. Eine Kategorie hat immer die gleiche Farbe (je nach Platz in der Liste).
const FARBEN = ["#2563eb", "#dc2626", "#d97706", "#7c3aed", "#059669", "#0891b2", "#db2777", "#65a30d", "#64748b", "#ea580c", "#4f46e5", "#0d9488"];

// Alle Daten des Benutzers: eine Liste mit Ausgaben und eine Liste mit Kategorien
let daten = { ausgaben: [], kategorien: STANDARD_KATEGORIEN.slice() };
let angemeldeterBenutzer = null;
let gewählterMonat = heute().slice(0, 7);   // Format JJJJ-MM, am Anfang der aktuelle Monat
let kreisDiagramm, balkenDiagramm;           // merken sich die Diagramme, damit sie neu gezeichnet werden können

// Verbindung zu Supabase (Datenbank und Anmeldung)
const verbindung = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------- 2. Hilfsfunktionen ----------

// Kurzform, um ein Element der Seite über seine ID zu holen
const holen = id => document.getElementById(id);

// Zahl als Frankenbetrag formatieren, zum Beispiel 1850 wird zu 1'850.00
const alsFranken = zahl => zahl.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Farbe einer Kategorie bestimmen
const farbeVon = kategorie => FARBEN[daten.kategorien.indexOf(kategorie) % FARBEN.length];

// Alle Beträge einer Liste von Ausgaben zusammenzählen
const summeVon = liste => liste.reduce((summe, ausgabe) => summe + ausgabe.betrag, 0);

// Alle Ausgaben eines Monats herausfiltern (das Datum beginnt mit JJJJ-MM)
const ausgabenImMonat = monat => daten.ausgaben.filter(ausgabe => ausgabe.datum.startsWith(monat));

// Heutiges Datum als JJJJ-MM-TT in lokaler Zeit (toISOString würde die UTC-Zeit liefern, die um einen Tag abweichen kann)
function heute() {
  const jetzt = new Date();
  return jetzt.getFullYear() + "-" + String(jetzt.getMonth() + 1).padStart(2, "0") + "-" + String(jetzt.getDate()).padStart(2, "0");
}

// Einen Monat um einige Monate vor oder zurück verschieben, zum Beispiel ("2026-11", 1) ergibt "2026-12"
function verschiebeMonat(monat, differenz) {
  const [jahr, nummer] = monat.split("-").map(Number);
  const ergebnis = new Date(jahr, nummer - 1 + differenz, 1);
  return ergebnis.getFullYear() + "-" + String(ergebnis.getMonth() + 1).padStart(2, "0");
}

// Monat als Text schreiben, zum Beispiel "2026-11" wird zu "November 2026"
function monatsname(monat) {
  const [jahr, nummer] = monat.split("-").map(Number);
  return new Date(jahr, nummer - 1, 1).toLocaleDateString("de-CH", { month: "long", year: "numeric" });
}

// ---------- 3. Speichern und Laden (Supabase) ----------

// Speichert alle Daten als ein JSON-Dokument in der Tabelle "daten".
// Die Row Level Security in Supabase sorgt dafür, dass jeder nur seine eigene Zeile sieht.
async function speichern() {
  if (!angemeldeterBenutzer) return;
  const { error } = await verbindung.from("daten").upsert({ user_id: angemeldeterBenutzer.id, inhalt: daten });
  if (error) holen("datenfehler").textContent = "Speichern fehlgeschlagen: " + error.message;
}

// Lädt die Daten des angemeldeten Benutzers aus Supabase.
// Ältere Einträge verwenden englische Namen (exp, cats, amt, date, cat, note), deshalb werden beide Varianten gelesen.
async function laden() {
  const { data, error } = await verbindung.from("daten").select("inhalt").maybeSingle();
  if (error) throw error;
  const inhalt = data && data.inhalt;
  const alteAusgaben = inhalt && (inhalt.ausgaben || inhalt.exp);
  if (!alteAusgaben) return;
  daten.kategorien = inhalt.kategorien || inhalt.cats || daten.kategorien;
  daten.ausgaben = alteAusgaben.map(a => ({
    id: a.id,
    betrag: a.betrag ?? a.amt,
    datum: a.datum || a.date,
    kategorie: a.kategorie || a.cat,
    notiz: a.notiz ?? a.note ?? ""
  }));
}

// ---------- 4. Anzeige ----------

// Baut die Auswahlliste im Formular und die Liste im Löschfenster aus den aktuellen Kategorien neu auf
function kategorienAnzeigen() {
  const bisherGewählt = holen("kategorie").value;
  holen("kategorie").innerHTML = "";
  daten.kategorien.forEach(name => {
    const option = document.createElement("option");
    option.textContent = name;
    holen("kategorie").appendChild(option);
  });
  if (daten.kategorien.includes(bisherGewählt)) holen("kategorie").value = bisherGewählt;

  holen("kategorienAuswahl").innerHTML = "";
  daten.kategorien.forEach(name => {
    const beschriftung = document.createElement("label");
    const kästchen = document.createElement("input");
    kästchen.type = "checkbox";
    kästchen.value = name;
    beschriftung.appendChild(kästchen);
    beschriftung.appendChild(document.createTextNode(name));
    holen("kategorienAuswahl").appendChild(beschriftung);
  });
}

// Erstellt eine Tabellenzelle mit Text (und wenn gewünscht mit einer CSS-Klasse)
function zelleErstellen(text, klasse) {
  const zelle = document.createElement("td");
  zelle.textContent = text;
  if (klasse) zelle.className = klasse;
  return zelle;
}

// Hauptfunktion der Anzeige: zeigt den gewählten Monat mit Gesamtsumme, Summen pro Kategorie, Einträgen und Diagrammen.
// Sie wird nach jeder Änderung (Ausgabe erfassen, löschen, Monat wechseln) neu aufgerufen.
function anzeigen() {
  const ausgaben = ausgabenImMonat(gewählterMonat).sort((a, b) => b.datum.localeCompare(a.datum));
  const gesamt = summeVon(ausgaben);
  holen("monatswahl").value = gewählterMonat;
  holen("monatstitel").textContent = "Ausgaben im " + monatsname(gewählterMonat);
  holen("gesamtsumme").textContent = alsFranken(gesamt);

  // Summe und Anzahl pro Kategorie berechnen
  const proKategorie = {};
  ausgaben.forEach(ausgabe => {
    if (!proKategorie[ausgabe.kategorie]) proKategorie[ausgabe.kategorie] = { anzahl: 0, summe: 0 };
    proKategorie[ausgabe.kategorie].anzahl++;
    proKategorie[ausgabe.kategorie].summe += ausgabe.betrag;
  });
  // Nur Kategorien mit Ausgaben, die grösste Summe zuerst
  const genutzteKategorien = Object.keys(proKategorie).sort((a, b) => proKategorie[b].summe - proKategorie[a].summe);

  // Tabelle "Summen pro Kategorie"
  holen("summentabelle").innerHTML = "";
  if (genutzteKategorien.length === 0) {
    holen("summentabelle").innerHTML = '<tr><td class="leer" colspan="4">Noch keine Ausgaben in diesem Monat.</td></tr>';
  }
  genutzteKategorien.forEach(name => {
    const zeile = document.createElement("tr");
    const namensZelle = document.createElement("td");
    namensZelle.innerHTML = '<span class="punkt" style="background:' + farbeVon(name) + '"></span>';
    namensZelle.appendChild(document.createTextNode(name));
    zeile.appendChild(namensZelle);
    const anteil = Math.round(proKategorie[name].summe / gesamt * 100);
    zeile.appendChild(zelleErstellen(proKategorie[name].anzahl, "zahl"));
    zeile.appendChild(zelleErstellen(alsFranken(proKategorie[name].summe), "zahl"));
    zeile.appendChild(zelleErstellen(anteil + " %", "zahl"));
    holen("summentabelle").appendChild(zeile);
  });

  // Tabelle mit den einzelnen Einträgen, jeder mit einem Löschen-Knopf
  holen("eintragstabelle").innerHTML = "";
  if (ausgaben.length === 0) {
    holen("eintragstabelle").innerHTML = '<tr><td class="leer" colspan="5">Keine Einträge. Erfasse links deine erste Ausgabe.</td></tr>';
  }
  ausgaben.forEach(ausgabe => {
    const zeile = document.createElement("tr");
    zeile.appendChild(zelleErstellen(ausgabe.datum.split("-").reverse().join(".")));
    zeile.appendChild(zelleErstellen(ausgabe.kategorie));
    zeile.appendChild(zelleErstellen(ausgabe.notiz));
    zeile.appendChild(zelleErstellen(alsFranken(ausgabe.betrag), "zahl"));

    const löschenKnopf = document.createElement("button");
    löschenKnopf.className = "unauffällig";
    löschenKnopf.textContent = "Löschen";
    löschenKnopf.onclick = () => {
      daten.ausgaben = daten.ausgaben.filter(a => a.id !== ausgabe.id);
      speichern();
      anzeigen();
    };
    const knopfZelle = document.createElement("td");
    knopfZelle.className = "zahl";
    knopfZelle.appendChild(löschenKnopf);
    zeile.appendChild(knopfZelle);
    holen("eintragstabelle").appendChild(zeile);
  });

  diagrammeZeichnen(genutzteKategorien, proKategorie);
}

// Zeichnet die zwei Diagramme mit Chart.js: ein Kreisdiagramm und ein gestapeltes Balkendiagramm
function diagrammeZeichnen(genutzteKategorien, proKategorie) {
  Chart.defaults.color = "#101828";
  // Alte Diagramme zuerst entfernen, sonst legen sich die neuen darüber
  if (kreisDiagramm) kreisDiagramm.destroy();
  if (balkenDiagramm) balkenDiagramm.destroy();

  // Kreisdiagramm: Verteilung der Ausgaben im gewählten Monat
  kreisDiagramm = new Chart(holen("kreisdiagramm"), {
    type: "doughnut",
    data: {
      labels: genutzteKategorien,
      datasets: [{
        data: genutzteKategorien.map(name => +proKategorie[name].summe.toFixed(2)),
        backgroundColor: genutzteKategorien.map(farbeVon),
        borderColor: "#ffffff"
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 10 } }
      }
    }
  });

  // Balkendiagramm: Verteilung auf die Kategorien in den letzten 6 Monaten (gestapelt)
  const monate = [5, 4, 3, 2, 1, 0].map(zurück => verschiebeMonat(gewählterMonat, -zurück));
  const datensätze = daten.kategorien.map(name => ({
    label: name,
    data: monate.map(monat => +summeVon(ausgabenImMonat(monat).filter(a => a.kategorie === name)).toFixed(2)),
    backgroundColor: farbeVon(name)
  })).filter(satz => satz.data.some(wert => wert > 0));

  balkenDiagramm = new Chart(holen("balkendiagramm"), {
    type: "bar",
    data: {
      labels: monate.map(monat => monatsname(monat).split(" ")[0].slice(0, 3)),
      datasets: datensätze
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, grid: { color: "#d9dee7" } }
      }
    }
  });
}

// ---------- 5. Aktionen ----------

// Formular "Ausgabe erfassen": prüft Betrag und Datum, speichert die Ausgabe und springt in den Monat der Ausgabe
holen("erfassungsformular").addEventListener("submit", ereignis => {
  ereignis.preventDefault();
  const betrag = parseFloat(holen("betrag").value);
  const datum = holen("datum").value;
  if (!(betrag > 0)) return holen("formularfehler").textContent = "Bitte einen Betrag grösser als 0 eingeben.";
  if (!datum) return holen("formularfehler").textContent = "Bitte ein Datum wählen.";
  holen("formularfehler").textContent = "";

  daten.ausgaben.push({
    id: Date.now() + Math.random(),
    betrag: Math.round(betrag * 100) / 100,
    datum: datum,
    kategorie: holen("kategorie").value,
    notiz: holen("notiz").value.trim()
  });
  speichern();
  gewählterMonat = datum.slice(0, 7);
  holen("betrag").value = "";
  holen("notiz").value = "";
  anzeigen();
});

// Eigene Kategorie hinzufügen (leere und doppelte Namen werden ignoriert)
holen("kategorieHinzufügen").onclick = () => {
  const name = holen("neueKategorie").value.trim();
  const schonVorhanden = daten.kategorien.some(k => k.toLowerCase() === name.toLowerCase());
  if (!name || schonVorhanden) return;
  daten.kategorien.push(name);
  speichern();
  holen("neueKategorie").value = "";
  kategorienAnzeigen();
  holen("kategorie").value = name;
  anzeigen();
};

// Monat wechseln: Das Datumsfeld springt in den gewählten Monat (aktueller Monat = heute, sonst der 1.).
// So landet eine neue Ausgabe im Monat, den man gerade ansieht.
function monatWechseln(monat) {
  gewählterMonat = monat;
  holen("datum").value = monat === heute().slice(0, 7) ? heute() : monat + "-01";
  anzeigen();
}
holen("zurück").onclick = () => monatWechseln(verschiebeMonat(gewählterMonat, -1));
holen("vor").onclick = () => monatWechseln(verschiebeMonat(gewählterMonat, 1));
holen("monatswahl").onchange = ereignis => {
  if (ereignis.target.value) monatWechseln(ereignis.target.value);
};

// Bestätigungsfenster "Sind Sie sicher?". Die Funktion wartet auf die Antwort und liefert true bei "Ja", false bei "Abbrechen" oder Esc.
function bestätigen(titel, text, jaBeschriftung) {
  return new Promise(fertig => {
    const fenster = holen("bestätigungDialog");
    let antwort = false;
    holen("bestätigungTitel").textContent = titel;
    holen("bestätigungText").textContent = text;
    holen("bestätigungJa").textContent = jaBeschriftung;
    holen("bestätigungJa").onclick = () => { antwort = true; fenster.close(); };
    holen("bestätigungNein").onclick = () => fenster.close();
    fenster.onclose = () => fertig(antwort);
    fenster.showModal();
  });
}

// Fenster zum Löschen von Kategorien öffnen und schliessen
holen("kategorienÖffnen").onclick = () => {
  holen("kategorienFehler").textContent = "";
  kategorienAnzeigen();
  holen("kategorienDialog").showModal();
};
holen("kategorienSchliessen").onclick = () => holen("kategorienDialog").close();

// Ausgewählte Kategorien löschen (auch Standard-Kategorien). Zugehörige Ausgaben werden mitgelöscht, deshalb gibt es vorher eine Bestätigung.
holen("kategorienLöschen").onclick = async () => {
  const gewählt = [...holen("kategorienAuswahl").querySelectorAll("input:checked")].map(kästchen => kästchen.value);
  holen("kategorienFehler").textContent = "";
  if (gewählt.length === 0) return holen("kategorienFehler").textContent = "Bitte mindestens eine Kategorie auswählen.";
  if (gewählt.length >= daten.kategorien.length) return holen("kategorienFehler").textContent = "Mindestens eine Kategorie muss bestehen bleiben.";

  const anzahlAusgaben = daten.ausgaben.filter(a => gewählt.includes(a.kategorie)).length;
  let text = gewählt.length + " Kategorie(n) löschen?";
  if (anzahlAusgaben > 0) text = gewählt.length + " Kategorie(n) löschen? Dabei werden auch " + anzahlAusgaben + " zugehörige Ausgaben gelöscht.";
  if (!(await bestätigen("Sind Sie sicher?", text, "Ja, löschen"))) return;

  daten.kategorien = daten.kategorien.filter(k => !gewählt.includes(k));
  daten.ausgaben = daten.ausgaben.filter(a => !gewählt.includes(a.kategorie));
  speichern();
  kategorienAnzeigen();
  anzeigen();
};

// ---------- 6. Anmeldung ----------

// Wird nach erfolgreicher Anmeldung aufgerufen: lädt die Daten des Benutzers, blendet die Anmeldung aus und zeigt die App
async function appStarten(sitzung) {
  angemeldeterBenutzer = sitzung.user;
  holen("angemeldetAls").textContent = angemeldeterBenutzer.email.split("@")[0];
  try {
    await laden();
  } catch (fehler) {
    holen("anmeldefehler").textContent = "Daten laden fehlgeschlagen: " + fehler.message;
    return;
  }
  holen("anmeldeansicht").hidden = true;
  holen("anwendung").hidden = false;
  holen("datum").value = heute();
  kategorienAnzeigen();
  anzeigen();
}

// Anmeldeformular: Benutzername und Passwort an Supabase schicken
holen("anmeldeformular").addEventListener("submit", async ereignis => {
  ereignis.preventDefault();
  holen("anmeldefehler").textContent = "";
  // "admin" und "test" sind Kurzformen von admin@example.com und test@example.com
  let email = holen("benutzer").value.trim().toLowerCase();
  if (!email.includes("@")) email += "@example.com";
  const { data, error } = await verbindung.auth.signInWithPassword({ email: email, password: holen("passwort").value });
  if (error) return holen("anmeldefehler").textContent = "Anmeldung fehlgeschlagen: " + error.message;
  holen("passwort").value = "";
  appStarten(data.session);
});

// Abmelden: Sitzung beenden und Seite neu laden
holen("abmelden").onclick = async () => {
  await verbindung.auth.signOut();
  location.reload();
};

// Beim Öffnen der Seite: Ist die Sitzung vom letzten Besuch noch gültig, wird direkt angemeldet
verbindung.auth.getSession().then(({ data }) => {
  if (data.session) appStarten(data.session);
});
