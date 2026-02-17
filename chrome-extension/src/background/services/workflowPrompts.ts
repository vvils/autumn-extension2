import { favoritesStorage } from '@extension/storage';
import { createLogger } from '../log';

const logger = createLogger('workflowPrompts');

const SEEDED_FLAG = 'workflow_prompts_seeded';

interface WorkflowPrompt {
  id: string;
  name: string;
  description: string;
  prompt: string;
  category: string;
  icon: string;
}

const WORKFLOW_PROMPTS: WorkflowPrompt[] = [
  {
    id: 'ota-price-parity',
    name: 'OTA Price Parity Check',
    description: 'Compare direct booking rates against major OTAs',
    category: 'revenue',
    icon: '💲',
    prompt: [
      'Compare our hotel rates across Booking.com, Expedia, and Hotels.com for tonight and tomorrow night.',
      'For each channel, record the nightly rate for the standard room type.',
      'Flag any rate where the OTA price is lower than our direct price or the markup exceeds 15%.',
      'Summarize findings in a table with columns: Channel, Rate, Variance %, Flagged.',
    ].join('\n'),
  },
  {
    id: 'group-booking-inquiries',
    name: 'Group Booking Inquiries',
    description: 'Search Gmail for pending group booking requests',
    category: 'groups',
    icon: '🏨',
    prompt: [
      'Navigate to https://mail.google.com and search for recent emails matching',
      '"group booking OR block reservation OR event inquiry OR RFP OR wedding block OR room block".',
      'For each matching email from the last 7 days:',
      '  - Record the sender, subject, date, and requested dates/room count if mentioned.',
      'Compile a summary list of all pending group inquiries sorted by date.',
    ].join('\n'),
  },
  {
    id: 'competitor-content-research',
    name: 'Competitor Content Research',
    description: 'Research competitor property descriptions on Booking.com',
    category: 'marketing',
    icon: '🔍',
    prompt: [
      'Go to Booking.com and search for hotels in our area.',
      'Open the top 3 competitor properties and for each one record:',
      '  - Property name and star rating',
      '  - Key selling points from their description',
      '  - Number of reviews and average score',
      '  - Amenities highlighted',
      'Summarize the competitive landscape and note any differentiators we could adopt.',
    ].join('\n'),
  },
];

export async function seedWorkflowPrompts(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(SEEDED_FLAG);
    if (result[SEEDED_FLAG]) return;

    for (const wp of WORKFLOW_PROMPTS) {
      const title = `[Workflow] ${wp.icon} ${wp.name}`;
      await favoritesStorage.addPrompt(title, wp.prompt);
    }

    await chrome.storage.local.set({ [SEEDED_FLAG]: true });
    logger.info(`Seeded ${WORKFLOW_PROMPTS.length} workflow prompts`);
  } catch (error) {
    logger.error('Failed to seed workflow prompts:', error);
  }
}
