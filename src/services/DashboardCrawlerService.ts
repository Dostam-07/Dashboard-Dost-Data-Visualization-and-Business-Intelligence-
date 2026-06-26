import puppeteer from 'puppeteer';
import { GoogleGenAI } from '@google/genai';
import { DashboardKnowledgeBase, DashboardKnowledgeBasePage } from '../types';

export const PLATFORM_SELECTORS: Record<string, string[]> = {
  grafana: ['.page-sidebar-item', '.sidemenu-item', '[data-testid="nav-menu-item"]'],
  tableau: ['.tabsContainerInner .tab', '.tv-tab', '.tabItem', '.tab-anchor'],
  metabase: ['.list-item a', '.EntityItemList-item'],
  powerbi: ['.pivotItem .headerText', '[data-testid="tab-item"]'],
  superset: ['.ant-tabs-tab', '.ant-menu-item'],
  looker: ['.sidebar__item', '[data-explore]'],
  generic: [
    '[role="tab"]',
    '.tab-item',
    '.dashboard-tab',
    '[data-testid*="tab"]',
    '.sidebar-item',
    '.nav-link',
    '.Tab',
    'button[class*="tab"]',
    'a[class*="tab"]',
    '.tab-anchor'
  ],
};

export function detectPlatform(url: string, pageTitle: string): keyof typeof PLATFORM_SELECTORS {
  const normalizedUrl = url.toLowerCase();
  const normalizedTitle = pageTitle.toLowerCase();
  if (normalizedUrl.includes('grafana') || normalizedTitle.includes('grafana')) return 'grafana';
  if (normalizedUrl.includes('tableau') || normalizedTitle.includes('tableau')) return 'tableau';
  if (normalizedUrl.includes('metabase') || normalizedTitle.includes('metabase')) return 'metabase';
  if (normalizedUrl.includes('app.powerbi') || normalizedUrl.includes('powerbi.com')) return 'powerbi';
  if (normalizedUrl.includes('superset') || normalizedTitle.includes('superset')) return 'superset';
  if (normalizedUrl.includes('looker')) return 'looker';
  return 'generic';
}

export function getPlatformSelectors(url: string, pageTitle: string): string[] {
  const platform = detectPlatform(url, pageTitle);
  const selectors = PLATFORM_SELECTORS[platform];
  const merged = [...selectors];
  PLATFORM_SELECTORS.generic.forEach(s => {
    if (!merged.includes(s)) merged.push(s);
  });
  return merged;
}

// Helper to sanitize base64 if needed
export interface CrawlerResult {
  knowledgeBase: DashboardKnowledgeBase;
  routes: string[];
  dashboards: string[];
  pagesDiscovered: string[];
}

export class DashboardCrawlerService {
  private ai: GoogleGenAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
  }

  /**
   * Helper to run Gemini requests for metadata extraction
   */
  private async extractPageMetadata(
    pageTitle: string,
    scrapedTexts: string[],
    scrapedTables: any[]
  ): Promise<Partial<DashboardKnowledgeBasePage>> {
    if (!this.ai) {
      console.warn("Gemini API key is not configured for metadata extraction. Falling back to simple heuristic parsing.");
      return this.heuristicPageMetadata(pageTitle, scrapedTexts);
    }

    try {
      const systemInstruction = `You are an expert Business Intelligence database and schema extractor. 
Your goal is to extract a highly structured dataset of KPIs, charts, tables, and filters from raw, unstructured text crawled from a dashboard page.
Analyze the provided scraped texts and HTML tables, identify any and all charts, KPIs (key performance indicators with their values and trends), data tables, and filters.
Return a perfectly valid JSON object matching the requested schema:
{
  "charts": [
    { "title": "Chart Title", "type": "bar | line | area | pie | map", "metrics": ["Metric Name 1", "Metric Name 2"], "values": [{ "label": "X-Value", "metric1": 100, "metric2": 200 }], "insights": "brief data insight" }
  ],
  "tables": [
    { "title": "Table Title", "headers": ["Header1", "Header2"], "rows": [["Row1Val1", "RowVal2"]], "summary": "brief summary of table" }
  ],
  "kpis": [
    { "title": "KPI Title", "value": "$100k or 92.4%", "trend": "+5% MoM | down | neutral", "unit": "$, %, count, etc" }
  ],
  "filters": [
    { "name": "Filter Name", "options": ["Option 1", "Option 2"] }
  ]
}`;

      const textSample = scrapedTexts.slice(0, 300).join("\n");
      const tablesSample = JSON.stringify(scrapedTables.slice(0, 10));

      const prompt = `Dashboard Page Context: "${pageTitle}"
Scraped DOM Text Content:
---
${textSample}
---
Scraped DOM HTML Tables:
---
${tablesSample}
---

Extract all elements accurately into JSON. Do not hallucinate metrics. Use actual numbers and text found above.`;

      // Try gemini-2.5-flash-lite as a fast and cheap structure extractor
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.1,
        }
      });

      const responseText = response.text || "{}";
      return JSON.parse(responseText);
    } catch (err) {
      console.error("Gemini metadata extraction failed, falling back to heuristic:", err);
      return this.heuristicPageMetadata(pageTitle, scrapedTexts);
    }
  }

  /**
   * Safe fallback heuristic extractor if Gemini fails or is rate limited
   */
  private heuristicPageMetadata(pageTitle: string, texts: string[]): Partial<DashboardKnowledgeBasePage> {
    const kpis: any[] = [];
    const charts: any[] = [];
    const tables: any[] = [];
    const filters: any[] = [];

    // Simple pattern matching for fallback
    texts.forEach(txt => {
      if (txt.includes(":") && (txt.includes("%") || txt.match(/\d/))) {
        const parts = txt.split(":");
        kpis.push({
          title: parts[0].trim(),
          value: parts[1].trim(),
          trend: txt.includes("+") ? "up" : txt.includes("-") ? "down" : "neutral"
        });
      }
    });

    return {
      charts,
      tables,
      kpis: kpis.slice(0, 10),
      filters
    };
  }

  /**
   * Main crawl function
   */
  public async crawl(
    url: string, 
    browserInstance?: any,
    credentials?: { username: string; password: string } | null,
    sessionCookies?: any[] | null
  ): Promise<CrawlerResult> {
    console.log(`[DashboardCrawlerService] Starting full crawl of URL: ${url}`);
    
    const ownsBrowser = !browserInstance;
    const browser = browserInstance || await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
      headless: true
    });

    const pagesDiscovered: string[] = [];
    const routes: string[] = [];
    const dashboards: string[] = [];
    const kbPages: DashboardKnowledgeBasePage[] = [];

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });

      // Inject session cookies if supplied
      if (sessionCookies && Array.isArray(sessionCookies)) {
        console.log("[DashboardCrawlerService] Applying session cookies to page instance...");
        try {
          await page.setCookie(...sessionCookies);
        } catch (cookieErr) {
          console.error("[DashboardCrawlerService] Failed to set cookies:", cookieErr);
        }
      }

      // Navigate to main URL
      let validUrl = url.trim();
      if (!validUrl.startsWith("http://") && !validUrl.startsWith("https://")) {
        validUrl = "https://" + validUrl;
      }
      validUrl = validUrl.replace("https//:", "https://").replace("http//:", "http://");
      validUrl = validUrl.replace("https://https://", "https://").replace("http://http://", "http://");

      try {
        await page.goto(validUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      } catch (e) {
        console.warn(`[DashboardCrawlerService] Goto timeout or error, proceeding anyway: ${e}`);
      }

      await new Promise(r => setTimeout(r, 2000));

      // Auth Page Analysis
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

      if (authState.requiresAuth && credentials) {
        console.log("[DashboardCrawlerService] Injecting credentials and trying to authenticate...");
        try {
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

          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
          await new Promise(r => setTimeout(r, 2000));
        } catch (loginErr: any) {
          console.error("[DashboardCrawlerService] Login attempt exception:", loginErr);
        }
      }

      const mainTitle = await page.title() || "Dashboard Portal";
      pagesDiscovered.push(mainTitle);

      // --- PAGE & ROUTE DISCOVERY ENGINE ---
      // 1. Scan for internal links & navigation links
      const discoveredLinks = await page.evaluate(() => {
        const list: { href: string; label: string }[] = [];
        const baseOrigin = window.location.origin;
        const currentHref = window.location.href.split('#')[0];

        document.querySelectorAll('a').forEach(a => {
          const href = a.href.split('#')[0];
          const label = (a.textContent || "").trim();
          if (href && href.startsWith(baseOrigin) && href !== currentHref && label.length > 1 && label.length < 50) {
            if (!list.some(item => item.href === href)) {
              list.push({ href, label });
            }
          }
        });
        return list;
      });

      discoveredLinks.forEach(link => {
        routes.push(link.href);
        dashboards.push(link.label);
      });

      // Get dynamic platform-specific selectors
      const selectorsToUse = getPlatformSelectors(validUrl, mainTitle);

      // 2. Scan for physical clickable tab elements using custom platform selectors
      const tabsDetected = await page.evaluate((selectors) => {
        const found: string[] = [];
        selectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            const text = (el.textContent || "").trim();
            if (text && text.length > 1 && text.length < 35 && !found.includes(text)) {
              found.push(text);
            }
          });
        });
        return found;
      }, selectorsToUse);

      console.log(`[DashboardCrawlerService] Discovered ${discoveredLinks.length} navigation links and ${tabsDetected.length} clickable tabs.`);

      // --- CRAWLER & SCRAPER STATE ---
      const visitedUrls = new Set<string>();
      visitedUrls.add(validUrl);

      // Scrape data helper for current viewport
      const scrapeCurrentViewData = async (currentPageName: string): Promise<DashboardKnowledgeBasePage> => {
        console.log(`[DashboardCrawlerService] Scaping data for page: ${currentPageName}`);

        // Scrape text content
        const texts = await page.evaluate(() => {
          const arr: string[] = [];
          document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, td, th, li, span, .label, .value, [class*="kpi"], [class*="metric"], [class*="chart-value"]').forEach(el => {
            const txt = (el.textContent || "").trim();
            if (txt && txt.length > 1 && txt.length < 200 && !arr.includes(txt)) {
              arr.push(txt);
            }
          });
          return arr;
        });

        // Scrape tabular blocks
        const tablesScraped = await page.evaluate(() => {
          const foundTables: any[] = [];
          document.querySelectorAll('table').forEach((table, tableIdx) => {
            const headers: string[] = [];
            const rows: string[][] = [];
            
            table.querySelectorAll('th').forEach(th => {
              headers.push((th.textContent || "").trim());
            });

            table.querySelectorAll('tr').forEach(tr => {
              const row: string[] = [];
              tr.querySelectorAll('td').forEach(td => {
                row.push((td.textContent || "").trim());
              });
              if (row.length > 0) {
                rows.push(row);
              }
            });

            foundTables.push({
              tableIdx,
              title: `Table Segment ${tableIdx + 1}`,
              headers: headers.length > 0 ? headers : rows[0] || [],
              rows: headers.length > 0 ? rows : rows.slice(1)
            });
          });
          return foundTables;
        });

        // Use Gemini metadata extraction for semantic page translation!
        const parsedMetadata = await this.extractPageMetadata(currentPageName, texts, tablesScraped);

        return {
          pageId: `page_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          pageName: currentPageName,
          charts: parsedMetadata.charts || [],
          tables: parsedMetadata.tables || tablesScraped.map(t => ({ title: t.title, headers: t.headers, rows: t.rows, summary: "" })),
          kpis: parsedMetadata.kpis || [],
          filters: parsedMetadata.filters || []
        };
      };

      // 1. Scrape original page
      const mainPageData = await scrapeCurrentViewData(mainPageTitleOrLabel(mainTitle));
      kbPages.push(mainPageData);

      // 2. Sequentially click and scrape tabs (up to 10 tabs to respect budget and limits)
      const tabsToCrawl = tabsDetected.slice(0, 10);
      for (let i = 0; i < tabsToCrawl.length; i++) {
        const tabName = tabsToCrawl[i];
        console.log(`[DashboardCrawlerService] Attempting tab click crawl on: ${tabName}`);
        
        const clicked = await page.evaluate((labelName, selectors) => {
          let foundEl: HTMLElement | null = null;
          for (const sel of selectors) {
            const els = Array.from(document.querySelectorAll(sel));
            const match = els.find(el => (el.textContent || "").trim() === labelName);
            if (match) {
              foundEl = match as HTMLElement;
              break;
            }
          }
          if (foundEl) {
            foundEl.click();
            return true;
          }
          return false;
        }, tabName, selectorsToUse);

        if (clicked) {
          await new Promise(r => setTimeout(r, 2500)); // wait for dynamic graphs/charts load
          const tabData = await scrapeCurrentViewData(tabName);
          kbPages.push(tabData);
          pagesDiscovered.push(tabName);
        }
      }

      // 3. Sequentially navigate to other links (if they are under same domain)
      const linksToCrawl = discoveredLinks.filter(item => !visitedUrls.has(item.href)).slice(0, 5);
      for (const item of linksToCrawl) {
        console.log(`[DashboardCrawlerService] Navigating to sub-link crawl: ${item.href}`);
        try {
          await page.goto(item.href, { waitUntil: 'networkidle2', timeout: 15000 });
          visitedUrls.add(item.href);
          await new Promise(r => setTimeout(r, 2000));
          
          const title = await page.title() || item.label;
          const subPageData = await scrapeCurrentViewData(title);
          kbPages.push(subPageData);
          pagesDiscovered.push(title);
        } catch (err) {
          console.warn(`[DashboardCrawlerService] Failed to navigate/scrape link ${item.href}: ${err}`);
        }
      }

      await page.close();
    } catch (e) {
      console.error("[DashboardCrawlerService] Exception during crawling process:", e);
    } finally {
      if (ownsBrowser) {
        await browser.close();
      }
    }

    return {
      knowledgeBase: {
        dashboardId: `kb_${Date.now()}`,
        pages: kbPages,
        routes: routes,
        dashboards: dashboards
      },
      routes,
      dashboards,
      pagesDiscovered
    };
  }
}

// Simple label cleanups
function mainPageTitleOrLabel(title: string): string {
  const clean = title.replace(/[|\-\s]+(Dashboard|Portal|Analytics|Home|Tableau|Power BI|Looker)/gi, "").trim();
  return clean || "Overview / Home";
}
