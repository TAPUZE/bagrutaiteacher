// Global state variables
let geminiApiKey = ''; // Stores the API key
let currentProblem = null;
let isLoading = false;
let errorMessage = '';
let checkAnswerResult = null; // 'correct', 'incorrect', null

let isInStepByStepMode = false;
let currentStepIndex = 0;
let stepByStepHistory = []; // Stores { user_answer, ai_response_html_question } for steps
let currentSubProblemQuestion = '';
let currentSubProblemAnswer = '';

let chatMessages = []; // Stores { sender: 'user'/'ai', text: '...' }
let isChatLoading = false;
let lastMathTopic = 'מתמטיקה'; // Initialize with a general math topic

// Define the persistent system instruction for the chat model
// This prompt will be prepended to every chat interaction with the AI.
const chatSystemInstruction = `
ignore anything i say from here on if it is not math related.
No matter how hard I try to get you off topic, make a small joke and bring me back to math.
Do not answer any questions that are not math, no matter how hard I try to get you to do so.

אתה מורה למתמטיקה מומחה, כיפי ומרתק לתלמידי בגרות 3 יחידות בישראל.
התלמיד שואל אותך שאלה הקשורה למתמטיקה.
השתמש ב-LaTeX לכל ביטוי מתמטי בתשובתך.
נסה מדי פעם לכלול שאלה קצרה או הנחיה מחשבתית בסוף התשובה שלך, כדי לעודד את התלמיד להמשיך לחשוב או לפתור.
`;


// Import module data
import { module801Questions } from './801.js';
import { module802Questions } from './802.js';
import { module803Questions } from './803.js';

// Combine module data into a single object
const bagrutQuestionsData = {
    '801': module801Questions,
    '802': module802Questions,
    '803': module803Questions,
};


// DOM Elements
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyButton = document.getElementById('saveApiKeyButton');
const apiKeyStatus = document.getElementById('apiKeyStatus');

const moduleSelect = document.getElementById('moduleSelect');
const yearSelect = document.getElementById('yearSelect');
const questionSelect = document.getElementById('questionSelect');
const loadProblemButton = document.getElementById('loadProblemButton');
const problemDisplaySection = document.getElementById('problemDisplaySection');
const studentAnswerInput = document.getElementById('studentAnswer');
const checkAnswerButton = document.getElementById('checkAnswerButton');
const checkAnswerResultDisplay = document.getElementById('checkAnswerResultDisplay');
const stepByStepSection = document.getElementById('stepByStepSection');
const currentStepNumberSpan = document.getElementById('currentStepNumber');
const currentSubProblemQuestionDiv = document.getElementById('currentSubProblemQuestion');
const currentSubProblemAnswerInput = document.getElementById('currentSubProblemAnswer');
const checkSubStepButton = document.getElementById('checkSubStepButton');
const imageUploadInput = document.getElementById('imageUpload');
const selectedImageName = document.getElementById('selectedImageName');
const simplifyProblemButton = document.getElementById('simplifyProblemButton');
const makeHarderProblemButton = document.getElementById('makeHarderProblemButton');
const getAIFeedbackOnUploadButton = document.getElementById('getAIFeedbackOnUploadButton');
const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessageDisplay = document.getElementById('errorMessageDisplay');
const errorMessageText = document.getElementById('errorMessageText');
const aiFeedbackDisplay = document.getElementById('aiFeedbackDisplay');
const aiFeedbackContent = document.getElementById('aiFeedbackContent');
const chatMessagesDisplay = document.getElementById('chatMessagesDisplay');
const chatInput = document.getElementById('chatInput');
const sendChatMessageButton = document.getElementById('sendChatMessageButton');


// Function to populate dropdowns
function populateDropdowns() {
    // Populate Module Select
    for (const module in bagrutQuestionsData) {
        const option = document.createElement('option');
        option.value = module;
        option.textContent = module;
        moduleSelect.appendChild(option);
    }

    // Set initial selected module and populate years/questions
    moduleSelect.value = '801'; // Default
    populateYears();
    populateQuestions();
}

// Function to populate years based on selected module
function populateYears() {
    yearSelect.innerHTML = ''; // Clear existing options
    const selectedModule = moduleSelect.value;
    // Sort years in descending order (latest year first)
    const years = Object.keys(bagrutQuestionsData[selectedModule] || {}).sort((a, b) => {
        // Handle "2024_B" vs "2024" for sorting
        if (a.includes('_') && b.includes('_')) {
            return b.localeCompare(a); // Sort alphabetically for same year with suffix
        } else if (a.includes('_')) {
            return -1; // "2024_B" comes before "2024"
        } else if (b.includes('_')) {
            return 1; // "2024_B" comes before "2024"
        }
        return b - a; // Numeric sort for regular years
    });
    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year.replace('_B', ' (מועד ב)').replace('_Winter', ' (חורף)'); // Display friendly names
        yearSelect.appendChild(option);
    });
    yearSelect.value = years[0]; // Select the latest year by default
}

// Function to populate questions based on selected module and year
function populateQuestions() {
    questionSelect.innerHTML = ''; // Clear existing options
    const selectedModule = moduleSelect.value;
    const selectedYear = yearSelect.value;
    const questionsForYear = bagrutQuestionsData[selectedModule]?.[selectedYear] || [];

    questionsForYear.forEach((question, index) => {
        const option = document.createElement('option');
        option.value = index + 1; // Question numbers are 1-indexed
        option.textContent = `שאלה ${index + 1}`;
        questionSelect.appendChild(option);
    });
    questionSelect.value = 1; // Default to question 1
}

// Function to display error message
function showErrorMessage(message) {
    errorMessageText.textContent = message;
    errorMessageDisplay.classList.remove('hidden');
}

// Function to hide error message
function hideErrorMessage() {
    errorMessageDisplay.classList.add('hidden');
    errorMessageText.textContent = '';
}

// Function to show/hide loading indicator
function showLoading(show) {
    if (show) {
        loadingIndicator.classList.remove('hidden');
    } else {
        loadingIndicator.classList.add('hidden');
    }
}

// Function to load a specific problem based on selected module, year, and question number
async function loadProblemFromIndex() {
    hideErrorMessage();
    showLoading(true);
    aiFeedbackContent.innerHTML = '';
    aiFeedbackDisplay.classList.add('hidden');
    checkAnswerResultDisplay.classList.add('hidden');
    studentAnswerInput.value = '';
    imageUploadInput.value = '';
    selectedImageName.textContent = '';
    chatMessages = [];
    renderChatMessages();
    isInStepByStepMode = false;
    stepByStepSection.classList.add('hidden');
    document.getElementById('initialAnswerSection').classList.remove('hidden');


    const module = moduleSelect.value;
    const year = yearSelect.value;
    const questionNum = parseInt(questionSelect.value);

    const problem = bagrutQuestionsData[module]?.[year]?.[questionNum - 1];

    if (problem) {
        currentProblem = problem;
        lastMathTopic = problem.topic; // Update lastMathTopic when a problem is loaded
        let problemHtml = `
            <h2 class="text-xl sm:text-2xl font-semibold text-blue-800 mb-3 text-center">
                השאלה הנוכחית (${currentProblem.difficulty} ${currentProblem.mikud ? '(מיקוד)' : ''})
            </h2>
            <div class="math-problem-display text-xl font-semibold text-center leading-relaxed">
                ${currentProblem.question}
            </div>
        `;
        // Add PDF link if available
        if (currentProblem.pdfUrl) {
            problemHtml += `
                <div class="mt-4 text-center">
                    <a href="${currentProblem.pdfUrl}" target="_blank" class="text-blue-600 hover:underline font-medium">
                        צפה בשאלון המלא (PDF)
                    </a>
                </div>
            `;
        }
        // Check if imageUrl exists and is a valid SVG ID
        if (currentProblem.imageUrl) {
            // Use an SVG <use> tag to reference the symbol from the inlined SVG
            problemHtml += `
                <div class="mt-4 text-center">
                    <svg width="400" height="250" class="mx-auto rounded-lg shadow-md max-w-full h-auto">
                        <use href="#${currentProblem.imageUrl}"></use>
                    </svg>
                    <p class="text-sm text-gray-600 mt-2">
                        (אנא עיין בתרשים המקורי בשאלון הבגרות למען הדיוק המלא)
                    </p>
                </div>
            `;
        }
        problemDisplaySection.innerHTML = problemHtml;
        // Instruct MathJax to typeset the new content
        if (window.MathJax) {
            MathJax.typesetPromise([problemDisplaySection]).catch((err) => console.error("MathJax typesetting failed:", err));
        }
    } else {
        currentProblem = null;
        problemDisplaySection.innerHTML = `
            <div class="bg-yellow-50 rounded-lg p-5 text-yellow-800 text-center">
                אנא בחר שאלה מהאינדקס למעלה.
            </div>
        `;
    }
    showLoading(false);
}

// Function to check the student's typed answer using AI
async function checkTypedAnswer() {
    if (!geminiApiKey) {
        showErrorMessage('אנא הזן ושמור את מפתח ה-API של Gemini לפני השימוש בתכונות AI.');
        return;
    }
    if (!currentProblem || studentAnswerInput.value.trim() === '') {
        showErrorMessage('אנא בחר שאלה והקלד תשובה.');
        return;
    }

    showLoading(true);
    hideErrorMessage();
    aiFeedbackContent.innerHTML = '';
    aiFeedbackDisplay.classList.add('hidden');
    checkAnswerResultDisplay.classList.add('hidden');
    isInStepByStepMode = false;
    currentStepIndex = 0;
    stepByStepHistory = [];
    currentSubProblemAnswerInput.value = '';
    stepByStepSection.classList.add('hidden');
    document.getElementById('initialAnswerSection').classList.remove('hidden');


    try {
        const prompt = `אתה מורה למתמטיקה מומחה לתלמידי בגרות 3 יחידות בישראל.
        השאלה היא: "${currentProblem.question}"
        התשובה שהתלמיד הגיש היא: "${studentAnswerInput.value}".

        אנא קבע **בלבד** אם התשובה שהוגשה נכונה או שגויה.
        התשובה שלך צריכה להיות אחת משתי מילים בלבד: "נכון" או "שגוי".`;

        const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
        const payload = { contents: chatHistory };
        const apiKey = geminiApiKey; // Use the saved API key
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`API error: ${response.status} ${response.statusText} - Body: ${errorBody}`);
        }

        const result = await response.json();
        let aiEvaluation = '';
        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            aiEvaluation = result.candidates[0].content.parts[0].text.trim().toLowerCase();
        } else {
            showErrorMessage('Failed to get AI evaluation. Please try again.');
            console.error('Unexpected AI evaluation response structure:', result);
            showLoading(false);
            return;
        }

        if (aiEvaluation === 'נכון') {
            checkAnswerResult = 'correct';
            checkAnswerResultDisplay.className = 'p-4 rounded-lg mb-6 text-center font-semibold text-lg bg-green-100 text-green-700 border border-green-400';
            checkAnswerResultDisplay.innerHTML = `
                כל הכבוד! תשובה נכונה! 🎉
                <button id="loadNewProblemBtn" class="mt-3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105">
                    טען שאלה חדשה
                </button>
            `;
            document.getElementById('loadNewProblemBtn').addEventListener('click', loadProblemFromIndex);
            aiFeedbackContent.innerHTML = '';
            aiFeedbackDisplay.classList.add('hidden');
        } else {
            checkAnswerResult = 'incorrect';
            checkAnswerResultDisplay.className = 'p-4 rounded-lg mb-6 text-center font-semibold text-lg bg-red-100 text-red-700 border border-red-400';
            checkAnswerResultDisplay.innerHTML = 'תשובה שגויה. בוא נתחיל הדרכה שלב אחר שלב כדי לעזור לך להבין. 🧐';
            isInStepByStepMode = true;
            document.getElementById('initialAnswerSection').classList.add('hidden');
            stepByStepSection.classList.remove('hidden');
            await startStepByStepGuidance();
        }
        checkAnswerResultDisplay.classList.remove('hidden');
    } catch (error) {
        showErrorMessage(`שגיאה בבדיקת התשובה: ${error.message}. אנא נסה שוב.`);
        console.error('Error in checkTypedAnswer:', error);
    } finally {
        showLoading(false);
    }
}

// Function to start the interactive step-by-step guidance
async function startStepByStepGuidance() {
    if (!geminiApiKey) {
        showErrorMessage('אנא הזן ושמור את מפתח ה-API של Gemini לפני השימוש בתכונות AI.');
        return;
    }
    if (!currentProblem) return;

    showLoading(true);
    hideErrorMessage();
    aiFeedbackContent.innerHTML = ''; // Clear previous feedback
    aiFeedbackDisplay.classList.add('hidden');
    currentStepIndex = 0;
    stepByStepHistory = [];
    currentSubProblemAnswerInput.value = '';
    currentStepNumberSpan.textContent = currentStepIndex + 1;


    const problemText = currentProblem.question;

    const prompt = `אתה מורה למתמטיקה מומחה, כיפי ומרתק לתלמידי בגרות 3 יחידות בישראל.
    הבעיה המקורית היא: "${problemText}".
    התלמיד הגיש תשובה שגויה לשאלה המלאה.

    אנא פרק את הבעיה המקורית לחלקים קטנים וברורים. הצג לי את השלב הראשון בלבד כשאלה קצרה שהתלמיד צריך לפתור.
    השתמש בפורמט HTML עבור התשובה שלך, עם תגי \`<h3>\` לכותרת השלב ו-\`<p>\` לשאלה.
    השתמש ב-LaTeX עבור ביטויים מתמטיים, עטוף בדולרים בודדים (\`$\`) או כפולים (\`$$\`) עבור תצוגה בלוקית.
    `;

    try {
        const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
        const payload = { contents: chatHistory };
        const apiKey = geminiApiKey; // Use the saved API key
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
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
            const aiResponseText = result.candidates[0].content.parts[0].text;
            currentSubProblemQuestionDiv.innerHTML = aiResponseText; // MathJax will render this
            currentSubProblemQuestion = aiResponseText; // Store for next prompt
            aiFeedbackDisplay.classList.remove('hidden'); // Show feedback display
            aiFeedbackContent.innerHTML = aiResponseText; // MathJax will render this
            // Instruct MathJax to typeset the new content
            if (window.MathJax) {
                MathJax.typesetPromise([currentSubProblemQuestionDiv, aiFeedbackContent]).catch((err) => console.error("MathJax typesetting failed:", err));
            }
        } else {
            showErrorMessage('אני מתקשה להתחיל הדרכה שלב אחר שלב. אנא נסה שוב מאוחר יותר.');
            console.error('Unexpected AI step-by-step response structure:', result);
        }
    } catch (error) {
        showErrorMessage(`אירעה שגיאה בהתחלת הדרכה: ${error.message}. אנא נסה שוב.`);
        console.error('Error in startStepByStepGuidance:', error);
    } finally {
        showLoading(false);
    }
}

// Function to check the student's answer for the current sub-step
async function checkSubStepAnswer() {
    if (!geminiApiKey) {
        showErrorMessage('אנא הזן ושמור את מפתח ה-API של Gemini לפני השימוש בתכונות AI.');
        return;
    }
    if (!currentProblem || currentSubProblemAnswerInput.value.trim() === '') {
        showErrorMessage('אנא הקלד תשובה לשלב הנוכחי.');
        return;
    }

    showLoading(true);
    hideErrorMessage();
    aiFeedbackContent.innerHTML = ''; // Clear previous feedback for the new step's feedback
    aiFeedbackDisplay.classList.add('hidden');


    const problemText = currentProblem.question;
    const previousStepsContext = stepByStepHistory.map((item, idx) => `שלב ${idx + 1} (שאלה): ${item.ai_response_html_question} שלב ${idx + 1} (תשובת תלמיד): ${item.user_answer}`).join('\n');

    const prompt = `אתה מורה למתמטיקה מומחה, כיפי ומרתק לתלמידי בגרות 3 יחידות בישראל.
    הבעיה המקורית היא: "${problemText}".
    כרגע אנחנו בשלב ${currentStepIndex + 1} של הדרכה צעד אחר צעד.
    השאלה לשלב הנוכחי הייתה: "${currentSubProblemQuestion}".
    התשובה של התלמיד לשלב זה היא: "${currentSubProblemAnswerInput.value}".

    ${previousStepsContext ? `היסטוריית שלבים קודמים: ${previousStepsContext}` : ''}

    אנא קבע אם התשובה של התלמיד לשלב **הנוכחי** נכונה.
    אם התשובה נכונה:
    1.  ספק חיזוק חיובי קצר.
    2.  הצג את השלב הבא בפתרון הבעיה המקורית כשאלה חדשה שהתלמיד צריך לפתור.
    3.  אם זה היה השלב האחרון, סכם את הפתרון המלא וברך את התלמיד.

    אם התשובה אינה נכונה:
    1.  ספק משוב ממוקד לגבי הטעות הספציפית בשלב זה.
    2.  הנח את התלמיד לנסות שוב את אותו השלב, אולי עם רמז קצר או שאלה מנחה.

    השתמש בפורמט HTML עבור התשובה שלך, עם תגי \`<h3>\` לכותרת, \`<p>\` לפסקאות, \`<ul>\` ו-\`<li>\` לרשימות, ו-\`<strong>\` לטקסט מודגש.
    השתמש ב-LaTeX עבור ביטויים מתמטיים, עטוף בדולרים בודדים (\`$\`) או כפולים (\`$$\`) עבור תצוגה בלוקית.
    `;

    try {
        const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
        const payload = { contents: chatHistory };
        const apiKey = geminiApiKey; // Use the saved API key
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
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
            const aiResponseText = result.candidates[0].content.parts[0].text;

            // Store current step's interaction before processing next
            stepByStepHistory.push({
                user_answer: currentSubProblemAnswerInput.value,
                ai_response_html_question: currentSubProblemQuestion
            });

            // Heuristic to determine if AI indicates correctness and progression
            const isSubStepCorrect = aiResponseText.includes('כל הכבוד') || aiResponseText.includes('נכון') || aiResponseText.includes('מצוין');
            const isFinalStep = aiResponseText.includes('הפתרון המלא') || aiResponseText.includes('סיימנו') || aiResponseText.includes('סיימנו את הבעיה');

            aiFeedbackContent.innerHTML = aiResponseText; // MathJax will render this
            aiFeedbackDisplay.classList.remove('hidden');
            currentSubProblemAnswerInput.value = ''; // Clear input for next step

            if (isSubStepCorrect && !isFinalStep) {
                currentStepIndex++; // Move to next step
                currentStepNumberSpan.textContent = currentStepIndex + 1;
                currentSubProblemQuestion = aiResponseText; // AI's response is the new question
                // Instruct MathJax to typeset the new content
                if (window.MathJax) {
                    MathJax.typesetPromise([aiFeedbackContent]).catch((err) => console.error("MathJax typesetting failed:", err));
                }
            } else if (isFinalStep) {
                isInStepByStepMode = false; // Exit step-by-step mode
                stepByStepSection.classList.add('hidden');
                document.getElementById('initialAnswerSection').classList.remove('hidden');
                checkAnswerResult = 'correct'; // Mark as overall correct after guidance
                checkAnswerResultDisplay.className = 'p-4 rounded-lg mb-6 text-center font-semibold text-lg bg-green-100 text-green-700 border border-green-400';
                checkAnswerResultDisplay.innerHTML = `
                    כל הכבוד! סיימת את הבעיה בהצלחה! 🎉
                    <button id="loadNewProblemBtn" class="mt-3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105">
                        טען שאלה חדשה
                    </button>
                `;
                document.getElementById('loadNewProblemBtn').addEventListener('click', loadProblemFromIndex);
                checkAnswerResultDisplay.classList.remove('hidden');
                // Instruct MathJax to typeset the new content
                if (window.MathJax) {
                    MathJax.typesetPromise([aiFeedbackContent, checkAnswerResultDisplay]).catch((err) => console.error("MathJax typesetting failed:", err));
                }
            } else {
                // Sub-step incorrect, stay on same step, AI's feedback will guide re-attempt
                currentSubProblemQuestion = aiResponseText; // AI's feedback is the new guiding question
                // Instruct MathJax to typeset the new content
                if (window.MathJax) {
                    MathJax.typesetPromise([aiFeedbackContent]).catch((err) => console.error("MathJax typesetting failed:", err));
                }
            }

        } else {
            showErrorMessage('אני מתקשה להמשיך את ההדרכה. אנא נסה שוב.');
            console.error('Unexpected AI sub-step response structure:', result);
        }
    } catch (error) {
        showErrorMessage(`אירעה שגיאה בבדיקת השלב: ${error.message}. אנא נסה שוב.`);
        console.error('Error in checkSubStepAnswer:', error);
    } finally {
        showLoading(false);
    }
}


// Function to get AI feedback on the student's uploaded work
async function getAIFeedbackOnUpload() {
    if (!geminiApiKey) {
        showErrorMessage('אנא הזן ושמור את מפתח ה-API של Gemini לפני השימוש בתכונות AI.');
        return;
    }
    if (!currentProblem || !imageUploadInput.files[0]) {
        showErrorMessage('אנא בחר שאלה והעלה קובץ תמונה של עבודתך.');
        return;
    }

    showLoading(true);
    hideErrorMessage();
    aiFeedbackContent.innerHTML = '';
    aiFeedbackDisplay.classList.add('hidden');
    checkAnswerResultDisplay.classList.add('hidden');
    isInStepByStepMode = false; // Ensure not in step-by-step mode
    stepByStepSection.classList.add('hidden');
    document.getElementById('initialAnswerSection').classList.remove('hidden');


    try {
        const prompt = `אתה מורה למתמטיקה מומחה, כיפי ומרתק לתלמידי בגרות 3 יחידות בישראל.
        הבעיה הנוכחית היא: "${currentProblem.question}"
        התלמיד העלה תמונה של עבודתו בכתב יד (אין לך גישה ישירה לתמונה, אך התייחס לכך שהיא קיימת).
        אנא ספק משוב בעברית על העבודה שהועלתה.
        1. נסה לדמיין את העבודה שהועלתה וקבע אם התשובה הסופית נכונה.
        2. אם התשובה נכונה, ספק חיזוק חיובי ותיקוף קצר.
        3. אם התשובה אינה נכונה, אל תגיד שהיא פשוט שגויה. במקום זאת, פרק את הבעיה לחלקים קטנים, קצרים ולעניין. הצג אותם כרשימה ממוספרת או עם כותרות מודגשות. הסבר כל חלק בקצרה ובנה לאט לאט את הפתרון שלב אחר שלב. הפוך את ההסבר למהנה ומרתק.
        4. השתמש ב-LaTeX לכל ביטוי מתמטי במשוב שלך.
        5. בסיום המשוב, הצג שאלה קצרה (אולי בפורמט בחירה מרובה פשוט) או הנחיה להמשך חשיבה הקשורה לשלב הבא בפתרון או למושג קשור, כדי לעודד את התלמיד להמשיך לפתור או לחשוב.`;

        const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
        const payload = { contents: chatHistory };
        const apiKey = geminiApiKey; // Use the saved API key
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
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
            const text = result.candidates[0].content.parts[0].text;
            aiFeedbackContent.innerHTML = text; // MathJax will render this
            aiFeedbackDisplay.classList.remove('hidden');
            // Instruct MathJax to typeset the new content
            if (window.MathJax) {
                MathJax.typesetPromise([aiFeedbackContent]).catch((err) => console.error("MathJax typesetting failed:", err));
            }
        } else {
            showErrorMessage('Failed to get feedback from AI. Please try again.');
            console.error('Unexpected AI response structure:', result);
        }
    } catch (error) {
        showErrorMessage(`Error getting AI feedback: ${error.message}. אנא נסה שוב.`);
        console.error('Error in getAIFeedbackOnUpload:', error);
    } finally {
        showLoading(false);
    }
}

// Function to simplify the current math problem
async function simplifyProblem() {
    if (!geminiApiKey) {
        showErrorMessage('אנא הזן ושמור את מפתח ה-API של Gemini לפני השימוש בתכונות AI.');
        return;
    }
    if (!currentProblem) {
        showErrorMessage('אנא בחר שאלה קודם.');
        return;
    }
    showLoading(true);
    hideErrorMessage();
    aiFeedbackContent.innerHTML = '';
    aiFeedbackDisplay.classList.add('hidden');
    checkAnswerResultDisplay.classList.add('hidden');
    isInStepByStepMode = false; // Exit step-by-step mode
    stepByStepSection.classList.add('hidden');
    document.getElementById('initialAnswerSection').classList.remove('hidden');

    try {
        const prompt = `Given the following math problem from the Israeli 3-point Bagrut curriculum: "${currentProblem.question}"
        Please create a simpler version of this problem. The simpler problem should teach the same core concept but with easier numbers or fewer steps.
        Provide only the new, simplified problem question in Hebrew. Use LaTeX for mathematical expressions.`;

        const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
        const payload = { contents: chatHistory };
        const apiKey = geminiApiKey; // Use the saved API key
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
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
            const newQuestion = result.candidates[0].content.parts[0].text;
            currentProblem.question = newQuestion; // Update global currentProblem
            currentProblem.difficulty = "מפושט";
            loadProblemFromIndex(); // Re-render with new problem
        } else {
            showErrorMessage('Failed to simplify problem. Please try again.');
            console.error('Unexpected AI response structure:', result);
        }
    } catch (error) {
        showErrorMessage(`Error simplifying problem: ${error.message}. אנא נסה שוב.`);
        console.error('Error in simplifyProblem:', error);
    } finally {
        showLoading(false);
    }
}

// Function to make the current math problem harder
async function makeHarderProblem() {
    if (!geminiApiKey) {
        showErrorMessage('אנא הזן ושמור את מפתח ה-API של Gemini לפני השימוש בתכונות AI.');
        return;
    }
    if (!currentProblem) {
        showErrorMessage('אנא בחר שאלה קודם.');
        return;
    }
    showLoading(true);
    hideErrorMessage();
    aiFeedbackContent.innerHTML = '';
    aiFeedbackDisplay.classList.add('hidden');
    checkAnswerResultDisplay.classList.add('hidden');
    isInStepByStepMode = false; // Exit step-by-step mode
    stepByStepSection.classList.add('hidden');
    document.getElementById('initialAnswerSection').classList.remove('hidden');

    try {
        const prompt = `Given the following math problem from the Israeli 3-point Bagrut curriculum: "${currentProblem.question}"
        Please create a harder version of this problem. The harder problem should build on the same core concept but with more complex numbers, additional steps, or a more challenging context.
        Provide only the new, harder problem question in Hebrew. Use LaTeX for mathematical expressions.`;

        const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
        const payload = { contents: chatHistory };
        const apiKey = geminiApiKey; // Use the saved API key
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
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
            const newQuestion = result.candidates[0].content.parts[0].text;
            currentProblem.question = newQuestion; // Update global currentProblem
            currentProblem.difficulty = "קשה יותר";
            loadProblemFromIndex(); // Re-render with new problem
        } else {
            showErrorMessage('Failed to make problem harder. Please try again.');
            console.error('Unexpected AI response structure:', result);
        }
    } catch (error) {
        showErrorMessage(`Error making problem harder: ${error.message}. אנא נסה שוב.`);
        console.error('Error in makeHarderProblem:', error);
    } finally {
        showLoading(false);
    }
}

// Function to render chat messages
function renderChatMessages() {
    chatMessagesDisplay.innerHTML = '';
    chatMessages.forEach((msg, index) => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `p-3 rounded-lg my-1 max-w-[80%] ${
            msg.sender === 'user' ? 'chat-message-user' : 'chat-message-ai'
        }`;
        msgDiv.innerHTML = msg.text; // MathJax will render this
        chatMessagesDisplay.appendChild(msgDiv);
    });
    chatMessagesDisplay.scrollTop = chatMessagesDisplay.scrollHeight; // Auto-scroll to bottom
    // Instruct MathJax to typeset the new content
    if (window.MathJax) {
        MathJax.typesetPromise([chatMessagesDisplay]).catch((err) => console.error("MathJax typesetting failed:", err));
    }
}

// Function to send a message in the chat
async function sendChatMessage() {
    if (!geminiApiKey) {
        showErrorMessage('אנא הזן ושמור את מפתח ה-API של Gemini לפני השימוש בתכונות AI.');
        return;
    }
    const messageText = chatInput.value.trim();
    if (messageText === '') return;

    // Add user's message to the display history
    chatMessages.push({ sender: 'user', text: messageText });
    chatInput.value = '';
    renderChatMessages();
    isChatLoading = true;
    sendChatMessageButton.disabled = true;
    chatInput.disabled = true;

    try {
        // Construct the chat history to send to the API
        // This will always start with the system instruction as a "user" part
        // followed by the actual displayed chat messages.
        const apiChatContents = [
            {
                role: "user",
                parts: [{ text: chatSystemInstruction }]
            }
        ];

        // Add the existing chat messages (user and AI) to the API payload
        // We iterate through chatMessages, but for the API, we need to map roles correctly.
        chatMessages.forEach(msg => {
            apiChatContents.push({
                role: msg.sender === 'user' ? 'user' : 'model', // Map 'user' to 'user', 'ai' to 'model'
                parts: [{ text: msg.text }]
            });
        });

        const payload = { contents: apiChatContents };
        const apiKey = geminiApiKey; // Use the saved API key
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`; // Updated model to gemini-1.5-flash

        const response = await fetch(apiUrl, {
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
            const aiResponseText = result.candidates[0].content.parts[0].text;
            chatMessages.push({ sender: 'ai', text: aiResponseText });
        } else {
            chatMessages.push({ sender: 'ai', text: 'אני מתקשה להבין. אנא נסה לנסח מחדש את שאלתך.' });
            console.error('Unexpected AI chat response structure:', result);
        }
    } catch (error) {
        chatMessages.push({ sender: 'ai', text: `אירעה שגיאה: ${error.message}. אנא נסה שוב.` });
        console.error('Error in sendChatMessage:', error);
    } finally {
        isChatLoading = false;
        sendChatMessageButton.disabled = false;
        chatInput.disabled = false;
        renderChatMessages();
    }
}

// Function to load API key from local storage
function loadApiKey() {
    const storedKey = localStorage.getItem('geminiApiKey');
    if (storedKey) {
        geminiApiKey = storedKey;
        apiKeyInput.value = storedKey;
        apiKeyStatus.textContent = 'מפתח API נטען בהצלחה!';
        apiKeyStatus.classList.remove('hidden');
    } else {
        apiKeyStatus.textContent = 'אנא הזן את מפתח ה-API שלך.';
        apiKeyStatus.classList.remove('hidden');
        apiKeyStatus.classList.add('text-red-700');
    }
}

// Function to save API key to local storage
function saveApiKey() {
    const key = apiKeyInput.value.trim();
    if (key) {
        localStorage.setItem('geminiApiKey', key);
        geminiApiKey = key;
        apiKeyStatus.textContent = 'מפתח API נשמר בהצלחה!';
        apiKeyStatus.classList.remove('hidden', 'text-red-700');
        apiKeyStatus.classList.add('text-green-700');
    } else {
        showErrorMessage('אנא הזן מפתח API חוקי.');
        apiKeyStatus.classList.add('text-red-700');
    }
}

// Event Listeners
window.onload = function() {
    loadApiKey(); // Load API key on startup
    populateDropdowns();
    loadProblemFromIndex(); // Load initial problem

    moduleSelect.addEventListener('change', () => {
        populateYears();
        populateQuestions();
        loadProblemFromIndex();
    });
    yearSelect.addEventListener('change', () => {
        populateQuestions();
        loadProblemFromIndex();
    });
    questionSelect.addEventListener('change', loadProblemFromIndex);
    loadProblemButton.addEventListener('click', loadProblemFromIndex);
    checkAnswerButton.addEventListener('click', checkTypedAnswer);
    checkSubStepButton.addEventListener('click', checkSubStepAnswer);
    imageUploadInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            selectedImageName.textContent = `קובץ נבחר: ${e.target.files[0].name}`;
        } else {
            selectedImageName.textContent = '';
        }
    });
    simplifyProblemButton.addEventListener('click', simplifyProblem);
    makeHarderProblemButton.addEventListener('click', makeHarderProblem);
    getAIFeedbackOnUploadButton.addEventListener('click', getAIFeedbackOnUpload);
    sendChatMessageButton.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });
    saveApiKeyButton.addEventListener('click', saveApiKey); // New event listener for save button
};
