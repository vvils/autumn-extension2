export interface CaptureResult {
  croppedDataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isRestrictedUrl(url: string): boolean {
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:')
  );
}

export async function canCaptureActiveTab(): Promise<boolean> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return !!(tab?.id && tab.url && !isRestrictedUrl(tab.url));
  } catch {
    return false;
  }
}

export async function captureScreenshot(): Promise<CaptureResult | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || isRestrictedUrl(tab.url)) return null;

  const screenshotDataUrl: string = await new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab({ format: 'png' }, dataUrl => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(dataUrl);
    });
  });

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: injectSelectionOverlay,
    args: [screenshotDataUrl],
  });

  const result = results?.[0]?.result as CaptureResult | null;
  return result;
}

function injectSelectionOverlay(screenshotDataUrl: string): Promise<CaptureResult | null> {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '999999',
      cursor: 'crosshair',
      background: '#fff',
      margin: '0',
      padding: '0',
    });

    const img = document.createElement('img');
    img.src = screenshotDataUrl;
    img.alt = 'Screenshot';
    img.draggable = false;
    Object.assign(img.style, {
      width: '100vw',
      height: '100vh',
      objectFit: 'contain',
      display: 'block',
      userSelect: 'none',
    });
    overlay.appendChild(img);

    const topGradient = document.createElement('div');
    Object.assign(topGradient.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      height: '120px',
      background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)',
      zIndex: '1000000',
      pointerEvents: 'none',
    });
    overlay.appendChild(topGradient);

    const instruction = document.createElement('div');
    instruction.innerHTML =
      '<span style="color:#374151;font-family:ui-sans-serif,system-ui,sans-serif;">Select anything to add to Autumn</span>';
    Object.assign(instruction.style, {
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(210,210,210,0.6)',
      backdropFilter: 'blur(3px)',
      WebkitBackdropFilter: 'blur(3px)',
      borderRadius: '12px',
      padding: '8px 16px',
      fontSize: '12px',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      boxShadow: '0 0 6px rgba(0,0,0,0.08)',
      border: '1px solid rgba(0,0,0,0.1)',
      zIndex: '1000001',
      pointerEvents: 'none',
      display: 'flex',
      alignItems: 'center',
    });
    overlay.appendChild(instruction);

    const selectionBox = document.createElement('div');
    Object.assign(selectionBox.style, {
      position: 'absolute',
      border: '2px solid #1F4EF3',
      background: 'rgba(0,123,255,0.1)',
      pointerEvents: 'none',
      zIndex: '1000000',
      borderRadius: '12px',
      display: 'none',
    });
    overlay.appendChild(selectionBox);

    document.body.appendChild(overlay);

    let startX = 0;
    let startY = 0;
    let isDragging = false;

    function cleanup() {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('keydown', handleKeyDown);
      overlay.remove();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cleanup();
        resolve(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    const clampX = (v: number) => Math.max(0, Math.min(v, window.innerWidth));
    const clampY = (v: number) => Math.max(0, Math.min(v, window.innerHeight));

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const curX = clampX(e.clientX);
      const curY = clampY(e.clientY);
      const x = Math.min(startX, curX);
      const y = Math.min(startY, curY);
      const w = Math.abs(curX - startX);
      const h = Math.abs(curY - startY);
      selectionBox.style.left = `${x}px`;
      selectionBox.style.top = `${y}px`;
      selectionBox.style.width = `${w}px`;
      selectionBox.style.height = `${h}px`;
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;

      const endX = clampX(e.clientX);
      const endY = clampY(e.clientY);
      const x = Math.min(startX, endX);
      const y = Math.min(startY, endY);
      const w = Math.abs(endX - startX);
      const h = Math.abs(endY - startY);

      if (w < 10 || h < 10) {
        cleanup();
        resolve(null);
        return;
      }

      const imgRect = img.getBoundingClientRect();
      const scaleX = img.naturalWidth / imgRect.width;
      const scaleY = img.naturalHeight / imgRect.height;
      const cropX = (x - imgRect.left) * scaleX;
      const cropY = (y - imgRect.top) * scaleY;
      const cropW = w * scaleX;
      const cropH = h * scaleY;

      const canvas = document.createElement('canvas');
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      const croppedDataUrl = canvas.toDataURL('image/png');
      cleanup();
      resolve({ croppedDataUrl, x, y, width: w, height: h });
    };

    overlay.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      isDragging = true;
      instruction.style.display = 'none';
      selectionBox.style.display = 'block';
      selectionBox.style.left = `${startX}px`;
      selectionBox.style.top = `${startY}px`;
      selectionBox.style.width = '0';
      selectionBox.style.height = '0';
    });

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  });
}
