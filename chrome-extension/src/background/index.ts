import 'webextension-polyfill';
import {
  agentModelStore,
  AgentNameEnum,
  firewallStore,
  generalSettingsStore,
  llmProviderStore,
  analyticsSettingsStore,
  serverSettingsStore,
  integrationSettingsStore,
  shortcutSettingsStore,
  quickActionSettingsStore,
  type CuratedAction,
  type ManifestProp,
} from '@extension/storage';
import BrowserContext from './browser/context';
import { Executor } from './agent/executor';
import { createLogger } from './log';
import { ExecutionState } from './agent/event/types';
import { createChatModel } from './agent/helper';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { injectBuildDomTreeScripts } from './browser/dom/service';
import { analytics } from './services/analytics';
import { ServerClient, detectTokenFromTabs, listenForWebAppAuth, watchTabsForAuth } from './services/server';
import type { AddMessagePayload } from './services/server/types';
import { validateWidgetApplyRequest, executeWidgetApply } from './services/widgetApply';

const logger = createLogger('background');

const browserContext = new BrowserContext({});
let currentExecutor: Executor | null = null;
let serverClient: ServerClient | null = null;
let cachedHotelCapabilities: string | undefined;
let currentPort: chrome.runtime.Port | null = null;
let tokenExpiryTimer: ReturnType<typeof setTimeout> | null = null;
const SIDE_PANEL_URL = chrome.runtime.getURL('side-panel/index.html');

class MessageRetryQueue {
  private queue: Array<{ conversationId: string; payload: AddMessagePayload; retries: number }> = [];
  private processing = false;

  enqueue(conversationId: string, payload: AddMessagePayload) {
    this.queue.push({ conversationId, payload, retries: 0 });
    this.processQueue();
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const item = this.queue[0];
      try {
        if (serverClient && (await serverClient.isAuthenticated())) {
          await serverClient.addMessage(item.conversationId, item.payload);
          this.queue.shift();
        } else {
          break;
        }
      } catch {
        item.retries++;
        if (item.retries >= 3) {
          logger.error(`Dropping message after 3 retries for conversation ${item.conversationId}`);
          this.queue.shift();
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, item.retries)));
        }
      }
    }
    this.processing = false;
  }
}

const messageRetryQueue = new MessageRetryQueue();

async function openSidePanel(tabId: number): Promise<void> {
  chrome.sidePanel.setOptions({ tabId, path: 'side-panel/index.html', enabled: true });
  chrome.sidePanel.open({ tabId });

  const mgr = browserContext.tabGroupManager;
  const tab = await chrome.tabs.get(tabId);
  const isInChromeGroup = tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE;

  if (isInChromeGroup && mgr.primaryTabForGroup(tab.groupId) != null) {
    // Already tracked — nothing to do
  } else if (isInChromeGroup) {
    mgr.adoptGroup(tab.groupId, tabId);
  } else {
    await mgr.createGroup(tabId);
  }
}

chrome.action.onClicked.addListener(async tab => {
  if (!tab.id) return;
  try {
    await openSidePanel(tab.id);
  } catch (error) {
    logger.error('Failed to open side panel:', error);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId && changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
    await injectBuildDomTreeScripts(tabId);
  }
});

// Listen for debugger detached event
// if canceled_by_user, remove the tab from the browser context
chrome.debugger.onDetach.addListener(async (source, reason) => {
  console.log('Debugger detached:', source, reason);
  if (reason === 'canceled_by_user') {
    if (source.tabId) {
      currentExecutor?.cancel();
      await browserContext.cleanup();
    }
  }
});

// Cleanup when tab is closed
chrome.tabs.onRemoved.addListener(async tabId => {
  browserContext.removeAttachedPage(tabId);
  const mgr = browserContext.tabGroupManager;
  const newPrimaryId = await mgr.removeTab(tabId);
  if (newPrimaryId !== null) {
    chrome.sidePanel.setOptions({ tabId: newPrimaryId, path: 'side-panel/index.html', enabled: true });
  }
});

let creatingOffscreen: Promise<void> | null = null;

async function ensureOffscreenDocument(): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl],
  });
  if (contexts.length > 0) return;

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: offscreenUrl,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Speech recognition requires a document context with media access',
  });
  await creatingOffscreen;
  creatingOffscreen = null;
}

logger.info('background loaded');

chrome.runtime.onInstalled.addListener(async () => {
  // Reserved for future install/update hooks
});

analytics.init().catch((error: unknown) => {
  logger.error('Failed to initialize analytics:', error);
});

analyticsSettingsStore.subscribe(() => {
  analytics.updateSettings().catch((error: unknown) => {
    logger.error('Failed to update analytics settings:', error);
  });
});

async function autoPopulateServerUrls() {
  const settings = await serverSettingsStore.getSettings();
  const updates: Partial<typeof settings> = {};
  if (!settings.serverUrl && import.meta.env.VITE_SERVER_URL) {
    updates.serverUrl = import.meta.env.VITE_SERVER_URL;
  }
  if (!settings.clientUrl && import.meta.env.VITE_CLIENT_URL) {
    updates.clientUrl = import.meta.env.VITE_CLIENT_URL;
  }
  if (Object.keys(updates).length > 0) {
    await serverSettingsStore.updateSettings(updates);
  }
}

function scheduleTokenExpiryCheck() {
  if (tokenExpiryTimer) {
    clearTimeout(tokenExpiryTimer);
    tokenExpiryTimer = null;
  }
  const snapshot = serverSettingsStore.getSnapshot();
  if (!snapshot?.accessToken || !snapshot.tokenExpiresAt) return;
  const msUntilExpiry = snapshot.tokenExpiresAt - Date.now();
  if (msUntilExpiry <= 0) {
    serverSettingsStore.clearAuth();
    return;
  }
  tokenExpiryTimer = setTimeout(() => {
    serverSettingsStore.clearAuth();
  }, msUntilExpiry);
}

async function initServerClient() {
  await autoPopulateServerUrls();
  serverClient = await ServerClient.create(serverSettingsStore);
  cachedHotelCapabilities = undefined;
  if (serverClient) {
    logger.info('Server client initialized');
    try {
      if (!(await serverClient.isAuthenticated())) {
        await detectTokenFromTabs(serverSettingsStore);
      }
      if (await serverClient.isAuthenticated()) {
        const manifest = await serverClient.fetchHotelContext();
        if (manifest) {
          cachedHotelCapabilities = manifest.capabilities.map(c => `   - ${c.name}: ${c.description}`).join('\n');
          logger.info(`Hotel context loaded: ${manifest.capabilities.length} capabilities`);
        }

        try {
          const pullResult = await serverClient.pullKeys();
          const serverKeys = pullResult.keys;

          if (serverKeys && Object.keys(serverKeys).length > 0) {
            for (const [id, config] of Object.entries(serverKeys)) {
              await llmProviderStore.setProvider(id, config);
            }
            logger.info(`Pulled ${Object.keys(serverKeys).length} provider keys from server`);
          }

          if (pullResult.agentModels) {
            for (const [agentKey, assignment] of Object.entries(pullResult.agentModels)) {
              if (!Object.values(AgentNameEnum).includes(agentKey as AgentNameEnum)) {
                logger.warning(`Unknown agent name from server: ${agentKey}, skipping`);
                continue;
              }
              if (!assignment.provider || !assignment.modelName) {
                logger.warning(`Incomplete agent model assignment for ${agentKey}, skipping`);
                continue;
              }
              await agentModelStore.setAgentModel(agentKey as AgentNameEnum, {
                provider: assignment.provider,
                modelName: assignment.modelName,
                parameters: assignment.parameters,
                reasoningEffort: assignment.reasoningEffort,
              });
            }
            logger.info(`Applied ${Object.keys(pullResult.agentModels).length} agent model assignments from server`);
          }
        } catch (error) {
          logger.warning('Failed to pull keys from server:', error);
        }

        try {
          const accounts = await serverClient.getConnectedAccounts();
          const manifest = await serverClient.getIntegrationManifest();

          if (manifest) {
            const flatActions: CuratedAction[] = [];
            for (const [appSlug, app] of Object.entries(manifest.apps)) {
              for (const action of app.actions) {
                flatActions.push({ ...action, appSlug });
              }
            }

            await integrationSettingsStore.updateSettings({
              connectedAccounts: accounts.map(a => ({
                accountId: a.id,
                appName: a.app.name,
                appSlug: a.app.nameSlug,
                createdAt: new Date(a.createdAt).getTime(),
              })),
              availableActions: flatActions,
              lastSyncedAt: Date.now(),
            });

            logger.info(`Integration data loaded: ${accounts.length} accounts, ${flatActions.length} actions`);
          }
        } catch (error) {
          logger.warning('Failed to fetch integration data:', error);
        }

        try {
          const serverShortcuts = await serverClient.getShortcuts();
          const localSettings = await shortcutSettingsStore.getSettings();

          if (serverShortcuts.length === 0 && localSettings.shortcuts.length > 0) {
            await serverClient.syncShortcuts(
              localSettings.shortcuts.map(s => ({ command: s.command, prompt: s.prompt, createdAt: s.createdAt })),
            );
            const synced = await serverClient.getShortcuts();
            await shortcutSettingsStore.updateSettings({
              shortcuts: synced.map(s => ({
                id: s.id,
                command: s.command,
                prompt: s.prompt,
                createdAt: new Date(s.createdAt).getTime(),
              })),
            });
            logger.info(`Migrated ${synced.length} shortcuts to server`);
          } else if (serverShortcuts.length > 0) {
            await shortcutSettingsStore.updateSettings({
              shortcuts: serverShortcuts.map(s => ({
                id: s.id,
                command: s.command,
                prompt: s.prompt,
                createdAt: new Date(s.createdAt).getTime(),
              })),
            });
            logger.info(`Loaded ${serverShortcuts.length} shortcuts from server`);
          }
        } catch (error) {
          logger.warning('Failed to sync shortcuts from server:', error);
        }

        try {
          const serverQuickActions = await serverClient.getQuickActions();
          if (serverQuickActions.length > 0) {
            await quickActionSettingsStore.updateSettings({
              quickActions: serverQuickActions.map(qa => ({
                id: qa.id,
                name: qa.name,
                prompt: qa.prompt,
                description: qa.description,
                icon: qa.icon,
                sortOrder: qa.sortOrder,
                createdAt: new Date(qa.createdAt).getTime(),
              })),
            });
            logger.info(`Loaded ${serverQuickActions.length} quick actions from server`);
          }
        } catch (error) {
          logger.warning('Failed to fetch quick actions from server:', error);
        }
      }
    } catch (error) {
      logger.warning('Failed to fetch hotel context:', error);
    }
  } else {
    logger.info('Server not configured, standalone mode');
  }
  scheduleTokenExpiryCheck();
}

initServerClient().catch(error => {
  logger.error('Failed to initialize server client:', error);
});

let lastServerUrl = '';
serverSettingsStore.subscribe(() => {
  const settings = serverSettingsStore.getSnapshot();
  const currentUrl = settings?.serverUrl ?? '';
  if (currentUrl !== lastServerUrl) {
    lastServerUrl = currentUrl;
    initServerClient().catch(error => {
      logger.error('Failed to reinitialize server client:', error);
    });
  }
});

const reinitOnAuthChange = () => {
  scheduleTokenExpiryCheck();
  initServerClient().catch(error => {
    logger.error('Failed to reinit after auth change:', error);
  });
};

listenForWebAppAuth(serverSettingsStore, reinitOnAuthChange);
watchTabsForAuth(serverSettingsStore, reinitOnAuthChange);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'detect_auth') return;
  (async () => {
    if (message.clientUrl) {
      const settings = await serverSettingsStore.getSettings();
      if (!settings.clientUrl) {
        await serverSettingsStore.updateSettings({ clientUrl: message.clientUrl });
      }
    }
    const found = await detectTokenFromTabs(serverSettingsStore);
    if (found) {
      initServerClient().catch(error => {
        logger.error('Failed to reinit after detect_auth:', error);
      });
    }
  })();
  sendResponse({ received: true });
  return true;
});

chrome.runtime.onMessage.addListener(message => {
  if (message?.type === 'voice_result' || message?.type === 'voice_error' || message?.type === 'voice_end') {
    if (currentPort) {
      currentPort.postMessage(message);
    }
  }
});

chrome.runtime.onMessage.addListener((message, _sender) => {
  if (message?.type === 'shortcut_created') {
    (async () => {
      if (!serverClient || !(await serverClient.isAuthenticated())) return;
      try {
        const result = await serverClient.createShortcut(message.command, message.prompt);
        const settings = await shortcutSettingsStore.getSettings();
        await shortcutSettingsStore.updateSettings({
          shortcuts: settings.shortcuts.map(s => (s.id === message.localId ? { ...s, id: result.id } : s)),
        });
      } catch (error) {
        logger.warning('Failed to sync shortcut creation to server:', error);
      }
    })();
  }

  if (message?.type === 'shortcut_updated') {
    (async () => {
      if (!serverClient || !(await serverClient.isAuthenticated())) return;
      try {
        await serverClient.updateShortcut(message.id, message.updates);
      } catch (error) {
        logger.warning('Failed to sync shortcut update to server:', error);
      }
    })();
  }

  if (message?.type === 'shortcut_deleted') {
    (async () => {
      if (!serverClient || !(await serverClient.isAuthenticated())) return;
      try {
        await serverClient.deleteShortcut(message.id);
      } catch (error) {
        logger.warning('Failed to sync shortcut deletion to server:', error);
      }
    })();
  }
});

// Setup connection listener for long-lived connections (e.g., side panel)
chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'side-panel-connection') {
    const senderUrl = port.sender?.url;
    const senderId = port.sender?.id;

    if (!senderUrl || senderId !== chrome.runtime.id || senderUrl !== SIDE_PANEL_URL) {
      logger.warning('Blocked unauthorized side-panel-connection', senderId, senderUrl);
      port.disconnect();
      return;
    }

    currentPort = port;

    port.onMessage.addListener(async message => {
      try {
        switch (message.type) {
          case 'heartbeat':
            // Acknowledge heartbeat
            port.postMessage({ type: 'heartbeat_ack' });
            break;

          case 'detect_auth': {
            if (message.clientUrl) {
              const settings = await serverSettingsStore.getSettings();
              if (!settings.clientUrl) {
                await serverSettingsStore.updateSettings({ clientUrl: message.clientUrl });
              }
            }
            const found = await detectTokenFromTabs(serverSettingsStore);
            if (found) {
              initServerClient().catch(error => {
                logger.error('Failed to reinit after detect_auth:', error);
              });
            }
            break;
          }

          case 'new_task': {
            if (!message.task) return port.postMessage({ type: 'error', error: 'No task provided' });
            if (!message.tabId) return port.postMessage({ type: 'error', error: 'No tab ID provided' });

            logger.info('new_task', message.tabId, message.task);
            browserContext.updateCurrentTabId(message.tabId);
            browserContext.tabGroupManager.updatePrimaryTab(message.tabId);
            currentExecutor = await setupExecutor(message.taskId, message.task, browserContext);
            subscribeToExecutorEvents(currentExecutor);

            const result = await currentExecutor.execute();
            logger.info('new_task execution result', message.tabId, result);
            break;
          }

          case 'follow_up_task': {
            if (!message.task) return port.postMessage({ type: 'error', error: 'No follow up task provided' });
            if (!message.tabId) return port.postMessage({ type: 'error', error: 'No tab ID provided' });

            logger.info('follow_up_task', message.tabId, message.task);
            browserContext.updateCurrentTabId(message.tabId);
            browserContext.tabGroupManager.updatePrimaryTab(message.tabId);

            // If executor exists, add follow-up task
            if (currentExecutor) {
              currentExecutor.addFollowUpTask(message.task);
              // Re-subscribe to events in case the previous subscription was cleaned up
              subscribeToExecutorEvents(currentExecutor);
              const result = await currentExecutor.execute();
              logger.info('follow_up_task execution result', message.tabId, result);
            } else {
              // executor was cleaned up, can not add follow-up task
              logger.info('follow_up_task: executor was cleaned up, can not add follow-up task');
              return port.postMessage({ type: 'error', error: 'Executor was cleaned up, can not add follow-up task' });
            }
            break;
          }

          case 'cancel_task': {
            if (!currentExecutor) return port.postMessage({ type: 'error', error: 'No running task' });
            await currentExecutor.cancel();
            break;
          }

          case 'resume_task': {
            if (!currentExecutor) return port.postMessage({ type: 'error', error: 'No task to resume' });
            await currentExecutor.resume();
            return port.postMessage({ type: 'success' });
          }

          case 'pause_task': {
            if (!currentExecutor) return port.postMessage({ type: 'error', error: 'No running task' });
            await currentExecutor.pause();
            return port.postMessage({ type: 'success' });
          }

          case 'screenshot': {
            if (!message.tabId) return port.postMessage({ type: 'error', error: 'No tab ID provided' });
            const page = await browserContext.switchTab(message.tabId);
            const screenshot = await page.takeScreenshot();
            logger.info('screenshot', message.tabId, screenshot);
            return port.postMessage({ type: 'success', screenshot });
          }

          case 'replay': {
            if (!message.tabId) return port.postMessage({ type: 'error', error: 'No tab ID provided' });
            if (!message.taskId) return port.postMessage({ type: 'error', error: 'No task ID provided' });
            if (!message.historySessionId)
              return port.postMessage({ type: 'error', error: 'No history session ID provided' });
            logger.info('replay', message.tabId, message.taskId, message.historySessionId);

            try {
              // Switch to the specified tab
              await browserContext.switchTab(message.tabId);
              // Setup executor with the new taskId and a dummy task description
              currentExecutor = await setupExecutor(message.taskId, message.task, browserContext);
              subscribeToExecutorEvents(currentExecutor);

              // Run replayHistory with the history session ID
              const result = await currentExecutor.replayHistory(message.historySessionId);
              logger.debug('replay execution result', message.tabId, result);
            } catch (error) {
              logger.error('Replay failed:', error);
              return port.postMessage({
                type: 'error',
                error: error instanceof Error ? error.message : 'Replay failed',
              });
            }
            break;
          }

          case 'get_conversations': {
            try {
              if (serverClient && (await serverClient.isAuthenticated())) {
                const conversations = await serverClient.getConversations();
                port.postMessage({ type: 'conversations_result', conversations });
              } else {
                port.postMessage({ type: 'conversations_result', conversations: [] });
              }
            } catch (error) {
              logger.error('get_conversations failed:', error);
              port.postMessage({ type: 'conversations_result', conversations: [] });
            }
            break;
          }

          case 'get_conversation_messages': {
            const convId = message.conversationId;
            try {
              if (serverClient && (await serverClient.isAuthenticated())) {
                const messages = await serverClient.getConversationMessages(convId);
                port.postMessage({ type: 'conversation_messages_result', conversationId: convId, messages });
              } else {
                port.postMessage({ type: 'conversation_messages_result', conversationId: convId, messages: [] });
              }
            } catch (error) {
              logger.error('get_conversation_messages failed:', error);
              port.postMessage({ type: 'conversation_messages_result', conversationId: convId, messages: [] });
            }
            break;
          }

          case 'delete_conversation': {
            const deleteId = message.conversationId;
            try {
              if (serverClient && (await serverClient.isAuthenticated())) {
                await serverClient.deleteConversation(deleteId);
              }
              port.postMessage({ type: 'conversation_deleted', conversationId: deleteId });
            } catch (error) {
              logger.error('delete_conversation failed:', error);
              port.postMessage({ type: 'error', error: 'Failed to delete conversation' });
            }
            break;
          }

          case 'check_tab_group_status': {
            const tabId = message.tabId;
            if (!tabId) {
              port.postMessage({ type: 'tab_group_status', inActiveGroup: false, primaryTabId: null });
              break;
            }
            try {
              const tab = await chrome.tabs.get(tabId);
              const mgr = browserContext.tabGroupManager;
              const primaryTabId =
                tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE ? mgr.primaryTabForGroup(tab.groupId) : null;

              port.postMessage({
                type: 'tab_group_status',
                inActiveGroup: primaryTabId != null && primaryTabId !== tabId,
                primaryTabId,
              });
            } catch {
              port.postMessage({ type: 'tab_group_status', inActiveGroup: false, primaryTabId: null });
            }
            break;
          }

          case 'widget_apply': {
            const { requestId, endpoint, method, payload } = message;
            const validation = validateWidgetApplyRequest(endpoint, method);
            if (!validation.valid) {
              return port.postMessage({
                type: 'widget_apply_result',
                requestId,
                success: false,
                error: validation.error,
              });
            }

            if (!serverClient || !(await serverClient.isAuthenticated())) {
              return port.postMessage({
                type: 'widget_apply_result',
                requestId,
                success: false,
                error: 'Not authenticated',
              });
            }

            const result = await executeWidgetApply(serverClient.apiClient, { endpoint, method, payload });
            port.postMessage({ type: 'widget_apply_result', requestId, ...result });
            break;
          }

          case 'create_session': {
            const { requestId, title } = message;
            try {
              if (!serverClient || !(await serverClient.isAuthenticated())) {
                return port.postMessage({ type: 'session_created', requestId, error: 'Not authenticated' });
              }
              const conv = await serverClient.createConversation(title, 'browser_automation');
              port.postMessage({
                type: 'session_created',
                requestId,
                session: { id: conv.id, title: conv.title, createdAt: new Date(conv.createdAt).getTime() },
              });
            } catch (error) {
              logger.error('create_session failed:', error);
              port.postMessage({
                type: 'session_created',
                requestId,
                error: error instanceof Error ? error.message : 'Failed to create session',
              });
            }
            break;
          }

          case 'add_message': {
            const { sessionId, message: msgPayload } = message;
            try {
              if (serverClient && (await serverClient.isAuthenticated())) {
                await serverClient.addMessage(sessionId, {
                  role: msgPayload.actor,
                  content: msgPayload.content,
                  timestamp: msgPayload.timestamp,
                });
              }
            } catch (error) {
              logger.error('add_message failed:', error);
              messageRetryQueue.enqueue(sessionId, {
                role: msgPayload.actor,
                content: msgPayload.content,
                timestamp: msgPayload.timestamp,
              });
            }
            break;
          }

          case 'voice_start': {
            try {
              await ensureOffscreenDocument();
              chrome.runtime.sendMessage({
                target: 'offscreen',
                action: 'start',
                lang: message.lang,
              });
            } catch (error) {
              port.postMessage({
                type: 'voice_error',
                error: error instanceof Error ? error.message : 'Failed to start voice recognition',
              });
            }
            break;
          }

          case 'voice_stop': {
            try {
              chrome.runtime.sendMessage({ target: 'offscreen', action: 'stop' });
            } catch {
              // Offscreen document may already be closed
            }
            break;
          }

          case 'permission_response': {
            console.log('[ask_user] permission_response received', {
              hasExecutor: !!currentExecutor,
              responseType: typeof message.response,
              widgetId: message.widgetId,
            });
            if (currentExecutor && typeof message.response === 'string') {
              currentExecutor.resolveUserInput(message.response);
            } else {
              console.warn('[ask_user] permission_response dropped', {
                hasExecutor: !!currentExecutor,
                responseType: typeof message.response,
              });
              port.postMessage({
                type: 'error',
                error: 'Response could not be delivered — the task may have ended. Please try again.',
              });
            }
            break;
          }

          default:
            return port.postMessage({
              type: 'error',
              error: `Unsupported command: ${message.type}.\n\nAvailable commands: /state, /nohighlight, /replay <historySessionId>`,
            });
        }
      } catch (error) {
        console.error('Error handling port message:', error);
        port.postMessage({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        });
      }
    });

    port.onDisconnect.addListener(() => {
      console.log('Side panel disconnected');
      currentPort = null;
      currentExecutor?.cancel();
    });
  }
});

function formatProp(p: ManifestProp): string {
  let s = `${p.name} (${p.type}`;
  if (p.label && p.label !== p.name) s += `, "${p.label}"`;
  if (p.options?.length) s += `, enum: [${p.options.join(', ')}]`;
  if (p.default !== undefined) s += `, default: ${p.default}`;
  if (p.min !== undefined) s += `, min: ${p.min}`;
  if (p.max !== undefined) s += `, max: ${p.max}`;
  s += ')';
  return s;
}

async function setupExecutor(taskId: string, task: string, browserContext: BrowserContext) {
  const providers = await llmProviderStore.getAllProviders();
  // if no providers, need to display the options page
  if (Object.keys(providers).length === 0) {
    throw new Error('Please configure API keys in the settings first');
  }

  // Clean up any legacy validator settings for backward compatibility
  await agentModelStore.cleanupLegacyValidatorSettings();

  const agentModels = await agentModelStore.getAllAgentModels();
  // verify if every provider used in the agent models exists in the providers
  for (const agentModel of Object.values(agentModels)) {
    if (!providers[agentModel.provider]) {
      throw new Error(`Provider ${agentModel.provider} not found in the settings`);
    }
  }

  const navigatorModel = agentModels[AgentNameEnum.Navigator];
  if (!navigatorModel) {
    throw new Error('Please choose a model for the navigator in the settings first');
  }
  // Log the provider config being used for the navigator
  const navigatorProviderConfig = providers[navigatorModel.provider];
  const navigatorLLM = createChatModel(navigatorProviderConfig, navigatorModel);

  let plannerLLM: BaseChatModel | null = null;
  const plannerModel = agentModels[AgentNameEnum.Planner];
  if (plannerModel) {
    // Log the provider config being used for the planner
    const plannerProviderConfig = providers[plannerModel.provider];
    plannerLLM = createChatModel(plannerProviderConfig, plannerModel);
  }

  // Apply firewall settings to browser context
  const firewall = await firewallStore.getFirewall();
  if (firewall.enabled) {
    browserContext.updateConfig({
      allowedUrls: firewall.allowList,
      deniedUrls: firewall.denyList,
    });
  } else {
    browserContext.updateConfig({
      allowedUrls: [],
      deniedUrls: [],
    });
  }

  const generalSettings = await generalSettingsStore.getSettings();
  browserContext.updateConfig({
    minimumWaitPageLoadTime: generalSettings.minWaitPageLoad / 1000.0,
    displayHighlights: generalSettings.displayHighlights,
  });

  let connectedIntegrations: string | undefined;
  const integrationSettings = await integrationSettingsStore.getSettings();
  if (integrationSettings.connectedAccounts.length > 0 && integrationSettings.availableActions.length > 0) {
    const lines: string[] = [];
    for (const account of integrationSettings.connectedAccounts) {
      lines.push(`- ${account.appName}:`);
      const appActions = integrationSettings.availableActions.filter(a => a.appSlug === account.appSlug);
      for (const action of appActions) {
        const allProps = action.props ?? [];
        const required = allProps.filter(p => p.required).map(formatProp);
        const optional = allProps.filter(p => !p.required).map(formatProp);
        const parts: string[] = [];
        if (required.length) parts.push(`required: ${required.join(', ')}`);
        if (optional.length) parts.push(`optional: ${optional.join(', ')}`);
        const paramStr = parts.length ? ` | ${parts.join('; ')}` : '';
        lines.push(`  - ${action.key}: ${action.description}${paramStr}`);
      }
    }
    if (lines.length > 0) {
      connectedIntegrations = lines.join('\n');
    }
  }

  const executor = new Executor(task, taskId, browserContext, navigatorLLM, {
    plannerLLM: plannerLLM ?? navigatorLLM,
    agentOptions: {
      maxSteps: generalSettings.maxSteps,
      maxFailures: generalSettings.maxFailures,
      maxActionsPerStep: generalSettings.maxActionsPerStep,
      useVision: generalSettings.useVision,
      useVisionForPlanner: true,
      planningInterval: generalSettings.planningInterval,
    },
    generalSettings: generalSettings,
    serverClient,
    hotelCapabilities: cachedHotelCapabilities,
    connectedIntegrations,
  });

  return executor;
}

// Update subscribeToExecutorEvents to use port
async function subscribeToExecutorEvents(executor: Executor) {
  // Clear previous event listeners to prevent multiple subscriptions
  executor.clearExecutionEvents();

  // Subscribe to new events
  executor.subscribeExecutionEvents(async event => {
    try {
      if (currentPort) {
        currentPort.postMessage(event);
      }
    } catch (error) {
      logger.error('Failed to send message to side panel:', error);
    }

    if (
      (event.actor === 'planner' || event.actor === 'synthesizer') &&
      event.state === ExecutionState.STEP_OK &&
      event.data.details
    ) {
      try {
        if (serverClient && (await serverClient.isAuthenticated())) {
          await serverClient.addMessage(event.data.taskId, {
            role: event.actor,
            content: event.data.details,
            timestamp: event.timestamp,
          });
        }
      } catch (err) {
        logger.error(`Failed to persist ${event.actor} message:`, err);
      }
    }

    if (
      event.state === ExecutionState.TASK_OK ||
      event.state === ExecutionState.TASK_FAIL ||
      event.state === ExecutionState.TASK_CANCEL
    ) {
      await currentExecutor?.cleanup();
    }
  });
}
