import { z } from 'zod';

export interface ActionSchema {
  name: string;
  description: string;
  schema: z.ZodType;
}

export const doneActionSchema: ActionSchema = {
  name: 'done',
  description: 'Complete task',
  schema: z.object({
    text: z.string(),
    success: z.boolean().default(true),
  }),
};

// Basic Navigation Actions
export const searchGoogleActionSchema: ActionSchema = {
  name: 'search_google',
  description:
    'Search the query in Google in the current tab, the query should be a search query like humans search in Google, concrete and not vague or super long. More the single most important items.',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    query: z.string(),
  }),
};

export const goToUrlActionSchema: ActionSchema = {
  name: 'go_to_url',
  description: 'Navigate to URL in the current tab',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    url: z.string(),
  }),
};

export const goBackActionSchema: ActionSchema = {
  name: 'go_back',
  description: 'Go back to the previous page',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
  }),
};

export const goForwardActionSchema: ActionSchema = {
  name: 'go_forward',
  description: 'Go forward to the next page',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
  }),
};

export const refreshPageActionSchema: ActionSchema = {
  name: 'refresh_page',
  description: 'Refresh the current page',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
  }),
};

export const clickElementActionSchema: ActionSchema = {
  name: 'click_element',
  description: 'Click element by index',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    index: z.number().int().describe('index of the element'),
    xpath: z.string().nullable().optional().describe('xpath of the element'),
  }),
};

export const doubleClickActionSchema: ActionSchema = {
  name: 'double_click',
  description: 'Double-click element by index',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    index: z.number().int().describe('index of the element'),
  }),
};

export const tripleClickActionSchema: ActionSchema = {
  name: 'triple_click',
  description: 'Triple-click element by index to select all text in it',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    index: z.number().int().describe('index of the element'),
  }),
};

export const hoverElementActionSchema: ActionSchema = {
  name: 'hover_element',
  description: 'Hover over element by index to reveal tooltips, dropdowns, or hidden content',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    index: z.number().int().describe('index of the element'),
  }),
};

export const inputTextActionSchema: ActionSchema = {
  name: 'input_text',
  description: 'Input text into an interactive input element',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    index: z.number().int().describe('index of the element'),
    text: z.string().describe('text to input'),
    xpath: z.string().nullable().optional().describe('xpath of the element'),
  }),
};

// Tab Management Actions
export const switchTabActionSchema: ActionSchema = {
  name: 'switch_tab',
  description: 'Switch to tab by tab id',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    tab_id: z.number().int().describe('id of the tab to switch to'),
  }),
};

export const openTabActionSchema: ActionSchema = {
  name: 'open_tab',
  description: 'Open URL in new tab',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    url: z.string().describe('url to open'),
  }),
};

export const closeTabActionSchema: ActionSchema = {
  name: 'close_tab',
  description: 'Close tab by tab id',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    tab_id: z.number().int().describe('id of the tab'),
  }),
};

// Content Actions, not used currently
// export const extractContentActionSchema: ActionSchema = {
//   name: 'extract_content',
//   description:
//     'Extract page content to retrieve specific information from the page, e.g. all company names, a specific description, all information about, links with companies in structured format or simply links',
//   schema: z.object({
//     goal: z.string(),
//   }),
// };

// Cache Actions
export const cacheContentActionSchema: ActionSchema = {
  name: 'cache_content',
  description: 'Cache what you have found so far from the current page for future use',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    content: z.string().default('').describe('content to cache'),
  }),
};

export const scrollToPercentActionSchema: ActionSchema = {
  name: 'scroll_to_percent',
  description:
    'Scrolls to a particular vertical percentage of the document or an element. If no index of element is specified, scroll the whole document.',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    yPercent: z.number().int().describe('percentage to scroll to - min 0, max 100; 0 is top, 100 is bottom'),
    index: z.number().int().nullable().optional().describe('index of the element'),
  }),
};

export const scrollToTopActionSchema: ActionSchema = {
  name: 'scroll_to_top',
  description: 'Scroll the document in the window or an element to the top',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    index: z.number().int().nullable().optional().describe('index of the element'),
  }),
};

export const scrollToBottomActionSchema: ActionSchema = {
  name: 'scroll_to_bottom',
  description: 'Scroll the document in the window or an element to the bottom',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    index: z.number().int().nullable().optional().describe('index of the element'),
  }),
};

export const previousPageActionSchema: ActionSchema = {
  name: 'previous_page',
  description:
    'Scroll the document in the window or an element to the previous page. If no index is specified, scroll the whole document.',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    index: z.number().int().nullable().optional().describe('index of the element'),
  }),
};

export const nextPageActionSchema: ActionSchema = {
  name: 'next_page',
  description:
    'Scroll the document in the window or an element to the next page. If no index is specified, scroll the whole document.',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    index: z.number().int().nullable().optional().describe('index of the element'),
  }),
};

export const scrollToTextActionSchema: ActionSchema = {
  name: 'scroll_to_text',
  description: 'If you dont find something which you want to interact with in current viewport, try to scroll to it',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    text: z.string().describe('text to scroll to'),
    nth: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe('which occurrence of the text to scroll to (1-indexed, default: 1)'),
  }),
};

export const sendKeysActionSchema: ActionSchema = {
  name: 'send_keys',
  description:
    'Send strings of special keys like Backspace, Insert, PageDown, Delete, Enter. Shortcuts such as `Control+o`, `Control+Shift+T` are supported as well. This gets used in keyboard press. Be aware of different operating systems and their shortcuts',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    keys: z.string().describe('keys to send'),
  }),
};

export const getDropdownOptionsActionSchema: ActionSchema = {
  name: 'get_dropdown_options',
  description: 'Get all options from a native dropdown',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    index: z.number().int().describe('index of the dropdown element'),
  }),
};

export const selectDropdownOptionActionSchema: ActionSchema = {
  name: 'select_dropdown_option',
  description: 'Select dropdown option for interactive element index by the text of the option you want to select',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    index: z.number().int().describe('index of the dropdown element'),
    text: z.string().describe('text of the option'),
  }),
};

export const waitActionSchema: ActionSchema = {
  name: 'wait',
  description: 'Wait for x seconds default 3, do NOT use this action unless user asks to wait explicitly',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    seconds: z.number().int().default(3).describe('amount of seconds'),
  }),
};

export const queryHotelDataActionSchema: ActionSchema = {
  name: 'query_hotel_data',
  description:
    "Query the hotel's internal data system for performance metrics, pricing, bookings, competitors, seasonal settings, and documentation.",
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    query: z.string().describe('Natural language query about hotel data'),
  }),
};

export const runIntegrationActionSchema: ActionSchema = {
  name: 'run_integration_action',
  description: 'Execute an action on a connected third-party service (e.g. Slack, Gmail, Google Sheets)',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    action_key: z.string().describe('the action key from the available integrations list'),
    app_slug: z.string().describe('the app slug for the target service'),
    parameters: z.record(z.unknown()).describe('parameters required by the action'),
  }),
};

export const pushRatesToPmsActionSchema: ActionSchema = {
  name: 'push_rates_to_pms',
  description:
    'Push AI-calculated room rates to the connected Property Management System (Mews, CloudBeds, or ResNexus) for a date range. The backend calculates optimal prices from competitor data and user rules, then updates the PMS.',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    start_date: z.string().describe('Start date in YYYY-MM-DD format'),
    end_date: z.string().describe('End date in YYYY-MM-DD format'),
  }),
};

export const parseGroupInquiryActionSchema: ActionSchema = {
  name: 'parse_group_inquiry',
  description:
    'Parse a group booking inquiry email to extract structured data (dates, room count, contact info) with confidence scores.',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    email_text: z.string().describe('Full text of the group booking inquiry email'),
  }),
};

export const generateGroupQuoteActionSchema: ActionSchema = {
  name: 'generate_group_quote',
  description:
    'Generate a group booking quote with real room rates, AI room allocation, and an HTML email draft ready to send via gmail-send-email.',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    check_in_date: z.string().describe('Check-in date in YYYY-MM-DD format'),
    check_out_date: z.string().describe('Check-out date in YYYY-MM-DD format'),
    room_count: z.number().int().describe('Number of rooms requested'),
    context: z.string().optional().describe('Original email text for AI room allocation'),
    guest_name: z.string().optional().describe('Name of the guest or contact person'),
    discount_percent: z.number().optional().describe('Discount percentage override (e.g. 15 for 15% off)'),
  }),
};

export const sendGroupQuoteEmailActionSchema: ActionSchema = {
  name: 'send_group_quote_email',
  description:
    'Send the most recently generated group booking quote email via Gmail. Presents a confirmation dialog before sending.',
  schema: z.object({
    intent: z.string().default('').describe('purpose of this action'),
    to: z.array(z.string()).describe('Recipient email address(es)'),
    subject: z.string().describe('Email subject line'),
  }),
};

export const askUserActionSchema: ActionSchema = {
  name: 'ask_user',
  description:
    'Pause and ask the user a question when you need their input, confirmation, or a decision before proceeding. Include context to help them decide.',
  schema: z.object({
    question: z.string().describe('Clear, concise question for the user'),
    context: z
      .string()
      .optional()
      .describe(
        'Markdown-formatted context to help the user decide. Use **bold labels**, markdown tables for structured data, --- dividers between sections, and bullet lists for multiple items.',
      ),
    options: z
      .array(
        z.object({
          label: z.string().describe('Button label'),
          value: z.string().describe('Value returned if selected'),
        }),
      )
      .min(2)
      .optional()
      .describe('Array of {label, value} objects as predefined choices (min 2). Omit for free-text only.'),
  }),
};
