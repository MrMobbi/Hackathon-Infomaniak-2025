/**
 * Email content script for Chrome extension
 * Adds functionality to extract email information and integrate with calendar
 */
console.log('Content script loaded');

// Constants
const CONFIG = {
    buttonId: 'event_api_call',
    buttonHtml: `
    <button type="button" id="event_api_call" class="mat-focus-indicator mailFooter-button mat-raised-button mat-button-base ng-star-inserted">
      <span class="mat-button-wrapper">
        <div>
          <i class="icon icon-magic-wand-outline"></i>
          <p class="d-none d-lg-block d-xl-block threadContent--dateMail">AI event suggestion</p>
        </div>
      </span>
      <span class="mat-ripple mat-button-ripple"></span>
      <span class="mat-button-focus-overlay"></span>
    </button>
  `,
    calendarUrlTemplate: 'https://calendar.infomaniak.com/?iv=',
    mailPattern: /mail-(\d+)@([a-zA-Z0-9-]+)/g,
    targetSelector: 'div.mailContent-open-footer.ng-star-inserted',
    messageItemSelector: 'div.message-item'
};

// Storage for collected frame data
let frameDataCollection = new Map();

/**
 * Extracts content from message items in the current frame
 * @returns {string} Combined class names of message items
 */
function getMessageItemContent() {
    const messageItems = document.querySelectorAll(CONFIG.messageItemSelector);
    return Array.from(messageItems)
        .map(item => item.className)
        .join(' ');
}

/**
 * Extracts email thread information from content string
 * @param {string} content - The content to parse
 * @returns {Object} Contains thread info and formatted result
 */
function extractEmailThreadInfo(content) {
    const mailPattern = CONFIG.mailPattern;
    let match;
    let formattedEmails = [];
    let folderThreads = [];

    while ((match = mailPattern.exec(content)) !== null) {
        formattedEmails.push(`${match[1]}@${match[2]}`);
        folderThreads.push({threadId: match[1], folderId: match[2]});
    }

    return {
        formattedEmails,
        folderThreads
    };
}

/**
 * Makes API call with extracted information
 * @param {string} content - Content to extract email information from
 */
function callApi(content) {
    const {formattedEmails, folderThreads} = extractEmailThreadInfo(content);

    if (folderThreads.length === 0) return;

    chrome.storage.local.get({mailboxIds: []}, function (data) {
        if (data.mailboxIds.length === 0) return;

        const mailboxId = data.mailboxIds[0];
        const lastThread = folderThreads[folderThreads.length - 1];

        chrome.runtime.sendMessage(
            {
                action: "callApi",
                payload: {
                    mailboxId: mailboxId,
                    folderId: lastThread.folderId,
                    threadId: lastThread.threadId,
                    context: formattedEmails,
                }
            },
            handleApiResponse
        );
    });
}

/**
 * Handles the API response
 * @param {Object} response - API response object
 */
function handleApiResponse(response) {
    if (response.error) {
        console.error("API call failed:", response.error);
        return;
    }

    console.log("API call response:", response);

    // Build calendar URL with available data
    const params = new URLSearchParams();
    params.set('ctz', 'Europe/Zurich');

    // Add title and description if available
    if (response.title) params.set('text', response.title);
    // Create description including the email list if available
    let fullDescription = response.description || '';
    if (response.emails && response.emails.length > 0) {
        // Add a separator if there's already a description
        if (fullDescription) fullDescription += '\n\n';
        fullDescription += 'Participants:\n' + response.emails.join('\n');
    }
    // Add description to params if it exists
    if (fullDescription) params.set('details', fullDescription);


    // Process date and time information
    if (response.date && response.start_time) {
        const [year, month, day] = response.date.split('-').map(Number);
        const [hours, minutes] = response.start_time.split(':').map(Number);

        // Create start and end times
        const start = new Date(year, month - 1, day, hours, minutes);
        const end = new Date(start);
        end.setMinutes(end.getMinutes() + (response.duration ? Number(response.duration) : 60));

        // Format dates for calendar URL (YYYYMMDDTHHMMSSZ format)
        const formatDate = date => date.toISOString().replace(/[-:]|\.\d{3}/g, '');
        params.set('dates', `${formatDate(start)}/${formatDate(end)}`);
    }
    console.log('Calendar URL:', params.toString());
    // Open calendar URL in new tab
    window.open(`https://calendar.infomaniak.com/create?${params.toString()}`, '_blank');
}

/**
 * Inserts action button into the target div
 * @param {HTMLElement} targetDiv - DOM element to insert button into
 */
function insertButton(targetDiv) {
    console.log('Target div found, inserting button');
    targetDiv.insertAdjacentHTML('beforeend', CONFIG.buttonHtml);

    const button = document.getElementById(CONFIG.buttonId);
    if (button) {
        button.addEventListener('click', () => callApi(getMessageItemContent()));
    } else {
        console.warn('Button not found after insertion.');
    }
}

/**
 * Observes DOM changes to find the target element for button insertion
 * keeps watching indefinitely until the element appears
 */
function observeForTarget() {
    // Function to check for target and insert button
    const checkAndInsertButton = () => {
        const targetDiv = document.querySelector(CONFIG.targetSelector);
        if (targetDiv && !document.getElementById(CONFIG.buttonId)) {
            insertButton(targetDiv);
        }
    };

    // Try to find the element immediately before setting up observer
    checkAndInsertButton();

    // Set up the mutation observer that keeps running
    const observer = new MutationObserver((mutations) => {
        // Check if any of the mutations involve our target
        const shouldCheck = mutations.some(mutation => {
            // Check if added nodes might contain our target
            if (mutation.addedNodes.length) {
                return true;
            }

            // Check if target's attributes changed (might affect the selector)
            return !!(mutation.type === 'attributes' &&
                mutation.target.matches &&
                mutation.target.matches(CONFIG.targetSelector));

        });

        // Only perform the expensive DOM query if relevant changes occurred
        if (shouldCheck) {
            checkAndInsertButton();
        }
    });

    // Start observing with a configuration optimized for performance
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'] // Only watch for class changes
    });

    // Additional safeguard: periodically check in case any mutations were missed
    // This is lighter than setInterval as it adapts to browser's rendering cycle
    const periodicCheck = () => {
        checkAndInsertButton();
        if (!document.getElementById(CONFIG.buttonId)) {
            requestAnimationFrame(periodicCheck);
        }
    };

    // Start periodic checks using requestAnimationFrame
    requestAnimationFrame(periodicCheck);
}

// Message listener for popup communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extractMessageItems") {
        console.log('Received extractMessageItems request in frame:', window.location.href);

        // Extract message items from current frame
        const messageItems = document.querySelectorAll(CONFIG.messageItemSelector);
        const classNames = Array.from(messageItems).map(item => item.className);

        console.log(`Found ${messageItems.length} message items in current frame`);

        // If this is the main frame, coordinate collection from all frames
        if (window === window.top) {
            console.log('Main frame - coordinating collection from all frames');

            // Clear previous collection
            frameDataCollection.clear();

            // Add main frame data
            frameDataCollection.set('main', classNames.join(' '));

            // Send message to all frames to collect their data
            const frames = document.querySelectorAll('iframe');
            let pendingFrames = frames.length;

            if (pendingFrames === 0) {
                // No iframes, just return main frame data
                sendResponse({
                    success: true,
                    data: frameDataCollection.get('main') || ''
                });
                return;
            }

            // Set timeout to avoid waiting forever
            const timeout = setTimeout(() => {
                console.log('Timeout reached, returning collected data');
                const allData = Array.from(frameDataCollection.values()).join(' ');
                sendResponse({
                    success: true,
                    data: allData
                });
            }, 2000);

            // Function to handle frame responses
            const handleFrameResponse = (frameId, data) => {
                frameDataCollection.set(frameId, data);
                pendingFrames--;

                if (pendingFrames === 0) {
                    clearTimeout(timeout);
                    const allData = Array.from(frameDataCollection.values()).join(' ');
                    sendResponse({
                        success: true,
                        data: allData
                    });
                }
            };

            // Try to collect from each iframe
            frames.forEach((iframe, index) => {
                try {
                    const frameId = `frame_${index}`;
                    // Try to send message to frame's content script
                    if (iframe.contentWindow) {
                        iframe.contentWindow.postMessage({
                            action: 'extractMessageItems',
                            frameId: frameId
                        }, '*');
                    }

                    // Set individual frame timeout
                    setTimeout(() => {
                        if (!frameDataCollection.has(frameId)) {
                            console.log(`Frame ${frameId} didn't respond, continuing without it`);
                            handleFrameResponse(frameId, '');
                        }
                    }, 1000);
                } catch (error) {
                    console.log(`Could not access frame ${index}:`, error.message);
                    handleFrameResponse(`frame_${index}`, '');
                }
            });

            return true; // Keep message channel open for async response
        } else {
            // This is an iframe, just return its data
            console.log('Iframe responding with data');
            sendResponse({
                success: true,
                data: classNames.join(' ')
            });
        }
    }

    return false;
});

// Listen for messages from main frame (for iframe communication)
window.addEventListener('message', (event) => {
    if (event.data.action === 'extractMessageItems') {
        console.log('Iframe received extraction request');
        const messageItems = document.querySelectorAll(CONFIG.messageItemSelector);
        const classNames = Array.from(messageItems).map(item => item.className);

        // Send response back to main frame
        window.parent.postMessage({
            action: 'extractMessageItemsResponse',
            frameId: event.data.frameId,
            data: classNames.join(' ')
        }, '*');
    }
});

// In main frame, listen for iframe responses
if (window === window.top) {
    window.addEventListener('message', (event) => {
        if (event.data.action === 'extractMessageItemsResponse') {
            console.log(`Received response from ${event.data.frameId}`);
            frameDataCollection.set(event.data.frameId, event.data.data);
        }
    });
}

// Initialize the script
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observeForTarget);
} else {
    observeForTarget();
}