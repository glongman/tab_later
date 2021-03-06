/** CONSTANTS **/
var MIN_IN_MILIS=1000*60;
var HOUR_IN_MILLIS=MIN_IN_MILIS*60;
var STORED_TAB_LIMIT=8; // arbitrary, opinionated, choice
var TAB_STORE_PREFIX="tab-later_";

/** Preferences **/
var NOTIFICATION_KEY="tab_later_notify",
    NOTIFICATION_VALUES={
     NONE:0,
     SOUND:1,
     VISUAL:2,
     BOTH:3
    },
    NOTIFICATIONS=NOTIFICATION_VALUES.BOTH;
    
var DELAY_KEY="tab_later_delay",
    HOUR_DELAY=3 /*hours*/;

var DEBUG=1;

function canPlaySound() {
  return NOTIFICATIONS === NOTIFICATION_VALUES.SOUND || NOTIFICATIONS === NOTIFICATION_VALUES.BOTH;
}

function canShowVisualAlert() {
  return NOTIFICATIONS === NOTIFICATION_VALUES.VISUAL || NOTIFICATIONS === NOTIFICATION_VALUES.BOTH;
}

/** Alarm helpers ***/

// not testing
function hoursAlarmInfo(time) {
  return {
    when: time + (HOUR_DELAY  * HOUR_IN_MILLIS)
  };
}
// testing
function minutesAlarmInfo(time) {
  return {
    when: time + (1 * MIN_IN_MILIS)
  };
}

//var buildAlarmInfo = minutesAlarmInfo; // TESTING
var buildAlarmInfo = hoursAlarmInfo; // NOT TESTING

/****** LOCAL STORAGE HELPERS *******/

function storageKeyFor(tab_info) {
  return TAB_STORE_PREFIX+tab_info.url;
}

function removeTabFromStorage(tab_info) {
  chrome.storage.local.remove(storageKeyFor(tab_info));
}

function findOneInTabStorage(key, callback) {
  var foundKey;
  chrome.storage.local.get(key, function(items) {
    for (foundKey in items) {
      if (foundKey === key) {
        callback(items[key]);
      }
    }
    callback();
  });
}

function saveTabToStorage(tab_info, callback) {
  var data = {};
  data[storageKeyFor(tab_info)] = tab_info;
  chrome.storage.local.set(data, callback);
}

/****** Alarm Management ********/

function addAlarm(tab_info) {
  var key = storageKeyFor(tab_info),
      alertInfo = buildAlarmInfo(Date.now());
  chrome.alarms.create(key, alertInfo);
}

function removeAlarm(key) {
  chrome.alarms.clear(key);
}

/****** Utils ******************/

function logDump(anything) {
  if (DEBUG) {
    console.log(anything);  
  }
}

function isSupportedUrl(url) {
  if (!url || url.match("^chrome")) {
    return false;
  } else {
    return true;
  }
}

function truncate(string){
  if (string.length > 30) {
    return string.substring(0,30)+'...';
  } else {
    return string;
  }
}

function tabLaterNotAllowed(message, contextMessage) {
  chrome.notifications.create(
    "tabLaterNotAllowed",
    {
      title: " CYaL8tr - Oh Noes!",
      iconUrl: 'icon.png',
      type: 'basic',
      message: message,
      contextMessage: contextMessage
    }, 
    function() {});
}

function tabLaterVisualNotify(title, message, contextMessage, callback) {
  chrome.notifications.create(
    "",
    {
      title: title,
      iconUrl: 'icon.png',
      type: 'basic',
      message: message,
      contextMessage: contextMessage
    }, 
    function() {});
}

/******** Meat ***********/

function tabLater(tab) {
  var tab_info = {
    url: tab.url,
    title: tab.title
  };
  if (!isSupportedUrl(tab_info.url)) {
    // always visually notify this one regardless of preference setting.
    tabLaterNotAllowed(truncate("Page: "+tab_info.title), "is not eligble for Tabbing Later!");
  } else {
    var finalAct = function() {
      // store it - alarm time roughly based on time stored + X hours.
      saveTabToStorage(tab_info, function() {
        if (canPlaySound()) {
          // close the tab
          audio = new Audio("sounds/GlassDown.ogg");
          audio.load();
          audio.volume = 0.2;
          audio.play();
        }
        if (canShowVisualAlert()) {
          url = new URL(tab_info.url);
          tabLaterVisualNotify(
            "Saved for Later",
            truncate(tab_info.title),
            url.hostname,
            function(){});
        }
        chrome.tabs.remove(tab.id);
      });
    };
    chrome.storage.local.get(null, function(savedTabs) {
      if (Object.keys(savedTabs).length>STORED_TAB_LIMIT) {
        // limits baby
        tabLaterNotAllowed("I can'na save more Captain!", STORED_TAB_LIMIT+" or so tabs is the limit!");
      } else {
        if (savedTabs[storageKeyFor(tab_info)]) {
          // tab already saved - delete it from store
          removeTabFromStorage(tab_info, finalAct);
        }
        finalAct();
      }
    });
  }
}

function tabNow(tab_info, callback) {
  var i, url;
  var afterCreate = function(tab) {
    chrome.tabs.update(tab.id, {highlighted:true});
    callback();
  };
  // ensure not already open
  chrome.tabs.query({currentWindow: true}, function(tabs) {
    for (i=0; i<tabs.length;i++) {
      if (tabs[i].url === tab_info.url) {
        // already open!
        callback();
        return;
      }
    }
    // open it
    chrome.tabs.create({url:tab_info.url, selected:false, index:999}, afterCreate);
    if (canPlaySound()) {
      audio = new Audio("sounds/SunriseChord.ogg");
      audio.load();
      audio.volume = 0.2;
      audio.play();
    }
    if (canShowVisualAlert()) {
      tabLaterVisualNotify(
        "Tab later - Tada!",
        truncate(tab_info.title),
        "Saved tab restored",
        function(){});    
    }
  }); 
  // remove from local store
  removeTabFromStorage(tab_info);
}


/***** Event Handlers ****
 *
 * How this monster works:
 *    - On Initiate Event (page action or key sequence)
 *      Store (meta data)
 *      Close the tab
 *    - On Storage change
 *       - if new, create alarm unless alarm already exists
 *       - if removed, remove alarm if already exists
 *    - On alarm
 *       - check store
 *          - if exists, open tab, remove from store
 */
chrome.storage.onChanged.addListener(function(changes, namespace) {
  var key, storageChange;
  if (namespace === 'local') {
    chrome.alarms.getAll(function(alarms) {
      for (key in changes) {
        storageChange = changes[key];
        if (!key.match("^"+TAB_STORE_PREFIX+".*")) {
          continue;
        }
        if (alarms.indexOf(key) > 0) {
            // alarm exists - nuke if new value is undefined
            if (storageChange.newValue === undefined) {
              chrome.alarms.clear(key);
            }
        } else {
          // no alarm - try to make a new one
          if (storageChange.newValue) {
            addAlarm(storageChange.newValue);
            chrome.alarms.getAll(logDump);
          }
        }
        // TODO debug remove (below)
        console.log('Storage key "%s" in namespace "%s" changed. ' +
          'Old value was "%s", new value is "%s".',
          key,
          namespace,
          storageChange.oldValue,
          storageChange.newValue);
        
      }
    });
  } else {
    key = NOTIFICATION_KEY;
    // check for preference change
    if (changes[key]) {
      storageChange = changes[key];
      if (storageChange.newValue) {
        NOTIFICATIONS = storageChange.newValue;
      } else {
        // something's off - set back to default
        NOTIFICATIONS = NOTIFICATION_VALUES.BOTH;
      }
    }
    key = DELAY_KEY;
    if (changes[key]) {
      storageChange = changes[key];
      if (storageChange.newValue) {
        HOUR_DELAY = storageChange.newValue;
      } else {
        // something's off - set back to default
        HOUR_DELAY = 3;
      }
    }
    // TODO debug remove (below)
    console.log('Storage key "%s" in namespace "%s" changed. ' +
      'Old value was "%s", new value is "%s".',
      key,
      namespace,
      storageChange.oldValue,
      storageChange.newValue);
    
  }
  
});

// page action - set once
chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
  if (isSupportedUrl(tabs[0].url)) {
    chrome.pageAction.show(tabs[0].id);
  } else {
    chrome.pageAction.hide(tabs[0].id);
  }
});

// page action - on tab change
chrome.tabs.onSelectionChanged.addListener(function(tabId) {
  chrome.tabs.get(tabId, function(tab) {
    if (isSupportedUrl(tab.url) ) {
      chrome.pageAction.show(tab.id);
    } else {
      chrome.pageAction.hide(tab.id);
    }
  })
});

// page action - url changes
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs[0].id === tabId && changeInfo.url) {
      if (isSupportedUrl(changeInfo.url)) {
        chrome.pageAction.show(tabId);
      } else {
        chrome.pageAction.hide(tabId);
      }
    } 
  });  
})

// page action - clicked
chrome.pageAction.onClicked.addListener(function(tab) {
  tabLater(tab);
});


// add alarm listener
chrome.alarms.onAlarm.addListener(function(alarm) {
  var key = alarm.name;
  findOneInTabStorage(key, function(tab_item) {
    if (tab_item) {
      tabNow(tab_item, function() {
        removeAlarm(key);
      });
    }
  });
});


chrome.commands.onCommand.addListener(function(command) {
  if (command === "tab-later") {
    chrome.tabs.query({currentWindow: true, active: true}, function(tabs) {
      tabLater(tabs[0]);
    });
  }
});

/***** ON INSTALL *****/
chrome.runtime.onInstalled.addListener(function(details) {
  var foundKey, done=false;
  chrome.storage.sync.get(NOTIFICATION_KEY, function(items) {
    for (foundKey in items) {
      if (foundKey === NOTIFICATION_KEY) {
        NOTIFICATIONS = items[NOTIFICATION_KEY];
        done = true;
        break;
      }
    }
    if (!done) {
      var data = {};
      data[NOTIFICATION_KEY] = NOTIFICATIONS;
      chrome.storage.sync.set(data, function(){});
    }
  });
  chrome.storage.sync.get(DELAY_KEY, function(items) {
    for (foundKey in items) {
      if (foundKey === DELAY_KEY) {
        HOUR_DELAY = items[DELAY_KEY];
        done = true;
        break;
      }
    }
    if (!done) {
      var data = {};
      data[DELAY_KEY] = HOUR_DELAY;
      chrome.storage.sync.set(data, function(){});
    }
  });
  
  if (!window.localStorage.getItem('hasSeenIntro')) {
    window.localStorage.setItem('hasSeenIntro', 'yep');
    chrome.tabs.create({
      url: 'resources/welcome.html'
    });
  }
});
