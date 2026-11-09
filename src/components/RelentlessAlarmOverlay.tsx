import React, { useEffect } from 'react';
import { BellRing, Flame, ShieldAlert } from 'lucide-react';
import { soundEngine } from '../utils/soundEngine';
import { desktopBridge } from '../services/desktopBridge';

export interface ActiveNaggingAlert {
  level: 1 | 2;
  targetId: string;
  targetType: 'RITUAL' | 'STRIKE';
  title: string;
  scheduledWindow: string;
  requiredPomodoroMins: number;
}

interface RelentlessAlarmOverlayProps {
  alert: ActiveNaggingAlert | null;
  onStartPomodoroNow: (alert: ActiveNaggingAlert) => void;
  onEscalateToLevel2: () => void;
  onDismissLevel1: () => void;
}

export const RelentlessAlarmOverlay: React.FC<RelentlessAlarmOverlayProps> = ({
  alert,
  onStartPomodoroNow,
  onEscalateToLevel2,
  onDismissLevel1,
}) => {
  useEffect(() => {
    if (!alert) {
      soundEngine.stopRelentlessAlarm();
      desktopBridge.setAlarmHijack(false);
      return;
    }

    if (alert.level === 1) {
      soundEngine.playTempleBell(0.95);
      desktopBridge.sendNotification(
        `[CHUÔNG CHÙA CẤP ĐỘ 1] Đến giờ ${alert.targetType === 'RITUAL' ? 'Nghi Thức' : 'Công Phá'}`,
        `${alert.title} (${alert.scheduledWindow}) — Khởi động phiên Pomodoro ngay.`
      );
    } else if (alert.level === 2) {
      desktopBridge.setAlarmHijack(true);
      soundEngine.startRelentlessAlarm();
      desktopBridge.sendNotification(
        `[CẢNH BÁO CỰC ĐOAN CẤP ĐỘ 2] Trễ hạn ${alert.title}!`,
        'Tâm viên ý mã. Bạn lên núi để tu luyện hay để mang theo thói lười biếng của hồng trần? Bắt đầu ngay.'
      );
    }

    return () => {
      soundEngine.stopRelentlessAlarm();
    };
  }, [alert]);

  if (!alert) return null;

  // Level 1: Top Resonant Temple Bell Notification Bar
  if (alert.level === 1) {
    return (
      <div className="nagging-level1-banner">
        <div className="nagging-level1-left">
          <BellRing size={22} className="bell-ring-anim" />
          <div>
            <div className="nagging-level1-tag">
              NHẮC NHỞ CẤP ĐỘ 1 (ĐÚNG GIỜ — TIẾNG CHUÔNG CHÙA TRẦM VANG)
            </div>
            <strong>
              {alert.title} ({alert.scheduledWindow})
            </strong>
          </div>
        </div>
        <div className="nagging-level1-actions">
          <button
            type="button"
            className="zen-btn zen-btn-outline"
            onClick={onEscalateToLevel2}
            title="Giả lập trễ 5 phút để xem Full-Screen Hijack Cấp độ 2"
          >
            Giả lập trễ 5 phút (Kích hoạt Cấp độ 2)
          </button>
          <button
            type="button"
            className="zen-btn zen-btn-seal"
            onClick={() => onStartPomodoroNow(alert)}
          >
            <Flame size={16} />
            <span>Bắt đầu phiên Pomodoro ({alert.requiredPomodoroMins}p)</span>
          </button>
          <button type="button" className="zen-btn zen-btn-ghost" onClick={onDismissLevel1}>
            Tạm ẩn 2 phút
          </button>
        </div>
      </div>
    );
  }

  // Level 2: Full-Screen Hijack Intent (Chiếm trọn màn hình máy tính, ghi đè âm lượng chuông liên tục)
  return (
    <div className="nagging-level2-fullscreen">
      <div className="nagging-level2-card">
        <div className="nagging-level2-badge">
          <ShieldAlert size={24} />
          <span>CẢNH BÁO CỰC ĐOAN CẤP ĐỘ 2 — FULL-SCREEN HIJACK (TRỄ QUÁ 5 PHÚT)</span>
        </div>

        <h1 className="nagging-level2-quote">
          “Tâm viên ý mã. Bạn lên núi để tu luyện hay để mang theo thói lười biếng của hồng trần? Bắt đầu ngay.”
        </h1>

        <div className="nagging-level2-task-box">
          <div className="nagging-task-type">
            {alert.targetType === 'RITUAL' ? 'NGHI THỨC BẮT BUỘC' : 'NHIỆM VỤ CÔNG PHÁ'} — KHUNG GIỜ:{' '}
            {alert.scheduledWindow}
          </div>
          <h2>{alert.title}</h2>
          <p>
            Chuông cảnh báo đang phát liên tục ở luồng ưu tiên tối đa. Không có nút tắt chuông — cảnh báo chỉ dừng lại khi bạn bấm vào nút bắt đầu phiên thiền định Pomodoro bên dưới.
          </p>
        </div>

        <button
          type="button"
          className="nagging-level2-cta"
          onClick={() => {
            soundEngine.stopRelentlessAlarm();
            desktopBridge.setAlarmHijack(false);
            onStartPomodoroNow(alert);
          }}
        >
          <Flame size={24} />
          <span>BẮT ĐẦU PHIÊN POMODORO NGAY ({alert.requiredPomodoroMins} PHÚT)</span>
        </button>
      </div>
    </div>
  );
};
