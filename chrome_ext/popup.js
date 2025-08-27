
// DOM Element References
const tokenInput = document.getElementById("tokenInput");
const saveButton = document.getElementById("saveTokenButton");
const contentOutput = document.getElementById("content");
const urlsOutput = document.getElementById("urls");
const showContentButton = document.getElementById("showContent");

// Event Listeners
document.addEventListener('DOMContentLoaded', loadSavedToken);
saveButton.addEventListener("click", saveApiToken);
showContentButton.addEventListener('click', fetchAndDisplayMessageContent);

/**
 * Load the saved API token when the popup opens
 */
function loadSavedToken() {
  chrome.storage.local.get("apiToken", (data) => {
    if (data.apiToken) {
      tokenInput.value = data.apiToken;
    }
  });
}

/**
 * Save the API token to local storage
 */
function saveApiToken() {
  const tokenValue = tokenInput.value.trim();

  if (tokenValue) {
    chrome.storage.local.set({apiToken: tokenValue}, () => {
      if (chrome.runtime.lastError) {
        alert("Error saving token: " + chrome.runtime.lastError.message);
      } else {
        alert("Token saved successfully!");
      }
    });
  } else {
    alert("Please enter a valid token.");
  }
}

/**
 * Fetch message content from active tab and display parsed results
 */
function fetchAndDisplayMessageContent() {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs.length === 0) {
      contentOutput.textContent = "No active tab found.";
      return;
    }

    // Send message to content script to collect data from all frames
    chrome.tabs.sendMessage(tabs[0].id, {action: "extractMessageItems"}, (response) => {
      if (chrome.runtime.lastError) {
        contentOutput.textContent = "Error: " + chrome.runtime.lastError.message;
        return;
      }

      if (response && response.success) {
        const parsedContent = parseMailPattern(response.data);
        contentOutput.textContent = JSON.stringify(parsedContent, null, 2);
        displayUrlForLastThread(parsedContent);
      } else {
        contentOutput.textContent = "Failed to extract message items: " + (response?.error || "Unknown error");
      }
    });
  });
}

/**
 * Parse mail patterns from content string
 * @param {string} content - The string containing mail patterns
 * @returns {Object} Object with parsed mail UIDs
 */
function parseMailPattern(content) {
  const mailPattern = /mail-(\d+)@([a-zA-Z0-9-]+)/g;
  let match;
  const result = {
    context_message_uid: []
  };
  const folderThreads = [];

  while ((match = mailPattern.exec(content)) !== null) {
    const messageUid = `${match[1]}@${match[2]}`;
    result.context_message_uid.push(messageUid);
    folderThreads.push({
      threadId: match[1],
      folderId: match[2]
    });
  }

  // Store folderThreads for URL generation
  result.folderThreads = folderThreads;
  return result;
}

/**
 * Display URL for the last thread using mailbox ID from storage
 * @param {Object} parsedData - Data containing folder threads
 */
function displayUrlForLastThread(parsedData) {
  const folderThreads = parsedData.folderThreads || [];

  if (folderThreads.length === 0) {
    urlsOutput.textContent = "No thread found.";
    return;
  }

  chrome.storage.local.get({mailboxIds: []}, (data) => {
    if (data.mailboxIds.length > 0) {
      const mailboxId = data.mailboxIds[0];
      const lastThread = folderThreads[folderThreads.length - 1];
      urlsOutput.textContent = `/mail/${mailboxId}/folder/${lastThread.folderId}/thread/${lastThread.threadId}/event_suggestion`;
    } else {
      urlsOutput.textContent = "No mailbox ID found.";
    }
  });
}