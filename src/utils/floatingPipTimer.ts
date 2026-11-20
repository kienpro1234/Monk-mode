export interface FloatingTimerSnapshot {
  strikeTitle: string;
  mode: 'POMODORO' | 'FLOWTIME';
  running: boolean;
  isOvertime: boolean;
  clockText: string;
  subText: string;
  progressPct: number;
}

export interface FloatingTimerCallbacks {
  onToggleRun: () => void;
  onExtend10: () => void;
  onFinishSession: () => void;
  onClosed: () => void;
}

interface WindowWithDocumentPiP extends Window {
  documentPictureInPicture?: {
    requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
  };
}

const PIP_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    background: linear-gradient(155deg, #161819, #0e1011);
    color: #f6f4ee;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 100vh;
    user-select: none;
    overflow: hidden;
  }
  .top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .mode-badge {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.4px;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid rgba(91, 174, 147, 0.48);
    background: rgba(24, 48, 41, 0.72);
    color: #a8d8c6;
  }
  .mode-badge.is-overtime {
    border-color: rgba(240, 200, 120, 0.75);
    background: rgba(74, 52, 16, 0.78);
    color: #f0c878;
  }
  .mode-badge.is-flow {
    border-color: rgba(77, 208, 225, 0.6);
    background: rgba(16, 52, 62, 0.72);
    color: #80deea;
  }
  .task-title {
    font-size: 12px;
    font-weight: 600;
    color: #dcd8cc;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 6px;
  }
  .clock-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-top: 6px;
  }
  .clock-digits {
    font-family: 'JetBrains Mono', Consolas, monospace;
    font-size: 32px;
    font-weight: 800;
    letter-spacing: 1px;
    color: #f6f4ee;
    line-height: 1.05;
  }
  .clock-digits.is-overtime {
    color: #f0c878;
  }
  .sub-text {
    font-size: 11px;
    color: #a5a195;
  }
  .track {
    width: 100%;
    height: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
    margin: 8px 0;
  }
  .fill {
    height: 100%;
    width: 0%;
    border-radius: 999px;
    background: linear-gradient(90deg, #5bae93, #f0c878);
    transition: width 0.25s ease;
  }
  .btn-row {
    display: flex;
    gap: 6px;
  }
  button {
    flex: 1;
    border-radius: 7px;
    border: 1px solid rgba(246, 244, 238, 0.18);
    background: rgba(255, 255, 255, 0.07);
    color: #f6f4ee;
    font-size: 11.5px;
    font-weight: 700;
    padding: 6px 8px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  button:hover {
    border-color: #f0c878;
    background: rgba(240, 200, 120, 0.16);
  }
  button.primary {
    border-color: rgba(196, 62, 54, 0.8);
    background: linear-gradient(135deg, #8e2b24, #b73b32);
  }
  button.primary:hover {
    filter: brightness(1.1);
  }
  button.hidden {
    display: none;
  }
`;

export class FloatingPipTimerController {
  private childWin: Window | null = null;
  private callbacks: FloatingTimerCallbacks | null = null;
  private domRefs: {
    badge: HTMLElement;
    stateTag: HTMLElement;
    title: HTMLElement;
    clock: HTMLElement;
    sub: HTMLElement;
    fill: HTMLElement;
    toggleBtn: HTMLButtonElement;
    extendBtn: HTMLButtonElement;
  } | null = null;

  public setCallbacks(callbacks: FloatingTimerCallbacks) {
    this.callbacks = callbacks;
  }

  public isOpen(): boolean {
    return Boolean(this.childWin && !this.childWin.closed);
  }

  public async open(
    initialSnapshot: FloatingTimerSnapshot,
    callbacks: FloatingTimerCallbacks
  ): Promise<boolean> {
    this.callbacks = callbacks;
    if (this.isOpen() && this.childWin) {
      this.update(initialSnapshot);
      this.childWin.focus();
      return true;
    }

    let win: Window | null = null;
    const pipHost = (window as WindowWithDocumentPiP).documentPictureInPicture;
    if (pipHost && typeof pipHost.requestWindow === 'function') {
      try {
        win = await pipHost.requestWindow({ width: 348, height: 184 });
      } catch {
        win = null;
      }
    }

    if (!win) {
      win = window.open(
        '',
        'len_nui_floating_timer',
        'popup=yes,width=354,height=196,left=48,top=48,resizable=yes'
      );
    }

    if (!win) {
      return false;
    }

    this.childWin = win;
    this.mountDom(win);
    this.update(initialSnapshot);
    return true;
  }

  private mountDom(win: Window) {
    const doc = win.document;
    doc.title = 'Đồng Hồ Tập Trung — Lên Núi';
    doc.head.innerHTML = '';
    const styleEl = doc.createElement('style');
    styleEl.textContent = PIP_STYLES;
    doc.head.appendChild(styleEl);

    doc.body.innerHTML = '';
    const topRow = doc.createElement('div');
    topRow.className = 'top-row';
    const badge = doc.createElement('span');
    badge.className = 'mode-badge';
    const stateTag = doc.createElement('span');
    stateTag.className = 'sub-text';
    topRow.appendChild(badge);
    topRow.appendChild(stateTag);

    const title = doc.createElement('div');
    title.className = 'task-title';

    const clockRow = doc.createElement('div');
    clockRow.className = 'clock-row';
    const clock = doc.createElement('div');
    clock.className = 'clock-digits';
    const sub = doc.createElement('div');
    sub.className = 'sub-text';
    clockRow.appendChild(clock);
    clockRow.appendChild(sub);

    const track = doc.createElement('div');
    track.className = 'track';
    const fill = doc.createElement('div');
    fill.className = 'fill';
    track.appendChild(fill);

    const btnRow = doc.createElement('div');
    btnRow.className = 'btn-row';
    const toggleBtn = doc.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'primary';
    toggleBtn.addEventListener('click', () => this.callbacks?.onToggleRun());

    const extendBtn = doc.createElement('button');
    extendBtn.type = 'button';
    extendBtn.textContent = '⚡ +10p';
    extendBtn.addEventListener('click', () => this.callbacks?.onExtend10());

    const finishBtn = doc.createElement('button');
    finishBtn.type = 'button';
    finishBtn.textContent = '✓ Chốt hiệp';
    finishBtn.addEventListener('click', () => this.callbacks?.onFinishSession());

    btnRow.appendChild(toggleBtn);
    btnRow.appendChild(extendBtn);
    btnRow.appendChild(finishBtn);

    doc.body.appendChild(topRow);
    doc.body.appendChild(title);
    doc.body.appendChild(clockRow);
    doc.body.appendChild(track);
    doc.body.appendChild(btnRow);

    this.domRefs = { badge, stateTag, title, clock, sub, fill, toggleBtn, extendBtn };

    const onWinClosed = () => {
      this.childWin = null;
      this.domRefs = null;
      this.callbacks?.onClosed();
    };
    win.addEventListener('pagehide', onWinClosed, { once: true });
    win.addEventListener('beforeunload', onWinClosed, { once: true });
  }

  public update(snapshot: FloatingTimerSnapshot) {
    if (!this.isOpen() || !this.domRefs) return;
    const { badge, stateTag, title, clock, sub, fill, toggleBtn, extendBtn } = this.domRefs;

    if (snapshot.isOvertime) {
      badge.textContent = '🌊 VƯỢT GIỜ FLOW';
      badge.className = 'mode-badge is-overtime';
    } else if (snapshot.mode === 'FLOWTIME') {
      badge.textContent = '🌊 FLOWTIME TỰ DO';
      badge.className = 'mode-badge is-flow';
    } else {
      badge.textContent = '⏱️ POMODORO';
      badge.className = 'mode-badge';
    }

    stateTag.textContent = snapshot.running ? '🔴 Đang chạy' : '⏸ Tạm dừng';
    title.textContent = snapshot.strikeTitle;
    clock.textContent = snapshot.clockText;
    clock.className = snapshot.isOvertime ? 'clock-digits is-overtime' : 'clock-digits';
    sub.textContent = snapshot.subText;
    fill.style.width = `${Math.max(0, Math.min(100, snapshot.progressPct))}%`;
    toggleBtn.textContent = snapshot.running ? '⏸ Tạm dừng' : '▶ Tiếp tục';
    extendBtn.className = snapshot.mode === 'POMODORO' ? '' : 'hidden';
  }

  public close() {
    if (this.childWin && !this.childWin.closed) {
      try {
        this.childWin.close();
      } catch {
        // Ignore
      }
    }
    this.childWin = null;
    this.domRefs = null;
  }
}
