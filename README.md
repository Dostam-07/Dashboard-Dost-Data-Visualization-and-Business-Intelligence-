# ⚡ Dash-Dost: Conversational Analytics & Interactive Dashboard Builder

> **Your Raw Data, Transformed Conversonally.** Turn messy, chaotic CSVs and Excel files into professional, interactive, and beautifully composed dashboards in seconds. Powered by Google Gemini and a robust client-side fuzzy data binding engine.

---

## 🌟 Overview

**Dash-Dost** (Dashboard Friend) is a modern, full-stack analytics workspace that breaks down the barrier between complex data files and business intelligence. Instead of constructing tedious pivot tables or dealing with rigid dashboard layouts, users simply talk to their data. 

Dash-Dost handles the entire pipeline: profile columns, map complex headers to clean visualizations, generate responsive layout configurations, and support interactive queries. Whether you need a fully custom AI-generated layout or an instant zero-LLM **Quick View**, Dash-Dost is the ultimate conversational companion for your datasets.

---

## 🎨 Visual Identity & Interface Tour

The application utilizes a premium **Cosmic Dark Slate** theme styled using **Tailwind CSS**. It incorporates generous negative space, sleek borders, high-contrast visual cues, and beautiful motion-based layout transitions.

### 1. Conversational Board Synthesis
Describe what you want to visualize in plain English (e.g., *"Show me total sales as a KPI, a line chart of sales over time, and a bar chart comparing performance across categories"*). The workspace transforms your description into fully-bound, interactive Recharts widgets.

### 2. "Quick View" Mode (No AI Latency)
When you upload a file and need instant gratification, click the **⚡ Quick View** button. Dash-Dost bypasses the network entirely, running a local profiling heuristic (`simpleDashboardBuilder.ts`) that maps numerical, categorical, and chronological columns directly to a complete dashboard layout in **under 100 milliseconds**.

### 3. Voice-Capable Analyst View (`AnalystView`)
A virtual data scientist sits in your sidebar. Ask questions, dive deep into specific trends, calculate averages, or find outliers. Toggle the **Microphone** to dictate queries aloud via browser speech recognition, receiving detailed, annotated source references for every response.

### 4. Interactive Slicing & Custom Filtering
Add filters on-the-fly. Filter dashboards by region, category, or timeframe. When a filter narrows data to zero matches, Dash-Dost elegantly handles empty states, letting you clear or pivot constraints immediately.

---

## 🚀 Key Features & Architectural Improvements

Our latest version includes 9 critical stability fixes across layout, binding, and rendering pipelines:

*   **Intelligent Fuzzy Data Binder**: Standardizes loose column references from LLMs (e.g., `"revenue"`, `"sales"`) to raw, custom, or complex headers (e.g., `"Net Revenue (USD)"`). Includes robust fallback triggers to automatically infer column types if matching fails.
*   **KPI Guardrails & Safe Aggregations**: KPI cards automatically lower calculation thresholds to handle messy data (like `$`, `%`, or missing rows). Falls back gracefully to total row counts under the label *"Total Records"* rather than failing.
*   **High-Cardinality Chart Clamping**: Prevents pie charts from rendering unreadable slices by automatically sorting values descending and grouping low-frequency items into an *"Other"* bucket (capped at the top 8 slices).
*   **SVG Isolation & Rendering Quality**: Eliminated gradient ID overlap and color bleeding inside multi-chart viewports by prefixing unique `component.id` identifiers onto linear gradients.
*   **In-Situ Component Editor**: Adjust titles, descriptions, toggle legends, switch chart types (e.g., from Bar to Area), project mathematical trendlines, or highlight structural anomalies with a clean visual overlay.

---

## 🛠️ Tech Stack & Key Modules

*   **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, `motion/react` for animations.
*   **Data Visualization**: Recharts (Area, Bar, Line, Scatter, Pie, Composites) + Custom Geography Mapping.
*   **Backend Server**: Express (TypeScript/TSX execution), esbuild server-side compiler.
*   **AI Engine**: `@google/genai` TypeScript SDK proxying requests to Gemini model utilities with high-fidelity system instructions.

---

## 📂 Project Structure

```
├── /server.ts              # Full-stack Express server; handles Gemini proxying, prompts, and server-static serving
├── /src
│   ├── /components
│   │   ├── AnalystView.tsx            # Floating conversational analyst side-drawer with voice support
│   │   ├── ChartWrapper.tsx           # Multi-type Recharts wrapper (KPI, Line, Bar, Pie, Scatter, Maps)
│   │   ├── CompareTrendsPanel.tsx     # Handles dual-dataset side-by-side comparison overlays
│   │   ├── ConversationalPanel.tsx    # Multi-tab conversation stream and dashboard prompt center
│   │   ├── EditComponentModal.tsx     # Graphic UI to customize chart properties dynamically
│   │   └── SavedDashboardsManager.tsx # Local Storage persistent dashboard browser
│   ├── /utils
│   │   ├── dataBinder.ts              # Semantic schema matcher, reducer, aggregator, and evaluator
│   │   └── simpleDashboardBuilder.ts  # Zero-LLM instant client-side dashboard schema generator
│   ├── App.tsx                        # Main application runtime, file drag-and-drop, routing, layout grid
│   ├── index.css                      # Tailwind entrypoint with Cosmic Dark variables
│   └── types.ts                       # Standard TypeScript type declarations (Payloads, Charts, Schemas)
├── metadata.json           # Application descriptor and configuration manifest
└── package.json            # Deployment tasks, Node scripts, and production dependencies
```

---

## ⚙️ Installation & Configuration

### 1. Set Up Environment Variables
Create a `.env` file in the root directory (using `.env.example` as a template):
```env
GEMINI_API_KEY="your_gemini_api_key_here"
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run the Development Server
```bash
npm run dev
```
The development server will mount Vite as active middleware on **port 3000** at `http://localhost:3000`.

### 4. Production Build
To compile the full-stack static production client and bundled CommonJS server:
```bash
npm run build
npm start
```

---

## 💡 Usage Scenarios

### Scenario A: The Multi-Category E-Commerce Export
*   **File**: `sales_q2.csv` (Columns: `Order ID`, `Date`, `Product_Category`, `Purchase_Amount`, `Discount_Applied`)
*   **AI Prompt**: *"Build an executive summary. Show a card for total sales, average discount, and a bar chart of sales by product category."*
*   **The Result**: Dash-Dost binds the components instantly, resolving `Purchase_Amount` to the sum aggregator and placing it on a clean 3-column top grid.

### Scenario B: The Zero-LLM Quick Audit
*   **File**: `payroll_anonymous.xlsx` (Columns: `Employee Name`, `Department`, `Base Salary`, `Hire Date`)
*   **Action**: Drag file into the drop-zone, and click **⚡ Quick View**.
*   **The Result**: An instant, local dashboard is generated. Beautiful KPI cards display base salary metrics, accompanied by categorical departmental bar charts and hire date timelines.

---

## 🤝 Contribution Guidelines

We love active contributions! If you are interested in making Dash-Dost even better, look into these areas:
1.  **Enriching `dataBinder.ts`**: Expand the list of fuzzy keywords and string stem-match mappings.
2.  **Visual Components**: Add new display widgets, radar charts, heatmaps, or Sankey diagrams to `ChartWrapper.tsx`.
3.  **Performance**: Optimize the client-side parsing speed for datasets exceeding 50,000 rows.

Please make sure to run the linter and compiler before committing code:
```bash
# Verify type safety and styling
npm run lint

# Build test
npm run build
```

---

*Dashboard-Dost — Turn numbers into narratives.*
