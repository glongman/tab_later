// Saves options to chrome.storage.sync.
function save_options() {
  var notify = parseInt(document.getElementById('notify').value, 10);
  var tabs_later = parseInt(document.getElementById('tabs-later').value,10);
  chrome.storage.sync.set({
    tab_later_notify: notify,
    tab_later_delay: tabs_later
  }, function() {
    // Update status to let user know options were saved.
    var status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(function() {
      status.textContent = '';
    }, 750);
  });
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
  // Use default value color = 'red' and likesColor = true.
  chrome.storage.sync.get({
    tab_later_notify: 3,
    tab_later_delay: 3
  }, function(items) {
    document.getElementById('notify').value = items.tab_later_notify;
    document.getElementById('tabs-later').value = items.tab_later_delay;
  });
}
document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click',
    save_options);