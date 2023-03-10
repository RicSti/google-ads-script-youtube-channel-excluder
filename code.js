/*           _ _              __  __ _      
*   __ _  __| | |_ _ __ __ _ / _|/ _(_) ___ 
*  / _` |/ _` | __| '__/ _` | |_| |_| |/ __|
* | (_| | (_| | |_| | | (_| |  _|  _| | (__ 
*  \__,_|\__,_|\__|_|  \__,_|_| |_| |_|\___|
* 
* E: info@adtraffic.de | W: www.adtraffic.de
* 
* YouTube Channel Excluder 23.1
* 
* @desc: Use this Google Ads Script to autpmatically
* exclude YouTube channels in irrelevant countries.
* 
* @author: @ric_sti (Twitter)
* @version: 1.0
* @github-slug: google-ads-script-youtube-channel-excluder
* 
*/

var SPREADSHEET_URL = "INSERT_YOUR_SPREADSHEET_URL";
var SHEET_NAME = "INSERT_YOUR_SPREAD_NAME";
var EMAIL_ADRESSES = "INSERT_YOUR_E-MAIL_ADRESSES"; // comma separated
var allowedCountries = /^DE$/; // Provide RegEx, e.g. /^DE$/ or /^DE|AT|CH$/
var impressionsTimeRange = "LAST_7_DAYS";
var impressionsThreshold = 10;

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

function checkYouTubeChannels(campaignId,alreadyExcludedYouTubeChannels){
  // Prepare an array for the return values  
  var toBeExcludedYouTubeChannels = [];
  // Load currently known allowed YouTube Channels from Google Sheet
  var knownAllowedYouTubeChannels = getAllowedYouTubeChannels();
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
  if (newAllowedYouTubeChannels.length > 0){
    saveAllowedYouTubeChannels(newAllowedYouTubeChannels);
    newAllowedYouTubeChannels.length.toLocaleString("de") + " new allowed Channel(s) found." + "\n\n";
  }
  return toBeExcludedYouTubeChannels.sort();
}

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

function saveAllowedYouTubeChannels(newAllowedYouTubeChannels){
  var sheet = SpreadsheetApp.openByUrl(SPREADSHEET_URL).getSheetByName(SHEET_NAME);
  var lastRow = sheet.getLastRow();
  var range = sheet.getRange(lastRow+1,1,newAllowedYouTubeChannels.length);
  var outputValues = [];
  while(newAllowedYouTubeChannels.length) outputValues.push(newAllowedYouTubeChannels.splice(0,1));
  range.setValues(outputValues);
  sheet.sort(1);
}

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

// HELPERS

function sendSimpleTextEmail(eMailAddress,eMailSubject,eMailContent) {
  MailApp.sendEmail(eMailAddress,eMailSubject,eMailContent);
  Logger.log("Mail sent.");
}