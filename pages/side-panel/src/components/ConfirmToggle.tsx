import { useEffect, useRef, useState } from 'react';

type Mode = 'auto' | 'confirm';

function FastForwardIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}>
      <path
        d="M7.00001 9.7735C7.00005 9.95631 7.05429 10.135 7.15587 10.287C7.25745 10.439 7.40182 10.5574 7.57071 10.6274C7.73961 10.6973 7.92546 10.7157 8.10476 10.68C8.28406 10.6443 8.44876 10.5563 8.57805 10.4271L11.3514 7.65373C11.5247 7.48037 11.6221 7.24527 11.6221 7.00014C11.6221 6.75501 11.5247 6.51992 11.3514 6.34656L8.57805 3.5732C8.44876 3.44395 8.28406 3.35594 8.10476 3.32029C7.92546 3.28463 7.73961 3.30294 7.57071 3.37289C7.40182 3.44284 7.25745 3.5613 7.15587 3.71329C7.05429 3.86528 7.00005 4.04398 7.00001 4.22679L7.00001 9.7735Z"
        stroke="currentColor"
        strokeWidth="0.924452"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.37794 9.7735C2.37798 9.95631 2.43222 10.135 2.5338 10.287C2.63538 10.439 2.77975 10.5574 2.94864 10.6274C3.11754 10.6973 3.30339 10.7157 3.48269 10.68C3.66199 10.6443 3.82669 10.5563 3.95598 10.4271L6.72933 7.65373C6.90264 7.48037 7 7.24527 7 7.00014C7 6.75501 6.90264 6.51992 6.72933 6.34656L3.95598 3.5732C3.82669 3.44395 3.66199 3.35594 3.48269 3.32029C3.30339 3.28463 3.11754 3.30294 2.94864 3.37289C2.77975 3.44284 2.63538 3.5613 2.5338 3.71329C2.43222 3.86528 2.37798 4.04398 2.37794 4.22679L2.37794 9.7735Z"
        stroke="currentColor"
        strokeWidth="0.924452"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AskIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}>
      <path
        d="M4.60353 5.45797L3.19306 6.97605C3.005 7.16966 2.66937 7.67494 2.62887 8.13776C2.58628 8.62443 3.02478 9.32262 3.19306 9.58991C3.63169 10.2865 3.80831 10.6731 4.32144 11.3324C4.6001 11.6905 5.35284 12.4042 6.5782 12.4942C7.49293 12.5612 8.40345 12.555 8.83495 12.4942C9.13122 12.4523 9.85047 12.3199 10.5275 11.6228C11.2046 10.9259 11.3738 9.78352 11.3738 9.29947V4.65267C11.3738 4.36225 11.2046 3.7814 10.5275 3.7814C9.85047 3.7814 9.68125 4.36225 9.68125 4.65267V6.68567M4.60353 8.13776V3.49098C4.60353 3.20055 4.77279 2.6197 5.44982 2.6197C6.12682 2.6197 6.2961 3.20055 6.2961 3.49098M6.2961 3.49098V6.10478M6.2961 3.49098V2.32928C6.2961 2.03886 6.46533 1.45801 7.1424 1.45801C7.81942 1.45801 7.98865 2.03886 7.98865 2.32928V3.49098M7.98865 3.49098V6.10478M7.98865 3.49098C7.98865 3.20055 8.15793 2.6197 8.83495 2.6197C9.51196 2.6197 9.68125 3.20055 9.68125 3.49098V4.9431"
        stroke="currentColor"
        strokeWidth="0.875"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}>
      <path
        d="M11.0732 4.1665C11.2746 4.1665 11.4573 4.229 11.6205 4.354C11.7833 4.47897 11.8649 4.65288 11.8649 4.87484C11.8648 4.97865 11.839 5.08426 11.7871 5.1915C11.735 5.29913 11.6816 5.40262 11.626 5.49984L7.90658 11.3748C7.7192 11.6798 7.45882 11.833 7.12602 11.8332C6.96644 11.8332 6.81825 11.7962 6.68296 11.7234C6.54774 11.6506 6.4175 11.5342 6.29269 11.3748L4.35519 8.94706C4.20933 8.75956 4.13574 8.55818 4.13574 8.34289C4.13574 8.13456 4.20726 7.95401 4.34963 7.80123C4.49195 7.64855 4.67053 7.57206 4.88574 7.57206C5.0177 7.57206 5.1399 7.59985 5.25102 7.65539C5.36195 7.71101 5.47342 7.81536 5.58435 7.96789L7.08435 9.979L10.4066 4.59289C10.5802 4.30818 10.8024 4.1665 11.0732 4.1665Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

const OPTIONS: { value: Mode; icon: typeof FastForwardIcon; title: string; description: string; disabled?: boolean }[] =
  [
    {
      value: 'auto',
      icon: FastForwardIcon,
      title: 'Never ask',
      description: 'Actions run without confirmation',
      disabled: true,
    },
    {
      value: 'confirm',
      icon: AskIcon,
      title: 'Always confirm',
      description: "You'll approve each action before it runs",
    },
  ];

export function ConfirmToggle() {
  const [mode, setMode] = useState<Mode>('confirm');
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const currentOption = OPTIONS.find(o => o.value === mode) ?? OPTIONS[1];
  const TriggerIcon = currentOption.icon;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex h-[30px] select-none items-center gap-1 rounded-[10px] bg-transparent px-1.5 py-1 text-neutral-500 transition-colors hover:bg-black/[0.03]">
        <TriggerIcon className="size-4" />
        <span className="text-[13px] leading-none">{currentOption.title}</span>
        <ChevronDownIcon
          className={`size-3 text-neutral-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute bottom-full z-50 mb-1.5 min-w-[160px] animate-pop-up rounded-[10px] bg-white p-0.5 shadow-[0_2px_4px_-2px_rgba(0,0,0,0.1),0_4px_6px_-1px_rgba(0,0,0,0.1),0_0_0_0.5px_#e5e5e5]">
          {OPTIONS.map(opt => {
            const selected = mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={opt.disabled}
                onClick={() => {
                  if (opt.disabled) return;
                  setMode(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full select-none items-start gap-1.5 rounded-lg p-1.5 transition-colors ${opt.disabled ? 'cursor-not-allowed opacity-40' : 'cursor-default hover:bg-neutral-50'}`}>
                <span className="flex size-5 shrink-0 items-center justify-center">
                  <opt.icon className="size-4 text-neutral-400" />
                </span>
                <div className="flex max-w-[140px] flex-1 flex-col gap-0.5">
                  <span className={`text-[13px] leading-[16px] ${selected ? 'text-neutral-700' : 'text-neutral-600'}`}>
                    {opt.title}
                  </span>
                  <span
                    className={`text-pretty text-[11px] leading-[14px] ${selected ? 'text-neutral-500' : 'text-neutral-400'}`}>
                    {opt.description}
                  </span>
                </div>
                <span className="ml-auto flex size-4 shrink-0 items-center justify-center">
                  {selected && <CheckIcon className="size-3.5 text-neutral-500" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
