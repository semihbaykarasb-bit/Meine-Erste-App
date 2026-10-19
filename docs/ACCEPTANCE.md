# Abnahme der lokalen Version

## Automatisiert

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Die Tests starten keine Server und verwenden temporäre Datenbanken. Sie prüfen Geschäftsabläufe und API-Routen direkt. Es wurden 25 Tests implementiert; zusätzliche Tests werden bei neuen Anforderungen ergänzt.

## Manuell im Browser noch durchzuführen

1. Eigenes `DEMO_PASSWORD` setzen, Seed starten und mit `demo7@example.invalid` anmelden. Dashboard und Navigation prüfen.
2. In der Dienstplanansicht aktuelle Woche ansehen. Die kommende Woche darf für Mitarbeiter keine Entwürfe zeigen. Tages-/Wochen-/Monatsansicht und Mitarbeiterfilter prüfen.
3. Als `demo6@example.invalid` anmelden, einen freien zukünftigen Tag wählen, Schicht für Retail anlegen und danach veröffentlichen. Mit Mitarbeiterkonto Sichtbarkeit prüfen. Ein zweiter überlappender Versuch muss eine Fehlermeldung zeigen.
4. Als Mitarbeiter Urlaub in einer späteren Woche ohne Plan beantragen. Als Teamleitung prüfen und genehmigen. Urlaubskonto und Benachrichtigung kontrollieren. Eigenen Antrag darf die Teamleitung nicht selbst genehmigen.
5. Arbeit starten, Pause starten, fortsetzen, beenden. Erneut laden und Persistenz prüfen. Einen vergangenen freien Tag nachtragen und eine Korrektur beantragen. Als Teamleitung Korrektur genehmigen, danach neue Zeit prüfen.
6. Für die Demo-Anfrage von Demo4 an Demo5 mit `demo5@example.invalid` annehmen. Anschließend mit dem Admin-Konto freigeben und den geänderten Plan prüfen. Das eigene Konto darf keinen beteiligten Vorgang freigeben.
7. In Auswertungen die Tagesbalken auswählen, Zeitraum wechseln, CSV exportieren und drucken. Plan und Ist müssen getrennt bleiben.
8. Als Admin Einstellungen ändern. Als Mitarbeiter direkter Versuch derselben API-Aktion muss mit 403 scheitern. HR darf keine Adminrolle vergeben.
9. Bei 375 px und 390 px Breite sowie Desktop: Navigation, Kalender-Scrollen, Dialoge, Touch-Flächen, Schrift und Light/Dark Mode prüfen. Nur mit Tastatur navigieren und Fokus in Dialogen kontrollieren.
10. Auf einem echten iPhone mit HTTPS bzw. lokalem Testzugang Home-Bildschirm-Installation, Icon, sichere Cookies und Wiedereinstieg prüfen. Offline dürfen keine Personaldaten neu geladen werden.
11. App stoppen und neu starten. Erfasste Änderungen müssen erhalten bleiben. Backup und Wiederherstellung getrennt testen.

## Verifikationsgrenze

Build, TypeScript und automatisierte Tests können hier ausgeführt werden. Es steht keine unterstützte Browserautomatisierung für visuelle QA zur Verfügung. Die obigen manuellen Punkte sind daher noch keine bestätigten Testergebnisse.
