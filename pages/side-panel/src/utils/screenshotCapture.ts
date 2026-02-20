export interface CaptureResult {
  croppedDataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function isRestrictedUrl(url: string): boolean {
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:')
  );
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
      background: '#000',
    });

    const img = document.createElement('img');
    img.src = screenshotDataUrl;
    Object.assign(img.style, {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      pointerEvents: 'none',
      userSelect: 'none',
    });
    overlay.appendChild(img);

    const instruction = document.createElement('div');
    Object.assign(instruction.style, {
      position: 'fixed',
      top: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '8px 16px',
      borderRadius: '20px',
      background: 'rgba(255,255,255,0.85)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      fontSize: '13px',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      color: '#333',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      zIndex: '1000000',
      pointerEvents: 'none',
      userSelect: 'none',
    });
    instruction.textContent = 'Select anything to add';
    overlay.appendChild(instruction);

    const selectionBox = document.createElement('div');
    Object.assign(selectionBox.style, {
      position: 'fixed',
      border: '2px solid #1F4EF3',
      background: 'rgba(0,123,255,0.1)',
      borderRadius: '12px',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '1000000',
    });
    overlay.appendChild(selectionBox);

    document.body.appendChild(overlay);

    let startX = 0;
    let startY = 0;
    let isDragging = false;

    const cleanup = () => {
      overlay.remove();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup();
        document.removeEventListener('keydown', handleKeyDown);
        resolve(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    overlay.addEventListener('mousedown', (e: MouseEvent) => {
      startX = e.clientX;
      startY = e.clientY;
      isDragging = true;
      selectionBox.style.display = 'block';
      selectionBox.style.left = `${startX}px`;
      selectionBox.style.top = `${startY}px`;
      selectionBox.style.width = '0';
      selectionBox.style.height = '0';
    });

    overlay.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isDragging) return;
      const x = Math.min(startX, e.clientX);
      const y = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      selectionBox.style.left = `${x}px`;
      selectionBox.style.top = `${y}px`;
      selectionBox.style.width = `${w}px`;
      selectionBox.style.height = `${h}px`;
    });

    overlay.addEventListener('mouseup', (e: MouseEvent) => {
      if (!isDragging) return;
      isDragging = false;
      document.removeEventListener('keydown', handleKeyDown);

      const x = Math.min(startX, e.clientX);
      const y = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);

      if (w < 10 || h < 10) {
        cleanup();
        resolve(null);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const canvas = document.createElement('canvas');
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d')!;

      const cropImg = new Image();
      cropImg.onload = () => {
        const scaleX = cropImg.naturalWidth / window.innerWidth;
        const scaleY = cropImg.naturalHeight / window.innerHeight;
        ctx.drawImage(cropImg, x * scaleX, y * scaleY, w * scaleX, h * scaleY, 0, 0, w * dpr, h * dpr);
        const croppedDataUrl = canvas.toDataURL('image/png');
        cleanup();
        resolve({ croppedDataUrl, x, y, width: w, height: h });
      };
      cropImg.onerror = () => {
        cleanup();
        resolve(null);
      };
      cropImg.src = screenshotDataUrl;
    });
  });
}
