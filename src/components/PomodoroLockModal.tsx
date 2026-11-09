import React, { useEffect, useState, useRef } from 'react';
import { ShieldAlert, Flame, Clock, FastForward, XCircle, EyeOff } from 'lucide-react';
import { soundEngine } from '../utils/soundEngine';

interface PomodoroLockModalProps {
  isOpen: boolean;
  taskTitle: string;
  taskTypeLabel: string; // "NGHI THỨC (RITUAL)" | "CÔNG PHÁ (DAILY STRIKE)"
  requiredMins: number;
  isMonkModeOn: boolean;
  devModeEnabled: boolean;
  onCompletePomodoro: (completedMins: number) => void;
  onCancelOrAbandon: (reason: string) => void;
}

export const PomodoroLockModal: React.FC<PomodoroLockModalProps> = ({
  isOpen,
  taskTitle,
  taskTypeLabel,
  requiredMins,
  isMonkModeOn,
  devModeEnabled,
  onCompletePomodoro,
  onCancelOrAbandon,
}) => {
  const totalSeconds = Math.max(60, requiredMins * 60);
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [isRunning, setIsRunning] = useState(true);
  const [isWindowFocused, setIsWindowFocused] = useState(true);
  const [outOfFocusSeconds, setOutOfFocusSeconds] = useState(0);
  const [abandonedByBlur, setAbandonedByBlur] = useState(false);
  const [procrastinationWarning, setProcrastinationWarning] = useState<string | null>(null);

  const outOfFocusRef = useRef(0);

  useEffect(() => {
    if (!isOpen) return;
    setSecondsLeft(Math.max(60, requiredMins * 60));
    setIsRunning(true);
    setIsWindowFocused(true);
    setOutOfFocusSeconds(0);
    setAbandonedByBlur(false);
    setProcrastinationWarning(null);
    outOfFocusRef.current = 0;
    soundEngine.playTempleBell(0.8);
  }, [isOpen, requiredMins]);

  // Monitor Window Focus / Blur for the 30-second Strict Lock Rule (Section 3.3)
  useEffect(() => {
    if (!isOpen || !isRunning || abandonedByBlur) return;

    const handleBlur = () => {
      setIsWindowFocused(false);
      setProcrastinationWarning(
        'Tâm viên ý mã. Bạn lên núi để tu luyện hay để mang theo thói lười biếng của hồng trần? Quay lại ngay trong 30 giây!'
      );
      soundEngine.playWoodenFish(0.85);
    };

    const handleFocus = () => {
      setIsWindowFocused(true);
      outOfFocusRef.current = 0;
      setOutOfFocusSeconds(0);
    };

    const handleVisibility = () => {
      if (document.hidden) handleBlur();
      else handleFocus();
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    let unsubscribeElectron: (() => void) | undefined;
    if (window.monkDesktopAPI?.onWindowFocusChanged) {
      unsubscribeElectron = window.monkDesktopAPI.onWindowFocusChanged((data) => {
        if (!data.isFocused) handleBlur();
        else handleFocus();
      });
    }

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (unsubscribeElectron) unsubscribeElectron();
    };
  }, [isOpen, isRunning, abandonedByBlur]);

  // Main Pomodoro Countdown + Out-of-Focus 30s Violation Timer
  useEffect(() => {
    if (!isOpen || !isRunning || abandonedByBlur) return;

    const timer = window.setInterval(() => {
      if (!isWindowFocused && isMonkModeOn) {
        outOfFocusRef.current += 1;
        setOutOfFocusSeconds(outOfFocusRef.current);
        soundEngine.playWoodenFish(0.8);

        if (outOfFocusRef.current >= 30) {
          setAbandonedByBlur(true);
          setIsRunning(false);
          soundEngine.playViolationGong();
          return;
        }
      }

      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          soundEngine.playTempleBell(1.0);
          setTimeout(() => onCompletePomodoro(requiredMins), 300);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, isRunning, isWindowFocused, isMonkModeOn, abandonedByBlur, requiredMins, onCompletePomodoro]);

  if (!isOpen) return null;

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const pct = Math.min(100, Math.round(((totalSeconds - secondsLeft) / totalSeconds) * 100));

  return (
    <div className="zen-modal-backdrop">
      <div className="zen-modal-card pomodoro-lock-card">
        <div className="pomodoro-header-badge">
          <Flame size={16} />
          <span>KHÓA THIỀN ĐỊNH POMODORO — {taskTypeLabel}</span>
        </div>

        <h2 className="pomodoro-task-title">{taskTitle}</h2>
        <p className="pomodoro-subtitle">
          {isMonkModeOn
            ? 'GIỚI LUẬT KHÓA TẬP TRUNG: Nếu rời khỏi cửa sổ ứng dụng quá 30 giây, phiên làm việc sẽ lập tức bị hủy bỏ.'
            : 'Chế độ Chân Núi (Monk Mode: OFF) — Rèn luyện tập trung tự giác.'}
        </p>

        {/* Big Circular / Ink Wash Timer */}
        <div className="pomodoro-clock-circle">
          <div className="pomodoro-time-digits">
            {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </div>
          <div className="pomodoro-progress-label">
            Đã tu luyện: {pct}% ({requiredMins} phút cam kết)
          </div>
          <div className="zen-progress-track" style={{ width: '80%', marginTop: 12 }}>
            <div className="zen-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Out of focus 30-second countdown warning */}
        {!isWindowFocused && isMonkModeOn && !abandonedByBlur && (
          <div className="zen-alert-box alert-danger">
            <EyeOff size={20} />
            <div>
              <strong>CẢNH BÁO RỜI VỊ TRÍ TU LUYỆN ({30 - outOfFocusSeconds}s còn lại trước khi HỦY PHIÊN)!</strong>
              <p style={{ marginTop: 4 }}>
                "Tâm viên ý mã. Bạn lên núi để tu luyện hay để mang theo thói lười biếng của hồng trần? Bắt đầu ngay."
              </p>
            </div>
          </div>
        )}

        {procrastinationWarning && isWindowFocused && !abandonedByBlur && (
          <div className="zen-alert-box alert-warning">
            <ShieldAlert size={18} />
            <span>{procrastinationWarning}</span>
          </div>
        )}

        {/* Abandoned state when user left window > 30s */}
        {abandonedByBlur && (
          <div className="zen-alert-box alert-danger">
            <XCircle size={22} />
            <div>
              <strong>PHIÊN POMODORO ĐÃ BỊ HỦY DO RỜI CỬA SỔ QUÁ 30 GIÂY!</strong>
              <p style={{ marginTop: 4 }}>
                "Tâm viên ý mã. Bạn đã rời khỏi không gian tu luyện quá 30 giây. Toàn bộ thời gian của phiên này không được tính."
              </p>
            </div>
          </div>
        )}

        <div className="pomodoro-actions-row">
          {!abandonedByBlur ? (
            <>
              {devModeEnabled && (
                <button
                  type="button"
                  className="zen-btn zen-btn-seal"
                  onClick={() => {
                    soundEngine.playTempleBell(0.95);
                    onCompletePomodoro(requiredMins);
                  }}
                  title="Chế độ Kiểm thử: Hoàn thành ngay phiên Pomodoro để chuyển sang bước chụp Bằng chứng PoW"
                >
                  <FastForward size={16} />
                  <span>Hoàn tất nhanh Pomodoro ({requiredMins}p - Dev Test)</span>
                </button>
              )}

              {devModeEnabled && isMonkModeOn && (
                <button
                  type="button"
                  className="zen-btn zen-btn-outline"
                  onClick={() => {
                    setIsWindowFocused(false);
                    outOfFocusRef.current = 26;
                    setOutOfFocusSeconds(26);
                    setProcrastinationWarning(
                      'Tâm viên ý mã. Bạn lên núi để tu luyện hay để mang theo thói lười biếng của hồng trần? Bắt đầu ngay.'
                    );
                  }}
                >
                  <Clock size={16} />
                  <span>Giả lập thoát ra ngoài 26s (Test câu cảnh báo)</span>
                </button>
              )}

              <button
                type="button"
                className="zen-btn zen-btn-ghost"
                onClick={() => onCancelOrAbandon('Người dùng tự hủy phiên Pomodoro giữa chừng.')}
              >
                Hủy phiên (Không tính kết quả)
              </button>
            </>
          ) : (
            <button
              type="button"
              className="zen-btn zen-btn-seal"
              onClick={() =>
                onCancelOrAbandon('Rời khỏi cửa sổ ứng dụng quá 30 giây trong khi khóa Pomodoro.')
              }
            >
              Chấp nhận hình phạt & Làm lại từ đầu
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
