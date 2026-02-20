import { Tooltip } from './Tooltip';

function AskIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9.5 5.5C9.5 4.5 8.5 2 7 2C5.5 2 4.5 4.5 4.5 5.5C4.5 6.5 5 7 5 8H9C9 7 9.5 6.5 9.5 5.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 10H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M5.5 12H8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function ConfirmToggle() {
  return (
    <Tooltip label="Always confirm (coming soon)" side="above">
      <button
        type="button"
        disabled
        aria-label="Always confirm (coming soon)"
        className="cursor-default rounded-lg p-1.5 text-gray-400 opacity-50">
        <AskIcon />
      </button>
    </Tooltip>
  );
}
