import React, { useMemo } from 'react';
import {
  Bot,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Edit3,
  FileText,
  Flame,
  Mountain,
  Plus,
  Square,
  Swords,
  Trash2,
} from 'lucide-react';
import { AIClimbingSchedulePlan, PeakGoalEntity } from '../types/models';
import { WoodblockSealSvg } from '../components/WoodblockSealSvg';
import {
  getDayOfWeekFromDateStr,
  isSlotActiveNow,
  WEEKDAY_LABELS,
} from '../services/aiSchedulePlanner';
import { TabPurposeBanner } from '../components/TabPurposeBanner';

export interface MountainStats {
  totalStrikes: number;
  completedCount: number;
  pendingCount: number;
  totalPomoMins: number;
  totalPomoHours: number;
  proofPhotosCount: number;
  journalsCount: number;
  violationsCount: number;
}

interface GoalsHubViewProps {
  peakGoals: PeakGoalEntity[];
  nowTick: number;
  todayStr: string;
  climbingSchedulePlan?: AIClimbingSchedulePlan | null;
  getMountainStats: (goalId: string) => MountainStats;
  onOpenCreateGoalModal: () => void;
  onOpenEditGoalModal: (goal: PeakGoalEntity) => void;
  onSelectGoal: (goalId: string) => void;
  onToggleChecklistItem: (goalId: string, itemId: string) => void;
  onRequestDeleteGoal: (goal: PeakGoalEntity, strikeCount: number) => void;
  onGoToRituals: () => void;
  onGoToAISchedule: () => void;
}

export const GoalsHubView: React.FC<GoalsHubViewProps> = ({
  peakGoals,
  nowTick,
  todayStr,
  climbingSchedulePlan,
  getMountainStats,
  onOpenCreateGoalModal,
  onOpenEditGoalModal,
  onSelectGoal,
  onToggleChecklistItem,
  onRequestDeleteGoal,
  onGoToRituals,
  onGoToAISchedule,
}) => {
  const todayDow = useMemo(() => getDayOfWeekFromDateStr(todayStr), [todayStr]);
  const todayScheduleDay = useMemo(() => {
    if (!climbingSchedulePlan) return null;
    return climbingSchedulePlan.days.find((d) => d.dayOfWeek === todayDow) || null;
  }, [climbingSchedulePlan, todayDow]);

  const todayClimbSlotsByGoal = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!todayScheduleDay) return map;
    for (const slot of todayScheduleDay.slots) {
      if (slot.kind === 'CLIMB' && slot.goalId) {
        const list = map.get(slot.goalId) || [];
        list.push(`${slot.startTime}–${slot.endTime}`);
        map.set(slot.goalId, list);
      }
    }
    return map;
  }, [todayScheduleDay]);
  return (
    <section className="module-block">
      <div className="section-header-row">
        <div style={{ flex: '1 1 420px', minWidth: 0 }}>
          <span className="zen-tag-red">QUẢN LÝ TẬP TRUNG CÁC ĐỈNH NÚI (MULTI-GOAL TRACKER)</span>
          <h2 className="section-title">
            ⛰️ Danh Sách Các Ngọn Núi Đang Chinh Phục ({peakGoals.length} Đỉnh Núi)
          </h2>
          <TabPurposeBanner
            purpose="Nơi quản lý tất cả các mục tiêu lớn (Đỉnh Núi) của cuộc đời bạn. Bấm vào từng ngọn núi để lên Todo Công Phá, chạy Pomodoro và lưu ảnh bằng chứng."
            steps={[
              'Dựng Đỉnh Núi mục tiêu lớn',
              'Xem La Bàn Lịch AI hôm nay',
              'Bấm vào 1 Đỉnh Núi để bắt đầu Công Phá',
            ]}
          />
        </div>

        <button
          type="button"
          className="zen-btn zen-btn-seal btn-large-ceremony"
          onClick={onOpenCreateGoalModal}
        >
          <Plus size={18} />
          <span>+ Dựng Ngọn Núi Mới (Tạo Goal Mới)</span>
        </button>
      </div>

      {/* Today's AI Climbing Plan Compass */}
      {peakGoals.length > 0 && (
        <div className="zen-card today-compass-banner">
          {todayScheduleDay && todayScheduleDay.slots.length > 0 ? (
            <>
              <div className="today-compass-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Compass size={20} color="#f0c878" />
                  <strong style={{ fontSize: 16, color: '#F6F4EE' }}>
                    🧭 LỊCH TRÌNH LEO NÚI HÔM NAY ({WEEKDAY_LABELS[todayDow]} —{' '}
                    {climbingSchedulePlan?.shiftMode === 'NIGHT' ? '🌙 Ca Đêm' : '☀️ Ca Ngày'})
                  </strong>
                  <span className="zen-muted-text" style={{ fontSize: 12.5 }}>
                    Bấm thẳng vào khung giờ để lên Công Phá đúng ngọn núi hôm nay:
                  </span>
                </div>

                <button
                  type="button"
                  className="zen-btn zen-btn-outline"
                  style={{ padding: '6px 12px', fontSize: 12.5 }}
                  onClick={onGoToAISchedule}
                >
                  <Bot size={14} />
                  <span>Mở Bảng Lịch Trình AI &amp; Sửa Lịch</span>
                </button>
              </div>

              <div className="today-compass-chips">
                {todayScheduleDay.slots.map((slot) => {
                  const isNow = isSlotActiveNow(slot, nowTick);
                  const canJump = slot.kind === 'CLIMB' && Boolean(slot.goalId);
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      disabled={!canJump}
                      className={`today-compass-slot-pill kind-${slot.kind.toLowerCase()} ${
                        isNow ? 'is-now' : ''
                      }`}
                      onClick={() => {
                        if (canJump && slot.goalId) onSelectGoal(slot.goalId);
                      }}
                    >
                      <span className="tcs-time">
                        {slot.startTime}–{slot.endTime}
                      </span>
                      <span className="tcs-title">{slot.title}</span>
                      {isNow && <span className="tcs-now">ĐANG ĐẾN GIỜ</span>}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="today-compass-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Bot size={20} color="#7DBFA8" />
                <div>
                  <strong style={{ fontSize: 15, color: '#F6F4EE' }}>
                    Bạn đang có {peakGoals.length} Đỉnh Núi — Tránh tập trung lệch 1 núi mà bỏ quên núi khác!
                  </strong>
                  <p className="zen-muted-text" style={{ fontSize: 12.5, marginTop: 2 }}>
                    Hãy để AI đọc các Đỉnh Núi hiện có và sắp xếp sẵn lịch Ca Ngày (20h–24h) hoặc Ca Đêm (tự khóa 1h chuẩn bị đi làm) cho cả 7 ngày trong tuần.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="zen-btn zen-btn-seal"
                style={{ fontSize: 13 }}
                onClick={onGoToAISchedule}
              >
                <Bot size={15} />
                <span>🤖 Tạo Lịch Trình AI Ngay</span>
              </button>
            </div>
          )}
        </div>
      )}

      {peakGoals.length === 0 ? (
        <div className="zen-card" style={{ textAlign: 'center', padding: '48px 28px' }}>
          <Mountain size={52} color="#A8D8C6" style={{ margin: '0 auto 14px' }} />
          <h3 style={{ fontSize: 22, marginBottom: 8 }}>
            Hệ Thống Đã Sẵn Sàng — Chưa Có Ngọn Núi Nào Được Dựng
          </h3>
          <p className="zen-muted-text" style={{ maxWidth: 640, margin: '0 auto 22px', fontSize: 14.5 }}>
            Toàn bộ dữ liệu thử nghiệm đã được làm sạch để bạn bắt đầu hành trình thực sự của riêng
            mình. Hãy bấm nút bên dưới để dựng <strong>Ngọn Núi Đầu Tiên</strong> (mục tiêu lớn
            bạn quyết tâm chinh phục), sau đó click vào ngọn núi đó để lên danh sách Công Phá (Todo +
            Pomodoro) mỗi ngày!
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="zen-btn zen-btn-seal btn-large-ceremony"
              onClick={onOpenCreateGoalModal}
            >
              <Plus size={18} />
              <span>+ Dựng Ngọn Núi Đầu Tiên Của Bạn</span>
            </button>
            <button type="button" className="zen-btn zen-btn-outline" onClick={onGoToRituals}>
              <Flame size={16} />
              <span>Thiết Lập Nghi Thức (Thói Quen Đầu Ngày/Buổi)</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="mountains-hub-grid">
          {peakGoals.map((goal, idx) => {
            const stats = getMountainStats(goal.id);
            const daysClimbing = Math.max(
              1,
              Math.ceil((nowTick - (goal.createdAt || nowTick)) / 86400000)
            );
            const todaySlotTimes = todayClimbSlotsByGoal.get(goal.id) || [];

            return (
              <div
                key={goal.id}
                className={`zen-card mountain-hub-card ${
                  goal.isCompleted ? 'mountain-conquered' : ''
                } ${todaySlotTimes.length > 0 ? 'scheduled-today-card' : ''}`}
                onClick={() => onSelectGoal(goal.id)}
              >
                <div className="mountain-card-header">
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="zen-tag-red">NGỌN NÚI #{idx + 1}</span>
                      {todaySlotTimes.length > 0 && (
                        <span className="today-schedule-badge">
                          🎯 LỊCH HÔM NAY: {todaySlotTimes.join(', ')}
                        </span>
                      )}
                      {goal.category && <span className="time-window-pill">{goal.category}</span>}
                      <span className="pomo-pill">
                        Đã leo {daysClimbing} ngày
                        {goal.targetEndTime ? (
                          <>
                            {' '}
                            &bull; Hạn: {new Date(goal.targetEndTime).toLocaleDateString('vi-VN')} (còn{' '}
                            {Math.max(0, Math.ceil((goal.targetEndTime - nowTick) / 86400000))} ngày)
                          </>
                        ) : (
                          <> &bull; Dài hạn (không cố định ngày)</>
                        )}
                      </span>
                    </div>
                    <h3 className="mountain-card-title">⛰️ {goal.title}</h3>
                  </div>

                  {goal.isCompleted ? (
                    <WoodblockSealSvg
                      topText="ĐỈNH NÚI"
                      middleText="100%"
                      bottomText="ĐÃ CHINH PHỤC"
                      size={68}
                    />
                  ) : (
                    <div className="mountain-pct-circle">
                      <strong>{goal.progressPct}%</strong>
                      <small>Tiến độ</small>
                    </div>
                  )}
                </div>

                <p className="zen-muted-text" style={{ fontSize: 13.5 }}>
                  {goal.description}
                </p>

                {goal.futureSelfVow && (
                  <div className="mountain-vow-box">
                    <span>Lời thề với tương lai:</span> “{goal.futureSelfVow}”
                  </div>
                )}

                {/* Progress Bar & Checklist Preview */}
                <div className="peak-metric-box">
                  <div className="peak-metric-row">
                    <span>
                      Checklist Mục Tiêu:{' '}
                      <strong>
                        {goal.milestones && goal.milestones.length > 0
                          ? `${goal.milestones.filter((m) => m.isCompleted).length}/${
                              goal.milestones.length
                            } mục`
                          : 'Chưa thêm mục'}
                      </strong>
                    </span>
                    <strong style={{ color: '#A8D8C6' }}>{goal.progressPct}% / 100%</strong>
                  </div>
                  <div className="zen-progress-track">
                    <div className="zen-progress-fill" style={{ width: `${goal.progressPct}%` }} />
                  </div>

                  {goal.milestones && goal.milestones.length > 0 && (
                    <div className="mountain-milestones-preview">
                      {goal.milestones.map((m) => (
                        <div
                          key={m.id}
                          className={`ms-preview-item ${m.isCompleted ? 'done' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleChecklistItem(goal.id, m.id);
                          }}
                          title="Bấm để đánh dấu hoàn thành mục này"
                        >
                          {m.isCompleted ? (
                            <CheckCircle2 size={14} color="#66bb6a" />
                          ) : (
                            <Square size={14} color="#B8B4A9" />
                          )}
                          <span>{m.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Accumulated Effort Metrics */}
                <div className="mountain-stats-strip">
                  <div className="m-stat-pill">
                    <Swords size={14} color="#A8D8C6" />
                    <span>
                      Công phá: <strong>{stats.completedCount} hoàn thành</strong>
                      {stats.pendingCount > 0 ? ` (${stats.pendingCount} đang chờ)` : ''}
                    </span>
                  </div>
                  <div className="m-stat-pill">
                    <Clock size={14} color="#A8D8C6" />
                    <span>
                      Pomodoro: <strong>{stats.totalPomoHours} giờ</strong> ({stats.totalPomoMins}p)
                    </span>
                  </div>
                  <div className="m-stat-pill">
                    <Camera size={14} color="#A8D8C6" />
                    <span>
                      Ảnh PoW: <strong>{stats.proofPhotosCount} ảnh</strong>
                    </span>
                  </div>
                  <div className="m-stat-pill">
                    <FileText size={14} color="#A8D8C6" />
                    <span>
                      Tự vấn: <strong>{stats.journalsCount} bài</strong>
                    </span>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="mountain-card-footer">
                  <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="zen-btn zen-btn-ghost"
                      style={{ padding: '6px 10px', fontSize: 12 }}
                      onClick={() => onOpenEditGoalModal(goal)}
                    >
                      <Edit3 size={13} /> Sửa
                    </button>
                    <button
                      type="button"
                      className="zen-btn zen-btn-ghost"
                      style={{ padding: '6px 10px', fontSize: 12, color: '#ff8a80' }}
                      title="Xóa ngọn núi này (có xác nhận)"
                      onClick={() => onRequestDeleteGoal(goal, stats.totalStrikes)}
                    >
                      <Trash2 size={13} /> Xóa
                    </button>
                  </div>

                  <span className="enter-mountain-cta">
                    <span>
                      {goal.isCompleted
                        ? 'Xem Lại Lịch Sử Đỉnh Núi'
                        : 'Bấm Vào Để Thực Hiện Hôm Nay'}
                    </span>
                    <ChevronRight size={17} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
