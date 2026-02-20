# Inline Tool Calling Timeline & Thinking Animation

## Context

The current ThinkingWidget renders as a fixed bar between the message list and chat input, showing Navigator actions in a flat list with spinners. The user wants to replace this with Dex-style inline tool cards rendered directly within the message stream — a collapsible chain-of-thought timeline with shimmer text animations and animated borders.

**Key insight**: We can achieve inline rendering without changing the data model or background service worker. The thinking state already tracks all actions; we just need to render it inside the scroll container instead of as a separate widget below it.

---

## Files to Modify

| File | Change |
|------|--------|
| `pages/side-panel/src/SidePanel.tsx` | Remove `<ThinkingWidget>` import and rendering, render `<InlineToolChain>` as sibling after `<MessageList>` inside scroll container, fix auto-scroll to trigger on action count |
| `pages/side-panel/tailwind.config.ts` | Add `shimmerLoop` and `shine` keyframe animations |

## Files to Create

| File | Purpose |
|------|---------|
| `pages/side-panel/src/components/ShimmerText.tsx` | CSS shimmer text animation using Tailwind `animate-shimmer` + inline gradient style |
| `pages/side-panel/src/components/InlineToolChain.tsx` | Chain-of-thought timeline with vertical line, step items, shine border |

## Files to Delete

| File | Reason |
|------|--------|
| `pages/side-panel/src/components/ThinkingWidget.tsx` | Replaced by `InlineToolChain` rendered inline in scroll container |

**Note:** `MessageList.tsx` is NOT modified. `InlineToolChain` renders as a sibling inside the same scroll container, avoiding changes to MessageList's interface and preserving its `memo()` optimization. The `cn()` utility is not available in the side panel (`@extension/ui` is not a dependency) — use template literals for class composition, matching the existing codebase pattern.

---

## Implementation

### 1. Create `ShimmerText.tsx`

Pure CSS shimmer text animation. Uses Tailwind's `animate-shimmer` utility (added in Step 4) combined with inline `style` for the gradient background. No `<style>` tag injection or `dangerouslySetInnerHTML` — those patterns are not used in this codebase.

```tsx
export function ShimmerText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span
      className={`inline-block animate-shimmer ${className}`}
      style={{
        lineHeight: 'inherit',
        color: 'rgba(0,0,0,0.27)',
        background: `linear-gradient(90deg,
          rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.22) 50%, rgba(0,0,0,0.22) 54%,
          rgba(0,0,0,0.30) 57%, rgba(0,0,0,0.34) 61%, rgba(0,0,0,0.42) 66%,
          rgba(0,0,0,0.42) 74%, rgba(0,0,0,0.34) 79%, rgba(0,0,0,0.30) 83%,
          rgba(0,0,0,0.22) 88%, rgba(0,0,0,0.22) 92%, rgba(0,0,0,0.22) 100%)`,
        backgroundSize: '200% 100%',
        backgroundRepeat: 'repeat-x',
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        willChange: 'background-position, opacity',
      }}>
      {text}
    </span>
  );
}
```

### 2. Create `InlineToolChain.tsx`

Single file containing the chain-of-thought timeline, adapted to the existing `ThinkingState` / `ThinkingAction[]` data model.

**Component structure:**
```
<InlineToolChain state={thinkingState}>
  ┌─ Container (rounded card with border, shadow)
  │  ├─ ShineBorder (animated gradient border, visible when isActive)
  │  ├─ Header row: shimmer text (active) or solid text (done) + chevron
  │  └─ Collapsible content:
  │     ├─ Divider line (animated opacity)
  │     ├─ Vertical timeline line (absolute positioned)
  │     └─ Steps (non-expandable):
  │        ├─ ChainStep (dot + icon + label + status check/X/spinner)
  │        ├─ ChainStep ...
  │        └─ ChainStep (last: blur-in animation via Framer Motion)
  └─
```

**Reuse from existing `ThinkingWidget.tsx`** (move to this file):
- `ACTOR_LABELS` map (line 29-34) — maps `Actors` enum to display names
- `ICON_PATTERNS` array (line 36-48) — regex-to-icon mapping
- `getActionIcon()` function (line 50-55) — returns Lucide icon for action label
- `StatusIndicator` component logic — check/X/spinner for done/failed/running

**Key behaviors:**

- **ShineBorder (sub-component):** `linear-gradient(135deg, colors...)` with `background-size: 255% 255%` and `animate-shine` keyframe. Uses absolute positioning with mask compositing for border-only effect. Visible only when `isActive`. Uses template literals for class composition (no `cn`).

- **Header:** When active, show `<ShimmerText text="{actorLabel} is working" />`. When done (`!isActive` and actions exist), show solid text like "{actorLabel} completed {n} actions". Falls back to `'Agent'` when `activeActor` is null or not in `ACTOR_LABELS`.

> **[HAZARD]** The `isActive` flag flickers between steps — it goes false on STEP_OK, then the grace period (800ms in `useThinkingState.ts:27`) keeps it active, then STEP_START re-activates it. The ShineBorder and header shimmer must key off `state.isActive` (which the grace period already smooths). Do not add independent timers. Severity: Medium.

- **Vertical timeline line:** `absolute left-2 top-7 bottom-3 -mx-px w-0.5 bg-gradient-to-b from-neutral-200 from-90% to-transparent`

- **Steps:** Non-expandable rows (ThinkingAction has no detail field). Each has:
  - Small dot (neutral-400 bg, covers timeline line with `shadow-[0_0_2px_6px_#FAFAFA]`)
  - Action icon from `getActionIcon(label)`
  - Label text (neutral-400 when running, neutral-500 when done/failed)
  - Status indicator (green check / red X / spinning loader)
  - Action labels come pre-formatted from the background (e.g., "Clicking login button") — no verb conjugation needed

- **Last step animation:** Framer Motion `motion.div` with `initial={{ opacity: 0, filter: 'blur(10px)' }}` → `animate={{ opacity: 1, filter: 'blur(0px)' }}` with spring transition. Only the latest-added step animates in.

- **Header expand/collapse:** Grid template rows transition matching existing pattern in `ThinkingWidget.tsx:102-103`.

- **Post-completion:** When `isActive` becomes false, ShineBorder stops, header shows solid text, steps remain expanded and visible. Returns `null` only when `!isActive && actions.length === 0`.

### 3. Modify `SidePanel.tsx`

Three changes:

**a) Remove ThinkingWidget import and rendering:**
- Delete `import ThinkingWidget from './components/ThinkingWidget'`
- Delete `<ThinkingWidget state={thinkingWidgetState} />` (line ~1343)

**b) Render InlineToolChain as sibling in scroll container:**
```tsx
// Before (lines ~1332-1345):
<div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
  <MessageList messages={messages} isStreaming={...} ... />
  <div ref={messagesEndRef} />
</div>
<ThinkingWidget state={thinkingWidgetState} />
{renderChatInput()}

// After:
<div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
  <MessageList messages={messages} isStreaming={...} ... />
  <InlineToolChain state={thinkingWidgetState} />
  <div ref={messagesEndRef} />
</div>
{renderChatInput()}
```

**c) Fix auto-scroll to trigger on thinking state changes:**

> **[HAZARD]** The current auto-scroll (`SidePanel.tsx:1124-1126`) triggers only on `[messages]` changes. New tool steps will appear below the fold without auto-scrolling. Severity: Critical.

```tsx
// Before (SidePanel.tsx:1123-1126):
useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages]);

// After:
useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages, thinkingWidgetState.actions.length]);
```

### 4. Add Tailwind Animations

In `pages/side-panel/tailwind.config.ts`, add to existing keyframes and animation objects:

```ts
keyframes: {
  // ... existing: progress, fadeIn, voicePulse, slideIn, loadingBounce
  shimmerLoop: {
    '0%': { backgroundPosition: '0% 0', opacity: '0.98' },
    '15%': { opacity: '1' },
    '86%': { backgroundPosition: '-200% 0', opacity: '1' },
    '100%': { backgroundPosition: '-202% 0', opacity: '0.99' },
  },
  shine: {
    '0%': { backgroundPosition: '0% 0%' },
    '50%': { backgroundPosition: '100% 100%' },
    '100%': { backgroundPosition: '0% 0%' },
  },
},
animation: {
  // ... existing: progress, 'fade-in', 'voice-pulse', 'slide-in'
  shimmer: 'shimmerLoop 1s linear infinite',
  shine: 'shine var(--duration) infinite linear',
},
```

### 5. Delete `ThinkingWidget.tsx`

Remove `pages/side-panel/src/components/ThinkingWidget.tsx` entirely. All reusable constants have been moved to `InlineToolChain.tsx`.

---

## Exact CSS/Tailwind Reference (extracted from Dex)

### ShineBorder — Full JSX

```tsx
function ShineBorder({
  borderWidth = 1,
  duration = 14,
  shineColor = '#000000',
  opacity = 1,
  className = '',
}: {
  borderWidth?: number;
  duration?: number;
  shineColor?: string | string[];
  opacity?: number;
  className?: string;
}) {
  return (
    <div
      style={{
        '--border-width': `${borderWidth}px`,
        '--duration': `${duration}s`,
        backgroundImage: `linear-gradient(135deg, ${
          Array.isArray(shineColor) ? shineColor.join(', ') : shineColor
        }, transparent 100%)`,
        backgroundSize: '255% 255%',
        mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        WebkitMaskComposite: 'xor',
        maskComposite: 'exclude',
        padding: 'var(--border-width)',
        opacity,
      } as React.CSSProperties}
      className={`pointer-events-none absolute inset-0 size-full rounded-[inherit] will-change-[background-position] animate-shine ${className}`}
    />
  );
}
```

Usage while executing:
```tsx
{state.isActive && (
  <ShineBorder
    shineColor={['#D87C3590', '#FF00FF', '#0066FF', '#00FFFF']}
    borderWidth={1.5}
    duration={2}
    opacity={0.4}
  />
)}
```

### Card Container — Tailwind Classes

```
rounded-[14px] overflow-hidden border border-black/10 bg-white relative
shadow-[0_2px_4px_0_rgba(0,0,0,0.03),_0_1px_0_0_rgba(255,255,255,0.60)_inset]
```

### Card Header — Tailwind Classes

```tsx
// Container
className="px-[16px] py-[9px] flex justify-between items-center bg-white transition-colors cursor-pointer hover:bg-black/[0.02]"

// Left side: icon + text
className="flex gap-1 items-center text-gray-500"

// When running (shimmer):
<ShimmerText text={label} className="text-[14px] font-medium" />

// When done (solid):
<span className="text-[14px] text-black font-medium">{label}</span>

// Chevron (right side):
className={`text-gray-500 transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`}
// size={14}
```

### ChainStep — Tailwind Classes (Non-expandable)

```tsx
// Step container (Framer Motion — only last step animates in)
<motion.div
  initial={isLast ? { opacity: 0, filter: 'blur(10px)' } : false}
  animate={{ opacity: 1, filter: 'blur(0px)' }}
  transition={{ duration: 0.6, type: 'spring', bounce: 0 }}
  className="flex relative items-center gap-3 text-sm"
>
  {/* Step dot background (covers timeline line) */}
  <div className="shadow-[0_0_2px_6px_#FAFAFA] bg-neutral-50">
    <div className="grid relative place-items-center size-4">
      <div className="rounded-full size-1.5 bg-neutral-400" />
    </div>
  </div>

  {/* Action icon */}
  <Icon size={13} className="shrink-0 text-neutral-400" />

  {/* Label */}
  <span className={`flex-1 truncate transition-colors ${
    action.status === 'running' ? 'text-neutral-400' : 'text-neutral-500'
  }`}>
    {action.label}
  </span>

  {/* Status indicator */}
  <StatusIndicator status={action.status} />
</motion.div>
```

### Collapsible Content — CSS Grid Transition

```tsx
// Collapsible wrapper (matches existing ThinkingWidget.tsx:102 pattern)
<div
  className="grid duration-200 ease-out transition-[grid-template-rows]"
  style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}>
  <div className="overflow-hidden">
    {/* Steps container with timeline */}
    <div className="flex relative flex-col gap-3 px-4 pb-3 pt-1">
      <div className="absolute left-[31px] bottom-3 top-5 w-0.5 bg-gradient-to-b from-neutral-200 from-90% to-transparent" />
      {state.actions.map((action, i) => (
        <ChainStep key={action.id} action={action} isLast={i === state.actions.length - 1} />
      ))}
    </div>
  </div>
</div>
```

### Divider Line — Framer Motion

```tsx
<motion.div
  animate={{ opacity: expanded ? 1 : 0 }}
  transition={{ duration: 0.15, ease: 'easeOut' }}
  className="border-b border-black/10"
/>
```

---

## Verification

1. `pnpm -F pages/side-panel type-check` — No TypeScript errors
2. `pnpm -F pages/side-panel build` — Builds successfully
3. `pnpm build` — Full extension build
4. Load extension in Chrome, trigger an agent task:
   - Tool chain appears inline in message scroll area, after messages
   - Steps animate in with blur effect (last step only)
   - Active header shows shimmer text
   - Completed steps show solid text with check icon
   - Card has animated shine border while active
   - Header collapses/expands on click
   - When task completes, shine border stops, header shows solid "completed" text
   - Component renders nothing when no actions and not active
5. **Auto-scroll**: New tool steps scroll into view (verify `messagesEndRef` triggers on action count change)
6. Grace period: between steps (800ms gap), the widget stays visible — no flicker
