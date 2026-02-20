export interface WorkflowPrompt {
  id: string;
  name: string;
  description: string;
  icon: string;
  prompt: string;
}

export const WORKFLOW_PROMPTS: readonly WorkflowPrompt[] = [
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
  {
    id: 'check-email-bookings',
    name: 'Check Email Bookings',
    description: 'Find group booking requests in email',
    icon: '📧',
    prompt: 'Check my email for group booking requests',
  },
  {
    id: 'navigate-wikipedia',
    name: 'Wikipedia Lookup',
    description: 'Navigate to Wikipedia and ask what to search',
    icon: '🌐',
    prompt: 'Navigate to wikipedia.org. Before doing anything else, ask me what topic I want to look up.',
  },
] as const;
