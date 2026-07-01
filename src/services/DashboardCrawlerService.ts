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
  captures: any[];
  domTextData: string[];
  svgData: any[];
  tabsDetected: { label: string; index: number }[];
  pageTitle: string;
  fullPageScreenshotBase64: string;
}

export class DashboardCrawlerService {
  private ai: GoogleGenAI | null = null;
  private domTextSet = new Set<string>();
  private svgDataSet: any[] = [];
  private captures: any[] = [];
  private captureIndex = 0;
  private totalPagesCaptured = 0;
  private readonly MAX_PAGES = 15;
  private readonly MAX_CAPTURES = 40;
  private readonly viewportHeight = 900;
  private readonly stepSize = 600;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
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

      const response = await this.ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.1,
        }
      });

      const responseText = response.text || "{}";
      
      // Safety: strip markdown code blocks if the model returned them despite responseMimeType
      const jsonText = responseText.replace(/```json\s?/, "").replace(/```\s?/, "").trim();
      
      return JSON.parse(jsonText);
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
   * Scrapes raw text and SVG items from the current viewport
   */
  private async scrapeActivePageData(page: any) {
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
      texts.forEach(t => this.domTextSet.add(t));

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
        if (!this.svgDataSet.some(existing => JSON.stringify(existing.labelItems) === JSON.stringify(s.labelItems))) {
          this.svgDataSet.push({ svgIndex: this.svgDataSet.length, labelItems: s.labelItems });
        }
      });
    } catch (err) {
      console.error("[DashboardCrawlerService] Error scraping viewport segment:", err);
    }
  }

  /**
   * Scrolls and captures screenshots + scrapes data for the current page
   */
  private async captureAndScrapeCurrentPage(page: any, pageName: string): Promise<DashboardKnowledgeBasePage> {
    console.log(`[DashboardCrawlerService] Capturing and scraping: ${pageName}`);
    
    const currentUrl = page.url().split('#')[0];
    const fullHeight = await page.evaluate(() => document.body.scrollHeight || document.documentElement.scrollHeight || 1080);
    
    let currentScroll = 0;
    while (currentScroll < fullHeight && this.captureIndex < this.MAX_CAPTURES) {
      await page.evaluate((y) => window.scrollTo(0, y), currentScroll);
      await new Promise(r => setTimeout(r, 1200)); 
      
      const base64Buffer = await page.screenshot({ fullPage: false, encoding: 'base64' });
      this.captures.push({
        captureIndex: this.captureIndex,
        scrollPosition: currentScroll,
        pageNumber: this.totalPagesCaptured + 1,
        imageBase64: `data:image/png;base64,${base64Buffer}`
      });
      
      this.captureIndex++;
      await this.scrapeActivePageData(page);

      if (currentScroll + this.viewportHeight >= fullHeight) break;
      currentScroll += this.stepSize;
    }
    this.totalPagesCaptured++;

    // Now extract structured data for the Knowledge Base from this page
    // We already have domTextData in this.domTextSet and potentially new table data
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

    const tablesScraped = await page.evaluate(() => {
      const foundTables: any[] = [];
      document.querySelectorAll('table').forEach((table, tableIdx) => {
        const headers: string[] = [];
        const rows: string[][] = [];
        table.querySelectorAll('th').forEach(th => headers.push((th.textContent || "").trim()));
        table.querySelectorAll('tr').forEach(tr => {
          const row: string[] = [];
          tr.querySelectorAll('td').forEach(td => row.push((td.textContent || "").trim()));
          if (row.length > 0) rows.push(row);
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

    const parsedMetadata = await this.extractPageMetadata(pageName, texts, tablesScraped);

    return {
      pageId: `page_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      pageName,
      charts: parsedMetadata.charts || [],
      tables: parsedMetadata.tables || tablesScraped.map(t => ({ title: t.title, headers: t.headers, rows: t.rows, summary: "" })),
      kpis: parsedMetadata.kpis || [],
      filters: parsedMetadata.filters || []
    };
  }

  /**
   * Main crawl function - Consolidates all navigation and capture into a single pass
   */
  public async crawl(
    url: string, 
    browserInstance?: any,
    credentials?: { username: string; password: string } | null,
    sessionCookies?: any[] | null
  ): Promise<CrawlerResult> {
    console.log(`[DashboardCrawlerService] Starting consolidated crawl of URL: ${url}`);
    
    const ownsBrowser = !browserInstance;
    const browser = browserInstance || await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
      headless: true
    });

    const pagesDiscovered: string[] = [];
    const routes: string[] = [];
    const dashboards: string[] = [];
    const kbPages: DashboardKnowledgeBasePage[] = [];
    const visitedUrls = new Set<string>();
    const discoveredLinksSet = new Set<string>();
    const tabsDetected: { label: string; index: number }[] = [];
    let pageTitle = "Dashboard Portal";
    let fullPageScreenshotBase64 = "";

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });

      if (sessionCookies && Array.isArray(sessionCookies)) {
        await page.setCookie(...sessionCookies).catch(e => console.error("[DashboardCrawlerService] Cookie error:", e));
      }

      let validUrl = url.trim();
      if (!validUrl.startsWith("http://") && !validUrl.startsWith("https://")) {
        validUrl = "https://" + validUrl;
      }
      validUrl = validUrl.replace("https//:", "https://").replace("http//:", "http://");
      
      try {
        await page.goto(validUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      } catch (e) {
        console.warn(`[DashboardCrawlerService] Initial navigation warning: ${e}`);
      }

      await new Promise(r => setTimeout(r, 2000));
      pageTitle = await page.title() || "Dashboard Portal";

      // Auth logic
      const authState = await page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        const hasPasswordField = document.querySelector('input[type="password"]') !== null;
        const hasLoginKeywords = ['sign in', 'log in', 'username', 'email address'].some(k => bodyText.includes(k));
        return { requiresAuth: hasPasswordField || hasLoginKeywords };
      });

      if (authState.requiresAuth && credentials) {
        await page.evaluate((creds) => {
          const userInputs = document.querySelectorAll('input[type="email"], input[type="text"], input[name*="user"]');
          const passInputs = document.querySelectorAll('input[type="password"]');
          if (userInputs.length > 0 && creds.username) {
            (userInputs[0] as HTMLInputElement).value = creds.username;
            userInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (passInputs.length > 0 && creds.password) {
            (passInputs[0] as HTMLInputElement).value = creds.password;
            passInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, credentials);

        await page.evaluate(() => {
          const submitBtn = document.querySelector('button[type="submit"], input[type="submit"], .btn-primary');
          if (submitBtn) (submitBtn as HTMLElement).click();
          else {
            const forms = document.querySelectorAll('form');
            if (forms.length > 0) forms[0].submit();
          }
        });

        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 2000));
        pageTitle = await page.title() || pageTitle;
      }

      // Initial Link & Tab Discovery
      const initialLinks = await page.evaluate(() => {
        const baseOrigin = window.location.origin;
        return Array.from(document.querySelectorAll('a'))
          .map(a => ({ href: a.href.split('#')[0], label: (a.textContent || "").trim() }))
          .filter(item => item.href.startsWith(baseOrigin) && item.label.length > 1 && item.label.length < 50);
      });

      initialLinks.forEach(link => {
        discoveredLinksSet.add(link.href);
        if (!routes.includes(link.href)) {
          routes.push(link.href);
          dashboards.push(link.label);
        }
      });

      const selectorsToUse = getPlatformSelectors(validUrl, pageTitle);
      const initialTabs = await page.evaluate((selectors) => {
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

      initialTabs.forEach((label, idx) => tabsDetected.push({ label, index: idx }));

      // --- PASS 1: Main Page ---
      const mainPageData = await this.captureAndScrapeCurrentPage(page, mainPageTitleOrLabel(pageTitle));
      kbPages.push(mainPageData);
      pagesDiscovered.push(mainPageData.pageName);
      visitedUrls.add(page.url().split('#')[0]);

      // Take master screenshot
      await page.evaluate(() => window.scrollTo(0, 0));
      const masterScreenshot = await page.screenshot({ fullPage: true, encoding: 'base64' });
      fullPageScreenshotBase64 = `data:image/png;base64,${masterScreenshot}`;

      // --- PASS 2: Sequential Tabs ---
      const tabsToCrawl = initialTabs.slice(0, 10);
      for (const tabName of tabsToCrawl) {
        if (this.totalPagesCaptured >= this.MAX_PAGES || this.captureIndex >= this.MAX_CAPTURES) break;
        
        let clicked = await page.evaluate((labelName, selectors) => {
          for (const sel of selectors) {
            const els = Array.from(document.querySelectorAll(sel));
            const match = els.find(el => (el.textContent || "").trim() === labelName);
            if (match) { (match as HTMLElement).click(); return true; }
          }
          return false;
        }, tabName, selectorsToUse);

        if (!clicked) {
          try {
            await page.goto(validUrl, { waitUntil: 'networkidle2', timeout: 15000 });
            clicked = await page.evaluate((labelName, selectors) => {
              for (const sel of selectors) {
                const els = Array.from(document.querySelectorAll(sel));
                const match = els.find(el => (el.textContent || "").trim() === labelName);
                if (match) { (match as HTMLElement).click(); return true; }
              }
              return false;
            }, tabName, selectorsToUse);
          } catch (e) {}
        }

        if (clicked) {
          await new Promise(r => setTimeout(r, 2500));
          const tabData = await this.captureAndScrapeCurrentPage(page, tabName);
          kbPages.push(tabData);
          pagesDiscovered.push(tabName);
          visitedUrls.add(page.url().split('#')[0]);
        }
      }

      // --- PASS 3: Same-Domain Links ---
      const linksToCrawl = Array.from(discoveredLinksSet)
        .filter(href => !visitedUrls.has(href))
        .slice(0, 5);

      for (const href of linksToCrawl) {
        if (this.totalPagesCaptured >= this.MAX_PAGES || this.captureIndex >= this.MAX_CAPTURES) break;
        try {
          await page.goto(href, { waitUntil: 'networkidle2', timeout: 15000 });
          await new Promise(r => setTimeout(r, 2000));
          const title = await page.title() || "Sub Page";
          const subPageData = await this.captureAndScrapeCurrentPage(page, title);
          kbPages.push(subPageData);
          pagesDiscovered.push(title);
          visitedUrls.add(href);
        } catch (e) {}
      }

      // --- PASS 4: Pagination ---
      while (this.totalPagesCaptured < this.MAX_PAGES && this.captureIndex < this.MAX_CAPTURES) {
        const hasNextPage = await page.evaluate(() => {
          const btnSelectors = ['.pagination-next', '[aria-label="Next"]', 'button.next', 'a.next'];
          let targetBtn: HTMLElement | null = null;
          for (const sel of btnSelectors) {
            const btn = document.querySelector(sel) as HTMLElement;
            if (btn && !btn.hasAttribute('disabled') && !btn.className.includes('disabled')) {
              targetBtn = btn; break;
            }
          }
          if (targetBtn) { targetBtn.click(); return true; }
          return false;
        });

        if (hasNextPage) {
          await new Promise(r => setTimeout(r, 3000));
          const pageData = await this.captureAndScrapeCurrentPage(page, `Page ${this.totalPagesCaptured + 1}`);
          kbPages.push(pageData);
          pagesDiscovered.push(pageData.pageName);
        } else break;
      }

      await page.close();
    } catch (e) {
      console.error("[DashboardCrawlerService] Crawl failed:", e);
    } finally {
      if (ownsBrowser) await browser.close();
    }

    return {
      knowledgeBase: { dashboardId: `kb_${Date.now()}`, pages: kbPages, routes, dashboards },
      routes, dashboards, pagesDiscovered,
      captures: this.captures,
      domTextData: Array.from(this.domTextSet).slice(0, 500),
      svgData: this.svgDataSet.slice(0, 40),
      tabsDetected,
      pageTitle,
      fullPageScreenshotBase64
    };
  }
}

// Simple label cleanups
function mainPageTitleOrLabel(title: string): string {
  const clean = title.replace(/[|\-\s]+(Dashboard|Portal|Analytics|Home|Tableau|Power BI|Looker)/gi, "").trim();
  return clean || "Overview / Home";
}
