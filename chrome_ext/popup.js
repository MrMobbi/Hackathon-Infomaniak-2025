// Popup script for managing API token and previewing parsed message data

import {queryActiveTab, sendMessageToTab, storageGet, storageSet,} from "./shared/chrome.js";
import {parseMailPattern} from "./shared/mail.js";


// ---- DOM references ----
const tokenInput = document.getElementById("tokenInput");
const saveButton = document.getElementById("saveTokenButton");
const contentOutput = document.getElementById("content");
const urlsOutput = document.getElementById("urls");
const callApiButton = document.getElementById("callApiButton");
const contentAPI = document.getElementById("contentAPI");

// ---- Token persistence ----
async function loadSavedToken() {
    try {
        const {apiToken} = await storageGet("apiToken");
        if (apiToken) tokenInput.value = apiToken;
    } catch (e) {
        console.warn("Failed to load token:", e);
    }
}

async function saveApiToken() {
    const tokenValue = tokenInput.value.trim();

    if (!tokenValue) {
        alert("Please enter a valid token.");
        return;
    }

    try {
        await storageSet({apiToken: tokenValue});
        alert("Token saved successfully!");
    } catch (e) {
        alert(`Error saving token: ${e.message || String(e)}`);
    }
}

/**
 * Display URL for the last thread using mailbox ID from storage
 * @param {{folderThreads: {threadId: string, folderId: string}[]}} parsedData
 */
async function displayUrlForLastThread(parsedData) {
    const folderThreads = parsedData.folderThreads || [];

    if (folderThreads.length === 0) {
        urlsOutput.textContent = "No thread found.";
        return;
    }

    try {
        const {mailboxIds = []} = await storageGet({mailboxIds: []});
        if (mailboxIds.length === 0) {
            urlsOutput.textContent = "No mailbox ID found.";
            return;
        }

        const mailboxId = mailboxIds[0];
        const lastThread = folderThreads[folderThreads.length - 1];
        urlsOutput.textContent = `/mail/${mailboxId}/folder/${lastThread.folderId}/thread/${lastThread.threadId}/event_suggestion`;
    } catch (e) {
        urlsOutput.textContent = `Error reading mailbox IDs: ${e.message || String(e)}`;
    }
}

async function fetchAndDisplayMessageContent() {
    contentOutput.textContent = "Loading…";
    urlsOutput.textContent = "";

    try {
        const tabs = await queryActiveTab();
        if (!tabs.length) {
            contentOutput.textContent = "No active tab found.";
            return;
        }

        const response = await sendMessageToTab(tabs[0].id, {action: "extractMessageItems"});

        if (response && response.success) {
            const parsedContent = parseMailPattern(response.data);
            contentOutput.textContent = JSON.stringify(parsedContent, null, 2);
            await displayUrlForLastThread(parsedContent);
        } else {
            contentOutput.textContent = "Failed to extract message items: " + (response?.error || "Unknown error");
        }
    } catch (e) {
        contentOutput.textContent = `Error: ${e.message || String(e)}`;
    }
}

function getUrgencyTag(score) {
    if (score >= 8000) return { label: "Critical", className: "urgency-critical"};
    if (score >= 6000) return { label: "High", className: "urgency-high"};
    if (score >= 4000) return { label: "Medium", className: "urgency-medium"};
    return { label: "Low", className: "urgency-low"};
}

function renderMails(data) {
    const mailList = document.getElementById("mailList");
    mailList.innerHTML = ""; // clear previous

    if (!data.emails || data.emails.length === 0) {
        mailList.textContent = "No emails found.";
        return;
    }

    const category = (data.category || "uncategorized").toLowerCase();
    const tagClass = {
        work: "tag-work",
        social: "tag-social",
        newsletter: "tag-newsletter",
        spam: "tag-spam",
    }[category] || "tag-uncategorized";

    const email = data.emails[0];
    const urgency = getUrgencyTag(data.urgency_score || 0);

    const mailItem = document.createElement("div");
    mailItem.className = "mail-item";

    const mailText = document.createElement("span");
    mailText.className = "mail-text";
    mailText.textContent = email;

    const mailTag = document.createElement("span");
    mailTag.className = `mail-tag ${tagClass}`;
    mailTag.textContent = category;

    const urgencyTag = document.createElement("span");
    urgencyTag.className = `mail-urgency ${urgency.className}`;
    urgencyTag.textContent = `${urgency.label}`;

    mailItem.appendChild(mailText);
    mailItem.appendChild(mailTag);
    mailItem.appendChild(urgencyTag);

    mailList.appendChild(mailItem);
}

async function callBackendApi() {
    await fetchAndDisplayMessageContent();

    try {
        const { apiToken } = await storageGet("apiToken");
        if (!apiToken) {
            alert("No API token saved. Please enter one in the popup.");
            return;
        }

        const url = `http://127.0.0.1:8000${document.getElementById('urls').innerHTML}`;
        const body = document.getElementById('content').innerHTML;

        const response = await fetch(url, {
            method: "POST",
            body,
            headers: {
                Authorization: `Bearer ${apiToken}`,
                "Content-Type": "application/json",
            },
        });

        const json = await response.json();
        contentAPI.innerHTML = JSON.stringify(json, null, 2);
        renderMails(json);
    } catch (e) {
        contentAPI.innerHTML = `API error: ${e.message || String(e)}`;
    }
}



// ---- Event Listeners ----
document.addEventListener("DOMContentLoaded", loadSavedToken, {once: true});
saveButton.addEventListener("click", () => void saveApiToken());
callApiButton.addEventListener("click", () => callBackendApi());
