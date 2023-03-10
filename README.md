# Google Ads Script: YouTube Channel Excluder #
## Automatically exclude YouTube channels in irrelevant countries ##

![Google Ads Script YouTube Channel Excluder Header Notebook Script Code]("https://www.adtraffic.de/wp-content/uploads/development-1024x682.jpg")

For display and video campaigns, Google is not quite so particular about targeting individual languages. Users should only understand the language set in the campaign:

> “Language targeting allows us to target users who are most likely to speak the language in question. To do this, we use the user’s desired language on YouTube, location and browser setting, among other things.”

As a result, video ads are often played in foreign language channels. If you want to exclude these YouTube channels manually, you need a lot of patience. It can be done more quickly and, above all, automatically with a Google Ads script.

Our example script below identifies YouTube channels in undesired countries on which the video campaign(s) was/are played and automatically excludes them from the respective campaign.

## What does this script do exactly?
* **Select video campaigns**

    The script first selects all active video campaigns from the respective Google Ads account.

* **Determine existing exclusions**

    For each campaign, the already excluded YouTube channels are loaded first for later matching.

* **Import confirmed YouTube channels**

    The script loads all confirmed YouTube channels from an external list.

* **Query new YouTube placements**

    The script then queries all active YouTube placements of the respective campaign that have not yet been confirmed or excluded.

* **Retrieve YouTube channel information**

    The script now retrieves the respective channel information for the determined YouTube placements.

* **Export new confirmed YouTube channels**

    All YouTube channels in desired countries are exported to the list of confirmed channels.

* **Exclude YouTube channels in unwanted countries**

    All other channels will be excluded by the script on campaign level

* **Confirmation email**

    Finally, the script sends an overview of the excluded YouTube channels by email.

## The Setup

This example is a single account script. An MCC version will follow, but can also be adapted relatively easily. The script is created directly in Google Ads under Tools & Settings > Bulk Actions > Scripts.

The extended API “YouTube” is required. Credits are charged for the API calls. With a regular Google account, you have 10,000 free credits per day. A higher quota must be requested from Google.

The finished script must be authorised for access to Drive, Mail and YouTube.

## The Code Blocks
In the following, I first explain the individual building blocks. The complete code can be viewed at the end of the document.

### Preferences

```js var SPREADSHEET_URL = "INSERT_YOUR_SPREADSHEET_URL";
var SHEET_NAME = "INSERT_YOUR_SPREAD_NAME";
var EMAIL_ADRESSES = "INSERT_YOUR_E-MAIL_ADRESSES"; // comma separated
var allowedCountries = /^DE$/; // Provide RegEx, e.g. /^DE$/ or /^DE|AT|CH$/
var impressionsTimeRange = "LAST_7_DAYS";
var impressionsThreshold = 10;
```

* The stored Google Sheet only needs one column with a sample value in the first row.

* The Sheet Name is used if several such whitelists are stored in a Google Sheet.

* One or more e-mail addresses can be entered. Please separate multiple addresses with commas.

* The value for “allowedCountries” must be a regular expression with two-digit country codes according to ISO 3166–1 alpha-2.

* The options for “impressionsTimeRange” can contain a value from the “Predefined date range” list of the Google Ads API.

* For “impressionsThreshold”, you can enter a threshold value in order to process only the YouTube placements with the highest reach and thus save API credits.

### Function main() — Part 1

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

As can be seen from the comments, the active video campaigns are loaded here first and the associated YouTube placements that have already been excluded are retrieved.

For each campaign, the function “checkYouTubeChannels” is then called using the respective campaign ID and the array with already excluded placements.

### Function checkYouTubeChannels() — Part 1

```js
function checkYouTubeChannels(campaignId,alreadyExcludedYouTubeChannels){
  // Prepare an array for the return values  
  var toBeExcludedYouTubeChannels = [];
  // Load currently known allowed YouTube Channels from Google Sheet
  var knownAllowedYouTubeChannels = getAllowedYouTubeChannels();
```

This function first prepares an empty array for caching the return values and calls the function “getAllowedYouTubeChannels” to import the already confirmed YouTube channels from the external Google Sheet.

### Function getAllowedYouTubeChannels()

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

In itself a very simple function to retrieve the data from the Google Sheet. The important thing here is that the two-dimensional “values” are passed as one-dimensional “returnValues” at the end.

### Function checkYouTubeChannels() — Part 2

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

Back in the “checkYouTubeChannels” function, the script now retrieves all YouTube placements of the respective campaign that meet the criteria under “Preferences” and have not yet been confirmed or excluded. When iterating the resulting results, the data is then retrieved from the YouTube Data API using the function “getChannelInfo”.

### Function getChannelInfo()

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

This function, which is also very simple, simply retrieves the set country and the set default language for the respective YouTube channel and returns the values as a mini-array.

### Function checkYouTubeChannels() — Part 3

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

Based on the returned channel information, the channel ID of the processed placement is either cached for export to the list of confirmed channels or written to the stack for later exclusion.

### Function checkYouTubeChannels ()— Part 4

```js
  if (newAllowedYouTubeChannels.length > 0){
    saveAllowedYouTubeChannels(newAllowedYouTubeChannels);
    newAllowedYouTubeChannels.length.toLocaleString("de") + " new allowed Channel(s) found." + "\n\n";
  }
  return toBeExcludedYouTubeChannels.sort();
}
```

The export to the list of confirmed YouTube channels takes place immediately. The batch of YouTube channels to be excluded per campaign is returned as an array to the “main” function.

### Function saveAllowedYouTubeChannels()

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

This function is also kept very simple. Very helpful is the while/push/slice loop to get the one-dimensional list of channel IDs into the required two-dimensional output format for Google Sheets.

### Function main() — Part 2

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

Back in the “main” function, the script works through the batch of YouTube channels to be excluded and adds them to the respective campaign. It then calls the “sendConfirmationEmail” function with the previously prepared logging data to send the confirmation email.

### Function sendConfirmationEmail()

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

This function now prepares the content for the confirmation e-mail and then sends it to the stored e-mail addresses using the simple help function “sendSimpleTextEmail”.

### Help function sendSimpleTextEmail()

```js
function sendSimpleTextEmail(eMailAddress,eMailSubject,eMailContent) {
  MailApp.sendEmail(eMailAddress,eMailSubject,eMailContent);
  Logger.log("Mail sent.");
}
```

No comment. :)

## The Complete Code

You can find the complete code here in the [file code.js] ("https://github.com/RicSti/google-ads-script-youtube-channel-excluder/blob/main/code.js")

Happy copy & pasting! And good luck optimising your Google Ads video campaigns!