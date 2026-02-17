/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useRef } from 'react';
import { History, SquarePen, Settings } from 'lucide-react';
import {
  type Message,
  Actors,
  chatHistoryStore,
  agentModelStore,
  generalSettingsStore,
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
import favoritesStorage, { type FavoritePrompt } from '@extension/storage/lib/prompt/favorites';
import { t } from '@extension/i18n';
import MessageList from './components/MessageList';
import ChatInput from './components/ChatInput';
import ChatHistoryList from './components/ChatHistoryList';
import BookmarkList from './components/BookmarkList';
import ThinkingWidget from './components/ThinkingWidget';
import { ActiveGroupOverlay } from './components/ActiveGroupOverlay';
import { SlidePanel } from './components/SlidePanel';
import { EventType, type AgentEvent, ExecutionState } from './types/event';
import { useThinkingState } from './hooks/useThinkingState';
import { useTaskTimer } from './hooks/useTaskTimer';
import './SidePanel.css';

declare global {
  interface Window {
    chrome: typeof chrome;
  }
}

function serverRoleToActor(role: string): Actors {
  if (Object.values(Actors).includes(role as Actors)) return role as Actors;
  if (role === 'assistant') return Actors.SYNTHESIZER;
  return Actors.SYSTEM;
}

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
  const [favoritePrompts, setFavoritePrompts] = useState<FavoritePrompt[]>([]);
  const [hasConfiguredModels, setHasConfiguredModels] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingSpeech, setIsProcessingSpeech] = useState(false);
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
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

  useEffect(() => {
    checkModelConfiguration();
    loadGeneralSettings();
  }, [checkModelConfiguration, loadGeneralSettings]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkModelConfiguration();
        loadGeneralSettings();
      }
    };

    const handleFocus = () => {
      checkModelConfiguration();
      loadGeneralSettings();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkModelConfiguration, loadGeneralSettings]);

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
            content: message.error || t('errors_unknown'),
            timestamp: Date.now(),
          });
          setInputEnabled(true);
          setShowStopButton(false);
        } else if (message && message.type === 'speech_to_text_result') {
          if (message.text && setInputTextRef.current) {
            setInputTextRef.current(message.text);
          }
          setIsProcessingSpeech(false);
        } else if (message && message.type === 'speech_to_text_error') {
          appendMessage({
            actor: Actors.SYSTEM,
            content: message.error || t('chat_stt_recognitionFailed'),
            timestamp: Date.now(),
          });
          setIsProcessingSpeech(false);
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
        content: t('errors_conn_serviceWorker'),
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
          content: t('chat_replay_disabled'),
          timestamp: Date.now(),
        });
        return;
      }

      const historyData = await chatHistoryStore.loadAgentStepHistory(historySessionId);
      if (!historyData) {
        appendMessage({
          actor: Actors.SYSTEM,
          content: t('chat_replay_noHistory', historySessionId.substring(0, 20)),
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
        content: t('chat_replay_starting', historyData.task),
        timestamp: Date.now(),
      });
      setIsReplaying(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      appendMessage({
        actor: Actors.SYSTEM,
        content: t('chat_replay_failed', errorMessage),
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
            content: t('chat_replay_invalidArgs'),
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
        content: t('errors_cmd_unknown', command),
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

  const handleSessionBookmark = async (sessionId: string) => {
    try {
      const session = chatSessions.find(s => s.id === sessionId);
      if (session) {
        const title = session.title.split(' ').slice(0, 8).join(' ');
        await favoritesStorage.addPrompt(title, session.title);
        const prompts = await favoritesStorage.getAllPrompts();
        setFavoritePrompts(prompts);
        handleBackToChat(true);
      }
    } catch (error) {
      console.error('Failed to pin session to favorites:', error);
    }
  };

  const handleBookmarkSelect = (content: string) => {
    if (setInputTextRef.current) {
      setInputTextRef.current(content);
    }
  };

  const handleBookmarkUpdateTitle = async (id: number, title: string) => {
    try {
      await favoritesStorage.updatePromptTitle(id, title);
      const prompts = await favoritesStorage.getAllPrompts();
      setFavoritePrompts(prompts);
    } catch (error) {
      console.error('Failed to update favorite prompt title:', error);
    }
  };

  const handleBookmarkDelete = async (id: number) => {
    try {
      await favoritesStorage.removePrompt(id);
      const prompts = await favoritesStorage.getAllPrompts();
      setFavoritePrompts(prompts);
    } catch (error) {
      console.error('Failed to delete favorite prompt:', error);
    }
  };

  const handleBookmarkReorder = async (draggedId: number, targetId: number) => {
    try {
      await favoritesStorage.reorderPrompts(draggedId, targetId);
      const updatedPromptsFromStorage = await favoritesStorage.getAllPrompts();
      setFavoritePrompts(updatedPromptsFromStorage);
    } catch (error) {
      console.error('Failed to reorder favorite prompts:', error);
    }
  };

  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const prompts = await favoritesStorage.getAllPrompts();
        setFavoritePrompts(prompts);
      } catch (error) {
        console.error('Failed to load favorite prompts:', error);
      }
    };

    loadFavorites();
  }, []);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) {
        clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      stopConnection();
    };
  }, [stopConnection]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleMicClick = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) {
        clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setIsRecording(false);
      return;
    }

    try {
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });

      if (permissionStatus.state === 'denied') {
        appendMessage({
          actor: Actors.SYSTEM,
          content: t('chat_stt_microphone_permissionDenied'),
          timestamp: Date.now(),
        });
        return;
      }

      if (permissionStatus.state !== 'granted') {
        const permissionUrl = chrome.runtime.getURL('permission/index.html');

        chrome.windows.create(
          {
            url: permissionUrl,
            type: 'popup',
            width: 500,
            height: 600,
          },
          createdWindow => {
            if (createdWindow?.id) {
              chrome.windows.onRemoved.addListener(function onWindowClose(windowId) {
                if (windowId === createdWindow.id) {
                  chrome.windows.onRemoved.removeListener(onWindowClose);
                  setTimeout(async () => {
                    try {
                      const newPermissionStatus = await navigator.permissions.query({
                        name: 'microphone' as PermissionName,
                      });
                      if (newPermissionStatus.state === 'granted') {
                        handleMicClick();
                      }
                    } catch (error) {
                      console.error('Failed to check permission status:', error);
                    }
                  }, 500);
                }
              });
            }
          },
        );
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());

        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Audio = reader.result as string;

            if (!portRef.current) {
              setupConnection();
            }

            try {
              setIsProcessingSpeech(true);
              portRef.current?.postMessage({
                type: 'speech_to_text',
                audio: base64Audio,
              });
            } catch (error) {
              console.error('Failed to send audio for speech-to-text:', error);
              appendMessage({
                actor: Actors.SYSTEM,
                content: t('chat_stt_processingFailed'),
                timestamp: Date.now(),
              });
              setIsRecording(false);
              setIsProcessingSpeech(false);
            }
          };
          reader.readAsDataURL(audioBlob);
        }
      };

      const maxDuration = 2 * 60 * 1000;
      recordingTimerRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
        setIsProcessingSpeech(true);
        recordingTimerRef.current = null;
      }, maxDuration);

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);

      let errorMessage = t('chat_stt_microphone_accessFailed');
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage += t('chat_stt_microphone_grantPermission');
        } else if (error.name === 'NotFoundError') {
          errorMessage += t('chat_stt_microphone_notFound');
        } else {
          errorMessage += error.message;
        }
      }

      appendMessage({
        actor: Actors.SYSTEM,
        content: errorMessage,
        timestamp: Date.now(),
      });
      setIsRecording(false);
    }
  };

  const renderChatInput = () => (
    <ChatInput
      onSendMessage={handleSendMessage}
      onStopTask={handleStopTask}
      onMicClick={handleMicClick}
      isRecording={isRecording}
      isProcessingSpeech={isProcessingSpeech}
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
            aria-label={t('nav_loadHistory_a11y')}>
            <History size={15} />
          </button>
          <button
            type="button"
            onClick={handleNewChat}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label={t('nav_newChat_a11y')}>
            <SquarePen size={15} />
          </button>
          <button
            type="button"
            onClick={() => chrome.runtime.openOptionsPage()}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label={t('nav_settings_a11y')}>
            <Settings size={15} />
          </button>
        </div>
      </header>

      <SlidePanel
        open={showHistory}
        onClose={() => handleBackToChat(false)}
        title={t('chat_history_title')}
        side="left">
        <ChatHistoryList
          sessions={chatSessions}
          onSessionSelect={handleSessionSelect}
          onSessionDelete={handleSessionDelete}
          onSessionBookmark={handleSessionBookmark}
        />
      </SlidePanel>

      {hasConfiguredModels === null && (
        <div className="text-accent flex flex-1 items-center justify-center p-8">
          <div className="text-center">
            <div className="border-accent mx-auto mb-4 size-8 animate-spin rounded-full border-2 border-t-transparent" />
            <p>{t('status_checkingConfig')}</p>
          </div>
        </div>
      )}

      {hasConfiguredModels === false && (
        <div className="text-accent-foreground flex flex-1 items-center justify-center p-8">
          <div className="max-w-md text-center">
            <img src="/autumn-logo.svg" alt="Autumn" className="mx-auto mb-4 h-8 opacity-60" />
            <h3 className="mb-2 text-lg font-semibold text-gray-900">{t('welcome_title')}</h3>
            <p className="mb-4 text-[13px] text-gray-500">{t('welcome_instruction')}</p>
            <button
              onClick={() => chrome.runtime.openOptionsPage()}
              className="bg-accent hover:bg-accent-hover my-4 rounded-lg px-4 py-2 font-medium text-white transition-colors">
              {t('welcome_openSettings')}
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
                  {t('welcome_subtitle')}
                </p>
              </div>
              <div className="scrollbar-thin overflow-y-auto">
                <BookmarkList
                  bookmarks={favoritePrompts}
                  onBookmarkSelect={handleBookmarkSelect}
                  onBookmarkUpdateTitle={handleBookmarkUpdateTitle}
                  onBookmarkDelete={handleBookmarkDelete}
                  onBookmarkReorder={handleBookmarkReorder}
                />
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
