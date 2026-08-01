🎯 SkillPath AI — Step-by-Step Precision Career Study Planner

SkillPath AI is an intelligent, adaptive career study planner web application designed to help students and software/hardware engineering aspirants bridge skill gaps for high-demand industry roles. It generates domain-specific 4–6 week study roadmaps equipped with multi-platform learning resources, real-world enterprise mini-projects, and 10-question adaptive checkpoint quizzes.

✨ Key Features

📄 1. AI Resume Analysis & PDF Parsing

Client-Side PDF Text Extraction: Uses PDF.js to parse .pdf or .txt resumes directly in the browser without uploading files to external storage servers.

Smart Career Matcher: Analyzes candidate experience against current market standards to determine their highest-matching career role (with match percentage) and suggests alternative career options.

Auto Skill Gap Detection: Extracts verified current skills and identifies critical missing domain competencies.

🗺️ 2. Domain-Accurate Weekly Roadmaps

Flexible Role Compatibility: Supports preset shortcuts (AI Engineer, Data Scientist, Chemical Engineer, Aerospace Engineer, Frontend Dev, MLOps, etc.) and any custom typed target role.

Zero Cross-Domain Contamination: Generates strict, domain-accurate topics (e.g., Chemical Thermodynamics & ASPEN Simulation for Chemical Engineers; LLMs, RAG & Vector DBs for AI Engineers).

Flexible Learning Resources: Recommends a curated selection of free (freeCodeCamp, YouTube, Kaggle) and paid (Coursera, Udacity) options per week with 1-click resource switching.

🛡️ 3. Step-by-Step Progressive Unlocking

Step 1 — Resource Mastery: Study core objectives and mark the selected learning resource complete.

Step 2 — Enterprise Mini-Project Verification: Complete a real-world scenario project and submit proof (GitHub repo, live link, or solution write-up) to unlock the quiz.

Step 3 — Checkpoint Quiz: Unlock the 10-question evaluation quiz once Steps 1 and 2 are complete.

🧪 4. 10-Question Checkpoint Quizzes ($\ge 80\%$ Passing Score)

Interview-Grade Questions: Deep technical conceptual questions and realistic scenario-based interview questions.

Smart Adaptive Retry Engine:

Correct questions are retired and replaced with fresh domain questions on retry.

Incorrect questions are retained with double-shuffling: Both question order and option positions ($A/B/C/D$) are randomized to prevent memorization.

📊 5. Live Skill Gap Analysis Panel

Persistent Side Panel: Displays covered vs. missing skills alongside the main roadmap.

1-Click Plan Insertion: Click + Add to plan on any unmapped missing skill to insert a dedicated week card into your study plan.

"At a Glance" Progress Tracking: Real-time week status tags (Mastered, In Progress, or Locked).

🛠️ Tech Stack

Frontend: HTML5, CSS3, JavaScript (ES6+)

Styling & Icons: Tailwind CSS (CDN), FontAwesome 6, Google Fonts (Inter)

Document Parsing: PDF.js (Mozilla)

AI Model Engine: Google Gemini API (gemini-3-flash-preview)

State & Persistence: Vanilla JS, Web LocalStorage API

🚀 Quick Start & Installation

Because SkillPath AI is built as a single-file web application, running it locally requires no complex build tools, npm packages, or server setup.

Option A: Local Execution

Clone this repository:

git clone https://github.com/Aditiruhela/skillpath-ai.git
cd skillpath-ai


Open index.html directly in any web browser (Google Chrome, Mozilla Firefox, Microsoft Edge, Safari) or use VS Code Live Server.

Option B: Deploy to Netlify Drop (30 Seconds)

Go to app.netlify.com/drop.

Drag and drop the folder containing index.html.

Your live application URL will be generated instantly.

📁 Project Structure

skillpath-ai/
├── index.html        # Single-file application (HTML, Tailwind CSS, & Vanilla JS)
├── README.md         # Project documentation
└── LICENSE           # Open-source license


🎯 How It Works (Step-by-Step Flow)

graph TD
    A[User Input: Resume PDF/TXT or Manual] --> B[Gemini AI Resume Analysis]
    B --> C[Extract Current Skills & Identify Missing Gaps]
    C --> D[Generate 4-6 Week Domain Curriculum]
    D --> E[Step 1: Complete Learning Resource]
    E --> F[Step 2: Submit Enterprise Mini-Project Proof]
    F --> G[Step 3: Unlock 10-Question Checkpoint Quiz]
    G -->|Score >= 8/10| H[Unlock Next Week & Update Overall Progress]
    G -->|Score < 8/10| I[Adaptive Retry: Shuffle Options & Retest]
    I --> G


📜 License

Distributed under the MIT License. See LICENSE for more information.

🤝 Contributing & Feedback

Contributions, bug reports, and feature requests are welcome! Feel free to open an issue or submit a Pull Request.

Author: Aditi Ruhela / github: github.com/Aditiruhela

Live Demo: skillpath-6be00f.netlify.app
