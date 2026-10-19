# Funktionsstand und bekannte Grenzen

Stand: erste lokale Umsetzung, kein produktives System.

## Umgesetzt

Das MVP umfasst Authentifizierung und Rollen, Dashboard, Mitarbeiterverzeichnis und Profilpflege, Dienstplan mit Schichterstellung/-änderung und Veröffentlichung, Abwesenheitsanträge mit Prüfung und Genehmigung. Zusätzlich sind Zeiterfassung, unabhängige Korrekturgenehmigungen, Verfügbarkeit, Schichtübernahmen, Benachrichtigungen, Plan-Ist-Berichte und ein deterministischer Planungsassistent vorhanden. Alle Daten stammen aus der Datenbank. Ein gescheiterter Speichervorgang wird nicht als Erfolg angezeigt.

## Noch offen aus dem ursprünglichen Briefing

- Drag-and-drop, Serien, Mehrfachzuweisung und gespeicherte Dienstplanvorlagen.
- Offene, noch nicht einer Person zugewiesene Schichten.
- Gegenseitiger Tausch zweier Schichten. Aktuell wird eine Schicht von A an B übergeben.
- Freitext-KI-Anbindung; aktuell strukturierter, deterministischer Wochenplaner. Bestehende Schichten werden nicht automatisch verschoben. Ungedeckte Positionen werden gemeldet.
- Zeitintervallgenaue Bedarfsplanung und Pausenabdeckung. Die Tagesbesetzung zählt Personen mit Schicht, nicht gleichzeitige Präsenz im gesamten Öffnungszeitraum. Der Assistent zählt vorhandene Schichten nur, wenn sie das angefragte Zeitfenster abdecken; deren Pausen werden nicht auf Intervalle verteilt.
- Nachtschichten und reguläre geteilte Schichten. Geplante Schichten liegen an einem Kalendertag; Ruhezeitprüfungen sind bewusst konservativ. Tatsächliche Buchungen dürfen bis zu 24 Stunden dauern.
- Versionierte Arbeitszeitmodelle mit Gültigkeitsdatum, periodenbezogene Sollzeit einschließlich bezahlter Abwesenheit, geprüfte Überstundenkonten. Die aktuelle „Zeitabweichung“ ist ein Plan-Ist-Vergleich über gespeicherte Daten, kein lohnrelevantes Zeitkonto.
- Urlaubsansprüche nach Kalenderjahr, Übertragsverfall, Ein-/Austritt und anteilige Ansprüche. Aktuell werden Jahreskontingent und Übertrag aus dem aktuellen Profil je abgefragtem Jahr verwendet. Ein Antrag darf kein Jahr überschreiten. Halbe Tage werden konservativ als ganztägige Planungssperre behandelt.
- Andere Bundesländer als Hessen und ein Editor für Sonderfeiertage. Das Feiertagsmodell enthält die regulären hessischen Feiertage; tarifliche freie Tage sind noch nicht modelliert.
- Urlaubsstorno nach Genehmigung. Aktuell können Mitarbeiter nur offene Anträge zurückziehen; eine genehmigte Abwesenheit kann noch nicht über die UI zurückgenommen werden.
- Verwaltungsoberflächen für Teams, Organisationseinheiten, Logo, neue Konten, Deaktivierung, Passwortreset und Genehmigungsketten. Neue Benutzer werden bislang über CLI angelegt.
- E-Mail, Push, automatische Erinnerung vor Schichten, Unternehmensmitteilungen, freiwillige Geburtstage und anpassbare Dashboard-Kacheln.
- PostgreSQL und versionierte Migrationen, SSO/MFA, Passwortwechsel-/Resetprozess, horizontale Skalierung, große Datensätze und Pagination. Lesesnapshots laden aktuell den lokalen Datenbestand und filtern serverseitig.
- Vollständige Barrierefreiheitsabnahme, iPhone/PWA-Abnahme und Ende-zu-Ende-Tests im Browser.

## Prüfergebnis

`docs/ACCEPTANCE.md` enthält die manuelle Testfolge. Die automatisierten Tests und der Produktionsbuild sind separat ausführbar. Ein Build ersetzt keine fachliche Betriebsfreigabe.
