// Constants
const CONFIG = {
    API_BASE_URL: "http://localhost:8000",
    MAIL_API_URL: "https://mail.infomaniak.com/api",
    URL_PATTERN: /https:\/\/mail\.infomaniak\.com\/api\/mail\/([a-f0-9-]+)\//
};

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
});

// Track mailbox IDs from network requests
chrome.webRequest.onCompleted.addListener(
    (details) => captureMailboxId(details),
    {urls: ["<all_urls>"]}
);

/**
 * Extracts and stores mailbox ID from request URLs
 * @param {Object} details - Request details
 */
function captureMailboxId(details) {
    const match = details.url.match(CONFIG.URL_PATTERN);
    if (!match) return;

    const mailboxId = match[1];
    chrome.storage.local.get({mailboxIds: []}, (data) => {
        let mailboxIds = new Set(data.mailboxIds);
        mailboxIds.add(mailboxId);
        chrome.storage.local.set({mailboxIds: Array.from(mailboxIds)});
    });
}

/**
 * Makes an authenticated API request
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} - Response data
 */
async function makeAuthenticatedRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get("apiToken", (data) => {
            const token = data.apiToken;
            if (!token) {
                reject(new Error("API Token is not set."));
                return;
            }

            const requestOptions = {
                ...options,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                    ...options.headers
                }
            };

            fetch(url, requestOptions)
                .then(response => response.json())
                .then(resolve)
                .catch(reject);
        });
    });
}

/**
 * Calls the event_suggestion endpoint.
 * @param {string} mailboxId - Mailbox identifier
 * @param {string} folderId - Folder identifier
 * @param {string} threadId - Thread identifier
 * @param {Array} context - Array of context values
 * @returns {Promise<Object>} Response data
 */
function getEventSuggestion(mailboxId, folderId, threadId, context) {
    const url = `${CONFIG.API_BASE_URL}/v1/agent/mail/${mailboxId}/folder/${folderId}/thread/${threadId}/event_suggestion`;
    return makeAuthenticatedRequest(url, {
        method: "POST",
        body: JSON.stringify({"context_message_uid": context}),
        credentials: "omit"
    });
}

/**
 * Calls the eventCreationInitValues endpoint
 * @param {Object} eventSuggestionData - Data from event suggestion
 * @returns {Promise<Object>} Response data
 */
function createEvent(eventSuggestionData) {
    const attendees = eventSuggestionData.emails.map(email => ({email}));
    const url = `${CONFIG.MAIL_API_URL}/calendar/eventCreationInitValues`;

    return makeAuthenticatedRequest(url, {
        method: "POST",
        headers: {
            accept: "application/json, text/plain, */*",
            origin: "https://mail.infomaniak.com"
        },
        body: JSON.stringify({
            attendees,
            title: eventSuggestionData.title,
            description: eventSuggestionData.description
        })
    });
}

/**
 * Orchestrates the API calls sequentially
 * @param {string} mailboxId - Mailbox identifier
 * @param {string} folderId - Folder identifier
 * @param {string} threadId - Thread identifier
 * @param {Array} context - Array of context values
 * @returns {Promise<Object>} Final response data
 */
async function processEventWorkflow(mailboxId, folderId, threadId, context) {
    try {
        const eventSuggestionData = await getEventSuggestion(mailboxId, folderId, threadId, context);
        console.log("Event Suggestion Response:", eventSuggestionData);

        // const eventCreationData = await createEvent(eventSuggestionData);
        // console.log("Event Creation Init Values Response:", eventCreationData);

        return eventSuggestionData;
    } catch (error) {
        console.error("API Call Error:", error);
        return {error: error.toString()};
    }
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "callApi") {
        const {mailboxId, folderId, threadId, context} = request.payload;

        processEventWorkflow(mailboxId, folderId, threadId, context)
            .then(sendResponse)
            .catch(error => {
                console.error("Request error:", error);
                sendResponse({error: error.toString()});
            });

        return true; // Indicates async response
    }
});
