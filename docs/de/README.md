![Logo](media/tr-064.png)

# IoBroker.tr-064
### Die Info
Dieser Adapter liest wichtige Informationen aus der AVM Fritz!Box, wie Anrufliste oder Anzahl der Nachrichten auf dem Anrufbeantworter.
Basierend auf diesem [AVM Dokumentationen](https://avm.de/service/schnittstellen/)

### Einfache Zustände und Funktionen
- WLAN für 2,4 GHz und 5 GHz ein-/ausschalten,
- WLAN für Gäste ein-/ausschalten,
- Fritz!Box neu starten,
- WPS-Prozess starten,
- Internet erneut verbinden
- externe IP-Adresse

### Klingeln (eine Nummer wählen)
- Wenn Sie eine interne Nummer (wie **610) verwenden, lässt der Klingelstatus das interne Telefon klingeln.

zB: **610[,timeout]

- Wenn Sie eine externe Nummer verwenden, werden Sie über den Klingelzustand mit der externen Nummer verbunden.

Die FritzBox ruft die externe Nummer an und Ihr Standardtelefon klingelt, wenn der Anruf entgegengenommen wird.
Das Standardtelefon kann in der FritzBox unter: Telefonie/Anrufe/[Tab]Wahlhilfe/Wählhilfe verwenden konfiguriert werden.

### ToPauseState
- Werte: Klingeln, Verbinden, Ende
- Kann verwendet werden, um einen Videoplayer bei einem eingehenden Anruf (Klingeln) oder beim Abheben des Telefons (Verbinden) anzuhalten.
- Die Wiederaufnahme kann auf der Grundlage des Endwerts erfolgen.

### Präsenz
Sie können eine Liste der abzuhörenden Geräte konfigurieren.
Kann durch mDNS ausgelöst werden. Bei Verwendung von MDNS ist kein Polling erforderlich und es ist schneller

### AB – Anrufbeantworter
Kann ein-/ausgeschaltet werden.
Der Status cbIndex kann auf die Adresse des Anrufbeantworters gesetzt werden.

### Anrufmonitor
Der Callmonitor erstellt Echtzeitzustände für jeden eingehenden und ausgehenden Anruf.
Wenn das Telefonbuch aktiviert ist (Standard), werden Nummern in Namen aufgelöst. Es gibt auch einen Zustand, der ein klingelndes Telefon anzeigt.

### Telefonbuch
- Wenn das Telefonbuch aktiviert ist, wird es verwendet, um den Namen und die Telefonnummer des Anrufers abzurufen.
- Weiterhin gibt es drei Zustände um eine Nummer oder einen Namen aufzulösen. Falls verfügbar wird auch die Bild-URL des Kontakts angezeigt.

Beispiel: Wenn Sie den Status „phonebook.number“ festlegen, werden alle 3 Status, Name, Nummer und Bild für den gefundenen Kontakt festgelegt. Beachten Sie, dass bei der Suche nach Namen zuerst der vollständige Name verglichen wird. Wenn dieser nicht gefunden wird, wird ein Teil davon verwendet.

### Anruflisten
Ausgabeformate:

- json
- html

Anruflisten sind:

- alle Anrufe
- verpasste Anrufe
- eingehende Anrufe
- ausgehende Anrufe

Anrufzähler: Der Anrufzähler kann auf 0 gesetzt werden. Beim nächsten Anruf wird er um 1 erhöht.

Die HTML-Ausgabe kann über eine Vorlage konfiguriert werden

### Befehl & Befehlsergebnisstatus
Mit dem Befehl state können Sie von diesem [Dokumentation](https://avm.de/service/schnittstellen/) aus jeden tr-064-Befehl aufrufen.
z.B.

```
command = {
    "service": "urn:dslforum-org:service:WLANConfiguration:1",
    "action": "X_AVM-DE_SetWPSConfig",
    "params": {
        "NewX_AVM-DE_WPSMode": "pbc",
        "NewX_AVM-DE_WPSClientPIN": ""
    }
};
```

Der Befehlsstatus sollte auf ein JSON der obigen Zeilen gesetzt werden. Also { ... } (ohne command = und Zeilenumbrüche). Der Rückruf des Aufrufs setzt den Befehlsstatus „commandResult“.

### Anrufmonitor aktivieren
Um die Anrufüberwachungsfunktion nutzen zu können, muss sie zunächst in der AVM Fritz!Box aktiviert werden.
Um die Anrufüberwachung zu aktivieren, wählen Sie ```#96*5*``` und der TCP/IP-Port 1012 wird geöffnet. Um den Port zu schließen, wählen Sie ```#96*4*```.

### Vorabversionen
Vorabversionen sind bei npm mit dem Tag dev verfügbar.
Sie können sie aus dem ioBroker-Stammverzeichnis mit folgendem Befehl installieren:

```
npm install iobroker.tr-064@dev
iobroker upload tr-064
```

## Info

Dieser Adapter liest wichtige Informationen von der AVM Fritz!Box aus, wie z. B. die Anrufliste oder die Anzahl der Nachrichten auf dem Anrufbeantworter. Basierend auf dieser [Fritz!Box-Dokumentation.](https://fritz.com/pages/schnittstellen/)


## Erforderliche Einstellungen in Ihrer Fritzbox:

- Sie müssen die Anmeldemethode auf „Benutzername und Passwort verwenden“ ändern.
  - Die maximale Passwortlänge für Fritz!Box beträgt 32 Zeichen! Fritz!Box kürzt das Passwort automatisch in der Benutzeroberfläche. Bitte geben Sie daher in der Adapterkonfiguration nur die maximal zulässigen 32 Zeichen ein.
- Erstellen Sie einen Benutzer und erlauben Sie ihm die „Steuerung der Fritzbox und ihrer Einstellungen“.
- Aktivieren Sie den Anwendungszugriff (auf der Registerkarte „Netzwerk“). Klickfluss auf Deutsch: Netzwerk ->Heimnetzfreigaben -> Zugriff für Anwendungen -> aktiviert
- Wenn Sie die "Klingelfunktion" nutzen möchten, müssen Sie zusätzliche Einstellungen vornehmen (siehe unten).


## Wie migriert man von tr-064-community (Zwischenversion und -name)?

Wenn Sie von TR-064-Community-Adaptern umsteigen, können Sie die gesamte Geräteliste oder die Einstellungen ganz einfach kopieren:

- Gehen Sie im Administratorbereich zu Objekte und aktivieren Sie den Expertenmodus.
- Suchen Sie nach einem Objektbaum mit dem Namen system.adapter.tr-064-community.0 (wobei 0 die Instanz ist; falls mehrere Instanzen vorhanden sind, wählen Sie die richtige aus).
- Ganz rechts neben dieser Zeile befindet sich ein Button mit einem Stift. Klicken Sie darauf.
- Im Fenster wählen Sie „raw (nur für Experten)“ aus und kopieren dort den NATIVE-Teil des JSON-Codes.
- Öffnen Sie dann system.adapter.tr-064.0 (wobei 0 die Instanz ist; falls mehrere Instanzen vorhanden sind, wählen Sie die richtige aus).
- Fügen Sie den kopierten nativen Teil dort in den nativen Bereich ein.
- Änderungen speichern
- Schalten Sie den Adapter ein
- Überprüfen Sie die Konfiguration, ob etwas korrekt wiederhergestellt wurde.


## Merkmale

### Einfache Zustände und Funktionen

- WLAN für 2,4 GHz und 5 GHz ein-/ausschalten,
- Gast-WLAN ein-/ausschalten,
- Fritz!Box neu starten
- WPS-Prozess starten,
- Internetverbindung wiederherstellen
- externe IP-Adresse

### klingeln (eine Nummer wählen)

- Bei Verwendung einer internen Nummer (z. B. \*\*610) klingelt das interne Telefon. Beispiel: \*\*610\[,timeout]
- Bei Verwendung einer externen Nummer verbindet Sie der Klingelstatus mit dieser. Die Fritz!Box wählt die externe Nummer, und Ihr Standardtelefon klingelt, sobald Sie den Anruf annehmen. Das Standardtelefon können Sie in der Fritz!Box unter Telefonie/Anrufe/\[Registerkarte]Wahlhilfe/Wählhilfe verwenden konfigurieren. Bitte wählen Sie dort auch „Verbindung mit dem Telefon ISDN- und Schnurlostelefone“.

### toPauseState

- Werte: ring, connect, end
- Kann verwendet werden, um einen Videoplayer bei einem eingehenden Anruf (Ring) oder beim Abheben des Anrufs (Connect) anzuhalten.
- Die Resumtion kann auf Basis des Endwerts erfolgen.

### Gegenwart

Um die Anwesenheit von Personen in Ihrem Haus zu überwachen und somit zu kontrollieren, wann ein Familienmitglied oder Mitbewohner das Haus verlässt oder ankommt, können Sie diesen Adapter wie folgt verwenden:

- Rufen Sie die Adapteroptionen auf und wechseln Sie zur Registerkarte „Geräte“.
- Fügen Sie alle Geräte (z. B. Smartphones) Ihrer Familienmitglieder/Mitbewohner entsprechend hinzu und bestätigen Sie mit „Speichern“.
- Für jedes Gerät erstellt der Adapter nun eine Ordnerstruktur unter den ioBroker-Objekten des Adapters, typischerweise im Ordner "tr-064.0.devices".
- Sobald jemand ankommt oder geht, erfasst der Adapter die entsprechenden Informationen. Beispielsweise zeigt der Status „tr-064.0.devices.xxx.active“ (wobei xxx für den Gerätenamen steht) an, ob das jeweilige Gerät verfügbar ist und ob die Person anwesend ist. Nutzer berichten, dass dies auch mit iOS-Geräten wie iPhones zuverlässig funktioniert. Bei iPhones dauert es laut Nutzerberichten bis zu 10 Minuten, bis die Fritz!Box erkennt, dass eine Person das Gerät verlassen hat und nicht mehr mit dem WLAN verbunden ist. Die erneute Anwesenheit wird innerhalb von bis zu einer Minute erkannt.

Außerdem wurde von der ioBroker-Community ein Skript veröffentlicht, das diese Adapterinformationen nutzt, um Aktionen auszulösen (z. B. wenn alle das Haus verlassen haben, wird automatisch alles abgeschaltet; die Anzahl der anwesenden Personen oder der allgemeine Personenstatus werden über VIS angezeigt). Siehe dazu [den entsprechenden Thread im ioBroker-Forum](https://forum.iobroker.net/topic/4538/anwesenheitscontrol-basierend-auf-tr64-adapter-script) (auf Deutsch).

### AB -`Anrufbeantworter` (Anrufbeantworter)

Kann ein- und ausgeschaltet werden. Der Status cbIndex kann auf die Adresse # des Anrufbeantworters eingestellt werden.

### Anrufüberwachung

Der Anrufmonitor erstellt Echtzeit-Status für jeden eingehenden und ausgehenden Anruf. Wenn das Telefonbuch aktiviert ist (Standardeinstellung), werden Nummern in Namen aufgelöst. Es gibt außerdem einen Status, der ein klingelndes Telefon anzeigt.

### Telefonbuch

- Das Telefonbuch wird, sofern aktiviert, verwendet, um den Namen des Anrufers und die Telefonnummer zu ermitteln.
- Des Weiteren gibt es drei Zustände zur Auflösung einer Nummer oder eines Namens. Sofern verfügbar, erhalten Sie auch die Bild-URL des Kontakts. Beispiel: Wenn Sie den Zustand festlegen`phonebook.number` Alle drei Angaben (Name, Telefonnummer und Bild) werden auf den gefundenen Kontakt gesetzt. Hinweis: Bei Namenssuchen wird zunächst der vollständige Name verglichen. Wird dieser nicht gefunden, wird ein Teil des Namens verwendet.

### Anruflisten

Ausgabeformate:

- `json`
- `html`

Anruflisten sind:

- alle Anrufe
- verpasste Anrufe
- eingehende Anrufe
- ausgehende Anrufe

Anrufzähler: Der Anrufzähler kann auf 0 eingestellt werden. Beim nächsten Anruf wird er um 1 erhöht.

Die HTML-Ausgabe kann mithilfe einer Vorlage konfiguriert werden.

### Befehls- und Befehlsergebnisstatus

Mit dem Befehlsstatus können Sie jeden tr-064-Befehl aus dieser [Dokumentation](https://avm.de/service/schnittstellen/) aufrufen. Beispiel:

```javascript
command = {
    "service": "urn:dslforum-org:service:WLANConfiguration:1",
    "action": "X_AVM-DE_SetWPSConfig",
    "params": {
        "NewX_AVM-DE_WPSMode": "pbc",
        "NewX_AVM-DE_WPSClientPIN": ""
    }
};
```

Der Befehlsstatus sollte auf ein JSON-Objekt der obigen Zeilen gesetzt werden. Also { ... } (ohne Befehlsgleichung und Zeilenumbrüche). Die Callback-Funktion des Aufrufs setzt den Status \`commandResult\`.

Hier finden Sie ein Beispiel, wie Sie den Anrufbeantworter der Fritzbox mithilfe des Befehls „state“ ein- und ausschalten. Zum Testen können Sie die Zeichenkette einfach in die Datei „tr-064.0.states.command“ kopieren und einfügen.

Schalten Sie den Anrufbeantworter ein:`{"service": "urn:dslforum-org:service:X_AVM-DE_TAM:1","action": "SetEnable", "params": {"NewIndex": "0","NewEnable": "1"}}`

Schalten Sie den Anrufbeantworter aus:`{"service": "urn:dslforum-org:service:X_AVM-DE_TAM:1","action": "SetEnable", "params": {"NewIndex": "0","NewEnable": "0"}}`

Eine detaillierte Beschreibung der Aktionen und Parameter für TAM finden Sie hier: <https://avm.de/fileadmin/user_upload/Global/Service/Schnittstellen/x_tam.pdf> (Link in der oben genannten AVM-Dokumentation enthalten).

### Anrufüberwachung aktivieren

Um die Anrufüberwachungsfunktion zu nutzen, muss diese zunächst in der AVM Fritz!Box aktiviert werden. Zum Aktivieren der Anrufüberwachung wählen Sie`#96*5*` Der TCP/IP-Port 1012 wird geöffnet. Um den Port zu schließen, wählen Sie`#96*4*` Die


## Changelog
<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->

### **WORK IN PROGRESS**
- (copilot) Adapter requires admin >= 7.7.22 now
- (copilot) Adapter requires js-controller >= 6.0.11 now
- (copilot) Adapter requires admin >= 7.6.17 now

### 4.3.0 (2024-04-30)
* (mcm1957) Adapter requires node.js >= 18 and js-controller >= 5 now
* (mcm1957) Dependencies have been updated

### 4.2.18 (2023-01-04)
* (Apollon77) Prepare for future js-controller verisons

### 4.2.17 (2022-09-16)
* (simatec/Apollon77) Prevent duplication of entries in configuration
* (Apollon77) Make sure active status of devices in jsonDeviceList is correct

### 4.2.16 (2022-03-21)
* (Apollon77) Fix info logs on callee/caller
* (Apollon77) Add special handling for potential broken external image links in phonebook
* (Apollon77) Prevent some crash cases reported by Sentry

### 4.2.15 (2021-12-08)
* (bluefox) fix crash case (Sentry IOBROKER-TR-064-35)

## License
The MIT License (MIT)

Copyright (c) 2023-2026 iobroker-community-adapters <iobroker-community-adapters@gmx.de>  
Copyright (c) 2015-2023 soef <soef@gmx.net>, ioBroker-Community-Developers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
