import { createLogger } from '@src/background/log';

const logger = createLogger('TabGroupManager');

export class TabGroupManager {
  private _groups: Map<number, number> = new Map();
  private _activeGroupId: number | null = null;

  get groupId(): number | null {
    return this._activeGroupId;
  }

  get primaryTabId(): number | null {
    if (this._activeGroupId === null) return null;
    return this._groups.get(this._activeGroupId) ?? null;
  }

  get isActive(): boolean {
    return this._activeGroupId !== null;
  }

  primaryTabForGroup(groupId: number): number | null {
    return this._groups.get(groupId) ?? null;
  }

  async createGroup(tabId: number): Promise<number> {
    try {
      const groupId = await chrome.tabs.group({ tabIds: [tabId] });
      await chrome.tabGroups.update(groupId, {
        title: 'Autumn AI',
        color: 'blue',
        collapsed: false,
      });
      this._groups.set(groupId, tabId);
      this._activeGroupId = groupId;
      logger.info('Created tab group', groupId, 'with primary tab', tabId);
      return groupId;
    } catch (error) {
      logger.error('Failed to create tab group:', error);
      throw error;
    }
  }

  async addTab(tabId: number): Promise<void> {
    if (this._activeGroupId === null) return;
    try {
      await chrome.tabs.group({ tabIds: [tabId], groupId: this._activeGroupId });
      chrome.sidePanel.setOptions({ tabId, path: 'side-panel/index.html', enabled: true });
      logger.info('Added tab', tabId, 'to group', this._activeGroupId);
    } catch (error) {
      logger.error('Failed to add tab to group:', error);
    }
  }

  adoptGroup(chromeGroupId: number, primaryTabId: number): void {
    this._groups.set(chromeGroupId, primaryTabId);
    this._activeGroupId = chromeGroupId;
    logger.info('Adopted Chrome group', chromeGroupId, 'with primary tab', primaryTabId);
  }

  updatePrimaryTab(tabId: number): void {
    if (this._activeGroupId === null) return;
    this._groups.set(this._activeGroupId, tabId);
    logger.info('Updated primary tab to', tabId, 'in group', this._activeGroupId);
  }

  async removeTab(tabId: number): Promise<number | null> {
    for (const [groupId, primaryTabId] of this._groups) {
      if (primaryTabId !== tabId) continue;

      try {
        const remaining = await chrome.tabs.query({ groupId });
        const otherTab = remaining.find(t => t.id !== tabId && t.id != null);

        if (otherTab?.id) {
          this._groups.set(groupId, otherTab.id);
          logger.info('Promoted tab', otherTab.id, 'to primary in group', groupId);
          return otherTab.id;
        }
      } catch {
        // group may no longer exist
      }

      this._groups.delete(groupId);
      if (this._activeGroupId === groupId) this._activeGroupId = null;
      logger.info('Removed empty group', groupId);
      return null;
    }
    return null;
  }

  async cleanup(): Promise<void> {
    if (this._activeGroupId === null) return;
    const primaryTabId = this._groups.get(this._activeGroupId);
    if (primaryTabId != null) {
      try {
        const tabs = await chrome.tabs.query({ groupId: this._activeGroupId });
        for (const tab of tabs) {
          if (tab.id != null) {
            await chrome.sidePanel.setOptions({ tabId: tab.id, enabled: false }).catch(() => {});
          }
        }
      } catch {
        // group may no longer exist
      }
    }
    this._groups.delete(this._activeGroupId);
    this._activeGroupId = null;
    logger.info('Cleaned up active group');
  }
}
