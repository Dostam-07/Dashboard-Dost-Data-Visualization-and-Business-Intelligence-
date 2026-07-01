# ⚡ Dash-Dost: Conversational Analytics & Intelligent Dashboard Analyst

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/dostam/dash-dost)
[![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/react-%2320232a.svg?style=flat&logo=react&logoColor=%2361DAFB)](https://react.dev/)
[![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=flat&logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Google Gemini API](https://img.shields.io/badge/Google_Gemini-8E75C2?style=flat&logo=google-gemini&logoColor=white)](https://ai.google.dev/)

> **The Universal Dashboard Analyst.** Turn static live dashboards and visual telemetry snapshots into professional, highly interactive, and beautifully composed visual reasoning workspaces. Powered by Google Gemini multimodal intelligence.

---

## 🌟 Overview

**Dash-Dost** (Dashboard Friend) is a modern, full-stack conversational analytics analyst that breaks down the barrier between complex dashboards and actionable intelligence. Instead of manually parsing rigid layouts or construction spreadsheets, you simply talk to your dashboard.

The application specializes in **Dashboard Ingestion & Analysis**: it crawls live dashboard portals (Tableau, Looker, PowerBI, etc.), traverses their tab hierarchies, extracts text and visual telemetry, and builds a grounded intelligence report. You can then deep-dive into the data using a conversational analyst that highlights source anchors directly on your telemetry stream.

---

## ✨ Key Features

*   **🕵️ Deep Dashboard Crawler**: Input any public or authenticated dashboard URL. Dash-Dost spins up a server-side headless browser (Puppeteer) to crawl through tabs and sub-pages, bypass loading states, scroll dynamically, and aggregate deep intelligence.
*   **🖼️ Visual Intelligence OCR**: Upload a visual capture of any dashboard or spreadsheet. The system extracts tabular data, coordinates UI widgets, and identifies trends using Gemini vision models.
*   **💬 Grounded Conversational Q&A**: Enter compound questions about your telemetry. The virtual analyst segments queries, returning tailored, multi-card answer layouts with distinct sources and interactive KPI spotlights.
*   **🧩 Side-by-Side Comparison**: Compare two different dashboard snapshots or historical captures side-by-side to detect trends, anomalies, and structural drift over time.
*   **📊 Inline Ephemeral Charts**: Comparative or chronological answers automatically generate line, bar, area, or pie charts rendered *inside the chat bubble* for immediate visual proof.
*   **🌗 Adaptive Design Language**: A meticulously crafted **Swiss/Modern** interface that transitions seamlessly between high-contrast Light and deep Cosmic Dark themes.
*   **🛡️ Multi-Source Grounding**: Responses are grounded across four distinct layers: Dashboard Series data, Dataset context, Crawled Knowledge Base text, and Visual OCR evidence.

---

## 🏗️ System Architecture & Data Flow

Dash-Dost is architected as a full-stack Node.js and React application with custom browser scraping and AI reasoning capabilities.

```mermaid
graph TD
    User([User])
    
    %% Frontend Group
    subgraph Frontend [React Client-Side]
        App[App.tsx / Global State]
        Analyst[AnalystView.tsx / Ingestion & Chat]
        ImageViewer[ImageViewer.tsx / Spotlight Rendering]
    end
    
    %% Backend Group
    subgraph Backend [Express Server-Side]
        Server[server.ts]
        Crawler[DashboardCrawlerService.ts / Puppeteer]
        Gemini[Google @google/genai SDK]
    end
    
    %% Interactions
    User -->|Paste URL / Upload| Analyst
    Analyst -->|Ingestion Request| Server
    Server -->|Crawl & Screenshot| Crawler
    Crawler -->|Raw Telemetry & Images| Server
    Server -->|Multimodal Reasoning| Gemini
    Gemini -->|Intelligence Report| Analyst
    Analyst -->|Conversational Q&A| Gemini
    Analyst -->|Visual Anchors| ImageViewer
```

---

## 🛠️ Tech Stack & Dependencies

*   **Core Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite 6](https://vite.dev/)
*   **Styling \& Layout**: [Tailwind CSS v4](https://tailwindcss.com/) with a bespoke **Cosmic Dark Slate** color scheme, [Motion](https://motion.dev/) for smooth animations, and `@dnd-kit` for interactive layout sorting.
*   **Visualization Engine**: [Recharts](https://recharts.org/) (Line, Bar, Area, Pie, Scatter, Maps) with gradient prefix isolation to prevent multi-chart rendering collisions.
*   **Server Architecture**: [Express 4](https://expressjs.com/) configured with standard Node.js server-side TypeScript execution via `tsx` and bundled using `esbuild`.
*   **AI Integration**: [@google/genai SDK v2.4.0](https://www.npmjs.com/package/@google/genai) utilizing `gemini-flash-latest` (Gemini Flash) models.
*   **Headless Crawling**: [Puppeteer](https://pptr.dev/) with viewport scrolling, dynamic tab clicking heuristics, and screenshot extraction pipelines.
*   **Local Caching**: `IndexedDB` handled via `idb-keyval` for persistent caching of processed datasets and generated layouts.
*   **Data Processors**: `PapaParse` for rapid CSV processing, and `XLSX` (SheetJS) for Excel reading.

---

## 📂 Project Structure

```text
├── server.ts                       # Full-stack Express server (Gemini API, OCR, Puppeteer scrapers, and router)
├── package.json                    # Dependencies, scripts, and build tasks
├── metadata.json                   # Applet permissions, metadata, and cloud capability tags
├── tsconfig.json                   # TypeScript configuration
├── vite.config.ts                  # Vite compilation, aliases, and Tailwind integration
├── .env.example                    # Environment variable configurations
│
├── /src
│   ├── main.tsx                    # Client-side entrypoint
│   ├── App.tsx                     # Main application layout, file drop-zone, and dashboard render grid
│   ├── index.css                   # Global Tailwind CSS entrypoint with custom Cosmic Dark variables
│   ├── types.ts                    # Consolidated TypeScript interfaces (Charts, Payloads, QA schemas)
│   ├── store.ts                    # Global UI state store (Zustand)
│   │
│   ├── /components                 # Visual components and modals
│   │   ├── AnalystView.tsx         # Floating conversational Analyst side-drawer with voice capabilities
│   │   ├── ChartWrapper.tsx        # Dynamic Recharts engine (KPI, Line, Bar, Pie, Scatter, Maps)
│   │   ├── CompareTrendsPanel.tsx  # Interactive side-by-side dataset overlay and comparison controller
│   │   ├── ConversationalPanel.tsx # Conversation streams, prompt centers, and historical managers
│   │   ├── DashboardSkeleton.tsx  # Smooth animated layout loaders
│   │   ├── EditComponentModal.tsx  # In-situ editor to modify widget type, math overlays, and titles
│   │   ├── EditFilterModal.tsx     # Custom categorical slicing and filter customizer
│   │   ├── FiltersPanel.tsx        # Persistent dashboard active filter controls
│   │   ├── GeographyMap.tsx        # React-Simple-Maps renderer for geographic metadata binding
│   │   ├── InlineChatChart.tsx     # Compact, read-only Recharts widget specifically designed for chat bubbles
│   │   ├── SavedDashboardsManager.tsx # Persistent IndexedDB dashboard manager
│   │   └── SuggestionChips.tsx     # Context-aware conversational starter chips
│   │
│   ├── /services                   # Full-stack service integrations
│   │   └── DashboardCrawlerService.ts # Puppeteer-based recursive tab and iframe web scraper
│   │
│   ├── /utils                      # Pure utility functions and mathematical engines
│   │   ├── anomalyDetector.ts      # Statistical anomaly flags and outlier highlights
│   │   ├── calculatedFields.ts     # Client-side data derivation helper
│   │   ├── dataBinder.ts           # Semantic column binder, aggregations, and fuzzy matcher
│   │   ├── dataNormalization.ts    # String and currency cleaner
│   │   ├── dataProfiler.ts         # Fast data cardinality, types, and summary generator
│   │   ├── filterEngine.ts         # Multiprocessor categorical data subset mapper
│   │   ├── jsonRepair.ts           # Recursive regex-based LLM JSON string bracket repair tool
│   │   ├── queryEngine.ts          # In-memory natural query dataset parser
│   │   ├── schemaValidation.ts     # Validation safeguards for LLM output structures
│   │   └── simpleDashboardBuilder.ts # Client-side quick-dashboard template generator
│
└── /public                         # Static files and fallback assets
```

---

## 🚀 Getting Started

### Prerequisites

*   [Node.js](https://nodejs.org/) v18.0.0 or higher
*   A Google AI Studio [Gemini API Key](https://aistudio.google.com/)

### Installation & Configuration

1.  Clone the repository:
    ```bash
    git clone https://github.com/dostam/dash-dost.git
    cd dash-dost
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```

### Environment Variables

Copy the `.env.example` file to create your local `.env`:
```bash
cp .env.example .env
```
Ensure you provide your Gemini API key:
```env
GEMINI_API_KEY="AI_Studio_API_Key_Here"
APP_URL="http://localhost:3000"
```

### Running the Development Server

Start the development server:
```bash
npm run dev
```
The application will boot in development mode, mounting Vite as an active middleware proxy inside the Express server on **port 3000** at `http://localhost:3000`.

### Production Build & Execution

To bundle the application for production:
```bash
# Build the client static assets (Vite) and server (esbuild bundle)
npm run build

# Start the compiled server
npm start
```
The compiled server is bundled as a single, self-contained CommonJS file located at `dist/server.cjs`, guaranteeing fast, dependency-isolated cold-starts.

### Available Scripts

| Script | Command | Purpose |
| :--- | :--- | :--- |
| **`npm run dev`** | `tsx server.ts` | Launches the hot-reloading Express server on port 3000 in dev mode. |
| **`npm run build`** | `vite build && esbuild ...` | Compiles client assets and bundles server code into `dist/server.cjs`. |
| **`npm run start`** | `node dist/server.cjs` | Runs the compiled production-ready server. |
| **`npm run clean`** | `rm -rf dist` | Wipes build artifacts. |
| **`npm run lint`** | `tsc --noEmit` | Performs comprehensive TypeScript validation checks. |

---

## 🔌 API Reference

### `GET /api/health`
Verifies server connectivity and environment readiness.

### `POST /api/generate`
Generates full dashboard layouts and component configurations from profiled datasets.
*   **Request Body**:
    ```json
    {
      "profile": { "columns": [{ "name": "Sales", "type": "numeric" }] },
      "prompt": "Create a executive overview",
      "history": []
    }
    ```
*   **Response**: Fully bound layout configuration JSON (`DashboardPayload`).

### `POST /api/ingest-url`
Spins up headless Puppeteer to recursively crawl, snap, and extract data from external analytical dashboards.
*   **Request Body**:
    ```json
    {
      "url": "https://public.tableau.com/..."
    }
    ```
*   **Response**: Markdown text representation, structured knowledge-base pages, and extracted visual structures.

### `POST /api/ingest-screenshot`
Leverages Gemini vision models to perform structural OCR and layout mapping on dashboard snapshots.
*   **Request Body**:
    ```json
    {
      "screenshot": "data:image/png;base64,..."
    }
    ```
*   **Response**: Markdown dossiers and bounding coordinate specifications.

### `POST /api/analyst-chat`
Handles natural language Q&A, historical contexts, and dynamic ephemeral chart plotting.
*   **Request Body**:
    ```json
    {
      "message": "What is total sales? Compare regions as a bar chart.",
      "conversationHistory": [],
      "datasetContext": { "columns": [], "rows": [] },
      "dashboardDefinition": { "components": [] },
      "activeFilterState": {},
      "knowledgeBase": [],
      "intelligenceReport": ""
    }
    ```
*   **Response**: Highly structured `AnalystChatResponse` containing segmented answers, grounded source citations, and inline Recharts specifications.

---

## 🧠 AI & LLM Architecture

Dash-Dost employs a state-of-the-art **Grounded Multi-Source Reasoning Pipeline** that guarantees response precision while completely preventing hallucinated statistics.

### Tiered Grounding Hierarchy

The AI prompt forces a strict, sequential confidence evaluation across four distinct information sources:
1.  **Tier 1: Dashboard Definition (`dashboard_definition`)** — Real chart data, active filters, series coordinates.
2.  **Tier 2: Dataset Context (`dataset_context`)** — Direct row aggregations and column statistics.
3.  **Tier 3: Crawled Knowledge Base (`knowledge_base`)** — Scraped texts from remote links/tabs.
4.  **Tier 4: Screenshot OCR (`screenshot_ocr`)** — Static visual evidence (flagged with a lower confidence rating in the UI).

### Multi-Intent Segmentation Rule

A specialized pre-processing prompt block analyzes compound user messages and splits them into distinct sub-questions. 

```text
Message: "What was total sales in Q3, how does it compare to Q2, and why did churn drop?"
                     │
                     ▼
           [Segmentation Engine]
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
 [Sub-Question 1] [Sub-Question 2] [Sub-Question 3]
  "Total Sales"   "Q2 vs Q3"        "Why Churn Drop"
 (single_kpi)     (comparison)      (explanation)
```

Each segment maps to its own `AnalystSubAnswer` object, carrying its own metrics, confidence ratings, and data sources.

### Inline Ephemeral Chart Spec Generation

If an answer is comparative or chronological, the LLM produces a declarative `InlineChartSpec` JSON block. The frontend parses this spec to dynamically generate responsive, read-only Recharts on-the-fly inside the chat thread. If confidence is low, the system provides a **"📊 Show as Chart"** chip, letting the user render the visual at will without making extra network requests.

---

## 📸 UI Tour / Placeholders

### High-Fidelity Bento Grid Workspace
The main workspace organizes widgets into responsive grids. It supports interactive dragging and live-rebuilding when resizing.
```
┌───────────────────────────┬───────────────────────────┐
│     Total Sales KPI       │      Average Margin       │
│        ₹45.2 Lakhs        │           18.2%           │
├───────────────────────────┴───────────────────────────┤
│                                                       │
│             Monthly Revenue Timeline (Area)           │
│                                                       │
└───────────────────────────────────────────────────────┘
```

### Context-Aware Conversations & Chat Cards
Chat answers render beautifully inline as separate, clean visual cards complete with KPI spotlights and source references.
```
┌───────────────────────────────────────────────────────┐
│ 💬 User: "Total sales vs Q2?"                          │
├───────────────────────────────────────────────────────┤
│ 🤖 Assistant:                                         │
│                                                       │
│ ┌───────────────────────────────────────────────────┐ │
│ │ • Sub-Answer 1: Total sales has grown by 12.5%.   │ │
│ │                                                   │ │
│ │   [ Bar Chart: Sales Comparison by Quarter ]      │ │
│ │                                                   │ │
│ │   Sources Used: [dashboard_definition]            │ │
│ └───────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

---

## 🧪 Code Quality & Validation

We maintain strict type safety and syntax validation. Ensure you run validation checks before contributing code changes:

```bash
# Verify there are no compilation or TypeScript errors
npm run lint

# Confirm the application bundles successfully
npm run build
```

---

## 🤝 Contributing

We are excited about open-source collaboration! To contribute:
1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/amazing-feature`).
3.  Ensure your code is strictly typed and adheres to standard patterns.
4.  Verify your changes pass `npm run lint` and `npm run build`.
5.  Open a Pull Request describing your changes.

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---

## 💖 Acknowledgements

*   **Google AI Studio** for state-of-the-art model APIs.
*   **Recharts** for premium, modular SVG visualizers.
*   **Puppeteer** for robust browser scraping capabilities.

---
*Dash-Dost — Turn numbers into narratives, conversationally.*
