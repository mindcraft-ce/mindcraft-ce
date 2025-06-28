import { writeFileSync, mkdirSync, existsSync, appendFileSync, readFileSync, openSync, fstatSync, readSync, closeSync } from 'fs';
import { join } from 'path';
import settings from './settings.js'; // Import settings as default export
import path from 'path'; // Needed for path operations

// For external logging - using global fetch in Node.js 18+
// If you're using Node.js < 18, uncomment the line below:
// import fetch from 'node-fetch';

// --- Configuration ---
const LOGS_DIR = './logs';
const VISION_DATASET_DIR = join(LOGS_DIR, 'vision_dataset'); // HuggingFace dataset format
const VISION_IMAGES_DIR = join(VISION_DATASET_DIR, 'images'); // Images subdirectory

const EXTERNAL_LOGGING_URL = 'https://mindcraft.riqvip.dev/api/log'; // Base URL for external logging

// --- Log File Paths ---
const REASONING_LOG_FILE = join(LOGS_DIR, 'reasoning_logs.csv');
const NORMAL_LOG_FILE = join(LOGS_DIR, 'normal_logs.csv');
const VISION_METADATA_FILE = join(VISION_DATASET_DIR, 'metadata.jsonl'); // HF metadata format

// --- Log Headers ---
const TEXT_LOG_HEADER = 'input,output\n';

// --- Log Counters ---
let logCounts = {
    normal: 0,
    reasoning: 0,
    vision: 0,
    total: 0,
    skipped_disabled: 0,
    skipped_empty: 0,
    vision_images_saved: 0,
};

// --- Helper Functions ---
function ensureDirectoryExistence(dirPath) {
    if (!existsSync(dirPath)) {
        try {
            mkdirSync(dirPath, { recursive: true });
        } catch (error) {
            console.error(`[Logger] Error creating directory ${dirPath}:`, error);
            return false;
        }
    }
    return true;
}

function ensureLogFile(logFile, header) {
     if (!ensureDirectoryExistence(path.dirname(logFile))) return false; // Ensure parent dir exists

     if (!existsSync(logFile)) {
        try {
            writeFileSync(logFile, header);
            console.log(`[Logger] Created log file: ${logFile}`);
        } catch (error) {
            console.error(`[Logger] Error creating log file ${logFile}:`, error);
            return false;
        }
    } else {
         try {
            const content = readFileSync(logFile, 'utf-8');
            const headerLine = header.split('\n')[0];
            // If file is empty or header doesn't match, overwrite/create header
            if (!content.trim() || !content.startsWith(headerLine)) {
                 // Attempt to prepend header if file has content but wrong/no header
                 if(content.trim() && !content.startsWith(headerLine)) {
                    console.warn(`[Logger] Log file ${logFile} seems to be missing or has an incorrect header. Prepending correct header.`);
                    writeFileSync(logFile, header + content);
                 } else {
                    // File is empty or correctly headed, just ensure header is there
                     writeFileSync(logFile, header);
                 }
                 console.log(`[Logger] Ensured header in log file: ${logFile}`);
            }
        } catch (error) {
            console.error(`[Logger] Error checking/writing header for log file ${logFile}:`, error);
            // Proceed cautiously, maybe log an error and continue?
        }
    }
    return true;
}


function writeToLogFile(logFile, csvEntry) {
    try {
        appendFileSync(logFile, csvEntry);
        // console.log(`[Logger] Logged data to ${logFile}`); // Keep console less noisy
    } catch (error) {
        console.error(`[Logger] Error writing to CSV log file ${logFile}:`, error);
    }
}

// --- Auto-Detection for Log Type (Based on Response Content) ---
function determineLogType(response) {
    // Reasoning check: needs <think>...</think> but ignore the specific 'undefined' placeholder
    const isReasoning = response.includes('<think>') && response.includes('</think>') && !response.includes('<think>\nundefined</think>');

    if (isReasoning) {
        return 'reasoning';
    } else {
        return 'normal';
    }
}

function sanitizeForCsv(value) {
    if (typeof value !== 'string') {
        value = String(value);
    }
    // Escape double quotes by doubling them and enclose the whole string in double quotes
    return `"${value.replace(/"/g, '""')}"`;
}

// Helper function to clean reasoning markers from input
function cleanReasoningMarkers(input) {
    if (typeof input !== 'string') {
        return input;
    }
    
    // Remove /think and /no_think markers
    return input.replace(/\/think/g, '').replace(/\/no_think/g, '').trim();
}

function determineSubCategory(input, response) {
    const lowerInput = input.toLowerCase();
    const lowerResponse = response.toLowerCase();

    // --- Start of Improved JavaScript Detection Logic ---

    // 1. High-Confidence Check: Look for explicitly labeled JavaScript markdown blocks.
    // This is the fastest and most reliable indicator.
    const explicitJsBlockRegex = /```(javascript|js)\s*[\s\S]*?```/;
    if (explicitJsBlockRegex.test(lowerResponse)) {
        return 'coding';
    }

    // 2. Medium-Confidence Check: Look for generic code blocks that contain JS keywords.
    // This catches cases where the model forgets to label the code language.
    const genericBlockRegex = /```([\s\S]*?)```/g; // Use 'g' to find all blocks
    const jsKeywordsRegex = /\b(const|let|var|function|async|await|import|export|require|=>|document|window|console\.)\b/;
    
    let match;
    // Iterate through all generic code blocks found in the response.
    while ((match = genericBlockRegex.exec(lowerResponse)) !== null) {
        const blockContent = match[1]; // The content inside the ```
        // If the content of any block contains JS-specific keywords, classify as coding.
        if (jsKeywordsRegex.test(blockContent)) {
            return 'coding';
        }
    }

    // --- End of Improved Logic ---

    if (lowerInput.includes('update your memory')) {
        return 'summarization';
    } else {
        return 'gameplay'; // Default to gameplay
    }
}

// Helper function to clean imagePath from messages for text logs
function cleanImagePathFromMessages(input) {
    if (typeof input !== 'string') {
        return input;
    }
    
    try {
        let parsed = JSON.parse(input);

        // First, clean image paths (this part remains focused on image data)
        if (Array.isArray(parsed)) {
            parsed = parsed.map(msg => {
                let cleanedMsg = { ...msg };

                if (cleanedMsg.imagePath !== undefined) {
                    delete cleanedMsg.imagePath;
                }

                if (Array.isArray(cleanedMsg.content)) {
                    cleanedMsg.content = cleanedMsg.content.filter(part => 
                        part.type !== 'image_url' && 
                        !(part.type === 'image' && part.source)
                    );
                    
                    if (cleanedMsg.content.length === 0) {
                        cleanedMsg.content = "";
                    } else if (cleanedMsg.content.length === 1 && 
                               cleanedMsg.content[0].type === 'text' && 
                               !cleanedMsg.content[0].text?.trim()) {
                        cleanedMsg.content = "";
                    }
                }
                return cleanedMsg;
            });
        } else if (typeof parsed === 'object' && parsed !== null) {
            // Handle single message object if it's not an array
            if (parsed.imagePath !== undefined) {
                delete parsed.imagePath;
            }
            if (Array.isArray(parsed.content)) {
                parsed.content = parsed.content.filter(part => 
                    part.type !== 'image_url' && 
                    !(part.type === 'image' && part.source)
                );
                if (parsed.content.length === 0) {
                    parsed.content = "";
                } else if (parsed.content.length === 1 && 
                           parsed.content[0].type === 'text' && 
                           !parsed.content[0].text?.trim()) {
                    parsed.content = "";
                }
            }
        }
        // Return the cleaned (but not yet anonymized) parsed object or string
        return parsed;
    } catch (e) {
        // If not valid JSON, return the plain string as is. Anonymization will happen later.
        return input;
    }
}

// Helper function to format conversation history as fallback
function formatConversationInput(conversationHistory) {
    if (!conversationHistory || conversationHistory.length === 0) return '';
    
    const formattedHistory = [];
    
    for (const turn of conversationHistory) {
        const formattedTurn = {
            role: turn.role || 'user',
            content: []
        };

        // Handle different content formats
        if (typeof turn.content === 'string') {
            formattedTurn.content.push({
                type: 'text',
                text: turn.content
            });
        } else if (Array.isArray(turn.content)) {
            // Already in the correct format
            formattedTurn.content = turn.content;
        } else if (turn.content && typeof turn.content === 'object') {
            // Convert object to array format
            if (turn.content.text) {
                formattedTurn.content.push({
                    type: 'text',
                    text: turn.content.text
                });
            }
            if (turn.content.image) {
                formattedTurn.content.push({
                    type: 'image',
                    image: turn.content.image
                });
            }
        }

        formattedHistory.push(formattedTurn);
    }
    
    return JSON.stringify(formattedHistory);
}

function printSummary() {
    const totalStored = logCounts.normal + logCounts.reasoning + logCounts.vision;
    console.log('\n' + '='.repeat(60));
    console.log('LOGGER SUMMARY');
    console.log('-'.repeat(60));
    console.log(`Normal logs stored:    ${logCounts.normal}`);
    console.log(`Reasoning logs stored: ${logCounts.reasoning}`);
    console.log(`Vision logs stored:    ${logCounts.vision} (Images saved: ${logCounts.vision_images_saved})`);
    console.log(`Skipped (disabled):    ${logCounts.skipped_disabled}`);
    console.log(`Skipped (empty/err):   ${logCounts.skipped_empty}`);
    console.log('-'.repeat(60));
    console.log(`Total logs stored:     ${totalStored}`);
    console.log('='.repeat(60) + '\n');
}

// --- Main Logging Function (for text-based input/output) ---
export async function log(input, response) { // Made async to support fetch
    const trimmedInputStr = input ? (typeof input === 'string' ? input.trim() : JSON.stringify(input)) : "";
    const trimmedResponse = response ? String(response).trim() : ""; // Ensure response is a string

    // Clean reasoning markers from input before logging
    let processedInput = cleanReasoningMarkers(trimmedInputStr);
    
    // Clean imagePath from messages. This returns an object or string.
    processedInput = cleanImagePathFromMessages(processedInput);

    // If processedInput is an object (from JSON.parse), stringify it before logging
    const finalInputString = typeof processedInput === 'object' ? JSON.stringify(processedInput) : processedInput;

    // Basic filtering
    if (!finalInputString && !trimmedResponse) { // Use raw strings for filtering
        logCounts.skipped_empty++;
        return;
    }
    if (finalInputString === trimmedResponse) { // Use raw strings for filtering
         logCounts.skipped_empty++;
        return;
    }
     // Avoid logging common error messages that aren't useful training data
    const errorMessages = [
        "My brain disconnected, try again.",
        "My brain just kinda stopped working. Try again.",
        "I thought too hard, sorry, try again.",
        "*no response*",
        "No response received.",
        "No response data.",
        "Failed to send", // Broader match
        "Error:", // Broader match
        "Vision is only supported",
        "Context length exceeded",
        "Image input modality is not enabled",
        "An unexpected error occurred"
        // Add more generic errors/placeholders as needed
    ];
    
    // Check which error message is matching (if any)
    const matchingErrorMessage = errorMessages.find(err => trimmedResponse.includes(err));
    const isRepeatedInput = trimmedResponse === finalInputString;
    
    if (matchingErrorMessage || isRepeatedInput) {
        logCounts.skipped_empty++;
        return;
    }

    const logType = determineLogType(trimmedResponse); // Use raw response for type determination
    const subCategory = determineSubCategory(finalInputString, trimmedResponse); // Use raw inputs
    let logFile;
    let header;
    let settingFlag;

    switch (logType) {
        case 'reasoning':
            logFile = REASONING_LOG_FILE;
            header = TEXT_LOG_HEADER;
            settingFlag = settings.log_reasoning_data;
            break;
        case 'normal':
        default:
            logFile = NORMAL_LOG_FILE;
            header = TEXT_LOG_HEADER;
            settingFlag = settings.log_normal_data;
            break;
    }

    // Check if logging for this type is enabled (either local or external)
    if (!settingFlag && !settings.external_logging) {
        logCounts.skipped_disabled++;
        return;
    }

    // Prepare the CSV entry using the sanitizer with raw inputs
    const safeInput = sanitizeForCsv(finalInputString); 
    const safeResponse = sanitizeForCsv(trimmedResponse); 
    const csvEntry = `${safeInput},${safeResponse}\n`;

    // Perform external logging if enabled
    if (settings.external_logging) {
        try {
            const endpoint = `${EXTERNAL_LOGGING_URL}/${logType === 'reasoning' ? 'reasoning-logs' : 'normal-logs'}`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input: finalInputString,
                    output: trimmedResponse,
                    timestamp: Math.floor(Date.now() / 1000)
                })
            });
        } catch (error) {
            console.error(`[Logger] External logging error: ${error.message}`);
        }
    }

    // Perform local logging if the setting is enabled (regardless of external logging)
    if (settingFlag) {
        // Ensure directory and file exist
        if (!ensureLogFile(logFile, header)) {
            return;
        }

        // Write to the determined log file
        writeToLogFile(logFile, csvEntry);
    }

    // Update counts
    logCounts[logType]++;
    logCounts.total++; // Total here refers to text logs primarily

    // Display summary periodically (based on total text logs)
    if (logCounts.normal + logCounts.reasoning > 0 && (logCounts.normal + logCounts.reasoning) % 20 === 0) {
       printSummary();
    }
}

// --- Enhanced Vision Logging Function for HuggingFace Dataset Format ---
export async function logVision(conversationHistory, imageBuffer, response, visionMessage = null) { // Made async
    if (!settings.log_vision_data && !settings.external_logging) {
        logCounts.skipped_disabled++;
        return;
    }

    let resolvedResponse = response;
    if (response && typeof response.then === 'function') {
        try {
            resolvedResponse = await response;
        } catch (error) {
            console.error("[Logger] Error resolving response promise:", error);
            resolvedResponse = "[Error resolving promise]"; // Fallback in case of rejection
        }
    }

    const trimmedResponse = resolvedResponse ? String(resolvedResponse).trim() : "";
    
    if (!conversationHistory || conversationHistory.length === 0 || !trimmedResponse || !imageBuffer) {
        logCounts.skipped_empty++;
        console.log(`[Logger] Skipping vision log: Empty history, response, or image. Response: "${trimmedResponse}"`);
        return;
    }

    // Filter out error messages
    const errorMessages = [
        "My brain disconnected, try again.",
        "My brain just kinda stopped working. Try again.",
        "I thought too hard, sorry, try again.",
        "*no response*",
        "No response received.",
        "No response data.",
        "Failed to send",
        "Error:",
        "Vision is only supported",
        "Context length exceeded",
        "Image input modality is not enabled",
        "An unexpected error occurred",
        "Image captured for always active vision", // Filter out placeholder responses
    ];
    
    if (errorMessages.some(err => trimmedResponse.includes(err))) {
        logCounts.skipped_empty++;
        console.log(`[Logger] Skipping vision log: Response contains error message. Response: "${trimmedResponse}"`);
        return;
    }

    // Determine log type for vision as well
    const logType = determineLogType(trimmedResponse);

    // Deep copy conversationHistory to avoid modifying the original object
    let processedConversationHistory = JSON.parse(JSON.stringify(conversationHistory));

    // Helper to clean image paths from the object directly
    function cleanImagePathsFromObject(obj) {
        if (Array.isArray(obj)) {
            return obj.map(msg => {
                let cleanedMsg = { ...msg };
                if (cleanedMsg.imagePath !== undefined) {
                    delete cleanedMsg.imagePath;
                }
                if (Array.isArray(cleanedMsg.content)) {
                    cleanedMsg.content = cleanedMsg.content.filter(part => 
                        part.type !== 'image_url' && 
                        !(part.type === 'image' && part.source)
                    );
                    if (cleanedMsg.content.length === 0) {
                        cleanedMsg.content = "";
                    } else if (cleanedMsg.content.length === 1 && 
                               cleanedMsg.content[0].type === 'text' && 
                               !cleanedMsg.content[0].text?.trim()) {
                        cleanedMsg.content = "";
                    }
                }
                return cleanedMsg;
            });
        }
        // Handle single object case if needed, though conversationHistory is usually an array
        return obj;
    }

    processedConversationHistory = cleanImagePathsFromObject(processedConversationHistory);

    // Format the complete input as JSON (no anonymization)
    const inputData = JSON.stringify(processedConversationHistory);

    // Use raw response string
    const rawResponse = trimmedResponse;

    // Perform external logging if enabled
    if (settings.external_logging) {
        try {
            const endpoint = `${EXTERNAL_LOGGING_URL}/${logType}-vision`; // Vision logs now include type
            const payload = {
                input: inputData, // This is now the fully stringified input
                output: rawResponse,
                image: imageBuffer.toString('base64'), // Send image as base64 string
                timestamp: Date.now()
            };
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.error(`[Logger] Failed to send vision log to ${endpoint}: ${response.statusText}`);
            } else {
                // console.log(`[Logger] Successfully sent log to ${endpoint}`);
            }
        } catch (error) {
            console.error(`[Logger] Error sending vision log to external API:`, error);
        }
    }

    // Perform local logging if the setting is enabled (regardless of external logging)
    if (settings.log_vision_data) {
        // Ensure directories exist
        if (!ensureDirectoryExistence(VISION_DATASET_DIR)) return;
        if (!ensureDirectoryExistence(VISION_IMAGES_DIR)) return;

        try {
            // Generate unique filename for the image
            const timestamp = Date.now();
            const randomSuffix = Math.random().toString(36).substring(2, 8);
            const imageFilename = `vision_${timestamp}_${randomSuffix}.jpg`;
            const imagePath = join(VISION_IMAGES_DIR, imageFilename);
            const relativeImagePath = `images/${imageFilename}`; // Relative path for metadata

            // Save the image
            writeFileSync(imagePath, imageBuffer);
            logCounts.vision_images_saved++;

            // Create metadata entry in JSONL format for HuggingFace
            const metadataEntry = {
                file_name: relativeImagePath,
                input: inputData, // Cleaned JSON conversation history
                response: rawResponse, // Actual model response, not placeholder
                timestamp: timestamp
            };

            // Append to metadata JSONL file
            const jsonlLine = JSON.stringify(metadataEntry) + '\n';
            appendFileSync(VISION_METADATA_FILE, jsonlLine);
            
        } catch (error) {
            console.error(`[Logger] Error logging vision data:`, error);
        }
    }

    logCounts.vision++;
    logCounts.total++;

    // Display summary periodically
    if (logCounts.vision > 0 && logCounts.vision % 10 === 0) {
        printSummary();
    }
}

// Initialize counts at startup
function initializeCounts() {
    // Set all counts to 0 at startup to avoid reading large files,
    // which can cause performance issues or crashes.
    // Log counts will be for the current session only.
    logCounts.normal = 0;
    logCounts.reasoning = 0;
    logCounts.vision = 0;
    logCounts.total = 0;
    logCounts.skipped_disabled = 0;
    logCounts.skipped_empty = 0;
    logCounts.vision_images_saved = 0;

    console.log(`[Logger] Initialized session-based log counts.`);

    if (settings.external_logging) {
        console.log('\n' + '='.repeat(60));
        console.log('EXTERNAL LOGGING ENABLED');
        console.log('Data will be sent to mindcraft.riqvip.dev/api/log');
        console.log('The data will only be used to train future Andy models');
        console.log('We only collect the messages you send to the agent');
        console.log('And no other information.');
        console.log('');
        console.log('We recommend leaving this on to make Mindcraft-CE better!');
        console.log('='.repeat(60) + '\n');
        // Send usernames to the server is now handled by the agent
    }
}

// Function to send usernames to the server
export async function sendUsernames(bot) {
    if (!bot) {
        console.error('[Logger] sendUsernames was called without a bot object.');
        return;
    }
    // Get usernames from the bot.players object
    const usernames = Object.keys(bot.players);

    if (usernames.length === 0) {
        console.log('[Logger] No players found, not sending usernames.');
        return;
    }

    try {
        const endpoint = `${EXTERNAL_LOGGING_URL}/usernames`;
        const payload = {
            usernames: usernames,
            timestamp: Date.now()
        };
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error(`[Logger] Failed to send usernames to ${endpoint}: ${response.statusText}`);
        } else {
            console.log(`[Logger] Successfully sent usernames to the server.`);
        }
    } catch (error) {
        console.error(`[Logger] Error sending usernames to external API:`, error);
    }
}

// Initialize counts at startup
initializeCounts();
