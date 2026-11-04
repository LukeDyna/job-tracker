// File downloads that behave on iPhone (including the installed home-screen
// app, where <a download> is unreliable) as well as on a Mac.

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

function anchorDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Calendar file. iOS Safari shows its "Add to Calendar" sheet when it opens a
 * text/calendar document, so on iPhone we navigate to it rather than saving it.
 */
export function openCalendarFile(ics: string, filename: string) {
  if (isIOS()) {
    window.location.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
    return;
  }
  anchorDownload(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), filename);
}

/** Save a text file. On iPhone use the share sheet ("Save to Files", AirDrop, Mail…). */
export async function saveTextFile(text: string, filename: string, mime: string): Promise<void> {
  const blob = new Blob([text], { type: mime });
  if (isIOS() && 'canShare' in navigator) {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return;
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return; // she closed the sheet
      }
    }
  }
  anchorDownload(blob, filename);
}
