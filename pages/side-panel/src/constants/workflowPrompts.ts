export interface WorkflowPrompt {
  id: string;
  name: string;
  description: string;
  icon: string;
  prompt: string;
}

export const WORKFLOW_PROMPTS: readonly WorkflowPrompt[] = [
  {
    id: 'performance-next-week',
    name: 'Performance Next Week',
    description: 'Check upcoming performance outlook',
    icon: '📊',
    prompt: 'How does my performance next week look?',
  },
  {
    id: 'ota-rate-parity-simple',
    name: 'OTA Parity (Simple)',
    description: 'Quick OTA vs Direct comparison using default Google Travel dates',
    icon: '💲',
    prompt: [
      'Go to https://www.google.com/travel/search?q=olea%20hotel',
      'Click on the prices tab. Extract the listed prices for Booking.com, Expedia, and the direct/official site for the default dates Google shows.',
      'For each date, calculate the variance: (OTA price - Direct price) / Direct price × 100. Note the date range.',
      'Then pull my direct rates for that same date range using query_hotel_data.',
      'Show me a side-by-side comparison table with columns: Date, Direct Rate, Booking.com Rate, Booking.com Variance %, Expedia Rate, Expedia Variance %.',
      'Highlight any dates where Direct is higher than an OTA.',
      'If Direct is priced higher than any OTA, ASK THE USER to push corrected rates to the PMS.',
    ].join('\n'),
  },
  {
    id: 'ota-rate-parity',
    name: 'OTA Parity (Detailed)',
    description: 'Compare OTA rates vs Direct across specific dates',
    icon: '💲',
    prompt: [
      'Go to https://www.google.com/travel/search?q=olea%20hotel',
      'Click the "Prices" tab.',
      'For each 1-night stay below, record the price for Direct, Booking.com, Expedia, and any other OTA shown:',
      '',
      'May 5 → May 6, 2026 (weekday)',
      'May 9 → May 10, 2026 (weekend)',
      'May 19 → May 20, 2026 (weekday)',
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
  },
  {
    id: 'group-booking-inquiries',
    name: 'Group Booking Inquiries',
    description: 'Search Gmail for group bookings, parse details, generate quotes',
    icon: '🏨',
    prompt: [
      'Search my Gmail for ANY group booking, group reservation, or block-of-rooms inquiry emails.',
      "Show me them, with sender, subject, date, and a one-line summary of what they're requesting. Let me pick which one to process.",
      'Use parse_group_inquiry on the selected email to extract check-in date, check-out date, number of rooms, guest name, contact email, and any special requests. Show me the parsed details for confirmation.',
      'Then use generate_group_quote with the confirmed check-in date, check-out date, room count, guest name, and original email text to produce a quote with real rates, room allocation, total revenue, ADR, and discount percentage.',
      'Draft the reply email and present it for my approval before sending.',
    ].join('\n'),
  },
  {
    id: 'navigate-wikipedia',
    name: '[Dev] Wikipedia Lookup',
    description: 'Navigate to Wikipedia and ask what to search',
    icon: '🌐',
    prompt: 'Navigate to wikipedia.org. Before doing anything else, ask me what topic I want to look up.',
  },
] as const;
