import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store';
import { get, set as idbSet } from 'idb-keyval';
import { 
  Upload, X, Search, Sparkles, Image as ImageIcon, Clock, Trash2, Lock, 
  ChevronRight, ChevronLeft, Volume2, Mic, MicOff, Languages, FileText, Download, CheckCircle, AlertTriangle,
  MessageSquare, RefreshCw, Layers, Loader2
} from 'lucide-react';
import { IngestedDashboard } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { ChartWrapper } from './ChartWrapper';
import { FiltersPanel } from './FiltersPanel';
import { InlineChatChart } from './InlineChatChart';
import { filterComponentData, ActiveFilterState } from '../utils/filterEngine';

// Spell correction analytics dictionary for fuzzy intent handling
const ANALYTICS_DICTIONARY: Record<string, string> = {
  'revenoo': 'revenue',
  'reveunue': 'revenue',
  'revenu': 'revenue',
  'rejion': 'region',
  'distirct': 'district',
  'whart': 'what',
  'shwo': 'show',
  'hight': 'highest',
  'highst': 'highest',
  'toal': 'total',
  'totla': 'total',
  'comapr': 'compare',
  'compear': 'compare',
  'qaurter': 'quarter',
  'quater': 'quarter',
  'mounth': 'month',
  'monhly': 'monthly',
  'expens': 'expenses',
  'expnese': 'expenses',
  'proffit': 'profit',
  'proift': 'profit',
  'anomoly': 'anomaly',
  'anomly': 'anomaly',
  'avg': 'average'
};

function performFuzzyCorrection(rawInput: string): { corrected: string; correctedWords: string[]; hasCorrections: boolean } {
  const words = rawInput.split(/\s+/);
  let hasCorrections = false;
  const correctedWords = words.map(word => {
    const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
    if (ANALYTICS_DICTIONARY[cleanWord]) {
      hasCorrections = true;
      // Preserve case approximate
      const corrected = ANALYTICS_DICTIONARY[cleanWord];
      return word.toLowerCase() === cleanWord ? corrected : corrected.toUpperCase();
    }
    return word;
  });
  return {
    corrected: correctedWords.join(' '),
    correctedWords,
    hasCorrections
  };
}

const sourceLabelMap: Record<string, string> = {
  dashboard_dataset: "Dashboard Dataset",
  dashboard_definition: "Chart Data",
  knowledge_base: "Multi-Page KB",
  filters: "Active Filters",
  screenshot: "Screenshot",
  external_knowledge: "External Knowledge"
};

const STARTER_QUESTIONS = [
  "Summarize this dashboard",
  "Identify top performers",
  "Are there any anomalies?",
  "What is the overall trend?"
];

export function AnalystView() {
  const { 
    ingestedDashboard, setIngestedDashboard, 
    savedIngestedDashboards, loadSavedIngestedDashboards, deleteIngestedDashboard, saveIngestedDashboard,
    activeSpotlight, setActiveSpotlight,
    lastIntentCorrection, setLastIntentCorrection,
    watchlistQuestions, addToWatchlist, removeFromWatchlist,
    answerLanguage, setAnswerLanguage,
    currentPayload, attachedDataset
  } = useAppStore();

  const isScreenshotOnly = !!(ingestedDashboard && 
    !ingestedDashboard.knowledgeBase && 
    (!attachedDataset || !currentPayload));

  const [isUploading, setIsUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isUrlIngesting, setIsUrlIngesting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  
  // Custom Multi-Step Ingestion feedback
  const [ingestProgressStep, setIngestProgressStep] = useState(0);
  const [ingestCapturedCount, setIngestCapturedCount] = useState(0);

  // Auth Protection states
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [sessionCookiesJson, setSessionCookiesJson] = useState('');

  // Q&A / Compare states
  const [comparedDashboard, setComparedDashboard] = useState<any>(null);
  const [showComparePicker, setShowComparePicker] = useState(false);
  const [qaInput, setQaInput] = useState('');
  const [chatHistory, setChatHistory] = useState<any[]>(ingestedDashboard?.qaHistory || []);
  const [activeAnnotations, setActiveAnnotations] = useState<any[]>([]);
  const [selectedCaptureIndex, setSelectedCaptureIndex] = useState<number>(0);

  useEffect(() => {
    if (activeAnnotations && activeAnnotations.length > 0) {
      const firstAnn = activeAnnotations[0];
      if (typeof firstAnn.captureIndex === 'number') {
        setSelectedCaptureIndex(firstAnn.captureIndex);
      }
    }
  }, [activeAnnotations]);
  const [isChatListening, setIsChatListening] = useState(false);
  const [isChatResponding, setIsChatResponding] = useState(false);

  // Mobile and PWA segment toggle state
  const [mobileSubTab, setMobileSubTab] = useState<'canvas' | 'chat'>('canvas');

  // Navigable live dashboard view controls inside analyst desk
  const [viewMode, setViewMode] = useState<'snapshot' | 'interactive' | 'knowledge_base'>('snapshot');
  const [activeKbPageIndex, setActiveKbPageIndex] = useState(0);
  
  // Provider check
  const [providerError, setProviderError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(data => {
        if (!data.provider || !data.provider.toLowerCase().includes('gemini')) {
          setProviderError("Analyst tab requires a Gemini API key. Please add 'GEMINI_API_KEY' to your Secrets in the AI Studio Settings panel.");
        }
      })
      .catch(e => console.error("Health check failed", e));
  }, []);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgLayout, setImgLayout] = useState<{ imgLeft: number; imgTop: number; imgW: number; imgH: number } | null>(null);

  const recomputeOverlayMetrics = () => {
    const img = imgRef.current;
    if (!img) return;
    const { naturalWidth, naturalHeight, width, height } = img;
    if (!naturalWidth || !naturalHeight) return;

    const renderedRatio = width / height;
    const naturalRatio = naturalWidth / naturalHeight;
    let imgLeft = 0, imgTop = 0, imgW = width, imgH = height;
    
    if (renderedRatio > naturalRatio) {
      imgW = height * naturalRatio;
      imgLeft = (width - imgW) / 2;
    } else {
      imgH = width / naturalRatio;
      imgTop = (height - imgH) / 2;
    }
    setImgLayout({ imgLeft, imgTop, imgW, imgH });
  };

  // Setup ResizeObserver for image resizing
  useEffect(() => {
    if (!imgRef.current) return;
    const observer = new ResizeObserver(() => recomputeOverlayMetrics());
    observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [viewMode, ingestedDashboard?.id]);
  const [filterState, setFilterState] = useState<ActiveFilterState>({ selectedCategories: {} });
  const [activeTab, setActiveTab ] = useState<string>('');
  const [chartPalette] = useState(() => {
    try {
      return localStorage.getItem('dash_dost_chart_palette') || 'professional';
    } catch {
      return 'professional';
    }
  });

  // Export report options state
  const [showExportMenu, setShowExportMenu] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSavedIngestedDashboards();
  }, []);

  // Sync stateful chat history when active ingested dashboard changes
  useEffect(() => {
    setChatHistory(ingestedDashboard?.qaHistory || []);
    setActiveAnnotations([]);
    setActiveSpotlight(null);
    if (ingestedDashboard) {
      if (ingestedDashboard.url === 'uploaded-screenshot') {
        setViewMode('snapshot');
      } else {
        setViewMode('interactive');
        if (currentPayload) {
          const tabs = Array.from(new Set((currentPayload.components || []).map(c => c.tab).filter(Boolean))) as string[];
          if (tabs.length > 0 && !activeTab) {
            setActiveTab(tabs[0]);
          }
        }
      }
    }
  }, [ingestedDashboard]);

  // Sync scroll to chat bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isChatResponding]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setIngestError(null);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;

        const response = await fetch('/api/ingest-screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mimeType: file.type })
        });

        const data = await response.json();

        if (data.success) {
          const newDashboard = {
            id: Date.now().toString(),
            url: 'uploaded-screenshot',
            screenshotBase64: base64,
            structuredReport: data.report || {},
            ingestedAt: new Date().toISOString(),
            qaHistory: [],
          };
          await saveIngestedDashboard(newDashboard as any);
          setIngestedDashboard(newDashboard as any);
          setChatHistory([]);
          setActiveAnnotations([]);
          setActiveSpotlight(null);
          setLastIntentCorrection(null);
        } else {
          setIngestError(data.error || "Failed to process screenshot.");
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error(err);
      setIngestError(err.message || 'Failed to upload screenshot.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleUrlIngest = async (creds?: any) => {
    if (!urlInput.trim()) return;
    setIsUrlIngesting(true);
    setIngestError(null);
    setIngestProgressStep(0);
    setIngestCapturedCount(0);

    // Timed progression simulation for premium UX steps
    const timer1 = setTimeout(() => setIngestProgressStep(1), 2500); // Navigation complete
    const timer2 = setTimeout(() => setIngestProgressStep(2), 5000); // Structure analyzed
    const scrollInterval = setInterval(() => {
      setIngestCapturedCount(prev => Math.min(prev + 1, 4));
    }, 2000);
    const timer3 = setTimeout(() => setIngestProgressStep(3), 11000); // Synthesizing coordinates
    const timer4 = setTimeout(() => setIngestProgressStep(4), 16000); // Synthesizing reports

    try {
      const parsedCookies = sessionCookiesJson.trim() ? JSON.parse(sessionCookiesJson.trim()) : null;

      // 1. Ingest URL (Wait for Puppeteer with scroll segments and optional auth injection)
      const ingestRes = await fetch('/api/ingest-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: urlInput,
          credentials: creds || null,
          sessionCookies: parsedCookies
        })
      });
      const ingestData = await ingestRes.json();
      
      clearInterval(scrollInterval);
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);

      if (!ingestRes.ok) {
        throw new Error(ingestData.error || "Could not read dashboard URL");
      }

      // Check if URL returned Auth modal signal
      if (ingestData.requiresAuth) {
        setShowAuthModal(true);
        setIsUrlIngesting(false);
        return;
      }

      setIngestProgressStep(4);

      if (ingestData.success && ingestData.fullPageScreenshotBase64) {
        // 2. Pass screenshot back directly to our existing screenshot visual analysis
        const analyzeRes = await fetch('/api/ingest-screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            imageBase64: ingestData.fullPageScreenshotBase64, 
            mimeType: 'image/png',
            captures: ingestData.captures,
            domTextData: ingestData.domTextData,
            svgData: ingestData.svgData
          })
        });
        const analyzeData = await analyzeRes.json();
        
        if (analyzeData.success) {
          const newDashboard = {
            id: Date.now().toString(),
            url: urlInput,
            screenshotBase64: ingestData.fullPageScreenshotBase64,
            structuredReport: analyzeData.report || {},
            ingestedAt: new Date().toISOString(),
            qaHistory: [],
            captures: ingestData.captures,
            tabsDetected: ingestData.tabsDetected,
            domTextData: ingestData.domTextData,
            svgData: ingestData.svgData,
            knowledgeBase: ingestData.knowledgeBase
          };
          await saveIngestedDashboard(newDashboard as any);
          setIngestedDashboard(newDashboard as any);
          setChatHistory([]);
          setActiveAnnotations([]);
          setActiveSpotlight(null);
          setLastIntentCorrection(null);
          setShowAuthModal(false);
        } else {
          setIngestError(analyzeData.error || "Failed to analyze extracted dashboard screenshot.");
        }
      } else {
        setIngestError(ingestData.error || "Failed to fetch screenshot. Please check dashboard URL and access authorization.");
      }
    } catch (err: any) {
      console.error(err);
      setIngestError(err.message || "Network error loading URL");
    } finally {
      setIsUrlIngesting(false);
    }
  };

  const submitAuthAndContinue = () => {
    const creds = { username: authUsername, password: authPassword };
    handleUrlIngest(creds);
  };

  const buildDatasetContext = () => {
    if (!attachedDataset) return null;
    const maxRows = 400;
    const rows = attachedDataset.rows || [];
    const rowsTruncated = rows.length > maxRows;
    const cappedRows = rowsTruncated ? rows.slice(0, maxRows) : rows;
    return {
      fileName: attachedDataset.fileName || 'Attached Data',
      rowCount: attachedDataset.rowCount || rows.length,
      columns: attachedDataset.columns || [],
      rows: cappedRows,
      rowsTruncated,
      sheets: attachedDataset.sheets
    };
  };

  const buildDashboardDefinition = () => {
    if (!currentPayload) return null;
    return {
      title: currentPayload.title || '',
      subtitle: currentPayload.subtitle,
      tabOrder: currentPayload.tabOrder || [],
      filters: currentPayload.filters || [],
      components: (currentPayload.components || []).map((comp: any) => {
        const seriesData = comp.seriesData || [];
        const seriesTruncated = seriesData.length > 2000;
        const cappedSeries = seriesTruncated ? seriesData.slice(0, 500) : seriesData;
        return {
          id: comp.id,
          title: comp.title || '',
          type: comp.type,
          tab: comp.tab,
          description: comp.description,
          config: comp.config,
          seriesData: cappedSeries
        };
      })
    };
  };

  const promoteSuggestedChart = (messageIdx: number, answerIdx: number) => {
    const updatedHistory = [...chatHistory];
    const msg = { ...updatedHistory[messageIdx] };
    if (msg.answers && msg.answers[answerIdx]) {
      const sub = { ...msg.answers[answerIdx] };
      if (sub.suggestedChart) {
        sub.inlineChart = sub.suggestedChart;
        sub.suggestedChart = null;
        msg.answers = [...msg.answers];
        msg.answers[answerIdx] = sub;
        updatedHistory[messageIdx] = msg;
        setChatHistory(updatedHistory);
        if (ingestedDashboard) {
          setIngestedDashboard({ ...ingestedDashboard, qaHistory: updatedHistory });
        }
      }
    }
  };

  const handleAskQuestion = async (overrideInput?: string) => {
    const textToSubmit = overrideInput || qaInput;
    if (!textToSubmit.trim() || !ingestedDashboard) return;

    const rawMsg = textToSubmit.trim();
    
    // Fuzzy intent matching spelling correction
    const fuzzy = performFuzzyCorrection(rawMsg);
    let finalQuery = rawMsg;
    if (fuzzy.hasCorrections) {
      finalQuery = fuzzy.corrected;
      setLastIntentCorrection({ original: rawMsg, corrected: fuzzy.corrected });
    } else {
      setLastIntentCorrection(null);
    }

    const newMsg = { id: Date.now().toString(), role: 'user', content: rawMsg, timestamp: new Date().toISOString() };
    const nextHistory = [...chatHistory, newMsg];
    setChatHistory(nextHistory);
    setIngestedDashboard({ ...ingestedDashboard, qaHistory: nextHistory });
    setQaInput('');
    setIsChatResponding(true);

    try {
      const response = await fetch('/api/analyst-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: finalQuery, 
          intelligenceReport: ingestedDashboard.structuredReport,
          intelligenceReportB: comparedDashboard ? comparedDashboard.structuredReport : null,
          conversationHistory: chatHistory,
          language: answerLanguage,
          // Support high fidelity verification using original screenshot visual context
          screenshots: ingestedDashboard.captures?.length ? ingestedDashboard.captures : [{ captureIndex: 0, imageBase64: ingestedDashboard.screenshotBase64 }],
          screenshotsB: comparedDashboard ? (comparedDashboard.captures?.length ? comparedDashboard.captures : [{ captureIndex: 0, imageBase64: comparedDashboard.screenshotBase64 }]) : null,
          knowledgeBase: ingestedDashboard.knowledgeBase,
          datasetContext: buildDatasetContext(),
          dashboardDefinition: buildDashboardDefinition(),
          activeFilterState: filterState
        })
      });

      const data = await response.json();
      if (data.success) {
        const responseMsg = {
          id: (Date.now() + 1).toString(),
          role: 'analyst',
          content: data.answerText,
          timestamp: new Date().toISOString(),
          annotationBoxes: data.annotationBoxes || [],
          sourceElements: data.sourceElements || [],
          suggestedFollowUps: data.suggestedFollowUps || [],
          answerType: data.answerType || 'explanation',
          kpiSpotlight: data.kpiSpotlight || null,
          miniChartData: data.miniChartData || null,
          sourcesUsed: data.sourcesUsed || [],
          externalContext: data.externalContext || null,
          answers: data.answers || [],
          headline: data.headline || "",
          contextExplanation: data.contextExplanation || ""
        };
        const finalHistory = [...nextHistory, responseMsg];
        setChatHistory(finalHistory);
        setIngestedDashboard({ ...ingestedDashboard, qaHistory: finalHistory });
        
        if (data.annotationBoxes) {
          setActiveAnnotations(data.annotationBoxes);
        } else {
          setActiveAnnotations([]);
        }

        // Activate Answer Spotlight
        if (data.answerType === 'single_kpi' && data.kpiSpotlight) {
          setActiveSpotlight(data.kpiSpotlight);
        } else {
          setActiveSpotlight(null);
        }
      } else {
        const errorMsg = {
          id: (Date.now() + 1).toString(),
          role: 'analyst',
          content: data.error || 'Failed to analyze question.',
          timestamp: new Date().toISOString()
        };
        setChatHistory([...nextHistory, errorMsg]);
      }
    } catch (err: any) {
      console.error(err);
      const errorMsg = {
        id: (Date.now() + 1).toString(),
        role: 'analyst',
        content: err.message || 'Network error.',
        timestamp: new Date().toISOString()
      };
      setChatHistory([...nextHistory, errorMsg]);
    } finally {
      setIsChatResponding(false);
    }
  };

  const deleteChatMessage = (index: number) => {
    const nextHistory = chatHistory.filter((_, i) => i !== index);
    setChatHistory(nextHistory);
    if (ingestedDashboard) {
      setIngestedDashboard({ ...ingestedDashboard, qaHistory: nextHistory });
    }
  };

  // Browser Web Speech recognition
  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Native Voice recognition not supported in this browser viewport.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = answerLanguage === 'hi' ? 'hi-IN' : 'en-IN';
    recognition.continuous = false;
    
    recognition.onstart = () => {
      setIsChatListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQaInput(transcript);
    };

    recognition.onend = () => {
      setIsChatListening(false);
    };

    recognition.onerror = () => {
      setIsChatListening(false);
    };

    recognition.start();
  };


  // Export report helpers
  const exportReport = (type: 'json' | 'csv' | 'summary') => {
    if (!ingestedDashboard) return;
    const report = ingestedDashboard.structuredReport;

    if (type === 'json') {
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.dashboardTitle || 'Dashboard'}_intelligence_report.json`;
      a.click();
    } else if (type === 'csv') {
      // Build flattened CSV
      const headers = ['elementId', 'elementType', 'title', 'location', 'primaryValue', 'trend', 'confidence'];
      const rows = (report.elements || []).map((el: any) => [
        el.elementId || '',
        el.elementType || '',
        el.title || '',
        el.location || '',
        el.extractedValues?.primaryValue || '',
        el.extractedValues?.trendValue || '',
        (el.confidenceScore || 0) * 100
      ]);
      const csvStr = [headers.join(','), ...rows.map((r: any) => r.map((cell: any) => `"${cell}"`).join(','))].join('\n');
      const blob = new Blob([csvStr], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.dashboardTitle || 'Dashboard'}_extracted_metrics.csv`;
      a.click();
    } else {
      // text summary
      const text = `Dashboard Intelligence Summary: ${report.dashboardTitle || 'Untitled Dashboard'}\n` +
                   `Reporting Period: ${report.reportingPeriod || 'N/A'}\n` +
                   `Topline Insight: ${report.toplineInsight || 'N/A'}\n\n` +
                   `Critical Alerts:\n${(report.criticalAlerts || []).map((a: string) => `- ${a}`).join('\n')}\n\n` +
                   `Extracted KPI Metrics:\n` +
                   (report.elements || []).filter((e: any) => e.elementType === 'kpi_card').map((e: any) => 
                     `- ${e.title || 'KPI'}: ${e.extractedValues?.primaryValue || 'N/A'} (${e.extractedValues?.trendValue || 'No trend'})`
                   ).join('\n');
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.dashboardTitle || 'Dashboard'}_narrative_report.txt`;
      a.click();
    }
    setShowExportMenu(false);
  };

  // Dismiss Spotlight KPI Countdown
  const handleDismissSpotlight = () => {
    setActiveSpotlight(null);
  };

  // Direct snapshot selector picker for compared dashboard (Dashboard B)
  const selectDashboardB = async (snapId: string) => {
    const fullSnap = await get(`ingested_dash_${snapId}`);
    if (fullSnap) {
      setComparedDashboard(fullSnap);
    }
    setShowComparePicker(false);
  };

  // Render Spotlight Countdown Widget
  const SpotlightCountdownWidget = ({ spotlight }: { spotlight: any }) => {
    const [secondsLeft, setSecondsLeft] = useState(10);
    const progressPercent = (secondsLeft / 10) * 100;

    useEffect(() => {
      const interval = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            handleDismissSpotlight();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }, [spotlight]);

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="relative overflow-hidden rounded-3xl bg-slate-950 border border-amber-500/35 p-6 text-white shadow-[0_0_30px_-5px_rgba(245,158,11,0.2)] md:p-8 space-y-4"
      >
        {/* Upper metadata row */}
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest font-black text-amber-400 font-mono flex items-center gap-1.5 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>Spotlight Metric</span>
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-slate-400 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800/80">
              Active Focus
            </span>
            <button 
              onClick={handleDismissSpotlight} 
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Big visual number and label */}
        <div className="space-y-1">
          <span className="text-xs sm:text-sm font-sans font-semibold text-slate-400">
            {spotlight.label || "Target Metric"}
          </span>
          <div className="text-5xl sm:text-6xl font-black text-white tracking-tight leading-none mt-1.5 flex items-baseline gap-2">
            <span className="bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
              {spotlight.value}
            </span>
            {spotlight.trend && (
              <span className={`text-base sm:text-lg font-bold flex items-center gap-0.5 px-2 py-0.5 rounded-full ${
                spotlight.trend === 'up' ? 'text-emerald-400 bg-emerald-950/40' : 
                spotlight.trend === 'down' ? 'text-rose-400 bg-rose-950/40' : 'text-slate-400 bg-slate-900'
              }`}>
                {spotlight.trend === 'up' ? '↑' : spotlight.trend === 'down' ? '↓' : '•'}
              </span>
            )}
          </div>
        </div>

        {/* Rich explanation & verification details */}
        {spotlight.context && (
          <div className="border-t border-slate-900 pt-4 space-y-3">
            <p className="text-sm sm:text-base text-slate-200 leading-relaxed font-sans whitespace-pre-line font-medium">
              {spotlight.context}
            </p>
            
            {spotlight.sourceElementTitle && (
              <div className="text-xs text-indigo-400/90 font-medium flex items-center gap-1.5 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/15 w-fit">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
                <span>Verified Position: <strong className="font-semibold underline">{spotlight.sourceElementTitle}</strong></span>
              </div>
            )}
          </div>
        )}

        {/* Depleting progress timer card bar */}
        <div className="absolute bottom-0 left-0 h-1 bg-slate-800 w-full">
          <div 
            className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-orange-500 transition-all duration-1000 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </motion.div>
    );
  };

  if (!ingestedDashboard) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-[#0A0A0F] relative overflow-y-auto">
        {providerError && (
          <div className="absolute top-0 left-0 w-full z-[100] bg-rose-500 text-white text-xs font-bold text-center py-2 px-4 shadow-lg flex items-center justify-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {providerError}
          </div>
        )}
        {/* Full-Page Ingestion Steps Overlay Sheet */}
        <AnimatePresence>
          {isUrlIngesting && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#0A0A0F]/95 backdrop-blur-md z-50 flex items-center justify-center p-6 text-white"
            >
              <div className="max-w-md w-full space-y-8 text-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                  className="mx-auto w-16 h-16 rounded-full border-4 border-indigo-500 border-t-transparent shadow-[0_0_20px_rgba(99,102,241,0.2)]"
                />
                
                <div className="space-y-2">
                  <h2 className="text-2xl font-black tracking-tight">Accessing Dashboard Stream</h2>
                  <p className="text-slate-400 text-sm">Performing viewport scanning on the canvas instances.</p>
                </div>

                <div className="bg-[#111118] border border-slate-800 rounded-2xl p-5 text-left space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${ingestProgressStep >= 1 ? 'bg-emerald-400' : 'bg-indigo-500 animate-ping'}`} />
                      1. Establishing Secure Handshake
                    </span>
                    {ingestProgressStep >= 1 ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <span className="text-xs font-mono text-slate-500">Connecting...</span>}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${ingestProgressStep >= 2 ? 'bg-emerald-400' : ingestProgressStep === 1 ? 'bg-indigo-500 animate-ping' : 'bg-slate-700'}`} />
                      2. Analyzing Layout Structure
                    </span>
                    {ingestProgressStep >= 2 ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : ingestProgressStep === 1 ? <span className="text-xs font-mono text-slate-500 text-indigo-400">Inspecting DOM...</span> : null}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${ingestProgressStep >= 3 ? 'bg-emerald-400' : ingestProgressStep === 2 ? 'bg-indigo-500 animate-ping' : 'bg-slate-700'}`} />
                      3. Multi-Scroll Capture Protocol
                    </span>
                    {ingestProgressStep >= 3 ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : ingestProgressStep === 2 ? (
                      <span className="text-xs font-mono text-slate-400">Captured {ingestCapturedCount}/4 viewports...</span>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${ingestProgressStep >= 4 ? 'bg-emerald-400' : ingestProgressStep === 3 ? 'bg-indigo-500 animate-ping' : 'bg-slate-700'}`} />
                      4. Formulating Structured Intelligence
                    </span>
                    {ingestProgressStep >= 4 ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : ingestProgressStep === 3 ? <span className="text-xs font-mono text-indigo-400">AI DeepReading...</span> : null}
                  </div>
                </div>

                <p className="text-xs font-mono text-indigo-400 leading-snug">Multi-scroll is mapping lazy-loaded frames. Takes around 15–20s.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Auth protection Modal overlay popup (BUG-09) */}
        <AnimatePresence>
          {showAuthModal && (
            <div className="fixed inset-0 bg-[#09090b]/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 text-slate-900 dark:text-white">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="max-w-md w-full bg-white dark:bg-[#111118] border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-6"
              >
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/20 text-amber-500 dark:text-amber-400">
                    <Lock className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">🔐 Security Authentication Form</h3>
                    <p className="text-slate-500 dark:text-zinc-500 text-xs">Pasted URL requires an active login session.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-400 font-mono mb-1.5">Username / Email</label>
                    <input 
                      type="text"
                      value={authUsername}
                      onChange={e => setAuthUsername(e.target.value)}
                      placeholder="Enter dashboard email username"
                      className="w-full px-4 py-2.5 text-sm border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-slate-50 dark:bg-zinc-950 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-400 font-mono mb-1.5">Secret Password</label>
                    <input 
                      type="password"
                      value={authPassword}
                      onChange={e => setAuthPassword(e.target.value)}
                      placeholder="••••••••••••••"
                      className="w-full px-4 py-2.5 text-sm border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-slate-50 dark:bg-zinc-950 dark:text-white"
                    />
                  </div>

                  <details className="text-xs text-slate-400 group">
                    <summary className="cursor-pointer hover:text-slate-700 transition-colors uppercase tracking-wider font-extrabold font-mono text-xs">SSO Cookies Direct Import (Optional)</summary>
                    <div className="mt-2 space-y-1.5">
                      <p className="text-xs text-slate-500 dark:text-zinc-500">Paste cookie JSON objects list to proxy authenticated auth tokens.</p>
                      <textarea
                        rows={2}
                        value={sessionCookiesJson}
                        onChange={e => setSessionCookiesJson(e.target.value)}
                        placeholder='[{"name": "session", "value": "xyz123"}]'
                        className="w-full font-mono text-xs p-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-900 rounded-xl"
                      />
                    </div>
                  </details>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button 
                    onClick={() => setShowAuthModal(false)}
                    className="flex-1 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={submitAuthAndContinue}
                    className="flex-1 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-600 rounded-xl cursor-pointer"
                  >
                    Continue & Analyze →
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Default Landing Empty View */}
        <div className="max-w-2xl w-full text-center space-y-6">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl shadow-[0_4px_20px_rgba(99,102,241,0.15)]">
              <Search className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Dashboard Intelligence Analyst</h1>
          <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-lg mx-auto">
            Paste a URL or upload a dashboard capture. Grounded Answers are compiled visually, with source anchors highlighted instantly on your telemetry stream.
          </p>

          <div className="mt-8 space-y-6">
            <div className="flex flex-col sm:flex-row gap-2.5 max-w-lg mx-auto bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-2 shadow-sm">
              <input
                type="url"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleUrlIngest()}
                disabled={isUrlIngesting}
                placeholder="https://... (paste any dashboard portal URL)"
                className="flex-1 px-4 py-2.5 text-sm bg-transparent border-none text-slate-900 dark:text-white focus:outline-none"
              />
              <button
                onClick={() => handleUrlIngest()}
                disabled={isUrlIngesting || !urlInput.trim()}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                Analyze Dashboard →
              </button>
            </div>
            
            <div className="flex items-center justify-center gap-3 text-slate-400 dark:text-zinc-600 text-xs font-black uppercase tracking-widest">
              <div className="w-10 h-px bg-slate-200 dark:bg-zinc-800"></div>
              <span>OR</span>
              <div className="w-10 h-px bg-slate-200 dark:bg-zinc-800"></div>
            </div>

            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileUpload} 
            />
            
            <button
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center mx-auto gap-2.5 px-6 py-3 bg-white hover:bg-slate-50 dark:bg-zinc-900 dark:hover:bg-zinc-900 text-slate-800 dark:text-white border border-slate-200 dark:border-zinc-900 rounded-xl shadow-xs transition-all font-bold text-sm cursor-pointer"
            >
              <Upload className="w-4 h-4" /> Import Captured Snapshot
            </button>
            
            {ingestError && (
              <div className="max-w-lg mx-auto p-4 rounded-xl border border-rose-100 bg-rose-50/50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400 text-sm font-medium text-left flex gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold mb-1">Could not read dashboard target</h4>
                  <p className="text-xs opacity-90">{ingestError}</p>
                </div>
              </div>
            )}
            
            {savedIngestedDashboards.length > 0 && (
              <div className="pt-8 border-t border-slate-200 dark:border-zinc-900 mt-10 text-left">
                <h3 className="font-extrabold uppercase tracking-widest text-[#334155] dark:text-zinc-400 text-xs mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-500" /> Saved Dashboard Inventories
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {savedIngestedDashboards.slice(0, 6).map(snap => (
                    <div key={snap.id} className="group relative rounded-xl border border-slate-200 dark:border-zinc-900 bg-white dark:bg-zinc-900 p-3 hover:border-indigo-500/40 hover:shadow-lg transition-all">
                      <div 
                        className="w-full h-24 mb-3 bg-slate-50 dark:bg-zinc-800 rounded-lg overflow-hidden cursor-pointer"
                        onClick={async () => {
                           const fullSnap = await get(`ingested_dash_${snap.id}`);
                           if (fullSnap) setIngestedDashboard(fullSnap as any);
                        }}
                      >
                         {snap.thumbnailBase64 ? (
                           <img src={snap.thumbnailBase64} alt={snap.title} className="w-full h-full object-cover object-top opacity-85 group-hover:opacity-100 transition-opacity" />
                         ) : (
                           <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon className="w-8 h-8" /></div>
                         )}
                      </div>
                      <div className="flex justify-between items-start">
                         <div className="flex-1 min-w-0 pr-2">
                           <h4 className="font-bold text-slate-900 dark:text-zinc-100 truncate cursor-pointer hover:underline text-sm" onClick={async () => {
                             const fullSnap = await get(`ingested_dash_${snap.id}`);
                             if (fullSnap) setIngestedDashboard(fullSnap as any);
                           }}>{snap.title}</h4>
                           <p className="text-xs text-slate-400 dark:text-zinc-500 truncate mt-0.5">{snap.url !== 'uploaded-screenshot' ? snap.url : 'Imported Snapshot'}</p>
                           <p className="text-xs text-slate-400 dark:text-zinc-700 mt-1 font-mono tracking-wider uppercase font-bold">{new Date(snap.ingestedAt).toLocaleDateString()}</p>
                         </div>
                         <button onClick={() => deleteIngestedDashboard(snap.id)} className="p-1.5 text-slate-300 hover:text-rose-500 dark:text-zinc-700 dark:hover:text-rose-400 hover:bg-slate-50 dark:hover:bg-zinc-800 rounded-md cursor-pointer">
                           <Trash2 className="w-3.5 h-3.5" />
                         </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0 bg-[#0A0A0F] text-white relative">
      {providerError && (
        <div className="absolute top-0 left-0 w-full z-[100] bg-rose-500 text-white text-xs font-bold text-center py-2 px-4 shadow-lg flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {providerError}
        </div>
      )}

      {/* Mobile-Friendly Sub-tab Navigation for PWA / Mobile devices */}
      <div className="lg:hidden flex border-b border-zinc-800/80 bg-[#0c0c14] sticky top-0 z-40 p-2 gap-2 select-none shrink-0 w-full">
        <button
          onClick={() => setMobileSubTab('canvas')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl text-xs font-black tracking-wide transition-all ${
            mobileSubTab === 'canvas'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
              : 'text-slate-400 bg-slate-900/40 border border-slate-800/40 hover:bg-slate-900/60'
          }`}
        >
          <ImageIcon className="w-4 h-4 shrink-0" />
          <span>📊 DASHBOARD VIEW</span>
        </button>
        <button
          onClick={() => setMobileSubTab('chat')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl text-xs font-black tracking-wide transition-all ${
            mobileSubTab === 'chat'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
              : 'text-slate-400 bg-slate-900/40 border border-slate-800/40 hover:bg-slate-900/60'
          }`}
        >
          <MessageSquare className="w-4 h-4 shrink-0" />
          <span>💬 COGNITIVE CHAT</span>
        </button>
      </div>

      {/* Compare modal side-by-side snapshot picker dialog (F9.5) */}
      <AnimatePresence>
        {showComparePicker && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 text-white"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold">Select Dashboard B for side-by-side comparison</h3>
                <button onClick={() => setShowComparePicker(false)} className="p-1 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>

              <div className="grid grid-cols-2 gap-4 max-h-[350px] overflow-y-auto p-1 custom-scrollbar">
                {savedIngestedDashboards.filter(s => s.id !== ingestedDashboard.id).map(snap => (
                  <div 
                    key={snap.id}
                    onClick={() => selectDashboardB(snap.id)}
                    className="border border-slate-800 hover:border-indigo-500 bg-slate-950 rounded-xl p-3 cursor-pointer transition-all hover:scale-[1.02]"
                  >
                    <div className="h-20 bg-slate-800 rounded-lg overflow-hidden mb-2">
                      {snap.thumbnailBase64 && (
                        <img src={snap.thumbnailBase64} alt={snap.title} className="w-full h-full object-cover object-top" />
                      )}
                    </div>
                    <div className="font-bold text-xs truncate">{snap.title}</div>
                    <div className="text-xs text-slate-500 truncate">{snap.url}</div>
                  </div>
                ))}
                {savedIngestedDashboards.filter(s => s.id !== ingestedDashboard.id).length === 0 && (
                  <p className="col-span-2 text-center py-8 text-xs text-slate-400">No other parsed snapshots available. Please ingest additional URL profiles first.</p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* LEFT: Image Viewer (60% width) */}
      <div className={`border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-950 p-4 overflow-auto relative w-full lg:w-3/5 ${comparedDashboard ? 'lg:w-3/4 md:flex-row gap-4' : ''} ${mobileSubTab === 'canvas' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'}`}>
        
        {/* Main Canvas View (Dashboard A) */}
        <div className={`relative inline-block w-full ${comparedDashboard ? 'lg:w-1/2' : ''}`}>
          
          <div className="mb-4 font-semibold text-slate-700 dark:text-zinc-300 flex justify-between items-center bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-800 flex-wrap gap-2 shadow-xs">
            <span className="text-xs uppercase tracking-wider font-extrabold font-mono text-[#334155] dark:text-zinc-400">
              {comparedDashboard ? '📊 Current (Dashboard A)' : '📊 Dashboard Visual Layout'}
            </span>

            {/* Ingestion Status Badge (F3) */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg border bg-emerald-50 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                 title="Ingestion Complete: Dashboard parsed & queryable.">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Ingested Successfully</span>
            </div>

            {/* View Mode Switcher */}
            <div className="flex bg-slate-100 dark:bg-zinc-950 p-1 rounded-xl border border-slate-200/50 dark:border-zinc-800 select-none shrink-0 font-bold">
              {ingestedDashboard.url === 'uploaded-screenshot' ? (
                <div className="px-3 py-1 text-xs bg-indigo-600 text-white rounded-lg flex items-center gap-1.5 font-extrabold uppercase tracking-wide">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>📷 Snapshot Images</span>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setViewMode('snapshot')}
                    className={`px-3 py-1 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 rounded-lg ${
                      viewMode === 'snapshot'
                        ? 'bg-indigo-600 text-white shadow-xs font-black'
                        : 'text-slate-500 hover:text-[#334155] dark:text-zinc-400 dark:hover:text-zinc-200'
                    }`}
                    title="View original scanned telemetry screenshot image"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>📸 Snapshot</span>
                  </button>
                  <button
                    onClick={() => {
                      setViewMode('interactive');
                      if (currentPayload) {
                        const tabs = Array.from(new Set((currentPayload.components || []).map(c => c.tab).filter(Boolean))) as string[];
                        if (tabs.length > 0 && !activeTab) {
                          setActiveTab(tabs[0]);
                        }
                      }
                    }}
                    className={`px-3 py-1 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 rounded-lg ${
                      viewMode === 'interactive'
                        ? 'bg-indigo-600 text-white shadow-xs font-black'
                        : 'text-slate-500 hover:text-[#334155] dark:text-zinc-400 dark:hover:text-zinc-200'
                    }`}
                    title="View actual live navigable dashboard builder model"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>⚡ Interactive</span>
                  </button>
                  {ingestedDashboard.knowledgeBase && (
                    <button
                      onClick={() => setViewMode('knowledge_base')}
                      className={`px-3 py-1 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 rounded-lg ${
                        viewMode === 'knowledge_base'
                          ? 'bg-indigo-600 text-white shadow-xs font-black'
                          : 'text-slate-500 hover:text-[#334155] dark:text-zinc-400 dark:hover:text-zinc-200'
                      }`}
                      title="View crawled multi-page database knowledge base"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>🗂️ Knowledge Base</span>
                    </button>
                  )}
                </>
              )}
            </div>

            <button 
              onClick={() => {
                setIngestedDashboard(null);
                setComparedDashboard(null);
                setActiveSpotlight(null);
                setMobileSubTab('canvas');
              }} 
              className="px-2.5 py-1 text-xs font-black text-rose-500 hover:text-white hover:bg-rose-600 bg-rose-50 dark:bg-rose-950/15 border border-rose-200 dark:border-rose-900/30 rounded-lg cursor-pointer transition-all flex items-center gap-1.5 shrink-0"
              title="Close current active dashboard analysis and return to the URL selector"
            >
              <X className="w-4 h-4 shrink-0" />
              <span>Close Analysis</span>
            </button>
          </div>

          {viewMode === 'snapshot' ? (
            <div className="flex flex-col border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
              {ingestedDashboard.captures && ingestedDashboard.captures.length > 1 && (
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800 text-xs text-slate-600 dark:text-zinc-300">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">Active Ingested Viewport:</span>
                    <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 font-mono text-[10px] uppercase tracking-wider font-extrabold text-slate-700 dark:text-zinc-300">
                      Page {ingestedDashboard.captures[selectedCaptureIndex]?.pageNumber || 1} (Scroll {ingestedDashboard.captures[selectedCaptureIndex]?.scrollPosition || 0}px)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSelectedCaptureIndex(prev => Math.max(0, prev - 1))}
                      disabled={selectedCaptureIndex === 0}
                      className="p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 disabled:opacity-40 cursor-pointer transition-colors"
                      title="Previous segment image"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="font-mono font-black">
                      {selectedCaptureIndex + 1} / {ingestedDashboard.captures.length}
                    </span>
                    <button
                      onClick={() => setSelectedCaptureIndex(prev => Math.min(ingestedDashboard.captures.length - 1, prev + 1))}
                      disabled={selectedCaptureIndex === ingestedDashboard.captures.length - 1}
                      className="p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 disabled:opacity-40 cursor-pointer transition-colors"
                      title="Next segment image"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
              
              <div className="relative">
                <img 
                  ref={imgRef}
                  src={
                    (ingestedDashboard.captures && ingestedDashboard.captures.length > 0)
                      ? (ingestedDashboard.captures[selectedCaptureIndex]?.imageBase64 || ingestedDashboard.screenshotBase64)
                      : ingestedDashboard.screenshotBase64
                  } 
                  alt="Dashboard A screenshot" 
                  className="w-full object-contain" 
                  onLoad={recomputeOverlayMetrics}
                />
                
                {/* Visual Highlights overlays mapped to current active segment */}
                {activeAnnotations
                  .filter(ann => {
                    if (ingestedDashboard.captures && ingestedDashboard.captures.length > 1) {
                      const annCapIndex = typeof ann.captureIndex === 'number' ? ann.captureIndex : 0;
                      return annCapIndex === selectedCaptureIndex;
                    }
                    return true;
                  })
                  .map((ann, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="absolute border-2 rounded-lg pointer-events-none transition-all duration-500"
                      style={{
                        left: imgLayout ? imgLayout.imgLeft + (ann.boundingBox.x / 100) * imgLayout.imgW : `${ann.boundingBox.x}%`,
                        top: imgLayout ? imgLayout.imgTop + (ann.boundingBox.y / 100) * imgLayout.imgH : `${ann.boundingBox.y}%`,
                        width: imgLayout ? (ann.boundingBox.width / 100) * imgLayout.imgW : `${ann.boundingBox.width}%`,
                        height: imgLayout ? (ann.boundingBox.height / 100) * imgLayout.imgH : `${ann.boundingBox.height}%`,
                        borderColor: ann.highlightColor || '#22c55e',
                        backgroundColor: `${ann.highlightColor || '#22c55e'}12`,
                        boxShadow: `0 0 15px ${ann.highlightColor || '#22c55e'}`
                      }}
                    >
                      <div 
                        className="absolute -top-7 left-0 px-2.5 py-1 rounded-md text-xs font-mono tracking-wider font-extrabold text-white whitespace-nowrap shadow-md uppercase"
                        style={{ backgroundColor: ann.highlightColor || '#22c55e' }}
                      >
                        {ann.label || "Visual focus anchor"}
                      </div>
                    </motion.div>
                  ))}
              </div>
            </div>
          ) : viewMode === 'knowledge_base' ? (
            <div className="flex flex-col md:flex-row gap-4 h-full min-h-[500px] bg-[#0c0c14] border border-slate-800/80 rounded-2xl p-4 text-white">
              {/* Pages Sidebar List */}
              <div className="w-full md:w-1/4 border-b md:border-b-0 md:border-r border-slate-800/50 pb-4 md:pb-0 pr-0 md:pr-4 flex flex-col gap-2">
                <div className="text-xs uppercase tracking-widest font-extrabold text-slate-400 font-mono mb-2">Discovered Pages</div>
                {ingestedDashboard.knowledgeBase?.pages.map((p, idx) => (
                  <button
                    key={p.pageId || idx}
                    onClick={() => setActiveKbPageIndex(idx)}
                    className={`text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                      activeKbPageIndex === idx
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
                    }`}
                  >
                    <Layers className="w-4 h-4 shrink-0 text-indigo-400" />
                    <span className="truncate">{p.pageName || `Tab ${idx + 1}`}</span>
                  </button>
                ))}
              </div>

              {/* Page Content View */}
              <div className="flex-1 overflow-y-auto space-y-6 max-h-[600px] custom-scrollbar pr-1">
                {(() => {
                  const activePage = ingestedDashboard.knowledgeBase?.pages[activeKbPageIndex];
                  if (!activePage) {
                    return <div className="text-center py-12 text-slate-500 text-xs font-mono">No active page found in knowledge base.</div>;
                  }

                  return (
                    <div className="space-y-6">
                      <div className="flex justify-between items-start border-b border-slate-800 pb-3">
                        <div>
                          <h3 className="text-lg font-black tracking-tight text-white">{activePage.pageName}</h3>
                          <p className="text-xs text-slate-500 mt-1">Structured semantic telemetry parsed via AI Crawler.</p>
                        </div>
                      </div>

                      {/* KPI Cards Grid */}
                      {activePage.kpis && activePage.kpis.length > 0 && (
                        <div>
                          <h4 className="text-xs uppercase tracking-widest font-extrabold text-indigo-400 font-mono mb-3">Extracted KPIs & Key Figures</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {activePage.kpis.map((kpi, kIdx) => (
                              <div key={kIdx} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                                <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">{kpi.title || 'KPI Metric'}</span>
                                <div className="text-2xl font-black mt-1.5 text-white">{kpi.value || 'N/A'}</div>
                                {(kpi.trend || kpi.unit) && (
                                  <div className="text-xs text-slate-500 mt-2 border-t border-slate-900/50 pt-1.5 flex items-center gap-1.5">
                                    <Sparkles className="w-3 h-3 text-indigo-400" />
                                    <span>{kpi.unit ? `Unit: ${kpi.unit}` : ''} {kpi.trend ? `(${kpi.trend})` : ''}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Charts Grid */}
                      {activePage.charts && activePage.charts.length > 0 && (
                        <div>
                          <h4 className="text-xs uppercase tracking-widest font-extrabold text-indigo-400 font-mono mb-3">Visualizations & Datasets</h4>
                          <div className="grid grid-cols-1 gap-4">
                            {activePage.charts.map((chart, cIdx) => (
                              <div key={cIdx} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                                <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300 font-mono">{chart.title || 'Chart Metrics'}</span>
                                  <span className="text-[10px] bg-indigo-950 text-indigo-400 px-2 py-0.5 rounded border border-indigo-900 uppercase font-mono font-bold">{chart.type || 'trend'}</span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                                  {(chart.metrics || []).map((m: string, mIdx: number) => {
                                    const matchingVal = chart.values?.[0]?.[m] ?? 'Dataset';
                                    return (
                                      <div key={mIdx} className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-900">
                                        <div className="text-[10px] text-slate-500 font-mono truncate">{m}</div>
                                        <div className="text-sm font-black text-slate-200 mt-1">{String(matchingVal)}</div>
                                      </div>
                                    );
                                  })}
                                </div>
                                {chart.insights && (
                                  <div className="text-xs text-indigo-400/80 pt-2 border-t border-slate-900 leading-relaxed italic">
                                    💡 Insight: {chart.insights}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Tables Section */}
                      {activePage.tables && activePage.tables.length > 0 && (
                        <div>
                          <h4 className="text-xs uppercase tracking-widest font-extrabold text-indigo-400 font-mono mb-3">Tables & Tabular Data</h4>
                          <div className="space-y-4">
                            {activePage.tables.map((tbl, tIdx) => (
                              <div key={tIdx} className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                                <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800">
                                  <span className="text-xs font-extrabold text-slate-300 uppercase tracking-wider font-mono">{tbl.title || 'Table Matrix'}</span>
                                </div>
                                <div className="overflow-x-auto overflow-y-auto max-h-[300px]">
                                  <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                      <tr className="border-b border-slate-800 bg-slate-950 text-slate-400">
                                        {(tbl.headers || []).map((hdr: string, hIdx: number) => (
                                          <th key={hIdx} className="px-4 py-2 font-extrabold uppercase tracking-wider font-mono text-[10px]">{hdr}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(tbl.rows || []).map((row: any[], rIdx: number) => (
                                        <tr key={rIdx} className="border-b border-slate-900 hover:bg-slate-900/20">
                                          {row.map((cell: any, cIdx: number) => (
                                            <td key={cIdx} className="px-4 py-2.5 font-medium text-slate-300">{cell !== null && cell !== undefined ? String(cell) : '-'}</td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Filters Tag List */}
                      {activePage.filters && activePage.filters.length > 0 && (
                        <div>
                          <h4 className="text-xs uppercase tracking-widest font-extrabold text-indigo-400 font-mono mb-2">Available Page Filters</h4>
                          <div className="flex flex-wrap gap-2 pt-1">
                            {activePage.filters.map((flt, fIdx) => (
                              <div key={fIdx} className="bg-slate-900 border border-slate-800/80 px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs">
                                <span className="font-mono text-slate-500 font-bold uppercase">{flt.name}:</span>
                                <span className="text-indigo-300 font-semibold">{flt.options?.slice(0, 4).join(', ') || 'All'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            /* Interactive Live Navigable representation of dashboard payload (Zustand integrated) */
            <div className="space-y-4 h-full flex flex-col min-h-0">
              {!currentPayload ? (
                ingestedDashboard.url !== 'uploaded-screenshot' ? (
                  <div className="relative flex-1 w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-zinc-800 bg-[#f8fafc] dark:bg-[#0c0c14] shadow-sm min-h-[500px]">
                    <iframe 
                      src={ingestedDashboard.url} 
                      className="absolute inset-0 w-full h-full border-none"
                      title="Live Navigable Target"
                      sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                    />
                  </div>
                ) : (
                  <div className="p-8 text-center bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl space-y-4 shadow-sm min-h-[300px] flex flex-col items-center justify-center">
                    <Sparkles className="w-8 h-8 text-indigo-400 animate-pulse" />
                    <div>
                      <h4 className="font-extrabold text-sm text-[#334155] dark:text-zinc-200">Interactive Telemetry Builder offline</h4>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed max-w-sm mt-1.5">
                        No active custom builder session detected, and the uploaded source is a static image. Switch to Snapshot mode to view the static image.
                      </p>
                    </div>
                  </div>
                )
              ) : (
                <div className="space-y-4">
                  {/* Tab Selector */}
                  {currentPayload.components && Array.from(new Set(currentPayload.components.map(c => c.tab).filter(Boolean))).length > 1 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200 dark:border-zinc-800 select-none">
                      {Array.from(new Set(currentPayload.components.map(c => c.tab).filter(Boolean))).map((tName: any) => (
                        <button
                          key={tName}
                          onClick={() => setActiveTab(tName)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                            activeTab === tName
                              ? 'bg-indigo-600 text-white shadow-xs font-black'
                              : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-slate-200/50 dark:hover:bg-zinc-800/40'
                          }`}
                        >
                          {tName}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Filters Header Toolbox Panel inside Analyst workspace */}
                  {currentPayload.filters && currentPayload.filters.length > 0 && (
                    <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800/60 p-3 rounded-2xl shadow-xs">
                      <FiltersPanel
                        payload={currentPayload}
                        filterState={filterState}
                        onFilterStateChange={setFilterState}
                        onResetFilters={() => setFilterState({ selectedCategories: {} })}
                      />
                    </div>
                  )}

                  {/* Dynamic Navigable Grid Canvas Components */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch relative w-full">
                    {(currentPayload.components || [])
                      .filter(comp => !activeTab || comp.tab === activeTab)
                      .map((component) => {
                        const colSpanClass = component.layout?.lg === 12 
                          ? 'col-span-12' 
                          : component.layout?.lg === 6 
                            ? 'col-span-12 md:col-span-6' 
                            : component.layout?.lg === 4 
                              ? 'col-span-12 md:col-span-4' 
                              : `col-span-12 md:col-span-${component.layout?.lg || 3}`;

                        const filteredRows = attachedDataset?.rows 
                          ? filterComponentData(component, currentPayload.filters || [], filterState) 
                          : [];

                        // Highlight element rectangle if it corresponds to current active 10s spotlight KPI!
                        const isSpotlightTarget = activeSpotlight && (
                          activeSpotlight.sourceElementId === component.id ||
                          (activeSpotlight.sourceElementTitle && component.title?.toLowerCase() === activeSpotlight.sourceElementTitle.toLowerCase())
                        );

                        return (
                          <div key={component.id} className={`${colSpanClass} relative`}>
                            {isSpotlightTarget && (
                              <motion.div
                                animate={{ 
                                  scale: [0.99, 1.01, 0.99], 
                                  borderColor: ["#f59e0b", "#6366f1", "#f59e0b"],
                                  boxShadow: [
                                    "0 0 10px rgba(245, 158, 11, 0.4)",
                                    "0 0 20px rgba(99, 102, 241, 0.6)",
                                    "0 0 10px rgba(245, 158, 11, 0.4)"
                                  ]
                                }}
                                transition={{ repeat: Infinity, duration: 2 }}
                                className="absolute -inset-1 rounded-2xl border-4 z-10 pointer-events-none"
                              />
                            )}

                            <ChartWrapper
                              component={component}
                              filteredData={filteredRows}
                              colorPalette={chartPalette}
                              isFullscreen={false}
                              onEditComponent={() => {}}
                              onDeleteComponent={() => {}}
                              onToggleFullscreen={() => {}}
                              onDrillDown={(key, val) => {
                                const existingFilter = currentPayload.filters?.find(f => f.targetKeys.includes(key));
                                if (existingFilter) {
                                  setFilterState(prev => ({
                                    ...prev,
                                    selectedCategories: {
                                      ...prev.selectedCategories,
                                      [existingFilter.id]: [val]
                                    }
                                  }));
                                }
                              }}
                            />
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Comparison Canvas View (Dashboard B) */}
        {comparedDashboard && (
          <div className="relative inline-block w-full lg:w-1/2">
            <div className="mb-2 font-semibold text-slate-700 dark:text-zinc-300 flex justify-between items-center bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-900">
              <span className="text-xs uppercase tracking-wider font-extrabold font-mono text-[#334155] dark:text-zinc-400">📊 Reference Target (Dashboard B)</span>
              <button onClick={() => setComparedDashboard(null)} className="text-xs text-rose-500 hover:text-rose-600 font-bold uppercase tracking-wider font-mono bg-rose-500/10 px-2.5 py-1 rounded cursor-pointer">
                Remove comparison
              </button>
            </div>
            <div className="border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden bg-white dark:bg-zinc-950">
              <img src={comparedDashboard.screenshotBase64} alt="Dashboard B comparison screenshot" className="w-full object-contain" />
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: Chat & Analysis workspace (40% width) */}
      <div className={`w-full lg:w-2/5 flex-col bg-[#0A0A0F] border-t lg:border-t-0 lg:border-l border-slate-800 ${mobileSubTab === 'chat' ? 'flex' : 'hidden lg:flex'}`}>
        
        {/* Top Header toolbar options */}
        <div className="p-4 border-b border-zinc-900 flex items-center justify-between bg-zinc-950/40">
          <div>
            <h2 className="font-bold text-sm tracking-tight flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" /> 
              {comparedDashboard ? 'Multimodal Comparative Dialogue' : 'Telemetry Q&A Intelligence'}
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5 uppercase tracking-widest font-extrabold">Gemini Flash Reasoning</p>
          </div>

          <div className="flex items-center gap-1.5">
            {/* EN/HI Translation toggles (F9.7) */}
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 shrink-0">
              {(['en', 'hi', 'hi-en'] as const).map(l => (
                <button 
                  key={l}
                  onClick={() => setAnswerLanguage(l)}
                  className={`px-2 py-1 text-xs font-bold uppercase tracking-wider font-mono rounded cursor-pointer ${
                    answerLanguage === l ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {l === 'hi-en' ? 'Hin' : l}
                </button>
              ))}
            </div>

            {/* Compare trigger button (BUG-10 helper) */}
            {!comparedDashboard && (
              <button 
                onClick={() => setShowComparePicker(true)}
                className="p-2 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-lg hover:border-indigo-500/30 cursor-pointer text-xs"
                title="Select dashboard canvas reference to compare..."
              >
                <Clock className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Export intelligence results */}
            <div className="relative">
              <button 
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="p-2 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-lg cursor-pointer flex items-center gap-1"
                title="Export report metrics..."
              >
                <Download className="w-3.5 h-3.5" />
              </button>

              {showExportMenu && (
                <div className="absolute right-0 mt-1.5 w-40 bg-slate-900 border border-slate-800 rounded-xl py-1 shadow-2xl z-[80] text-left">
                  <button onClick={() => exportReport('json')} className="w-full flex items-center gap-2 px-3.5 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer select-none">
                    <FileText className="w-3.5 h-3.5" /> Export as JSON
                  </button>
                  <button onClick={() => exportReport('csv')} className="w-full flex items-center gap-2 px-3.5 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer select-none">
                    <FileText className="w-3.5 h-3.5" /> Export as CSV
                  </button>
                  <button onClick={() => exportReport('summary')} className="w-full flex items-center gap-2 px-3.5 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer select-none">
                    <FileText className="w-3.5 h-3.5" /> Export TXT summary
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chat Message Scroll frame containing Answer Spotlight & Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-950/60 leading-relaxed font-sans mt-0.5">
          
          {/* Snapshot-Only fallback warning banner */}
          {isScreenshotOnly && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-start gap-2.5 shadow-md">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <h5 className="font-bold text-amber-400 font-sans">Snapshot-Only Fallback Active</h5>
                <p className="text-amber-100/80 mt-1 leading-relaxed font-sans">
                  You are analyzing a static visual snapshot. Since no structured dataset or multi-page knowledge base is attached, AI reasoning is operating on visual context alone. Insights may be less precise or limited to what is visually legible.
                </p>
              </div>
            </div>
          )}
          
          {/* Active Highlight Spotlight widget */}
          <AnimatePresence>
            {activeSpotlight && (
              <div className="sticky top-0 z-30 pb-3 bg-gradient-to-b from-[#0A0A0F] to-transparent">
                <SpotlightCountdownWidget spotlight={activeSpotlight} />
              </div>
            )}
          </AnimatePresence>

          {/* Spell check correction suggestion banner */}
          <AnimatePresence>
            {lastIntentCorrection && (
              <motion.div 
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/20 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Languages className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-sans text-indigo-300">
                    Interpreted as: <strong className="font-bold underline text-white">"{lastIntentCorrection.corrected}"</strong>
                  </span>
                </div>
                <button 
                  onClick={() => {
                    setQaInput(lastIntentCorrection.original);
                    setLastIntentCorrection(null);
                  }}
                  className="text-xs uppercase font-mono font-extrabold tracking-wider bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-200 px-2 py-0.5 rounded cursor-pointer"
                >
                  Use original
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {chatHistory.map((msg, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} space-y-1 group`}
              >
                <div className="relative group flex items-start gap-2 w-full">
                  <div className={`rounded-2xl px-4 py-2.5 text-sm ${
                    msg.role === 'user' 
                      ? 'bg-indigo-600 text-white rounded-tr-xs max-w-[85%]' 
                      : 'bg-[#111118]/85 text-slate-100 border border-slate-800 rounded-tl-xs shadow-md w-full sm:max-w-xl'
                  }`}>
                    {/* If there are multiple segmented sub-answers, render them stacked nicely */}
                    {msg.role === 'analyst' && msg.answers && msg.answers.length > 1 ? (
                      <div className="space-y-4">
                        <div className="text-xs font-black uppercase tracking-wider text-indigo-400 mb-2 border-b border-indigo-950/40 pb-1.5 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Multi-Intent Q&A Insights</span>
                        </div>
                        {msg.answers.map((sub: any, sIdx: number) => (
                          <div key={sub.id || sIdx} className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/60 shadow-sm space-y-2">
                            {/* Sub-Question Header */}
                            {sub.questionText && (
                              <div className="text-[11px] font-sans font-bold text-slate-400 bg-slate-950/60 px-2 py-1 rounded-md inline-block max-w-full truncate">
                                <span className="text-indigo-400 mr-1">Q:</span> {sub.questionText}
                              </div>
                            )}
                            
                            {/* Headline (Direct answer) */}
                            {sub.headline && (
                              <h4 className="text-sm sm:text-base font-extrabold tracking-tight text-white mb-1 leading-snug">
                                {sub.headline}
                              </h4>
                            )}
                            
                            {/* Sub-Answer Text */}
                            <p className="whitespace-pre-line leading-relaxed font-sans text-slate-300 text-xs sm:text-sm">
                              {sub.contextExplanation || sub.answerText || sub.content}
                            </p>

                            {/* Optional KPI Spotlight inside sub-answer */}
                            {sub.kpiSpotlight && (
                              <div className="my-2 p-3.5 rounded-xl bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 border border-indigo-500/15 max-w-sm">
                                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">{sub.kpiSpotlight.label}</div>
                                <div className="text-2xl font-black text-slate-100 tracking-tight mt-1">{sub.kpiSpotlight.value}</div>
                                {sub.kpiSpotlight.trend && (
                                  <div className="flex items-center gap-1.5 text-xs mt-1.5 font-sans font-medium">
                                    <span className={sub.kpiSpotlight.isPositive !== false ? 'text-emerald-400' : 'text-rose-400'}>
                                      {sub.kpiSpotlight.trend}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Inline Chart */}
                            {sub.inlineChart && (
                              <InlineChatChart spec={sub.inlineChart} />
                            )}

                            {/* Suggested Chart Promo */}
                            {sub.suggestedChart && (
                              <div className="mt-2 p-2.5 rounded-lg bg-indigo-950/20 border border-indigo-900/30 flex items-center justify-between gap-3">
                                <div className="text-[11px] font-sans text-slate-400">
                                  <span className="font-semibold text-slate-300">📊 Chart Option Available:</span> {sub.suggestedChart.title}
                                </div>
                                <button
                                  onClick={() => promoteSuggestedChart(idx, sIdx)}
                                  className="shrink-0 text-[10px] font-sans font-bold uppercase tracking-wider bg-indigo-500 hover:bg-indigo-600 text-white px-2.5 py-1 rounded-md transition-colors"
                                >
                                  Show as Chart
                                </button>
                              </div>
                            )}

                            {/* Sub-Answer Sources Badge row */}
                            {sub.sourcesUsed && sub.sourcesUsed.length > 0 && (
                              <div className="flex items-center flex-wrap gap-1 text-[9px] font-mono tracking-wider text-slate-500 px-1 font-bold uppercase mt-1">
                                <span>Sources:</span>
                                {sub.sourcesUsed.map((srcKey: string, sSubIdx: number) => {
                                  const label = sourceLabelMap[srcKey] || srcKey;
                                  return (
                                    <span key={sSubIdx} className="bg-slate-950 border border-indigo-950 px-1 py-0.5 rounded-sm text-indigo-400">
                                      {label}
                                    </span>
                                  );
                                })}
                              </div>
                            )}

                            {/* Sub-Answer External Context */}
                            {sub.externalContext?.used && (
                              <div className="mt-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-[11px]">
                                <div className="flex items-center gap-1 font-bold mb-0.5 text-amber-400">
                                  <AlertTriangle className="w-3 h-3 shrink-0" />
                                  <span>External Knowledge {!sub.externalContext.verified && '(unverified)'}</span>
                                </div>
                                <p className="font-sans leading-relaxed text-amber-100/90">{sub.externalContext.summary}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* Fallback or single sub-answer rendering path */
                      <>
                        {msg.role === 'user' ? (
                          <p className="whitespace-pre-line leading-relaxed font-sans">{msg.content}</p>
                        ) : (
                          <div className="space-y-2">
                            {/* Headline (Direct answer) */}
                            {(msg.headline || msg.answers?.[0]?.headline) && (
                              <h4 className="text-sm sm:text-base font-extrabold tracking-tight text-white mb-1 leading-snug">
                                {msg.headline || msg.answers?.[0]?.headline}
                              </h4>
                            )}
                            
                            {/* Plain-language explanation */}
                            <p className="whitespace-pre-line leading-relaxed font-sans text-slate-300 text-xs sm:text-sm">
                              {msg.contextExplanation || msg.answers?.[0]?.contextExplanation || msg.content || msg.answerText}
                            </p>
                          </div>
                        )}

                        {/* Inline Chart for single answer */}
                        {msg.role === 'analyst' && msg.answers?.[0]?.inlineChart && (
                          <InlineChatChart spec={msg.answers[0].inlineChart} />
                        )}

                        {/* Suggested Chart Promo for single answer */}
                        {msg.role === 'analyst' && msg.answers?.[0]?.suggestedChart && (
                          <div className="mt-2.5 p-2.5 rounded-xl bg-indigo-950/20 border border-indigo-900/30 flex items-center justify-between gap-3">
                            <div className="text-xs font-sans text-slate-400">
                              <span className="font-semibold text-slate-300">📊 Chart Option Available:</span> {msg.answers[0].suggestedChart.title}
                            </div>
                            <button
                              onClick={() => promoteSuggestedChart(idx, 0)}
                              className="shrink-0 text-[10px] font-sans font-bold uppercase tracking-wider bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-md transition-colors"
                            >
                              Show as Chart
                            </button>
                          </div>
                        )}

                        {msg.role === 'analyst' && msg.externalContext?.used && (
                          <div className="mt-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs">
                            <div className="flex items-center gap-1.5 font-bold mb-1 text-amber-400">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span>External Knowledge {!msg.externalContext.verified && '(unverified)'}</span>
                            </div>
                            <p className="font-sans leading-relaxed text-amber-100/90">{msg.externalContext.summary}</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <button 
                    onClick={() => deleteChatMessage(idx)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-slate-800 self-center"
                  >
                    <Trash2 className="h-3 w-3 text-slate-500 hover:text-rose-400" />
                  </button>
                </div>

                {msg.role === 'analyst' && msg.sourceElements?.length > 0 && (
                  <div className="flex items-center gap-1 text-xs font-mono tracking-wider text-slate-500 px-1 font-bold uppercase">
                    <span>Citations:</span>
                    {msg.sourceElements.map((el: any, sIdx: number) => (
                      <span key={sIdx} className="bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded-sm text-indigo-400">
                        {el.elementTitle || el.dataType || "Widget Card"}
                      </span>
                    ))}
                  </div>
                )}

                {msg.role === 'analyst' && msg.sourcesUsed && msg.sourcesUsed.length > 0 && (
                  <div className="flex items-center flex-wrap gap-1 text-[10px] font-mono tracking-wider text-slate-500 px-1 font-bold uppercase mt-1">
                    <span>Sources Used:</span>
                    {msg.sourcesUsed.map((srcKey: string, sIdx: number) => {
                      const label = sourceLabelMap[srcKey] || srcKey;
                      return (
                        <span key={sIdx} className="bg-slate-900 border border-indigo-900/30 px-1.5 py-0.5 rounded-sm text-indigo-400">
                          {label}
                        </span>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ))}

            {isChatResponding && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-start space-y-2 max-w-[85%]"
              >
                <div className="bg-[#111118]/85 border border-[#1e1b4b]/50 rounded-2xl rounded-tl-xs px-4 py-3 shadow-md flex items-start gap-3 w-full">
                  <div className="relative mt-1 shrink-0">
                    <span className="flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500 bg-indigo-500"></span>
                    </span>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <div className="text-xs font-black uppercase tracking-widest text-indigo-400 font-mono flex items-center gap-2">
                      <span className="animate-pulse">Thinking</span>
                      <div className="flex gap-1 items-center">
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                      </div>
                    </div>
                    <div className="text-xs text-slate-400 leading-relaxed font-sans italic">
                      Inspecting visual coordinates & performing multi-viewport scanning...
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {chatHistory.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500 max-w-sm mx-auto space-y-4">
              <Languages className="w-10 h-10 text-slate-700 animate-pulse" />
              <div>
                <h4 className="font-bold text-sm text-slate-300">Dashboard Reasoning Desk</h4>
                <p className="text-xs text-slate-500 leading-relaxed mt-1 mb-4">
                  Input coordinates or metric segments to trace. Spell errors corrected on execution automatically.
                </p>
                
                <div className="flex flex-wrap justify-center gap-2">
                  {STARTER_QUESTIONS.map((q, idx) => (
                    <button 
                      key={idx}
                      onClick={() => handleAskQuestion(q)}
                      className="text-[10px] uppercase font-mono tracking-wider font-extrabold bg-[#12121e] border border-zinc-800 hover:bg-indigo-950/20 hover:border-indigo-500/30 text-indigo-400 px-3 py-1.5 rounded-full cursor-pointer transition-all"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Input panel with Voice recognition controls */}
        <div className="p-4 border-t border-zinc-900 bg-zinc-950/40 relative">
          
          <div className="flex items-center gap-2 bg-[#101017] border border-zinc-800 rounded-xl px-3 py-1 text-sm focus-within:border-indigo-500">
            {/* Speech microphone toggle button (F9.3) */}
            <button 
              onClick={handleVoiceInput}
              className={`p-2 rounded-lg cursor-pointer transition-all ${
                isChatListening ? 'bg-rose-500 text-white animate-pulse' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Voice Prompt dictation mode..."
            >
              {isChatListening ? <Mic className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <input 
              type="text" 
              value={qaInput} 
              onChange={e => setQaInput(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && handleAskQuestion()}
              placeholder={isChatListening ? "Listening prompt dictation..." : "Ask anything about this dashboard..."}
              className="flex-1 bg-transparent py-3 mx-1 text-sm text-white focus:outline-none"
            />

            <button 
              onClick={() => handleAskQuestion()}
              disabled={!qaInput.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-wider px-3.5 py-2 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              Ask
            </button>
          </div>

          {/* Follow up suggestion chips list */}
          {chatHistory.length > 0 && !isChatResponding && chatHistory[chatHistory.length - 1].role === 'analyst' && chatHistory[chatHistory.length - 1].suggestedFollowUps?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 shrink-0 overflow-x-auto select-none">
              {chatHistory[chatHistory.length - 1].suggestedFollowUps.map((prompt: string, idx: number) => (
                <button 
                  key={idx} 
                  onClick={() => { handleAskQuestion(prompt); }} 
                  className="text-xs uppercase font-mono tracking-wider font-extrabold bg-[#12121e] border border-zinc-800 hover:bg-indigo-950/20 hover:border-indigo-500/30 text-indigo-400 px-3 py-1.5 rounded-full cursor-pointer transition-all whitespace-nowrap"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
