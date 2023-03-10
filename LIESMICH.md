# Google Ads Script: YouTube Channel Excluder

## YouTube Kanäle in irrelevanten Ländern automatisch ausschließen

English version: [README.md](https://github.com/RicSti/google-ads-script-youtube-channel-excluder/blob/main/README.md)

![Google Ads Script YouTube Channel Excluder Header Notebook Script Code](https://www.adtraffic.de/wp-content/uploads/development-1024x682.jpg)

Bei Display und Video Kampagnen nimmt es Google nicht ganz so genau mit der Ausrichtung auf einzelne Sprachen. Nutzer sollen lediglich die in der Kampagne eingestellte Sprache verstehen:

> “Das Language Targeting erlaubt es, User zu targeten, die der jeweiligen Sprache mit sehr hoher Wahrscheinlichkeit mächtig sind. Hierzu verwenden wir unter anderem die gewünschte Sprache des Users bei Youtube, den Standort und die Browsereinstellung.”

Das führt dazu, dass Videoanzeigen häufig in fremdsprachigen Kanälen ausgespielt werden. Möchte man diese YouTube Kanäle händisch ausschließen, benötigt man viel Geduld. Schneller und vor allem automatisiert geht es mit einem Google Ads Script.

Unser nachfolgendes Beispiel Script ermittelt YouTube Kanäle in nicht gewünschten Ländern, auf denen die Videokampagne(n) ausgespielt wurde(n) und schließt sie automatisch in der jeweiligen Kampagne aus.

## Was macht dieses Script genau?
* **Videokampagnen auswählen**

    Das Script wählt zunächst alle aktiven Videokampagnen aus dem jeweiligen Google Ads Konto aus

* **Bestehende Ausschlüsse ermitteln**

    Für jede Kampagne werden zunächst die bereits ausgeschlossenen YouTube Kanäle zum späteren Abgleich geladen

* **Bestätigte YouTube Kanäle importieren**

    Aus einer externen Liste lädt das Script alle bereits bestätigten YouTube Kanäle

* **Neue YouTube Placements abfragen**

    Anschließend fragt das Script alle aktiven YouTube Placements der jeweiligen Kampagne ab, die bisher nicht bestätigt oder ausgeschlossen wurden

* **YouTube Kanalinfos abrufen**

    Zu den ermittelten YouTube Placements ruft das Script nun die jeweiligen Kanalinfos ab

* **Neue bestätigte YouTube Kanäle exportieren**

    Alle YouTube Kanäle in gewünschten Ländern werden in die Liste mit bestätigten Kanälen exportier

* **YouTube Kanäle in unerwünschten Ländern ausschließen**

    Alle anderen Kanäle schließt das Script auf Kampagnenebene aus

* **Bestätigungs-E-Mail**
    
    Abschließend versendet das Script eine Übersicht der ausgeschlossenen YouTube Kanäle per E-Mail

## Das Setup

Bei diesem Beispiel handelt es sich um ein Single Account Script. Eine MCC Version wird folgen, kann aber auch relativ einfach adaptiert werden. Das Script wird direkt in Google Ads unter Tools & Einstellungen > Bulk-Aktionen > Scripts angelegt.

Die erweiterte API “YouTube” wird benötigt. Für die API-Abrufe fallen Credits an. Mit einem regulären Google Konto hat man pro Tag 10.000 freie Credits. Ein höheres Kontingent muss bei Google beantragt werden.

Das fertige Script muss für den Zugriff auf Drive, Mail und YouTube autorisiert werden.

## Die Code Bausteine

Nachfolgend erkläre ich zunächst die einzelnen Bausteine. Der komplette Code kann am Ende des Dokuments eingesehen werden.

### Einstellungen

```js
var SPREADSHEET_URL = "INSERT_YOUR_SPREADSHEET_URL";
var SHEET_NAME = "INSERT_YOUR_SPREAD_NAME";
var EMAIL_ADRESSES = "INSERT_YOUR_E-MAIL_ADRESSES"; // comma separated
var allowedCountries = /^DE$/; // Provide RegEx, e.g. /^DE$/ or /^DE|AT|CH$/
var impressionsTimeRange = "LAST_7_DAYS";
var impressionsThreshold = 10;
```

* Das hinterlegte Google Sheet benötigt nur eine Spalte mit einem Beispielwert in der ersten Zeile.

* Der Sheet Name dient dazu, falls mehrere solcher Whitelists in einem Google Sheet gespeichert sind.

* Es kann eine oder auch mehrere E-Mail-Adressen angegeben werden. Mehrere Adressen bitte mit Komma trennen.

* Der Wert für “allowedCountries” muss ein regulärer Ausdruck mit zweistelligen Ländercodes nach ISO 3166-1 Alpha-2 sein.

* Die Optionen für “impressionsTimeRange” können einem Wert aus der Liste “Predefined date range” der Google Ads API enthalten. https://developers.google.com/google-ads/api/docs/query/date-ranges#date-range

* Für “impressionsThreshold” kann man einen Schwellwert eintragen, um nur die reichweitenstärksten YouTube Placements zu verarbeiten und so API Credits zu sparen.

### Funktion main() – Teil 1

```js
function main() {
  // Prepare an array for logging purposes
  var allExclusions = [];
  // Fetch all active video campaigns and start iterating
  var videoCampaignIterator = AdsApp.videoCampaigns().withCondition("Status = 'ENABLED'").get();
  while (videoCampaignIterator.hasNext()) {
    var alreadyExcludedYouTubeChannels = [];
    var videoCampaign = videoCampaignIterator.next();
    // Fetch all already excluded YouTube Channels from the processed campaign and store them in an array
    var exludedYoutubeChannelIterator = videoCampaign.videoTargeting().excludedYouTubeChannels().get();
    while (exludedYoutubeChannelIterator.hasNext()) {
      var excludedYouTubeChannel = exludedYoutubeChannelIterator.next();
      alreadyExcludedYouTubeChannels.push(excludedYouTubeChannel.getChannelId());
    }
    // Build a batch with to be excluded YouTube channels
    const toBeExcludedYouTubeChannels = checkYouTubeChannels(videoCampaign.getId(),alreadyExcludedYouTubeChannels);
```

Wie aus den Kommentaren ersichtlich, werden hier zunächst die aktiven Videokampagnen geladen und die zugehörigen, bereits ausgeschlossenen YouTube Placements abgerufen.

Für jede Kampagne wird dann die Funktion “checkYouTubeChannels” unter Verwendung der jeweiligen Kampagnen ID und dem Array mit bereits ausgeschlossenen Placements aufgerufen.

### Funktion checkYouTubeChannels – Teil 1

```js
function checkYouTubeChannels(campaignId,alreadyExcludedYouTubeChannels){
  // Prepare an array for the return values  
  var toBeExcludedYouTubeChannels = [];
  // Load currently known allowed YouTube Channels from Google Sheet
  var knownAllowedYouTubeChannels = getAllowedYouTubeChannels();
```

Diese Funktion bereitet zunächst ein leeres Array für die Zwischenspeicherung der Rückgabewerte vor und ruft die Funktion “getAllowedYouTubeChannels” auf, um die bereits bestätigten YouTube Kanäle aus dem externen Google Sheet zu importieren.

### Funktion getAllowedYouTubeChannels

```js
function getAllowedYouTubeChannels(){
  var sheet = SpreadsheetApp.openByUrl(SPREADSHEET_URL).getSheetByName(SHEET_NAME);
  var lastRow = sheet.getLastRow();
  var range = sheet.getRange(1, 1, lastRow);
  var returnValues = [];
  var values = range.getValues();
  for (var row in values) {
    for (var col in values[row]) {
      returnValues.push(values[row][col]);
    }
  }
  return returnValues;
}
```

An sich eine sehr einfache Funktion zum Abruf der Daten aus dem Google Sheet. Wichtig ist hierbei, dass die zweidimensionalen “values” am Ende als eindimensionale “returnValues” übergeben werden.

### Funktion checkYouTubeChannels – Teil 2

```js
 // Prepare an array for newly identified allowed YouTube Channels to be added to the Google Sheet
  var newAllowedYouTubeChannels = [];
  // Query all YouTube placements of the processed campaign with at least ${impressionsThreshold} impressions within the ${impressionsTimeRange}
  var query = 
    "SELECT detail_placement_view.display_name, detail_placement_view.group_placement_target_url FROM detail_placement_view " +
    "WHERE " +
    "  campaign.id = " + campaignId +
    "  AND segments.date DURING " + impressionsTimeRange +
    "  AND metrics.impressions > " + impressionsThreshold + 
    "  AND detail_placement_view.placement_type IN ('YOUTUBE_VIDEO','YOUTUBE_CHANNEL') " +
    "  AND detail_placement_view.group_placement_target_url IS NOT NULL " +
    "  AND detail_placement_view.group_placement_target_url NOT REGEXP_MATCH '" + alreadyExcludedYouTubeChannels.join("|") + "'" +
    "  AND detail_placement_view.group_placement_target_url NOT REGEXP_MATCH '" + knownAllowedYouTubeChannels.join("|") + "'" +
    ""
    ;
  var result = AdsApp.search(query);
  console.log(result.totalNumEntities() + " YouTube Placements found.");
  while (result.hasNext()) {
    var row = result.next();
    const channelId = row['detailPlacementView']['groupPlacementTargetUrl'].match(/^.*\/([^\/]*)$/)[1];
    const channelName = row['detailPlacementView']['displayName'];
    const channelInfo = getChannelInfo(channelId); // [ Country, Default Language ]
```

Zurück in der Funktion “checkYouTubeChannels” ruft das Script nun alle YouTube Placements der jeweiligen Kampagne ab, die den Kriterien unter “Einstellungen” entsprechen und bisher weder bestätigt noch ausgeschlossen wurden. Bei der Iteration der daraus resultierenden Ergebnisse werden dann mithilfe der Funktion “getChannelInfo” die Daten von dem YouTube Data API abgefragt.

### Funktion getChannelInfo

```js
function getChannelInfo(channelId){
  try {
    const results = YouTube.Channels.list('snippet,localizations', {
      id: channelId,
      maxResults: 1
    });
    if (results === null) {
      console.log(`ID ${channelId}: Unable to search videos`);
      return;
    }
    return [ results.items[0].snippet.country, results.items[0].snippet.defaultLanguage ];
  } catch (err) {
    // TODO (developer) - Handle exceptions from Youtube API
    console.log(`ID ${channelId}: Failed with an error: %s`, err.message);
  }  
}
```

Diese ebenfalls sehr einfach gehaltene Funktion ruft lediglich das eingestellte Land und die eingestellte Standardsprache für den jeweiligen YouTube Kanal ab und gibt die Werte als Mini-Array zurück.

### Funktion checkYouTubeChannels – Teil 3

```js
    if ( channelInfo && channelInfo[0]){
      if (channelInfo[0].match(allowedCountries) && knownAllowedYouTubeChannels.indexOf(channelId) == -1 && newAllowedYouTubeChannels.indexOf(channelId) == -1){
        // Store channel id of newly identified German YouTube Channel in array to be added to Google Sheet
        newAllowedYouTubeChannels.push(channelId);
      }
      else if (!channelInfo[0].match(allowedCountries)){
        if ( alreadyExcludedYouTubeChannels.indexOf(channelId) == -1){
          toBeExcludedYouTubeChannels.push(
            {
              id: channelId,
              name: channelName,
              country: channelInfo[0],
              language: channelInfo[1]
            }
          );
        }
      }
    }
  }
```

Basierend auf den zurückgegebenen Kanalinfos wird die Kanal ID des jeweils verarbeiteten Placements entweder für den Export in die Liste bestätigter Kanäle zwischengespeichert oder in den Stapel zum späteren Ausschluss geschrieben.

### Funktion checkYouTubeChannels – Teil 4

```js
  if (newAllowedYouTubeChannels.length > 0){
    saveAllowedYouTubeChannels(newAllowedYouTubeChannels);
    newAllowedYouTubeChannels.length.toLocaleString("de") + " new allowed Channel(s) found." + "\n\n";
  }
  return toBeExcludedYouTubeChannels.sort();
}
```

Der Export in die Liste bestätigter YouTube Kanäle erfolgt unmittelbar. Der Stapel mit den auszuschließenden YouTube Kanälen pro Kampagne wird als Array an die Funktion “main” zurückgegeben.

### Funktion saveAllowedYouTubeChannels

```js
function saveAllowedYouTubeChannels(newAllowedYouTubeChannels){
  var sheet = SpreadsheetApp.openByUrl(SPREADSHEET_URL).getSheetByName(SHEET_NAME);
  var lastRow = sheet.getLastRow();
  var range = sheet.getRange(lastRow+1,1,newAllowedYouTubeChannels.length);
  var outputValues = [];
  while(newAllowedYouTubeChannels.length) outputValues.push(newAllowedYouTubeChannels.splice(0,1));
  range.setValues(outputValues);
  sheet.sort(1);
}
```

Auch diese Funktion ist sehr einfach gehalten. Sehr hilfreich ist die knappe while/push/slice Schleife, um die eindimensionale Liste mit Kanal IDs in das erforderliche zweidimensionale Ausgabeformat für Google Sheets zu bekommen.

### Funktion main() – Teil 2

```js
    // Exclude all YouTube channels in batch from campaign
    for (i=0;i<toBeExcludedYouTubeChannels.length;i++){
      videoCampaign.videoTargeting().newYouTubeChannelBuilder().withChannelId(toBeExcludedYouTubeChannels[i].id).exclude();
    }
    // Add logging information to log array
    allExclusions.push({ campaign: videoCampaign.getName(), excludedYouTubeChannels: toBeExcludedYouTubeChannels })
  }
  // Prepare and send a notification email with logging information
  sendConfirmationEmail(allExclusions);
}
```

Zurück in der “main” Funktion arbeitet das Script den Stapel mit auszuschließenden YouTube Kanälen ab und ergänzt diese in der jeweiligen Kampagne. Anschließend ruft es die Funktion “sendConfirmationEmail” mit den zuvor aufbereiteten Logging-Daten auf, um die Bestätigungs-E-Mail zu versenden.

### Funktion sendConfirmationEmail

```js
function sendConfirmationEmail(allExclusions){
  var output = "";
  for (i=0;i<allExclusions.length;i++){
    output += allExclusions[i].excludedYouTubeChannels.length.toLocaleString("de") + " Channel(s) excluded from Campaign " + allExclusions[i].campaign + "\n\n";
    var outputChannels = "";
    for (j=0;j<allExclusions[i].excludedYouTubeChannels.length;j++){
        outputChannels += allExclusions[i].excludedYouTubeChannels[j].name + " (" + allExclusions[i].excludedYouTubeChannels[j].country + "|" + allExclusions[i].excludedYouTubeChannels[j].language + ")\n";
        outputChannels += "https://youtube.com/channel/" + allExclusions[i].excludedYouTubeChannels[j].id + "\n\n";
    }
    output += outputChannels;
  }  
  var eMailAddress = EMAIL_ADRESSES;
  var eMailSubject = "YouTube Channel Excluder";
  var eMailContent = output;
  console.log(output);
  sendSimpleTextEmail(eMailAddress,eMailSubject,eMailContent)
}
```

Diese Funktion bereitet nun noch den Inhalt für die Bestätigungs-E-Mail auf und verschickt sie anschließend mit der einfachen Hilfsfunktion “sendSimpleTextEmail” an die hinterlegten E-Mail-Adressen.

### Hilfsfunktion sendSimpleTextEmail

```js
function sendSimpleTextEmail(eMailAddress,eMailSubject,eMailContent) {
  MailApp.sendEmail(eMailAddress,eMailSubject,eMailContent);
  Logger.log("Mail sent.");
}
```

Kein Kommentar. :)

## Der vollständige Code

Ihr findet den kompletten Code hier in der [Datei code.js](https://github.com/RicSti/google-ads-script-youtube-channel-excluder/blob/main/code.js)

Happy Copy & Pasting! Und viel Erfolg bei der Optimierung Eurer Google Ads Video Kampagnen!
