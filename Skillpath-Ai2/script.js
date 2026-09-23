tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#f0f3ff',
                    100: '#e0e7ff',
                    400: '#818cf8',
                    500: '#6366f1',
                    600: '#4f46e5',
                    700: '#4338ca',
                    900: '#312e81',
                },
                darkbg: '#080c14',
                cardbg: '#0f172a',
                cardborder: '#1e293b'
            }
        }
    }
};

const CONFIG = {
    GEMINI_API_KEY: "",
    GEMINI_MODEL: "gemini-3-flash-preview",
    STORAGE_KEYS: {
        ACTIVE_PLAN: "skillpath_active_plan",
        SAVED_PLANS: "skillpath_saved_plans_list"
    },
    TIMEOUT_MS: 12000
};

const Storage = {
    get(key, fallback = null) {
        try {
            const val = localStorage.getItem(key);
            return val ? JSON.parse(val) : fallback;
        } catch (e) {
            console.warn(`Storage read failed for "${key}":`, e);
            return fallback;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.warn(`Storage write failed for "${key}":`, e);
            return false;
        }
    }
};

/* Global Application State */
let currentPlan = null;
let activeInputTab = 'manual';
let currentUploadedFile = null;

// Configure PDF.js Worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

document.addEventListener('DOMContentLoaded', () => {
    updateSavedCountBadge();
    loadActivePlanFromStorage();
});

async function callGeminiApi(payload, systemInstruction = null) {
    if (!CONFIG.GEMINI_API_KEY) {
        throw new Error("No API key configured; using local domain generator.");
    }
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    const reqBody = { ...payload };
    if (systemInstruction) {
        reqBody.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const res = await fetchWithBackoff(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
    });

    if (!res.ok) throw new Error(`Gemini API Error: ${res.status}`);
    const data = await res.json();
    const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!jsonText) throw new Error("Empty response from Gemini API");
    return JSON.parse(jsonText);
}

// Exponential backoff helper for network resilience
async function fetchWithBackoff(url, options, maxRetries = 3) {
    let delay = 1000;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const res = await fetch(url, options);
            if (res.status === 429) {
                await new Promise(r => setTimeout(r, delay));
                delay *= 2;
                continue;
            }
            return res;
        } catch (err) {
            if (i === maxRetries - 1) throw err;
            await new Promise(r => setTimeout(r, delay));
            delay *= 2;
        }
    }
    return fetch(url, options);
}

function switchInputTab(tab) {
    activeInputTab = tab;
    const manualBtn = document.getElementById('tabManualBtn');
    const resumeBtn = document.getElementById('tabResumeBtn');
    const panel = document.getElementById('resumeInputPanel');

    if (tab === 'resume') {
        resumeBtn.className = "px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 bg-amber-600 text-white shadow-md shadow-amber-600/20";
        manualBtn.className = "px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 bg-slate-800/90 text-slate-400 hover:text-white hover:bg-slate-800";
        panel.classList.remove('hidden');
    } else {
        manualBtn.className = "px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 bg-brand-600 text-white shadow-md shadow-brand-600/20";
        resumeBtn.className = "px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 bg-slate-800/90 text-slate-400 hover:text-white hover:bg-slate-800";
        panel.classList.add('hidden');
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('resumeDropzone').classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('resumeDropzone').classList.remove('drag-over');
}

function handleFileDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('resumeDropzone').classList.remove('drag-over');
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processUploadedFile(e.dataTransfer.files[0]);
    }
}

async function handleResumeFileUpload(event) {
    const file = event.target.files?.[0];
    if (file) processUploadedFile(file);
}

async function processUploadedFile(file) {
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    const isTxt = file.type === 'text/plain' || file.name.endsWith('.txt');

    if (!isPdf && !isTxt) {
        showToast("Please upload a valid PDF (.pdf) or Text (.txt) file.", "error");
        return;
    }

    currentUploadedFile = file;

    document.getElementById('attachedFileName').innerText = file.name;
    document.getElementById('attachedFileSize').innerText = (file.size / 1024).toFixed(1) + ' KB';
    
    const iconContainer = document.getElementById('fileTypeIconContainer');
    if (isPdf) {
        iconContainer.className = "w-10 h-10 rounded-xl bg-red-950/80 border border-red-700/80 text-red-400 flex items-center justify-center text-lg flex-shrink-0";
        iconContainer.innerHTML = `<i class="fa-solid fa-file-pdf"></i>`;
    } else {
        iconContainer.className = "w-10 h-10 rounded-xl bg-amber-950/80 border border-amber-700/80 text-amber-400 flex items-center justify-center text-lg flex-shrink-0";
        iconContainer.innerHTML = `<i class="fa-solid fa-file-lines"></i>`;
    }

    const statusEl = document.getElementById('pdfExtractStatus');
    statusEl.classList.remove('hidden');
    statusEl.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Extracting text from ${isPdf ? 'PDF' : 'file'}...`;

    try {
        let fullText = '';
        if (isPdf) {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            const pageIndices = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
            const pagesText = await Promise.all(
                pageIndices.map(async (pageNum) => {
                    const page = await pdf.getPage(pageNum);
                    const textContent = await page.getTextContent();
                    return textContent.items.map(item => item.str).join(' ');
                })
            );
            fullText = pagesText.join('\n');
            
            if (typeof pdf.destroy === 'function') {
                pdf.destroy();
            }
        } else {
            fullText = await file.text();
        }

        document.getElementById('resumeText').value = fullText.trim();
        document.getElementById('resumeDropzone').classList.add('hidden');
        document.getElementById('attachedFileCard').classList.remove('hidden');

        showToast(`Extracted resume text successfully (${file.name})!`, "success");
    } catch (err) {
        console.error("File Parsing Error:", err);
        showToast("Could not parse file automatically. Please paste raw text instead.", "error");
    } finally {
        statusEl.classList.add('hidden');
    }
}

function removeUploadedFile() {
    currentUploadedFile = null;
    document.getElementById('resumeText').value = '';
    document.getElementById('resumeFileInput').value = '';
    document.getElementById('attachedFileCard').classList.add('hidden');
    document.getElementById('resumeDropzone').classList.remove('hidden');
    document.getElementById('resumeInsightsCard').classList.add('hidden');
    showToast("Resume file removed.", "info");
}

function toggleExtractedTextPreview() {
    const container = document.getElementById('extractedTextContainer');
    const label = document.getElementById('previewTextBtnLabel');
    const isHidden = container.classList.contains('hidden');

    if (isHidden) {
        container.classList.remove('hidden');
        label.innerText = "Hide Extracted Text";
    } else {
        container.classList.add('hidden');
        label.innerText = "View Extracted Text";
    }
}

async function analyzeResumeWithAI() {
    const text = document.getElementById('resumeText').value.trim();
    if (!text) {
        showToast("Please upload a resume file or paste text first.", "error");
        return;
    }

    const btn = document.getElementById('analyzeResumeBtn');
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Analyzing Experience & Matching Role...`;

    try {
        const systemPrompt = `You are an expert AI Career Strategist and Resume Analyst. 
Analyze the provided resume text thoroughly.
1. Determine the single HIGHEST matching tech job role for this user based on their skills, projects, and work experience.
2. Estimate the match confidence percentage (e.g. "88%").
3. Provide 2-3 alternative job roles that also closely match their profile.
4. Extract all explicit skills they currently possess.
5. Identify the critical missing skills/gaps required for them to excel in the HIGHEST matching role.
6. Provide a concise 1-2 sentence explanation of why this role is their best match.`;

        const payload = {
            contents: [{ role: "user", parts: [{ text: `Resume Text:\n${text}` }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        topMatchingRole: { type: "STRING" },
                        matchConfidence: { type: "STRING" },
                        explanation: { type: "STRING" },
                        alternativeRoles: { 
                            type: "ARRAY", 
                            items: { 
                                type: "OBJECT",
                                properties: {
                                    roleName: { type: "STRING" },
                                    matchPct: { type: "STRING" }
                                },
                                required: ["roleName", "matchPct"]
                            } 
                        },
                        extractedSkills: { type: "ARRAY", items: { type: "STRING" } },
                        missingSkills: { type: "ARRAY", items: { type: "STRING" } }
                    },
                    required: ["topMatchingRole", "matchConfidence", "explanation", "alternativeRoles", "extractedSkills", "missingSkills"]
                }
            }
        };

        const parsed = await callGeminiApi(payload, systemPrompt);
        applyResumeAnalysisResults(parsed);

    } catch (err) {
        console.warn("Using smart keyword-matching fallback analyzer:", err);
        const fallbackParsed = performSmartKeywordResumeAnalysis(text);
        applyResumeAnalysisResults(fallbackParsed);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-microchip"></i> <span>Analyze Resume with AI</span>`;
    }
}

function applyResumeAnalysisResults(parsed) {
    document.getElementById('targetRole').value = parsed.topMatchingRole || "Full Stack Developer";
    document.getElementById('existingSkills').value = (parsed.extractedSkills || []).join(', ');
    document.getElementById('missingSkills').value = (parsed.missingSkills || []).join(', ');

    const insightsCard = document.getElementById('resumeInsightsCard');
    insightsCard.classList.remove('hidden');

    document.getElementById('aiMatchScoreBadge').innerText = `${parsed.matchConfidence || '85%'} Match`;
    document.getElementById('aiSuggestedRoleTitle').innerText = parsed.topMatchingRole;
    document.getElementById('aiMatchExplanation').innerText = parsed.explanation || "Based on the technical stack and experience highlighted in your resume.";

    const altContainer = document.getElementById('aiAltRolesContainer');
    altContainer.innerHTML = '';

    (parsed.alternativeRoles || []).forEach(alt => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = "px-3 py-1 rounded-xl bg-slate-900 hover:bg-amber-900/40 hover:text-amber-200 text-slate-300 border border-slate-800 text-xs transition flex items-center gap-1.5 font-medium";
        button.innerHTML = `<span>${escapeHtml(alt.roleName)}</span> <span class="text-[10px] text-amber-400 font-bold">(${alt.matchPct})</span>`;
        button.onclick = () => {
            document.getElementById('targetRole').value = alt.roleName;
            showToast(`Selected target role: ${alt.roleName}`, "info");
        };
        altContainer.appendChild(button);
    });
}

function performSmartKeywordResumeAnalysis(text) {
    const lower = text.toLowerCase();

    let role = "Full Stack Developer";
    let confidence = "85%";
    let explanation = "Strong matches across core development technologies and project workflows.";
    let existing = ["JavaScript", "HTML/CSS", "Git"];
    let missing = ["TypeScript", "System Design", "CI/CD Pipelines", "State Management"];
    let alternatives = [
        { roleName: "Frontend Developer", matchPct: "80%" },
        { roleName: "Backend Developer", matchPct: "76%" }
    ];

    if (lower.includes('chemical') || lower.includes('chemistry') || lower.includes('thermodynamics') || lower.includes('aspen') || lower.includes('fluid mechanics') || lower.includes('reaction')) {
        role = "Chemical Engineer";
        confidence = "92%";
        explanation = "Your resume shows strong proficiency in chemical processes, reaction mechanics, and material synthesis.";
        existing = ["General Chemistry", "Mass Balance", "Physics", "MATLAB/Excel"];
        missing = ["Chemical Thermodynamics", "Heat & Mass Transfer", "Chemical Reaction Engineering", "Process Dynamics & Control", "ASPEN Plus Simulation"];
        alternatives = [
            { roleName: "Process Engineer", matchPct: "88%" },
            { roleName: "Materials Engineer", matchPct: "81%" }
        ];
    } else if (lower.includes('python') || lower.includes('pandas') || lower.includes('sql') || lower.includes('machine learning') || lower.includes('data')) {
        role = "Data Scientist";
        confidence = "88%";
        explanation = "Your resume highlights statistics, data analysis, and machine learning models.";
        existing = ["Python", "SQL", "Pandas", "Data Analysis"];
        missing = ["TensorFlow/PyTorch", "Model Deployment", "Big Data (Spark)", "Feature Store"];
        alternatives = [
            { roleName: "Data Engineer", matchPct: "82%" },
            { roleName: "AI Engineer", matchPct: "76%" }
        ];
    } else if (lower.includes('react') || lower.includes('css') || lower.includes('html') || lower.includes('tailwind') || lower.includes('figma')) {
        role = "Frontend Developer";
        confidence = "91%";
        explanation = "Extensive experience with modern UI frameworks and responsive web applications.";
        existing = ["JavaScript", "React", "HTML5", "CSS3/Tailwind"];
        missing = ["Next.js", "TypeScript", "Web Performance Optimization", "Testing (Jest/Cypress)"];
        alternatives = [
            { roleName: "UI/UX Engineer", matchPct: "80%" },
            { roleName: "Full Stack Developer", matchPct: "75%" }
        ];
    } else if (lower.includes('cad') || lower.includes('aerodynamics') || lower.includes('propulsion') || lower.includes('matlab')) {
        role = "Aerospace Engineer";
        confidence = "90%";
        explanation = "Strong background in fluid dynamics, propulsion systems, and CAD structural modeling.";
        existing = ["CAD Modeling", "Physics", "MATLAB", "Fluid Dynamics"];
        missing = ["Computational Fluid Dynamics (CFD)", "Propulsion Gas Turbines", "Flight Dynamics", "Avionics Systems"];
        alternatives = [
            { roleName: "Robotics Engineer", matchPct: "81%" },
            { roleName: "Mechanical Engineer", matchPct: "78%" }
        ];
    }

    return {
        topMatchingRole: role,
        matchConfidence: confidence,
        explanation: explanation,
        extractedSkills: existing,
        missingSkills: missing,
        alternativeRoles: alternatives
    };
}

function applyRolePreset(role, existing, missing) {
    document.getElementById('targetRole').value = role;
    document.getElementById('existingSkills').value = existing;
    document.getElementById('missingSkills').value = missing;
}

async function handleFormSubmit(event) {
    event.preventDefault();

    const targetRole = document.getElementById('targetRole').value.trim();
    const existingSkills = document.getElementById('existingSkills').value.trim();
    const missingSkills = document.getElementById('missingSkills').value.trim();
    const weeksCount = parseInt(document.getElementById('planDuration').value);

    if (!targetRole || !missingSkills) {
        showToast("Please enter Target Role and Missing Skills.", "error");
        return;
    }

    document.getElementById('planOutputContainer').classList.add('hidden');
    document.getElementById('loadingContainer').classList.remove('hidden');
    document.getElementById('loadingStatusText').innerText = `Creating ${weeksCount}-Week Curriculum & Checkpoint Quizzes for ${targetRole}...`;

    document.getElementById('loadingContainer').scrollIntoView({ behavior: 'smooth' });

    try {
        const fetchPromise = fetchStudyPlanFromGemini(targetRole, existingSkills, missingSkills, weeksCount);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), CONFIG.TIMEOUT_MS));

        const generatedPlan = await Promise.race([fetchPromise, timeoutPromise]);
        currentPlan = generatedPlan;
    } catch (error) {
        console.warn("Using smart domain fallback plan generator:", error);
        currentPlan = generateFallbackPlan(targetRole, existingSkills, missingSkills, weeksCount);
    } finally {
        document.getElementById('loadingContainer').classList.add('hidden');
        saveActivePlanToStorage();
        renderStudyPlan(currentPlan);
    }
}

async function fetchStudyPlanFromGemini(targetRole, existingSkills, missingSkills, durationWeeks) {
    const systemPrompt = `You are a senior technical curriculum designer and industry expert. Generate a ${durationWeeks}-week study roadmap tailored STRICTLY for the target role "${targetRole}".

CRITICAL DOMAIN MATCHING MANDATE:
1. THE ROLE IS "${targetRole}". EVERY WEEK MUST MATCH THIS EXACT DOMAIN. 
   - If targetRole is "Chemical Engineer", topics MUST BE Chemical Engineering subjects (e.g., Thermodynamics & Phase Equilibria, Chemical Reaction Engineering, Heat & Mass Transfer, Unit Operations, Process Dynamics & Control, ASPEN Plus / DWSIM Process Simulation).
   - If targetRole is "Aerospace Engineer", topics MUST BE Aerodynamics, Propulsion Systems, Flight Dynamics, Avionics, CFD.
   - DO NOT default or substitute with Software Engineering / React / Web topics unless targetRole is explicitly web development!
2. Provide a unique title per week that names the exact domain skill.
3. Provide 2-3 realistic learning resources per week (Coursera, NPTEL, YouTube, EdX, MIT OCW, freeCodeCamp, etc.).
4. Create an industry-relevant mini-project matching ${targetRole}.
5. Generate EXACTLY 10 distinct, domain-accurate multiple-choice questions for each week. Ensure unique question text, 4 distinct options, correct answer index, and detailed explanation.`;

    const userPrompt = `Role: "${targetRole}", Existing Skills: "${existingSkills}", Missing Skills To Learn: "${missingSkills}", Duration: ${durationWeeks} Weeks`;

    const payload = {
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    targetRole: { type: "STRING" },
                    summary: { type: "STRING" },
                    existingSkills: { type: "ARRAY", items: { type: "STRING" } },
                    missingSkills: { type: "ARRAY", items: { type: "STRING" } },
                    totalWeeks: { type: "NUMBER" },
                    weeks: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                weekNumber: { type: "NUMBER" },
                                focusSkills: { type: "ARRAY", items: { type: "STRING" } },
                                title: { type: "STRING" },
                                description: { type: "STRING" },
                                learningObjectives: { type: "ARRAY", items: { type: "STRING" } },
                                resources: {
                                    type: "ARRAY",
                                    items: {
                                        type: "OBJECT",
                                        properties: {
                                            platform: { type: "STRING" },
                                            recommendedTopic: { type: "STRING" },
                                            type: { type: "STRING" },
                                            isPaid: { type: "BOOLEAN" }
                                        },
                                        required: ["platform", "recommendedTopic", "type", "isPaid"]
                                    }
                                },
                                estimatedHours: { type: "STRING" },
                                miniProject: { type: "STRING" },
                                quiz: {
                                    type: "OBJECT",
                                    properties: {
                                        questions: {
                                            type: "ARRAY",
                                            items: {
                                                type: "OBJECT",
                                                properties: {
                                                    question: { type: "STRING" },
                                                    options: { type: "ARRAY", items: { type: "STRING" } },
                                                    correctAnswerIndex: { type: "NUMBER" },
                                                    explanation: { type: "STRING" }
                                                },
                                                required: ["question", "options", "correctAnswerIndex", "explanation"]
                                            }
                                        }
                                    },
                                    required: ["questions"]
                                }
                            },
                            required: ["weekNumber", "focusSkills", "title", "description", "learningObjectives", "resources", "estimatedHours", "miniProject", "quiz"]
                        }
                    }
                },
                required: ["targetRole", "summary", "weeks"]
            }
        }
    };

    const parsed = await callGeminiApi(payload, systemPrompt);

    parsed.createdAt = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    parsed.id = 'plan_' + Date.now();
    parsed.weeks = parsed.weeks.map((w, idx) => ({
        ...w,
        unlocked: idx === 0,
        selectedResourceIndex: 0,
        resourceCompleted: false,
        miniProjectSubmission: "",
        miniProjectSubmitted: false,
        quizPassed: false,
        quizScore: null,
        userAnswers: new Array(10).fill(-1),
        expanded: idx === 0,
        objectivesCompleted: new Array(w.learningObjectives ? w.learningObjectives.length : 3).fill(false)
    }));

    return parsed;
}

function generateFallbackPlan(role, existing, missing, weeksCount) {
    const missingList = missing.split(',').map(s => s.trim()).filter(Boolean);
    const existingList = existing.split(',').map(s => s.trim()).filter(Boolean);

    const weeklyTopics = deriveTopicsForRoleAndMissing(role, missingList, weeksCount);

    const weeks = [];
    for (let i = 1; i <= weeksCount; i++) {
        const topicName = weeklyTopics[i - 1] || `${role} Fundamentals Part ${i}`;
        const questions = generateUniqueTechnicalQuestionsForTopic(topicName, role);

        weeks.push({
            weekNumber: i,
            focusSkills: [topicName],
            title: `Mastering ${topicName}`,
            description: `In-depth theoretical principles, practical integration techniques, and production standards for ${topicName} in ${role}.`,
            learningObjectives: [
                `Understand core mechanics and governing equations of ${topicName}`,
                `Apply ${topicName} to real-world engineering and architecture problems`,
                `Pass interview-level technical assessments on ${topicName}`
            ],
            resources: [
                { platform: "freeCodeCamp / YouTube", recommendedTopic: `${topicName} Comprehensive Deep-Dive`, type: "Full Course", isPaid: false },
                { platform: "Coursera", recommendedTopic: `${topicName} Professional Specialization`, type: "Guided Track", isPaid: true },
                { platform: "Interactive Practice Sandbox", recommendedTopic: `${topicName} Practical Hands-On Exercises`, type: "Interactive Practice", isPaid: false }
            ],
            selectedResourceIndex: 0,
            resourceCompleted: false,
            miniProject: `Real-World ${role} Project: Build, simulate, or document a functional prototype implementing ${topicName} with comprehensive logging and error resilience.`,
            miniProjectSubmission: "",
            miniProjectSubmitted: false,
            estimatedHours: "6-8 hrs/week",
            unlocked: i === 1,
            quizPassed: false,
            quizScore: null,
            userAnswers: new Array(10).fill(-1),
            expanded: i === 1,
            objectivesCompleted: [false, false, false],
            quiz: { questions }
        });
    }

    return {
        id: 'plan_' + Date.now(),
        targetRole: role,
        summary: `Customized ${weeksCount}-week curriculum tailored for ${role} targeting ${weeklyTopics.slice(0, 3).join(', ')}.`,
        existingSkills: existingList,
        missingSkills: missingList,
        totalWeeks: weeksCount,
        createdAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        weeks: weeks
    };
}

function deriveTopicsForRoleAndMissing(role, missingList, count) {
    const roleLower = role.toLowerCase();
    const isWebRole = roleLower.includes('frontend') || roleLower.includes('backend') || roleLower.includes('full stack') || roleLower.includes('web');
    
    let topics = missingList.filter(s => {
        const sLower = s.toLowerCase();
        if (!isWebRole && (sLower.includes('react') || sLower.includes('tailwind') || sLower.includes('next.js') || sLower.includes('css'))) {
            return false;
        }
        return true;
    });

    const defaultRoleMap = [
        {
            check: r => r.includes('chemical'),
            defaults: ["Chemical Thermodynamics & Phase Equilibria", "Chemical Reaction Engineering & Kinetics", "Heat & Mass Transfer Operations", "Unit Operations & Separation Processes", "Process Dynamics, Control & Instrumentation", "ASPEN Plus & DWSIM Process Simulation"]
        },
        {
            check: r => r.includes('aerospace'),
            defaults: ["Aerodynamics & CFD", "Propulsion & Gas Turbines", "Avionics & Flight Controls", "Structural Mechanics & CAD", "Orbital Dynamics & Trajectory", "Flight Simulation & Systems"]
        },
        {
            check: r => r.includes('ai') || r.includes('llm') || r.includes('prompt'),
            defaults: ["Transformers & Attention Mechanisms", "RAG & Vector Databases", "LangChain & AI Agents", "Model Fine-Tuning (PEFT/LoRA)", "MLOps & Model Monitoring", "LLM Security & Guardrails"]
        },
        {
            check: r => r.includes('data scientist') || r.includes('data engineer'),
            defaults: ["Exploratory Data Analysis & SQL", "Feature Engineering & Statistics", "Supervised & Unsupervised ML", "Data Pipeline Orchestration", "Deep Learning Architectures", "Model Deployment & Monitoring"]
        },
        {
            check: r => r.includes('frontend') || r.includes('web'),
            defaults: ["Modern JavaScript & TypeScript", "React Component Patterns & State", "Tailwind CSS & Responsive Layouts", "Next.js & Server Side Rendering", "Web Performance & Optimization", "State Management & Testing"]
        }
    ];

    const matchedConfig = defaultRoleMap.find(item => item.check(roleLower));
    if (matchedConfig) {
        matchedConfig.defaults.forEach(t => { if (!topics.includes(t)) topics.push(t); });
    }

    while (topics.length < count) {
        topics.push(`${role} Specialization Part ${topics.length + 1}`);
    }

    return topics.slice(0, count);
}

function generateUniqueTechnicalQuestionsForTopic(topic, role) {
    const questionTemplates = [
        {
            q: `What is a primary principle when designing or analyzing ${topic} for ${role}?`,
            opts: [
                `Optimizing for high efficiency and minimal system bottleneck under load`,
                `Ignoring boundary conditions to save execution time`,
                `Hardcoding system constants into non-scalable configuration files`,
                `Bypassing error checking during primary execution cycles`
            ],
            ans: 0,
            exp: `Proper engineering in ${topic} requires accounting for efficiency, safety, and non-linear operational limits.`
        },
        {
            q: `Which failure mode is most critical to monitor when deploying ${topic} solutions in production?`,
            opts: [
                `Unchecked thermal or resource degradation over continuous operations`,
                `Excessive logging of non-fatal operational metrics`,
                `Slightly elevated user response latency during off-peak hours`,
                `Standard auto-scaling triggers operating as expected`
            ],
            ans: 0,
            exp: `Continuous operations in ${topic} must actively monitor resource accumulation and boundary threshold degradation.`
        },
        {
            q: `In a technical interview for ${role}, how would you justify selecting a specific methodology for ${topic}?`,
            opts: [
                `By evaluating trade-offs between computational overhead, scalability, and maintainability`,
                `By selecting the newest tool regardless of legacy system compatibility`,
                `By eliminating error logs to artificially boost performance benchmark numbers`,
                `By avoiding automated validation to speed up initial deployment`
            ],
            ans: 0,
            exp: `Senior engineers evaluate trade-offs rather than choosing tools based on hype or skipping validation.`
        },
        {
            q: `What is the role of telemetry and observability when managing ${topic}?`,
            opts: [
                `To provide real-time diagnostic visibility into health metrics and edge failures`,
                `To replace unit testing entirely in staging environments`,
                `To store unencrypted plain-text credentials for debugging`,
                `To force synchronous single-threaded event processing`
            ],
            ans: 0,
            exp: `Telemetry provides critical insight into runtime behavior, enabling rapid anomaly detection in ${topic}.`
        },
        {
            q: `How does optimization of ${topic} directly impact overall ${role} system performance?`,
            opts: [
                `It reduces resource footprint and prevents systemic cascading bottlenecks`,
                `It guarantees zero network latency regardless of physical constraints`,
                `It eliminates the need for security compliance audits`,
                `It disables automated build checks`
            ],
            ans: 0,
            exp: `Effective optimization of ${topic} prevents single points of contention from impacting downstream components.`
        },
        {
            q: `Which standard verification approach is essential before shipping ${topic} modules?`,
            opts: [
                `Rigorous automated unit, integration, and stress testing under peak scenarios`,
                `Deploying directly to production environments without sandbox testing`,
                `Manually checking a single happy-path test case`,
                `Disabling continuous integration assertions`
            ],
            ans: 0,
            exp: `Robust verification requires comprehensive automated coverage across both nominal and extreme edge conditions.`
        },
        {
            q: `When scaling ${topic} capabilities, what trade-off must engineers carefully balance?`,
            opts: [
                `System throughput vs resource cost and architectural complexity`,
                `Code comments vs compile time`,
                `Dark mode aesthetics vs database indexing`,
                `Mouse polling rate vs API rate limits`
            ],
            ans: 0,
            exp: `Scaling ${topic} requires balancing raw output speed with budget, maintainability, and infrastructure overhead.`
        },
        {
            q: `What is a recognized best practice for error recovery in ${topic}?`,
            opts: [
                `Implementing idempotent retry mechanisms with exponential backoff`,
                `Crashing the entire system immediately upon receiving invalid input`,
                `Silently swallowing exceptions without logging diagnostic trails`,
                `Writing error logs into temporary client storage`
            ],
            ans: 0,
            exp: `Exponential backoff prevents retry storms from overwhelming recoverably stressed systems.`
        },
        {
            q: `How does modularization benefit long-term maintenance of ${topic}?`,
            opts: [
                `It isolates domain logic, enabling independent testing and seamless upgrades`,
                `It increases code duplication to ensure redundant fallback files`,
                `It forces all developers to work in a single monolithic file`,
                `It removes compile-time type safety checks`
            ],
            ans: 0,
            exp: `Modular design encapsulates complexity, allowing individual components of ${topic} to evolve safely.`
        },
        {
            q: `What distinguishes an enterprise-grade ${topic} implementation from a basic prototype?`,
            opts: [
                `Fault tolerance, security compliance, automated CI/CD, and robust documentation`,
                `A colorful user interface without backend input validation`,
                `Using hardcoded API keys directly inside source control repositories`,
                `Skipping load testing to meet aggressive sprint deadlines`
            ],
            ans: 0,
            exp: `Enterprise solutions prioritize security, resilience, automated testing, and long-term operational sustainability.`
        }
    ];

    return questionTemplates.map((item, idx) => {
        const shuffledOpts = shuffleArray(item.opts);
        const correctText = item.opts[item.ans];
        const newCorrectIdx = shuffledOpts.indexOf(correctText);

        return {
            question: `${idx + 1}. ${item.q}`,
            options: shuffledOpts,
            correctAnswerIndex: newCorrectIdx,
            explanation: item.exp,
            wasCorrect: false
        };
    });
}

function renderStudyPlan(plan) {
    if (!plan) return;

    document.getElementById('planRoleTitle').innerText = plan.targetRole;
    document.getElementById('planSummaryText').innerText = plan.summary;

    document.getElementById('planOutputContainer').classList.remove('hidden');
    const exportBtn = document.getElementById('exportPlanBtn');
    exportBtn.classList.remove('hidden');
    exportBtn.classList.add('flex');

    renderWeekCards();
    renderGapAnalysisPanel();
    updateProgressMetrics();
}

function renderGapAnalysisPanel() {
    const panel = document.getElementById('sideGapAnalysisPanel');
    if (!panel || !currentPlan) return;

    const existing = currentPlan.existingSkills || [];
    const missing = currentPlan.missingSkills || [];
    const weeks = currentPlan.weeks || [];

    let html = `
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 class="text-sm font-bold text-white flex items-center gap-2">
                <i class="fa-solid fa-chart-pie text-brand-400"></i> Skill Gap Analysis
            </h3>
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30 font-bold uppercase">Live Matrix</span>
        </div>

        <!-- Covered / Strong Skills -->
        <div class="space-y-2">
            <h4 class="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <i class="fa-solid fa-circle-check"></i> Covered / Strong Skills (${existing.length})
            </h4>
            <div class="flex flex-wrap gap-1.5">
                ${existing.length > 0 ? existing.map(s => `
                    <span class="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-800/80 flex items-center gap-1 font-medium">
                        <i class="fa-solid fa-check text-[9px]"></i> ${escapeHtml(s)}
                    </span>
                `).join('') : `<span class="text-xs text-slate-500 italic">None specified</span>`}
            </div>
        </div>

        <!-- Missing Skills & Quick Add to Plan -->
        <div class="space-y-2">
            <h4 class="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <i class="fa-solid fa-triangle-exclamation"></i> Required Skill Gaps (${missing.length})
            </h4>
            <div class="space-y-2">
                ${missing.length > 0 ? missing.map(s => {
                    const matchingWeek = weeks.find(w => (w.focusSkills || []).some(fs => fs.toLowerCase().includes(s.toLowerCase())));
                    const inPlan = !!matchingWeek;
                    const encodedSkill = encodeURIComponent(s);

                    return `
                        <div class="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2 shadow-sm">
                            <div class="min-w-0 flex-1">
                                <p class="text-xs font-bold text-white truncate">${escapeHtml(s)}</p>
                                <span class="text-[10px] text-slate-400 font-medium">${inPlan ? 'Mapped to W' + matchingWeek.weekNumber : 'Skill gap detected'}</span>
                            </div>
                            ${inPlan ? `
                                <span class="text-[10px] px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 flex-shrink-0 font-medium">
                                    <i class="fa-solid fa-check text-emerald-400 mr-1"></i> In Plan
                                </span>
                            ` : `
                                <button onclick="addSkillWeekToPlan(decodeURIComponent('${encodedSkill}'))" class="px-2.5 py-1 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-[11px] font-bold transition flex items-center gap-1 flex-shrink-0 shadow">
                                    <i class="fa-solid fa-plus text-[9px]"></i> Add
                                </button>
                            `}
                        </div>
                    `;
                }).join('') : `<p class="text-xs text-slate-500 italic">No missing skills detected</p>`}
            </div>
        </div>

        <!-- Plan At a Glance Status -->
        <div class="space-y-2 border-t border-slate-800 pt-3">
            <h4 class="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                <i class="fa-solid fa-list-ul"></i> Plan At A Glance
            </h4>
            <div class="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                ${weeks.map((w) => `
                    <div class="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs">
                        <span class="font-medium text-slate-200 truncate pr-2">W${w.weekNumber}: ${escapeHtml(w.title)}</span>
                        ${w.quizPassed ? `
                            <span class="text-[10px] text-emerald-400 font-bold flex items-center gap-1 flex-shrink-0">
                                <i class="fa-solid fa-circle-check"></i> Mastered
                            </span>
                        ` : w.unlocked ? `
                            <span class="text-[10px] text-amber-400 font-bold flex items-center gap-1 flex-shrink-0">
                                <i class="fa-solid fa-hourglass-half"></i> In Progress
                            </span>
                        ` : `
                            <span class="text-[10px] text-slate-500 italic flex items-center gap-1 flex-shrink-0">
                                <i class="fa-solid fa-lock"></i> Locked
                            </span>
                        `}
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    panel.innerHTML = html;
}

function addSkillWeekToPlan(skillName) {
    if (!currentPlan || !currentPlan.weeks) return;

    const newWeekNum = currentPlan.weeks.length + 1;
    const questions = generateUniqueTechnicalQuestionsForTopic(skillName, currentPlan.targetRole);

    const newWeek = {
        weekNumber: newWeekNum,
        focusSkills: [skillName],
        title: `Mastery in ${skillName}`,
        description: `Dedicated deep dive into fundamental mechanics, architectural integration patterns, and operational standards for ${skillName}.`,
        learningObjectives: [
            `Understand core governing concepts of ${skillName}`,
            `Implement industry-standard design patterns`,
            `Pass technical interview-grade evaluation`
        ],
        resources: [
            { platform: "freeCodeCamp / YouTube", recommendedTopic: `${skillName} Full Practical Crash Course`, type: "Hands-on Video", isPaid: false },
            { platform: "Coursera / Udemy", recommendedTopic: `${skillName} Enterprise Specialization`, type: "Guided Track", isPaid: true },
            { platform: "Interactive Sandbox", recommendedTopic: `${skillName} Real-World Hands-on Exercises`, type: "Interactive Tutorial", isPaid: false }
        ],
        selectedResourceIndex: 0,
        resourceCompleted: false,
        miniProject: `Enterprise Implementation: Build and deploy a modular prototype using ${skillName} with production logging, error recovery, and automated testing.`,
        miniProjectSubmission: "",
        miniProjectSubmitted: false,
        estimatedHours: "6-8 hrs/week",
        unlocked: currentPlan.weeks.every(w => w.quizPassed),
        quizPassed: false,
        quizScore: null,
        userAnswers: new Array(10).fill(-1),
        expanded: true,
        objectivesCompleted: [false, false, false],
        quiz: { questions }
    };

    currentPlan.weeks.push(newWeek);
    currentPlan.totalWeeks = currentPlan.weeks.length;

    saveActivePlanToStorage();
    renderWeekCards();
    renderGapAnalysisPanel();
    updateProgressMetrics();
    showToast(`Added Week ${newWeekNum} (${skillName}) to your roadmap!`, "success");
}

function renderWeekCards() {
    const container = document.getElementById('weekCardsContainer');
    container.innerHTML = '';

    if (!currentPlan || !currentPlan.weeks) return;

    currentPlan.weeks.forEach((week, weekIdx) => {
        const card = document.createElement('div');
        const isLocked = !week.unlocked;
        const isExpanded = week.expanded === true && !isLocked;

        const isResourceDone = !!week.resourceCompleted;
        const isProjectDone = !!week.miniProjectSubmitted;
        const isQuizUnlocked = isResourceDone && isProjectDone;

        card.className = `glass-card rounded-2xl border transition-all duration-300 overflow-hidden ${
            isLocked ? 'locked-card border-slate-800' :
            week.quizPassed ? 'border-emerald-500/40 bg-emerald-950/10' : 'border-slate-800 hover:border-slate-700'
        }`;

        const resources = week.resources && week.resources.length ? week.resources : [{ platform: 'freeCodeCamp', recommendedTopic: week.title, type: 'Tutorial', isPaid: false }];
        const selectedIdx = week.selectedResourceIndex || 0;
        const activeRes = resources[selectedIdx] || resources[0];

        const searchQuery = encodeURIComponent(`${activeRes.platform} ${activeRes.recommendedTopic}`);
        const platformSearchUrl = `https://www.google.com/search?q=${searchQuery}`;

        card.innerHTML = `
            <!-- Header -->
            <div onclick="${isLocked ? '' : `toggleWeekExpand(${weekIdx})`}" 
                class="p-5 flex items-center justify-between ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'} select-none bg-slate-900/80 transition group">
                
                <div class="flex items-center gap-3.5 flex-1 min-w-0 pr-3">
                    <div class="w-9 h-9 rounded-xl border flex items-center justify-center ${
                        isLocked ? 'bg-slate-800 border-slate-700 text-slate-500' :
                        week.quizPassed ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/25' :
                        'bg-brand-500/20 border-brand-500/40 text-brand-300'
                    }">
                        <i class="fa-solid ${isLocked ? 'fa-lock text-xs' : week.quizPassed ? 'fa-circle-check text-sm' : 'fa-graduation-cap text-xs'}"></i>
                    </div>

                    <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-2 mb-1">
                            <span class="text-xs font-bold px-2.5 py-0.5 rounded-full ${
                                isLocked ? 'bg-slate-800 text-slate-500' :
                                week.quizPassed ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                            }">
                                Week ${week.weekNumber} ${isLocked ? '(Locked)' : ''}
                            </span>
                            ${(week.focusSkills || []).map(s => `<span class="text-[11px] px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 truncate font-medium">${escapeHtml(s)}</span>`).join('')}
                            <span class="text-[11px] text-slate-400 ml-auto sm:ml-0 font-medium"><i class="fa-regular fa-clock text-brand-400 mr-1"></i>${escapeHtml(week.estimatedHours)}</span>
                        </div>
                        <h3 class="text-base sm:text-lg font-bold text-white truncate">
                            ${escapeHtml(week.title)}
                        </h3>
                    </div>
                </div>

                <!-- Quiz Status Pill -->
                <div class="flex items-center gap-3 flex-shrink-0">
                    ${week.quizPassed ? `<span class="text-xs px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold"><i class="fa-solid fa-award mr-1"></i> Passed (${week.quizScore}/10)</span>` : 
                     isLocked ? `<span class="text-xs text-slate-500 italic font-medium"><i class="fa-solid fa-lock text-[10px] mr-1"></i> Complete W${week.weekNumber - 1}</span>` : 
                     isQuizUnlocked ? `<span class="text-xs px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold animate-pulse"><i class="fa-solid fa-lock-open mr-1"></i> Quiz Ready</span>` :
                     `<span class="text-xs px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold"><i class="fa-solid fa-hourglass-half mr-1"></i> In Progress</span>`}
                    
                    ${!isLocked ? `<div class="w-8 h-8 rounded-xl bg-slate-800 group-hover:bg-brand-600 text-slate-400 group-hover:text-white flex items-center justify-center transition" aria-label="Toggle week">
                        <i class="fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-xs"></i>
                    </div>` : ''}
                </div>
            </div>

            <!-- Expandable Content -->
            <div class="accordion-content ${isExpanded ? 'block p-6 border-t border-slate-800/80' : 'hidden'} space-y-6">
                <p class="text-sm text-slate-300 leading-relaxed font-normal">${escapeHtml(week.description)}</p>

                <!-- Learning Objectives Checklist -->
                <div class="bg-slate-900/80 rounded-xl p-4 border border-slate-800">
                    <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <i class="fa-solid fa-list-check text-indigo-400"></i> Core Learning Objectives
                    </h4>
                    <ul class="space-y-2">
                        ${(week.learningObjectives || []).map((obj, objIdx) => {
                            const isSubDone = week.objectivesCompleted && week.objectivesCompleted[objIdx];
                            return `
                                <li class="flex items-center gap-2.5 text-xs sm:text-sm text-slate-200 cursor-pointer select-none" onclick="toggleObjectiveCompletion(${weekIdx}, ${objIdx})">
                                    <input type="checkbox" ${isSubDone ? 'checked' : ''} class="w-4 h-4 rounded border-slate-700 bg-slate-800 text-brand-600 focus:ring-brand-500">
                                    <span class="${isSubDone ? 'line-through text-slate-400' : 'font-medium'}">${escapeHtml(obj)}</span>
                                </li>
                            `;
                        }).join('')}
                    </ul>
                </div>

                <!-- STEP 1: Flexible Resource Picker + Completion Check -->
                <div class="bg-cardbg p-5 rounded-xl border border-slate-800 space-y-4">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                        <div>
                            <span class="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                                <i class="fa-solid fa-photo-film"></i> 1. Flexible Learning Resource
                            </span>
                            <p class="text-xs text-slate-400 mt-0.5 font-medium">Select your preferred learning platform for this topic:</p>
                        </div>
                        
                        <button onclick="toggleResourceCompleted(${weekIdx})" 
                            class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 self-start sm:self-auto ${
                                isResourceDone ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                            }">
                            <i class="fa-solid ${isResourceDone ? 'fa-circle-check text-emerald-200' : 'fa-circle text-slate-500'}"></i>
                            <span>${isResourceDone ? 'Resource Completed' : 'Mark Resource Done'}</span>
                        </button>
                    </div>

                    <!-- Resource Alternative Tabs -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        ${resources.map((res, rIdx) => {
                            const isSelected = selectedIdx === rIdx;
                            return `
                                <div onclick="selectWeekResource(${weekIdx}, ${rIdx})" 
                                    class="p-3.5 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                                        isSelected ? 'bg-brand-950/60 border-brand-500 shadow-md ring-1 ring-brand-500' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                                    }">
                                    <div>
                                        <div class="flex items-center justify-between gap-1 mb-1.5">
                                            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${res.isPaid ? 'bg-purple-950/80 text-purple-300 border border-purple-800' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'}">
                                                ${res.isPaid ? 'Paid' : 'Free'}
                                            </span>
                                            ${isSelected ? '<i class="fa-solid fa-circle-dot text-brand-400 text-xs"></i>' : ''}
                                        </div>
                                        <p class="text-xs font-bold text-white truncate">${escapeHtml(res.platform)}</p>
                                        <p class="text-[11px] text-slate-400 line-clamp-2 mt-0.5 font-normal">${escapeHtml(res.recommendedTopic)}</p>
                                    </div>
                                    <span class="text-[10px] text-slate-500 mt-2 block font-medium"><i class="fa-solid fa-tag text-[9px] mr-1"></i>${escapeHtml(res.type || 'Course')}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>

                    <div class="flex items-center justify-between pt-1">
                        <p class="text-xs text-slate-300 font-medium truncate">
                            <span class="text-slate-400">Selected:</span> <strong class="text-white">${escapeHtml(activeRes.platform)}</strong> — ${escapeHtml(activeRes.recommendedTopic)}
                        </p>
                        <a href="${platformSearchUrl}" target="_blank" rel="noopener noreferrer" class="px-3.5 py-1.5 rounded-xl bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-800/80 text-indigo-300 hover:text-white text-xs font-semibold transition flex items-center gap-1.5 flex-shrink-0">
                            <span>Launch</span> <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                        </a>
                    </div>
                </div>

                <!-- STEP 2: Mini-Project (Progressively Unlocked after Step 1) -->
                <div class="bg-cardbg p-5 rounded-xl border border-slate-800 space-y-3 transition ${!isResourceDone ? 'opacity-50 pointer-events-none' : ''}">
                    <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span class="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                            <i class="fa-solid fa-laptop-code"></i> 2. Mini-Project Submission Verification
                        </span>
                        ${!isResourceDone ? `<span class="text-xs text-slate-500 font-medium"><i class="fa-solid fa-lock text-[10px] mr-1"></i> Complete Step 1 First</span>` :
                         isProjectDone ? `<span class="text-xs text-emerald-400 font-bold flex items-center gap-1"><i class="fa-solid fa-circle-check"></i> Project Verified</span>` : `<span class="text-xs text-amber-400 font-semibold">Submission Required</span>`}
                    </div>
                    
                    <p class="text-xs text-slate-300 leading-relaxed font-normal bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
                        <strong class="text-cyan-300 block mb-0.5 font-bold">Real-World Enterprise Scenario:</strong>
                        ${escapeHtml(week.miniProject)}
                    </p>

                    <div class="space-y-2">
                        <label for="projInput_${weekIdx}" class="text-[11px] font-bold text-slate-400 block">
                            Describe your solution or paste a link (e.g. GitHub repo, Figma, live demo, PR link):
                        </label>
                        <div class="flex flex-col sm:flex-row gap-2">
                            <input type="text" id="projInput_${weekIdx}" 
                                ${!isResourceDone ? 'disabled' : ''}
                                value="${escapeHtml(week.miniProjectSubmission || '')}"
                                placeholder="e.g. https://github.com/myrepo or Built interactive dashboard with filtering logic..." 
                                class="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500/50 outline-none">
                            
                            <button type="button" onclick="submitMiniProjectProof(${weekIdx})" 
                                ${!isResourceDone ? 'disabled' : ''}
                                class="px-4 py-2 rounded-xl ${isProjectDone ? 'bg-cyan-700 hover:bg-cyan-600' : 'bg-cyan-600 hover:bg-cyan-500'} text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md whitespace-nowrap">
                                <i class="fa-solid ${isProjectDone ? 'fa-pen-to-square' : 'fa-paper-plane'}"></i>
                                <span>${isProjectDone ? 'Update Proof' : 'Submit Proof'}</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- STEP 3: CHECKPOINT QUIZ SECTION (HIDDEN UNTIL PREREQUISITES COMPLETE) -->
                ${!isQuizUnlocked ? `
                    <div class="p-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/60 text-center space-y-2">
                        <div class="flex items-center justify-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
                            <i class="fa-solid fa-lock text-indigo-400"></i> Step 3: Checkpoint Quiz Hidden
                        </div>
                        <p class="text-xs text-slate-400 max-w-sm mx-auto font-medium">
                            Complete <strong class="text-slate-200">Step 1 (Resource)</strong> and <strong class="text-slate-200">Step 2 (Mini-Project)</strong> above to unlock the 10-question evaluation quiz!
                        </p>
                    </div>
                ` : `
                    <div class="bg-indigo-950/20 rounded-xl p-5 border border-indigo-800/60 space-y-4 relative overflow-hidden transition-all duration-500">
                        <div class="flex items-center justify-between border-b border-indigo-900/80 pb-3">
                            <div>
                                <h4 class="text-sm font-bold text-white flex items-center gap-2">
                                    <i class="fa-solid fa-clipboard-question text-brand-400"></i> 3. Week ${week.weekNumber} Checkpoint Quiz
                                </h4>
                                <p class="text-[11px] text-indigo-300 font-medium">Technical interview-grade evaluation (10 Questions). Score ≥ 8/10 to unlock Week ${week.weekNumber + 1}.</p>
                            </div>
                            ${week.quizPassed ? `<span class="text-xs bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full border border-emerald-500/30 font-bold"><i class="fa-solid fa-circle-check mr-1"></i> Passed</span>` : ''}
                        </div>

                        ${renderQuizQuestionsUI(week, weekIdx)}
                    </div>
                `}

            </div>
        `;

        container.appendChild(card);
    });
}

function selectWeekResource(weekIdx, resourceIdx) {
    if (!currentPlan || !currentPlan.weeks?.[weekIdx]) return;
    currentPlan.weeks[weekIdx].selectedResourceIndex = resourceIdx;
    saveActivePlanToStorage();
    renderWeekCards();
}

function toggleResourceCompleted(weekIdx) {
    if (!currentPlan || !currentPlan.weeks?.[weekIdx]) return;
    const week = currentPlan.weeks[weekIdx];
    week.resourceCompleted = !week.resourceCompleted;
    saveActivePlanToStorage();
    renderWeekCards();
    showToast(week.resourceCompleted ? "Resource completed! Step 2 unlocked." : "Resource status reset.", "info");
}

function submitMiniProjectProof(weekIdx) {
    if (!currentPlan || !currentPlan.weeks?.[weekIdx]) return;
    const input = document.getElementById(`projInput_${weekIdx}`);
    const val = input ? input.value.trim() : "";

    if (!val) {
        showToast("Please describe what you built or paste a project link first.", "error");
        return;
    }

    const week = currentPlan.weeks[weekIdx];
    week.miniProjectSubmission = val;
    week.miniProjectSubmitted = true;
    saveActivePlanToStorage();
    renderWeekCards();
    showToast("Mini-project verified! Step 3 Quiz unlocked!", "success");
}

function renderQuizQuestionsUI(week, weekIdx) {
    if (!week.quiz || !week.quiz.questions) return `<p class="text-xs text-slate-400">No quiz questions available.</p>`;

    let html = `<form onsubmit="handleQuizSubmit(event, ${weekIdx})" class="space-y-4">`;

    week.quiz.questions.forEach((q, qIdx) => {
        const selectedAns = week.userAnswers ? week.userAnswers[qIdx] : -1;
        const isSubmitted = week.quizScore !== null;
        const isCorrect = q.wasCorrect === true;

        html += `
            <div class="bg-slate-900/90 p-4 sm:p-5 rounded-xl border ${isSubmitted ? (isCorrect ? 'border-emerald-500/40 bg-emerald-950/10' : 'border-red-500/40 bg-red-950/10') : 'border-slate-800'} space-y-3">
                <div class="flex items-start justify-between gap-2">
                    <p class="text-xs sm:text-sm font-bold text-slate-100">${qIdx + 1}. ${escapeHtml(q.question)}</p>
                    ${isSubmitted ? (isCorrect ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex-shrink-0"><i class="fa-solid fa-check mr-1"></i>Correct</span>` : `<span class="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 flex-shrink-0"><i class="fa-solid fa-xmark mr-1"></i>Incorrect</span>`) : ''}
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    ${q.options.map((opt, optIdx) => {
                        const checked = selectedAns === optIdx ? 'checked' : '';
                        const isThisCorrect = q.correctAnswerIndex === optIdx;
                        let borderStyle = 'border-slate-700/80';
                        if (selectedAns === optIdx) borderStyle = 'border-brand-500 bg-brand-950/40 text-white font-semibold';
                        if (isSubmitted && isThisCorrect) borderStyle = 'border-emerald-500 bg-emerald-950/40 text-emerald-200 font-extrabold';
                        if (isSubmitted && selectedAns === optIdx && !isThisCorrect) borderStyle = 'border-red-500 bg-red-950/40 text-red-200';

                        return `
                            <label class="p-3 rounded-xl border bg-slate-800/80 hover:bg-slate-700/80 cursor-pointer flex items-center gap-2.5 text-slate-300 transition ${borderStyle}">
                                <input type="radio" name="quiz_q_${weekIdx}_${qIdx}" value="${optIdx}" ${checked} ${isSubmitted ? 'disabled' : ''} onchange="recordUserAnswer(${weekIdx}, ${qIdx}, ${optIdx})" class="text-brand-600 focus:ring-brand-500">
                                <span class="leading-snug">${escapeHtml(opt)}</span>
                            </label>
                        `;
                    }).join('')}
                </div>
                ${isSubmitted && q.explanation ? `<p class="text-[11px] text-slate-400 italic pt-1 font-normal"><i class="fa-solid fa-circle-info text-indigo-400 mr-1"></i> ${escapeHtml(q.explanation)}</p>` : ''}
            </div>
        `;
    });

    if (week.quizScore !== null) {
        if (week.quizScore >= 8) {
            html += `
                <div class="p-4 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-center space-y-1 shadow-lg">
                    <p class="text-xs font-bold text-emerald-300"><i class="fa-solid fa-award text-emerald-400 text-sm mr-1.5"></i> Checkpoint Passed! Score: ${week.quizScore}/10 (${Math.round((week.quizScore/10)*100)}%)</p>
                    <p class="text-[11px] text-emerald-200/80 font-medium">Great job! Week ${week.weekNumber + 1} has been unlocked.</p>
                </div>
            `;
        } else {
            const wrongCount = week.quiz.questions.length - week.quizScore;
            html += `
                <div class="p-4 bg-red-950/80 border border-red-500/40 rounded-xl space-y-3 shadow-lg">
                    <div class="text-center">
                        <p class="text-xs font-bold text-red-300"><i class="fa-solid fa-triangle-exclamation mr-1.5 text-sm"></i> Quiz Failed (Score: ${week.quizScore}/10)</p>
                        <p class="text-[11px] text-red-200/80 mt-1 font-medium">You scored ${week.quizScore}/10 (${wrongCount} wrong). You need at least 8/10 to unlock Week ${week.weekNumber + 1}.</p>
                        <p class="text-[10px] text-red-300/70 mt-0.5 italic">Note: On retry, correct questions are replaced with fresh questions, and failed questions are re-tested with shuffled answer choices.</p>
                    </div>
                    <button type="button" onclick="regenerateWeekAdaptive(${weekIdx})" class="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-md">
                        <i class="fa-solid fa-rotate" id="regenSpin_${weekIdx}"></i>
                        <span>Adapt & Retry Quiz (${wrongCount} Choices Shuffled + Fresh Replacements)</span>
                    </button>
                </div>
            `;
        }
    } else {
        html += `
            <div class="flex justify-end pt-1">
                <button type="submit" class="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition shadow-lg flex items-center gap-2">
                    <i class="fa-solid fa-paper-plane"></i> Submit Quiz & Unlock Next Week
                </button>
            </div>
        `;
    }

    html += `</form>`;
    return html;
}

function recordUserAnswer(weekIdx, qIdx, optIdx) {
    if (!currentPlan || !currentPlan.weeks?.[weekIdx]) return;
    if (!currentPlan.weeks[weekIdx].userAnswers) currentPlan.weeks[weekIdx].userAnswers = new Array(10).fill(-1);
    currentPlan.weeks[weekIdx].userAnswers[qIdx] = optIdx;
}

function handleQuizSubmit(event, weekIdx) {
    event.preventDefault();
    const week = currentPlan.weeks[weekIdx];
    const qCount = week.quiz.questions.length;
    if (!week.userAnswers || week.userAnswers.length < qCount || week.userAnswers.slice(0, qCount).includes(-1)) {
        showToast(`Please answer all ${qCount} questions before submitting.`, "error");
        return;
    }

    let score = 0;
    week.quiz.questions.forEach((q, idx) => {
        const isCorrect = (week.userAnswers[idx] === q.correctAnswerIndex);
        q.wasCorrect = isCorrect;
        if (isCorrect) score++;
    });

    week.quizScore = score;
    week.quizPassed = score >= 8;

    if (week.quizPassed) {
        if (weekIdx + 1 < currentPlan.weeks.length) {
            currentPlan.weeks[weekIdx + 1].unlocked = true;
            showToast(`🎉 Week ${week.weekNumber} passed (${score}/10)! Week ${week.weekNumber + 1} unlocked!`, "success");
        } else {
            showToast("🎉 Final Week Quiz Passed! You completed the entire roadmap!", "success");
        }
    } else {
        showToast(`Quiz score: ${score}/10. Score ≥ 8 required to pass. Adapt & retry to refresh questions.`, "error");
    }

    saveActivePlanToStorage();
    renderWeekCards();
    renderGapAnalysisPanel();
    updateProgressMetrics();
}

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function shuffleQuestionOptions(q) {
    const correctAnswerText = q.options[q.correctAnswerIndex];
    const shuffledOptions = shuffleArray(q.options);
    const newCorrectIndex = shuffledOptions.indexOf(correctAnswerText);
    return {
        ...q,
        options: shuffledOptions,
        correctAnswerIndex: newCorrectIndex,
        wasCorrect: false
    };
}

async function regenerateWeekAdaptive(weekIdx) {
    const week = currentPlan.weeks[weekIdx];
    const icon = document.getElementById(`regenSpin_${weekIdx}`);
    if (icon) icon.classList.add('animate-spin');

    showToast(`Retrying Week ${week.weekNumber} quiz... Shuffling failed questions & fetching fresh replacements...`, "info");

    const existingQuestions = week.quiz?.questions || [];
    const wrongQuestions = existingQuestions.filter(q => q.wasCorrect === false);
    const numNewNeeded = 10 - wrongQuestions.length;

    const shuffledWrongQuestions = wrongQuestions.map(q => shuffleQuestionOptions(q));
    let replacementQuestions = [];

    if (numNewNeeded > 0) {
        try {
            const topicName = week.focusSkills[0] || week.title;
            const prompt = `Generate exactly ${numNewNeeded} NEW, distinct technical interview multiple-choice questions for role "${currentPlan.targetRole}" focusing on "${topicName}".
Ensure each question is scenario-based with 4 options, a 0-based correctAnswerIndex, and an explanation. DO NOT duplicate existing questions.`;

            const payload = {
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            questions: {
                                type: "ARRAY",
                                items: {
                                    type: "OBJECT",
                                    properties: {
                                        question: { type: "STRING" },
                                        options: { type: "ARRAY", items: { type: "STRING" } },
                                        correctAnswerIndex: { type: "NUMBER" },
                                        explanation: { type: "STRING" }
                                    },
                                    required: ["question", "options", "correctAnswerIndex", "explanation"]
                                }
                            }
                        },
                        required: ["questions"]
                    }
                }
            };

            const parsedData = await callGeminiApi(payload);
            replacementQuestions = parsedData.questions || [];

        } catch (err) {
            console.warn("Fallback replacement question generation:", err);
            const topicName = week.focusSkills[0] || currentPlan.targetRole;
            const freshPool = generateUniqueTechnicalQuestionsForTopic(topicName, currentPlan.targetRole);
            replacementQuestions = freshPool.slice(0, numNewNeeded);
        }
    }

    const combinedQuestions = shuffleArray([...shuffledWrongQuestions, ...replacementQuestions]);

    week.quiz.questions = combinedQuestions;
    week.quizScore = null;
    week.quizPassed = false;
    week.userAnswers = new Array(10).fill(-1);

    saveActivePlanToStorage();
    renderWeekCards();
    renderGapAnalysisPanel();
    updateProgressMetrics();
    showToast(`Quiz refreshed for Week ${week.weekNumber}! Failed questions shuffled & correct questions replaced.`, "success");
}

function toggleWeekExpand(weekIdx) {
    if (!currentPlan?.weeks?.[weekIdx]?.unlocked) return;
    currentPlan.weeks[weekIdx].expanded = !currentPlan.weeks[weekIdx].expanded;
    renderWeekCards();
}

function toggleExpandAll(shouldExpand) {
    if (!currentPlan?.weeks) return;
    currentPlan.weeks.forEach(w => {
        if (w.unlocked) w.expanded = shouldExpand;
    });
    renderWeekCards();
}

function toggleObjectiveCompletion(weekIdx, objIdx) {
    if (!currentPlan?.weeks?.[weekIdx]) return;
    const week = currentPlan.weeks[weekIdx];
    if (!week.objectivesCompleted) {
        week.objectivesCompleted = new Array(week.learningObjectives?.length || 3).fill(false);
    }
    week.objectivesCompleted[objIdx] = !week.objectivesCompleted[objIdx];
    saveActivePlanToStorage();
    renderWeekCards();
}

function updateProgressMetrics() {
    if (!currentPlan?.weeks) return;

    const total = currentPlan.weeks.length;
    const passedQuizzes = currentPlan.weeks.filter(w => w.quizPassed).length;
    const percentage = total > 0 ? Math.round((passedQuizzes / total) * 100) : 0;

    const progressBarFill = document.getElementById('progressBarFill');
    const progressText = document.getElementById('progressPercentageText');

    progressText.innerText = `${percentage}%`;
    progressBarFill.style.width = `${percentage}%`;
    document.getElementById('completedWeeksCount').innerText = `${passedQuizzes} of ${total} Quizzes Passed`;

    progressBarFill.classList.add('progress-glow-pulse');
    setTimeout(() => progressBarFill.classList.remove('progress-glow-pulse'), 800);
}

function saveActivePlanToStorage() {
    if (!currentPlan) return;
    Storage.set(CONFIG.STORAGE_KEYS.ACTIVE_PLAN, currentPlan);
    saveCurrentPlanToLocal();
}

function loadActivePlanFromStorage() {
    const saved = Storage.get(CONFIG.STORAGE_KEYS.ACTIVE_PLAN);
    if (saved) {
        currentPlan = saved;
        renderStudyPlan(currentPlan);
    }
}

function saveCurrentPlanToLocal() {
    if (!currentPlan) return;
    let savedPlans = getSavedPlansList();
    const index = savedPlans.findIndex(p => p.id === currentPlan.id);
    if (index >= 0) savedPlans[index] = currentPlan;
    else savedPlans.unshift(currentPlan);

    Storage.set(CONFIG.STORAGE_KEYS.SAVED_PLANS, savedPlans);
    updateSavedCountBadge(savedPlans);
}

function getSavedPlansList() {
    return Storage.get(CONFIG.STORAGE_KEYS.SAVED_PLANS, []);
}

function updateSavedCountBadge(cachedList = null) {
    const list = cachedList || getSavedPlansList();
    document.getElementById('savedCountBadge').innerText = list.length;
}

function toggleSavedPlansModal(show) {
    const modal = document.getElementById('savedPlansModal');
    if (show) {
        modal.classList.remove('hidden');
        renderSavedPlansListUI();
    } else {
        modal.classList.add('hidden');
    }
}

function renderSavedPlansListUI() {
    const listContainer = document.getElementById('savedPlansList');
    const plans = getSavedPlansList();

    if (plans.length === 0) {
        listContainer.innerHTML = `<p class="text-xs text-slate-400 text-center py-8">No saved plans yet. Generate one above!</p>`;
        return;
    }

    listContainer.innerHTML = plans.map((p) => {
        const passedCount = p.weeks ? p.weeks.filter(w => w.quizPassed).length : 0;
        const total = p.weeks ? p.weeks.length : 0;
        const pct = total > 0 ? Math.round((passedCount / total) * 100) : 0;

        return `
            <div class="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex items-center justify-between gap-3 shadow-sm">
                <div>
                    <h4 class="text-sm font-bold text-white">${escapeHtml(p.targetRole)}</h4>
                    <p class="text-[11px] text-slate-400 font-medium">${p.totalWeeks} Weeks • ${pct}% verified • ${p.createdAt || ''}</p>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="loadSavedPlanById('${p.id}')" class="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition">Load</button>
                    <button onclick="deleteSavedPlanById('${p.id}')" class="p-1.5 text-slate-500 hover:text-red-400 transition" aria-label="Delete saved plan"><i class="fa-solid fa-trash text-xs"></i></button>
                </div>
            </div>
        `;
    }).join('');
}

function loadSavedPlanById(id) {
    const found = getSavedPlansList().find(p => p.id === id);
    if (found) {
        currentPlan = found;
        saveActivePlanToStorage();
        renderStudyPlan(currentPlan);
        toggleSavedPlansModal(false);
        showToast(`Loaded plan for ${currentPlan.targetRole}`, "info");
    }
}

function deleteSavedPlanById(id) {
    let plans = getSavedPlansList().filter(p => p.id !== id);
    Storage.set(CONFIG.STORAGE_KEYS.SAVED_PLANS, plans);
    updateSavedCountBadge(plans);
    renderSavedPlansListUI();
}

function exportPlanMarkdown() {
    if (!currentPlan) return;
    let md = `# SkillPath AI Study Plan: ${currentPlan.targetRole}\n\n`;
    md += `**Summary:** ${currentPlan.summary}\n\n`;
    currentPlan.weeks.forEach(w => {
        md += `### Week ${w.weekNumber}: ${w.title}\n`;
        md += `- **Quiz Status:** ${w.quizPassed ? '✅ Verified Passed' : '⏳ Pending/Locked'}\n`;
        md += `- **Description:** ${w.description}\n`;
        md += `- **Mini Project:** ${w.miniProject}\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentPlan.targetRole.replace(/\s+/g, '_')}_Study_Plan.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Exported as Markdown!", "success");
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bgClass = type === 'success' ? 'bg-emerald-950/90 border-emerald-500 text-emerald-100' :
                    type === 'error' ? 'bg-red-950/90 border-red-500 text-red-100' :
                    'bg-indigo-950/90 border-indigo-500 text-indigo-100';

    toast.className = `pointer-events-auto px-4 py-3 rounded-2xl border ${bgClass} backdrop-blur-md shadow-2xl text-xs sm:text-sm font-semibold flex items-center gap-2.5 transition-all duration-300 transform translate-y-10 opacity-0`;
    toast.innerHTML = `<i class="fa-solid fa-circle-info"></i> <span>${escapeHtml(message)}</span>`;

    container.appendChild(toast);
    setTimeout(() => toast.classList.remove('translate-y-10', 'opacity-0'), 10);
    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
