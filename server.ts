import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { OpenAI } from "openai";
import { GoogleGenAI } from "@google/genai";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import fs from "fs";
import puppeteer from "puppeteer";
import { DashboardCrawlerService, getPlatformSelectors } from "./src/services/DashboardCrawlerService";

dotenv.config();

const isProd = process.env.NODE_ENV === "production";
const PORT = 3000;

// Dynamic check of active provider model
const getActiveProvider = () => {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;

  if (geminiKey && geminiKey !== "MY_GEMINI_API_KEY" && geminiKey.trim() !== "") {
    return {
      provider: "gemini" as const,
      providerName: "Google Gemini (gemini-flash-latest)",
      isConfigured: true
    };
  } else if (openRouterKey && openRouterKey !== "MY_OPENROUTER_API_KEY" && openRouterKey.trim() !== "") {
    return {
      provider: "openrouter" as const,
      providerName: "OpenRouter (Claude 3.5 Sonnet)",
      isConfigured: true
    };
  } else {
    const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    const ollamaModel = process.env.OLLAMA_MODEL || "llama3.1";
    return {
      provider: "ollama" as const,
      providerName: `Ollama Local (${ollamaModel})`,
      isConfigured: !!process.env.OLLAMA_BASE_URL
    };
  }
};

const getGeminiClient = () => {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

const getOpenRouterClient = () => {
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://ai.studio/build",
      "X-Title": "Dash-Dost Dashboard Builder",
    }
  });
};

const getOllamaClient = () => {
  const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  return new OpenAI({
    apiKey: "ollama",
    baseURL: `${ollamaUrl}/v1`
  });
};

const callGeminiWithRetry = async (
  modelFactory: (model: string) => Promise<any>,
  operationName: string,
  models = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite"],
  retriesPerModel = 2,
  baseDelay = 2000 // Increased base delay to help with rate limits
) => {
  for (const model of models) {
    let delay = baseDelay;
    for (let attempt = 0; attempt < retriesPerModel; attempt++) {
      try {
        console.log(`[Gemini] Attempting ${operationName} with model: ${model}`);
        return await modelFactory(model);
      } catch (error: any) {
        const message = String(error?.message || "");
        const errStr = (JSON.stringify(error) + " " + message).toLowerCase();

        const isQuotaExceeded = 
          errStr.includes("quota") || 
          errStr.includes("rate_limit") || 
          errStr.includes("rate limit") || 
          errStr.includes("exhausted") || 
          errStr.includes("limit: 20") ||
          error?.status === 429 || 
          error?.code === 429 || 
          message.includes("429") ||
          message.includes("RESOURCE_EXHAUSTED");

        const is503 =
          error?.status === 503 ||
          error?.code === 503 ||
          message.includes("503") ||
          message.toLowerCase().includes("unavailable");

        if ((isQuotaExceeded || is503) && attempt < retriesPerModel - 1) {
          let waitTime = delay;
          // check if message has "Please retry in X.Xs"
          const match = message.match(/Please retry in ([0-9.]+)s/);
          if (match && match[1]) {
             waitTime = Math.max(delay, (parseFloat(match[1]) + 2) * 1000);
          }
          // If it's a daily limit we shouldn't even wait
          if (errStr.includes("perday")) {
             console.warn(`[Gemini Retry] Daily quota exceeded for ${model}. Skipping to next model.`);
             break;
          }
          console.warn(
            `[Gemini Retry] ${operationName} Attempt ${attempt} failed with ${model} (Rate Limited or 503). Retrying in ${waitTime}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          delay = Math.min(delay * 2, 30000);
        } else if (isQuotaExceeded) {
          console.warn(`[Gemini Quota Exceeded / Rate Limited] ${operationName} failed with ${model} after all retries (will try fallback model if available).`);
          if (models.indexOf(model) < models.length - 1) {
            console.warn(`[Gemini Fallback] Attempting next model due to limit exhaustion of ${model}...`);
            break; // Try next model in the list
          } else {
            throw error; // No fallback models left
          }
        } else if (is503) {
          // If 503 failed after all retries
          if (models.indexOf(model) < models.length - 1) {
            break;
          } else {
            throw error;
          }
        } else {
          // If all attempts for this model failed, or this was a different error, fallback to next model
          if (models.indexOf(model) < models.length - 1) {
            console.warn(
              `[Gemini Fallback] ${operationName} failed with ${model}: ${error.message || error}. Trying next model...`
            );
            break; // Break inner loop to try next model in the list
          } else {
            throw error;
          }
        }
      }
    }
  }
  throw new Error(`All available Gemini models (${models.join(", ")}) failed to execute the request "${operationName}". Please try again or check API key limits.`);
};

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    const active = getActiveProvider();
    res.json({ status: "healthy", provider: active.providerName, apiKeyConfigured: active.isConfigured });
  });

  // Contact support & feedback endpoint
  app.post("/api/contact", (req, res) => {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: "Name, email, and message are required fields." });
    }
    try {
      const contactsFile = path.join(process.cwd(), "contacts.json");
      let currentContacts = [];
      if (fs.existsSync(contactsFile)) {
        const fileContent = fs.readFileSync(contactsFile, "utf8");
        try {
          currentContacts = JSON.parse(fileContent || "[]");
        } catch (_) {
          currentContacts = [];
        }
      }
      const newContact = {
        id: `msg_${Date.now()}`,
        name,
        email,
        message,
        timestamp: new Date().toISOString()
      };
      currentContacts.push(newContact);
      fs.writeFileSync(contactsFile, JSON.stringify(currentContacts, null, 2), "utf8");
      res.json({ success: true, message: "Thank you! Your feedback/message has been successfully recorded on the server." });
    } catch (e: any) {
      console.error("Error storing contact message:", e);
      res.status(500).json({ error: "Server failed to store contact message." });
    }
  });

  // Streaming Content Generation proxy
  app.post("/api/generate", async (req, res) => {
    const { prompt, history } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const active = getActiveProvider();

    try {
      // Construct system instruction that strictly forces conformance to the visual layout JSON schema
      const systemInstruction = `You are a highly structured, precise analytical engineer acting as the visual layout compiler for Dash-Dost Dashboard Builder.

Your purpose is to interpret natural language data descriptions into a flawless JSON specification that fully conforms to the MasterDashboardPayloadSchema.

Core Operations Directives:
1. Output MUST be strictly valid, pure JSON. Do not write introductory sentences, markdown blocks wrapper syntax like \`\`\`json or \`\`\`, or any surrounding text that invalidates a parser engine. Your response must begin with { and end with }.
2. Data Realism: Leave the "seriesData" array in each component EMPTY (i.e. []). The client-side system will compile the real aggregated dataset rows into seriesData.
   - Specify the recommended numeric columns as axis metrics inside yAxisKeys, and category/date as xAxisKey.
   - Do NOT populate seriesData with fake stats. The database binder will do the real math on the client.
2b. Column Name Fidelity: When a [DATASET SCHEMA] or [ACTIVE DATASET] block is present in the user prompt:
    - You MUST use the EXACT column names from that schema as xAxisKey and yAxisKeys values.
    - Never invent generic names like "revenue", "category", "value", "date" — use the literal column header.
    - For kpiValue, use the {{BIND:<exact_column_name>:<aggregation>}} syntax.
    - Aggregation options: sum | avg | count | min | max
    - Example: If the schema lists "Net Sales Amount" as a numeric column, write yAxisKeys: ["Net Sales Amount"]
    - Example: If kpiValue should sum "Total Orders", write kpiValue: "{{BIND:Total Orders:sum}}"
    - NEVER invent a static dollar value for kpiValue when a dataset is attached.
2c. seriesData MUST be an empty array []. Do NOT populate seriesData with any example or sample rows.
3. Progressive Intent Alignment: Distribute components intelligently across layouts using the 12-column layout object (sm:12, md:6, lg:4 or lg:3 for KPIs; sm:12, lg:6 or lg:12 for charts).
4. Responsive Layouts:
   - "layout" has properties sm, md, lg. These are column numbers out of 12.
   - For 'kpi_card' (KPI block): sm: 12, md: 6, lg: 3 is recommended.
   - For other charts: sm: 12, md: 12, lg: 6 or lg: 12 is recommended.
5. Interactive Filter Provisioning: Always include filters at the "filters" array level. Create target filters mapping to target keys fields (e.g. key "category" or "date").
   - Filter types are 'date_range' or 'category_select'.
   - 'targetKeys' is an array of data field strings inside component seriesData (e.g. ["category"] or ["date"]) that this filter will restrict.
   - If 'category_select' is used, provide standard filter options array of strings (e.g. ["North", "South", "East", "West"] or brands/categories). This option is critical for local interactive filtering.
6. Support different chart types: 'kpi_card', 'bar_chart', 'line_chart', 'area_chart', 'pie_chart', 'scatter_chart', 'map_chart', 'geo_map'.
   - 'kpi_card' config should have: "kpiValue": string format (e.g. "$12,450", "94.2%"), "kpiTrend": { "direction": "up" | "down" | "neutral", "label": "+12% MoM" }
   - 'bar_chart', 'line_chart', 'area_chart', 'scatter_chart', 'map_chart', 'geo_map' config should specify: "xAxisKey" (usually "date" or "category") and "yAxisKeys" (array of numerical field names to map e.g. ["revenue", "costs"]). Keep stacked: boolean optional.
   - For 'map_chart' and 'geo_map', default to realistically populated datasets representing Indian states (e.g. Maharashtra, Karnataka, Delhi, etc.) or World countries, NOT US states.
   - For 'pie_chart': xAxisKey MUST be a categorical column with fewer than 20 unique values. Set "maxDataPoints": 8 in config. Do not use high-cardinality columns (like names, IDs, addresses) as pie categories.
   - Leave "seriesData" completely empty (i.e. []). The client will bind real records onto your xAxisKey and yAxisKeys from the uploaded file (e.g. 10-24 object rows tracking coordinates/metrics, e.g. { "date": "2026-06-01", "revenue": 1000, "costs": 400, "category": "Enterprise" }).
7. Be responsive to iterative user requests if history is provided. Integrate the conversational history context when editing, refining, or appending to the current dashboard. However, if the user uploads a NEW dataset or asks for a NEW dashboard, generate a completely fresh dashboard and do NOT carry over previous components unless explicitly requested.`;

      if (active.provider === "gemini") {
        const ai = getGeminiClient();
        const contents: any[] = [];
        
        if (history && history.length > 0) {
          history.forEach((msg: any) => {
            contents.push({
              role: msg.role === 'user' ? 'user' : 'model',
              parts: [{ text: msg.content }]
            });
          });
        }
        
        contents.push({
          role: 'user',
          parts: [{ text: prompt }]
        });

        // Success! Break retry loop
        let stream: any;
        try {
          stream = await callGeminiWithRetry(async (model) => {
             return await ai.models.generateContentStream({
              model,
              contents,
              config: {
                systemInstruction,
                temperature: 0.1,
              }
            });
          }, "Streaming Generation");
        } catch (error: any) {
          // Fallback to error handling outside
          throw error;
        }

        // Successfully acquired stream, now set headers
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Transfer-Encoding", "chunked");

        for await (const chunk of stream) {
          const text = chunk.text;
          if (text) {
            res.write(text);
          }
        }
      } else {
        const client = active.provider === "openrouter" ? getOpenRouterClient() : getOllamaClient();
        const model = active.provider === "openrouter" ? "anthropic/claude-3.5-sonnet" : (process.env.OLLAMA_MODEL || "llama3.1");

        const messages: any[] = [
          { role: "system", content: systemInstruction }
        ];

        if (history && history.length > 0) {
          history.forEach((msg: any) => {
            messages.push({
              role: msg.role === 'user' ? 'user' : 'assistant',
              content: msg.content
            });
          });
        }

        messages.push({ role: "user", content: prompt });

        const stream = await client.chat.completions.create({
          model,
          messages,
          temperature: 0.1,
          stream: true,
        });

        // Set headers right before writing to stream
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Transfer-Encoding", "chunked");

        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || "";
          if (text) {
            res.write(text);
          }
        }
      }
      res.end();
    } catch (error: any) {
      console.error(`Error generating content with ${active.providerName}:`, error);
      
      const errorString = String(error?.message || error || "");
      const is503 = errorString.includes("503") || 
                    errorString.toLowerCase().includes("unavailable") || 
                    errorString.toLowerCase().includes("high demand") || 
                    errorString.toLowerCase().includes("temporary") ||
                    error?.status === 503 ||
                    error?.code === 503;

      let friendlyMessage = error?.message || "Something went wrong while generating details. Check server connection.";
      if (is503) {
        friendlyMessage = "Google Gemini is currently experiencing temporary high demand (553 Unavailable). Please click an Idea Template above to use pre-compiled visual assets, or try clicking Send again in a few seconds!";
      }

      if (!res.headersSent) {
        res.status(503).json({ error: friendlyMessage });
      } else {
        res.write(`\n\n[ERROR: ${friendlyMessage}]`);
        res.end();
      }
    }
  });

  // AI Insights generation endpoint
  app.post("/api/insights", async (req, res) => {
    const { payload } = req.body;
    if (!payload) {
      return res.status(400).json({ error: "Dashboard payload is required" });
    }

    const active = getActiveProvider();

    try {
      const summaryContext = {
        title: payload.title,
        subtitle: payload.subtitle || "",
        components: (payload.components || []).map((c: any) => ({
          title: c.title,
          type: c.type,
          data: (c.seriesData || []).slice(0, 15)
        }))
      };

      const systemInstruction = "You are a professional business intelligence advisor and expert data analyst. Generate short, clear, highly structured and valuable summaries and actionable recommendation items.";
      const prompt = `Given this active dashboard: ${JSON.stringify(summaryContext)}. Please write a brief, elegant analytical executive summary (max 3 sentences) and exactly 3 high-impact actionable business recommendations (bullet points). Keep layout professional and easy to scan using standard Markdown.`;

      if (active.provider === "gemini") {
        const ai = getGeminiClient();
        let response: any = null;
        response = await callGeminiWithRetry(async (model) => {
            return await ai.models.generateContent({
              model,
              contents: prompt,
              config: {
                systemInstruction,
                temperature: 0.2,
              }
            });
        }, "Insights Generation");

        res.json({ insights: response.text || "" });
      } else {
        const client = active.provider === "openrouter" ? getOpenRouterClient() : getOllamaClient();
        const model = active.provider === "openrouter" ? "anthropic/claude-3.5-sonnet" : (process.env.OLLAMA_MODEL || "llama3.1");

        const response = await client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: prompt }
          ],
          temperature: 0.2,
        });

        res.json({ insights: response.choices[0]?.message?.content || "" });
      }
    } catch (error: any) {
      console.error(`Insights Generation Error with ${active.providerName}:`, error);

      const errorString = String(error?.message || error || "");
      const is503 = errorString.includes("503") || 
                    errorString.toLowerCase().includes("unavailable") || 
                    errorString.toLowerCase().includes("high demand") || 
                    errorString.toLowerCase().includes("temporary") ||
                    error?.status === 503 ||
                    error?.code === 503;

      let friendlyMessage = error?.message || "Insights Generation Failed";
      if (is503) {
        friendlyMessage = "Google Gemini is currently experiencing temporary high demand. Failed to generate live insights at this moment.";
      }

      res.status(503).json({ error: friendlyMessage });
    }
  });

  // Narrative Report Generator (F5)
  app.post("/api/generate-narrative", async (req, res) => {
    const { title, subtitle, kpis, charts, tone = "Executive" } = req.body;
    try {
      const active = getActiveProvider();
      const systemInstruction = `You are a professional business intelligence reporter and lead executive summary editor. Generate a highly valuable, plain-English analytical markdown executive narrative report summarizing active metrics context in a "${tone}" tone.`;
      
      const prompt = `Compile an executive narrative report:
      Dashboard: "${title}" (${subtitle || ""})
      KPIs: ${JSON.stringify(kpis)}
      Charts & Series Data: ${JSON.stringify(charts)}
      Tone: ${tone}
      
      Structure your report with:
      ## Executive Summary
      - Headline Finding
      - Key Performance Highlights
      - Detailed Areas of Concern / Opportunities
      - Recommended Actions`;

      if (active.provider === "gemini") {
        const ai = getGeminiClient();
        const response = await callGeminiWithRetry(async (model) => {
          return await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              systemInstruction,
              temperature: 0.3
            }
          });
        }, "Narrative Generation");
        res.json({ success: true, narrative: response.text || "" });
      } else {
        const client = active.provider === "openrouter" ? getOpenRouterClient() : getOllamaClient();
        const model = active.provider === "openrouter" ? "anthropic/claude-3.5-sonnet" : (process.env.OLLAMA_MODEL || "llama3.1");

        const response = await client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: prompt }
          ],
          temperature: 0.3
        });
        res.json({ success: true, narrative: response.choices[0]?.message?.content || "" });
      }
    } catch (error: any) {
      console.error("Narrative Generation Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate narrative" });
    }
  });

  // Structured Query Interpreter for F3 "Ask Your Data"
  app.post("/api/interpret-query", async (req, res) => {
    const { question, columns, totalRows } = req.body;
    if (!question || !columns) {
      return res.status(400).json({ error: "question and columns are required" });
    }

    try {
      const active = getActiveProvider();
      const systemInstruction = "You are a professional database schema compiler. Translate user natural language questions into structured queries conforming to the StructuredQuery schema.";
      const prompt = `Convert this natural language question into a structured query based on the available columns.
      Columns list (with sample values to inform filter choices): ${JSON.stringify(columns)}
      Total rows in dataset: ${totalRows || 'unknown'}
      Question: "${question}"
      
      Return a strictly valid JSON response with this schema (no markdown wrappers):
      {
        "operation": "groupBy_aggregate | overall_metric | outliers | comparison",
        "groupByColumn": "columnName (only if operation is groupBy_aggregate or comparison)",
        "metric": "numeric column name",
        "aggregation": "sum | avg | mean | min | max | count",
        "filterColumn": "optional column to filter on",
        "filterValue": "value to filter by",
        "sortBy": "asc | desc",
        "limit": 10,
        "compareValueA": "e.g., 'Electronics' (only if operation is comparison)",
        "compareValueB": "e.g., 'Clothing' (only if operation is comparison)"
      }`;

      if (active.provider === "gemini") {
        const ai = getGeminiClient();
        const response = await callGeminiWithRetry(async (model) => {
        return await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.1,
            responseMimeType: "application/json"
          }
        });
        }, "Query Interpretation");
        const query = JSON.parse(response.text || "{}");
        res.json({ success: true, query });
      } else {
        const client = active.provider === "openrouter" ? getOpenRouterClient() : getOllamaClient();
        const model = active.provider === "openrouter" ? "anthropic/claude-3.5-sonnet" : (process.env.OLLAMA_MODEL || "llama3.1");

        const response = await client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" }
        });
        const query = JSON.parse(response.choices[0]?.message?.content || "{}");
        res.json({ success: true, query });
      }
    } catch (error: any) {
      console.error("Interpret Query Error:", error);
      res.status(500).json({ error: error.message || "Failed to interpret query" });
    }
  });

  // URL Analyst (F4 / Analyst Phase 2)
  app.post("/api/ingest-url", async (req, res) => {
    const { url, viewportWidth, credentials, sessionCookies } = req.body;
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      console.log(`Ingesting dashboard URL via Puppeteer: ${url}`);
      
      const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
        headless: true
      });
      const page = await browser.newPage();
      await page.setViewport({ width: viewportWidth || 1440, height: 900 });
      
      // Inject session cookies if supplied
      if (sessionCookies && Array.isArray(sessionCookies)) {
        console.log("Applying session cookies to page instance...");
        try {
          await page.setCookie(...sessionCookies);
        } catch (cookieErr) {
          console.error("Failed to set cookies:", cookieErr);
        }
      }

      // 1. Initial navigation
      let validUrl = url.trim();
      if (!validUrl.startsWith("http://") && !validUrl.startsWith("https://")) {
        validUrl = "https://" + validUrl;
      }
      validUrl = validUrl.replace("https//:", "https://").replace("http//:", "http://");
      validUrl = validUrl.replace("https://https://", "https://").replace("http://http://", "http://");

      try {
        await page.goto(validUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      } catch (e) {
        console.warn(`Page goto timeout or error for ${validUrl}, continuing anyway...`);
      }
      
      await new Promise(r => setTimeout(r, 2000));

      // 2. Auth Page Analysis
      const authState = await page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        const hasPasswordField = document.querySelector('input[type="password"]') !== null;
        const hasLoginForm = document.querySelector('form[action*="login"], form[action*="auth"], form[action*="signin"]') !== null;
        const hasLoginKeywords = ['sign in', 'log in', 'enter password', 'username', 'email address', 'passward'].some(k => bodyText.includes(k));
        const currentUrl = window.location.href;
        const isLoginUrl = ['/login', '/signin', '/auth', '/sso'].some(p => currentUrl.includes(p));
        
        return {
          requiresAuth: hasPasswordField || hasLoginForm || (hasLoginKeywords && isLoginUrl),
          hasPasswordField,
          currentUrl,
          loginFormExists: hasLoginForm
        };
      });

      // If auth is required, and no credentials were submitted yet, return the auth modal signal
      if (authState.requiresAuth && !credentials) {
        await browser.close();
        return res.json({
          success: false,
          requiresAuth: true,
          authType: "form",
          loginUrl: url,
          message: "This dashboard requires authentication. Please provide credentials to proceed."
        });
      }

      // If credentials are provided, inject and log in
      if (credentials) {
        console.log("Injecting credentials and trying to authenticate...");
        try {
          // Find standard login/username/password selectors
          await page.evaluate((creds) => {
            const userInputs = document.querySelectorAll('input[type="email"], input[type="text"], input[name*="user"], input[name*="email"], input[id*="user"]');
            const passInputs = document.querySelectorAll('input[type="password"]');
            
            if (userInputs.length > 0 && creds.username) {
              const uEl = userInputs[0] as HTMLInputElement;
              uEl.value = creds.username;
              uEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (passInputs.length > 0 && creds.password) {
              const pEl = passInputs[0] as HTMLInputElement;
              pEl.value = creds.password;
              pEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }, credentials);

          // Submit using primary submit/button or form
          await page.evaluate(() => {
            const submitBtn = document.querySelector('button[type="submit"], input[type="submit"], .btn-primary, button.login');
            if (submitBtn) {
              (submitBtn as HTMLElement).click();
            } else {
              const forms = document.querySelectorAll('form');
              if (forms.length > 0) {
                forms[0].submit();
              }
            }
          });

          // Wait for page transition
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
          await new Promise(r => setTimeout(r, 2000));

          // Post-auth re-verification
          const postAuthState = await page.evaluate(() => {
            const hasPasswordField = document.querySelector('input[type="password"]') !== null;
            return { requiresAuth: hasPasswordField };
          });

          if (postAuthState.requiresAuth) {
            await browser.close();
            return res.json({ success: false, error: "Authentication failed. Please check your username and password." });
          }
        } catch (loginErr: any) {
          console.error("Login attempt exception:", loginErr);
          await browser.close();
          return res.json({ success: false, error: `Authentication failed during process: ${loginErr.message}` });
        }
      }

      const pageTitle = await page.title();

      // Get platform-specific selectors
      const selectorsToUse = getPlatformSelectors(validUrl, pageTitle);

      // 3. Detect internal tabs/sub-pages using custom platform selectors
      const tabsDetected = await page.evaluate((selectors) => {
        const found: { label: string; index: number }[] = [];
        let index = 0;
        selectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(el => {
            const text = (el.textContent || "").trim();
            if (text && text.length < 30 && !found.some(f => f.label === text)) {
              found.push({ label: text, index: index++ });
            }
          });
        });
        return found;
      }, selectorsToUse);

      // 4. Multi-Page, Multi-Scroll Capture Protocol (Triggers lazy layout and extracts high res screenshots of stages)
      const captures: any[] = [];
      let captureIndex = 0;
      let totalPagesCaptured = 0;
      const MAX_PAGES = 15;
      const MAX_CAPTURES = 40;
      const viewportHeight = 900;
      const stepSize = 600;

      const domTextSet = new Set<string>();
      const svgDataSet: any[] = [];

      const scrapeActivePageData = async () => {
        try {
          const texts = await page.evaluate(() => {
            const list: string[] = [];
            document.querySelectorAll('text, tspan, .label, .value-label, [class*="chart-value"], [class*="kpi-value"], [class*="metric"], td, th, h1, h2, h3, h4, h5, h6, p, li, span, a').forEach(el => {
              const txt = (el.textContent || "").trim();
              if (txt && txt.length > 1 && txt.length < 150) {
                list.push(txt);
              }
            });
            return list;
          });
          texts.forEach(t => domTextSet.add(t));

          const svgs = await page.evaluate(() => {
            const elements: any[] = [];
            document.querySelectorAll('svg').forEach((svg, idx) => {
              const svgTexts: string[] = [];
              svg.querySelectorAll('text, tspan').forEach(t => {
                const c = (t.textContent || "").trim();
                if (c.length > 0 && c.length < 100) svgTexts.push(c);
              });
              if (svgTexts.length > 0) {
                elements.push({ labelItems: svgTexts.slice(0, 30) });
              }
            });
            return elements.slice(0, 15);
          });
          
          svgs.forEach(s => {
            if (!svgDataSet.some(existing => JSON.stringify(existing.labelItems) === JSON.stringify(s.labelItems))) {
              svgDataSet.push({ svgIndex: svgDataSet.length, labelItems: s.labelItems });
            }
          });
        } catch (err) {
          console.error("Error scraping page data segment:", err);
        }
      };

      const capturePageScrolls = async () => {
         const fullHeight = await page.evaluate(() => document.body.scrollHeight || document.documentElement.scrollHeight || 1080);
         console.log(`Scrolling viewport across total height of ${fullHeight}px for page ${totalPagesCaptured + 1}`);
         let currentScroll = 0;
         while (currentScroll < fullHeight && captureIndex < MAX_CAPTURES) {
           await page.evaluate((y) => window.scrollTo(0, y), currentScroll);
           await new Promise(r => setTimeout(r, 1200)); // Wait for charts to catch scroll and paint
           const base64Buffer = await page.screenshot({ fullPage: false, encoding: 'base64' });
           captures.push({
              captureIndex,
              scrollPosition: currentScroll,
              pageNumber: totalPagesCaptured + 1,
              imageBase64: `data:image/png;base64,${base64Buffer}`
           });
           
           captureIndex++;
           
           // Scrape text context as we scroll to catch lazily rendered tables/charts!
           await scrapeActivePageData();

           if (currentScroll + viewportHeight >= fullHeight) break;
           currentScroll += stepSize;
         }
         totalPagesCaptured++;
      };

      await capturePageScrolls();

      // Capture same-domain links (sidebar/tabs), specifically allowing query parameters like ?tab=...
      const otherLinks = await page.evaluate((maxPages) => {
          const links = Array.from(document.querySelectorAll('a'));
          const currentBase = window.location.origin;
          const currentUrl = window.location.href.split('#')[0];
          return links
             .map(a => a.href.split('#')[0]) // ignore hash differences
             .filter(href => href.startsWith(currentBase) && href !== currentUrl)
             .filter((value, index, self) => self.indexOf(value) === index)
             .slice(0, maxPages - 1); // limit to available remaining pages
      }, MAX_PAGES);

      for (const link of otherLinks) {
          if (totalPagesCaptured >= MAX_PAGES || captureIndex >= MAX_CAPTURES) break;
          console.log(`Navigating to additional dashboard tab/link: ${link}`);
          try {
              await page.goto(link, { waitUntil: 'networkidle2', timeout: 20000 });
              await new Promise(r => setTimeout(r, 2000));
              await capturePageScrolls();
          } catch (e) {
              console.warn(`Failed to capture link ${link}`, e);
          }
      }

      // In addition to links, let's detect and sequentially click physical tab elements!
      console.log("Detecting physical clickable tab elements on page...");
      const physicalTabCount = await page.evaluate((selectors) => {
        let foundElements: string[] = [];
        selectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(el => {
            const text = (el.textContent || "").trim();
            if (text && text.length > 1 && text.length < 30 && !(el as any).disabled) {
              if (!foundElements.includes(text)) {
                foundElements.push(text);
              }
            }
          });
        });
        return foundElements.length;
      }, selectorsToUse);

      console.log(`Found ${physicalTabCount} physical tab elements. Initiating sequential tab click crawl...`);
      for (let tabIdx = 0; tabIdx < physicalTabCount; tabIdx++) {
        if (totalPagesCaptured >= MAX_PAGES || captureIndex >= MAX_CAPTURES) break;
        console.log(`Clicking physical tab index ${tabIdx}...`);
        const clicked = await page.evaluate((idx, selectors) => {
          let foundElements: HTMLElement[] = [];
          selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
              const text = (el.textContent || "").trim();
              if (text && text.length > 1 && text.length < 30 && !(el as any).disabled) {
                if (!foundElements.some(existing => (existing.textContent || "").trim() === text)) {
                  foundElements.push(el as HTMLElement);
                }
              }
            });
          });
          if (foundElements[idx]) {
            foundElements[idx].click();
            return { success: true, label: (foundElements[idx].textContent || "").trim() };
          }
          return { success: false, label: "" };
        }, tabIdx, selectorsToUse);

        if (clicked.success) {
          console.log(`Successfully clicked tab "${clicked.label}". Waiting for data fetch...`);
          await new Promise(r => setTimeout(r, 3000)); // Wait for tab chart render
          await capturePageScrolls();
        }
      }

      // Loop to capture multiple paginated pages if they exist (on the last visited page or main page)
      while (totalPagesCaptured < MAX_PAGES && captureIndex < MAX_CAPTURES) {
         const hasNextPage = await page.evaluate(() => {
            const btnSelectors = [
                '.pagination-next', '[aria-label="Next"]', '[aria-label="Next page"]',
                '.rc-pagination-next', '.ant-pagination-next',
                'button.next', 'a.next', '[title="Next Page"]', '[aria-label="next"]',
                '.MuiTablePagination-actions button[title="Next page"]'
            ];
            
            let targetBtn: HTMLElement | null = null;
            for (const sel of btnSelectors) {
                const btn = document.querySelector(sel) as HTMLElement;
                if (btn && !btn.hasAttribute('disabled') && !btn.className.includes('disabled') && !btn.className.includes('Mui-disabled')) {
                    targetBtn = btn;
                    break;
                }
            }

            if (!targetBtn) {
               const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
               for (const btn of buttons) {
                   const txt = (btn.textContent || '').trim().toLowerCase();
                   if ((txt === 'next' || txt === 'next page' || txt === '>') && !btn.hasAttribute('disabled') && !btn.className.includes('disabled') && !btn.className.includes('Mui-disabled')) {
                       targetBtn = btn as HTMLElement;
                       break;
                   }
               }
            }

            if (targetBtn) {
               targetBtn.click();
               return true;
            }
            return false;
         });

         if (hasNextPage) {
            console.log(`Clicked next page. Waiting for load...`);
            await new Promise(r => setTimeout(r, 3000));
            await page.evaluate(() => window.scrollTo(0, 0));
            await capturePageScrolls();
         } else {
            console.log(`No more pagination found after ${totalPagesCaptured} pages.`);
            break;
         }
      }
      
      console.log(`Finished capturing, total pages: ${totalPagesCaptured}, total captures: ${captures.length}`);

      // Scroll back to top
      await page.evaluate(() => window.scrollTo(0, 0));
      await new Promise(r => setTimeout(r, 500));

      // Build consolidated arrays from Sets
      const domTextData = Array.from(domTextSet).slice(0, 500); // Consolidated top 500 unique strings across all tabs
      const svgData = svgDataSet.slice(0, 40); // Consolidated top 40 SVG charts across all tabs

      // Take overall high quality full page screenshot as master thumbnail
      const screenshotBuffer = await page.screenshot({ 
        fullPage: true, 
        encoding: 'base64' 
      });
      
      console.log(`[Server] Initiating semantic crawler for structured knowledge base: ${validUrl}`);
      const cookies = await page.cookies().catch(() => []);
      const crawlerService = new DashboardCrawlerService();
      const crawlResult = await crawlerService.crawl(
        validUrl,
        browser,
        credentials || null,
        cookies && cookies.length > 0 ? cookies : (sessionCookies || null)
      ).catch(err => {
        console.error("DashboardCrawlerService failed to crawl:", err);
        return null;
      });

      await browser.close();

      res.json({
        success: true,
        pageTitle,
        capturedAt: new Date().toISOString(),
        fullPageScreenshotBase64: `data:image/png;base64,${screenshotBuffer}`,
        captures,
        tabsDetected,
        domTextData,
        svgData,
        platformDetected: tabsDetected.length > 0 ? "BI Dashboard with navigation" : "Web Dashboard",
        knowledgeBase: crawlResult ? crawlResult.knowledgeBase : null,
        knowledgeBaseStatus: crawlResult ? 'success' : 'failed'
      });
    } catch (error: any) {
      console.error("Dashboard Ingestion Error:", error);
      res.status(500).json({ error: error.message || "Failed to ingest the dashboard URL" });
    }
  });

  // Ingest Screenshot (Analyst Mode Phase 1)
  app.post("/api/ingest-screenshot", async (req, res) => {
    const { imageBase64, mimeType, captures, domTextData, svgData } = req.body;
    if (!imageBase64 && (!captures || captures.length === 0)) {
      return res.status(400).json({ error: "imageBase64 or captures array is required" });
    }

    try {
      const active = getActiveProvider();
      if (active.provider !== "gemini") {
        return res.status(400).json({ error: "Analyst visual understanding requires Gemini." });
      }
      const ai = getGeminiClient();

      const systemInstruction = `You are a dashboard reading expert. Analyze the provided dashboard screenshot(s) and extract a complete structured, exhaustive inventory of everything visible.
      
CRITICAL EXHAUSTIVE EXTRACTION REQUIREMENTS:
1. For EVERY chart element: Extract EVERY single visible data point, bar, line node, pie slice, or table cell. Do NOT sample or summarize. If there are 12 columns/bars, extract all 12.
2. For KPI Cards: Extract the primary core value, numeric value, text unit, label, trend direction (up/down/neutral), and the comparative trend text.
3. For Tables: Extract all visible rows and columns fully in tabular form.
4. If some data is cut off, indicate with a partiallyVisible: true flag.
5. Provide a confidenceScore (0.0 to 1.0) for each element based on its visual clarity.

COORDINATE NORMALIZATION INSTRUCTION:
You MUST specify "boundingBoxEstimate" with coordinates as percentages (0 to 100) of the overall image dimensions:
"boundingBoxEstimate": { 
  "x": <LEFT edge as % of image width, 0–100>, 
  "y": <TOP edge as % of image height, 0–100>, 
  "width": <width as % of image width, 0–100>, 
  "height": <height as % of image height, 0–100> 
}
ALL values MUST be percentages between 0 and 100. Do NOT use pixel coordinates.

MULTI-IMAGE INPUT NOTE:
You may receive multiple sequential viewport captures of the same dashboard page, AND potentially multiple different dashboard pages (tabs) captured sequentially.
Extract all elements from all captures across all pages. Ensure elements that appear identical across multiple scroll captures of the same page are deduplicated, but KEEP elements from different dashboard pages.

Output perfectly valid JSON matching this schema:
{
  "dashboardTitle": "...",
  "reportingPeriod": "the time period covered if determinable",
  "overallTheme": "Sales | Marketing | Operations | Finance | HR | Product | Engineering | Executive | Other",
  "colorScheme": "primary colors used",
  "totalElements": number,
  "kpiCount": number,
  "chartCount": number,
  "tableCount": number,
  "elements": [
    {
      "elementId": "elem_XX",
      "elementType": "kpi_card | bar_chart | line_chart | pie_chart | table | map | filter_control | other",
      "title": "exact title text if visible",
      "location": "top-left | top-center | top-right | middle-left | middle-center | middle-right | bottom-left | bottom-center | bottom-right",
      "boundingBoxEstimate": { "x": 10, "y": 20, "width": 30, "height": 40 },
      "extractedValues": { 
        "primaryValue": "main kpi value as string", 
        "primaryValueNumeric": number or null, 
        "unit": "currency/percentage suffix or prefix",
        "label": "what the card tracks", 
        "trendDirection": "up | down | neutral | null", 
        "trendValue": "e.g., +14% vs last period", 
        "allDataPoints": [
          {"label": "e.g. Jan 24", "value": "₹4.2L", "numericValue": 420000}
        ],
        "tableRows": [
          ["Header1", "Header2"],
          ["Value1", "Value2"]
        ],
        "partiallyVisible": boolean
      },
      "confidenceScore": number
    }
  ],
  "criticalAlerts": ["any critical anomalies or negative trend developments, downwards metrics highlighted in red or warning states"],
  "toplineInsight": "One sentence — the single most important thing visible on this dashboard"
}`;

      // Assemble content parts
      const parts: any[] = [];
      let report: any = {
        dashboardTitle: "Dashboard Intelligence Report",
        reportingPeriod: null,
        overallTheme: "Generic",
        colorScheme: "",
        totalElements: 0,
        kpiCount: 0,
        chartCount: 0,
        tableCount: 0,
        elements: [],
        criticalAlerts: [],
        toplineInsight: ""
      };

      if (captures && captures.length > 0) {
        // Group captures by pageNumber
        const pageGroups: Record<number, any[]> = {};
        captures.forEach((cap: any) => {
          const pNum = cap.pageNumber || 1;
          if (!pageGroups[pNum]) pageGroups[pNum] = [];
          pageGroups[pNum].push(cap);
        });

        const pageNumbers = Object.keys(pageGroups).map(Number).sort((a, b) => a - b);
        const batches: any[][] = [];
        const BATCH_SIZE = 4; // up to 4 pages per batch

        for (let i = 0; i < pageNumbers.length; i += BATCH_SIZE) {
          const batchPageNumbers = pageNumbers.slice(i, i + BATCH_SIZE);
          let batchCaptures: any[] = [];
          batchPageNumbers.forEach(pNum => {
            const pageCaps = pageGroups[pNum];
            // Sample up to 3 captures per page (first, middle, last)
            if (pageCaps.length <= 3) {
              batchCaptures.push(...pageCaps);
            } else {
              batchCaptures.push(pageCaps[0]);
              batchCaptures.push(pageCaps[Math.floor(pageCaps.length / 2)]);
              batchCaptures.push(pageCaps[pageCaps.length - 1]);
            }
          });
          batches.push(batchCaptures);
        }

        console.log(`Processing ${batches.length} vision batches for a total of ${pageNumbers.length} pages...`);

        for (let b = 0; b < batches.length; b++) {
          const batchCaptures = batches[b];
          const batchParts: any[] = [];

          batchCaptures.forEach((cap: any, idx: number) => {
            batchParts.push({
              text: `Page ${cap.pageNumber || 1}, Scroll segment (scroll position: ${cap.scrollPosition}px) [Capture Index: ${cap.captureIndex}]:`
            });
            const base64Data = cap.imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
            batchParts.push({
              inlineData: {
                data: base64Data,
                mimeType: mimeType || "image/png"
              }
            });
          });

          let promptText = "Extract an exhaustive complete structured inventory of these dashboard page(s). Extract every single visible number, category point, trend and alert.";
          if (domTextData && domTextData.length > 0) {
            promptText += `\n\nSupplemental DOM Scraped Text nodes found:\n${JSON.stringify(domTextData.slice(0, 150))}\n`;
          }
          if (svgData && svgData.length > 0) {
            promptText += `\n\nSupplemental SVG Chart Label texts detected:\n${JSON.stringify(svgData.slice(0, 15))}\n`;
          }
          batchParts.push({ text: promptText });

          try {
            const response = await callGeminiWithRetry(async (model) => {
              return await ai.models.generateContent({
                model,
                contents: [{ role: "user", parts: batchParts }],
                config: {
                  systemInstruction,
                  temperature: 0.1,
                  responseMimeType: "application/json"
                }
              });
            }, `Screenshot Ingestion Batch ${b + 1}`);

            const batchReport = JSON.parse(response.text || "{}");
            
            if (b === 0) {
              report.dashboardTitle = batchReport.dashboardTitle || report.dashboardTitle;
              report.reportingPeriod = batchReport.reportingPeriod || report.reportingPeriod;
              report.overallTheme = batchReport.overallTheme || report.overallTheme;
              report.colorScheme = batchReport.colorScheme || report.colorScheme;
              report.toplineInsight = batchReport.toplineInsight || report.toplineInsight;
            }

            if (batchReport.elements && Array.isArray(batchReport.elements)) {
              batchReport.elements.forEach((el: any) => {
                if (report.elements.some((ex: any) => ex.elementId === el.elementId)) {
                  el.elementId = `${el.elementId}_b${b}`;
                }
                report.elements.push(el);
              });
            }

            if (batchReport.criticalAlerts && Array.isArray(batchReport.criticalAlerts)) {
              batchReport.criticalAlerts.forEach((alert: string) => {
                if (!report.criticalAlerts.includes(alert)) {
                  report.criticalAlerts.push(alert);
                }
              });
            }
          } catch (batchErr) {
            console.error(`Error processing vision batch ${b + 1}:`, batchErr);
          }
        }

        // Re-calculate counts
        report.totalElements = report.elements.length;
        report.kpiCount = report.elements.filter((el: any) => el.elementType === 'kpi_card').length;
        report.chartCount = report.elements.filter((el: any) => el.elementType && el.elementType.includes('chart')).length;
        report.tableCount = report.elements.filter((el: any) => el.elementType === 'table').length;

      } else {
        // Single master image upload
        const base64Data = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: mimeType || "image/png"
          }
        });

        let promptText = "Extract an exhaustive complete structured inventory of this dashboard including every single visible number, category point, trend and alert.";
        if (domTextData && domTextData.length > 0) {
          promptText += `\n\nSupplemental DOM Scraped Text nodes found on the page:\n${JSON.stringify(domTextData)}\n`;
        }
        if (svgData && svgData.length > 0) {
          promptText += `\n\nSupplemental SVG Chart Label texts detected:\n${JSON.stringify(svgData)}\n`;
        }
        parts.push({ text: promptText });

        const response = await callGeminiWithRetry(async (model) => {
          return await ai.models.generateContent({
            model,
            contents: [{ role: "user", parts }],
            config: {
              systemInstruction,
              temperature: 0.1,
              responseMimeType: "application/json"
            }
          });
        }, "Screenshot Ingestion Single");

        report = JSON.parse(response.text || "{}");
      }

      res.json({ success: true, report });
    } catch (error: any) {
      console.error("Screenshot Ingestion Error:", error);
      let errorMessage = error.message || "Failed to ingest screenshot";
      if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
        errorMessage = "Gemini API Quota Exceeded. Please try again later or check your API key billing.";
      }
      res.status(500).json({ error: errorMessage });
    }
  });

  // Analyst Chat (Phase 1 & 4 Comparison)
  app.post("/api/analyst-chat", async (req, res) => {
    const { message, intelligenceReport, intelligenceReportB, conversationHistory, screenshots, screenshotsB, knowledgeBase } = req.body;
    try {
      const active = getActiveProvider();
      
      const comparisonText = intelligenceReportB ? `
You are ALSO COMPARING this to a second dashboard (Dashboard B).
Dashboard B JSON:
${JSON.stringify(intelligenceReportB)}
` : '';

      const knowledgeBaseText = knowledgeBase ? `
CRITICAL MULTI-PAGE DATA SOURCE (Dashboard Knowledge Base):
You have access to the complete, multi-page database containing extracted charts, tables, KPIs, and filters from ALL tabs/sheets of the dashboard.
Use this structured information as your primary ground-truth data repository. If the user asks about other pages, comparing across tabs, or searches, read and analyze this Knowledge Base to formulate your answers. Do NOT limit your answers to only the active visible page.

Dashboard Knowledge Base JSON:
${JSON.stringify(knowledgeBase)}
` : '';

      const systemInstruction = `You are a dashboard reading expert. Answer the user's questions based on the provided multi-page Knowledge Base JSON (if available), intelligence report JSON, AND the visual bytes of the dashboard image(s).
      
Dashboard A JSON:
${JSON.stringify(intelligenceReport)}
${comparisonText}
${knowledgeBaseText}

CRITICAL RULES:
1. Grounded Accuracy: Only answer from values physically found in the report or image labels/charts. If they are absent, say so and explain what is visible. Do NOT invent, estimate, or hallucinate data points.
2. Formats: Handle Indian rupee formatted numbers (e.g. Lakhs, Crores) and western numbering systems properly.
3. Answer Spotlight:
   - When the user asks for a single KPI number or localized value, classify this as answerType: "single_kpi" and populate "kpiSpotlight".
   - When the queries seek multiple metrics over time or trends, set answerType: "trend" and populate "miniChartData".
   - If not found or unsupported, return answerType: "unavailable".
   - Otherwise use: "comparison" or "list" or "explanation".

Output perfectly valid JSON matching this schema:
{
  "answerText": "standard textual conversational answer",
  "answerType": "single_kpi | comparison | list | trend | explanation | unavailable",
  "interpretation": "Interpreting your question as: ...",
  "kpiSpotlight": {
    "value": "e.g., ₹4.2 Cr",
    "numericValue": 42000000,
    "unit": "₹ Cr",
    "label": "metric labels like Q3 Net profit",
    "context": "one-sentence delta description compared to baseline",
    "trend": "up | down | neutral | null",
    "sourceElementId": "elem_XX",
    "sourceElementTitle": "Exact name of KPI Card",
    "confidence": 0.95
  },
  "miniChartData": [
    { "label": "Jan", "value": 450000 },
    { "label": "Feb", "value": 380000 }
  ],
  "sourceElements": [
    { "elementId": "elem_XX", "elementType": "kpi_card", "elementTitle": "Widget Title" }
  ],
  "annotationBoxes": [
    {
      "elementId": "elem_XX",
      "captureIndex": 0,
      "boundingBox": { "x": 10, "y": 20, "width": 30, "height": 40 },
      "highlightColor": "#22c55e",
      "label": "Focus Anchor text"
    }
  ],
  "suggestedFollowUps": [
    "Suggested question 1",
    "Suggested question 2"
  ]
}`;

      // Build multimodal contents
      let contents: any[] = [];
      
      // Inject prior conversation context
      if (conversationHistory && Array.isArray(conversationHistory)) {
        conversationHistory.forEach((msg: any) => {
          contents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content || "" }]
          });
        });
      }

      // Latest message parts
      const activeParts: any[] = [{ text: message }];
      
      // Multimodal: Append Dashboard A images if provided
      if (screenshots && Array.isArray(screenshots)) {
        const activeScreenshots = screenshots.slice(0, 20);

        activeScreenshots.forEach((sc: any, idx: number) => {
          if (sc?.imageBase64) {
            activeParts.push({ text: `Dashboard A Capture Index ${idx}: Page ${sc.pageNumber || 1}, Scroll position ${sc.scrollPosition || 0}px:` });
            const cleanBase64 = sc.imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
            activeParts.push({
              inlineData: {
                data: cleanBase64,
                mimeType: "image/png"
              }
            });
          }
        });
      }

      // Multimodal: Append Dashboard B comparison images if provided
      if (screenshotsB && Array.isArray(screenshotsB)) {
        const activeScreenshotsB = screenshotsB.slice(0, 20);

        activeScreenshotsB.forEach((sc: any, idx: number) => {
          if (sc?.imageBase64) {
            activeParts.push({ text: `Dashboard B Capture Index ${idx}: Page ${sc.pageNumber || 1}, Scroll position ${sc.scrollPosition || 0}px:` });
            const cleanBase64 = sc.imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
            activeParts.push({
              inlineData: {
                data: cleanBase64,
                mimeType: "image/png"
              }
            });
          }
        });
      }

      contents.push({
        role: "user",
        parts: activeParts
      });

      if (active.provider === "gemini") {
        const ai = getGeminiClient();
        const response = await callGeminiWithRetry(async (model) => {
        return await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            temperature: 0.1,
            responseMimeType: "application/json"
          }
        });
        }, "Analyst Chat");
        
        const ans = JSON.parse(response.text || "{}");
        res.json({ success: true, ...ans });
      } else {
        res.status(400).json({ error: "Analyst Chat requires Gemini." });
      }
    } catch (error: any) {
      console.error("Analyst Chat Error:", error);
      let errorMessage = error.message || "Failed to chat";
      if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
        errorMessage = "Gemini API Quota Exceeded. Please try again later or check your API key billing.";
      }
      res.status(500).json({ error: errorMessage });
    }
  });

  // Vite Integration
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Create native HTTP Server and mount WebSocketServer onto it
  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    // Avoid upgrading standard webpack or HMR / vite hmr endpoints if any slips through
    if (request.url?.includes("/vite-hmr") || request.url?.includes("hmr")) {
      return;
    }
    wss.handleUpgrade(request, socket, head, (wsConnection) => {
      wss.emit("connection", wsConnection, request);
    });
  });

  wss.on("connection", (wsConnection) => {
    console.log("WebSocket telemetry link connected.");
    let clientSubscription: any = null;
    let telemetryInterval: any = null;

    wsConnection.on("message", (messageStr) => {
      try {
        const message = JSON.parse(messageStr.toString());
        if (message.type === "subscribe") {
          console.log(`WebSocket subscription received for dashboard: ${message.payload?.dashboardId}`);
          clientSubscription = message.payload;

          if (telemetryInterval) {
            clearInterval(telemetryInterval);
          }

          // Broadcast stream metrics to subscriber every 5 seconds (no random fluctuation as per No Mock Data Policy)
          telemetryInterval = setInterval(() => {
            if (wsConnection.readyState !== wsConnection.OPEN || !clientSubscription) {
              clearInterval(telemetryInterval);
              return;
            }

            const updatedComponents = (clientSubscription.components || []).map((comp: any) => {
              let nextKpiValue = comp.config?.kpiValue;

              // Simply pass back the original value (No Mock Data Policy: Never randomly mutate displayed values)
              return {
                id: comp.id,
                kpiValue: nextKpiValue
              };
            });

            wsConnection.send(JSON.stringify({
              type: "telemetry_update",
              components: updatedComponents
            }));
          }, 5000);
        }
      } catch (err) {
        console.error("Error reading socket payload:", err);
      }
    });

    wsConnection.on("close", () => {
      console.log("WebSocket client connection closed, freeing intervals.");
      if (telemetryInterval) {
        clearInterval(telemetryInterval);
      }
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT} in ${isProd ? "production" : "development"} mode.`);
  });
}

startServer();
