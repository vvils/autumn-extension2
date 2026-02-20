/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { LayoutGrid, ArrowLeft, SquarePen } from 'lucide-react';
import {
  type Message,
  Actors,
  chatHistoryStore,
  agentModelStore,
  generalSettingsStore,
  serverSettingsStore,
  shortcutSettingsStore,
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
import { ShortcutEditorModal } from './components/ShortcutEditorModal';
import type { ShortcutActions } from './components/ChatInput';
import { WORKFLOW_PROMPTS } from './constants/workflowPrompts';
import { EventType, type AgentEvent, ExecutionState } from './types/event';
import { useThinkingState } from './hooks/useThinkingState';
import { useTaskTimer } from './hooks/useTaskTimer';
import { Tooltip } from './components/Tooltip';
import './SidePanel.css';

function serverRoleToActor(role: string): Actors {
  if (Object.values(Actors).includes(role as Actors)) return role as Actors;
  if (role === 'assistant') return Actors.SYNTHESIZER;
  return Actors.SYSTEM;
}

const CLIENT_URL = import.meta.env.VITE_CLIENT_URL || 'http://localhost:3000';

const SidePanel = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const { state: thinkingWidgetState, handleEvent: handleThinkingEvent, reset: resetThinking } = useThinkingState();
  const { formattedTime: elapsedTime, start: startTimer, stop: stopTimer, reset: resetTimer } = useTaskTimer();
  const [inputEnabled, setInputEnabled] = useState(true);
  const [showStopButton, setShowStopButton] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isNewChatMode, setIsNewChatMode] = useState(false);
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
  const [shortcutEditorData, setShortcutEditorData] = useState<{
    command: string;
    prompt: string;
    id?: string;
    source: 'input' | 'message' | 'create';
  } | null>(null);
  const [existingCommands, setExistingCommands] = useState<string[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const isReplayingRef = useRef<boolean>(false);
  const plannerStreamingRef = useRef(false);
  const synthesizerStreamingRef = useRef(false);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const setInputTextRef = useRef<((text: string) => void) | null>(null);
  const focusInputRef = useRef<(() => void) | null>(null);
  const shortcutActionsRef = useRef<ShortcutActions | null>(null);
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

  const showingChatHistory = hasConfiguredModels === true && messages.length === 0 && !isNewChatMode;

  useEffect(() => {
    checkModelConfiguration();
    loadGeneralSettings();
  }, [checkModelConfiguration, loadGeneralSettings]);

  const requestAuthDetection = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'detect_auth', clientUrl: CLIENT_URL }).catch(() => {});
  }, []);

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

  const handlePermissionResponse = useCallback(
    (widgetId: string, response: string) => {
      console.log('[ask_user] sending permission_response', { widgetId, response, hasPort: !!portRef.current });
      portRef.current?.postMessage({ type: 'permission_response', widgetId, response });
      setMessages(prev =>
        prev.map(msg => ({
          ...msg,
          widgets: msg.widgets?.map(w =>
            w.widgetId === widgetId ? { ...w, data: { ...w.data, answered: true, response } } : w,
          ),
        })),
      );
      persistMessage({
        actor: 'navigator_widget_response',
        content: JSON.stringify({ widgetId, response }),
        timestamp: Date.now(),
      });
    },
    [persistMessage],
  );

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
              setIsFollowUpMode(true);
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
            case ExecutionState.WIDGET_EVENT: {
              try {
                const widgetData = JSON.parse(content || '{}');
                if (!widgetData.widgetId || !widgetData.type) return;
                setMessages(prev => [...prev, { actor: Actors.SYSTEM, content: '', timestamp, widgets: [widgetData] }]);
                persistMessage({ actor: 'planner_widget', content: content || '', timestamp });
              } catch (err) {
                console.error('Failed to parse planner widget event:', err);
              }
              return;
            }
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
              skip = !isReplayingRef.current && !content?.startsWith('Integration result:');
              break;
            case ExecutionState.ACT_FAIL:
              skip = false;
              break;
            case ExecutionState.WIDGET_EVENT: {
              try {
                const widgetData = JSON.parse(content || '{}');
                if (!widgetData.widgetId || !widgetData.type) return;
                setMessages(prev => [...prev, { actor: Actors.SYSTEM, content: '', timestamp, widgets: [widgetData] }]);
                persistMessage({ actor: 'navigator_widget', content: content || '', timestamp });
              } catch (err) {
                console.error('Failed to parse navigator widget event:', err);
              }
              return;
            }
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
            } else if (m.role === 'planner_widget') {
              try {
                const widgetData = JSON.parse(m.content);
                mapped.push({
                  actor: Actors.SYSTEM,
                  content: '',
                  timestamp: new Date(m.createdAt).getTime(),
                  widgets: [widgetData],
                });
              } catch {
                /* ignore malformed widget data */
              }
            } else if (m.role === 'navigator_widget') {
              try {
                const widgetData = JSON.parse(m.content);
                mapped.push({
                  actor: Actors.SYSTEM,
                  content: '',
                  timestamp: new Date(m.createdAt).getTime(),
                  widgets: [widgetData],
                });
              } catch {
                /* ignore malformed widget data */
              }
            } else if (m.role === 'navigator_widget_response') {
              try {
                const { widgetId, response } = JSON.parse(m.content);
                for (let i = mapped.length - 1; i >= 0; i--) {
                  const widgets = mapped[i].widgets;
                  if (widgets?.some(w => w.widgetId === widgetId)) {
                    mapped[i] = {
                      ...mapped[i],
                      widgets: widgets.map(w =>
                        w.widgetId === widgetId ? { ...w, data: { ...w.data, answered: true, response } } : w,
                      ),
                    };
                    break;
                  }
                }
              } catch {
                /* ignore malformed response data */
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
          setIsNewChatMode(false);
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
        } else if (message && message.type === 'voice_result') {
          if (message.transcript && setInputTextRef.current) {
            setInputTextRef.current(message.transcript);
          }
          setIsRecording(false);
        } else if (message && message.type === 'voice_error') {
          if (message.error === 'not-allowed') {
            chrome.tabs.create({ url: chrome.runtime.getURL('permission/index.html') });
            appendMessage({
              actor: Actors.SYSTEM,
              content: 'Please grant microphone permission in the new tab, then try again.',
              timestamp: Date.now(),
            });
          } else {
            appendMessage({
              actor: Actors.SYSTEM,
              content: `Voice input failed: ${message.error}`,
              timestamp: Date.now(),
            });
          }
          setIsRecording(false);
        } else if (message && message.type === 'voice_end') {
          setIsRecording(false);
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
        setTimeout(() => {
          setupConnection();
        }, 1000);
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

  const handleSendMessage = async (
    text: string,
    displayText?: string,
    shortcutsMeta?: Array<{ command: string; prompt: string }>,
  ) => {
    console.log('handleSendMessage', text);

    let trimmedText = text.trim();

    if (!trimmedText) return;

    if (trimmedText.startsWith('/')) {
      const commandName = trimmedText.slice(1).split(/\s/)[0];
      const shortcut = await shortcutSettingsStore.getShortcutByCommand(commandName);
      if (shortcut) {
        displayText = displayText || trimmedText;
        shortcutsMeta = shortcutsMeta || [{ command: commandName, prompt: shortcut.prompt }];
        trimmedText = shortcut.prompt;
      }
    }

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

      const userMessage: Message = {
        actor: Actors.USER,
        content: displayText || text,
        timestamp: Date.now(),
        ...(shortcutsMeta && { shortcuts: shortcutsMeta }),
      };

      appendMessage(userMessage, sessionIdRef.current);
      setIsNewChatMode(false);

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
    setIsNewChatMode(true);
    resetThinking();
    resetTimer();
    setCostData(null);
    stopConnection();
    requestAnimationFrame(() => focusInputRef.current?.());
  };

  const loadChatSessions = useCallback(() => {
    if (!portRef.current) {
      setupConnection();
    }
    portRef.current?.postMessage({ type: 'get_conversations' });
  }, [setupConnection]);

  useEffect(() => {
    if (hasConfiguredModels === true) {
      loadChatSessions();
    }
  }, [hasConfiguredModels, loadChatSessions]);

  const handleBackToHistory = () => {
    portRef.current?.postMessage({ type: 'cancel_task' });
    setShowStopButton(false);
    setInputEnabled(true);

    loadChatSessions();
    setMessages([]);
    setCurrentSessionId(null);
    sessionIdRef.current = null;
    setIsFollowUpMode(false);
    setIsHistoricalSession(false);
    setIsNewChatMode(false);
    resetThinking();
    resetTimer();
    setCostData(null);
    stopConnection();
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
      portRef.current?.postMessage({ type: 'voice_stop' });
      stopConnection();
    };
  }, [stopConnection]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleMicClick = () => {
    if (isRecording) {
      portRef.current?.postMessage({ type: 'voice_stop' });
      setIsRecording(false);
      return;
    }

    portRef.current?.postMessage({ type: 'voice_start', lang: navigator.language });
    setIsRecording(true);
  };

  const handleEditShortcutFromInput = useCallback((shortcut: { id: string; command: string; prompt: string }) => {
    setShortcutEditorData({ ...shortcut, source: 'input' });
  }, []);

  const handleCreateShortcut = useCallback(() => {
    setShortcutEditorData({ command: '', prompt: '', source: 'create' });
  }, []);

  useEffect(() => {
    if (shortcutEditorData) {
      shortcutSettingsStore.getSettings().then(s => setExistingCommands(s.shortcuts.map(sc => sc.command)));
    }
  }, [shortcutEditorData]);

  const handleShortcutClickFromMessage = useCallback(async (shortcut: { command: string; prompt: string }) => {
    const stored = await shortcutSettingsStore.getShortcutByCommand(shortcut.command);
    setShortcutEditorData({
      command: shortcut.command,
      prompt: stored?.prompt ?? shortcut.prompt,
      id: stored?.id,
      source: 'message',
    });
  }, []);

  const handleShortcutEditorSave = useCallback(
    async (command: string, prompt: string) => {
      if (shortcutEditorData?.source === 'create') {
        await shortcutSettingsStore.addShortcut(command, prompt);
      } else if (shortcutEditorData?.id) {
        await shortcutSettingsStore.updateShortcut(shortcutEditorData.id, { command, prompt });
      } else {
        const stored = await shortcutSettingsStore.getShortcutByCommand(shortcutEditorData?.command ?? '');
        if (stored) {
          await shortcutSettingsStore.updateShortcut(stored.id, { command, prompt });
        }
      }
      if (shortcutEditorData?.source === 'input') {
        shortcutActionsRef.current?.updateShortcut(command, prompt);
      }
      setShortcutEditorData(null);
    },
    [shortcutEditorData],
  );

  const handleShortcutEditorDelete = useCallback(async () => {
    if (shortcutEditorData?.id) {
      await shortcutSettingsStore.deleteShortcut(shortcutEditorData.id);
    } else {
      const stored = await shortcutSettingsStore.getShortcutByCommand(shortcutEditorData?.command ?? '');
      if (stored) {
        await shortcutSettingsStore.deleteShortcut(stored.id);
      }
    }
    if (shortcutEditorData?.source === 'input') {
      shortcutActionsRef.current?.clearShortcut();
    }
    setShortcutEditorData(null);
  }, [shortcutEditorData]);

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
      setFocusInput={fn => {
        focusInputRef.current = fn;
      }}
      onEditShortcut={handleEditShortcutFromInput}
      onCreateShortcut={handleCreateShortcut}
      setShortcutActions={actions => {
        shortcutActionsRef.current = actions;
      }}
      historicalSessionId={isHistoricalSession && replayEnabled ? currentSessionId : null}
      onReplay={handleReplay}
      costData={showCostEstimate ? costData : null}
      elapsedTime={showCostEstimate ? elapsedTime : null}
      isInConversation={messages.length > 0 || isFollowUpMode}
    />
  );

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[#fafafa]">
      <header className="relative flex shrink-0 items-center justify-between bg-[#fafafa] px-4 py-2.5">
        <div className="flex items-center gap-1">
          <Tooltip label={showingChatHistory ? 'Home' : 'Back'}>
            <button
              type="button"
              onClick={showingChatHistory ? () => chrome.tabs.create({ url: CLIENT_URL }) : handleBackToHistory}
              className="rounded-md p-1.5 text-black/40 transition-colors hover:bg-black/[0.05] hover:text-black/60"
              aria-label={showingChatHistory ? 'Home' : 'Back'}>
              {showingChatHistory ? (
                <svg width="15" height="15" viewBox="0 0 17 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M0.515885 16V12.1677L8.25415 6.27189L0.368489 10.3253C0.0736978 9.79465 0 8.82675 0 8.40912C0.353749 3.75142 3.19357 1.55523 4.56926 1.03935C7.87092 -0.552522 13.6587 0.0321474 16.1398 0.523466C16.7884 3.82513 13.8061 5.82971 12.2338 6.41929H15.2554C14.9607 8.83658 11.8408 10.0305 10.3177 10.3253H13.5604C12.7939 11.9171 11.1775 13.1012 10.4651 13.4943C7.92988 15.2041 4.00425 14.5506 2.35833 14.0102V16H0.515885Z" />
                </svg>
              ) : (
                <ArrowLeft size={15} />
              )}
            </button>
          </Tooltip>
          <Tooltip label="Settings">
            <button
              type="button"
              onClick={() => chrome.runtime.openOptionsPage()}
              className="rounded-md p-1.5 text-black/40 transition-colors hover:bg-black/[0.05] hover:text-black/60"
              aria-label="Settings">
              <LayoutGrid size={15} />
            </button>
          </Tooltip>
        </div>
        <img src="/autumn-logo.svg" alt="autumn" className="absolute left-1/2 -translate-x-1/2 h-3" />
        <Tooltip label="New Chat" align="end">
          <button
            type="button"
            onClick={handleNewChat}
            className="rounded-md p-1.5 text-black/40 transition-colors hover:bg-black/[0.05] hover:text-black/60"
            aria-label="New Chat">
            <SquarePen size={15} />
          </button>
        </Tooltip>
      </header>

      {hasConfiguredModels === null && (
        <div className="flex flex-1 items-center justify-center p-8 text-black/50">
          <div className="text-center">
            <div className="mx-auto mb-4 size-8 animate-spin rounded-full border-2 border-black/40 border-t-transparent" />
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
              className="my-4 rounded-lg bg-black px-4 py-2 font-medium text-white transition-colors hover:bg-black/90">
              {'Open Settings'}
            </button>
          </div>
        </div>
      )}

      {hasConfiguredModels === true && (
        <div className="flex w-full flex-1 flex-col overflow-hidden">
          {showingChatHistory ? (
            <div className="relative flex flex-1 flex-col overflow-hidden">
              <div className="no-scrollbar flex-1 overflow-y-auto pb-24">
                {WORKFLOW_PROMPTS.length > 0 && (
                  <div className="pb-2 pt-3">
                    <p className="px-4 pb-2 text-[13px] font-normal text-black/40">Quick Actions</p>
                    <div className="scrollbar-cute flex gap-2 overflow-x-auto px-4">
                      {WORKFLOW_PROMPTS.map(wp => (
                        <button
                          key={wp.id}
                          type="button"
                          onClick={() => handleSendMessage(wp.prompt, wp.name)}
                          className="group flex shrink-0 items-center gap-0.5 rounded-xl bg-black/[0.03] px-3.5 py-2 text-[13px] transition-colors duration-100 hover:bg-black/[0.06]">
                          <span className="font-normal text-black/80 whitespace-nowrap group-hover:text-black">
                            {wp.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <ChatHistoryList
                  sessions={chatSessions}
                  onSessionSelect={handleSessionSelect}
                  onSessionDelete={handleSessionDelete}
                />
              </div>
              <div className="absolute inset-x-0 bottom-0 z-10">{renderChatInput()}</div>
            </div>
          ) : messages.length === 0 ? (
            <div className="relative flex flex-1 flex-col overflow-hidden">
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-[30%]">
                <img src="/logo.svg" alt="Autumn" className="h-8" />
              </div>
              <div className="flex-1" />
              {renderChatInput()}
            </div>
          ) : (
            <>
              <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
                <MessageList
                  messages={messages}
                  isStreaming={isStreamingPlanner || isStreamingSynthesizer}
                  onWidgetApply={handleWidgetApply}
                  onWidgetRespond={handlePermissionResponse}
                  onShortcutClick={handleShortcutClickFromMessage}
                />
                <div ref={messagesEndRef} />
              </div>
              <ThinkingWidget state={thinkingWidgetState} />
              {renderChatInput()}
            </>
          )}
        </div>
      )}

      <ShortcutEditorModal
        open={!!shortcutEditorData}
        onClose={() => setShortcutEditorData(null)}
        shortcut={shortcutEditorData?.source === 'create' ? null : shortcutEditorData}
        onSave={handleShortcutEditorSave}
        onDelete={handleShortcutEditorDelete}
        existingCommands={existingCommands}
      />

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
