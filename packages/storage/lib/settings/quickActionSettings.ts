import { StorageEnum } from '../base/enums';
import { createStorage } from '../base/base';
import type { BaseStorage } from '../base/types';

export interface SavedQuickAction {
  id: string;
  name: string;
  prompt: string;
  description: string;
  icon: string;
  sortOrder: number;
  createdAt: number;
}

export interface QuickActionSettingsConfig {
  quickActions: SavedQuickAction[];
}

export type QuickActionSettingsStorage = BaseStorage<QuickActionSettingsConfig> & {
  getSettings: () => Promise<QuickActionSettingsConfig>;
  updateSettings: (settings: Partial<QuickActionSettingsConfig>) => Promise<void>;
  resetToDefaults: () => Promise<void>;
};

const DEFAULT_QUICK_ACTIONS: SavedQuickAction[] = [
  {
    id: 'default_group_booking',
    name: 'Find & Quote Group Bookings',
    prompt: [
      'Search my Gmail for group booking, group reservation, or block-of-rooms inquiry emails that I have NOT yet replied to.',
      'Show me the top 3 most recent matches with sender, subject, date, and a one-line summary of the request. Let me pick which one to process, or I can choose to process all of them.',
      'Use parse_group_inquiry on the selected email to extract check-in date, check-out date, number of rooms, guest name, contact email, and any special requests. Show me the parsed details for confirmation.',
      'Then use generate_group_quote with the confirmed check-in date, check-out date, room count, guest name, and original email text to produce a quote with real rates, room allocation, total revenue, ADR, and discount percentage.',
      'Draft the reply email and present it for my approval before sending.',
    ].join('\n'),
    description:
      'Finds unanswered group booking requests in your Gmail, pulls out the key details (dates, rooms, guest info), builds a price quote, and drafts a reply email for you to review before sending.',
    icon: '🏨',
    sortOrder: 0,
    createdAt: 0,
  },
  {
    id: 'default_ota_parity',
    name: 'Compare OTA vs Direct Rates',
    prompt: [
      'Use the hotel name from my hotel context to search Google Travel. For example: https://www.google.com/travel/search?q=hotel%20name — but you MUST replace "hotel+name" with the actual hotel from my context.',
      'Open the "Prices" tab. Pick 3 dates within the next 30 days — a mix of weekday and weekend (e.g. a Monday, a Friday, and a Saturday). For each 1-night stay, record the price shown for Direct, Booking.com, Expedia, and any other OTA listed.',
      '',
      'Calculate per OTA: variance % = ((OTA − Direct) / Direct) × 100',
      'Return a summary table with avg variance per OTA vs Direct, and how many dates each OTA was lower than Direct.',
      '',
      'Action logic:',
      'If OTA > Direct by more than 10% on average → flag as overpriced, ask user if they want to lower OTA rates.',
      'If Direct > OTA by more than 5% on average → flag as undercutting, ask user: "Direct is higher than [OTA] on X dates. Want to push updated prices to bring Direct in line or raise OTA rates?"',
      'Otherwise → report parity is healthy.',
      '',
      'Rules: Only use prices on the Google Travel Prices tab. Use lowest non-member rate. Mark "N/A" if a channel isn\'t listed.',
    ].join('\n'),
    description:
      'Compares your room prices on Booking.com, Expedia, and your direct website across several dates, and tells you exactly where prices are off so you can fix them.',
    icon: '💲',
    sortOrder: 1,
    createdAt: 0,
  },
  {
    id: 'default_performance',
    name: "Next Week's Performance Forecast",
    prompt: 'How does my performance next week look?',
    description:
      'Shows you a summary of how your hotel is expected to perform next week — occupancy, revenue, and key trends at a glance.',
    icon: '📊',
    sortOrder: 2,
    createdAt: 0,
  },
  {
    id: 'default_marketing',
    name: 'Marketing Performance Review',
    prompt: 'How is my marketing performing?',
    description:
      'Gives you an overview of how your current marketing efforts are doing — what is working, what needs attention, and where you can improve.',
    icon: '📣',
    sortOrder: 3,
    createdAt: 0,
  },
];

export const DEFAULT_QUICK_ACTION_SETTINGS: QuickActionSettingsConfig = {
  quickActions: DEFAULT_QUICK_ACTIONS,
};

const storage = createStorage<QuickActionSettingsConfig>('quick-action-settings', DEFAULT_QUICK_ACTION_SETTINGS, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

export const quickActionSettingsStore: QuickActionSettingsStorage = {
  ...storage,
  async getSettings() {
    const settings = await storage.get();
    return settings || DEFAULT_QUICK_ACTION_SETTINGS;
  },
  async updateSettings(settings: Partial<QuickActionSettingsConfig>) {
    const currentSettings = (await storage.get()) || DEFAULT_QUICK_ACTION_SETTINGS;
    await storage.set({
      ...currentSettings,
      ...settings,
    });
  },
  async resetToDefaults() {
    await storage.set(DEFAULT_QUICK_ACTION_SETTINGS);
  },
};
