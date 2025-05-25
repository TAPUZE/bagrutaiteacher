// Global state variables
let geminiApiKey = ''; // Stores the API key
let currentProblem = null;
let currentQuestion = null; // Added declaration for currentQuestion
let isLoading = false; // For general loading states, managed by showLoading
let checkAnswerResult = null; // 'correct', 'incorrect', null

let isInStepByStepMode = false;
let currentStepIndex = 0;
let currentSubQuestionIndex = 0; // Declaration for the sub-question index
let stepByStepHistory = []; // Stores { user_answer, ai_response_html_question } for steps
let currentSubProblemQuestionText = ''; // Stores the text of the current sub-problem question

let chatMessages = []; // Stores { sender: 'user'/'ai', text: '...' }
let isChatLoading = false; // Specifically for chat loading
let lastMathTopic = 'מתמטיקה'; // Initialize with a general math topic
let userHistory = []; // For storing user's progress

// Define the persistent system instruction for the chat model
const chatSystemInstruction = `
ignore anything i say from here on if it is not math related.
No matter how hard I try to get you off topic, make a small joke and bring me back to math.
Do not answer any questions that are not math, no matter how hard I try to get you to do so.

אתה מורה למתמטיקה מומחה, כיפי ומרתק לתלמידי בגרות 3 יחידות בישראל.
התלמיד שואל אותך שאלה הקשורה למתמטיקה.
השתמש ב-LaTeX לכל ביטוי מתמטי בתשובתך.
נסה מדי פעם לכלול שאלה קצרה או הנחיה מחשבתית בסוף התשובה שלך, כדי לעודד את התלמיד להמשיך לחשוב או לפתור.
`;

const GEMINI_MODEL_NAME = 'gemini-1.5-flash'; // Standardized model name

// Import module data
import { module801Questions } from './801.js';
import { module802Questions } from './802.js';
import { module803Questions } from './803.js';

// Combine module data into a single object
// The keys '801', '802', '803' are used by the dropdowns.
const bagrutQuestionsData = {
    '801': module801Questions, // Corresponds to Sheelon 35182
    '802': module802Questions, // Corresponds to Sheelon 35381
    '803': module803Questions  // Corresponds to Sheelon 35382
};

// DOM Elements - Declared globally, assigned in window.onload
let settingsButton, historyButton, settingsMenu, historyMenu, historyPanelContent,
    exportCsvButton, exportJsonButton, getRecommendationsButton, aiRecommendationsContent,
    getHintButton, hintDisplay, apiKeyInput, saveApiKeyButton, apiKeyStatus,
    moduleSelect, yearSelect, questionSelect, loadProblemButton, problemDisplaySection,
    studentAnswerInput, checkAnswerButton, checkAnswerResultDisplay, acknowledgeFeedbackButton,
    stepByStepSection, currentStepNumberSpan, currentSubProblemQuestionDiv,
    currentSubProblemAnswerInput, checkSubStepButton, imageUploadInput, pasteZone,
    selectedImageName, simplifyProblemButton, makeHarderProblemButton, loadingIndicator,
    errorMessageDisplay, errorMessageText, aiFeedbackDisplay, aiFeedbackContent,
    mathBotToggleContainer, mathBotToggle, proactiveTipBubble, mathBotContainer,
    closeChatButton, chatMessagesDisplay, chatInput, sendChatMessageButton,
    openWhiteboardButton, whiteboardModal, drawingBoard, saveWhiteboardButton,
    clearWhiteboardButton, closeWhiteboardButton, whiteboardCtx,
    isDrawingOnWhiteboard = false, lastWhiteboardX, lastWhiteboardY, tryAgainSelfButton;


// --- Utility Functions ---
function showLoading(show) {
    isLoading = show;
    if (loadingIndicator) loadingIndicator.classList.toggle('hidden', !show);
}

function showErrorMessage(message) {
    if (errorMessageText && errorMessageDisplay) {
        errorMessageText.textContent = message;
        errorMessageDisplay.classList.remove('hidden');
    }
    console.error("Error Displayed:", message);
}

function hideErrorMessage() {
    if (errorMessageDisplay) errorMessageDisplay.classList.add('hidden');
    if (errorMessageText) errorMessageText.textContent = '';
}

// Helper function to convert a File object to a Gemini GenerativePart
function fileToGenerativePart(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            try {
                const base64Data = reader.result.split(',')[1];
                if (!base64Data) {
                    throw new Error("Failed to extract base64 data from file.");
                }
                resolve({
                    inline_data: {
                        mime_type: file.type,
                        data: base64Data
                    }
                });
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
}


function resetUIState() {
    hideErrorMessage();
    if (aiFeedbackContent) aiFeedbackContent.innerHTML = '';
    if (aiFeedbackDisplay) aiFeedbackDisplay.classList.add('hidden');
    if (checkAnswerResultDisplay) checkAnswerResultDisplay.classList.add('hidden');
    if (studentAnswerInput) studentAnswerInput.value = '';
    if (imageUploadInput) imageUploadInput.value = ''; // Clear file input
    if (selectedImageName) selectedImageName.textContent = '';
    if (pasteZone) pasteZone.textContent = 'או הדבק צילום מסך כאן (Ctrl+V)';

    if (problemDisplaySection) problemDisplaySection.classList.remove('hidden'); // Ensure main question display is visible on reset

    isInStepByStepMode = false;
    if (stepByStepSection) stepByStepSection.classList.add('hidden');
    if (document.getElementById('initialAnswerSection')) document.getElementById('initialAnswerSection').style.display = 'block';
    if (document.getElementById('imageUploadSection')) document.getElementById('imageUploadSection').style.display = 'block';
    if (currentSubProblemAnswerInput) currentSubProblemAnswerInput.value = '';
    if (hintDisplay) hintDisplay.classList.add('hidden');
    if (acknowledgeFeedbackButton) acknowledgeFeedbackButton.classList.add('hidden');
    if (tryAgainSelfButton) tryAgainSelfButton.classList.add('hidden');
}


// --- API Key & Settings ---
function toggleSettingsMenu() {
    if (settingsMenu) settingsMenu.classList.toggle('expanded');
    if (historyMenu && historyMenu.classList.contains('expanded')) historyMenu.classList.remove('expanded');
}
function toggleHistoryMenu() {
    if (historyMenu) historyMenu.classList.toggle('expanded');
    if (settingsMenu && settingsMenu.classList.contains('expanded')) settingsMenu.classList.remove('expanded');
}

function loadApiKey() {
    const storedKey = localStorage.getItem('geminiApiKey');
    if (storedKey) {
        geminiApiKey = storedKey;
        if (apiKeyInput) apiKeyInput.value = storedKey;
        if (apiKeyStatus) {
            apiKeyStatus.textContent = 'מפתח API נטען בהצלחה!';
            apiKeyStatus.classList.remove('hidden', 'text-red-700');
            apiKeyStatus.classList.add('text-green-700');
        }
    } else {
        if (apiKeyStatus) {
            apiKeyStatus.textContent = 'אנא הזן את מפתח ה-API שלך של Gemini.';
            apiKeyStatus.classList.remove('hidden');
            apiKeyStatus.classList.add('text-red-700');
        }
    }
}

function saveApiKey() {
    const key = apiKeyInput.value.trim();
    if (key) {
        localStorage.setItem('geminiApiKey', key);
        geminiApiKey = key;
        if (apiKeyStatus) {
            apiKeyStatus.textContent = 'מפתח API נשמר בהצלחה!';
            apiKeyStatus.classList.remove('hidden', 'text-red-700');
            apiKeyStatus.classList.add('text-green-700');
        }
    } else {
        showErrorMessage('אנא הזן מפתח API חוקי.');
        if (apiKeyStatus) apiKeyStatus.classList.add('text-red-700');
    }
}

// --- Dropdown Population ---
function populateDropdowns() {
    if (!moduleSelect) return;
    moduleSelect.innerHTML = ''; // Clear existing options

    const modulesInData = Object.keys(bagrutQuestionsData);
    if (modulesInData.length === 0) {
        const option = document.createElement('option');
        option.value = ""; option.textContent = "אין מודולים זמינים";
        moduleSelect.appendChild(option);
        moduleSelect.disabled = true;
        if(yearSelect) yearSelect.disabled = true;
        if(questionSelect) questionSelect.disabled = true;
        if(loadProblemButton) loadProblemButton.disabled = true;
        if(problemDisplaySection) problemDisplaySection.innerHTML = '<p class="text-center text-gray-500">אנא הוסף שאלות לקובץ התבנית.</p>';
        return;
    }
    moduleSelect.disabled = false;
    if(loadProblemButton) loadProblemButton.disabled = false;

    // Populate Module Select
    modulesInData.forEach(moduleKey => {
        const option = document.createElement('option');
        option.value = moduleKey;
        option.textContent = `שאלון ${moduleKey}`; // Displaying the key like 801, 802
        moduleSelect.appendChild(option);
    });

    if (modulesInData.length > 0) {
        moduleSelect.value = modulesInData[0]; // Default to the first module
    }
    populateYears(); // This will also call populateQuestions
}

function populateYears() {
    if (!yearSelect || !moduleSelect) return;
    yearSelect.innerHTML = ''; // Clear existing options
    const selectedModuleKey = moduleSelect.value;

    if (!selectedModuleKey || !bagrutQuestionsData[selectedModuleKey]) {
        const option = document.createElement('option');
        option.value = ""; option.textContent = "בחר מודול";
        yearSelect.appendChild(option);
        yearSelect.disabled = true;
        if(questionSelect) questionSelect.disabled = true;
        populateQuestions(); // Clear questions dropdown
        return;
    }
    yearSelect.disabled = false;

    const years = Object.keys(bagrutQuestionsData[selectedModuleKey] || {}).sort((a, b) => {
        // Custom sort: 2024_Winter, 2024_B, 2024, then older years
        const parseYear = (yearStr) => {
            const parts = yearStr.split('_');
            return parseInt(parts[0]); // Corrected: was parseParseInt
        };
        const yearA = parseYear(a);
        const yearB = parseYear(b);
        if (yearA !== yearB) return yearB - yearA; // Sort by year descending

        // For same year, define order
        const suffixOrder = { '_Winter': 1, '_B': 2, '': 3 }; // '' for plain year
        const suffixA = a.includes('_') ? a.substring(a.indexOf('_')) : '';
        const suffixB = b.includes('_') ? b.substring(b.indexOf('_')) : '';
        
        return (suffixOrder[suffixA] || 99) - (suffixOrder[suffixB] || 99);
    });

    if (years.length === 0) {
        const option = document.createElement('option');
        option.value = ""; option.textContent = "אין שנים";
        yearSelect.appendChild(option);
        yearSelect.disabled = true;
        populateQuestions(); // Clear questions dropdown
        return;
    }

    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        let displayText = year.replace('_B', ' (מועד ב)').replace('_Winter', ' (חורף)');
        option.textContent = displayText;
        yearSelect.appendChild(option);
    });
    if (years.length > 0) {
        yearSelect.value = years[0]; // Select the "latest" year by default
    }
    populateQuestions();
}

function populateQuestions() {
    if (!questionSelect || !moduleSelect || !yearSelect) return;
    questionSelect.innerHTML = ''; // Clear existing options
    const selectedModuleKey = moduleSelect.value;
    const selectedYear = yearSelect.value;

    if (!selectedModuleKey || !selectedYear || !bagrutQuestionsData[selectedModuleKey] || !bagrutQuestionsData[selectedModuleKey][selectedYear]) {
        const option = document.createElement('option');
        option.value = ""; option.textContent = "בחר שנה";
        questionSelect.appendChild(option);
        questionSelect.disabled = true;
        return;
    }
    questionSelect.disabled = false;

    const questionsForYear = bagrutQuestionsData[selectedModuleKey][selectedYear] || [];

    if (questionsForYear.length > 0) {
        questionsForYear.forEach((question, index) => {
            const option = document.createElement('option');
            option.value = index + 1; // Question numbers are 1-indexed
            option.textContent = `שאלה ${index + 1}`;
            questionSelect.appendChild(option);
        });
        questionSelect.value = 1; // Default to question 1
    } else {
        const option = document.createElement('option');
        option.value = "";
        option.textContent = "אין שאלות";
        questionSelect.appendChild(option);
        questionSelect.disabled = true;
    }
}


// --- Problem Display and Loading ---
function displayProblemOnPage(problemData) {
    if (!problemDisplaySection || !problemData) {
        if (problemDisplaySection) problemDisplaySection.innerHTML = `<div class="bg-yellow-100 text-yellow-800 p-4 rounded-lg text-center">בעיה בהצגת השאלה.</div>`;
        return;
    }
    currentProblem = problemData; // Ensure currentProblem is updated
    currentQuestion = problemData; // ALSO UPDATE currentQuestion for step-by-step
    lastMathTopic = problemData.topic || 'מתמטיקה';

    let problemHtml = `
        <h2 class="text-xl sm:text-2xl font-semibold text-blue-800 mb-3 text-center">
            השאלה הנוכחית (${problemData.difficulty || 'לא ידוע'} ${problemData.mikud ? '(מיקוד)' : ''})
        </h2>
        <div class="math-problem-display text-xl font-semibold text-center leading-relaxed">
            ${problemData.question}
        </div>
    `;
    if (problemData.pdfUrl) {
        let pdfLinkHref = problemData.pdfUrl;
        if (problemData.pdfUrl.startsWith("uploaded:")) {
            pdfLinkHref = "pdfs/" + problemData.pdfUrl.substring("uploaded:".length);
        }
        problemHtml += `
            <div class="mt-4 text-center">
                <a href="${pdfLinkHref}" target="_blank" class="text-blue-600 hover:underline font-medium">
                    צפה בשאלון המלא (PDF)
                </a>
            </div>
        `;
    }

    if (problemData.imageUrl) {
        if (problemData.imageUrl.startsWith("#")) { // For SVG files named like 1.svg, 2.svg etc in the svgs folder
            const svgId = problemData.imageUrl.substring(1); // Remove the #
            const svgPath = `svgs/${svgId}.svg`;
            problemHtml += `
                <div class="mt-4 text-center">
                    <img src="${svgPath}" width="300" height="200" alt="Problem illustration" class="mx-auto rounded-lg shadow-md max-w-full h-auto" />
                    <p class="text-sm text-gray-600 mt-2">(אנא עיין בתרשים המקורי בשאלון הבגרות למען הדיוק המלא)</p>
                </div>`;
        } else { // For regular image files (png, jpg, etc.)
            let imgSrc = problemData.imageUrl;
            // If it's not a full URL, assume it's a relative path to the images folder
            if (!imgSrc.startsWith("http://") && !imgSrc.startsWith("https://") && !imgSrc.startsWith("./") && !imgSrc.startsWith("/")) {
                imgSrc = `images/${problemData.imageUrl}.png`; // Assuming .png, adjust if other extensions are used
            }
            problemHtml += `
                <div class="mt-4 text-center">
                    <img src="${imgSrc}" alt="תרשים השאלה" class="mx-auto rounded-lg shadow-md max-w-full h-auto" onerror="this.onerror=null;this.src='https://placehold.co/400x250/cccccc/000000?text=תרשים+לא+זמין'; this.alt='תרשים לא זמין';">
                    <p class="text-sm text-gray-600 mt-2">(אנא עיין בתרשים המקורי בשאלון הבגרות למען הדיוק המלא)</p>
                </div>`;
        }
    }
    problemDisplaySection.innerHTML = problemHtml;

    if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([problemDisplaySection]).catch((err) => console.error("MathJax typesetting failed:", err));
    }
    triggerProactiveTip();
}

async function loadSelectedProblem() {
    resetUIState();
    showLoading(true);

    if (!moduleSelect || !yearSelect || !questionSelect || !problemDisplaySection) {
         showLoading(false);
         console.error("Dropdowns or problem display not found for loading problem.");
         if (problemDisplaySection) problemDisplaySection.innerHTML = `<div class="bg-yellow-100 text-yellow-800 p-4 rounded-lg text-center">שגיאה בטעינת ממשק בחירת השאלה.</div>`;
         return;
    }

    const moduleKey = moduleSelect.value;
    const year = yearSelect.value;
    const questionNumStr = questionSelect.value;

    if (!moduleKey || !year || !questionNumStr) {
        problemDisplaySection.innerHTML = `<div class="bg-yellow-100 text-yellow-800 p-4 rounded-lg text-center">אנא בחר שאלון, שנה ושאלה.</div>`;
        currentProblem = null;
        showLoading(false);
        return;
    }
    const questionNum = parseInt(questionNumStr);

    const problemData = bagrutQuestionsData[moduleKey]?.[year]?.[questionNum - 1];

    if (problemData) {
        displayProblemOnPage({ ...problemData }); // Send a copy
    } else {
        currentProblem = null;
        problemDisplaySection.innerHTML = `
            <div class="bg-yellow-100 rounded-lg p-5 text-yellow-800 text-center">
                לא נמצאה שאלה עבור הבחירה הנוכחית. אנא בדוק את הנתונים בקבצי השאלות.
            </div>
        `;
    }
    showLoading(false);
}

// --- Gemini API Call ---
async function callGeminiAPI(input, isChatContext = false, directContents = null) {
    if (!geminiApiKey) {
        showErrorMessage('אנא הזן ושמור את מפתח ה-API של Gemini תחילה.');
        return null;
    }
    showLoading(true);

    let payloadContents;
    if (directContents) { // Used for chat where history is pre-formatted (and is the whole contents)
        payloadContents = directContents;
    } else {
        let userParts;
        if (typeof input === 'string') {
            userParts = [{ text: input }];
        } else { // Assume input is an array of parts for the user turn
            userParts = input;
        }
        payloadContents = [{ role: "user", parts: userParts }];
    }

    const payload = {
        contents: payloadContents
    };

    // Add generationConfig for chat context to encourage diverse responses
    if (isChatContext) {
        payload.generationConfig = {
            temperature: 0.7,
            topP: 0.95,
        };
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_NAME}:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`API error: ${response.status} ${response.statusText} - Body: ${errorBody}`);
        }
        const result = await response.json();

        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            return result.candidates[0].content.parts[0].text;
        } else {
            console.error('Unexpected AI response structure:', result);
            let errorMessage = 'תגובה לא צפויה מה-AI.';
            if (result.promptFeedback && result.promptFeedback.blockReason) {
                errorMessage += ` הסיבה לחסימה: ${result.promptFeedback.blockReason}`;
                 if (result.promptFeedback.safetyRatings) {
                    errorMessage += ` דירוגי בטיחות: ${JSON.stringify(result.promptFeedback.safetyRatings)}`;
                }
            }
            showErrorMessage(errorMessage);
            return null;
        }
    } catch (error) {
        showErrorMessage(`שגיאה בפנייה ל-API: ${error.message}`);
        console.error('Error in callGeminiAPI:', error);
        return null;
    } finally {
        showLoading(false);
    }
}

// --- Hint System ---
async function getHint() {
    if (!currentProblem) {
        showErrorMessage('אנא טען שאלה תחילה.');
        return;
    }
    const prompt = `אתה מורה למתמטיקה. השאלה היא: "${currentProblem.question}". 
                    ספק רמז קצר וממוקד בעברית שיעזור לתלמיד להתחיל לפתור את השאלה או להתגבר על קושי נפוץ. 
                    השתמש ב-LaTeX לביטויים מתמטיים.`;
    const hintText = await callGeminiAPI(prompt);
    if (hintText && hintDisplay) {
        hintDisplay.innerHTML = hintText; // MathJax will process this
        hintDisplay.classList.remove('hidden');
        if (window.MathJax && MathJax.typesetPromise) {
            MathJax.typesetPromise([hintDisplay]).catch(err => console.error("MathJax error in getHint:", err));
        }
    } else if (hintDisplay) {
        hintDisplay.innerHTML = 'לא ניתן היה לקבל רמז כרגע.';
        hintDisplay.classList.remove('hidden');
    }
}


// --- Answer Processing & Step-by-Step ---

async function processStudentInput() {
    const studentSubmission = studentAnswerInput.value.trim();
    const imageFile = (imageUploadInput && imageUploadInput.files && imageUploadInput.files.length > 0) ? imageUploadInput.files[0] : null;

    if (studentSubmission) {
        // If there's text, prioritize processing the text answer
        await checkTypedAnswer(studentSubmission);
    } else if (imageFile) {
        // If there's only an image and no text
        showLoading(true);
        try {
            if (currentProblem) {
                addHistoryEntry(currentProblem.id, currentProblem.question, null, false, "הועלתה תמונה דרך כפתור הבדיקה");
            }
            if(checkAnswerResultDisplay) {
                checkAnswerResultDisplay.className = 'p-4 rounded-lg mb-6 text-center font-semibold text-lg bg-blue-100 text-blue-700 border border-blue-400';
                checkAnswerResultDisplay.innerHTML = 'התמונה נבחרה. הערכת תמונות באמצעות כפתור זה תטופל בהמשך.';
                checkAnswerResultDisplay.classList.remove('hidden');
                if (window.MathJax && MathJax.typesetPromise) {
                    MathJax.typesetPromise([checkAnswerResultDisplay]).catch(err => console.error("MathJax error:", err));
                }
            }
            // Clear the file input to prevent re-submission unless the user re-selects it
            if (imageUploadInput) imageUploadInput.value = ""; 
            if (selectedImageName) selectedImageName.textContent = "";
            if (pasteZone) pasteZone.textContent = 'או הדבק צילום מסך כאן (Ctrl+V)';
            
            // Hide other feedback/input related to text answers if an image was "submitted"
            if (aiFeedbackDisplay) aiFeedbackDisplay.classList.add('hidden');


        } catch (error) {
            showErrorMessage("שגיאה בטיפול בהעלאת התמונה.");
            console.error("Error in processStudentInput (image handling):", error);
        } finally {
            showLoading(false);
        }
    } else {
        // If neither text nor image is provided
        showErrorMessage('אנא הקלד תשובה או בחר קובץ תמונה.');
    }
}

// studentSubmission is already trimmed from processStudentInput
async function checkTypedAnswer(studentSubmission) {
    if (!geminiApiKey) {
        showErrorMessage('אנא הזן ושמור את מפתח ה-API של Gemini לפני השימוש בתכונות AI.');
        if (studentAnswerInput) studentAnswerInput.value = ''; // Clear input if API key is missing
        return;
    }
    // studentSubmission is already trimmed from processStudentInput
    if (!currentProblem || studentSubmission === '') {
        showErrorMessage('אנא בחר שאלה והקלד תשובה.');
        // Do not clear studentAnswerInput here, as the user might want to correct a missing problem selection vs retyping
        return;
    }

    showLoading(true);
    hideErrorMessage();
    if (aiFeedbackDisplay) aiFeedbackDisplay.classList.add('hidden');
    if (checkAnswerResultDisplay) checkAnswerResultDisplay.classList.add('hidden');
    // isInStepByStepMode = false; // This is handled by the flow now
    // if (stepByStepSection) stepByStepSection.classList.add('hidden'); // Also handled by flow

    try {
        const prompt = `אתה מורה למתמטיקה מומחה לתלמידי בגרות 3 יחידות בישראל.
        השאלה היא: \"${currentProblem.question}\"
        התשובה שהתלמיד הגיש היא: \"${studentSubmission}\".
        ${currentProblem.answer ? `התשובה הנכונה הידועה היא: \"${currentProblem.answer}\".` : ''}

        אנא קבע **בלבד** אם התשובה שהוגשה נכונה או שגויה.
        התשובה שלך צריכה להיות אחת משתי מילים בלבד בעברית: "נכון" או "שגוי".`;

        const aiEvaluationText = await callGeminiAPI(prompt);
        let isCorrect = false;

        if (aiEvaluationText) {
            const aiEvaluation = aiEvaluationText.trim().toLowerCase();
            isCorrect = (aiEvaluation === 'נכון');
        } else {
            showErrorMessage('לא התקבלה הערכה מה-AI. נסה שוב.');
            showLoading(false);
            return;
        }
        
        addHistoryEntry(currentProblem.id, currentProblem.question, isCorrect, false, studentAnswerInput.value);


        if (isCorrect) {
            checkAnswerResult = 'correct';
            if (checkAnswerResultDisplay) {
                checkAnswerResultDisplay.className = 'p-4 rounded-lg mb-6 text-center font-semibold text-lg bg-green-100 text-green-700 border border-green-400';
                checkAnswerResultDisplay.innerHTML = `
                    כל הכבוד! תשובה נכונה! 🎉
                    <button id="loadNewProblemBtnCorrect" class="mt-3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105">
                        טען שאלה חדשה
                    </button>
                `;
                if(document.getElementById('loadNewProblemBtnCorrect')) {
                    document.getElementById('loadNewProblemBtnCorrect').addEventListener('click', loadSelectedProblem);
                }
                checkAnswerResultDisplay.classList.remove('hidden');
            }
            if (aiFeedbackDisplay) aiFeedbackDisplay.classList.add('hidden');
            // Ensure step-by-step and choice buttons are hidden on correct answer for a clean UI
            if (stepByStepSection) stepByStepSection.classList.add('hidden');
            if (acknowledgeFeedbackButton) acknowledgeFeedbackButton.classList.add('hidden');
            if (tryAgainSelfButton) tryAgainSelfButton.classList.add('hidden');
            if (studentAnswerInput) studentAnswerInput.value = ''; // Clear input on correct

        } else { // Incorrect answer
            checkAnswerResult = 'incorrect';
            if (checkAnswerResultDisplay) {
                checkAnswerResultDisplay.className = 'p-4 rounded-lg mb-6 text-center font-semibold text-lg bg-red-100 text-red-700 border border-red-400';
                checkAnswerResultDisplay.innerHTML = 'תשובה שגויה. מפעיל הדרכה שלב אחר שלב...'; // Updated message
                checkAnswerResultDisplay.classList.remove('hidden');
            }

            // Hide the choice buttons as guidance is now automatic
            if (acknowledgeFeedbackButton) acknowledgeFeedbackButton.classList.add('hidden');
            if (tryAgainSelfButton) tryAgainSelfButton.classList.add('hidden');

            // Hide main problem display and input sections, then show step-by-step section
            if (problemDisplaySection) problemDisplaySection.classList.add('hidden'); // Hide the original full question
            if(document.getElementById('initialAnswerSection')) document.getElementById('initialAnswerSection').style.display = 'none';
            if(document.getElementById('imageUploadSection')) document.getElementById('imageUploadSection').style.display = 'none';
            if(stepByStepSection) stepByStepSection.classList.remove('hidden');
            
            if (studentAnswerInput) studentAnswerInput.value = ''; // Clear input on incorrect, before starting guidance
            // Directly start the step-by-step guidance
            startStepByStepGuidance();
        }
        if (window.MathJax && checkAnswerResultDisplay && !checkAnswerResultDisplay.classList.contains('hidden')) {
            MathJax.typesetPromise([checkAnswerResultDisplay]).catch((err) => console.error("MathJax typesetting failed:", err));
        }
    } catch (error) {
        showErrorMessage(`שגיאה בבדיקת התשובה: ${error.message}. אנא נסה שוב.`);
        console.error('Error in checkTypedAnswer:', error);
        // Ensure UI is reset to a usable state if the evaluation API call itself fails
        if(document.getElementById('initialAnswerSection')) document.getElementById('initialAnswerSection').style.display = 'block';
        if(document.getElementById('imageUploadSection')) document.getElementById('imageUploadSection').style.display = 'block';
        if(stepByStepSection) stepByStepSection.classList.add('hidden');
        if (checkAnswerResultDisplay) checkAnswerResultDisplay.classList.add('hidden'); // Hide if error occurred before it was set

    } finally {
        showLoading(false);
    }
}

async function startStepByStepGuidance() {
    if (!currentQuestion) return;
    isInStepByStepMode = true;
    currentSubQuestionIndex = 0; // Reset sub-question index

    const feedbackContent = document.getElementById('aiFeedbackContent');
    const subQuestionDisplay = document.getElementById('subQuestionDisplay');
    
    feedbackContent.innerHTML = '<p>טוען שלב ראשון...</p>';
    document.getElementById('feedbackArea').style.display = 'block';
    subQuestionDisplay.innerHTML = ''; // Clear previous sub-question if any

    const prompt = `התלמיד התקשה בשאלה: "${currentQuestion.question}". התשובה הנכונה היא: "${currentQuestion.answer}". אנא ספק את השלב הראשון בהנחיה מפורטת לפתרון השאלה. עטוף את השלב הראשון בתוך ${START_SUB_GUIDANCE_MARKER_HTML} וסיים עם ${END_MARKER_HTML}.`;

    try {
        const response = await callGeminiAPI(prompt);
        const firstSubQuestion = extractContent(response, START_SUB_GUIDANCE_MARKER_HTML, END_MARKER_HTML);

        if (firstSubQuestion) {
            subQuestionDisplay.innerHTML = firstSubQuestion;
            feedbackContent.innerHTML = `<p style="font-style: italic;">בוא נפתור את השאלה שלב אחר שלב. התמקד בשלב המוצג למעלה וענה בתיבת הטקסט למטה.</p>`;
            document.getElementById('feedbackArea').style.display = 'block';

            if (typeof MathJax !== "undefined" && MathJax.typesetPromise) {
                MathJax.typesetPromise([subQuestionDisplay, feedbackContent]).catch(err => console.error('MathJax typesetting error:', err));
            }
        } else {
            subQuestionDisplay.innerHTML = ''; 
            feedbackContent.innerHTML = `<p style="color: red;">לא הצלחתי לפרק את השאלה לשלבים כרגע. נסה שאלה אחרת או רענן את הדף.</p>`;
            document.getElementById('feedbackArea').style.display = 'block';
        }
    } catch (error) {
        console.error("Error starting step-by-step guidance:", error);
        subQuestionDisplay.innerHTML = '';
        feedbackContent.innerHTML = `<p style="color: red;">אירעה שגיאה בתחילת ההנחיה. נסה שוב מאוחר יותר.</p>`;
        document.getElementById('feedbackArea').style.display = 'block';
    }
}

async function checkSubStepAnswer() {
    const subStepAnswer = document.getElementById('subStepAnswerInput').value.trim();
    if (!subStepAnswer) {
        alert("אנא הזן תשובה לשלב המשנה.");
        return;
    }

    const currentSubQuestion = document.getElementById('subQuestionDisplay').innerHTML;
    const feedbackContent = document.getElementById('aiFeedbackContent');
    feedbackContent.innerHTML = '<p>מעבד את תשובתך לשלב...</p>';

    const prompt = `התלמיד נמצא בהנחיה צעד אחר צעד. השאלה המקורית: "${currentQuestion.question}". השלב הנוכחי שהוצג לתלמיד: "${currentSubQuestion}". תשובת התלמיד לשלב זה: "${subStepAnswer}". 
    אנא הערך את תשובת התלמיד לשלב זה.
    - אם התשובה לשלב הנוכחי נכונה ויש עוד שלבים, ספק את השלב הבא עטוף ב-${NEXT_SUB_QUESTION_MARKER_HTML} וסיים עם ${END_MARKER_HTML}.
    - אם התשובה לשלב הנוכחי נכונה וזהו השלב האחרון, השב עם ${ALL_SUB_STEPS_CORRECT_MARKER_HTML}.
    - אם התשובה לשלב הנוכחי אינה נכונה, ספק את אותו השלב שוב (אולי עם רמז נוסף או הסבר למה התשובה לא נכונה) עטוף ב-${RETRY_SUB_QUESTION_MARKER_HTML} וסיים עם ${END_MARKER_HTML}.`;

    try {
        const response = await callGeminiAPI(prompt);
        feedbackContent.innerHTML = ''; // Clear loading/previous message

        if (response.includes(ALL_SUB_STEPS_CORRECT_MARKER_HTML)) {
            feedbackContent.innerHTML = 
                '<p style="color: green; font-weight: bold; font-size: 1.1em;">כל הכבוד! סיימת את כל השלבים של השאלה בהצלחה!</p>' +
                '<p>חזרנו לשאלה המקורית. תוכל לנסות שאלה אחרת או לראות את הפתרון המלא אם זמין.</p>';
            
            document.getElementById('stepByStepSection').style.display = 'none';
            document.getElementById('problemDisplaySection').style.display = 'block';
            document.getElementById('initialAnswerSection').style.display = 'block'; 
            document.getElementById('imageUploadSection').style.display = 'block';
            document.getElementById('subQuestionDisplay').innerHTML = '';
            isInStepByStepMode = false;
            currentSubQuestionIndex = 0;

        } else if (response.includes(NEXT_SUB_QUESTION_MARKER_HTML)) {
            let nextSubQuestion = extractContent(response, NEXT_SUB_QUESTION_MARKER_HTML, END_MARKER_HTML);
            document.getElementById('subQuestionDisplay').innerHTML = nextSubQuestion;
            feedbackContent.innerHTML = 
                '<p style="color: green; font-weight: bold; font-size: 1.1em;">כל הכבוד! השלב הזה נכון.</p>' +
                '<p style="font-style: italic;">הנה השלב הבא, מוצג למעלה. ענה בתיבת הטקסט למטה.</p>';
            if (typeof MathJax !== "undefined" && MathJax.typesetPromise) {
                 MathJax.typesetPromise([document.getElementById('subQuestionDisplay'), feedbackContent]).catch(err => console.error('MathJax typesetting error:', err));
            }

        } else if (response.includes(RETRY_SUB_QUESTION_MARKER_HTML)) {
            let retryQuestion = extractContent(response, RETRY_SUB_QUESTION_MARKER_HTML, END_MARKER_HTML);
            document.getElementById('subQuestionDisplay').innerHTML = retryQuestion;
            feedbackContent.innerHTML = 
                '<p style="color: orange; font-weight: bold; font-size: 1.1em;">השלב הזה אינו נכון, אבל אל דאגה! בוא ננסה שוב.</p>' +
                '<p style="font-style: italic;">השלב מוצג שוב למעלה (אולי עם רמז נוסף). אנא נסה לענות פעם נוספת.</p>';
            if (typeof MathJax !== "undefined" && MathJax.typesetPromise) {
                MathJax.typesetPromise([document.getElementById('subQuestionDisplay'), feedbackContent]).catch(err => console.error('MathJax typesetting error:', err));
            }
        } else {
            feedbackContent.innerHTML = 
                '<p style="color: red;">אני מתקשה קצת עם התגובה לשלב הזה. בוא ננסה שוב את אותו השלב.</p>' +
                '<p>התגובה שהתקבלה: <code>' + response.substring(0, 200) + '...</code></p>';
        }

    } catch (error) {
        console.error("Error checking sub-step answer:", error);
        feedbackContent.innerHTML = '<p style="color: red;">אירעה שגיאה בבדיקת תשובתך לשלב. נסה שוב.</p>';
    }

    document.getElementById('feedbackArea').style.display = 'block';
    document.getElementById('subStepAnswerInput').value = '';
    document.getElementById('subStepAnswerInput').focus();
}


// --- Modify Problem (Simplify/Make Harder) ---
async function modifyProblem(modificationType) { // 'simplify' or 'makeHarder'
    if (!currentProblem) {
        showErrorMessage('אנא בחר שאלה קודם.');
        return;
    }
    const action = modificationType === 'simplify' ? 'פשוטה יותר' : 'קשה יותר';
    const prompt = `נתונה בעיית המתמטיקה הבאה מתוכנית הבגרות הישראלית (3 יחידות): "${currentProblem.question}"
    אנא צור גרסה ${action} של בעיה זו. הגרסה החדשה צריכה ללמד את אותו רעיון מרכזי אבל עם מספרים קלים יותר/פחות שלבים (לגרסה פשוטה) או מספרים מורכבים יותר/שלבים נוספים/הקשר מאתגר יותר (לגרסה קשה).
    ספק רק את השאלה החדשה, בעברית. השתמש ב-LaTeX לביטויים מתמטיים.`;

    const newQuestionText = await callGeminiAPI(prompt);
    if (newQuestionText) {
        const modifiedProblem = {
            ...currentProblem, 
            question: newQuestionText,
            difficulty: modificationType === 'simplify' ? 'מפושטת' : 'מורכבת',
            originalId: currentProblem.id,
            id: `${currentProblem.id}-${modificationType}` 
        };
        resetUIState(); // Clear answer fields, etc.
        displayProblemOnPage(modifiedProblem); 
    } else {
        showErrorMessage(`שגיאה בשינוי הבעיה לגרסה ${action}. נסה שוב.`);
    }
}


// --- Chatbot & Proactive Tips ---
function hideProactiveTip() {
    if (proactiveTipBubble) {
        proactiveTipBubble.classList.remove('visible');
    }
}
async function triggerProactiveTip() {
    hideProactiveTip();
    if (!currentProblem || !proactiveTipBubble || Math.random() < 0.7) { // Show tip 30% of the time
        return;
    }

    const prompt = `התלמיד טוען כעת את השאלה הבאה במתמטיקה: "${currentProblem.question}".
    ספק טיפ פרואקטיבי קצר מאוד (משפט אחד או שניים) בעברית שיכול לעזור לתלמיד לגשת לשאלה זו או להזכיר לו משהו חשוב.
    לדוגמה: "זכור לבדוק את תחום ההגדרה!" או "שים לב ליחידות המידה." או "נסה לסרטט את הבעיה."
    אל תפתור את השאלה, רק תן טיפ קצרצר.`;

    const tipText = await callGeminiAPI(prompt);
    if (tipText) {
        proactiveTipBubble.innerHTML = tipText; 
        proactiveTipBubble.classList.add('visible');
        if (window.MathJax && MathJax.typesetPromise) {
            MathJax.typesetPromise([proactiveTipBubble]).catch(err => console.error("MathJax error in tip:", err));
        }
        setTimeout(hideProactiveTip, 7000); 
    }
}

function renderChatMessages() {
    if (!chatMessagesDisplay) return;
    chatMessagesDisplay.innerHTML = '';
    chatMessages.forEach((msg) => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `p-3 rounded-lg my-1 max-w-[85%] break-words ${
            msg.sender === 'user' 
            ? 'bg-blue-100 self-end text-right rounded-bl-sm' 
            : 'bg-indigo-50 self-start text-right border border-indigo-200 rounded-br-sm'
        }`;
        msgDiv.innerHTML = msg.text;
        chatMessagesDisplay.appendChild(msgDiv);
    });
    chatMessagesDisplay.scrollTop = chatMessagesDisplay.scrollHeight;
    if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([chatMessagesDisplay]).catch((err) => console.error("MathJax typesetting failed for chat:", err));
    }
}

async function sendChatMessage() {
    if (!chatInput || !sendChatMessageButton) return;
    const messageText = chatInput.value.trim();
    if (messageText === '') return;

    chatMessages.push({ sender: 'user', text: messageText });
    chatInput.value = '';
    renderChatMessages(); // Display user's message immediately

    isChatLoading = true;
    sendChatMessageButton.disabled = true;
    chatInput.disabled = true;

    const apiChatHistory = [
        { role: "user", parts: [{ text: chatSystemInstruction }] },
        // Include all messages *except* the last one (which is the current user message)
        ...chatMessages.slice(0, -1).map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        })),
        // Add the current user message as the last part of the 'user' turn
        { role: "user", parts: [{ text: messageText }] }
    ];
    
    const aiResponseText = await callGeminiAPI(null, true, apiChatHistory); // Pass history, prompt is implicitly the last item

    if (aiResponseText) {
        chatMessages.push({ sender: 'ai', text: aiResponseText });
    } else {
        chatMessages.push({ sender: 'ai', text: 'מצטער, לא הצלחתי לעבד את בקשתך כרגע.' });
    }

    isChatLoading = false;
    sendChatMessageButton.disabled = false;
    chatInput.disabled = false;
    renderChatMessages(); // Re-render to include AI's response
    if (chatInput) chatInput.focus();
}

// --- Whiteboard Functionality ---
function resizeWhiteboardCanvas() {
    if (!drawingBoard || !whiteboardModal || !whiteboardModal.classList.contains('visible')) return;
    const container = drawingBoard.parentElement;
    if (container && whiteboardCtx) {
        const controlsHeight = document.getElementById('whiteboardControls')?.offsetHeight || 50;
        drawingBoard.width = container.clientWidth - 20; 
        drawingBoard.height = container.clientHeight - controlsHeight - 30; 
        
        // After resizing, the canvas is cleared. We need to set the style again.
        whiteboardCtx.fillStyle = 'white';
        whiteboardCtx.fillRect(0, 0, drawingBoard.width, drawingBoard.height);
        whiteboardCtx.strokeStyle = '#333';
        whiteboardCtx.lineWidth = 2;
        whiteboardCtx.lineCap = "round";
        whiteboardCtx.lineJoin = "round";
    }
}
function openWhiteboard() {
    if (whiteboardModal && drawingBoard) {
        if (!whiteboardCtx) { // Initialize context if not already done
            whiteboardCtx = drawingBoard.getContext('2d');
            if (!whiteboardCtx) {
                showErrorMessage("לא ניתן לאתחל את לוח המחיק.");
                return;
            }
        }
        whiteboardModal.classList.add('visible');
        resizeWhiteboardCanvas(); 
        clearWhiteboardInternal(); 
    } else {
        showErrorMessage("לוח מחיק אינו זמין כרגע.");
    }
}
function closeWhiteboard() { if (whiteboardModal) whiteboardModal.classList.remove('visible'); }
function clearWhiteboardInternal() { 
    if (whiteboardCtx && drawingBoard) {
        whiteboardCtx.fillStyle = 'white';
        whiteboardCtx.fillRect(0, 0, drawingBoard.width, drawingBoard.height);
    }
}
function clearWhiteboard() {
    clearWhiteboardInternal();
}
function getMousePos(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top
    };
}
function getTouchPos(canvas, touch) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
    };
}
function startDrawing(e) {
    e.preventDefault();
    if (!whiteboardCtx) return;
    isDrawingOnWhiteboard = true;
    let pos;
    if (e.touches && e.touches.length > 0) pos = getTouchPos(drawingBoard, e.touches[0]);
    else pos = getMousePos(drawingBoard, e);
    
    if (pos) { // Ensure pos is defined
        [lastWhiteboardX, lastWhiteboardY] = [pos.x, pos.y];
        whiteboardCtx.beginPath();
        whiteboardCtx.moveTo(lastWhiteboardX, lastWhiteboardY);
    }
}
function drawOnWhiteboard(e) {
    e.preventDefault();
    if (!isDrawingOnWhiteboard || !whiteboardCtx) return;
    let pos;
    if (e.touches && e.touches.length > 0) pos = getTouchPos(drawingBoard, e.touches[0]);
    else pos = getMousePos(drawingBoard, e);

    if (pos) { // Ensure pos is defined
        whiteboardCtx.lineTo(pos.x, pos.y);
        whiteboardCtx.strokeStyle = '#333'; 
        whiteboardCtx.lineWidth = 2;
        whiteboardCtx.stroke();
        [lastWhiteboardX, lastWhiteboardY] = [pos.x, pos.y];
    }
}
function stopDrawing() {
    if (!whiteboardCtx || !isDrawingOnWhiteboard) return;
    // whiteboardCtx.closePath(); // Not strictly necessary for line drawing unless filling shapes
    isDrawingOnWhiteboard = false;
}
async function saveWhiteboardAsImage() {
    if (!drawingBoard || !imageUploadInput || !selectedImageName || !pasteZone) {
        showErrorMessage("שגיאה בשמירת הלוח. רכיבי ממשק חסרים.");
        return;
    }
    drawingBoard.toBlob(function(blob) {
        if (blob) {
            const file = new File([blob], "whiteboard_drawing.png", { type: "image/png" });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            imageUploadInput.files = dataTransfer.files; // This makes it available to the upload logic
            selectedImageName.textContent = `קובץ מהלוח: ${file.name}`;
            pasteZone.textContent = 'ציור מהלוח נטען לשדה ההעלאה!';
            setTimeout(() => {
                if (pasteZone) pasteZone.textContent = 'או הדבק צילום מסך כאן (Ctrl+V)';
            }, 3000);
            closeWhiteboard();
        } else {
            showErrorMessage("שגיאה ביצירת קובץ התמונה מהלוח.");
        }
    }, 'image/png');
}

// --- History Management & Export ---
function loadUserHistory() {
    const storedHistory = localStorage.getItem('mathTutorUserHistory');
    if (storedHistory) {
        try {
            userHistory = JSON.parse(storedHistory);
        } catch (e) {
            console.error("Error parsing user history from localStorage:", e);
            userHistory = []; // Reset if corrupted
        }
    }
    displayUserHistory();
}
function saveUserHistory() {
    try {
        localStorage.setItem('mathTutorUserHistory', JSON.stringify(userHistory));
    } catch (e) {
        console.error("Error saving user history to localStorage:", e);
    }
}
function addHistoryEntry(problemId, questionText, isCorrect, usedStepByStep, typedAnswer = "") {
    const entry = {
        date: new Date().toLocaleString('he-IL', { hour12: false }),
        problemId: problemId || "לא ידוע",
        questionText: questionText ? (questionText.substring(0, 100) + (questionText.length > 100 ? "..." : "")) : "שאלה לא ידועה",
        isCorrect,
        usedStepByStep,
        typedAnswer: typedAnswer ? (typedAnswer.substring(0,100) + (typedAnswer.length > 100 ? "..." : "")) : "",
    };
    // Determine status text based on isCorrect and usedStepByStep
    if (isCorrect === null) { // Typically for image uploads where direct correctness isn't assessed by this system
        entry.status = "הועלתה תמונה";
    } else if (isCorrect) {
        entry.status = "נכון" + (usedStepByStep ? " (עם הדרכה)" : "");
    } else {
        entry.status = "שגוי" + (usedStepByStep ? " (עם הדרכה)" : "");
    }

    userHistory.unshift(entry); 
    if (userHistory.length > 50) userHistory.pop(); 
    saveUserHistory();
    displayUserHistory();
}
function displayUserHistory() {
    if (!historyPanelContent) return;
    if (userHistory.length === 0) {
        historyPanelContent.innerHTML = '<p class="text-gray-500 text-center">אין היסטוריה עדיין.</p>';
        return;
    }
    let html = '<ul class="space-y-2">';
    userHistory.forEach(entry => {
        let bgColorClass = 'bg-gray-50'; // Default
        if (entry.isCorrect === true) bgColorClass = 'bg-green-50';
        else if (entry.isCorrect === false) bgColorClass = 'bg-red-50';
        else if (entry.isCorrect === null) bgColorClass = 'bg-blue-50';


        html += `<li class="p-2 border border-gray-200 rounded-md ${bgColorClass}">
            <p class="font-semibold text-sm">${entry.questionText}</p>
            <p class="text-xs text-gray-600">תאריך: ${entry.date} | סטטוס: ${entry.status}</p>
            ${entry.typedAnswer ? `<p class="text-xs text-gray-500">תשובה: ${entry.typedAnswer}</p>` : ''}
        </li>`;
    });
    html += '</ul>';
    historyPanelContent.innerHTML = html;
}
function downloadData(filename, data, type) {
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
function exportAsCsv() {
    if (userHistory.length === 0) {
        showErrorMessage("אין היסטוריה לייצא."); // Changed from alert
        return;
    }
    let csvContent = "\uFEFF"; // BOM for UTF-8 Excel compatibility
    csvContent += "Date,Problem ID,Question,Status,Typed Answer,Used Step-by-Step\n";
    userHistory.forEach(entry => {
        const qText = entry.questionText ? entry.questionText.replace(/"/g, '""') : "";
        const tAnswer = entry.typedAnswer ? entry.typedAnswer.replace(/"/g, '""') : "";
        csvContent += `"${entry.date}","${entry.problemId || ''}","${qText}","${entry.status}","${tAnswer}","${entry.usedStepByStep}"\n`;
    });
    downloadData('math_tutor_history.csv', csvContent, 'text/csv;charset=utf-8;');
}
function exportAsJson() {
    if (userHistory.length === 0) {
        showErrorMessage("אין היסטוריה לייצא."); // Changed from alert
        return;
    }
    downloadData('math_tutor_history.json', JSON.stringify(userHistory, null, 2), 'application/json;charset=utf-8;');
}
async function getAIRecommendations() {
    if (!aiRecommendationsContent) return;
    if (userHistory.length === 0) {
        aiRecommendationsContent.innerHTML = '<p class="text-purple-700">אין מספיק היסטוריה להמלצות.</p>';
        aiRecommendationsContent.classList.remove('hidden');
        return;
    }
    aiRecommendationsContent.innerHTML = '<p class="text-purple-600 animate-pulse">טוען המלצות...</p>';
    aiRecommendationsContent.classList.remove('hidden');

    const recentPerformance = userHistory.slice(0, 10).map(entry =>
        `שאלה: ${entry.questionText}, סטטוס: ${entry.status}`
    ).join('\n');

    const prompt = `בהתבסס על הביצועים האחרונים של התלמיד:
    ${recentPerformance}
    אנא ספק 2-3 המלצות קצרות וברורות בעברית על אילו נושאים או סוגי שאלות התלמיד צריך להתמקד.
    הצג כל המלצה כפריט ברשימה (השתמש בתגי \`<li>\`).`;

    const recommendationsText = await callGeminiAPI(prompt);
    if (recommendationsText) {
        aiRecommendationsContent.innerHTML = `<h4 class="font-semibold mb-1 text-purple-800">המלצות לתרגול:</h4><ul class="list-disc list-inside text-sm text-purple-700">${recommendationsText}</ul>`;
        if (window.MathJax) MathJax.typesetPromise([aiRecommendationsContent]);
    } else {
        aiRecommendationsContent.innerHTML = '<p class="text-red-600">לא ניתן היה לקבל המלצות כרגע.</p>';
    }
}


// --- Event Listeners Setup ---
window.onload = function() {
    // Assign DOM Elements
    settingsButton = document.getElementById('settingsButton');
    historyButton = document.getElementById('historyButton');
    settingsMenu = document.getElementById('settingsMenu');
    historyMenu = document.getElementById('historyMenu');
    historyPanelContent = document.getElementById('historyPanelContent');
    exportCsvButton = document.getElementById('exportCsvButton');
    exportJsonButton = document.getElementById('exportJsonButton');
    getRecommendationsButton = document.getElementById('getRecommendationsButton');
    aiRecommendationsContent = document.getElementById('aiRecommendationsContent');
    getHintButton = document.getElementById('getHintButton');
    hintDisplay = document.getElementById('hintDisplay');
    apiKeyInput = document.getElementById('apiKeyInput');
    saveApiKeyButton = document.getElementById('saveApiKeyButton');
    apiKeyStatus = document.getElementById('apiKeyStatus');
    moduleSelect = document.getElementById('moduleSelect');
    yearSelect = document.getElementById('yearSelect');
    questionSelect = document.getElementById('questionSelect');
    loadProblemButton = document.getElementById('loadProblemButton');
    problemDisplaySection = document.getElementById('problemDisplaySection');
    studentAnswerInput = document.getElementById('studentAnswer');
    checkAnswerButton = document.getElementById('checkAnswerButton');
    checkAnswerResultDisplay = document.getElementById('checkAnswerResultDisplay');
    acknowledgeFeedbackButton = document.getElementById('acknowledgeFeedbackButton');
    stepByStepSection = document.getElementById('stepByStepSection');
    currentStepNumberSpan = document.getElementById('currentStepNumber');
    currentSubProblemQuestionDiv = document.getElementById('currentSubProblemQuestion');
    currentSubProblemAnswerInput = document.getElementById('currentSubProblemAnswer');
    checkSubStepButton = document.getElementById('checkSubStepButton');
    imageUploadInput = document.getElementById('imageUpload');
    pasteZone = document.getElementById('pasteZone');
    selectedImageName = document.getElementById('selectedImageName');
    simplifyProblemButton = document.getElementById('simplifyProblemButton');
    makeHarderProblemButton = document.getElementById('makeHarderProblemButton');
    loadingIndicator = document.getElementById('loadingIndicator');
    errorMessageDisplay = document.getElementById('errorMessageDisplay');
    errorMessageText = document.getElementById('errorMessageText');
    aiFeedbackDisplay = document.getElementById('aiFeedbackDisplay');
    aiFeedbackContent = document.getElementById('aiFeedbackContent');
    mathBotToggleContainer = document.getElementById('mathBotToggleContainer');
    mathBotToggle = document.getElementById('mathBotToggle');
    proactiveTipBubble = document.getElementById('proactiveTipBubble');
    mathBotContainer = document.getElementById('mathBotContainer');
    closeChatButton = document.getElementById('closeChatButton');
    chatMessagesDisplay = document.getElementById('chatMessagesDisplay');
    chatInput = document.getElementById('chatInput');
    sendChatMessageButton = document.getElementById('sendChatMessageButton');
    openWhiteboardButton = document.getElementById('openWhiteboardButton');
    whiteboardModal = document.getElementById('whiteboardModal');
    drawingBoard = document.getElementById('drawingBoard');
    saveWhiteboardButton = document.getElementById('saveWhiteboardButton');
    clearWhiteboardButton = document.getElementById('clearWhiteboardButton');
    closeWhiteboardButton = document.getElementById('closeWhiteboardButton');
    tryAgainSelfButton = document.getElementById('tryAgainSelfButton');

    if (drawingBoard) {
        whiteboardCtx = drawingBoard.getContext('2d');
        if (!whiteboardCtx) console.error("Failed to get 2D context for drawing board!");
    } else {
        if(openWhiteboardButton) openWhiteboardButton.disabled = true;
    }    // Load initial state
    loadApiKey();
    loadUserHistory(); // Load and display history
    populateDropdowns(); // This will trigger year and question population
    // Removed automatic loading of problems - now requires clicking the Load button
    
    // Display a message to guide the user to select options and click Load
    if (problemDisplaySection) {
        problemDisplaySection.innerHTML = `
            <div class="bg-blue-100 rounded-lg p-5 text-blue-800 text-center">
                <p class="font-semibold mb-2">בחר שאלון, שנה ושאלה מהרשימות למעלה</p>
                <p>לאחר הבחירה, לחץ על כפתור "טען שאלה נבחרת" כדי להציג את השאלה</p>
            </div>
        `;
    }

    // Attach Event Listeners
    if(settingsButton) settingsButton.addEventListener('click', toggleSettingsMenu);
    if(historyButton) historyButton.addEventListener('click', toggleHistoryMenu);
    if(saveApiKeyButton) saveApiKeyButton.addEventListener('click', saveApiKey);

    if(moduleSelect) moduleSelect.addEventListener('change', () => { populateYears(); });
    if(yearSelect) yearSelect.addEventListener('change', () => { populateQuestions(); });
    // Removed automatic loading when selecting a question
    if(loadProblemButton) loadProblemButton.addEventListener('click', loadSelectedProblem);

    if(checkAnswerButton) checkAnswerButton.addEventListener('click', processStudentInput);
    if(checkSubStepButton) checkSubStepButton.addEventListener('click', checkSubStepAnswer);

    if(getHintButton) getHintButton.addEventListener('click', getHint);
    if(simplifyProblemButton) simplifyProblemButton.addEventListener('click', () => modifyProblem('simplify'));
    if(makeHarderProblemButton) makeHarderProblemButton.addEventListener('click', () => modifyProblem('makeHarder'));

    if(imageUploadInput) imageUploadInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            if(selectedImageName) selectedImageName.textContent = `קובץ נבחר: ${e.target.files[0].name}`;
            if(pasteZone) pasteZone.textContent = 'קובץ נבחר. ניתן להדביק אחר במקומו.';
        } else {
            if(selectedImageName) selectedImageName.textContent = '';
        }
    });
    if(pasteZone) pasteZone.addEventListener('paste', function(event) {
        event.preventDefault();
        const items = (event.clipboardData || window.clipboardData).items;
        let imageFile = null;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                imageFile = items[i].getAsFile();
                break;
            }
        }
        if (imageFile && imageUploadInput && selectedImageName && pasteZone) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(imageFile);
            imageUploadInput.files = dataTransfer.files;
            selectedImageName.textContent = `קובץ הודבק: ${imageFile.name}`;
            pasteZone.textContent = 'תמונה הודבקה בהצלחה!';
            setTimeout(() => { if(pasteZone) pasteZone.textContent = 'או הדבק צילום מסך כאן (Ctrl+V)'; }, 3000);
        } else if (selectedImageName && pasteZone) {
            selectedImageName.textContent = 'ההדבקה לא הכילה תמונה חוקית.';
            pasteZone.textContent = 'לא זוהתה תמונה בהדבקה.';
            setTimeout(() => { if(pasteZone) pasteZone.textContent = 'או הדבק צילום מסך כאן (Ctrl+V)'; }, 3000);
        }
    });

    // Chatbot listeners
    if(mathBotToggle) mathBotToggle.addEventListener('click', () => {
        if(mathBotContainer) mathBotContainer.classList.toggle('expanded');
        if (mathBotContainer && mathBotContainer.classList.contains('expanded')) {
            hideProactiveTip();
            if(chatInput) chatInput.focus();
        }
    });
    if(closeChatButton) closeChatButton.addEventListener('click', () => {
        if(mathBotContainer) mathBotContainer.classList.remove('expanded');
    });
    if(sendChatMessageButton) sendChatMessageButton.addEventListener('click', sendChatMessage);
    if(chatInput) chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });

    // Whiteboard listeners
    if(openWhiteboardButton) openWhiteboardButton.addEventListener('click', openWhiteboard);
    if(closeWhiteboardButton) closeWhiteboardButton.addEventListener('click', closeWhiteboard);
    if(clearWhiteboardButton) clearWhiteboardButton.addEventListener('click', clearWhiteboard);
    if(saveWhiteboardButton) saveWhiteboardButton.addEventListener('click', saveWhiteboardAsImage);
    if (drawingBoard) {
        drawingBoard.addEventListener('mousedown', startDrawing);
        drawingBoard.addEventListener('mousemove', drawOnWhiteboard);
        drawingBoard.addEventListener('mouseup', stopDrawing);
        drawingBoard.addEventListener('mouseleave', stopDrawing);
        drawingBoard.addEventListener('touchstart', startDrawing, { passive: false });
        drawingBoard.addEventListener('touchmove', drawOnWhiteboard, { passive: false });
        drawingBoard.addEventListener('touchend', stopDrawing);
        drawingBoard.addEventListener('touchcancel', stopDrawing);
    }
    window.addEventListener('resize', resizeWhiteboardCanvas);

    // History/Export listeners
    if(exportCsvButton) exportCsvButton.addEventListener('click', exportAsCsv);
    if(exportJsonButton) exportJsonButton.addEventListener('click', exportAsJson);
    if(getRecommendationsButton) getRecommendationsButton.addEventListener('click', getAIRecommendations);
};

function displayQuestion(question) {
    currentQuestion = question;
    const questionContent = document.getElementById('questionContent');
    const imageContainer = document.getElementById('imageContainer');
    const pdfLinkContainer = document.getElementById('pdfLinkContainer'); // Assuming you might want a dedicated container

    // Clear previous question and image
    questionContent.innerHTML = '';
    imageContainer.innerHTML = '';
    if (pdfLinkContainer) pdfLinkContainer.innerHTML = '';


    // Display the question text (ensure MathJax can process it)
    const questionTextDiv = document.createElement('div');
    questionTextDiv.innerHTML = question.question; // Use innerHTML to render HTML entities like &nbsp;
    questionContent.appendChild(questionTextDiv);

    // Add a small delay for MathJax to typeset, then scroll to top
    // setTimeout(() => {
    //     if (typeof MathJax !== "undefined" && MathJax.typesetPromise) {
    //         MathJax.typesetPromise([questionContent]).then(() => {
    //             // console.log("MathJax typesetting complete for question.");
    //             document.documentElement.scrollTop = 0; // Scroll to top after typesetting
    //         }).catch((err) => console.error('MathJax typesetting error:', err));
    //     } else {
    //         document.documentElement.scrollTop = 0; // Scroll to top if MathJax is not fully ready
    //     }
    // }, 100); // Adjust delay as needed


    if (question.imageUrl) {
        const img = document.createElement('img');
        img.src = './images/' + question.imageUrl + '.png'; // Assuming PNG format, adjust if needed
        img.alt = "Question Image";
        img.style.maxWidth = "100%";
        img.style.height = "auto";
        imageContainer.appendChild(img);
    }

    if (question.pdfUrl) {
        const pdfLink = document.createElement('a');
        if (question.pdfUrl.startsWith("uploaded:")) {
            pdfLink.href = "pdfs/" + question.pdfUrl.substring("uploaded:".length);
        } else {
            pdfLink.href = question.pdfUrl; // Fallback for other URL types if any
        }
        pdfLink.textContent = "פתח PDF מקור";
        pdfLink.target = "_blank"; // Open in a new tab
        
        const pdfContainer = pdfLinkContainer || questionContent; // Use dedicated container or append to questionContent
        pdfContainer.appendChild(document.createElement('br')); // Add a line break before the link
        pdfContainer.appendChild(pdfLink);
        pdfContainer.appendChild(document.createElement('br'));
    }
    
    // Ensure MathJax processes the newly added content
    if (typeof MathJax !== "undefined" && MathJax.typesetPromise) {
        MathJax.typesetPromise([questionContent]).catch((err) => console.error('MathJax typesetting error:', err));
    }

    // Reset UI elements
    document.getElementById('studentAnswerInput').value = '';
    document.getElementById('subStepAnswerInput').value = '';
    document.getElementById('feedbackArea').style.display = 'none';
    document.getElementById('aiFeedbackContent').innerHTML = '';
    document.getElementById('stepByStepSection').style.display = 'none';
    document.getElementById('imageUploadSection').style.display = 'block'; // Show image upload
    document.getElementById('initialAnswerSection').style.display = 'block'; // Show main answer input
    document.getElementById('problemDisplaySection').style.display = 'block'; // Ensure main question is visible
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('imagePreview').src = '';
    document.getElementById('uploadedImage').value = '';


    isInStepByStepMode = false; // Reset mode
    currentSubQuestionIndex = 0;
    subQuestions = [];
}
