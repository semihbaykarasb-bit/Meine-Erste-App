# Sicherheit und Betrieb

## Implementierte Schutzmaßnahmen

- Keine Selbstregistrierung, keine öffentlich eingebauten Zugangsdaten. Passwort-Hashes mit bcrypt, Kostenfaktor 12, Eingabegrenze gegen bcrypt-Trunkierung.
- Kryptografisch zufällige 256-Bit-Sitzungen; gespeichert wird nur SHA-256 des Tokens. Feste Laufzeit von acht Stunden, Ablauf und Aktivstatus werden bei jedem Request geprüft. Abmeldung löscht die Sitzung.
- HttpOnly-/SameSite-Cookies; Secure in Produktion. Keine Tokens in localStorage. localStorage enthält lediglich das gewählte Farbschema.
- Schreibende Browseranfragen benötigen eine exakt passende Origin. `APP_ORIGIN` ist in Produktion verpflichtend. JSON-Eingaben sind größenbeschränkt und mit Zod validiert. Nicht authentifizierte Lesezugriffe erhalten HTTP 401. Datenantworten sind nicht cachebar.
- Rollen und Teamgrenzen werden aus der Datenbank ermittelt, keine vom Browser übermittelten Rollen werden als Zugriffsberechtigung akzeptiert. HR kann keine privilegierten Konten oder Rollen verändern. Eigene Genehmigungen und Freigaben beteiligter Schichtübernehmer sind blockiert.
- Mitarbeiter sehen nur veröffentlichte Pläne und eigene sensible Antrags-/Zeitdaten. Die Teamliste für Mitarbeiter lässt Kollegen-Kontingente, Vertragsstunden, Personalnummern und Qualifikationen weg.
- Parametrisierte SQL-Abfragen, Fremdschlüssel, atomare Transaktionen und Versionsprüfung gegen überholte Änderungen. Ein partiell fehlerhafter Veröffentlichungsablauf wird vollständig zurückgerollt.
- Append-only-Audit-Tabelle mit SQLite-Triggern. Zeitkorrekturen behalten Vorher-/Nachherwerte und verantwortlichen Akteur. Kein Audit-Endpunkt für normale Mitarbeiter.
- CSV-Felder sind gequotet und gegen gängige Formelpräfixe geschützt. React maskiert Nutzereingaben in der Oberfläche. Keine extern geladenen Fonts, Tracker oder Bildressourcen.
- Sicherheitsheader einschließlich CSP, Frame-Sperre, Referrer-Policy, MIME-Schutz. Die CSP erlaubt noch Inline-Skripte für Next.js; Nonce-basierte Härtung bleibt ein Produktionsschritt.

## Grenzen

Das Audit ist gegen reguläre Anwendungsänderungen geschützt, **nicht** gegen Administratoren mit direktem Dateisystem-/Datenbankzugriff. „Revisionssicher“ im rechtlichen Sinn wird nicht zugesichert. Dafür sind externe unveränderliche Speicherung, Rollen für Betrieb, Monitoring und definierte Aufbewahrung erforderlich.

Die Login-Sperre ist kontobezogen. Zusätzliche IP-/Proxy-Rate-Limits, HTTPS/HSTS am Proxy, MFA, Monitoring, verteilte Drosselung und Schutz gegen absichtliche Kontosperrung müssen vor öffentlicher Exposition ergänzt werden. Das MVP ist für lokalen Test vorgesehen.

Es existiert noch keine automatisierte Lösch-/Aufbewahrungsverwaltung. Vor echtem Einsatz: Datenkategorien und Rechtsgrundlage festlegen, Freigabe von HR/Datenschutz und gegebenenfalls Betriebsrat einholen, Fristen und Löschjobs implementieren, Rechtekonzept prüfen, Backups und Wiederherstellung testen. Notizen sollen keine Gesundheitsdaten enthalten. Verschlüsselung at rest ist Aufgabe des Hostings, nicht Bestandteil von SQLite hier.

Die konfigurierten Zeitgrenzen bilden nur einen Teil arbeitsrechtlicher Anforderungen ab. Durchschnittszeiträume, Sonn-/Feiertagsarbeit, Tarif-/Betriebsvereinbarungen, Minderjährige, Bereitschaftsdienst und Sonderfälle sind noch nicht rechtlich modelliert. Keine Zusage gesetzeskonformer Einsatzplanung. Die Ist-Erfassung blockiert tatsächliche Verstöße nicht, damit reale Zeiten vollständig erfasst bleiben.

Keine echten Personaldaten ohne Freigabe und abgeschlossene Betriebsprüfung verwenden. Umgebungsdateien, Datenbankdateien, WAL und Backups bleiben außerhalb des Git-Repositories.

## Fachliche Quellen

Für die Standardwerte und den Feiertagskalender wurden am 19.10.2026 folgende amtliche Quellen geprüft:

- [§ 3 ArbZG](https://www.gesetze-im-internet.de/arbzg/__3.html): werktägliche Regelarbeitszeit und Verlängerung nur mit Ausgleich. Der Ausgleichszeitraum ist im MVP noch nicht abgebildet.
- [§ 4 ArbZG](https://www.gesetze-im-internet.de/arbzg/__4.html): Mindestpausen bei mehr als sechs bzw. neun Stunden. Das MVP prüft die Gesamtdauer der Pause; deren Lage innerhalb der Schicht wird noch nicht geplant.
- [Hessisches Innenministerium: gesetzliche Feiertage](https://innen.hessen.de/buerger-staat/feiertage): Abgleich des gesamten Feiertagskalenders für 2026, einschließlich Fronleichnam am 04.06.2026.

Die amtliche Einzelansicht zu § 5 ArbZG war beim Abruf nicht erreichbar. Die hinterlegte Standardruhezeit von elf Stunden ist vor dem betrieblichen Einsatz zusätzlich fachlich zu prüfen. Keine dieser Quellen ersetzt die Prüfung des konkreten Betriebsmodells.
