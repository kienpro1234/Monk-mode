import React, { useEffect, useRef, useState } from 'react';

/**
 * Định dạng số phút sang chuẩn dễ đọc: "10h30p", "7h30p", "6h", "45p", "1h05p".
 */
export function formatDurationHM(mins: number): string {
  const m = Math.max(0, Math.round(mins || 0));
  if (m < 60) return `${m}p`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h${String(r).padStart(2, '0')}p`;
}

interface DurationHMInputProps {
  valueMins: number;
  onChangeMins: (nextMins: number) => void;
  minMins?: number;
  maxHours?: number;
  showPreviewBadge?: boolean;
  compact?: boolean;
  hoursLabel?: string;
  minsLabel?: string;
}

export const DurationHMInput: React.FC<DurationHMInputProps> = ({
  valueMins,
  onChangeMins,
  minMins = 0,
  maxHours = 24,
  showPreviewBadge = true,
  compact = false,
  hoursLabel = 'tiếng',
  minsLabel = 'phút',
}) => {
  const normalizedInit = Math.max(0, Math.round(valueMins || 0));
  const [hoursText, setHoursText] = useState<string>(() => String(Math.floor(normalizedInit / 60)));
  const [minsText, setMinsText] = useState<string>(() => String(normalizedInit % 60));
  const [blurSyncTick, setBlurSyncTick] = useState<number>(0);

  const hoursTextRef = useRef(hoursText);
  const minsTextRef = useRef(minsText);
  const focusedRef = useRef<'h' | 'm' | null>(null);

  useEffect(() => {
    if (focusedRef.current !== null) return;
    const safe = Math.max(0, Math.round(valueMins || 0));
    const hStr = String(Math.floor(safe / 60));
    const mStr = String(safe % 60);
    hoursTextRef.current = hStr;
    minsTextRef.current = mStr;
    setHoursText(hStr);
    setMinsText(mStr);
  }, [valueMins, blurSyncTick]);

  const maxTotalMins = maxHours * 60 + 59;

  const commitDraft = (rawH: string, rawM: string, normalizeText: boolean) => {
    const hasDigit = rawH !== '' || rawM !== '';
    const parsedH = rawH === '' ? 0 : Math.min(maxHours, Number(rawH) || 0);
    const parsedM = rawM === '' ? 0 : Number(rawM) || 0;
    const rawTotal = parsedH * 60 + parsedM;
    const clamped = Math.max(minMins, Math.min(maxTotalMins, Math.round(rawTotal)));

    if (normalizeText) {
      const finalTotal = hasDigit ? clamped : Math.max(minMins, Math.round(valueMins || minMins));
      const hStr = String(Math.floor(finalTotal / 60));
      const mStr = String(finalTotal % 60);
      hoursTextRef.current = hStr;
      minsTextRef.current = mStr;
      setHoursText(hStr);
      setMinsText(mStr);
      if (finalTotal !== Math.round(valueMins || 0)) {
        onChangeMins(finalTotal);
      }
      return;
    }

    if (hasDigit) {
      onChangeMins(clamped);
    }
  };

  const handleHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const clean = e.target.value.replace(/[^\d]/g, '').slice(0, 2);
    hoursTextRef.current = clean;
    setHoursText(clean);
    commitDraft(clean, minsTextRef.current, false);
  };

  const handleMinsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const clean = e.target.value.replace(/[^\d]/g, '').slice(0, 3);
    minsTextRef.current = clean;
    setMinsText(clean);
    commitDraft(hoursTextRef.current, clean, false);
  };

  const liveH = hoursText === '' ? 0 : Number(hoursText) || 0;
  const liveM = minsText === '' ? 0 : Number(minsText) || 0;
  const livePreviewTotal = Math.max(minMins, Math.min(maxTotalMins, Math.round(liveH * 60 + liveM)));

  return (
    <div className={`hm-input-pair ${compact ? 'is-compact' : ''}`}>
      <input
        type="text"
        inputMode="numeric"
        aria-label={`Số ${hoursLabel}`}
        className="zen-input hm-num-field"
        value={hoursText}
        onFocus={(e) => {
          focusedRef.current = 'h';
          e.currentTarget.select();
        }}
        onBlur={() => {
          focusedRef.current = null;
          commitDraft(hoursTextRef.current, minsTextRef.current, true);
          setBlurSyncTick((v) => v + 1);
        }}
        onChange={handleHoursChange}
      />
      <span>{hoursLabel}</span>
      <input
        type="text"
        inputMode="numeric"
        aria-label={`Số ${minsLabel}`}
        className="zen-input hm-num-field"
        value={minsText}
        onFocus={(e) => {
          focusedRef.current = 'm';
          e.currentTarget.select();
        }}
        onBlur={() => {
          focusedRef.current = null;
          commitDraft(hoursTextRef.current, minsTextRef.current, true);
          setBlurSyncTick((v) => v + 1);
        }}
        onChange={handleMinsChange}
      />
      <span>{minsLabel}</span>
      {showPreviewBadge && (
        <span className="hm-duration-preview-badge">{formatDurationHM(livePreviewTotal)}</span>
      )}
    </div>
  );
};
