/* Angriffsplaner, Seitenskript. Seit 10.11.2026 (Dennis) lesbar im Repo; angriff.html lädt es erst nach dem
   Freischalten im Browser (einfacher Passwortschutz, kein Schutz gegen Leser des Repos). */
buildAppbar("angriff", "Angriffsplaner");
const K = window.Angriff;
const SPEICHER = "k259-angriff", AUSWAHL = "k259-angriff-auswahl";

/* ---------- Info-Texte (Spezifikation 5.1a) ---------- */
const INFO = {
  ags_per_target: "Jedes AG senkt die Zustimmung um 20 bis 35. Mit 4 AGs klappt die Eroberung aus 100 Zustimmung in 86,7 % der Fälle, mit 5 immer.",
  train_form: "Ganzer Train: alle AGs eines Ziels aus einem Dorf, im Spiel hintereinander gereiht, das Spiel schickt sie im Abstand von 200 ms. Ein Abschickvorgang, aber der Verteidiger kann Deff in die 200-ms-Lücken timen (tabben). 2er-Trains: höchstens 2 AGs je Dorf und Ziel. Einzeln: jedes AG aus einem anderen Dorf. Je kleiner der Train, desto schwerer zu tabben, aber desto mehr Abschickvorgänge und genaueres Timen.",
  split_full: "Schickt ein Off-Dorf einen Train, läuft seine Off im Train mit. Aus: komplett mit dem ersten AG. An: gleichmäßig auf alle AGs verteilt, damit jedes AG genug Truppen gegen getabbte Deff hat. Sinnvoll, wenn das Dorf genau einen Train an AGs hat.",
  split_two: "Die Off des Dorfs geht Hälfte und Hälfte mit beiden AGs. So ist der 2er-Train kaum zu tabben.",
  send_gap_target_s: "Richtwert für den Abstand zwischen zwei Abschickvorgängen innerhalb einer Sitzung. Der Planer bündelt die Befehle in möglichst wenige, kurze Sitzungen und hält dabei möglichst diesen Abstand, damit nicht alle 3 Sekunden ein Befehl raus muss. Der Mindestabstand bleibt die harte Grenze.",
  clean_eigene: "Wer die Clean-Offs auf ein AG-Ziel schickt. Vor kurzen Sitzungen (Standard): möglichst der Spieler, der dort auch die AGs schickt, selbst wenn er dafür eine Abschicksitzung mehr hat. Nach kurzen Sitzungen: lieber ein anderer Spieler, wenn das eine Sitzung spart. „Off vor AG“ und die Abschickzeiträume gehen in beiden Fällen vor. Stärker je Spieler: „eigene AG-Ziele stark“ bei den Angreifern.",
  uebrige_auf_ag: "Offs, die am Ende des Plans frei bleiben (freie Offs), gehen als zusätzliche Clean-Offs auf die AG-Ziele, zuerst auf die Ziele mit den wenigsten Offs (Clean-Offs und Off im Train), dann reihum; im Abschickplan als „zusätzliche Off“ markiert, wie viele es je Ziel sind, steht bei den AG-Zielen. Sie kommen vor den AGs an; losgehen sollen sie möglichst vor dem ersten AG, notfalls danach, denn die nötigen Clean-Offs gehen ohnehin vorher los. Wenigste Offs zuerst gilt vor „Clean-Offs vom Spieler des Trains“; unter den passenden Offs für ein Ziel wird der Spieler des Trains bevorzugt. „Notfalls mit eigener Sitzung“ (Standard): nur in den Abschickzeiträumen des Spielers und innerhalb des Laufzeit-Richtwerts, eine zusätzliche Off darf für ihren Spieler eine weitere Abschicksitzung bedeuten. „Nur in bestehende Sitzungen“: dazu nur, wenn der Spieler auf dasselbe Ziel ohnehin innerhalb von 15 Minuten etwas abschickt. „Alle, auch außerhalb“: auch außerhalb der Zeiträume und über dem Laufzeit-Richtwert, dann verteilen sie sich gleichmäßig; das stellt auch der Knopf „Freie Offs trotzdem verteilen“ in der Bilanz ein. Was frei bleibt, steht in der Bilanz mit Grund (Laufzeit-Richtwert, Zeitraum, zeitlich gar nicht). Mit „Übrige Offs auf Nicht-AG-Dörfer“ gehen sie zuerst dorthin.",
  zeitraeume: "Richtwert (Standard): Offs und AGs gehen bevorzugt in deinen Abschickzeiträumen los. Geht ein Ziel nur mit Befehlen außerhalb, etwa ein Adelsgeschlecht, das sonst nicht ankäme, schlägt der Planer sie trotzdem vor und markiert sie im Abschickplan mit „außerhalb“. Fest: nur innerhalb der Zeiträume, ein Ziel fällt dann lieber weg.",
  max_lauf_off_h: "Richtwert für die Laufzeit von Clean-Offs und übrigen Offs. Darüber nur, wenn sonst ein Ziel weniger geadelt würde oder die Clean-Offs unter den Richtwert fielen; solche Befehle stehen im Abschickplan mit „lange Laufzeit“. Übrige Offs auf Nicht-AG-Dörfer gehen nie darüber. Eine Off, die im Train mit dem ersten AG läuft, zählt wie der AG-Train. 0: keine Grenze.",
  max_lauf_ag_h: "Grenze für die Laufzeit der AG-Trains, auch für die Off, die im Train mit dem ersten AG läuft (sie hat AG-Tempo). Standard 7 Stunden. Wie streng, steht in „AG-Laufzeit-Grenze“. 0: keine Grenze.",
  lauf_ag_art: "Fest (Standard): kein AG-Train läuft länger; ein Ziel, das nur mit längeren Trains geht, wird nicht geadelt (Grund steht beim Ziel). Richtwert: länger nur, wenn sonst ein Ziel weniger geadelt würde; solche Befehle sind mit „lange Laufzeit“ markiert.",
  fake_vorlauf_h: "Die ersten Fakes laufen etwa so viele Stunden vor dem ersten Off- oder AG-Abschick des ganzen Plans los. Mit einem zweiten Wert eine Spanne, etwa 3 bis 10 h: dann liegt der Beginn irgendwo dazwischen, wo die meisten Fakes passen; „bis“ leer oder 0 heißt ein fester Wert. Jeder Angreifer bekommt dafür höchstens eine zusätzliche frühe Sitzung (rund eine Stunde, höchstens eine Stunde vom Richtwert entfernt), in die etwa ein Viertel seiner Fakes geht; die übrigen bleiben in seinen Off-Sitzungen. Weil die Fakes trotzdem im Ankunftszeitraum ankommen, gehen früh nur Dörfer, die weit genug weg liegen (je Stunde früher rund zwei Felder mehr). Ohne Offs und AGs im Plan gilt kein Vorlauf. 0: aus.",
  zeit_rangfolge: "Wie der Planer abwägt, wenn nicht alles zugleich geht. Eine Sitzung sind Befehle mit höchstens 15 Minuten Pause dazwischen. Standard: so viele Ziele wie möglich, dann Clean-Offs vor dem AG abgeschickt (wenn an), dann Befehle innerhalb der Abschickzeiträume, dann Clean-Offs bis zum Richtwert, dann wenige und kurze Sitzungen, dann kurze Laufzeiten, zuletzt Fakes. Kurze Sitzungen zuerst: lieber eine Clean-Off weniger oder ein AG vor der Off als eine zweite Weckzeit. Nachtruhe: Offs und AGs nachts außerhalb deiner Zeiträume nur, wenn es nicht anders geht; sonst fällt das Ziel lieber weg.",
  min_send_gap_s: "Kleinster Abstand zwischen zwei Abschickvorgängen eines Spielers, damit keine zwei Befehle fast gleichzeitig abgeschickt werden müssen. Ein gereihter Train aus einem Dorf zählt als ein Vorgang.",
  off_min_pop: "Ab dieser Größe in Bauernhofplätzen zählt ein Dorf als Off. Beispiel 16.250 BH: 5.000 Äxte, 2.500 LKav, 250 Rammen. Gezählt werden Axt, LKav, berittene Bogenschützen, Rammen, Katapulte und, in Off-Dörfern, Schwere Kavallerie.",
  off_min_rams: "Offs mit weniger Rammen werden nicht als Clean-Off verplant.",
  growth: "Wie viele BH und Rammen eine Off je Tag bis zum ersten Abschickzeitraum dazugewinnt. Damit werden knappe Offs vorausgewählt, die bis dahin den Richtwert schaffen. Jede knappe Off lässt sich auch von Hand ein- oder auswählen.",
  clean_per_target: "So viele Offs schlagen vor dem Train ein und räumen das Ziel. Mindestens 1 ist Pflicht, üblich sind 2, später im Spiel 3. Reichen die Offs nicht, fragt der Planer, ob weniger Clean-Offs je Ziel oder weniger Ziele.",
  rest_offs: "Offs, die keine Clean-Off werden: bleiben frei oder gehen als echte Angriffe auf die Nicht-AG-Dörfer der Zielspieler.",
  gap_off_ag_ms: "Gilt für die Ankunft. Standard 200 ms: Off 08:00:10:000, erstes AG 08:00:10:200. Wer seine Off nicht so genau timen kann, stellt mehr ein.",
  gap_clean_ms: "Ankunft der Clean-Offs untereinander. Sie kommen aus verschiedenen Dörfern und dürfen enger liegen als 200 ms.",
  gap_ag_ms: "Nur bei 2er-Trains und einzeln. Kleiner als 200 ms ist möglich, weil der Befehlsabstand des Spiels nur für Angriffe aus demselben Dorf gilt.",
  off_first: "Gilt nur für das Abschicken, nicht für die Ankunft (die bleibt beim Abstand letzte Clean-Off zum ersten AG). Jede Clean-Off geht mindestens so viele Minuten vor dem ersten AG los. Grund: Schickt jemand die Off zu spät oder kommt sie von einem anderen Spieler, kann der AG-Spieler seine AGs noch an die echte Ankunft der Off anpassen. Kostet kaum etwas: Weil AGs langsamer laufen (35 statt 30 Minuten je Feld), muss das Off-Dorf ohnehin mindestens 7/6 so weit vom Ziel entfernt sein wie das AG-Dorf, 2 Minuten Vorlauf verlangen nur 0,07 Felder mehr. 0 heißt: nur die Reihenfolge, ohne Mindestabstand. Vorrang (seit 12.11.2026): geht vor Abschickzeitraum und Laufzeit-Richtwert, eine Clean-Off geht also lieber außerhalb des Zeitraums vor dem AG los als im Zeitraum danach, auch vor „eigene AG-Ziele stark“; nur die Rangfolge „kurze Sitzungen zuerst“ geht vor. Geht es nicht, nennt das Ergebnis je Ziel, wie viel der AG zu früh losgeht und warum. Zusätzliche Offs (aus den freien) dürfen nach dem AG losgehen.",
  spies_per_off: "So viele Späher laufen mit jeder Off.",
  escort_pop: "Truppen, die ein AG ohne mitlaufende Off begleiten: Äxte zuerst, ohne Äxte Schwertkämpfer, dann Speerträger.",
  fakes_per_village: "Richtwert für die Zahl der Fakes je Zieldorf oder je Herkunftsdorf, je nach Auswahl darüber. Ein Ziel bekommt nie zwei Fakes aus demselben Dorf.",
  extra_n: "Wie viele Fakes jedes Dorf eines gewählten Stammesmitglieds bekommt. Diese Ziele sind nachrangig: zuerst bekommen Pflichtziele und weitere Fakeziele ihre Zahl („Fakes je Dorf“ in der Konfig), danach die Stammesmitglieder mit dieser Zahl, soweit Truppen und Abschicksitzungen reichen. Fehlende Fakes hier lösen keinen Hinweis aus.",
  fakes_max_je_dorf: "Obergrenze für alle Fakes aus einem eigenen Dorf, auf alle Ziele zusammen. Gilt auch, wenn Fakes je Herkunftsdorf zählen.",
  fake_verteilung: "Reihum: zuerst bekommt jedes Pflicht- und weitere Fakeziel einen Fake, dann jedes gewählte Dorf der Stammesmitglieder, danach werden die Pflichtziele bis zur vollen Zahl aufgefüllt und zuletzt die Mitglieder bis zu ihrer Zahl. Hauptziele zuerst voll: die Pflichtziele bekommen erst ihre volle Zahl, die Mitglieder nur, was übrig bleibt.",
  fake_modus: "Zieldorf: jedes Fakeziel bekommt die Zahl darunter (wie bisher). Herkunftsdorf: jedes Dorf der Angreifer schickt die Zahl darunter, verteilt auf die Fakeziele, wenig befakte und nahe zuerst; gedacht für reine Fake-Pläne. Einstellungen je Spieler gehen vor.",
  fake_extra_pop: "Ein Fake braucht mindestens 1 % der Dorfpunkte des abschickenden Dorfs in Bauernhofplätzen. Der Zuschlag fängt Punkte ab, die bis zum Abschicken dazukommen. Fakes laufen mit Katapult- oder Rammentempo und bestehen aus Katapulten und Spähern, jeder mit mindestens einem Späher (Dörfer ohne freien Späher schicken keine Fakes). Eine Ramme nur, wenn im Dorf kein Katapult frei ist; mehr Rammen nur, wenn Katapulte und Späher nicht reichen, höchstens so viele wie beim Spieler eingestellt (Standard 1).",
  extra_fakes: "Dörfer starker Stammesmitglieder der Zielspieler, gegen die der Angreifer mindestens die Moral-Schwelle hätte. Schwache Spieler sind schlechte Fakeziele: hohe Moral, kaum Truppen zum Unterstützen.",
  zart: "AG-Ziele bekommen AGs, Clean-Offs und Fakes. Fakeziele bekommen nur Fakes, gleichrangig mit den Pflichtzielen; ein reiner Fake-Plan braucht nur Fakeziele. Bei beiden zählen die Besitzer als Zielspieler: ihre übrigen Dörfer werden Pflicht-Fakeziele, ihre Stammesmitglieder stehen in Abschnitt 6 zur Wahl. Ein Dorf steht nur in einer der beiden Listen.",
  zmodus: "Automatisch: so viele Ziele wie möglich adeln (AGs plus mindestens eine Clean-Off), dann Clean-Offs bis zum Richtwert, dann Off vor AG möglichst oft, dann kürzeste Laufzeiten; gleichwertige Lösungen per Zufall. Je Angreifer: jedes Ziel bekommt in der Tabelle einen Angreifer, der es adelt; Clean-Offs dürfen von allen kommen.",
  ankunft: "Ein Zeitpunkt (alle Ziele zur selben Zeit, die erste Clean-Off genau darauf) oder ein Zeitraum, über den sich die Angriffe verteilen. Für einen Zeitpunkt nur den Start ausfüllen. Ende ohne Tag: gleicher Tag wie der Start, liegt die Uhrzeit davor, der nächste Tag. Tag und Uhrzeit lassen sich eintippen oder über die Knöpfe neben den Feldern wählen. Für Offs und AGs ist höchstens 1 Stunde zu empfehlen, 1,5 Stunden sind ein Orientierungswert; für Fakes dürfen Zeiträume länger sein, auch über die Nacht (geplant wird nur der Tagesteil). Ankünfte im Nachtbonus werden gemeldet. Nach der Berechnung sucht der Planer gleich lange Zeiträume bis 12 Stunden davor und danach, die besser zu den Abschickzeiträumen passen, nie im Nachtbonus. Angriffe kommen nie im Nachtbonus an: ein Ende um 23:00:00 heißt höchstens 22:59:59, ein Zeitraum, der in die Nacht ragt, wird gekürzt, einer ganz in der Nacht wird abgelehnt. Weitere Zeiträume per Knopf (v0.6): Offs und AGs kommen im ersten an, Fakes verteilt der Planer auf alle, je Spieler in den Zeitraum, der zu seinen Abschickzeiten passt. Für einen reinen Fake-Plan keine AG-Ziele eintragen, nur Fakeziele. Andere Ankunftszeiten schlägt der Planer nur bei einem Zeitraum mit AG-Zielen vor.",
  fen_je: "An: jeder Angreifer kann eigene Abschickzeiträume bekommen, ohne eigene gelten die gemeinsamen. Aus: für alle gelten die gemeinsamen Zeiträume; eigene bleiben gespeichert und gelten wieder, sobald der Schalter an ist. „Zurücksetzen“ löscht die eigenen Zeiträume eines Angreifers.",
  fenster: "Wann abgeschickt werden kann, auf die Minute. Ein Zeitraum über Mitternacht ist erlaubt (Start 22:00, Ende 01:00, Tag beim Ende leer). Weitere Zeiträume kommen über den Knopf dazu. Jeder Angreifer kann unter „Je Angreifer“ eigene Zeiträume bekommen; sie ersetzen für ihn die gemeinsamen. Die Zeiträume sind ein Wunsch: geht ein Ziel nur mit Abschicken außerhalb, plant der Planer es trotzdem, markiert diese Befehle („außerhalb“, „nachts“) und sagt nach der Berechnung, wie die Zeiträume zu erweitern wären. Fakes kommen nur in Sitzungen, in denen ohnehin abgeschickt wird.",
  jeClean: "Gilt nur für diesen Spieler, statt der Einstellung „Clean-Offs je AG-Ziel“ oben. „Höchstens N je Ziel“: von diesem Spieler kommen je AG-Ziel höchstens N Clean-Offs (0: keine), die Zahl je Ziel bleibt beim Wert oben. „N für meine AG-Ziele“: Ziele, auf die dieser Spieler den AG-Train schickt, bekommen N Clean-Offs (mindestens 1). Ohnehin gilt: Clean-Offs kommen möglichst vom Spieler, der den Train schickt, damit er sein Timing selbst in der Hand hat.",
  jeStark: "Gilt nur für diesen Spieler: seine AG-Ziele bekommen ihre Clean-Offs möglichst von ihm selbst, und seine Offs gehen möglichst auf seine eigenen AG-Ziele, auch seine freien Offs. Fremde Offs vor seinen AGs gibt es dann nur, wenn er selbst keine passende Off hat. Das geht vor Abschickzeitraum und Laufzeit-Richtwert, aber nicht vor „Off vor AG“: kann seine eigene Off nur nach seinem AG losgehen, kommt lieber eine fremde, die vorher losgeht. Das Adeln selbst geht ebenfalls vor (fehlt einem Ziel sonst eine Clean-Off, kommt sie doch von einem anderen).",
  jeRammen: "Gilt nur für diesen Spieler: so viele Rammen darf ein Fake höchstens enthalten (leer: 1, 0: keine). Katapulte gehen immer vor: eine Ramme ist die langsamste Einheit nur, wenn im Dorf kein Katapult frei ist, und aufgefüllt wird mit Rammen erst, wenn Katapulte und Späher nicht reichen. Jeder Fake hat mindestens einen Späher.",
  jeFake: "Gilt nur für diesen Spieler. „Höchstens N je eigenem Dorf“: jedes seiner Dörfer schickt höchstens N Fakes, etwa bei wenig Katapulten (bei „Fakes zählen je Herkunftsdorf“ genau N, soweit Truppen reichen). „N je Fakeziel“: dieser Spieler schickt N Fakes auf jedes Fakeziel, zusätzlich zu den Fakes der übrigen Spieler nach „Fakes je Dorf“ oben. Fakes bleiben Richtwert: was in keine Abschicksitzung passt, entfällt.",
  teilnahme: "Offs: Clean-Offs und übrige Offs. AGs: Trains; eine Off läuft nur im Train mit, wenn der Spieler auch mit Offs teilnimmt. Fakes: aus allen Dörfern der Übersicht.",
  auswahl: "Nur diese Dörfer schicken Offs und AGs, etwa weil andere Offs schon für einen anderen Plan verplant sind. Je Dorf Koordinaten, mit oder ohne Namen, auch eingefügte Links. Fakes kommen weiter aus allen Dörfern; Offs außerhalb der Auswahl geben dafür keine Rammen her, Katapulte nur über dem Richtwert.",
};

/* ---------- Einstellungen ---------- */
const FELDER = [
  {k: "ags_per_target", l: "AGs je Ziel", t: "sel", o: [[4, "4 AGs (86,7 %)"], [5, "5 AGs (100 %)"]]},
  {k: "train_form", l: "Train-Form", t: "sel", o: [["ganz", "ganzer Train aus einem Dorf"], ["zwei", "2er-Trains"], ["einzeln", "einzeln"]]},
  {k: "split_full", l: "Off splitten bei ganzen Trains", t: "chk"},
  {k: "split_two", l: "Off splitten bei 2er-Trains", t: "chk"},
  {k: "min_send_gap_s", l: "Mindestabstand Abschickvorgänge", t: "num", u: "s", min: 0, max: 600},
  {k: "send_gap_target_s", l: "Mindestabstandtendenz", t: "num", u: "s", min: 0, max: 600},
  {k: "zeitraeume", l: "Abschickzeiträume", t: "sel", o: [["wunsch", "Richtwert: notfalls außerhalb"], ["streng", "fest: nur innerhalb"]]},
  {k: "max_lauf_off_h", l: "Laufzeit Offs höchstens (Richtwert, 0: keine)", t: "num", u: "h", min: 0, max: 240, step: 0.5},
  {k: "max_lauf_ag_h", l: "Laufzeit AG-Trains höchstens (0: keine)", t: "num", u: "h", min: 0, max: 240, step: 0.5},
  {k: "lauf_ag_art", l: "AG-Laufzeit-Grenze", t: "sel", o: [["fest", "fest: nie länger"], ["richtwert", "Richtwert: länger, wenn sonst nicht geadelt"]]},
  {k: "zeit_rangfolge", l: "Rangfolge beim Abwägen", t: "sel", o: [["standard", "Standard: Off vor AG vor kurzen Sitzungen"], ["sitzungen", "kurze Sitzungen zuerst"], ["nachtruhe", "Nachtruhe: lieber ein Ziel weniger"]]},
  {k: "off_min_pop", l: "Off-Richtwert", t: "num", u: "BH", min: 0, max: 40000, step: 50,
   x: "Beispiel: 5.000 Axt + 2.500 LKav × 4 + 250 Rammen × 5 = 16.250 BH"},
  {k: "off_min_rams", l: "Mindest-Rammen je Off", t: "num", min: 0, max: 5000},
  {k: "growth", l: "Zuwachs bis zum Abschicken je Tag", t: "pair", a: ["growth_pop_per_day", "BH"], b: ["growth_rams_per_day", "Rammen"]},
  {k: "clean_per_target", l: "Clean-Offs je AG-Ziel", t: "sel", o: [[1, "1"], [2, "2"], [3, "3"]]},
  {k: "clean_eigene", l: "Clean-Offs vom Spieler des Trains", t: "sel", o: [["vorrang", "vor kurzen Sitzungen"], ["nachrang", "nach kurzen Sitzungen"]]},
  {k: "uebrige_auf_ag", l: "Freie Offs zusätzlich auf AG-Ziele", t: "sel", o: [["alle", "ja, notfalls mit eigener Sitzung"], ["sitzung", "ja, nur in bestehende Sitzungen"], ["erzwingen", "ja, alle, auch außerhalb Zeitraum und Laufzeit"], ["aus", "nein"]]},
  {k: "rest_offs", l: "Übrige Offs", t: "sel", o: [["frei", "nicht verplanen"], ["nicht_ag", "auf Nicht-AG-Dörfer der Zielspieler"]]},
  {k: "gap_off_ag_ms", l: "Abstand letzte Clean-Off zum ersten AG", t: "num", u: "ms", min: 0, max: 60000},
  {k: "gap_clean_ms", l: "Abstand zwischen Clean-Offs", t: "num", u: "ms", min: 0, max: 60000},
  {k: "gap_ag_ms", l: "Abstand AGs verschiedener Dörfer", t: "num", u: "ms", min: 0, max: 60000},
  {k: "off_first", l: "Off vor den AGs abschicken", t: "chkNum", n: "off_first_lead_s", u: "min Vorlauf", f: 60, min: 0, max: 600},
  {k: "spies_per_off", l: "Späher je Off", t: "num", min: 0, max: 1000},
  {k: "escort_pop", l: "Begleitschutz je AG", t: "num", u: "BH", min: 0, max: 20000},
  {k: "fake_modus", l: "Fakes zählen je", t: "sel", o: [["ziel", "Zieldorf"], ["herkunft", "Herkunftsdorf"]]},
  {k: "fakes_per_village", l: "Fakes je Dorf", t: "num", min: 0, max: 20},
  {k: "fakes_max_je_dorf", l: "Fakes aus einem eigenen Dorf höchstens", t: "num", min: 1, max: 20},
  {k: "fake_verteilung", l: "Fakes verteilen", t: "sel", o: [["reihum", "reihum: erst jedes Ziel einen"], ["haupt", "Hauptziele zuerst voll"]]},
  {k: "fake_extra_pop", l: "Zuschlag Fakelimit", t: "num", u: "BH", min: 0, max: 500},
  {k: "fake_vorlauf_h", l: "Erste Fakes vor der ersten Off (Richtwert, 0: aus)", t: "spanne", a: ["fake_vorlauf_h", "bis"], b: ["fake_vorlauf_bis_h", "h"], min: 0, max: 48, step: 0.5},
  {k: "extra_fakes", l: "Zusätzliche Fakeziele aus dem Stamm", t: "chkNum", n: "moral_threshold", u: "% Moral mindestens", f: 0.01, min: 30, max: 100},
];

/* ---------- Zustand ---------- */
const leererZeitraum = () => ({vonDatum: "", vonZeit: "", bisDatum: "", bisZeit: ""});
const neuerAngreifer = () => ({text: "", rollen: {off: true, ag: true, fake: true}, auswahlText: "", fen: [leererZeitraum()], nobles: {}, useOff: {},
                               cleanModus: "", cleanN: "", fakeModus: "", fakeN: "", rammenMax: "", eigeneStark: false, pala: {}});
let S = {cfg: Object.assign({}, K.CFG_DEFAULT), seed: 1, atts: [neuerAngreifer()], ziele: [], fakeHaupt: [], zart: "ag", zmodus: "auto",
         ank: leererZeitraum(), ankListe: [], fen: [leererZeitraum()], fakeAus: [], fakeText: "", extraAus: [], extraEin: [], wahlKnapp: null, hilfe: false};
/* Gespeicherte Stände aus der Zeit der Textfelder (ankunft, fenster, fensterText) in die getrennten Felder übernehmen. */
function zeilenAusFenster(text) {
  const z = K.parseFenster(text).fenster.map(x => {
    const a = K.fmtZeit(x[0]).split(" "), b = K.fmtZeit(x[1]).split(" ");
    return {vonDatum: a[0], vonZeit: K.fmtUhrzeit(K.parseUhrzeit(a[1])), bisDatum: b[0], bisZeit: K.fmtUhrzeit(K.parseUhrzeit(b[1]))};
  });
  return z.length ? z : [leererZeitraum()];
}
function zeitenUebernehmen() {
  if (S.ankunft != null) {
    const a = K.parseAnkunft(S.ankunft);
    if (!a.fehler) {
      const v = K.fmtZeit(a.from, true).split(" "), b = K.fmtZeit(a.to, true).split(" ");
      S.ank = {vonDatum: v[0], vonZeit: v[1], bisDatum: a.to > a.from ? b[0] : "", bisZeit: a.to > a.from ? b[1] : ""};
    }
    delete S.ankunft;
  }
  if (S.fenster != null) { S.fen = zeilenAusFenster(S.fenster); delete S.fenster; }
  S.atts.forEach(a => {
    if (a.fensterText != null) { a.fen = zeilenAusFenster(a.fensterText); delete a.fensterText; }
    if (!a.fen || !a.fen.length) a.fen = [leererZeitraum()];
  });
  if (S.fenJe == null) S.fenJe = S.atts.some(a => a.fen.some(z => !K.zeitraumAusFeldern(z).leer));
  ankSync();
}
/* Mehrere Ankunftszeiträume (v0.6): S.ankListe ist die Quelle, S.ank immer ihr erster (Hauptzeitraum für Offs und AGs). */
function ankSync() {
  if (!Array.isArray(S.ankListe) || !S.ankListe.length) S.ankListe = [S.ank || leererZeitraum()];
  S.ank = S.ankListe[0];
}
function laden() {
  try {
    const s = JSON.parse(localStorage.getItem(SPEICHER) || "null");
    if (s && s.v === 1) {
      S = Object.assign(S, s.S);
      S.cfg = Object.assign({}, K.CFG_DEFAULT, s.S.cfg);
      if (!S.atts.length) S.atts = [neuerAngreifer()];
      zeitenUebernehmen();
    }
  } catch (e) { /* ohne Speicher nur für diesen Besuch */ }
}
let speicherTimer = 0;
function speichern() {
  clearTimeout(speicherTimer);
  speicherTimer = setTimeout(() => {
    try { localStorage.setItem(SPEICHER, JSON.stringify({v: 1, S})); } catch (e) { /* Speicher voll oder gesperrt */ }
  }, 300);
}

/* ---------- Weltdaten ---------- */
let W = K.makeWorld(), WELT = "de259";
let P = null, pIdx = {}, V = null, IDS = null, byXY = new Map(), dorfVon = new Map(), ALLY = new Map(), JOIN = null;
const spielerName = p => p >= 0 && P ? P.rows[p][pIdx.name] : "Barbaren";
const koord = xy => Math.floor(xy / 1000) + "|" + (xy % 1000);
function dorf(xy) {
  const i = byXY.get(xy);
  if (i == null) return null;
  const r = V.rows[i];
  return {i, id: IDS ? IDS[i] : null, x: Math.floor(xy / 1000), y: xy % 1000, xy, p: r[1], pts: r[2], name: r[4]};
}

/* ---------- Hilfe ---------- */
function infoKnopf(key) {
  const b = el("button", "ap-i", "i");
  b.type = "button"; b.title = "Info"; b.dataset.info = key; b.setAttribute("aria-expanded", "false");
  return b;
}
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest(".ap-i");
  if (!b) return;
  const h = document.querySelector('.ap-help[data-help="' + b.dataset.info + '"]');
  if (!h) return;
  const offen = !h.classList.contains("offen");
  h.classList.toggle("offen", offen);
  b.setAttribute("aria-expanded", String(offen));
});
function hilfeFeld(key) { const h = el("div", "ap-help", INFO[key] || ""); h.dataset.help = key; return h; }
function hilfeAnwenden() {
  document.body.classList.toggle("ap-hilfe", !!S.hilfe);
  $("help-all").setAttribute("aria-pressed", String(!!S.hilfe));
  $("help-all").textContent = S.hilfe ? "Hilfe ausblenden" : "Hilfe einblenden";
}

/* ---------- 1. Konfiguration ---------- */
function zahl(input, f) { const v = parseFloat(String(input.value).replace(",", ".")); return isNaN(v) ? null : v * (f || 1); }
function cfgBauen() {
  const box = $("cfg");
  box.replaceChildren();
  FELDER.forEach(F => {
    const f = el("div", "ap-f"), lab = el("div", "lab");
    lab.append(el("span", null, F.l), infoKnopf(F.k));
    const ctl = el("div", "ctl");
    const num = (key, unit, fak, min, max, step) => {
      const i = el("input"); i.type = "number"; i.min = min; i.max = max; i.step = step || 1;
      i.value = Math.round(S.cfg[key] / (fak || 1) * 100) / 100;
      i.addEventListener("input", () => { const v = zahl(i, fak); if (v != null) { S.cfg[key] = v; geaendert(); } });
      ctl.append(i);
      if (unit) ctl.append(el("span", "ap-note", unit));
    };
    if (F.t === "sel") {
      const s = el("select");
      F.o.forEach(([v, t]) => { const o = el("option", null, t); o.value = v; s.append(o); });
      s.value = S.cfg[F.k];
      s.addEventListener("change", () => { S.cfg[F.k] = isNaN(+s.value) ? s.value : +s.value; geaendert(); });
      ctl.append(s);
    } else if (F.t === "chk" || F.t === "chkNum") {
      const l = el("label"), c = el("input");
      c.type = "checkbox"; c.checked = !!S.cfg[F.k];
      c.addEventListener("change", () => { S.cfg[F.k] = c.checked; geaendert(); });
      l.append(c, el("span", null, "an"));
      ctl.append(l);
      if (F.t === "chkNum") num(F.n, F.u, F.f, F.min, F.max);
    } else if (F.t === "num") {
      num(F.k, F.u, 1, F.min, F.max, F.step);
    } else if (F.t === "spanne") {
      // Wert oder Spanne „von bis“ (Dennis 12.11.2026); „bis“ leer oder 0: nur der eine Wert
      num(F.a[0], F.a[1], 1, F.min, F.max, F.step);
      num(F.b[0], F.b[1], 1, F.min, F.max, F.step);
    } else if (F.t === "pair") {
      num(F.a[0], F.a[1], 1, 0, 50000, 50);
      num(F.b[0], F.b[1], 1, 0, 1000, 1);
    }
    f.append(lab, ctl);
    if (F.x) f.append(el("div", "extra", F.x));
    f.append(hilfeFeld(F.k));
    box.append(f);
  });
}

/* ---------- 2. Angreifer ---------- */
const ANALYSE = [];                     // je Angreifer: gelesene Dörfer mit Einordnung
function spalten() {
  const ids = (window._units || []).map(u => u.id);
  return ids.length ? ids.concat(["militia"]) : K.OVERVIEW_COLUMNS;
}
function tageBisAbschicken(own) {
  const f = own.fenster.length ? own.fenster : K.fensterAusZeilen(S.fen).fenster;
  return f.length ? Math.max(0, (f[0][0] - Date.now()) / 864e5) : 0;
}
function analysieren(i) {
  const a = S.atts[i];
  const r = K.parseOverview(a.text, spalten());
  const fehlt = [], besitzer = new Map();
  // Eigene Zeiträume nur mit Schalter „je Angreifer“ (Dennis 09.11.2026); aus: es gelten die gemeinsamen
  const own = S.fenJe ? K.fensterAusZeilen(a.fen) : {fenster: [], fehler: []};
  const tage = tageBisAbschicken(own);
  const dorfer = [];
  r.villages.forEach(v => {
    const d = dorf(v.x * 1000 + v.y);
    if (!d) { fehlt.push(v.x + "|" + v.y); return; }
    if (d.p >= 0) besitzer.set(d.p, (besitzer.get(d.p) || 0) + 1);
    const x = Object.assign({}, v, {id: d.id, pts: d.pts, owner: d.p, xy: d.xy});
    x.c = K.classify(x, W, S.cfg, tage);
    dorfer.push(x);
  });
  let pRow = -1, best = 0;
  besitzer.forEach((n, p) => { if (n > best) { best = n; pRow = p; } });
  const fremd = dorfer.filter(d => pRow >= 0 && d.owner !== pRow).map(d => koord(d.xy));
  const aus = a.auswahlText.trim() ? K.parseKoordListe(a.auswahlText) : null;
  const inUebersicht = new Set(dorfer.map(d => d.xy));
  const auswahlFehlt = aus ? aus.keys.filter(k => !inUebersicht.has(k)).map(koord) : [];
  ANALYSE[i] = {r, dorfer, fehlt, fremd, pRow, aus, auswahlFehlt, own, tage,
                name: pRow >= 0 ? spielerName(pRow) : "Angreifer " + (i + 1),
                points: pRow >= 0 ? P.rows[pRow][pIdx.points] : (r.header ? r.header.points : 0)};
  return ANALYSE[i];
}
const offEingeplant = (a, d) => a.useOff[d.xy] != null ? a.useOff[d.xy] : (d.c.isOff || d.c.knapp);
const agZahl = (a, d) => a.nobles[d.xy] != null ? a.nobles[d.xy] : d.units.snob;

function attBlock(i) {
  const a = S.atts[i];
  const box = el("div", "ap-att");
  const kopf = el("div", "kopf");
  const titel = el("strong", null, "Angreifer " + (i + 1));
  titel.id = "att-titel-" + i;
  const rollen = el("span", "ap-row");
  [["off", "Offs"], ["ag", "AGs"], ["fake", "Fakes"]].forEach(([k, t]) => {
    const l = el("label"), c = el("input");
    c.type = "checkbox"; c.checked = a.rollen[k] !== false;
    c.addEventListener("change", () => { a.rollen[k] = c.checked; geaendert(); });
    l.append(c, el("span", null, t));
    rollen.append(l);
  });
  rollen.append(infoKnopf("teilnahme"));
  const weg = el("button", "tw", "entfernen");
  weg.type = "button";
  weg.addEventListener("click", () => { S.atts.splice(i, 1); if (!S.atts.length) S.atts.push(neuerAngreifer()); attsBauen(); geaendert(); });
  kopf.append(titel, el("span", "ap-note", "nimmt teil mit:"), rollen, weg);
  const ta = el("textarea", "ap-ta");
  ta.spellcheck = false; ta.value = a.text;
  ta.placeholder = "[001] Dorfname (500|500) K55   eigene   0   5   6423   …";
  ta.setAttribute("aria-label", "Truppenübersicht Angreifer " + (i + 1));
  ta.addEventListener("input", () => { a.text = ta.value; attAnalyse(i); geaendert(); });
  const det1 = el("details"), s1 = el("summary", null, "Dorfauswahl für Offs und AGs (optional)");
  const ta2 = el("textarea", "ap-ta klein");
  ta2.spellcheck = false; ta2.value = a.auswahlText;
  ta2.placeholder = "je Dorf eine Zeile: 639|602 oder [Dorf (639|602) K66](…)";
  ta2.addEventListener("input", () => { a.auswahlText = ta2.value; attAnalyse(i); geaendert(); });
  det1.append(s1, el("div", "ap-row", ""), ta2);
  det1.children[1].append(el("span", "ap-note", "Leer: alle Dörfer der Übersicht."), infoKnopf("auswahl"));
  det1.append(hilfeFeld("auswahl"));
  if (a.auswahlText.trim()) det1.open = true;
  // Eigene Werte je Spieler (Dennis 03.11.2026 15:12): Clean-Offs 2b oder 2a, Fakes 3a oder 3b, jeweils entweder oder
  const eigen = el("div", "ap-row");
  const wahl = (label, key, opts, nKey, max, info) => {
    const l = el("label"); l.append(el("span", "ap-note", label));
    const sel = el("select"); opts.forEach(([v, t]) => { const o = el("option", null, t); o.value = v; sel.append(o); });
    sel.value = a[key] || "";
    const n = el("input"); n.type = "number"; n.min = 0; n.max = max; n.className = "ap-n"; n.style.width = "4em";
    n.value = a[nKey] == null ? "" : a[nKey]; n.disabled = !sel.value;
    sel.addEventListener("change", () => { a[key] = sel.value; n.disabled = !sel.value; if (sel.value && n.value === "") { n.value = 1; a[nKey] = 1; } geaendert(); });
    n.addEventListener("input", () => { a[nKey] = n.value; geaendert(); });
    l.append(sel, n);
    eigen.append(l, infoKnopf(info));
  };
  wahl("Clean-Offs", "cleanModus", [["", "wie oben"], ["beitrag", "höchstens N je Ziel von diesem Spieler"], ["eigene", "N für seine AG-Ziele"]], "cleanN", 3, "jeClean");
  wahl("Fakes", "fakeModus", [["", "wie oben"], ["dorf", "höchstens N je eigenem Dorf"], ["ziel", "N je Fakeziel von diesem Spieler"]], "fakeN", 20, "jeFake");
  // Rammen je Fake höchstens, je Spieler (Dennis 10.11.2026 01:17); leer: 1
  const lr = el("label"); lr.append(el("span", "ap-note", "Rammen je Fake höchstens"));
  const rn = el("input"); rn.type = "number"; rn.min = 0; rn.max = 1000; rn.className = "ap-n"; rn.style.width = "4em"; rn.placeholder = "1";
  rn.value = a.rammenMax == null ? "" : a.rammenMax; rn.setAttribute("aria-label", "Rammen je Fake höchstens für diesen Spieler");
  rn.addEventListener("input", () => { a.rammenMax = rn.value; geaendert(true); });
  lr.append(rn); eigen.append(lr, infoKnopf("jeRammen"));
  // eigene AG-Ziele stark (Dennis 12.11.2026 22:05): Offs unter sich, kaum fremde Offs vor seinen AGs
  const ls = el("label"), cs = el("input"); cs.type = "checkbox"; cs.checked = !!a.eigeneStark;
  cs.setAttribute("aria-label", "eigene AG-Ziele stark für diesen Spieler");
  cs.addEventListener("change", () => { a.eigeneStark = cs.checked; geaendert(true); });
  ls.append(cs, el("span", "ap-note", "eigene AG-Ziele stark"));
  eigen.append(ls, infoKnopf("jeStark"));
  const out = el("div");
  out.id = "att-out-" + i;
  box.append(kopf, ta, det1, eigen, hilfeFeld("jeClean"), hilfeFeld("jeFake"), hilfeFeld("jeRammen"), hilfeFeld("jeStark"), out);
  return box;
}
function attsBauen() {
  const box = $("atts");
  box.replaceChildren();
  fensterJeBauen();
  S.atts.forEach((a, i) => { box.append(attBlock(i)); attAnalyse(i); });
}
function attAnalyse(i) {
  const out = $("att-out-" + i);
  if (!out) return;
  const a = S.atts[i];
  if (!a.text.trim()) { ANALYSE[i] = null; fensterJeTitel(i); out.replaceChildren(el("p", "ap-note", "Noch keine Übersicht eingefügt.")); return; }
  const A = analysieren(i);
  fensterJeTitel(i);
  $("att-titel-" + i).textContent = "Angreifer " + (i + 1) + ": " + A.name + (A.points ? " (" + nf.format(A.points) + " P)" : "");
  const box = el("div");
  const offs = A.dorfer.filter(d => d.c.isOff).length, knapp = A.dorfer.filter(d => d.c.knapp).length;
  const ags = A.dorfer.reduce((s, d) => s + agZahl(a, d), 0), agDorf = A.dorfer.filter(d => agZahl(a, d) > 0).length;
  const sum = el("div", "ap-sum");
  [["Dörfer", A.dorfer.length], ["Offs", offs], ["knapp", knapp], ["AGs", ags + " in " + agDorf + " Dörfern"]]
    .forEach(([t, v]) => { const d = el("div"); d.append(el("b", null, String(v)), document.createTextNode(" " + t)); sum.append(d); });
  box.append(sum);
  const meld = [];
  A.r.errors.forEach(e => meld.push(["warn", e]));
  A.r.warnings.forEach(e => meld.push(["", e]));
  if (A.fehlt.length) meld.push(["warn", A.fehlt.length + " Dörfer fehlen in den Weltdaten (neu oder Koordinate falsch): " + A.fehlt.slice(0, 8).join(", ")]);
  if (A.fremd.length) meld.push(["", "Laut Weltdaten gehören " + A.fremd.length + " Dörfer einem anderen Spieler (frisch geadelt?): " + A.fremd.slice(0, 8).join(", ")]);
  if (A.aus) meld.push([A.auswahlFehlt.length ? "warn" : "", "Dorfauswahl: " + A.aus.keys.length + " Dörfer" +
    (A.auswahlFehlt.length ? ", nicht in der Übersicht: " + A.auswahlFehlt.slice(0, 8).join(", ") : "")]);
  if (A.own && A.own.fehler.length) A.own.fehler.forEach(f => meld.push(["warn", f]));
  // AG-Zahlen von Hand (Dennis 12.11.2026): sie gelten statt der Übersicht und bleiben im Browser, auch nach neuem Einfügen;
  // deshalb sichtbar machen, mit Zurücksetzen
  const hand = A.dorfer.filter(d => a.nobles[d.xy] != null && a.nobles[d.xy] !== d.units.snob);
  if (hand.length) {
    const mehr = hand.reduce((n, d) => n + a.nobles[d.xy] - d.units.snob, 0);
    meld.push(["warn", hand.length + (hand.length === 1 ? " Dorf" : " Dörfer") + " mit AG-Zahl von Hand statt aus der Übersicht" +
      (mehr > 0 ? ", zusammen " + mehr + " AGs mehr (noch zu bauen)" : mehr < 0 ? ", zusammen " + (-mehr) + " AGs weniger" : "") + ": " +
      hand.slice(0, 6).map(d => d.name + " " + a.nobles[d.xy] + " statt " + d.units.snob).join(", ") + (hand.length > 6 ? " …" : ""), "agHand"]);
  }
  if (meld.length) {
    const ul = el("ul", "ap-list");
    meld.forEach(([c, t, art]) => {
      const li = el("li", c, t);
      if (art === "agHand") li.append(" ", knopf("alle auf die Übersicht zurücksetzen", () => { hand.forEach(d => { delete a.nobles[d.xy]; }); attAnalyse(i); geaendert(); }, "tw"));
      ul.append(li);
    });
    box.append(ul);
  }
  // Tabelle: Offs, knappe Offs, AG-Dörfer und alle übrigen
  const ausSet = A.aus ? new Set(A.aus.keys) : null;
  // Jede Spalte sortierbar, Standard Dorfname A bis Z; die gewählte Sortierung bleibt je Angreifer (Dennis 12.11.2026)
  const sv = (el0, v) => { const td = el0.closest("td"); if (td) td.dataset.v = v; };     // Wert nach Änderung nachführen
  const rows = A.dorfer.map(d => {
    const cOff = el("input"); cOff.type = "checkbox"; cOff.checked = offEingeplant(a, d);
    cOff.title = "als Off einplanen";
    cOff.addEventListener("change", () => { a.useOff[d.xy] = cOff.checked; sv(cOff, cOff.checked ? 1 : 0); geaendert(true); });
    const nAG = el("input", "ap-n"); nAG.type = "number"; nAG.min = 0; nAG.max = 99; nAG.value = agZahl(a, d);
    nAG.title = "AGs, die bis zum Abschicken im Dorf stehen";
    // von Hand abweichend von der Übersicht: markiert, mit Hinweis „noch N bauen“ und Zurücksetzen (Dennis 12.11.2026)
    const agZelle = el("span", "ap-agzelle"), agInfo = el("span", "ap-note");
    const agMarkieren = () => {
      const h = a.nobles[d.xy] != null && a.nobles[d.xy] !== d.units.snob;
      nAG.classList.toggle("ap-hand", h);
      agInfo.replaceChildren();
      if (!h) return;
      const diff = a.nobles[d.xy] - d.units.snob;
      agInfo.append(" Übersicht " + d.units.snob + (diff > 0 ? ", noch " + diff + " bauen " : " "));
      const r = knopf("↺", () => { delete a.nobles[d.xy]; nAG.value = d.units.snob; sv(nAG, d.units.snob); agMarkieren(); attAnalyse(i); geaendert(); }, "tw");
      r.title = "auf die Übersicht zurücksetzen (" + d.units.snob + ")";
      agInfo.append(r);
    };
    nAG.addEventListener("input", () => { const v = parseInt(nAG.value, 10); a.nobles[d.xy] = isNaN(v) ? 0 : Math.max(0, v); sv(nAG, a.nobles[d.xy]); agMarkieren(); geaendert(); });
    agZelle.append(nAG, agInfo);
    agMarkieren();
    // Zustimmungs-Paladin im Dorf (Dennis 12.11.2026): vom Spieler festgelegt, steht im Dorf und läuft nicht mit; jeder ganze
    // Train aus diesem Dorf braucht dann nur 3 AGs
    if (!a.pala) a.pala = {};
    const cPala = el("input"); cPala.type = "checkbox"; cPala.checked = !!a.pala[d.xy];
    cPala.title = "Zustimmungs-Paladin steht in diesem Dorf: 3er-Trains";
    cPala.addEventListener("change", () => { if (cPala.checked) a.pala[d.xy] = true; else delete a.pala[d.xy]; sv(cPala, cPala.checked ? 1 : 0); geaendert(true); });
    const status = d.c.isOff ? "Off" : d.c.knapp ? "knapp" : d.c.offPop > 0 && d.c.offPop >= 3000 ? "zu klein" : "Deff";
    const rang = {Off: 3, knapp: 2, "zu klein": 1, Deff: 0}[status];
    const fehlt = d.c.isOff ? "" : (d.c.fehltBH ? nf.format(d.c.fehltBH) + " BH" : "") + (d.c.fehltRammen ? (d.c.fehltBH ? ", " : "") + d.c.fehltRammen + " Rammen" : "");
    const imAus = ausSet ? ausSet.has(d.xy) : true;
    return [[d.name], [koord(d.xy), "num", d.xy], [nf.format(d.c.offPop), "num", d.c.offPop], [nf.format(d.units.ram), "num", d.units.ram],
            [status, null, rang], [fehlt ? "fehlen " + fehlt : "", null, fehlt ? d.c.fehltBH + d.c.fehltRammen * 5 : null],
            [cOff, null, cOff.checked ? 1 : 0], [agZelle, null, agZahl(a, d)], [cPala, null, cPala.checked ? 1 : 0], [d.c.fakeMin != null ? nf.format(d.c.fakeMin) : "?", "num", d.c.fakeMin],
            [ausSet ? (imAus ? "ja" : "nein") : "alle", null, imAus ? 1 : 0]];
  });
  const det = el("details"), sm = el("summary", null, "Dörfer (" + A.dorfer.length + "), AG-Anzahl und Offs anpassen");
  const sc = el("div", "ap-scroll");
  const sortWahl = a.sortDorf && a.sortDorf.col >= 0 && a.sortDorf.col < 11 ? a.sortDorf : {col: 0, dir: "asc"};
  const tab = table([["Dorf", null, "text"], ["Koord.", "num", true], ["Off-BH", "num", true], ["Rammen", "num", true], ["Einordnung", null, true], ["Fehlt", null, true],
                     ["Off", null, true], ["AGs", null, true], ["AG-Pala", null, true], ["Fakelimit", "num", true], ["Auswahl", null, true]], rows, {sort: sortWahl.col, dir: sortWahl.dir});
  const merken = () => setTimeout(() => {
    const ths = [...tab.tHead.rows[tab.tHead.rows.length - 1].cells], col = ths.findIndex(c => c.hasAttribute("aria-sort"));
    if (col >= 0) { a.sortDorf = {col, dir: ths[col].getAttribute("aria-sort") === "ascending" ? "asc" : "desc"}; speichern(); }
  }, 0);
  tab.tHead.addEventListener("click", merken);
  tab.tHead.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") merken(); });
  sc.append(tab);
  det.append(sm, el("p", "ap-note", "„Off“: als Off einplanen (vorausgewählt: Offs und knappe Offs). „AGs“: Anzahl, die bis zum Abschicken im Dorf steht, gezielt je Dorf anpassen. „AG-Pala“: Zustimmungs-Paladin steht in diesem Dorf (du legst fest, wo; er bleibt dort und läuft nicht mit), dann schickt das Dorf 3er-Trains, weil 3 AGs reichen. Nur bei ganzen Trains."), sc);
  if (A.dorfer.length <= 80) det.open = true;
  box.append(det);
  out.replaceChildren(box);
}

/* ---------- 3. Ziele: AG-Ziele und Fakeziele (Fakeziele seit 10.11.2026, Dennis) ---------- */
/** art "ag" oder "fake". Ein Dorf steht nur in einer Liste: als AG-Ziel wandert es aus den Fakezielen,
    als Fakeziel bleibt ein AG-Ziel AG-Ziel. */
function zieleHinzu(keys, quelle, art) {
  const ag = new Set(S.ziele.map(z => z.xy)), fk = new Set(S.fakeHaupt);
  let neu = 0, unbekannt = 0, verschoben = 0, schonAg = 0;
  keys.forEach(k => {
    if (art === "fake" ? fk.has(k) : ag.has(k)) return;
    if (!dorf(k)) { unbekannt++; return; }
    if (art === "fake") {
      if (ag.has(k)) { schonAg++; return; }
      S.fakeHaupt.push(k); fk.add(k); neu++;
    } else {
      if (fk.has(k)) { fk.delete(k); verschoben++; }
      S.ziele.push({xy: k, assignee: null}); ag.add(k); neu++;
    }
  });
  if (verschoben) S.fakeHaupt = S.fakeHaupt.filter(k => fk.has(k));
  geaendert();
  return quelle + ": " + neu + (art === "fake" ? (neu === 1 ? " neues Fakeziel" : " neue Fakeziele") : (neu === 1 ? " neues AG-Ziel" : " neue AG-Ziele")) +
    (verschoben ? ", davon " + verschoben + " aus den Fakezielen" : "") + (schonAg ? ", " + schonAg + " schon AG-Ziel" : "") +
    (unbekannt ? ", " + unbekannt + " nicht in den Weltdaten" : "");
}
function fakeZieleBauen() {
  const box = $("fakeziel-tab");
  $("fakeziel-zahl").textContent = S.fakeHaupt.length ? S.fakeHaupt.length + " Dörfer" : "";
  $("fakeziel-leer").hidden = !S.fakeHaupt.length;
  if (!S.fakeHaupt.length) { box.replaceChildren(el("p", "ap-note", "Keine Fakeziele. Oben „Fakeziele“ wählen und Dörfer hinzufügen.")); return; }
  const rows = S.fakeHaupt.map((k, n) => {
    const d = dorf(k);
    const x = el("button", "tw", "×"); x.type = "button"; x.title = "entfernen";
    x.addEventListener("click", () => { S.fakeHaupt.splice(n, 1); geaendert(); });
    return d ? [[koord(k), "num"], [d.name], [spielerName(d.p)], [nf.format(d.pts), "num", d.pts], [x]]
             : [[koord(k), "num"], ["nicht in den Weltdaten"], [""], ["", "num", 0], [x]];
  });
  const sc = el("div", "ap-scroll");
  sc.append(table([["Koord.", "num"], ["Dorf"], ["Besitzer"], ["Punkte", "num", true], [""]], rows));
  box.replaceChildren(sc);
}
function zieleBauen() {
  const box = $("ziel-tab");
  const anz = (n, eins, mehr) => n ? n + " " + (n === 1 ? eins : mehr) : "";
  $("ziel-hint").textContent = [anz(S.ziele.length, "AG-Ziel", "AG-Ziele"), anz(S.fakeHaupt.length, "Fakeziel", "Fakeziele")].filter(Boolean).join(" · ");
  $("ziel-zahl").textContent = S.ziele.length ? S.ziele.length + " Dörfer" : "";
  $("ziel-leer").hidden = !S.ziele.length;
  document.querySelectorAll('input[name="zart"]').forEach(r => { r.checked = r.value === S.zart; });
  $("ziel-karte").textContent = S.zart === "fake" ? "Fakeziele auf der Karte auswählen" : "AG-Ziele auf der Karte auswählen";
  $("ziel-spieler-add").textContent = S.zart === "fake" ? "alle Dörfer als Fakeziele" : "alle Dörfer als AG-Ziele";
  $("ziel-text-add").textContent = S.zart === "fake" ? "als Fakeziele hinzufügen" : "als AG-Ziele hinzufügen";
  fakeZieleBauen();
  document.querySelectorAll('input[name="zmodus"]').forEach(r => { r.checked = r.value === S.zmodus; });
  // Je Angreifer eigene Ziele: ein Kartenknopf je Angreifer mit AGs
  const je = $("ziel-karte-je");
  je.hidden = S.zmodus !== "je";
  if (!je.hidden) {
    je.replaceChildren(el("span", "ap-note", "Auf der Karte auswählen für:"));
    S.atts.forEach((a, i) => {
      if (a.rollen && a.rollen.ag === false) return;
      const b = el("button", "tw", ANALYSE[i] && ANALYSE[i].name ? ANALYSE[i].name : "Angreifer " + (i + 1));
      b.type = "button"; b.addEventListener("click", () => zurKarte("ag:" + i)); je.append(b);
    });
  }
  if (!S.ziele.length) { box.replaceChildren(el("p", "ap-note", "Noch keine AG-Ziele.")); return; }
  const agDorfer = [];
  ANALYSE.forEach((A, i) => { if (A) A.dorfer.forEach(d => { if (agZahl(S.atts[i], d) > 0) agDorfer.push(d); }); });
  const rows = S.ziele.map((z, n) => {
    const d = dorf(z.xy);
    const nah = agDorfer.length ? Math.min(...agDorfer.map(a => Math.hypot(a.x - d.x, a.y - d.y))) : null;
    const sel = el("select");
    const o0 = el("option", null, "automatisch"); o0.value = ""; sel.append(o0);
    S.atts.forEach((a, i) => { const o = el("option", null, ANALYSE[i] ? ANALYSE[i].name : "Angreifer " + (i + 1)); o.value = i; sel.append(o); });
    sel.value = z.assignee == null ? "" : z.assignee;
    sel.disabled = S.zmodus !== "je";
    sel.addEventListener("change", () => { z.assignee = sel.value === "" ? null : +sel.value; geaendert(true); });
    const x = el("button", "tw", "×"); x.type = "button"; x.title = "entfernen";
    x.addEventListener("click", () => { S.ziele.splice(n, 1); geaendert(); });
    const weit = nah != null && nah > W.snob_max_dist;
    return [[koord(z.xy), "num"], [d.name], [spielerName(d.p)], [nf.format(d.pts), "num", d.pts],
            [nah == null ? "–" : nf1.format(nah), weit ? "num down" : "num", nah, weit ? "außerhalb der AG-Reichweite von " + W.snob_max_dist + " Feldern" : ""],
            [sel], [x]];
  });
  const sc = el("div", "ap-scroll");
  sc.append(table([["Koord.", "num"], ["Dorf"], ["Besitzer"], ["Punkte", "num", true], ["Nächstes AG-Dorf (Felder)", "num", true], ["Angreifer"], [""]], rows));
  box.replaceChildren(sc);
}

/* ---------- 4./5. Zeiten ---------- */
const SVG_TAG = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="1"/><path d="M2 6.5h12M5 1.5v3M11 1.5v3"/></svg>';
const SVG_UHR = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M8 4.2V8l2.6 1.6"/></svg>';
const istGueltig = (art, text) => !text.trim() || (art === "tag" ? K.parseDatum(text) : K.parseUhrzeit(text)) !== null;

/* Auswahlfenster: immer nur eines offen, schließt bei Klick daneben und mit Esc. */
let POP = null;
function popZu(zurueck) {
  if (!POP) return;
  POP.el.remove();
  POP.btn.setAttribute("aria-expanded", "false");
  if (zurueck) POP.btn.focus();
  POP = null;
}
function popAuf(btn, inhalt) {
  const p = el("div", "ap-pop");
  p.setAttribute("role", "dialog");
  p.append(inhalt);
  document.body.append(p);
  POP = {el: p, btn};
  btn.setAttribute("aria-expanded", "true");
  const r = btn.getBoundingClientRect(), b = p.offsetWidth, h = p.offsetHeight;
  const links = Math.max(8, Math.min(r.right - b, document.documentElement.clientWidth - b - 8));
  const oben = r.bottom + h + 12 > window.innerHeight && r.top - h - 4 >= 8 ? r.top - h - 4 : r.bottom + 4;
  p.style.left = (links + window.scrollX) + "px";
  p.style.top = (oben + window.scrollY) + "px";
  p.querySelectorAll(".liste .an").forEach(x => { x.parentElement.scrollTop = x.offsetTop - 75; });
}
document.addEventListener("pointerdown", e => { if (POP && !POP.el.contains(e.target) && !POP.btn.contains(e.target)) popZu(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && POP) popZu(true); });

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
function knopf(text, klick, cls) {
  const b = el("button", cls || null, text);
  b.type = "button";
  b.addEventListener("click", klick);
  return b;
}
/** Kalender; zeigt den gewählten Tag, sonst den Bezugstag (Start bei einem Ende), sonst heute. Alles in Serverzeit. */
function kalender(wert, bezug, waehle) {
  const h = K.berlinParts(Date.now()), heute = Date.UTC(h.y, h.mo - 1, h.d);
  const g = K.parseDatum(wert), start = g || K.parseDatum(bezug) || {y: h.y, mo: h.mo};
  let y = start.y, mo = start.mo;
  const box = el("div");
  box.style.cssText = "display:grid; gap:6px";
  const zeichnen = () => {
    const blaettern = n => () => { const t = new Date(Date.UTC(y, mo - 1 + n, 1)); y = t.getUTCFullYear(); mo = t.getUTCMonth() + 1; zeichnen(); };
    const kopf = el("div", "mon");
    const zurueck = knopf("‹", blaettern(-1)), vor = knopf("›", blaettern(1));
    zurueck.setAttribute("aria-label", "Voriger Monat");
    vor.setAttribute("aria-label", "Nächster Monat");
    kopf.append(zurueck, el("span", null, MONATE[mo - 1] + " " + y), vor);
    const tage = el("div", "tage");
    ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].forEach(t => tage.append(el("span", null, t)));
    const leer = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7, n = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    for (let i = 0; i < leer; i++) tage.append(el("i"));
    for (let d = 1; d <= n; d++) {
      const t = Date.UTC(y, mo - 1, d);
      const cls = [g && g.y === y && g.mo === mo && g.d === d ? "an" : "", t === heute ? "heute" : "", t < heute ? "alt" : ""].join(" ").trim();
      tage.append(knopf(String(d), () => waehle(K.fmtDatum({y, mo, d})), cls));
    }
    const fuss = el("div", "fuss");
    fuss.append(knopf("Heute", () => waehle(K.fmtDatum(h))), knopf("Leeren", () => waehle("")));
    box.replaceChildren(kopf, tage, fuss);
  };
  zeichnen();
  return box;
}
/** Uhrzeit aus Spalten; übernimmt jede Wahl sofort ins Feld, „Fertig“ schließt. Mit ms auch Sekunden und Millisekunden. */
function uhrAuswahl(wert, mitMs, setze) {
  const t = K.parseUhrzeit(wert) || {h: 0, mi: 0, s: 0, ms: 0};
  const box = el("div");
  box.style.cssText = "display:grid; gap:6px";
  const spalten = el("div", "spalten");
  const spalte = (titel, n, k) => {
    const s = el("div"), liste = el("div", "liste");
    for (let i = 0; i < n; i++) {
      const b = knopf(String(i).padStart(2, "0"), () => {
        t[k] = i;
        liste.querySelectorAll(".an").forEach(x => x.classList.remove("an"));
        b.classList.add("an");
        setze(K.fmtUhrzeit(t, mitMs));
      }, t[k] === i ? "an" : "");
      liste.append(b);
    }
    s.append(el("b", null, titel), liste);
    spalten.append(s);
  };
  spalte("Std", 24, "h");
  spalte("Min", 60, "mi");
  if (mitMs) spalte("Sek", 60, "s");
  const fuss = el("div", "fuss");
  if (mitMs) {
    const l = el("label"), ms = el("input");
    ms.type = "number"; ms.min = 0; ms.max = 999; ms.value = t.ms;
    ms.addEventListener("input", () => { t.ms = Math.max(0, Math.min(999, Math.floor(+ms.value) || 0)); setze(K.fmtUhrzeit(t, mitMs)); });
    l.append(el("span", null, "ms "), ms);
    fuss.append(l);
  } else fuss.append(el("span"));
  fuss.append(knopf("Fertig", () => popZu(true)));
  box.append(spalten, fuss);
  return box;
}
/** Texteingabe mit Auswahlknopf. Beim Verlassen wird die Eingabe ins einheitliche Format gebracht. */
function zeitFeld(z, k, art, opt, geaendertFn) {
  const box = el("span", "ap-feld"), inp = el("input"), btn = el("button", "ap-pick");
  const beschr = opt.titel + " " + (art === "tag" ? "Tag" : "Uhrzeit");
  inp.type = "text"; inp.spellcheck = false; inp.autocomplete = "off"; inp.value = z[k] || "";
  inp.className = art === "tag" ? "tag" : "zeit" + (opt.ms ? " ms" : "");
  inp.inputMode = "numeric"; inp.title = beschr;
  inp.placeholder = art === "tag" ? (opt.bezug ? "wie Start" : "TT.MM.JJJJ") : (opt.ms ? "HH:MM:SS:mmm" : "HH:MM");
  inp.setAttribute("aria-label", beschr);
  const setze = v => {
    inp.value = v; z[k] = v;
    inp.classList.toggle("falsch", !istGueltig(art, v));
    geaendertFn();
  };
  inp.classList.toggle("falsch", !istGueltig(art, inp.value));
  inp.addEventListener("input", () => setze(inp.value));
  inp.addEventListener("change", () => {
    if (!inp.value.trim()) return;
    const w = art === "tag" ? K.parseDatum(inp.value) : K.parseUhrzeit(inp.value);
    if (w) setze(art === "tag" ? K.fmtDatum(w) : K.fmtUhrzeit(w, opt.ms));
  });
  btn.type = "button"; btn.innerHTML = art === "tag" ? SVG_TAG : SVG_UHR;
  btn.title = art === "tag" ? "Tag im Kalender wählen" : "Uhrzeit wählen";
  btn.setAttribute("aria-label", beschr + " wählen");
  btn.setAttribute("aria-expanded", "false");
  btn.addEventListener("click", () => {
    if (POP && POP.btn === btn) { popZu(true); return; }
    popZu();
    popAuf(btn, art === "tag"
      ? kalender(inp.value, opt.bezug ? opt.bezug() : "", v => { setze(v); popZu(true); })
      : uhrAuswahl(inp.value, opt.ms, setze));
  });
  box.append(inp, btn);
  return box;
}
/** Start und Ende eines Zeitraums, je mit eigenem Feld für Tag und Uhrzeit. */
function zeitraumFelder(z, opt, fn) {
  const box = el("div", "ap-zr");
  [["Start", "vonDatum", "vonZeit", null], ["Ende", "bisDatum", "bisZeit", () => z.vonDatum]].forEach(([titel, kd, kz, bezug]) => {
    const felder = el("div", "felder");
    const o = {ms: opt.ms, titel, bezug};
    felder.append(zeitFeld(z, kd, "tag", o, fn), zeitFeld(z, kz, "zeit", o, fn));
    box.append(el("span", "wo", titel), felder);
  });
  return box;
}
/** Liste von Abschickzeiträumen mit „Zeitraum hinzufügen“ und „entfernen“. */
function zeitraumListe(box, zeilen, fn, opt) {
  const zeichnen = () => {
    const liste = el("div", "ap-zliste");
    zeilen.forEach((z, i) => {
      const zeile = el("div", "zeile");
      zeile.append(zeitraumFelder(z, {ms: !!(opt && opt.ms)}, fn));
      // Kopie als Vorlage für den nächsten Zeitraum, hinten angefügt (Dennis 10.11.2026)
      const kopie = knopf("kopieren", () => { popZu(); zeilen.push(Object.assign({}, z)); zeichnen(); fn(); }, "tw ap-kopie");
      kopie.title = "Diesen Zeitraum als weiteren Zeitraum hinzufügen";
      // Felder dieses Zeitraums leeren (Dennis 12.11.2026)
      const zurueck = knopf("zurücksetzen", () => { popZu(); Object.assign(z, leererZeitraum()); zeichnen(); fn(); }, "tw ap-zurueck-z");
      zurueck.title = "Diesen Zeitraum leeren";
      zeile.append(kopie, zurueck);
      if (zeilen.length > 1) zeile.append(knopf("entfernen", () => { popZu(); zeilen.splice(i, 1); zeichnen(); fn(); }, "tw"));
      liste.append(zeile);
    });
    liste.append(knopf("Weiteren Zeitraum hinzufügen", () => { popZu(); zeilen.push(leererZeitraum()); zeichnen(); fn(); }, "tw"));
    box.replaceChildren(liste);
  };
  zeichnen();
}
function fensterNote(ziel, zeilen, leerText) {
  const f = K.fensterAusZeilen(zeilen);
  const teile = f.fenster.map(x => K.fmtZeit(x[0]).slice(0, 16) + " bis " + K.fmtZeit(x[1]).slice(0, 16));
  ziel.replaceChildren(el("span", f.fehler.length ? "ap-warn" : (teile.length ? "ap-ok" : null),
    f.fehler.length ? f.fehler.join("; ") : (teile.length ? teile.join(" · ") : leerText)));
}
/* Je Angreifer eigene Zeiträume in Abschnitt 5; ohne eigene gelten die gemeinsamen. */
function fensterJeTitel(i) {
  const t = $("fen-titel-" + i);
  if (!t) return;
  const f = K.fensterAusZeilen(S.atts[i].fen);
  const eigen = f.fenster.length > 0 || f.fehler.length > 0;
  t.textContent = (ANALYSE[i] ? "Angreifer " + (i + 1) + ": " + ANALYSE[i].name : "Angreifer " + (i + 1)) + " · " +
    (eigen ? "eigene Zeiträume" : "gemeinsame Zeiträume");
}
function fensterJeBauen() {
  const box = $("fenster-je");
  box.replaceChildren();
  $("fen-je-an").checked = !!S.fenJe;
  box.hidden = !S.fenJe;
  if (!S.fenJe) return;
  S.atts.forEach((a, i) => {
    const det = el("details"), sum = el("summary"), titel = el("span"), note = el("div", "ap-note"), liste = el("div");
    titel.id = "fen-titel-" + i;
    sum.append(titel);
    const LEER = "Leer: gemeinsame Zeiträume von oben.";
    // Zurücksetzen: eigene Zeiträume dieses Angreifers löschen, danach gelten die gemeinsamen (Dennis 09.11.2026)
    const eigen = () => a.fen.some(z => !K.zeitraumAusFeldern(z).leer);
    const zurueck = el("button", "tw ap-zurueck", "Zurücksetzen");
    zurueck.type = "button"; zurueck.disabled = !eigen();
    zurueck.addEventListener("click", () => { a.fen = [leererZeitraum()]; fensterJeBauen(); attAnalyse(i); geaendert(true); });
    zeitraumListe(liste, a.fen, () => { fensterNote(note, a.fen, LEER); zurueck.disabled = !eigen(); attAnalyse(i); fensterJeTitel(i); geaendert(true); });
    fensterNote(note, a.fen, LEER);
    det.append(sum, liste, note, zurueck);
    if (a.fen.some(z => !K.zeitraumAusFeldern(z).leer)) det.open = true;
    box.append(det);
    fensterJeTitel(i);
  });
}
$("fen-je-an").addEventListener("change", e => {
  S.fenJe = e.target.checked;
  fensterJeBauen();
  S.atts.forEach((a, i) => attAnalyse(i));
  geaendert(true);
});
function zeitFelderBauen() {
  ankSync();
  zeitraumListe($("ankunft-felder"), S.ankListe, () => { ankSync(); geaendert(true); }, {ms: true});
  zeitraumListe($("fenster-felder"), S.fen, () => { S.atts.forEach((a, i) => attAnalyse(i)); geaendert(true); });
}
function zeitenBauen() {
  ankSync();
  const n = $("ankunft-note"), liste = S.ankListe.map(z => K.zeitraumAusFeldern(z, true));
  const belegt = liste.filter(a => !a.leer), mehr = belegt.length > 1;
  if (!belegt.length) n.replaceChildren(el("span", null, "Noch keine Ankunft."));
  else {
    n.replaceChildren();
    belegt.forEach((a, i) => {
      const z = el("div");
      if (mehr) z.append(el("strong", null, (i === 0 ? "1 (Offs und AGs, Fakes)" : (i + 1) + " (Fakes)") + ": "));
      if (a.fehler) z.append(el("span", "ap-warn", a.fehler));
      else {
        const t = a.from === a.to ? "Zeitpunkt " + K.fmtZeit(a.from, true)
          : "Zeitraum " + K.fmtZeit(a.from, true) + " bis " + K.fmtZeit(a.to, true) + " (" + nf.format(Math.round((a.to - a.from) / 60000)) + " min)";
        // Ankünfte nie im Nachtbonus (Dennis 10.11.2026): deutlicher Hinweis, „bis 23:00:00“ heißt höchstens 22:59:59
        const teile = K.tagesTeile(W, a), gek = teile.length && K.nachtGekuerzt(a, teile);
        const nb = () => "Nachtbonus (" + W.night.start_hour + " bis " + W.night.end_hour + " Uhr)";
        const tt = x => K.fmtZeit(x.from).slice(0, 19) + " bis " + K.fmtZeit(x.to).slice(K.fmtZeit(x.from).slice(0, 10) === K.fmtZeit(x.to).slice(0, 10) ? 11 : 0, 19);
        z.append(el("span", teile.length && !gek ? "ap-ok" : null, t));
        if (!teile.length) z.append(el("div", "ap-alarm", "Achtung: liegt ganz im " + nb() + ". Angriffe dürfen dort nie ankommen, so ist nichts planbar."));
        else if (gek) z.append(el("div", "ap-alarm", "Achtung: ragt in den " + nb() + ". Angriffe kommen nie im Nachtbonus an, geplant wird nur " + teile.map(tt).join(" und ") + "."));
        else if (teile[0].to < a.to) z.append(el("span", "ap-note", " · letzte Ankunft " + K.fmtZeit(teile[0].to).slice(11, 19) + ", ab " + W.night.start_hour + " Uhr Nachtbonus"));
        // Länge nur als Orientierung für Offs und AGs (Dennis 10.11.2026), für Fakes sind lange Zeiträume sinnvoll
        if (i === 0 && S.ziele.length && a.to - a.from > K.ANKUNFT_RAT_MS)
          z.append(el("span", "ap-note", " · für Offs und AGs empfohlen höchstens 1 Stunde" + (a.to - a.from > K.ANKUNFT_MAX_MS ? ", 1,5 Stunden als Orientierung überschritten" : "")));
      }
      n.append(z);
    });
  }
  fensterNote($("fenster-note"), S.fen, "Noch kein Zeitraum.");
}

/* ---------- 6. Fakes ---------- */
/** Besitzer der AG-Ziele und der Fakeziele aus Abschnitt 3 (Barbaren nicht). */
function zielSpieler() {
  const s = new Set(), add = xy => { const d = dorf(xy); if (d && d.p >= 0) s.add(d.p); };
  S.ziele.forEach(z => add(z.xy)); S.fakeHaupt.forEach(add);
  return s;
}
function pflichtZiele() {
  const drin = new Set(S.ziele.map(z => z.xy).concat(S.fakeHaupt)), aus = new Set(S.fakeAus), out = [];
  zielSpieler().forEach(p => (dorfVon.get(p) || []).forEach(i => {
    const xy = V.rows[i][0];
    if (!drin.has(xy)) out.push({xy, aus: aus.has(xy)});
  }));
  return out.sort((a, b) => a.xy - b.xy);
}
function angreiferPunkte() { return ANALYSE.filter(Boolean).map(A => A.points || 0).filter(p => p > 0); }
function extraKandidaten() {
  const zs = zielSpieler(), stamm = new Set();
  zs.forEach(p => { const a = P.rows[p][pIdx.ally]; if (a) stamm.add(a); });
  const eigene = new Set(ANALYSE.filter(Boolean).map(A => A.pRow));
  const pts = angreiferPunkte(), maxA = pts.length ? Math.max(...pts) : 0, minA = pts.length ? Math.min(...pts) : 0;
  const out = [];
  P.rows.forEach((r, p) => {
    if (!stamm.has(r[pIdx.ally]) || zs.has(p) || eigene.has(p)) return;
    const tage = JOIN ? JOIN[p] : null;
    out.push({p, name: r[pIdx.name], points: r[pIdx.points], dorfer: (dorfVon.get(p) || []).length,
              mStark: K.moral(W.moral, maxA, r[pIdx.points], tage), mSchwach: K.moral(W.moral, minA, r[pIdx.points], tage), tage});
  });
  return out.sort((a, b) => b.points - a.points);
}
function fakesBauen() {
  const box = $("fake-pflicht");
  const pf = pflichtZiele();
  $("fake-hint").textContent = pf.length ? pf.filter(x => !x.aus).length + " Pflichtziele" : "";
  if (!pf.length) box.replaceChildren(el("p", "ap-note", "Pflichtziele erscheinen, sobald AG-Ziele oder Fakeziele (Abschnitt 3) feststehen: alle übrigen Dörfer der Zielspieler."));
  else {
    const rows = pf.map(x => {
      const d = dorf(x.xy), c = el("input");
      c.type = "checkbox"; c.checked = !x.aus;
      c.addEventListener("change", () => {
        const s = new Set(S.fakeAus);
        if (c.checked) s.delete(x.xy); else s.add(x.xy);
        S.fakeAus = [...s]; geaendert(true);
      });
      return [[c], [koord(x.xy), "num"], [d.name], [spielerName(d.p)], [nf.format(d.pts), "num", d.pts]];
    });
    const det = el("details"), sm = el("summary", null, "Pflicht-Fakeziele: " + pf.length + " weitere Dörfer der Zielspieler aus Abschnitt 3");
    const sc = el("div", "ap-scroll");
    sc.append(table([["Fake"], ["Koord.", "num"], ["Dorf"], ["Besitzer"], ["Punkte", "num", true]], rows));
    det.append(sm, el("p", "ap-note", "Abwählen nur mit gutem Grund: Diese Dörfer müssen gefakt werden, sonst ist klar, wo die AGs kommen."), sc);
    box.replaceChildren(det);
  }
  const fk = K.parseKoordListe(S.fakeText);
  $("fake-text-note").textContent = S.fakeText.trim() ? fk.keys.length + " Dörfer" + (fk.keys.filter(k => !dorf(k)).length ? ", davon " + fk.keys.filter(k => !dorf(k)).length + " nicht in den Weltdaten" : "") : "";
  const ex = $("fake-extra");
  if (!S.cfg.extra_fakes) { ex.replaceChildren(el("p", "ap-note", "Zusätzliche Fakeziele aus dem Stamm der Zielspieler: in Abschnitt 1 einschalten.")); return; }
  const kand = extraKandidaten(), aus = new Set(S.extraAus), ein = new Set(S.extraEin || []);
  if (!kand.length) { ex.replaceChildren(el("p", "ap-note", "Keine Stammesmitglieder der Zielspieler gefunden.")); return; }
  // Unter der Moral-Schwelle: nicht vorausgewählt, aber von Hand wählbar (Dennis 10.11.2026)
  const rows = kand.map(m => {
    const ok = m.mStark >= S.cfg.moral_threshold - 1e-9 || m.mSchwach >= S.cfg.moral_threshold - 1e-9;
    const c = el("input"); c.type = "checkbox"; c.checked = ok ? !aus.has(m.p) : ein.has(m.p);
    c.addEventListener("change", () => {
      const s = new Set(ok ? S.extraAus : (S.extraEin || []));
      if (c.checked === ok) s.delete(m.p); else s.add(m.p);
      if (ok) S.extraAus = [...s]; else S.extraEin = [...s];
      geaendert(true);
    });
    const pct = v => Math.round(v * 100) + " %";
    const name = ok ? m.name : m.name + (ein.has(m.p) ? " (von Hand, unter der Schwelle)" : " (unter der Schwelle)");
    return [[c], [name], [nf.format(m.points), "num", m.points], [nf.format(m.dorfer), "num", m.dorfer],
            [pct(m.mStark), "num", m.mStark], [pct(m.mSchwach), "num", m.mSchwach]];
  });
  const sc = el("div", "ap-scroll");
  sc.append(table([["Fake"], ["Mitglied"], ["Punkte", "num", true], ["Dörfer", "num", true], ["Moral stärkster Angreifer", "num", true],
                   ["Moral schwächster Angreifer", "num", true]], rows));
  // eigene Zahl je Zieldorf für Stammesmitglieder, nachrangig zu Pflicht- und weiteren Fakezielen (Dennis 10.11.2026)
  const n = el("input"); n.type = "number"; n.min = "0"; n.max = "20"; n.className = "ap-n"; n.style.width = "4em";
  n.value = String(S.cfg.extra_fakes_per_village != null ? S.cfg.extra_fakes_per_village : 1);
  n.setAttribute("aria-label", "Fakes je Zieldorf bei Stammesmitgliedern");
  n.addEventListener("change", () => { S.cfg.extra_fakes_per_village = Math.max(0, Math.min(20, Math.round(+n.value || 0))); geaendert(true); });
  const zeile = el("div", "ap-row");
  zeile.append(el("span", null, "Fakes je Zieldorf bei Stammesmitgliedern"), n, infoKnopf("extra_n"));
  ex.replaceChildren(zeile, hilfeFeld("extra_n"),
    el("p", "ap-note", "Mitglieder unter der Moral-Schwelle (" + Math.round(S.cfg.moral_threshold * 100) + " %) gegen alle Angreifer sind nicht vorausgewählt. " +
      "Wählst du sie von Hand, fakt jeder Angreifer ihre Dörfer, ohne Moral-Prüfung. Übrige Mitglieder fakt der Rechner nur von Angreifern, gegen die die Schwelle gilt."), sc);
}

/* ---------- 7. Berechnung ---------- */
let ERG = null;
function kernInput(cfgExtra) {
  const fehler = [];
  ankSync();
  const anks = S.ankListe.map(z => K.zeitraumAusFeldern(z, true)), ankGut = anks.filter(a => !a.leer && !a.fehler);
  if (!ankGut.length || anks.some(a => !a.leer && a.fehler)) fehler.push("Ankunft fehlt oder ist ungültig (Abschnitt 4).");
  const ank = ankGut[0] || anks[0];
  const fw = K.fensterAusZeilen(S.fen);
  if (fw.fehler.length) fehler.push(fw.fehler.join("; ") + " (Abschnitt 5).");
  const attackers = [];
  S.atts.forEach((a, i) => {
    const A = ANALYSE[i];
    if (!A || !A.dorfer.length) return;
    if (A.own && A.own.fehler.length) fehler.push(A.name + ": " + A.own.fehler.join("; ") + " (eigene Abschickzeiträume).");
    const own = A.own && A.own.fenster.length ? A.own.fenster : null;
    if (!own && !fw.fenster.length) fehler.push("Kein Abschickzeitraum für " + A.name + " (Abschnitt 5).");
    attackers.push({id: i, name: A.name, points: A.points || 0, rollen: a.rollen, auswahl: A.aus ? A.aus.keys : null, windows: own,
      cleanModus: a.cleanModus || null, cleanN: a.cleanN, fakeModus: a.fakeModus || null, fakeN: a.fakeN, rammenMax: a.rammenMax, eigeneStark: !!a.eigeneStark,
      villages: A.dorfer.map(d => ({id: d.id, name: d.name, x: d.x, y: d.y, pts: d.pts, units: d.units,
                                    nobles: agZahl(a, d), useOff: offEingeplant(a, d), pala: !!(a.pala && a.pala[d.xy])}))});
  });
  if (!attackers.length) fehler.push("Kein Angreifer mit Truppenübersicht (Abschnitt 2).");
  if (!IDS) fehler.push("Dorf-IDs fehlen (dorf_ids.json), ohne sie gibt es keinen Export.");
  const zielDorf = xy => { const d = dorf(xy); return d ? {id: d.id, x: d.x, y: d.y, owner: d.p, name: d.name} : null; };
  const agTargets = S.ziele.map(z => Object.assign(zielDorf(z.xy) || {}, {assignee: S.zmodus === "je" ? z.assignee : null})).filter(t => t.id != null);
  const agSet = new Set(S.ziele.map(z => z.xy));
  const fakeTargets = S.fakeHaupt.filter(k => !agSet.has(k) && dorf(k)).map(zielDorf)
    .concat(pflichtZiele().filter(x => !x.aus).map(x => zielDorf(x.xy)));
  const schon = new Set(fakeTargets.map(t => t.x * 1000 + t.y));
  K.parseKoordListe(S.fakeText).keys.forEach(k => { if (!agSet.has(k) && !schon.has(k) && dorf(k)) { fakeTargets.push(zielDorf(k)); schon.add(k); } });
  const extraFakeTargets = [];
  if (S.cfg.extra_fakes && P) {
    const aus = new Set(S.extraAus), ein = new Set(S.extraEin || []), schwelle = S.cfg.moral_threshold - 1e-9;
    extraKandidaten().forEach(m => {
      const ok = m.mStark >= schwelle || m.mSchwach >= schwelle;
      if (ok ? aus.has(m.p) : !ein.has(m.p)) return;
      (dorfVon.get(m.p) || []).forEach(i => {
        const xy = V.rows[i][0];
        if (agSet.has(xy) || schon.has(xy)) return;
        extraFakeTargets.push(Object.assign(zielDorf(xy), {ownerPoints: m.points, ownerDays: m.tage, manuell: !ok}));
      });
    });
  }
  // reiner Fake-Plan (v0.6): ohne AG-Ziele reicht ein Fakeziel
  if (!S.ziele.length && !fakeTargets.length && !extraFakeTargets.length) fehler.push("Keine AG-Ziele und keine Fakeziele (Abschnitt 3).");
  return {fehler, input: {world: W, cfg: Object.assign({}, S.cfg, {seed: S.seed}, cfgExtra || {}), attackers, agTargets, fakeTargets,
          extraFakeTargets, arrival: ank, arrivals: ankGut, windows: fw.fenster, now: Date.now()}};
}
function rechnen() {
  const {fehler, input} = kernInput();
  const res = $("res");
  if (fehler.length) {
    const ul = el("ul", "ap-list");
    fehler.forEach(f => ul.append(el("li", "warn", f)));
    res.replaceChildren(ul); ERG = null; return;
  }
  const t0 = performance.now();
  const a = K.plan(Object.assign({}, input, {cfg: Object.assign({}, input.cfg, {clean_knapp: "weniger_offs"})}));
  let b = null;
  if (a.fehler) { res.replaceChildren(el("p", "ap-warn", a.fehler)); return; }
  if (a.knapp && a.knapp.unterRichtwert > 0) b = K.plan(Object.assign({}, input, {cfg: Object.assign({}, input.cfg, {clean_knapp: "weniger_ziele"})}));
  ERG = {a, b, input, ms: Math.round(performance.now() - t0)};
  if (!b) S.wahlKnapp = null;
  zeigen();
}
const KURZ = {spear: "Speer", sword: "Schwert", axe: "Axt", archer: "Bogen", spy: "Späher", light: "LKav", marcher: "BBogen",
              heavy: "SKav", ram: "Ramme", catapult: "Kata", knight: "Paladin", snob: "AG"};
const einheiten = u => K.UNITS.filter(k => u[k] > 0).map(k => nf.format(u[k]) + " " + KURZ[k]).join(" · ");
function zeigen() {
  const res = $("res");
  if (!ERG) return;
  const {a, b} = ERG;
  const box = el("div");
  box.style.display = "grid"; box.style.gap = "12px";
  if (b && S.wahlKnapp == null) {
    const w = el("div", "ap-wahl");
    const k = S.cfg.clean_per_target;
    w.append(el("strong", null, "Zu wenige Offs für " + k + " Clean-Offs je Ziel. Wie willst du vorgehen?"));
    const opts = el("div", "opts");
    const unter = a.ziele.filter(z => z.geadelt && z.clean < k).length;
    const b1 = el("button", "tw", "Weniger Clean-Offs je Ziel: " + a.stats.geadelt + " Ziele, davon " + unter + " mit weniger als " + k + " Clean-Offs (jedes mindestens eine)");
    const b2 = el("button", "tw", "Weniger Ziele: " + b.stats.geadelt + " Ziele, alle mit " + k + " Clean-Offs; " + b.knapp.gestrichen + " Ziele fallen weg und werden Fakeziele");
    [b1, b2].forEach((x, i) => { x.type = "button"; x.addEventListener("click", () => { S.wahlKnapp = i ? "weniger_ziele" : "weniger_offs"; speichern(); zeigen(); }); });
    opts.append(b1, b2);
    w.append(opts);
    res.replaceChildren(w);
    $("calc-hint").textContent = "Auswahl nötig";
    return;
  }
  const r = b && S.wahlKnapp === "weniger_ziele" ? b : a;
  ERG.r = r;
  const verst = K.pruefePlan(r, ERG.input);
  $("calc-hint").textContent = r.stats.geadelt + " von " + r.stats.ziele + " Zielen geadelt · " + r.items.length + " Befehle · " + ERG.ms + " ms";
  // Kennzahlen
  const sum = el("div", "ap-sum");
  const anzahl = k => r.items.filter(i => i.kind === k).length;
  // Kacheln (Dennis 12.11.2026 22:00): „freie Offs“ sind gar nicht verplant; Offs auf Nicht-AG-Ziele nur, wenn eingestellt
  const zus = r.items.filter(i => i.zusatz).length;
  [["geadelt", r.stats.geadelt + " / " + r.stats.ziele], ["Clean-Offs" + (zus ? ", davon " + zus + " zusätzlich" : ""), anzahl("clean")], ["AGs", anzahl("ag")], ["Fakes", anzahl("fake")]]
    .concat(anzahl("rest") || ERG.input.cfg.rest_offs === "nicht_ag" ? [["Offs auf Nicht-AG-Ziele", anzahl("rest")]] : [])
    .concat([["freie Offs", r.freieOffs.length]]).forEach(([t, v]) => {
    const d = el("div"); d.append(el("b", null, String(v)), document.createTextNode(" " + t)); sum.append(d);
  });
  box.append(sum, bilanzBox(r));
  if (b) {
    const p = el("p", "ap-note", "Variante: " + (S.wahlKnapp === "weniger_ziele" ? "weniger Ziele, alle mit vollem Richtwert. " : "weniger Clean-Offs je Ziel. "));
    const z = el("button", "tw", "andere Variante wählen"); z.type = "button";
    z.addEventListener("click", () => { S.wahlKnapp = null; speichern(); zeigen(); });
    p.append(z); box.append(p);
  }
  if (verst.length) {
    const ul = el("ul", "ap-list");
    [...new Set(verst)].forEach(v => ul.append(el("li", "warn", "Regel verletzt: " + v)));
    box.append(ul);
  }
  if (r.warnings.length) {
    const det = el("details"), sm = el("summary", null, "Hinweise (" + r.warnings.length + ")");
    const ul = el("ul", "ap-list");
    r.warnings.forEach(w => ul.append(el("li", w.art === "reihenfolge" || w.art === "abstand" ? "warn" : "", w.text)));
    det.append(sm, ul); det.open = r.warnings.length <= 8;
    box.append(det);
  }
  box.append(sitzungenBox(r));
  const vb = el("div", "ap-vorschlag"); vb.id = "vorschlag";
  box.append(vb);
  // Ziele
  const zrows = r.ziele.map(z => {
    const d = dorf(z.x * 1000 + z.y);
    return [[koord(z.x * 1000 + z.y), "num"], [d ? spielerName(d.p) : ""], [z.geadelt ? "geadelt" : "nicht", z.geadelt ? "up" : "down"],
            [z.geadelt ? String(z.clean) + (z.zusatz ? " (davon " + z.zusatz + " zusätzlich)" : "") : "", "num", z.geadelt ? z.clean : null], [z.geadelt ? String(z.ags) : "", "num"],
            [z.geadelt ? K.fmtZeit(z.T, true) : "", "num", z.T || 0], [z.geadelt ? (z.offZuerst ? "ja" : "nein") : "", z.geadelt && !z.offZuerst ? "down" : ""],
            [z.grund || ""]];
  });
  const zsec = el("div"), zsc = el("div");
  zsc.style.overflowX = "auto";                     // am Handy waagrecht scrollen statt abschneiden
  zsc.append(table([["Ziel", "num"], ["Besitzer"], ["Ergebnis"], ["Clean-Offs", "num"], ["AGs", "num"],
    ["Erste Clean-Off kommt an", "num", true], ["Off vor AG abgeschickt"], ["Grund"]], zrows));
  zsec.append(el("h3", null, "AG-Ziele"), zsc);
  box.append(zsec);
  // Export
  const exp = el("div", "ap-exp-box");
  // Format wählbar (Dennis 09.11.2026): DS-Ultimate (JSON) oder DS Workbench (eine Zeile je Befehl)
  const HINW = {dsu: "In DS-Ultimate einen Angriffsplan für Welt 259 öffnen, „Import DS-Ultimate“, einfügen. Große Pläne teilt DS-Ultimate selbst in Blöcke zu 200 Befehlen.",
                wb: "In DS Workbench im Angriffsplaner die Tabelle des Plans öffnen, Rechtsklick „Aus Zwischenablage einfügen“ (Strg+V). DS-Ultimate liest dasselbe als WB-Import."};
  const fmt = () => S.expFmt === "wb" ? "wb" : "dsu";
  const hinweis = el("p", "ap-note ap-exp-hinweis", HINW[fmt()]), wahl = el("div", "ap-row");
  wahl.append(el("span", "ap-note", "Format:"));
  [["dsu", "DS-Ultimate"], ["wb", "DS Workbench"]].forEach(([w, t]) => {
    const l = el("label"), r0 = document.createElement("input");
    r0.type = "radio"; r0.name = "expfmt"; r0.value = w; r0.checked = w === fmt();
    r0.addEventListener("change", () => { S.expFmt = w; speichern(); hinweis.textContent = HINW[w]; });
    l.append(r0, document.createTextNode(" " + t));
    wahl.append(l);
  });
  exp.append(el("h3", null, "Export"), wahl, hinweis);
  const zeile = (wer, attId) => {
    const z = el("div", "ap-exp");
    z.append(el("span", "wer", wer));
    [["alle", "Alles"], ["angriff", "Offs und AGs"], ["fake", "Fakes"]].forEach(([art, t]) => {
      const its = K.exportAuswahl(r.items, art, attId);
      const btn = el("button", "tw", t + " (" + its.length + ")");
      btn.type = "button"; btn.disabled = !its.length;
      btn.addEventListener("click", () => kopieren(fmt() === "wb" ? K.toWB(its) : K.toDSU(its, {world: WELT, twWorld: WELT}), btn, its.length));
      z.append(btn);
    });
    return z;
  };
  exp.append(zeile("Alle Angreifer", null));
  ERG.input.attackers.forEach(at => { if (r.items.some(i => i.att === at.id)) exp.append(zeile(at.name, at.id)); });
  box.append(exp);
  // Befehle je Angreifer
  ERG.input.attackers.forEach(at => {
    const its = r.items.filter(i => i.att === at.id);
    if (!its.length) return;
    const s = r.stats.je[at.id] || {};
    const det = el("details");
    const sz = (r.sitzungen && r.sitzungen[at.id]) || [];
    det.append(el("summary", null, at.name + ": " + its.length + " Befehle, " + s.vorgaenge + " Abschickvorgänge in " + sz.length + (sz.length === 1 ? " Sitzung" : " Sitzungen") + ", von " +
      K.fmtZeit(its[0].sendMs).slice(0, 16) + " bis " + K.fmtZeit(its[its.length - 1].sendMs).slice(0, 16)));
    const rows = its.map(it => {
      const d = dorf(it.t.x * 1000 + it.t.y);
      return [[K.fmtZeit(it.sendMs, true), "num", it.sendMs], [K.fmtZeit(it.arrivalMs, true), "num", it.arrivalMs],
              [el("span", "ap-kind k-" + it.kind, K.KIND_NAME[it.kind])], [it.v.name + " (" + it.v.x + "|" + it.v.y + ")"],
              [it.t.x + "|" + it.t.y + (d ? " · " + spielerName(d.p) : ""), null], [el("span", "ap-units", einheiten(it.units))],
              [[it.ausserhalb ? "außerhalb" + (it.nachtSenden ? ", nachts" : "") : (it.nachtSenden ? "nachts" : ""), it.zuLang ? "lange Laufzeit" : "", it.zusatz ? "zusätzliche Off" : "", it.nacht ? "Ankunft im Nachtbonus" : ""].filter(Boolean).join(" · "),
               it.nacht || it.ausserhalb || it.zuLang ? "down" : ""]];
    });
    const sc = el("div", "ap-scroll");
    sc.append(table([["Abschicken", "num", true], ["Ankunft", "num", true], ["Typ"], ["Von"], ["Nach"], ["Einheiten"], [""]], rows));
    det.append(sc);
    box.append(det);
  });
  res.replaceChildren(box);
  vorschlagSuchen(r);
}
/** Abschicksitzungen je Angreifer und Hinweise zum Erweitern der Zeiträume (v0.5). */
/* Bilanz (Dennis 12.11.2026): schafft jeder Spieler seine AG-Ziele, wie viele AGs oder Offs fehlen. */
function bilanzBox(r) {
  const box = el("div", "ap-bilanz"), ul = el("ul", "ap-list");
  const zeile = (ok, text) => ul.append(el("li", ok ? "ap-gut" : "warn", (ok ? "✓ " : "✗ ") + text));
  const zname = z => { const d = dorf(z.x * 1000 + z.y); return koord(z.x * 1000 + z.y) + (d ? " (" + spielerName(d.p) + ")" : ""); };
  const nicht = r.ziele.filter(z => !z.geadelt), unter = r.ziele.filter(z => z.geadelt && z.offFehlt > 0);
  if (r.ziele.length) zeile(!nicht.length, "AG-Ziele: " + r.stats.geadelt + " von " + r.ziele.length + " geadelt");
  nicht.forEach(z => {
    const was = z.agFehlt ? "es fehlen " + z.agFehlt + (z.agFehlt === 1 ? " AG" : " AGs") + " in Reichweite" : z.offFehlt ? "es fehlt " + (z.offFehlt === 1 ? "eine Clean-Off" : z.offFehlt + " Clean-Offs") : "";
    ul.append(el("li", "warn", "   " + zname(z) + ": " + (was ? was + " · " : "") + (z.grund || "")));
  });
  if (r.ziele.some(z => z.geadelt)) {
    const fehlen = unter.reduce((n, z) => n + z.offFehlt, 0);
    zeile(!unter.length, unter.length ? "Clean-Offs: " + unter.length + (unter.length === 1 ? " Ziel" : " Ziele") + " unter dem Richtwert, es fehlen " + fehlen + (fehlen === 1 ? " Off" : " Offs") +
      " (" + unter.slice(0, 6).map(z => koord(z.x * 1000 + z.y) + ": " + (z.soll - z.offFehlt) + " statt " + z.soll).join(", ") + (unter.length > 6 ? " …" : "") + ")"
      : "Clean-Offs: alle geadelten Ziele mit vollem Richtwert");
  }
  // je Spieler: eigene (zugewiesene) Ziele, AGs und Offs
  (ERG.input.attackers || []).forEach(a => {
    const vs = a.villages || [], rol = a.rollen || {};
    const agDa = rol.ag === false ? 0 : vs.reduce((n, v) => n + (v.nobles || 0), 0);
    const agEin = r.items.filter(i => i.att === a.id && i.kind === "ag").length;
    const offEin = r.items.filter(i => i.att === a.id && (i.kind === "clean" || i.kind === "rest" || (i.kind === "ag" && i.units.ram > 0))).length;
    const offFrei = r.freieOffs.filter(o => o.att === a.id).length;
    const eigene = r.ziele.filter(z => z.assignee === a.id);
    const teile = [];
    if (eigene.length) {
      const g = eigene.filter(z => z.geadelt).length, agF = eigene.reduce((n, z) => n + (z.geadelt ? 0 : z.agFehlt || 0), 0);
      const offF = eigene.reduce((n, z) => n + (z.offFehlt || 0), 0);
      teile.push("eigene AG-Ziele " + g + " von " + eigene.length + " geadelt" + (agF ? ", es fehlen " + agF + " AGs in Reichweite" : "") + (offF ? ", es fehlen " + offF + " Clean-Offs" : ""));
    }
    if (agDa || agEin) teile.push("AGs " + agEin + " von " + agDa + " eingeplant");
    if (offEin || offFrei) teile.push("Offs " + offEin + " eingeplant" + (offFrei ? ", " + offFrei + " frei" : ""));
    if (!teile.length) return;
    const ok = !eigene.length || eigene.every(z => z.geadelt && !z.offFehlt);
    zeile(ok, (a.name || "Angreifer") + ": " + teile.join(" · ") + (a.eigeneStark ? " · eigene AG-Ziele stark" : ""));
  });
  // Freie Offs (Dennis 12.11.2026 22:00): je Spieler mit Grund; Knopf „trotzdem verteilen“ stellt die Konfig um und rechnet neu
  const modus = ERG.input.cfg.uebrige_auf_ag;
  const modusKnopf = (text, wert) => {
    const k = el("button", "tw", text); k.type = "button";
    k.addEventListener("click", () => { S.cfg.uebrige_auf_ag = wert; cfgBauen(); geaendert(true); rechnen(); $("h-calc").scrollIntoView(); });
    return k;
  };
  if (r.freieOffs.length && r.ziele.some(z => z.geadelt)) {
    const GR = {laufzeit: "nur über dem Laufzeit-Richtwert", zeitraum: "nur außerhalb der Zeiträume", beides: "nur über Laufzeit und außerhalb",
                sitzung: "nicht in bestehende Sitzungen", zeit: "zeitlich gar nicht"};
    const je = new Map();
    r.freieOffs.forEach(o => { if (!je.has(o.att)) je.set(o.att, []); je.get(o.att).push(o); });
    const name = id => { const a = (ERG.input.attackers || []).find(x => x.id === id); return a ? a.name : "Angreifer"; };
    const teile = [...je].map(([id, os]) => {
      const g = {}; os.forEach(o => { if (o.grund) g[o.grund] = (g[o.grund] || 0) + 1; });
      const gt = Object.keys(GR).filter(k => g[k]).map(k => g[k] + " " + GR[k]);
      return name(id) + " " + os.length + (gt.length ? " (" + gt.join(", ") + ")" : "");
    });
    const aus = modus === "aus" || modus === false;
    const li = el("li", null, "Freie Offs: " + r.freieOffs.length + (aus ? " (zusätzliche Offs auf AG-Ziele sind aus): " : ", passen auf kein AG-Ziel mehr: ") + teile.join(" · ") + " ");
    if (aus) li.append(modusKnopf("auf AG-Ziele verteilen", "alle"));
    else if (modus !== "erzwingen" && r.freieOffs.some(o => o.grund && o.grund !== "zeit")) li.append(modusKnopf("Freie Offs trotzdem verteilen", "erzwingen"));
    ul.append(li);
  }
  if (modus === "erzwingen") {
    const z = r.items.filter(i => i.zusatz), drauss = new Set(z.filter(i => i.ausserhalb || i.zuLang).map(i => i.att + ":" + i.aktion)).size;
    const li = el("li", null, "Freie Offs verteilt: " + z.length + " zusätzliche Offs" + (drauss ? ", davon " + drauss + " außerhalb der Zeiträume oder über dem Laufzeit-Richtwert" : "") + " ");
    li.append(modusKnopf("nur im Zeitraum verteilen", "alle"));
    ul.append(li);
  }
  if (!ul.children.length) return box;
  box.append(el("h3", null, "Bilanz"), ul);
  return box;
}
function sitzungenBox(r) {
  const d = el("div");
  d.append(el("h3", null, "Abschicksitzungen"),
    el("p", "ap-note", "Eine Sitzung sind Befehle mit höchstens 15 Minuten Pause dazwischen. Rot: Die Sitzung enthält Offs oder AGs, die außerhalb der Abschickzeiträume dieses Spielers losgehen müssen. Sie sind nötig, weil das Ziel sonst nicht geadelt würde, keine Clean-Off rechtzeitig käme oder sonst ein AG vor der Clean-Off losginge (Abschickzeiträume sind Richtwert), oder es sind zusätzliche Offs nach „Freie Offs trotzdem verteilen“. „Hinweis“: So müsste der Spieler einen Zeitraum verlängern oder früher beginnen, damit diese Befehle hineinfallen; am Plan ändert das nichts, die Zeiten bleiben gleich. Über „i“ stehen die einzelnen Befehle. „Lange Laufzeit“: über dem Laufzeit-Richtwert, nötig für dieses Ziel oder eine zusätzliche Off."));
  const hm = ms => K.fmtZeit(ms).slice(0, 5) + ". " + K.fmtZeit(ms).slice(11, 16);
  const dauer = ms => { const m = Math.round(ms / 60000); return m >= 60 ? Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0") + " min" : m + " min"; };
  let nr = 0;
  // Einzelne Befehle außerhalb (Dennis 12.11.2026): je Abschickvorgang Art, Dorf, Ziel, Abschickzeit, Abstand zum Zeitraum
  const details = (at, von, bis) => {
    const fen = K.ivNorm(at.windows && at.windows.length ? at.windows : (ERG.input.windows || []));
    const akt = new Map();
    r.items.filter(i => i.att === at.id && i.kind !== "fake" && i.ausserhalb && i.sendMs >= von && i.sendMs <= bis).forEach(i => {
      if (!akt.has(i.aktion)) akt.set(i.aktion, []); akt.get(i.aktion).push(i); });
    const ul = el("ul", "ap-list");
    [...akt.values()].sort((p, q) => p[0].sendMs - q[0].sendMs).forEach(its => {
      const i = its[0], z = dorf(i.t.x * 1000 + i.t.y);
      const art = i.kind === "ag" ? (its.length > 1 ? "AG-Train (" + its.length + " AGs" + (its.some(x => x.units.ram > 0) ? ", mit Off" : "") + ")" : "AG" + (i.units.ram > 0 ? " mit Off" : ""))
                : i.kind === "clean" ? (i.zusatz ? "zusätzliche Clean-Off" : "Clean-Off") : "Off";
      let ab = "";
      const vor = fen.find(([x]) => x > i.sendMs), nach = [...fen].reverse().find(([, y]) => y < i.sendMs);
      const dv = vor ? vor[0] - i.sendMs : Infinity, dn = nach ? i.sendMs - nach[1] : Infinity;
      if (dn <= dv && nach) ab = dauer(dn) + " nach Ende des Zeitraums (" + hm(nach[1]) + ")";
      else if (vor) ab = dauer(dv) + " vor Beginn des Zeitraums (" + hm(vor[0]) + ")";
      ul.append(el("li", null, art + " aus " + i.v.name + " (" + i.v.x + "|" + i.v.y + ") auf " + i.t.x + "|" + i.t.y + (z ? " (" + spielerName(z.p) + ")" : "") +
        ", abschicken " + K.fmtZeit(i.sendMs).slice(0, 5) + ". " + K.fmtZeit(i.sendMs).slice(11, 19) + (ab ? ", " + ab : "") + (i.zuLang ? ", lange Laufzeit" : "")));
    });
    return ul;
  };
  const mitInfo = (li, at, von, bis) => {
    const key = "aus-" + (++nr);
    const b = infoKnopf(key); b.title = "Befehle außerhalb der Abschickzeiträume";
    const h = el("div", "ap-help ap-detail"); h.dataset.help = key;
    h.append(details(at, von, bis));
    li.append(" ", b, h);
  };
  ERG.input.attackers.forEach(at => {
    const sz = (r.sitzungen && r.sitzungen[at.id]) || [];
    if (!sz.length) return;
    const ul = el("ul", "ap-list");
    sz.forEach(z => {
      const t = hm(z.von) + " bis " + K.fmtZeit(z.bis).slice(11, 16) + " · " + (z.kern ? z.kern + (z.kern === 1 ? " Off oder AG" : " Offs und AGs") : "") +
        (z.kern && z.fakes ? ", " : "") + (z.fakes ? z.fakes + (z.fakes === 1 ? " Fake" : " Fakes") : "") +
        (z.nachts ? " · nachts" : "") + (z.ausserhalb ? " · " + z.ausserhalb + " außerhalb" : "");
      const li = el("li", z.ausserhalb ? "warn" : "", t);
      if (z.ausserhalb) mitInfo(li, at, z.von, z.bis);
      ul.append(li);
    });
    (r.hinweise || []).filter(h => h.att === at.id).forEach(h => { const li = el("li", "warn", "Hinweis: " + h.text); mitInfo(li, at, h.von, h.bis); ul.append(li); });
    d.append(el("div", "ap-note", at.name + " (" + sz.length + (sz.length === 1 ? " Sitzung)" : " Sitzungen)")), ul);
  });
  return d;
}
/** Sucht gleich lange Ankunftszeiträume bis 12 h davor und danach, nie im Nachtbonus, die besser passen. Läuft in
    kleinen Schritten, damit die Seite bedienbar bleibt; eine neue Berechnung bricht die Suche ab. */
let suchLauf = 0;
function vorschlagSuchen(r) {
  const lauf = ++suchLauf, box = $("vorschlag");
  if (!box) return;
  const input = Object.assign({}, ERG.input, {cfg: Object.assign({}, ERG.input.cfg, {clean_knapp: S.wahlKnapp === "weniger_ziele" ? "weniger_ziele" : "weniger_offs"})});
  if (!input.agTargets.length || (input.arrivals || []).length > 1) { box.replaceChildren(); return; }
  const kand = K.ankunftKandidaten(input.arrival, W, {jetzt: Date.now()});
  const jetzt = K.bewerteAnkunft(input, input.arrival);
  if (!jetzt || !kand.length) return;
  const besser = [];
  let i = 0;
  box.replaceChildren(el("p", "ap-note", "Suche andere Ankunftszeiten …"));
  const schritt = () => {
    if (lauf !== suchLauf) return;
    const t0 = performance.now();
    while (i < kand.length && performance.now() - t0 < 40) {
      const b = K.bewerteAnkunft(input, kand[i]);
      if (b && K.besser(b, jetzt, input.cfg.zeit_rangfolge)) besser.push({A: kand[i], b});
      i++;
    }
    if (i < kand.length) { box.firstChild.textContent = "Suche andere Ankunftszeiten … " + i + " von " + kand.length; setTimeout(schritt, 0); return; }
    const rf = input.cfg.zeit_rangfolge;
    besser.sort((p, q) => K.besser(p.b, q.b, rf) ? -1 : K.besser(q.b, p.b, rf) ? 1 : Math.abs(p.A.from - input.arrival.from) - Math.abs(q.A.from - input.arrival.from));
    const text = b => b.geadelt + " Ziele, " + b.aussen + " außerhalb der Zeiträume" + (b.nachtAussen ? " (" + b.nachtAussen + " nachts)" : "") + ", " + b.sitzungen + " Sitzungen";
    if (!besser.length) { box.replaceChildren(el("p", "ap-note", "Keine bessere Ankunftszeit gleicher Länge bis 12 Stunden davor oder danach (ohne Nachtbonus).")); return; }
    const ul = el("ul", "ap-list");
    besser.slice(0, 3).forEach(({A, b}) => {
      const li = el("li", null, K.fmtZeit(A.from).slice(0, 16) + " bis " + K.fmtZeit(A.to).slice(11, 16) + ": " + text(b) + " ");
      const k = el("button", "tw", "übernehmen"); k.type = "button";
      k.addEventListener("click", () => {
        const v = K.fmtZeit(A.from, true).split(" "), b = K.fmtZeit(A.to, true).split(" ");
        S.ankListe[0] = S.ank = {vonDatum: v[0], vonZeit: v[1], bisDatum: A.to > A.from ? b[0] : "", bisZeit: A.to > A.from ? b[1] : ""};
        zeitFelderBauen(); geaendert(); rechnen(); $("h-calc").scrollIntoView();
      });
      li.append(k); ul.append(li);
    });
    box.replaceChildren(el("h3", null, "Andere Ankunftszeit"), el("p", "ap-note", "Jetzt (nur Offs und AGs): " + text(jetzt) + ". Besser passen:"), ul);
  };
  setTimeout(schritt, 0);
}
async function kopieren(obj, btn, n) {
  const text = typeof obj === "string" ? obj : JSON.stringify(obj);
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.append(ta); ta.select();
    try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
    ta.remove();
  }
  const m = el("span", "ap-done", ok ? " kopiert (" + n + " Befehle)" : " Kopieren nicht möglich");
  btn.after(m);
  setTimeout(() => m.remove(), 2500);
}

/* ---------- Änderungen ---------- */
let rechenTimer = 0;
function geaendert(leise) {
  speichern();
  if (!leise) { zieleBauen(); }
  zeitenBauen();
  fakesBauen();
  if (ERG) { clearTimeout(rechenTimer); $("calc-hint").textContent = "Eingaben geändert, neu berechnen"; }
}

/* ---------- Karte: Auswahl übernehmen ---------- */
function zurKarte(ziel) {
  speichern();
  try { localStorage.setItem(SPEICHER, JSON.stringify({v: 1, S})); } catch (e) { /* ohne Speicher geht die Auswahl verloren */ }
  const p = new URLSearchParams({auswahl: ziel});
  const m = String(ziel).match(/^ag:(\d+)$/);
  if (m) p.set("fuer", ANALYSE[+m[1]] && ANALYSE[+m[1]].name ? ANALYSE[+m[1]].name : "Angreifer " + (+m[1] + 1));
  const blick = kartenBlick(ziel);
  if (blick) { p.set("c", blick.c); p.set("z", blick.z); }
  location.href = "karte.html?" + p.toString();
}
/** Ausschnitt für die Karte: zuerst die schon gewählten Ziele dieser Art, sonst die Dörfer der Angreifer
    mit Rand für die AG-Reichweite. null: die Karte zeigt die ganze Welt. */
function kartenBlick(ziel) {
  const xy = k => [Math.floor(k / 1000), k % 1000];
  const m = String(ziel).match(/^ag:(\d+)$/), nur = m ? +m[1] : null;
  let pts = ziel === "fake" ? K.parseKoordListe(S.fakeText || "").keys.map(xy)
          : ziel === "fakeziel" ? S.fakeHaupt.map(xy)
          : S.ziele.filter(z => nur == null || z.assignee === nur).map(z => xy(z.xy));
  if (!pts.length && (ziel === "fake" || ziel === "fakeziel")) pts = S.ziele.map(z => xy(z.xy)).concat(S.fakeHaupt.map(xy));
  let rand = 12;
  const angreifer = alle => ANALYSE.forEach((A, i) => { if (A && (alle || nur == null || i === nur)) A.dorfer.forEach(d => pts.push([d.x, d.y])); });
  if (!pts.length) { rand = W && W.snob_max_dist ? W.snob_max_dist : 35; angreifer(false); }
  // Angreifer ohne Dörfer und Ziele: alle Ziele, sonst alle Angreifer
  if (!pts.length && nur != null) { rand = 12; pts = S.ziele.map(z => xy(z.xy)); }
  if (!pts.length && nur != null) { rand = W && W.snob_max_dist ? W.snob_max_dist : 35; angreifer(true); }
  if (!pts.length) return null;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  pts.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
  const breit = Math.max(320, innerWidth - (innerWidth > 900 ? 360 : 20)), hoch = Math.max(240, innerHeight * (innerWidth > 900 ? 1 : 0.5) - 220);
  const z = Math.max(1.5, Math.min(10, Math.min(breit / (x1 - x0 + 2 * rand), hoch / (y1 - y0 + 2 * rand))));
  return {c: Math.round((x0 + x1) / 2) + "|" + Math.round((y0 + y1) / 2), z: z.toFixed(2)};
}
function auswahlUebernehmen() {
  let a = null;
  try { a = JSON.parse(localStorage.getItem(AUSWAHL) || "null"); localStorage.removeItem(AUSWAHL); } catch (e) { a = null; }
  if (!a || !Array.isArray(a.keys) || Date.now() - (a.t || 0) > 3 * 3600000) return;
  if (a.ziel === "fake") {
    const vorhanden = K.parseKoordListe(S.fakeText).keys, set = new Set(vorhanden);
    const neu = a.keys.filter(k => !set.has(k));
    S.fakeText = (S.fakeText.trim() ? S.fakeText.trim() + "\n" : "") + neu.map(koord).join("\n");
    $("fake-text").value = S.fakeText;
    $("fake-text-note").textContent = "Von der Karte: " + neu.length + " Dörfer übernommen";
    geaendert();
    $("h-fake").scrollIntoView();
  } else if (a.ziel === "fakeziel") {
    $("ziel-text-note").textContent = zieleHinzu(a.keys, "Von der Karte", "fake");
    $("h-ziel").scrollIntoView();
  } else {
    const m = String(a.ziel).match(/^ag(?::(\d+))?$/);
    if (!m) return;
    $("ziel-text-note").textContent = zieleHinzu(a.keys, "Von der Karte", "ag");
    // Für einen Angreifer gewählt: alle gewählten Ziele gehören ihm, auch die schon vorhandenen
    if (m[1] != null && +m[1] < S.atts.length) {
      const ks = new Set(a.keys);
      S.ziele.forEach(z => { if (ks.has(z.xy)) z.assignee = +m[1]; });
      S.zmodus = "je";
    }
    geaendert();
    $("h-ziel").scrollIntoView();
  }
}

/* ---------- Start ---------- */
(async function () {
  laden();
  hilfeAnwenden();
  cfgBauen();
  zeitFelderBauen();
  $("fake-text").value = S.fakeText;
  $("res").replaceChildren(el("p", "empty", "Lade Weltdaten …"));
  const lade = n => loadData(n).catch(() => null);
  const [players, villages, ids, units, angriff, allies, moral] =
    await Promise.all(["players", "villages", "dorf_ids", "units", "angriff", "allies", "moral"].map(lade));
  if (!players || !villages) { $("res").replaceChildren(el("p", "ap-warn", "Weltdaten nicht verfügbar.")); return; }
  P = players; V = villages;
  pIdx = Object.fromEntries(P.fields.map((f, i) => [f, i]));
  V.rows.forEach((r, i) => {
    byXY.set(r[0], i);
    if (r[1] >= 0) { if (!dorfVon.has(r[1])) dorfVon.set(r[1], []); dorfVon.get(r[1]).push(i); }
  });
  IDS = ids && ids.ids && ids.ids.length === V.rows.length ? ids.ids : null;
  window._units = units ? units.units : null;
  W = K.makeWorld(units, angriff);
  if (angriff && angriff.world) WELT = angriff.world;
  if (allies) allies.rows.forEach(r => ALLY.set(r[0], r[2]));
  JOIN = moral && moral.join_days ? moral.join_days : null;
  const dl = $("spieler-liste");
  P.rows.slice().sort((a, b) => b[pIdx.points] - a[pIdx.points]).slice(0, 3000).forEach(r => { const o = el("option"); o.value = r[pIdx.name]; dl.append(o); });
  attsBauen();
  auswahlUebernehmen();
  zieleBauen(); zeitenBauen(); fakesBauen();
  $("res").replaceChildren(el("p", "empty", IDS ? "Noch nicht berechnet." : "Dorf-IDs fehlen, Export nicht möglich."));
})();

$("zusatz-sperren").addEventListener("click", () => { zusatzSperren(); location.href = "./"; });
$("help-all").addEventListener("click", () => { S.hilfe = !S.hilfe; hilfeAnwenden(); speichern(); });
$("cfg-reset").addEventListener("click", () => { S.cfg = Object.assign({}, K.CFG_DEFAULT); cfgBauen(); geaendert(); });
$("att-add").addEventListener("click", () => { S.atts.push(neuerAngreifer()); attsBauen(); geaendert(true); });
$("ziel-spieler-add").addEventListener("click", () => {
  const name = $("ziel-spieler").value.trim().toLowerCase();
  if (!name || !P) return;
  const p = P.rows.findIndex(r => String(r[pIdx.name]).toLowerCase() === name);
  if (p < 0) { $("ziel-text-note").textContent = "Spieler nicht gefunden: " + $("ziel-spieler").value; return; }
  $("ziel-text-note").textContent = zieleHinzu((dorfVon.get(p) || []).map(i => V.rows[i][0]), spielerName(p), S.zart);
  $("ziel-spieler").value = "";
});
$("ziel-text-add").addEventListener("click", () => {
  const r = K.parseKoordListe($("ziel-text").value);
  $("ziel-text-note").textContent = zieleHinzu(r.keys, "Liste", S.zart);
  $("ziel-text").value = "";
});
$("ziel-leer").addEventListener("click", () => { S.ziele = []; geaendert(); });
$("fakeziel-leer").addEventListener("click", () => { S.fakeHaupt = []; geaendert(); });
$("ziel-karte").addEventListener("click", () => zurKarte(S.zart === "fake" ? "fakeziel" : "ag"));
document.querySelectorAll('input[name="zart"]').forEach(r => r.addEventListener("change", () => { S.zart = r.value; geaendert(); }));
$("fake-karte").addEventListener("click", () => zurKarte("fake"));
document.querySelectorAll('input[name="zmodus"]').forEach(r => r.addEventListener("change", () => { S.zmodus = r.value; geaendert(); }));
$("fake-text").addEventListener("input", () => { S.fakeText = $("fake-text").value; geaendert(true); });
$("calc").addEventListener("click", () => { S.wahlKnapp = null; rechnen(); });
$("reroll").addEventListener("click", () => { S.seed = (S.seed % 100000) + 1; S.wahlKnapp = null; speichern(); rechnen(); });
document.querySelectorAll(".ap-help[data-help]").forEach(h => { if (!h.textContent) h.textContent = INFO[h.dataset.help] || ""; });
