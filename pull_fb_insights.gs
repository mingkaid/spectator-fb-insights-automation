/* Link to tutorial for use of Google Analytics API:
 * https://developers.google.com/analytics/solutions/articles/reporting-apps-script#enable
 */
/**
 * A special function that runs when the spreadsheet is open, used to add a
 * custom menu to the spreadsheet.
 */
function onOpen() {
  var spreadsheet = SpreadsheetApp.getActive();
  var menuItems = [
    {name: 'Pull Yesterday\'s Facebook Post Data', functionName: 'fbInsightsYesterday_'},
    {name: 'Pull Past N-day\'s Facebook Post Data', functionName: 'fbInsightsNDays_'},
    {name: 'Initialize Facebook Post Datasheet', functionName: 'fbInsightsInit_'}
  ];
  spreadsheet.addMenu('Spec Exclusive Functions', menuItems);
}

/**
 * Initializes the Facebook Insights database from yesterday to the very beginning of data
 */
function fbInsightsInit_() {
  pullFbInsights_(0);
}

/**
 * Pulls Facebook Insights data from yesterday 
 */
function fbInsightsYesterday_() {
  pullFbInsights_(1);
}

/** 
 * The user chooses how many days of insights they want to get. 
 * Preferrably used when someone forgot to pull for some days.
 */
function fbInsightsNDays_() {
  var nDays = Browser.inputBox('Pull Post Insights', 
                              'How many days of data do you want to pull?',
                              Browser.Buttons.OK_CANCEL);
  if (nDays == 'cancel') {
    return;
  }
  nDays = parseInt(nDays);
  
  pullFbInsights_(nDays);
}

/** 
 * Log into FB account, pull post data from FB Graphs API, and log in their insights data. 
 */
function pullFbInsights_(daysBack) {
  var spreadsheet = SpreadsheetApp.getActive();
  var post_sheet = spreadsheet.getSheetByName('POSTS');
  post_sheet.activate();
  
  // Prompt the user to input token
  var cds_token = Browser.inputBox('Pull Post Insights', 
                              'Put in the page access token for Columbia Daily Spectator page here',
                              Browser.Buttons.OK_CANCEL);
  if (cds_token == 'cancel') {
    return;
  }
  
  // create date object of today
  var now = new Date(Date.now());
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // format request url
  var userId = 'me'
  var specifications = '&date_format=U&fields=posts';
  var requestUrlTemplate = 'https://graph.facebook.com/%s?access_token=%s%s'
  var requestPostsUrl = Utilities.formatString(requestUrlTemplate, userId, cds_token, specifications);
  var posts = requestJson(requestPostsUrl).posts;
  
  // 0 days back denotes all the way to the beginning
  if (daysBack == 0) {
    post_sheet.clear();
    post_sheet.appendRow(["ID", "Link", "Message", "Created_Time", "Created_Hour", "Type", 
                        "Unique Impressions", "Engaged Users", "Engagement Rate", "Impressions", "Link_Clicks", "CTR"]);
    
    while (posts.data.length > 0) {    
      for (var i = 0; i < posts.data.length; i++) {
        var post = posts.data[i];
        var postCreatedTime = new Date(parseFloat(post.created_time) * 1000);
        var postCreatedDate = new Date(postCreatedTime.getFullYear(), postCreatedTime.getMonth(), postCreatedTime.getDate());
        var daysFrom = daysBetween(today, postCreatedDate);
        if (daysFrom > 0) {
          var postInsights = requestPostInsights(post, cds_token);
          // get Insights data: post_impressions, post_impressions_unique, post_consumptions_by_type, post_engaged_users
          post_sheet.appendRow(postInsights);
        }
      }
      // continue to the next page of posts after this page is finished
      var nextPageUrl = posts.paging.next;
      posts = requestJson(nextPageUrl, cds_token);
    }
  // If the user doesn't start from beginning, pull data from yesterday and continue down until we reach a post before the stopping day. 
  } else {
    var stoppingDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysBack);
    var finished = false;
    while (!finished) {
      for (var i = 0; i < posts.data.length; i++) {
        var post = posts.data[i];
        var postCreatedTime = new Date(parseFloat(post.created_time) * 1000);
        var postCreatedDate = new Date(postCreatedTime.getFullYear(), postCreatedTime.getMonth(), postCreatedTime.getDate());
        var daysFrom = daysBetween(today, postCreatedDate);
        var daysTilStop = daysBetween(postCreatedDate, stoppingDay);
        if (daysTilStop < 0) {
          finished = true;
          break;
        }
        if (daysFrom > 0) {
          var postInsights = requestPostInsights(post, cds_token);
          // get Insights data: post_impressions, post_impressions_unique, post_consumptions_by_type, post_engaged_users
          post_sheet.appendRow(postInsights);
        }
      }
      // continue to the next page of posts after this page is finished
      var nextPageUrl = posts.paging.next;
      posts = requestJson(nextPageUrl, cds_token);
    }
  }
}

/** 
 * Worker function to do the actual request for post insights. 
 * @returns an array of post information
 */
function requestPostInsights(post, token) {
  // Get post information
  var requestUrlTemplate = 'https://graph.facebook.com/%s?access_token=%s%s';
    
  var postId = post.id;
  var postCreatedTime = new Date(parseFloat(post.created_time) * 1000);
  var postCreatedDate = new Date(postCreatedTime.getFullYear(), postCreatedTime.getMonth(), postCreatedTime.getDate());
  
  var postLink = post.link;
  var postMessage = post.message;
  var postType = post.type;
  
  // Create insight paths
  var insightPath = postId + '/insights/';
  var impressionsUrl = Utilities.formatString(requestUrlTemplate, insightPath + 'post_impressions', token, '');
  var uniqueImpUrl = Utilities.formatString(requestUrlTemplate, insightPath + 'post_impressions_unique', token, '');
  var engUsrUrl = Utilities.formatString(requestUrlTemplate, insightPath + 'post_engaged_users', token, '');
  var consTypeUrl = Utilities.formatString(requestUrlTemplate, insightPath + 'post_consumptions_by_type', token, '');
  
  var uniqueImpJson = requestJson(uniqueImpUrl).data[0];
  var postUniqueImpressions = uniqueImpJson.values[0].value;
  
  var engUsrJson = requestJson(engUsrUrl).data[0];
  var postEngagedUsers = engUsrJson.values[0].value;
  
  var postImpressionsJson = requestJson(impressionsUrl).data[0];
  var postImpressions = postImpressionsJson.values[0].value;
  
  var consTypeJson = requestJson(consTypeUrl).data[0];
  var postLinkClicks = consTypeJson.values[0].value['link clicks'];
  
  var postEngagementRate = postEngagedUsers / postUniqueImpressions;
  var postCtr = postLinkClicks / postImpressions;
  
  return [postId, postLink, postMessage, postCreatedTime, postCreatedTime.getHours(), postType, 
          postUniqueImpressions, postEngagedUsers, postEngagementRate, postImpressions, postLinkClicks, postCtr];
}

/** 
 * General worker function to return the JSON object at the given URL
 * @returns the JSON object at the given URL
 */
function requestJson(requestUrl) {
  var fetchOptions =
      {
        "method"  : "GET",   
        "followRedirects" : true,
        "muteHttpExceptions": true
      };
  var requestResult = UrlFetchApp.fetch(requestUrl, fetchOptions);
  var result = JSON.parse(requestResult.getContentText());
  return result;
}

/** 
 * A helper function to calculate the difference between two dates
 * @returns the number of days between two dates
 */
function daysBetween( date1, date2 ) {
  //Get 1 day in milliseconds
  var one_day = 1000*60*60*24;

  // Convert both dates to milliseconds
  var date1_ms = date1.getTime();
  var date2_ms = date2.getTime();

  // Calculate the difference in milliseconds
  var difference_ms = date1_ms - date2_ms;
    
  // Convert back to days and return
  return difference_ms/one_day; 
}
