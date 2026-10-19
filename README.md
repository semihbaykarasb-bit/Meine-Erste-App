# AMOR WORKFORCE

Eine deutsche Dienstplan- und Personalmanagement-App mit Next.js, TypeScript, persistenter SQLite-Datenbank und serverseitiger Rollenprüfung. Schwarz, Champagnergold, helle und dunkle Ansicht, responsive Navigation und installierbare PWA.

**Stand: lokales MVP mit Erweiterungen. Nicht produktiv bereitgestellt.** Sämtliche Seed-Daten sind fiktiv. Die App startet ohne Demo-Seed mit einer leeren Datenbank und erlaubt keine öffentliche Registrierung.

## Lokal starten

Voraussetzungen: Node.js **24 oder neuer**, npm und ein beschreibbares lokales Datenverzeichnis. `node:sqlite` ist eine experimentelle Node-API; es wird kein externer Datenbankserver benötigt.

```bash
npm ci
cp .env.example .env.local
```

In `.env.local` ein eigenes starkes Passwort als `DEMO_PASSWORD` setzen (mindestens 12, höchstens 72 Bytes). Keinen echten Unternehmenszugang verwenden. Der Wert wird nur beim Seed gelesen. Anschließend:

```bash
npm run seed
npm run dev
```

Öffne **http://localhost:3000**. Der Server bindet standardmäßig nur an Loopback. `APP_ORIGIN` muss exakt zur Browseradresse einschließlich Port passen. Für `127.0.0.1` entsprechend ändern. `npm run seed` verweigert die Ausführung, wenn bereits Benutzer existieren, und überschreibt keine Daten. Nach dem Seed kann `DEMO_PASSWORD` aus `.env.local` entfernt werden.

### Demo-Anmeldung

Alle Konten verwenden das selbst gewählte Seed-Passwort. Es gibt keine eingebauten Passwörter und keinen öffentlichen Demo-Login.

| Rolle          | E-Mail                | Sichtbereich                                              |
| -------------- | --------------------- | --------------------------------------------------------- |
| Administration | demo1@example.invalid | Alle vier Teams und Systemeinstellungen                   |
| HR             | demo2@example.invalid | Alle Teams und Personalverwaltung, keine Rolleneskalation |
| Teamleitung    | demo6@example.invalid | Team Retail                                               |
| Mitarbeiter    | demo7@example.invalid | Veröffentlichter Teamplan, eigene Buchungen und Anträge   |

Die 20 Konten umfassen vier Teams mit Vollzeit und Teilzeit. Ausgehend vom Seed-Datum werden Pläne für die vorige, aktuelle und nächste Woche sowie nachvollziehbare Zeitbuchungen erzeugt. Die nächste Woche ist zunächst ein Entwurf.

### Ohne Demo-Daten

In einer frischen Datenbank ein Konto über die geschützte Kommandozeile anlegen. `NEW_USER_PASSWORD` vorher in `.env.local` setzen, anschließend entfernen:

```bash
npm run create-user -- admin@example.org "Administration" admin 1
```

Das erste Team wird bei Bedarf angelegt. Weitere Konten können analog mit den Rollen `employee`, `lead`, `hr` oder `admin` und einer existierenden Team-ID angelegt werden. Benutzeranlage ist bewusst kein öffentlich zugänglicher HTTP-Endpunkt.

## Enthaltene Funktionen

| Modul              | Implementierter Umfang                                                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anmeldung          | bcrypt mit Kostenfaktor 12, zufällige Sitzungen, nur Token-Hashes in der Datenbank, 8 Stunden Laufzeit, Abmeldung, Login-Sperre nach fünf Fehlversuchen                                                   |
| Rollen             | Serverprüfung jeder Aktion, Teamgrenzen, sensible Felder für Kollegen ausgeblendet, keine Selbstgenehmigung oder HR-Rolleneskalation                                                                      |
| Dashboard          | Berechnete Kennzahlen, nächste veröffentlichte Schicht, Wochenübersicht, Tagesbesetzung, offene Anträge, Start der Zeiterfassung                                                                          |
| Dienstplan         | Tages-, Wochen- und Monatsraster, Team- und Mitarbeiterfilter, Schichten anlegen, bearbeiten, kopieren und absagen, Notizen, Pausen, Qualifikationen                                                      |
| Veröffentlichung   | Separat bestätigter Vorgang, erneute Prüfung aller Entwürfe, atomare Transaktion, Benachrichtigungen; Entwürfe bleiben für Mitarbeiter unsichtbar                                                         |
| Konflikte          | Überschneidung, Abwesenheit, Nichtverfügbarkeit, Qualifikation, tägliche und wöchentliche Obergrenzen, Mindestpause, Ruhezeit                                                                             |
| Abwesenheiten      | Beantragen, halbe Tage, persönliche Arbeitstage, hessische Feiertage, Kontingent inklusive Übertrag, Reservierung offener Anträge, Rücknahme, Genehmigung oder begründete Ablehnung                       |
| Zeiterfassung      | Start, Pause, Fortsetzen, Ende, manuelle Nachträge, Überschneidungsprüfung, Korrekturantrag mit unabhängiger Freigabe und Änderungsprotokoll                                                              |
| Schichtübernahme   | Abgabe einer eigenen Schicht an einen Kollegen, dessen Annahme, unabhängige Freigabe, erneute Konfliktprüfung und Benachrichtigung                                                                        |
| Verfügbarkeit      | Datum mit verfügbar/nicht verfügbar und Notiz, Schutz gegen Widerspruch zu vorhandenen Schichten                                                                                                          |
| Mitarbeiter        | Verzeichnis und Suche, HR bearbeitet Profile, Team, Vertragsstunden, Arbeitstage, Qualifikationen und Urlaubskontingente; Rollen nur durch Administration                                                 |
| Planungsassistent  | Deterministische Planung Montag bis Freitag, gewünschte Besetzung und Zeiten, berücksichtigt Vertragsstunden, Feiertage, Qualifikationen, Verfügbarkeiten und Konflikte; erstellt ausschließlich Entwürfe |
| Auswertungen       | Berechneter Plan-Ist-Vergleich für 7/30 Tage, anklickbare Tagesbalken, Tabelle, rollenbeschränkter CSV-Export mit Formelschutz und Druckansicht                                                           |
| Benachrichtigungen | Persistente In-App-Mitteilungen, ungelesener Status und „als gelesen markieren“                                                                                                                           |
| Gestaltung         | Responsiv, mobile Bottom-Navigation, Tastaturfokus, native modale Dialoge, Light/Dark Mode, Reduced Motion, PWA-Manifest und App-Icons                                                                    |

## Architektur und bewusste Abweichungen

- **Next.js App Router + React + TypeScript**, serverseitige API-Routen, Zod-Validierung, Lucide-Icons. Striktes TypeScript.
- **SQLite statt PostgreSQL/Prisma** ermöglicht einen vollständig lokalen Start ohne Dienstkonto. SQL-Abfragen sind parametrisiert, Schreibabläufe transaktional, Beziehungen durch Foreign Keys geschützt. Die Datenzugriffe sind in `lib/` getrennt. PostgreSQL/Prisma bleibt eine spätere Migration für den Unternehmensbetrieb.
- **bcryptjs und Datenbank-Sitzungen** statt eines externen Identity-Providers. Kein JWT mit Rollen im Browser, kein Login über einen Rollenschalter. Vor dem Betrieb im Unternehmen ist SSO/MFA ein eigener Integrationsschritt.
- **Eigenes CSS und native Formulare/Dialoge** statt Tailwind, shadcn und React Hook Form. Das hält diese lokale Version schlank und ohne UI-Framework-Overhead. Browservalidierung wird serverseitig durch Zod und Fachprüfungen ergänzt.
- Der Planungsassistent verwendet strukturierte Eingabefelder. Eine freie KI-Texteingabe ist noch nicht integriert. Die Planungslogik ist getrennt von der UI und veröffentlicht selbst nichts.
- Es wurden keine Sites-Ressourcen erstellt und keine Deployment-Werkzeuge ausgeführt. Diese Anwendung benötigt einen dauerhaft laufenden Node-Prozess und einen persistenten Datenträger; sie ist kein statischer Export und kein Cloudflare-Worker-Projekt.

```text
app/                        Next.js Layout, Seite und API-Routen
components/workforce.tsx    Oberfläche und Formulare
app/globals.css            Designsystem, mobile Ansichten und Druck
lib/db.ts                  Datenbankschema, Transaktionen und Audit
lib/auth.ts                Anmeldung, Sitzungen und Berechtigungen
lib/actions.ts             Validierte Schreibabläufe
lib/scheduling.ts          Konfliktprüfung und Urlaubskonten
lib/calendar.ts            Berlin-Zeit, Feiertage und Arbeitstage
lib/snapshot.ts            Rollenabhängige Leseansichten
scripts/                   Sicherer lokaler Seed und Benutzeranlage
tests/                     Integrations- und Fachtests
docs/                      Architektur, Grenzen und Abnahme
```

## Prüfung

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Die Tests verwenden isolierte temporäre SQLite-Datenbanken und zufällige Testpasswörter. Sie prüfen insbesondere Teamgrenzen, versteckte Entwürfe, Datenminimierung, Sitzungsschutz, CSRF, Konflikte, atomare Freigaben, Urlaubsreservierung, Feiertage, Zeitkorrekturen, Übernahmen und Protokollierung. GitHub Actions führt dieselben Prüfungen aus. Es werden keine echten Personaldaten oder Testdatenbanken eingecheckt.

Eine visuelle Prüfung im Browser und auf einem echten iPhone wurde in der Erstellungsumgebung nicht durchgeführt. Ein erfolgreicher Build ist kein Nachweis für diese visuellen und gerätespezifischen Prüfungen. Die manuelle Abnahme steht in [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md).

## Speicherung und Bereitstellung

`DATABASE_PATH` zeigt auf die SQLite-Datei, standardmäßig `./data/workforce.sqlite`. Die Daten bleiben bei Neustarts erhalten. SQLite erzeugt zusätzlich WAL-Dateien. Für Backups die SQLite Backup API verwenden oder den Prozess vor einem konsistenten Dateibackup stoppen. Verzeichnis und Backups benötigen restriktive Dateirechte und Verschlüsselung auf dem Datenträger.

Ein späteres Self-Hosting benötigt Node 24+, `npm ci`, `npm run build`, `npm start`, einen Reverse Proxy mit **HTTPS**, einen geschützten persistenten Datenträger und `APP_ORIGIN=https://deine-interne-domain`. Produktionscookies sind `Secure`, `HttpOnly` und `SameSite=Lax`; Anmeldung über unverschlüsseltes HTTP ist in Produktion absichtlich nicht nutzbar. Nur **ein** schreibender App-Prozess pro SQLite-Datei ist vorgesehen, kein ephemeres Serverless-Dateisystem. Die App lauscht auf Loopback, bis bewusst anders konfiguriert wird.

Die PWA kann auf HTTPS oder localhost zum Home-Bildschirm hinzugefügt werden. Sie bietet **keinen Offline-Zugriff** auf Personaldaten. Der Service Worker speichert keine Seiten, API-Antworten oder Zugangsdaten. Installation und iOS-Verhalten sind noch am Zielgerät zu prüfen.

Es ist keine Veröffentlichung erfolgt. Fachliche und rechtliche Freigaben sowie deine ausdrückliche Zustimmung bleiben vor einer produktiven Bereitstellung erforderlich.

## Offene Ausbauschritte

Siehe [docs/STATUS.md](docs/STATUS.md) für die ehrliche Abgrenzung des MVP: unter anderem Drag-and-drop, Schichtserien und Vorlagen, gegenseitiger Zwei-Schicht-Tausch, echte KI, zeitgenaue Bedarfsplanung, periodisierte Urlaubsansprüche, weitere Bundesländer, SSO und betriebliche Datenschutzprozesse sind noch offen.
