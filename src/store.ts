import { create } from 'zustand';
import { safeIdb } from './lib/safeIdb';
import { MasterDashboardPayload, ChatMessage, SavedDashboardMeta, ColumnProfile, IngestedDashboard } from './types';
import { safeStorage } from './lib/safeStorage';

const get = safeIdb.get;
const idbSet = safeIdb.set;
const idbDel = safeIdb.del;
const idbKeys = safeIdb.keys;

interface AppState {
  // Application Mode
  appMode: 'build' | 'analyze';
  setAppMode: (mode: 'build' | 'analyze') => void;

  theme: 'light' | 'dark';
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  
  // Chat History
  chats: ChatMessage[];
  addChatMessage: (msg: ChatMessage) => void;
  clearChats: () => void;
  setChats: (chats: ChatMessage[]) => void;
  
  // Dashboard states
  currentPayload: MasterDashboardPayload | null;
  setCurrentPayload: (payload: MasterDashboardPayload | null) => void;
  
  isStreaming: boolean;
  setIsStreaming: (is: boolean) => void;
  
  streamProgressText: string;
  setStreamProgressText: (text: string) => void;
  
  // Saved dashboards meta (persisted in localStorage for fast lookup list)
  savedDashboards: SavedDashboardMeta[];
  loadSavedDashboardsList: () => void;
  saveDashboard: (payload: MasterDashboardPayload, prompt: string) => Promise<void>;
  deleteDashboard: (id: string) => Promise<void>;

  // Attached data structure
  attachedData: { fileName: string; content: string } | null;
  setAttachedData: (data: { fileName: string; content: string } | null) => void;

  attachedDataB: { fileName: string; content: string } | null;
  setAttachedDataB: (data: { fileName: string; content: string } | null) => void;

  // Real dataset in-memory context (anti-truncation)
  attachedDataset: {
    fileName: string;
    rows: Record<string, any>[];
    columns: ColumnProfile[];
    rowCount: number;
    sheets?: string[];
  } | null;
  setAttachedDataset: (dataset: {
    fileName: string;
    rows: Record<string, any>[];
    columns: ColumnProfile[];
    rowCount: number;
    sheets?: string[];
  } | null) => void;

  attachedDatasetB: {
    fileName: string;
    rows: Record<string, any>[];
    columns: ColumnProfile[];
    rowCount: number;
    sheets?: string[];
  } | null;
  setAttachedDatasetB: (dataset: {
    fileName: string;
    rows: Record<string, any>[];
    columns: ColumnProfile[];
    rowCount: number;
    sheets?: string[];
  } | null) => void;

  // Ingested live URL dashboard analyst context
  ingestedDashboard: IngestedDashboard | null;
  setIngestedDashboard: (dashboard: IngestedDashboard | null) => void;
  savedIngestedDashboards: Array<{ id: string; url: string; title: string; ingestedAt: string; thumbnailBase64?: string; }>;
  loadSavedIngestedDashboards: () => Promise<void>;
  saveIngestedDashboard: (dashboard: IngestedDashboard) => Promise<void>;
  deleteIngestedDashboard: (id: string) => Promise<void>;

  // Undo/Redo structure
  undoStack: MasterDashboardPayload[];
  redoStack: MasterDashboardPayload[];
  canUndo: boolean;
  canRedo: boolean;
  pushState: (newPayload: MasterDashboardPayload) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  initHistoryForDashboard: (dashboardId: string) => Promise<void>;

  // User-specific chart settings
  componentSettings: Record<string, { legendVisible?: boolean; tooltipFormat?: 'raw' | 'formatted' | 'percentage'; trendlineVisible?: boolean; highlightAnomalies?: boolean }>;
  updateComponentSettings: (id: string, settings: Partial<{ legendVisible?: boolean; tooltipFormat?: 'raw' | 'formatted' | 'percentage'; trendlineVisible?: boolean; highlightAnomalies?: boolean }>) => void;

  // F5: Spotlight system
  activeSpotlight: any | null;
  setActiveSpotlight: (spotlight: any | null) => void;
  
  // F7: Intent correction
  lastIntentCorrection: { original: string; corrected: string } | null;
  setLastIntentCorrection: (correction: { original: string; corrected: string } | null) => void;
  
  // F9.6: Watchlist
  watchlistQuestions: any[];
  addToWatchlist: (item: any) => void;
  removeFromWatchlist: (id: string) => void;
  
  // F9.7: Language mode
  answerLanguage: 'en' | 'hi' | 'hi-en';
  setAnswerLanguage: (lang: 'en' | 'hi' | 'hi-en') => void;
  
  // F6: Live mode
  isLiveMode: boolean;
  toggleLiveMode: () => void;
  setLiveMode: (live: boolean) => void;
  
  // F8.1: Schema state
  dataPreviewRows: Record<string, any>[];
  setDataPreviewRows: (rows: Record<string, any>[]) => void;
}

export const useAppStore = create<AppState>((setState, getState) => ({
  appMode: 'analyze',
  setAppMode: (mode) => setState({ appMode: mode }),

  activeSpotlight: null,
  setActiveSpotlight: (spotlight) => setState({ activeSpotlight: spotlight }),

  lastIntentCorrection: null,
  setLastIntentCorrection: (correction) => setState({ lastIntentCorrection: correction }),

  watchlistQuestions: (() => {
    try {
      const stored = safeStorage.getItem('luminate_watchlist');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  })(),
  addToWatchlist: (item) => {
    const list = [...getState().watchlistQuestions, item];
    setState({ watchlistQuestions: list });
    safeStorage.setItem('luminate_watchlist', JSON.stringify(list));
  },
  removeFromWatchlist: (id) => {
    const list = getState().watchlistQuestions.filter((q: any) => q.id !== id);
    setState({ watchlistQuestions: list });
    safeStorage.setItem('luminate_watchlist', JSON.stringify(list));
  },

  answerLanguage: (safeStorage.getItem('luminate_lang') as any) || 'en',
  setAnswerLanguage: (lang) => {
    setState({ answerLanguage: lang });
    safeStorage.setItem('luminate_lang', lang);
  },

  isLiveMode: safeStorage.getItem('luminate_live_mode') === 'true',
  toggleLiveMode: () => {
    const live = !getState().isLiveMode;
    setState({ isLiveMode: live });
    safeStorage.setItem('luminate_live_mode', String(live));
  },
  setLiveMode: (live) => {
    setState({ isLiveMode: live });
    safeStorage.setItem('luminate_live_mode', String(live));
  },

  dataPreviewRows: [],
  setDataPreviewRows: (rows) => setState({ dataPreviewRows: rows }),

  componentSettings: (() => {
    try {
      const stored = safeStorage.getItem('luminate_component_settings');
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      return {};
    }
  })(),
  updateComponentSettings: (id, settings) => {
    const current = getState().componentSettings;
    const updated = {
      ...current,
      [id]: {
        ...(current[id] || { legendVisible: true, tooltipFormat: 'formatted', trendlineVisible: false, highlightAnomalies: false }),
        ...settings
      }
    };
    setState({ componentSettings: updated });
    safeStorage.setItem('luminate_component_settings', JSON.stringify(updated));
  },

  theme: 'light',
  toggleTheme: () => {
    const nextTheme = getState().theme === 'light' ? 'dark' : 'light';
    getState().setTheme(nextTheme);
  },
  setTheme: (theme) => {
    setState({ theme });
    safeStorage.setItem('luminate_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  },
  
  chats: [],
  addChatMessage: async (msg) => {
    const updated = [...getState().chats, msg];
    setState({ chats: updated });
    const currentId = getState().currentPayload?.dashboardId;
    if (currentId) {
      await idbSet(`chats_${currentId}`, updated);
    }
  },
  clearChats: async () => {
    setState({ chats: [] });
    const currentId = getState().currentPayload?.dashboardId;
    if (currentId) {
      await idbDel(`chats_${currentId}`);
    }
  },
  setChats: async (chats) => {
    setState({ chats });
    const currentId = getState().currentPayload?.dashboardId;
    if (currentId) {
      await idbSet(`chats_${currentId}`, chats);
    }
  },
  
  currentPayload: null,
  setCurrentPayload: (currentPayload) => {
    setState({ currentPayload });
    if (currentPayload) {
      // Lazy init history
      getState().initHistoryForDashboard(currentPayload.dashboardId);
      safeStorage.setItem('luminate_active_dashboard_id', currentPayload.dashboardId);
    } else {
      safeStorage.removeItem('luminate_active_dashboard_id');
    }
  },
  
  isStreaming: false,
  setIsStreaming: (isStreaming) => setState({ isStreaming }),
  
  streamProgressText: "",
  setStreamProgressText: (streamProgressText) => setState({ streamProgressText }),
  
  savedDashboards: [],
  loadSavedDashboardsList: () => {
    try {
      const stored = safeStorage.getItem('luminate_saved_index');
      if (stored) {
        setState({ savedDashboards: JSON.parse(stored) });
      }
    } catch (e) {
      console.error("Error reading saved index", e);
    }
  },
  
  saveDashboard: async (payload, prompt) => {
    try {
      const id = payload.dashboardId;
      
      // Store bulky dashboard representation in IndexedDB
      await idbSet(`dash_${id}`, payload);
      
      // Update metadata list stored in localStorage
      const currentMetaList = [...getState().savedDashboards];
      const existingIdx = currentMetaList.findIndex(m => m.dashboardId === id);
      
      let finalPrompt = prompt;
      if (existingIdx !== -1) {
        const existingMeta = currentMetaList[existingIdx];
        if (prompt === "Dashboard configuration adjustment" && existingMeta.prompt) {
          finalPrompt = existingMeta.prompt;
        }
      }
      
      const newMeta: SavedDashboardMeta = {
        dashboardId: id,
        title: payload.title,
        subtitle: payload.subtitle,
        savedAt: new Date().toISOString(),
        prompt: finalPrompt
      };
      
      if (existingIdx !== -1) {
        currentMetaList[existingIdx] = newMeta;
      } else {
        currentMetaList.unshift(newMeta);
      }
      
      setState({ savedDashboards: currentMetaList });
      safeStorage.setItem('luminate_saved_index', JSON.stringify(currentMetaList));
    } catch (e) {
      console.error("Error saving to IndexedDB / safeStorage", e);
    }
  },

  attachedData: null,
  setAttachedData: (data) => setState({ attachedData: data }),

  attachedDataB: null,
  setAttachedDataB: (data) => setState({ attachedDataB: data }),

  attachedDataset: null,
  setAttachedDataset: (dataset) => setState({ attachedDataset: dataset }),

  attachedDatasetB: null,
  setAttachedDatasetB: (dataset) => setState({ attachedDatasetB: dataset }),

  ingestedDashboard: null,
  setIngestedDashboard: async (dashboard) => {
    setState({ ingestedDashboard: dashboard });
    if (dashboard) {
        await idbSet('ingested_dashboard_active_snapshot', dashboard);
    } else {
        await idbDel('ingested_dashboard_active_snapshot');
    }
  },

  savedIngestedDashboards: [],
  loadSavedIngestedDashboards: async () => {
    try {
      const keys = await idbKeys();
      const ingestedKeys = keys.filter(k => typeof k === 'string' && k.startsWith('ingested_dash_'));
      const list = [];
      for (const k of ingestedKeys) {
         try {
           const db = await get(k as string);
           if (db) {
             list.push({
               id: db.id,
               url: db.url,
               title: db.structuredReport?.dashboardTitle || db.pageTitle || 'Untitled Dashboard',
               ingestedAt: db.ingestedAt,
               thumbnailBase64: db.screenshotBase64, // could be downsized, using screenshot for now
             });
           }
         } catch(e) {}
      }
      list.sort((a, b) => new Date(b.ingestedAt).getTime() - new Date(a.ingestedAt).getTime());
      setState({ savedIngestedDashboards: list });
    } catch(e) {
      console.warn("Failed to load historical snapshots", e);
    }
  },
  
  saveIngestedDashboard: async (dashboard: IngestedDashboard) => {
    await idbSet(`ingested_dash_${dashboard.id}`, dashboard);
    getState().loadSavedIngestedDashboards();
  },

  deleteIngestedDashboard: async (id: string) => {
    await idbDel(`ingested_dash_${id}`);
    if (getState().ingestedDashboard?.id === id) {
       getState().setIngestedDashboard(null);
    }
    getState().loadSavedIngestedDashboards();
  },
  
  deleteDashboard: async (id) => {
    try {
      await idbDel(`dash_${id}`);
      await idbDel(`history_past_${id}`);
      await idbDel(`history_future_${id}`);
      await idbDel(`chats_${id}`);
      
      // Cleanup persisted filters and active pointers
      safeStorage.removeItem(`luminate_filters_for_${id}`);
      
      const updatedMeta = getState().savedDashboards.filter(m => m.dashboardId !== id);
      setState({ savedDashboards: updatedMeta });
      safeStorage.setItem('luminate_saved_index', JSON.stringify(updatedMeta));
      
      if (getState().currentPayload?.dashboardId === id) {
        safeStorage.removeItem('luminate_active_dashboard_id');
        setState({ currentPayload: null, undoStack: [], redoStack: [], canUndo: false, canRedo: false });
      }
    } catch (e) {
      console.error("Error deleting from IndexedDB and history", e);
    }
  },

  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,

  initHistoryForDashboard: async (dashboardId) => {
    try {
      const past = await get(`history_past_${dashboardId}`) || [];
      const future = await get(`history_future_${dashboardId}`) || [];
      const loadedChats = await get(`chats_${dashboardId}`) || [];
      setState({
        undoStack: past,
        redoStack: future,
        canUndo: past.length > 0,
        canRedo: future.length > 0,
        chats: loadedChats
      });
    } catch (e) {
      console.error("Failed to init history", e);
    }
  },

  pushState: async (newPayload) => {
    const current = getState().currentPayload;
    const past = getState().undoStack;
    
    // Prevent duplicate states being consecutive in the undo history
    if (current && JSON.stringify(current) === JSON.stringify(newPayload)) {
      setState({ currentPayload: newPayload });
      return;
    }

    const updatedPast = current ? [...past, JSON.parse(JSON.stringify(current))] : past;
    const updatedFuture: MasterDashboardPayload[] = [];

    setState({
      currentPayload: newPayload,
      undoStack: updatedPast,
      redoStack: updatedFuture,
      canUndo: updatedPast.length > 0,
      canRedo: false
    });

    try {
      const dbId = newPayload.dashboardId;
      await idbSet(`dash_${dbId}`, newPayload);
      await idbSet(`history_past_${dbId}`, updatedPast);
      await idbSet(`history_future_${dbId}`, updatedFuture);
      
      // Update local storage pointer to the active dashboard ID for auto-save
      safeStorage.setItem('luminate_active_dashboard_id', dbId);
      
      // Also sync saved metadata list
      await getState().saveDashboard(newPayload, "Dashboard configuration adjustment");
    } catch (e) {
      console.warn("Failed saving history step", e);
    }
  },

  undo: async () => {
    const { undoStack, redoStack, currentPayload } = getState();
    if (undoStack.length === 0 || !currentPayload) return;

    const nextPast = [...undoStack];
    const previous = nextPast.pop()!;
    const nextFuture = [JSON.parse(JSON.stringify(currentPayload)), ...redoStack];

    setState({
      currentPayload: previous,
      undoStack: nextPast,
      redoStack: nextFuture,
      canUndo: nextPast.length > 0,
      canRedo: true
    });

    try {
      const dbId = previous.dashboardId;
      await idbSet(`dash_${dbId}`, previous);
      await idbSet(`history_past_${dbId}`, nextPast);
      await idbSet(`history_future_${dbId}`, nextFuture);
    } catch (e) {
      console.warn("Failed to save undo state", e);
    }
  },

  redo: async () => {
    const { undoStack, redoStack, currentPayload } = getState();
    if (redoStack.length === 0 || !currentPayload) return;

    const nextFuture = [...redoStack];
    const nextItem = nextFuture.shift()!;
    const nextPast = [...undoStack, JSON.parse(JSON.stringify(currentPayload))];

    setState({
      currentPayload: nextItem,
      undoStack: nextPast,
      redoStack: nextFuture,
      canUndo: true,
      canRedo: nextFuture.length > 0
    });

    try {
      const dbId = nextItem.dashboardId;
      await idbSet(`dash_${dbId}`, nextItem);
      await idbSet(`history_past_${dbId}`, nextPast);
      await idbSet(`history_future_${dbId}`, nextFuture);
    } catch (e) {
      console.warn("Failed to save redo state", e);
    }
  }
}));

// Load raw dashboard payload from IndexedDB Helper
export async function loadIngestedDashboardFromIDB() {
  try {
    const active = await get('ingested_dashboard_active_snapshot');
    if (active) {
       useAppStore.getState().setIngestedDashboard(active as any);
    }
  } catch (err) {
    console.warn("Failed to retrieve ingested dashboard snapshot", err);
  }
}

export async function loadDashboardFromIDB(id: string): Promise<MasterDashboardPayload | null> {
  try {
    const payload = await get(`dash_${id}`);
    return payload || null;
  } catch (e) {
    console.error("Failed loading from IndexedDB", e);
    return null;
  }
}
