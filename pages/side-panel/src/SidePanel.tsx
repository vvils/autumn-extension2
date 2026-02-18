/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { History, SquarePen, Settings } from 'lucide-react';
import {
  type Message,
  Actors,
  chatHistoryStore,
  agentModelStore,
  generalSettingsStore,
  serverSettingsStore,
  mergeWidgetIntoMessages,
} from '@extension/storage';

function portRpc(
  port: chrome.runtime.Port,
  type: string,
  payload: Record<string, unknown>,
  responseType: string,
  timeoutMs = 10_000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timeout = setTimeout(() => {
      reject(new Error('Request timed out'));
    }, timeoutMs);

    const listener = (msg: any) => {
      if (msg.type === responseType && msg.requestId === requestId) {
        clearTimeout(timeout);
        port.onMessage.removeListener(listener);
        if (msg.error) reject(new Error(msg.error));
        else resolve(msg);
      }
    };
    port.onMessage.addListener(listener);
    port.postMessage({ type, requestId, ...payload });
  });
}
import MessageList from './components/MessageList';
import ChatInput from './components/ChatInput';
import ChatHistoryList from './components/ChatHistoryList';
import ThinkingWidget from './components/ThinkingWidget';
import { ActiveGroupOverlay } from './components/ActiveGroupOverlay';
import { AuthOverlay } from './components/AuthOverlay';
import { SlidePanel } from './components/SlidePanel';
import { EventType, type AgentEvent, ExecutionState } from './types/event';
import { useThinkingState } from './hooks/useThinkingState';
import { useTaskTimer } from './hooks/useTaskTimer';
import './SidePanel.css';

interface SpeechRecognitionResult {
  readonly [index: number]: SpeechRecognitionAlternative;
  readonly length: number;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly [index: number]: SpeechRecognitionResult;
  readonly length: number;
}

interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    chrome: typeof chrome;
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function serverRoleToActor(role: string): Actors {
  if (Object.values(Actors).includes(role as Actors)) return role as Actors;
  if (role === 'assistant') return Actors.SYNTHESIZER;
  return Actors.SYSTEM;
}

const CLIENT_URL = import.meta.env.VITE_CLIENT_URL || 'http://localhost:3000';

const WORKFLOW_PROMPTS = [
  {
    id: 'ota-rate-parity',
    name: 'OTA Rate Parity Check',
    description: 'Compare rates on Google Travel and adjust in Mews',
    icon: '💲',
    prompt: [
      'Go to google.com/travel/hotels and search for the Olea Hotel. Open the hotel\'s detail page and record the nightly rates for the Direct channel and Booking.com from the price comparison panel for the currently displayed check-in date, saving the result as a finding with the key prices_checkin and a value such as "Direct: $189, Booking.com: $205".',
      'Next, calculate the variance using (Booking.com price − Direct price) / Direct price × 100 and flag it if the variance falls outside the acceptable range of −2% to +15%, with the target markup being 10%. Save the analysis as a finding with the key parity_analysis, including the variance percentage and whether it is flagged.',
      'If flagged, calculate the target Direct rate by dividing the Booking.com price by 1.10 and rounding down to the nearest whole dollar, never setting it below a floor price of $150. Then go to Mews at https://app.mews-demo.com/Commander/742af69f-59a4-453b-8833-ac7500ad9cb8/Dashboard/Index, select the "Stay" service from the dropdown on the left, and navigate to Rate Management.',
      'On the Rate Management page, locate the Base price row on the left — it should be the first row with orange cells. You\'ll see a grid of prices with dates as columns. Click the cell corresponding to the relevant date on the Base price row only — do not modify any other rate, category, or date row. A form will appear with "Absolute adjustment" and "Relative adjustment %" fields. Enter the new rate using the Absolute adjustment field, calculated as the difference between the new target rate and the current base price, leave Relative adjustment % unchanged, and save.',
      'Save the adjustment as a finding with the key adjusted_direct and a value such as "Old: $195 → New: $178".',
    ].join('\n'),
  },
  {
    id: 'group-booking-inquiries',
    name: 'Group Booking Inquiries',
    description: 'Process group booking emails and draft replies',
    icon: '🏨',
    prompt: [
      'First, navigate to https://mail.google.com/mail/u/3/#inbox to verify you are on the correct Gmail account — the user will already be logged in.',
      'Search for group booking inquiries using the query: "group booking OR block reservation OR event inquiry OR RFP OR corporate rate OR wedding block OR room block". Open the matching email and read the full content.',
      'Next, navigate to the Autumn application at http://localhost:3000 and open the sidebar. Go to the Group Bookings section. Paste the email content into the Quick Import field and generate a quote. Once the quote is generated, scroll down and copy the generated email reply.',
      "Navigate back to Gmail at https://mail.google.com/mail/u/3/#inbox. Open the original email thread, click reply, and paste the generated reply into the compose window. Save it as a draft only — do NOT send it. Ask me first if I'd like to send it, and only send if I confirm.",
      'Confirm once the draft reply has been saved in Gmail (or sent, if approved).',
    ].join('\n'),
  },
  {
    id: 'performance-next-week',
    name: 'Performance Next Week',
    description: 'Check upcoming performance outlook',
    icon: '📊',
    prompt: 'How does my performance next week look?',
  },
] as const;

const SidePanel = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const { state: thinkingWidgetState, handleEvent: handleThinkingEvent, reset: resetThinking } = useThinkingState();
  const { formattedTime: elapsedTime, start: startTimer, stop: stopTimer, reset: resetTimer } = useTaskTimer();
  const [inputEnabled, setInputEnabled] = useState(true);
  const [showStopButton, setShowStopButton] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [chatSessions, setChatSessions] = useState<
    Array<{ id: string; title: string; createdAt: number; source?: string }>
  >([]);
  const [isFollowUpMode, setIsFollowUpMode] = useState(false);
  const [isHistoricalSession, setIsHistoricalSession] = useState(false);
  const [hasConfiguredModels, setHasConfiguredModels] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayEnabled, setReplayEnabled] = useState(false);
  const [isStreamingPlanner, setIsStreamingPlanner] = useState(false);
  const [isStreamingSynthesizer, setIsStreamingSynthesizer] = useState(false);
  const [activeGroupOverlay, setActiveGroupOverlay] = useState<{ primaryTabId: number } | null>(null);
  const [costData, setCostData] = useState<{
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCostUsd: number;
  } | null>(null);
  const [showCostEstimate, setShowCostEstimate] = useState(true);
  const sessionIdRef = useRef<string | null>(null);
  const isReplayingRef = useRef<boolean>(false);
  const plannerStreamingRef = useRef(false);
  const synthesizerStreamingRef = useRef(false);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const setInputTextRef = useRef<((text: string) => void) | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const widgetApplyCallbacksRef = useRef<Map<string, { resolve: (r: { success: boolean; error?: string }) => void }>>(
    new Map(),
  );

  const handleWidgetApply = useCallback(
    (
      endpoint: string,
      method: string,
      payload: Record<string, unknown>,
    ): Promise<{ success: boolean; error?: string }> => {
      return new Promise(resolve => {
        const requestId = crypto.randomUUID();
        const timeout = setTimeout(() => {
          widgetApplyCallbacksRef.current.delete(requestId);
          resolve({ success: false, error: 'Request timed out' });
        }, 30_000);

        widgetApplyCallbacksRef.current.set(requestId, {
          resolve: result => {
            clearTimeout(timeout);
            resolve(result);
          },
        });

        if (!portRef.current) {
          clearTimeout(timeout);
          widgetApplyCallbacksRef.current.delete(requestId);
          resolve({ success: false, error: 'No connection' });
          return;
        }

        try {
          portRef.current.postMessage({ type: 'widget_apply', requestId, endpoint, method, payload });
        } catch {
          clearTimeout(timeout);
          widgetApplyCallbacksRef.current.delete(requestId);
          resolve({ success: false, error: 'Failed to send request' });
        }
      });
    },
    [],
  );

  const checkModelConfiguration = useCallback(async () => {
    try {
      const configuredAgents = await agentModelStore.getConfiguredAgents();
      const hasAtLeastOneModel = configuredAgents.length > 0;
      setHasConfiguredModels(hasAtLeastOneModel);
    } catch (error) {
      console.error('Error checking model configuration:', error);
      setHasConfiguredModels(false);
    }
  }, []);

  const loadGeneralSettings = useCallback(async () => {
    try {
      const settings = await generalSettingsStore.getSettings();
      setReplayEnabled(settings.replayHistoricalTasks);
      setShowCostEstimate(settings.showCostEstimate);
    } catch (error) {
      console.error('Error loading general settings:', error);
      setReplayEnabled(false);
    }
  }, []);

  const serverSettings = useSyncExternalStore(serverSettingsStore.subscribe, serverSettingsStore.getSnapshot);
  const isAuthenticated =
    serverSettings === null ? null : Boolean(serverSettings.accessToken) && serverSettings.tokenExpiresAt > Date.now();

  useEffect(() => {
    checkModelConfiguration();
    loadGeneralSettings();
  }, [checkModelConfiguration, loadGeneralSettings]);

  const requestAuthDetection = useCallback(() => {
    if (isAuthenticated === false) {
      portRef.current?.postMessage({ type: 'detect_auth', clientUrl: CLIENT_URL });
    }
  }, [isAuthenticated]);

  useEffect(() => {
    requestAuthDetection();
  }, [requestAuthDetection]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkModelConfiguration();
        loadGeneralSettings();
        requestAuthDetection();
      }
    };

    const handleFocus = () => {
      checkModelConfiguration();
      loadGeneralSettings();
      requestAuthDetection();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkModelConfiguration, loadGeneralSettings, requestAuthDetection]);

  useEffect(() => {
    const listener = (activeInfo: chrome.tabs.TabActiveInfo) => {
      if (!portRef.current) return;
      portRef.current.postMessage({
        type: 'check_tab_group_status',
        tabId: activeInfo.tabId,
      });
    };
    chrome.tabs.onActivated.addListener(listener);
    return () => chrome.tabs.onActivated.removeListener(listener);
  }, []);

  useEffect(() => {
    const listener = () => {
      if (!portRef.current) return;
      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab?.id) {
          portRef.current?.postMessage({
            type: 'check_tab_group_status',
            tabId: tab.id,
          });
        }
      });
    };
    chrome.tabs.onRemoved.addListener(listener);
    return () => chrome.tabs.onRemoved.removeListener(listener);
  }, []);

  useEffect(() => {
    sessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    isReplayingRef.current = isReplaying;
  }, [isReplaying]);

  const appendMessage = useCallback((newMessage: Message, sessionId?: string | null) => {
    setMessages(prev => [...prev, newMessage]);
    const effectiveSessionId = sessionId !== undefined ? sessionId : sessionIdRef.current;
    if (effectiveSessionId) {
      portRef.current?.postMessage({
        type: 'add_message',
        sessionId: effectiveSessionId,
        message: { actor: newMessage.actor, content: newMessage.content, timestamp: newMessage.timestamp },
      });
    }
  }, []);

  const persistMessage = useCallback((msg: { actor: string; content: string; timestamp: number }) => {
    if (sessionIdRef.current) {
      portRef.current?.postMessage({
        type: 'add_message',
        sessionId: sessionIdRef.current,
        message: msg,
      });
    }
  }, []);

  const handleTaskState = useCallback(
    (event: AgentEvent) => {
      const { actor, state, timestamp, data } = event;
      const content = data?.details;
      let skip = true;

      handleThinkingEvent(event);

      switch (actor) {
        case Actors.SYSTEM:
          switch (state) {
            case ExecutionState.TASK_START:
              setIsHistoricalSession(false);
              setCostData(null);
              resetTimer();
              startTimer();
              break;
            case ExecutionState.COST_UPDATE:
              try {
                setCostData(JSON.parse(content || ''));
              } catch {
                /* ignore malformed cost data */
              }
              return;
            case ExecutionState.TASK_OK:
              setIsFollowUpMode(true);
              setInputEnabled(true);
              setShowStopButton(false);
              setIsReplaying(false);
              setActiveGroupOverlay(null);
              stopTimer();
              break;
            case ExecutionState.TASK_FAIL:
              setIsFollowUpMode(true);
              setInputEnabled(true);
              setShowStopButton(false);
              setIsReplaying(false);
              setActiveGroupOverlay(null);
              stopTimer();
              skip = false;
              break;
            case ExecutionState.TASK_CANCEL:
              setIsFollowUpMode(false);
              setInputEnabled(true);
              setShowStopButton(false);
              setIsReplaying(false);
              setActiveGroupOverlay(null);
              stopTimer();
              skip = false;
              break;
            case ExecutionState.TASK_PAUSE:
              break;
            case ExecutionState.TASK_RESUME:
              break;
            default:
              console.error('Invalid task state', state);
              return;
          }
          break;
        case Actors.USER:
          break;
        case Actors.PLANNER:
          switch (state) {
            case ExecutionState.STEP_START:
              break;
            case ExecutionState.STEP_STREAMING:
              setMessages(prev => {
                if (plannerStreamingRef.current) {
                  return [...prev.slice(0, -1), { actor, content: content || '', timestamp }];
                } else {
                  plannerStreamingRef.current = true;
                  setIsStreamingPlanner(true);
                  return [...prev, { actor, content: content || '', timestamp }];
                }
              });
              return;
            case ExecutionState.STEP_OK: {
              const wasStreaming = plannerStreamingRef.current;
              plannerStreamingRef.current = false;
              setIsStreamingPlanner(false);
              if (wasStreaming) {
                setMessages(prev => {
                  if (prev.length > 0) {
                    const last = prev[prev.length - 1];
                    const finalContent = content || last.content;
                    return [...prev.slice(0, -1), { ...last, content: finalContent, timestamp }];
                  }
                  return prev;
                });
              } else {
                setMessages(prev => [...prev, { actor, content: content || '', timestamp }]);
              }
              break;
            }
            case ExecutionState.STEP_FAIL:
              plannerStreamingRef.current = false;
              setIsStreamingPlanner(false);
              skip = false;
              break;
            case ExecutionState.STEP_CANCEL:
              plannerStreamingRef.current = false;
              setIsStreamingPlanner(false);
              break;
            default:
              console.error('Invalid step state', state);
              return;
          }
          break;
        case Actors.NAVIGATOR:
          switch (state) {
            case ExecutionState.STEP_START:
              break;
            case ExecutionState.STEP_OK:
              break;
            case ExecutionState.STEP_FAIL:
              skip = false;
              break;
            case ExecutionState.STEP_CANCEL:
              break;
            case ExecutionState.ACT_START:
              if (content !== 'cache_content') {
                skip = false;
              }
              break;
            case ExecutionState.ACT_OK:
              skip = !isReplayingRef.current;
              break;
            case ExecutionState.ACT_FAIL:
              skip = false;
              break;
            default:
              console.error('Invalid action', state);
              return;
          }
          break;
        case Actors.SYNTHESIZER:
          switch (state) {
            case ExecutionState.STEP_STREAMING:
              setMessages(prev => {
                if (synthesizerStreamingRef.current) {
                  const last = prev[prev.length - 1];
                  return [...prev.slice(0, -1), { actor, content: content || '', timestamp, widgets: last?.widgets }];
                } else {
                  synthesizerStreamingRef.current = true;
                  setIsStreamingSynthesizer(true);
                  return [...prev, { actor, content: content || '', timestamp }];
                }
              });
              return;
            case ExecutionState.STEP_OK: {
              const wasStreaming = synthesizerStreamingRef.current;
              synthesizerStreamingRef.current = false;
              setIsStreamingSynthesizer(false);
              if (wasStreaming) {
                let finalContent = content || '';
                setMessages(prev => {
                  if (prev.length > 0) {
                    const last = prev[prev.length - 1];
                    finalContent = content || last.content;
                    return [...prev.slice(0, -1), { ...last, content: finalContent, timestamp }];
                  }
                  return prev;
                });
                persistMessage({ actor, content: finalContent, timestamp });
              } else {
                setMessages(prev => [...prev, { actor, content: content || '', timestamp }]);
                persistMessage({ actor, content: content || '', timestamp });
              }
              break;
            }
            case ExecutionState.STEP_FAIL:
              synthesizerStreamingRef.current = false;
              setIsStreamingSynthesizer(false);
              skip = false;
              break;
            case ExecutionState.WIDGET_EVENT: {
              try {
                const widgetData = JSON.parse(content || '{}');
                if (!widgetData.widgetId || !widgetData.type) return;
                setMessages(prev => mergeWidgetIntoMessages(prev, widgetData, timestamp));
                persistMessage({ actor: 'widget', content: content || '', timestamp });
              } catch (err) {
                console.error('Failed to parse widget event:', err);
              }
              return;
            }
            default:
              return;
          }
          break;
        case Actors.VALIDATOR:
          switch (state) {
            case ExecutionState.STEP_START:
              break;
            case ExecutionState.STEP_OK:
              skip = false;
              break;
            case ExecutionState.STEP_FAIL:
              skip = false;
              break;
            default:
              console.error('Invalid validation', state);
              return;
          }
          break;
        default:
          console.error('Unknown actor', actor);
          return;
      }

      if (!skip) {
        appendMessage({
          actor,
          content: content || '',
          timestamp: timestamp,
        });
      }
    },
    [appendMessage, persistMessage, handleThinkingEvent, startTimer, stopTimer, resetTimer],
  );

  const stopConnection = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (portRef.current) {
      portRef.current.disconnect();
      portRef.current = null;
    }
  }, []);

  const setupConnection = useCallback(() => {
    if (portRef.current) {
      return;
    }

    try {
      portRef.current = chrome.runtime.connect({ name: 'side-panel-connection' });

      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      portRef.current.onMessage.addListener((message: any) => {
        if (message && message.type === EventType.EXECUTION) {
          handleTaskState(message);
        } else if (message && message.type === 'error') {
          appendMessage({
            actor: Actors.SYSTEM,
            content: message.error || 'Unknown error occurred',
            timestamp: Date.now(),
          });
          setInputEnabled(true);
          setShowStopButton(false);
        } else if (message && message.type === 'conversations_result') {
          const mapped = (message.conversations || []).map(
            (c: { id: string; title: string; createdAt: string; source?: string }) => ({
              id: c.id,
              title: c.title,
              createdAt: new Date(c.createdAt).getTime(),
              source: c.source,
            }),
          );
          setChatSessions(
            mapped.sort((a: { createdAt: number }, b: { createdAt: number }) => b.createdAt - a.createdAt),
          );
        } else if (message && message.type === 'conversation_messages_result') {
          const rawMessages: Array<{ role: string; content: string; createdAt: string }> = message.messages || [];
          const mapped: Message[] = [];
          for (const m of rawMessages) {
            if (m.role === 'widget') {
              try {
                const widgetData = JSON.parse(m.content);
                let merged = false;
                for (let i = mapped.length - 1; i >= 0; i--) {
                  if (mapped[i].actor === Actors.SYNTHESIZER) {
                    mapped[i] = {
                      ...mapped[i],
                      widgets: [...(mapped[i].widgets || []), widgetData],
                    };
                    merged = true;
                    break;
                  }
                }
                if (!merged) {
                  mapped.push({
                    actor: Actors.SYNTHESIZER,
                    content: '',
                    timestamp: new Date(m.createdAt).getTime(),
                    widgets: [widgetData],
                  });
                }
              } catch {
                /* ignore malformed widget data */
              }
            } else {
              mapped.push({
                actor: serverRoleToActor(m.role),
                content: m.content,
                timestamp: new Date(m.createdAt).getTime(),
              });
            }
          }
          if (mapped.length > 0) {
            setCurrentSessionId(message.conversationId);
            setMessages(mapped);
            setIsFollowUpMode(false);
            setIsHistoricalSession(true);
          }
          setShowHistory(false);
        } else if (message && message.type === 'conversation_deleted') {
          setChatSessions(prev => prev.filter(s => s.id !== message.conversationId));
          if (message.conversationId === currentSessionId) {
            setMessages([]);
            setCurrentSessionId(null);
          }
        } else if (message && message.type === 'tab_group_status') {
          if (message.inActiveGroup) {
            setActiveGroupOverlay({ primaryTabId: message.primaryTabId });
          } else {
            setActiveGroupOverlay(null);
          }
        } else if (message && message.type === 'widget_apply_result') {
          const pending = widgetApplyCallbacksRef.current.get(message.requestId);
          if (pending) {
            widgetApplyCallbacksRef.current.delete(message.requestId);
            pending.resolve({ success: message.success, error: message.error });
          }
        } else if (message && message.type === 'heartbeat_ack') {
          console.log('Heartbeat acknowledged');
        }
      });

      portRef.current.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        console.log('Connection disconnected', error ? `Error: ${error.message}` : '');
        portRef.current = null;
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        widgetApplyCallbacksRef.current.forEach(({ resolve }) => resolve({ success: false, error: 'Connection lost' }));
        widgetApplyCallbacksRef.current.clear();
        setInputEnabled(true);
        setShowStopButton(false);
      });

      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }

      heartbeatIntervalRef.current = window.setInterval(() => {
        if (portRef.current?.name === 'side-panel-connection') {
          try {
            portRef.current.postMessage({ type: 'heartbeat' });
          } catch (error) {
            console.error('Heartbeat failed:', error);
            stopConnection();
          }
        } else {
          stopConnection();
        }
      }, 25000);
    } catch (error) {
      console.error('Failed to establish connection:', error);
      appendMessage({
        actor: Actors.SYSTEM,
        content: 'Failed to connect to service worker',
        timestamp: Date.now(),
      });
      portRef.current = null;
    }
  }, [handleTaskState, appendMessage, stopConnection]);

  useEffect(() => {
    setupConnection();

    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id && portRef.current) {
        portRef.current.postMessage({
          type: 'check_tab_group_status',
          tabId: tab.id,
        });
      }
    })();
  }, [setupConnection]);

  const sendMessage = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    (message: any) => {
      if (portRef.current?.name !== 'side-panel-connection') {
        throw new Error('No valid connection available');
      }
      try {
        portRef.current.postMessage(message);
      } catch (error) {
        console.error('Failed to send message:', error);
        stopConnection();
        throw error;
      }
    },
    [stopConnection],
  );

  const handleReplay = async (historySessionId: string): Promise<void> => {
    try {
      if (!replayEnabled) {
        appendMessage({
          actor: Actors.SYSTEM,
          content:
            'Replay is disabled in general settings. Please enable "Replay Historical Tasks" in the extension settings to use this feature.',
          timestamp: Date.now(),
        });
        return;
      }

      const historyData = await chatHistoryStore.loadAgentStepHistory(historySessionId);
      if (!historyData) {
        appendMessage({
          actor: Actors.SYSTEM,
          content: `No action history found for session "${historySessionId.substring(0, 20)}...". This session may not contain replayable actions.\n\nIt's a replay session itself (replay sessions cannot be replayed again), or it was created before the replay feature was available.`,
          timestamp: Date.now(),
        });
        return;
      }

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (!tabId) {
        throw new Error('No active tab found');
      }

      if (isHistoricalSession) {
        setMessages([]);
      }

      if (!portRef.current) {
        setupConnection();
      }
      if (!portRef.current) {
        throw new Error('No connection available');
      }
      const replayResponse = await portRpc(
        portRef.current,
        'create_session',
        { title: `Replay of ${historySessionId.substring(0, 20)}...` },
        'session_created',
      );
      const newSession = replayResponse.session;
      console.log('newSession for replay', newSession);

      const newTaskId = newSession.id;
      setCurrentSessionId(newTaskId);
      sessionIdRef.current = newTaskId;

      setInputEnabled(false);
      setShowStopButton(true);
      setIsFollowUpMode(false);
      setIsHistoricalSession(false);

      const userMessage = {
        actor: Actors.USER,
        content: `/replay ${historySessionId}`,
        timestamp: Date.now(),
      };

      appendMessage(userMessage, sessionIdRef.current);

      if (!portRef.current) {
        setupConnection();
      }

      portRef.current?.postMessage({
        type: 'replay',
        taskId: newTaskId,
        tabId: tabId,
        historySessionId: historySessionId,
        task: historyData.task,
      });

      appendMessage({
        actor: Actors.SYSTEM,
        content: `Starting replay of task:\n\n"${historyData.task}"`,
        timestamp: Date.now(),
      });
      setIsReplaying(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      appendMessage({
        actor: Actors.SYSTEM,
        content: `Replay failed: ${errorMessage}`,
        timestamp: Date.now(),
      });
    }
  };

  const handleCommand = async (command: string): Promise<boolean> => {
    try {
      if (!portRef.current) {
        setupConnection();
      }

      if (command === '/state') {
        portRef.current?.postMessage({
          type: 'state',
        });
        return true;
      }

      if (command === '/nohighlight') {
        portRef.current?.postMessage({
          type: 'nohighlight',
        });
        return true;
      }

      if (command.startsWith('/replay ')) {
        const parts = command.split(' ').filter(part => part.trim() !== '');
        if (parts.length !== 2) {
          appendMessage({
            actor: Actors.SYSTEM,
            content: 'Invalid arguments. Please use the format: /replay <historySessionId>',
            timestamp: Date.now(),
          });
          return true;
        }

        const historySessionId = parts[1];
        await handleReplay(historySessionId);
        return true;
      }

      appendMessage({
        actor: Actors.SYSTEM,
        content: `Unsupported command: ${command}.\n\nAvailable commands: /state, /nohighlight, /replay <historySessionId>`,
        timestamp: Date.now(),
      });
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Command error', errorMessage);
      appendMessage({
        actor: Actors.SYSTEM,
        content: errorMessage,
        timestamp: Date.now(),
      });
      return true;
    }
  };

  const handleSendMessage = async (text: string, displayText?: string) => {
    console.log('handleSendMessage', text);

    const trimmedText = text.trim();

    if (!trimmedText) return;

    if (trimmedText.startsWith('/')) {
      const wasHandled = await handleCommand(trimmedText);
      if (wasHandled) return;
    }

    if (isHistoricalSession) {
      console.log('Cannot send messages in historical sessions');
      return;
    }

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (!tabId) {
        throw new Error('No active tab found');
      }

      setInputEnabled(false);
      setShowStopButton(true);

      if (!isFollowUpMode) {
        if (!portRef.current) {
          setupConnection();
        }
        if (!portRef.current) {
          throw new Error('No connection available');
        }
        const titleText = displayText || text;
        const response = await portRpc(
          portRef.current,
          'create_session',
          { title: titleText.substring(0, 50) + (titleText.length > 50 ? '...' : '') },
          'session_created',
        );
        const newSession = response.session;
        console.log('newSession', newSession);

        const sessionId = newSession.id;
        setCurrentSessionId(sessionId);
        sessionIdRef.current = sessionId;
      }

      const userMessage = {
        actor: Actors.USER,
        content: displayText || text,
        timestamp: Date.now(),
      };

      appendMessage(userMessage, sessionIdRef.current);

      if (!portRef.current) {
        setupConnection();
      }

      if (isFollowUpMode) {
        await sendMessage({
          type: 'follow_up_task',
          task: text,
          taskId: sessionIdRef.current,
          tabId,
        });
        console.log('follow_up_task sent', text, tabId, sessionIdRef.current);
      } else {
        await sendMessage({
          type: 'new_task',
          task: text,
          taskId: sessionIdRef.current,
          tabId,
        });
        console.log('new_task sent', text, tabId, sessionIdRef.current);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Task error', errorMessage);
      appendMessage({
        actor: Actors.SYSTEM,
        content: errorMessage,
        timestamp: Date.now(),
      });
      setInputEnabled(true);
      setShowStopButton(false);
      stopConnection();
    }
  };

  const handleStopTask = async () => {
    try {
      portRef.current?.postMessage({
        type: 'cancel_task',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('cancel_task error', errorMessage);
      appendMessage({
        actor: Actors.SYSTEM,
        content: errorMessage,
        timestamp: Date.now(),
      });
    }
    setInputEnabled(true);
    setShowStopButton(false);
  };

  const handleNewChat = () => {
    setMessages([]);
    setCurrentSessionId(null);
    sessionIdRef.current = null;
    setInputEnabled(true);
    setShowStopButton(false);
    setIsFollowUpMode(false);
    setIsHistoricalSession(false);
    resetThinking();
    resetTimer();
    setCostData(null);
    stopConnection();
  };

  const loadChatSessions = useCallback(() => {
    if (!portRef.current) {
      setupConnection();
    }
    portRef.current?.postMessage({ type: 'get_conversations' });
  }, [setupConnection]);

  const handleLoadHistory = () => {
    loadChatSessions();
    setShowHistory(true);
  };

  const handleBackToChat = (reset = false) => {
    setShowHistory(false);
    if (reset) {
      setCurrentSessionId(null);
      setMessages([]);
      setIsFollowUpMode(false);
      setIsHistoricalSession(false);
    }
  };

  const handleSessionSelect = (sessionId: string) => {
    if (!portRef.current) {
      setupConnection();
    }
    portRef.current?.postMessage({ type: 'get_conversation_messages', conversationId: sessionId });
  };

  const handleSessionDelete = (sessionId: string) => {
    if (!portRef.current) {
      setupConnection();
    }
    portRef.current?.postMessage({ type: 'delete_conversation', conversationId: sessionId });
  };

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      stopConnection();
    };
  }, [stopConnection]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleMicClick = () => {
    if (isRecording) {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      setIsRecording(false);
      return;
    }

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      appendMessage({
        actor: Actors.SYSTEM,
        content: 'Speech recognition is not supported in this browser',
        timestamp: Date.now(),
      });
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = navigator.language;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      if (transcript && setInputTextRef.current) {
        setInputTextRef.current(transcript);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'aborted') {
        appendMessage({
          actor: Actors.SYSTEM,
          content: 'Speech recognition failed',
          timestamp: Date.now(),
        });
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

  const renderChatInput = () => (
    <ChatInput
      onSendMessage={handleSendMessage}
      onStopTask={handleStopTask}
      onMicClick={handleMicClick}
      isRecording={isRecording}
      disabled={!inputEnabled || isHistoricalSession}
      showStopButton={showStopButton}
      setContent={setter => {
        setInputTextRef.current = setter;
      }}
      historicalSessionId={isHistoricalSession && replayEnabled ? currentSessionId : null}
      onReplay={handleReplay}
      costData={showCostEstimate ? costData : null}
      elapsedTime={showCostEstimate ? elapsedTime : null}
    />
  );

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-white">
      <header className="flex shrink-0 items-center justify-between bg-white px-4 py-2.5">
        <img src="/logo.svg" alt="Autumn" className="h-4" />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleLoadHistory}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Load History">
            <History size={15} />
          </button>
          <button
            type="button"
            onClick={handleNewChat}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="New Chat">
            <SquarePen size={15} />
          </button>
          <button
            type="button"
            onClick={() => chrome.runtime.openOptionsPage()}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Settings">
            <Settings size={15} />
          </button>
        </div>
      </header>

      <SlidePanel open={showHistory} onClose={() => handleBackToChat(false)} title="Chat History" side="left">
        <ChatHistoryList
          sessions={chatSessions}
          onSessionSelect={handleSessionSelect}
          onSessionDelete={handleSessionDelete}
        />
      </SlidePanel>

      {hasConfiguredModels === null && (
        <div className="text-accent flex flex-1 items-center justify-center p-8">
          <div className="text-center">
            <div className="border-accent mx-auto mb-4 size-8 animate-spin rounded-full border-2 border-t-transparent" />
            <p>{'Checking configuration...'}</p>
          </div>
        </div>
      )}

      {hasConfiguredModels === false && (
        <div className="text-accent-foreground flex flex-1 items-center justify-center p-8">
          <div className="max-w-md text-center">
            <img src="/autumn-logo.svg" alt="Autumn" className="mx-auto mb-4 h-8 opacity-60" />
            <h3 className="mb-2 text-lg font-semibold text-gray-900">{'Welcome to Autumn AI Co-Pilot!'}</h3>
            <p className="mb-4 text-[13px] text-gray-500">
              {'To get started, please configure your API keys in the settings page.'}
            </p>
            <button
              onClick={() => chrome.runtime.openOptionsPage()}
              className="bg-accent hover:bg-accent-hover my-4 rounded-lg px-4 py-2 font-medium text-white transition-colors">
              {'Open Settings'}
            </button>
          </div>
        </div>
      )}

      {hasConfiguredModels === true && (
        <>
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex flex-1 flex-col items-center justify-center px-5">
                <img src="/autumn-logo.svg" alt="Autumn" className="mb-3 h-8 opacity-40" />
                <p className="max-w-[240px] text-center text-[13px] leading-relaxed text-black/40">
                  {'Your AI-powered web automation assistant'}
                </p>
              </div>
              <div className="scrollbar-thin overflow-y-auto px-3 pb-2">
                <h3 className="mb-2 px-1 text-[12px] font-medium uppercase tracking-wide text-gray-400">
                  {'Quick Start'}
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {WORKFLOW_PROMPTS.map(wp => (
                    <button
                      key={wp.id}
                      type="button"
                      onClick={() => setInputTextRef.current?.(wp.prompt)}
                      className="rounded-xl border border-gray-100 p-3 text-left transition-colors hover:bg-gray-50">
                      <div className="truncate text-[13px] font-medium text-gray-700">
                        {wp.icon} {wp.name}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-gray-400">{wp.description}</div>
                    </button>
                  ))}
                </div>
              </div>
              {renderChatInput()}
            </div>
          ) : (
            <>
              <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
                <MessageList
                  messages={messages}
                  isStreaming={isStreamingPlanner || isStreamingSynthesizer}
                  onWidgetApply={handleWidgetApply}
                />
                <div ref={messagesEndRef} />
              </div>
              <ThinkingWidget state={thinkingWidgetState} />
              {renderChatInput()}
            </>
          )}
        </>
      )}

      {isAuthenticated === false && <AuthOverlay />}

      {activeGroupOverlay && (
        <ActiveGroupOverlay
          onGoBack={() => {
            const primaryTabId = activeGroupOverlay.primaryTabId;
            chrome.sidePanel.setOptions({ tabId: primaryTabId, path: 'side-panel/index.html', enabled: true });
            chrome.tabs
              .update(primaryTabId, { active: true })
              .then(() => chrome.tabs.get(primaryTabId))
              .then(tab => {
                if (tab.windowId) {
                  chrome.windows.update(tab.windowId, { focused: true });
                  chrome.sidePanel.open({ tabId: primaryTabId });
                }
              })
              .catch(() => {
                setActiveGroupOverlay(null);
              });
          }}
        />
      )}
    </div>
  );
};

export default SidePanel;
