import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Coffee,
  Flame,
  Gavel,
  Hourglass,
  Moon,
  Mountain,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Square,
  Sun,
  Swords,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from 'lucide-react';
import { MonkDatabaseSchema, MountainLawConfig, WorkShiftMode } from '../types/models';
import {
  LawFinding,
  MOUNTAIN_LAWS,
  VIOLATION_TYPE_LABELS,
  getRitualDayEvaluation,
  getShiftEndOfDayMs,
  isRestDay,
  shiftDateStr,
} from '../services/mountainLaws';
import { getPreWorkLockWindow } from '../services/aiSchedulePlanner';
import { DisciplineHeatmap } from './DisciplineHeatmap';
import { TabPurposeBanner } from '../components/TabPurposeBanner';

type LawsSubTab = 'RULES' | 'HEATMAP' | 'REST_DAYS' | 'SHIFT_RECORDS';

interface LawsViewProps {
  db: MonkDatabaseSchema;
  todayStr: string;
  nowTick: number;
  lawsActive: boolean;
  activeShiftMode: WorkShiftMode;
  dayShiftStartTime: string;
  nightShiftStartTime: string;
  timeLeftToday: { h: number; m: number; endMs: number; isNight: boolean; label: string; deadlineTitle: string };
  todayLawPreview: LawFinding[];
  lawConfig: MountainLawConfig;
  onAcceptLaws: () => void;
  onRunLawEvaluationTodayNow: () => void;
  onSwitchWorkShift: (mode: WorkShiftMode) => void;
  onUpdateShiftConfig: (updates: {
    mode?: WorkShiftMode;
    dayShiftStartTime?: string;
    nightShiftStartTime?: string;
    silent?: boolean;
  }) => void;
  onToggleLaw: (key: keyof MountainLawConfig) => void;
  onChangeRitualThresholdPct: (pct: number) => void;
  onToggleRitualItem: (groupId: string, itemId: string) => void;
  onGoToRitualsTab: () => void;
  onSelectGoal: (goalId: string) => void;
  onGoToAIScheduleTab: () => void;
  onRegisterRestDay: (dateStr: string, reason: string) => void;
  onCancelRestDay: (dateStr: string) => void;
  onChangeMaxMonthlyRestDays: (cap: number) => void;
}

export const LawsView: React.FC<LawsViewProps> = ({
  db,
  todayStr,
  nowTick,
  lawsActive,
  activeShiftMode,
  dayShiftStartTime,
  nightShiftStartTime,
  timeLeftToday,
  todayLawPreview,
  lawConfig,
  onAcceptLaws,
  onRunLawEvaluationTodayNow,
  onSwitchWorkShift,
  onUpdateShiftConfig,
  onToggleLaw,
  onChangeRitualThresholdPct,
  onToggleRitualItem,
  onGoToRitualsTab,
  onSelectGoal,
  onGoToAIScheduleTab,
  onRegisterRestDay,
  onCancelRestDay,
  onChangeMaxMonthlyRestDays,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<LawsSubTab>('RULES');
  const tomorrowStr = useMemo(() => shiftDateStr(todayStr, 1), [todayStr]);
  const [restDateDraft, setRestDateDraft] = useState<string>(tomorrowStr);
  const [restReasonDraft, setRestReasonDraft] = useState<string>('');
  const [expandedAuditCards, setExpandedAuditCards] = useState<Record<string, boolean>>({});
  const [expandedViolationDetails, setExpandedViolationDetails] = useState<Record<string, boolean>>({});

  const maxMonthlyRest = lawConfig.maxMonthlyRestDays ?? 2;
  const ritualThresholdPct = lawConfig.ritualPassThresholdPct ?? 70;
  const dayLockPreview = useMemo(() => getPreWorkLockWindow(dayShiftStartTime, 8 * 60), [dayShiftStartTime]);
  const nightLockPreview = useMemo(() => getPreWorkLockWindow(nightShiftStartTime, 19 * 60), [nightShiftStartTime]);
  const targetMonthPrefix = (restDateDraft || todayStr).slice(0, 7);
  const currentMonthPrefix = todayStr.slice(0, 7);

  const todayRitualSummary = useMemo(
    () => getRitualDayEvaluation(db, todayStr, lawConfig),
    [db, todayStr, lawConfig]
  );

  const restDaysList = useMemo(() => {
    return [...(db.session.restDays || [])].sort((a, b) => b.date.localeCompare(a.date));
  }, [db.session.restDays]);

  const usedThisMonth = useMemo(() => {
    return restDaysList.filter((r) => r.date.startsWith(currentMonthPrefix)).length;
  }, [restDaysList, currentMonthPrefix]);

  const usedInTargetMonth = useMemo(() => {
    return restDaysList.filter((r) => r.date.startsWith(targetMonthPrefix)).length;
  }, [restDaysList, targetMonthPrefix]);

  const enabledLawsCount = useMemo(() => {
    return MOUNTAIN_LAWS.filter((l) => Boolean(lawConfig[l.configKey])).length;
  }, [lawConfig]);

  const isTodayRestRegistered = isRestDay(db, todayStr, lawConfig);
  const todayCutoffMs = getShiftEndOfDayMs(todayStr, activeShiftMode, nightShiftStartTime);
  const canRegisterToday = nowTick < todayCutoffMs && !isTodayRestRegistered;

  return (
    <section className="module-block">
      <div className="zen-card">
        <div className="section-header-row" style={{ marginBottom: 16 }}>
          <div style={{ flex: '1 1 380px', minWidth: 0 }}>
            <span className="zen-tag-red">BỘ LUẬT NÚI — QUY TẮC & XÉT DUYỆT KỶ LUẬT TỰ ĐỘNG</span>
            <h2 className="section-title" style={{ marginTop: 6 }}>
              ⚖️ Bộ Luật Núi — Kỷ Luật & Chốt Sổ
            </h2>
            <TabPurposeBanner
              purpose={`Quản lý kỷ luật tự động, xem lỗi chưa xong hôm nay trước giờ chốt (${timeLeftToday.deadlineTitle}), đăng ký ngày nghỉ phép và cài đặt ca ngày / ca đêm.`}
              steps={[
                'Xem mục chưa hoàn thành hôm nay',
                'Xin thẻ nghỉ phép nếu bận đột xuất',
                'Đổi ca & giờ vào làm khi lịch tuần đổi',
              ]}
            />
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              alignItems: 'flex-end',
              flexWrap: 'wrap',
            }}
          >
            {lawsActive ? (
              <span className="status-pill-tag done" style={{ padding: '7px 14px', fontSize: 12.5 }}>
                ✓ Đã đọc & ký cam kết tuân thủ Luật Núi
              </span>
            ) : (
              <button type="button" className="zen-btn zen-btn-seal" onClick={onAcceptLaws}>
                <ShieldCheck size={16} />
                <span>Tôi Đã Đọc Hiểu & Cam Kết Tuân Thủ Luật Núi</span>
              </button>
            )}
            <button
              type="button"
              className="zen-btn zen-btn-outline"
              style={{ fontSize: 12.5 }}
              onClick={onRunLawEvaluationTodayNow}
              title="Chốt sổ và chạy bộ máy xét duyệt Luật Núi ngay cho ngày hôm nay"
            >
              <Gavel size={14} />
              <span>Chốt Sổ & Xét Duyệt Ngày Hôm Nay Ngay ({todayStr})</span>
            </button>
          </div>
        </div>

        {/* SUB-TABS NAVIGATION BAR */}
        <div className="laws-subtabs-bar" role="tablist" aria-label="Phân mục Bộ Luật Núi">
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'RULES'}
            className={`laws-subtab-btn ${activeSubTab === 'RULES' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('RULES')}
          >
            <div className="laws-subtab-top">
              <Scale size={16} />
              <span className="laws-subtab-name">Luật & Hôm Nay</span>
            </div>
            <span
              className={`laws-subtab-pill ${
                isTodayRestRegistered
                  ? 'pill-gold'
                  : todayLawPreview.length === 0
                  ? 'pill-ok'
                  : 'pill-warn'
              }`}
            >
              {isTodayRestRegistered
                ? '🎋 Nghỉ có phép'
                : todayLawPreview.length === 0
                ? `✓ Đạt chuẩn • ${enabledLawsCount}/4 luật`
                : `⏳ Còn ${todayLawPreview.length} mục`}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'HEATMAP'}
            className={`laws-subtab-btn ${activeSubTab === 'HEATMAP' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('HEATMAP')}
          >
            <div className="laws-subtab-top">
              <Flame size={16} />
              <span className="laws-subtab-name">Bản Đồ Nhiệt Kỷ Luật</span>
            </div>
            <span className="laws-subtab-pill pill-ok">
              Streak {db.session.currentStreak} ngày
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'REST_DAYS'}
            className={`laws-subtab-btn ${activeSubTab === 'REST_DAYS' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('REST_DAYS')}
          >
            <div className="laws-subtab-top">
              <Coffee size={16} />
              <span className="laws-subtab-name">Thẻ Ngày Nghỉ Phép</span>
            </div>
            <span className="laws-subtab-pill pill-gold">
              {usedThisMonth}/{maxMonthlyRest} thẻ tháng {currentMonthPrefix.slice(5)}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'SHIFT_RECORDS'}
            className={`laws-subtab-btn ${activeSubTab === 'SHIFT_RECORDS' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('SHIFT_RECORDS')}
          >
            <div className="laws-subtab-top">
              <Clock size={16} />
              <span className="laws-subtab-name">Ca Làm & Sổ Án</span>
            </div>
            <span
              className={`laws-subtab-pill ${
                db.violations.length > 0 ? 'pill-danger' : 'pill-neutral'
              }`}
            >
              {activeShiftMode === 'NIGHT' ? '🌙 Ca Đêm' : '☀️ Ca Ngày'} • {db.violations.length}{' '}
              vi phạm
            </span>
          </button>
        </div>

        {/* ACTIVE TAB PANEL */}
        <div key={activeSubTab} className="laws-tabpanel page-fade-in" role="tabpanel">
          {activeSubTab === 'RULES' && (
            <>
              {/* LIVE AUDIT BOX FOR TODAY */}
              <div
                className={`law-live-audit-box ${
                  todayLawPreview.length > 0 ? 'has-pending' : 'all-clear'
                }`}
              >
                <div className="law-audit-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {todayLawPreview.length > 0 ? (
                      <Hourglass size={20} color="#f0c878" />
                    ) : (
                      <ShieldCheck size={20} color="#7DBFA8" />
                    )}
                    <div>
                      <strong style={{ fontSize: 15.5, color: '#F6F4EE' }}>
                        Kiểm Tra Trạng Thái Tuân Thủ Luật Hôm Nay ({todayStr})
                      </strong>
                      <div style={{ fontSize: 12.5, color: '#B8B4A9', marginTop: 2 }}>
                        {isTodayRestRegistered ? (
                          <strong style={{ color: '#f0c878' }}>
                            🎋 Hôm nay là Ngày Nghỉ Có Phép — Miễn toàn bộ 4 điều luật & giữ nguyên
                            Streak.
                          </strong>
                        ) : (
                          <>
                            Thời gian còn lại trước khi hệ thống tự động chốt sổ (
                            {timeLeftToday.deadlineTitle}):{' '}
                            <strong style={{ color: '#A8D8C6' }}>{timeLeftToday.label}</strong>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span
                      className={`status-pill-tag ${
                        todayLawPreview.length === 0 ? 'done' : 'pending'
                      }`}
                    >
                      {isTodayRestRegistered
                        ? '🎋 NGÀY NGHỈ CÓ PHÉP'
                        : todayLawPreview.length === 0
                        ? '✓ ĐẠT CHUẨN KỶ LUẬT HÔM NAY (0 LỖI)'
                        : `CÒN ${todayLawPreview.length} NGHĨA VỤ CẦN HOÀN TẤT`}
                    </span>
                    {canRegisterToday && todayLawPreview.length > 0 && (
                      <button
                        type="button"
                        className="zen-btn zen-btn-ghost"
                        style={{ padding: '4px 10px', fontSize: 12, color: '#f0c878' }}
                        onClick={() => {
                          setRestDateDraft(todayStr);
                          setActiveSubTab('REST_DAYS');
                        }}
                      >
                        <Coffee size={13} /> Xin nghỉ phép hôm nay <ArrowRight size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {!isTodayRestRegistered && todayLawPreview.length > 0 ? (
                  <div className="law-audit-pending-list">
                    <div className="law-audit-summary-alert">
                      <span>
                        ⚠️ Nếu kết thúc ngày ngay lúc này, hệ thống sẽ tính{' '}
                        <strong style={{ color: '#ffab91' }}>+{todayLawPreview.length} lần vi phạm</strong>{' '}
                        cho các nghĩa vụ chưa đạt chuẩn dưới đây:
                      </span>
                    </div>

                    {todayLawPreview.map((item, idx) => {
                      const cardKey = `${item.lawId}-${item.goalId || idx}`;
                      const isExpanded = expandedAuditCards[cardKey] ?? true;

                      if (item.lawId === 'LAW_RITUAL' && item.ritualProgress) {
                        const rp = item.ritualProgress;
                        return (
                          <div key={cardKey} className="law-audit-card is-ritual">
                            <div className="law-audit-card-top">
                              <div className="law-audit-card-title-row">
                                <span className="zen-tag-red">LUẬT 2 • NGHI THỨC (≥{rp.thresholdPct}%)</span>
                                <strong style={{ color: '#F6F4EE', fontSize: 14.5 }}>
                                  Đã hoàn thành {rp.completedCount}/{rp.totalCount} bước ({rp.completedPct}%)
                                </strong>
                                <span className="audit-need-more-badge">
                                  Cần tích thêm <strong>+{rp.needMoreCount} bước</strong> để đạt{' '}
                                  {rp.requiredCount}/{rp.totalCount} (≥{rp.thresholdPct}%)
                                </span>
                              </div>

                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  className="zen-btn zen-btn-outline"
                                  style={{ padding: '4px 10px', fontSize: 12 }}
                                  onClick={onGoToRitualsTab}
                                >
                                  <Flame size={13} /> Mở Bảng Nghi Thức <ArrowRight size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="zen-btn zen-btn-ghost"
                                  style={{ padding: '4px 8px', fontSize: 12 }}
                                  onClick={() =>
                                    setExpandedAuditCards((prev) => ({
                                      ...prev,
                                      [cardKey]: !isExpanded,
                                    }))
                                  }
                                >
                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  <span>{isExpanded ? 'Thu gọn' : 'Mở danh sách'}</span>
                                </button>
                              </div>
                            </div>

                            {/* Visual Progress Bar with Threshold Marker */}
                            <div className="ritual-threshold-bar-wrap">
                              <div className="ritual-threshold-track">
                                <div
                                  className="ritual-threshold-fill"
                                  style={{ width: `${Math.min(100, rp.completedPct)}%` }}
                                />
                                <div
                                  className="ritual-threshold-marker"
                                  style={{ left: `${rp.thresholdPct}%` }}
                                  title={`Ngưỡng đạt Luật 2: ${rp.thresholdPct}% (${rp.requiredCount}/${rp.totalCount} bước)`}
                                >
                                  <span>Chuẩn {rp.thresholdPct}%</span>
                                </div>
                              </div>
                            </div>

                            {isExpanded && rp.groupedMissing.length > 0 && (
                              <div className="audit-ritual-groups-grid">
                                {rp.groupedMissing.map((grp) => (
                                  <div key={grp.groupId} className="audit-ritual-group-box">
                                    <div className="audit-ritual-group-head">
                                      <strong>{grp.groupTitle}</strong>
                                      <span className="audit-group-count-pill">
                                        {grp.completedInGroup}/{grp.totalInGroup} xong • còn {grp.missingItems.length}
                                      </span>
                                    </div>
                                    <div className="audit-ritual-items-list">
                                      {grp.missingItems.map((ritualIt) => (
                                        <button
                                          key={ritualIt.itemId}
                                          type="button"
                                          className="audit-ritual-quick-item"
                                          onClick={() => onToggleRitualItem(grp.groupId, ritualIt.itemId)}
                                          title="Bấm để tích hoàn thành ngay bước này"
                                        >
                                          <Square size={14} color="#f0c878" style={{ flexShrink: 0 }} />
                                          <span>{ritualIt.title}</span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }

                      if (item.lawId === 'LAW_EMPTY_DAY' && item.emptyDayGoals) {
                        return (
                          <div key={cardKey} className="law-audit-card is-empty-day">
                            <div className="law-audit-card-top">
                              <div className="law-audit-card-title-row">
                                <span className="zen-tag-red">LUẬT 3 • KHÔNG NGÀY TRỐNG</span>
                                <strong style={{ color: '#F6F4EE', fontSize: 14.5 }}>
                                  {item.reason}
                                </strong>
                              </div>

                              <button
                                type="button"
                                className="zen-btn zen-btn-seal"
                                style={{ padding: '5px 12px', fontSize: 12 }}
                                onClick={onGoToAIScheduleTab}
                              >
                                <Bot size={13} /> Xem Lịch AI &amp; Lên Công Phá Hôm Nay <ArrowRight size={12} />
                              </button>
                            </div>

                            <div className="audit-mountains-grid">
                              {item.emptyDayGoals.map((mg) => (
                                <button
                                  key={mg.id}
                                  type="button"
                                  className="audit-mountain-card-btn"
                                  onClick={() => onSelectGoal(mg.id)}
                                >
                                  <div className="audit-mcb-left">
                                    <Mountain size={15} color="#7DBFA8" style={{ flexShrink: 0 }} />
                                    <div>
                                      <div className="audit-mcb-title">{mg.title}</div>
                                      <div className="audit-mcb-meta">
                                        {mg.category || 'Đỉnh núi'} • Tiến độ {mg.progressPct}%
                                      </div>
                                    </div>
                                  </div>
                                  <span className="audit-mcb-cta">Lên Công Phá →</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      }

                      if (item.lawId === 'LAW_STRIKE' && item.unfinishedStrikes) {
                        return (
                          <div key={cardKey} className="law-audit-card is-strike">
                            <div className="law-audit-card-top">
                              <div className="law-audit-card-title-row">
                                <span className="zen-tag-red">LUẬT 1 • CÔNG PHÁ DANG DỞ</span>
                                <strong style={{ color: '#F6F4EE', fontSize: 14.5 }}>
                                  {item.reason}
                                </strong>
                              </div>
                              {item.goalId && (
                                <button
                                  type="button"
                                  className="zen-btn zen-btn-outline"
                                  style={{ padding: '4px 10px', fontSize: 12 }}
                                  onClick={() => onSelectGoal(item.goalId!)}
                                >
                                  <Swords size={13} /> Vào Ngọn Núi <ArrowRight size={12} />
                                </button>
                              )}
                            </div>

                            <div className="audit-strikes-grid">
                              {item.unfinishedStrikes.map((st) => (
                                <button
                                  key={st.id}
                                  type="button"
                                  className="audit-strike-chip"
                                  onClick={() => onSelectGoal(st.goalId)}
                                >
                                  <Swords size={13} color="#f0c878" style={{ flexShrink: 0 }} />
                                  <span className="audit-strike-name">{st.title}</span>
                                  <span className="pomo-pill">
                                    {st.completedPomo}/{st.requiredPomo}p
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={cardKey} className="law-audit-card">
                          <div className="law-audit-card-top">
                            <div className="law-audit-card-title-row">
                              <span className="zen-tag-red">{VIOLATION_TYPE_LABELS[item.type]}</span>
                              <strong style={{ color: '#F6F4EE', fontSize: 14 }}>{item.reason}</strong>
                            </div>
                          </div>
                          {item.details.length > 0 && (
                            <div className="violation-details-chips-grid" style={{ marginTop: 8 }}>
                              {item.details.map((d, di) => (
                                <span key={di} className="violation-detail-chip">
                                  {d}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Bonus banner when Ritual threshold IS already met while other laws remain */}
                    {!todayLawPreview.some((f) => f.lawId === 'LAW_RITUAL') &&
                      lawConfig.ritualLawEnabled &&
                      todayRitualSummary.totalCount > 0 && (
                        <div className="audit-ritual-passed-mini-banner">
                          <CheckCircle2 size={15} color="#81c784" />
                          <span>
                            <strong>Luật 2 (Nghi Thức):</strong> Đã đạt chuẩn khoa học{' '}
                            <strong>
                              {todayRitualSummary.completedCount}/{todayRitualSummary.totalCount} bước (
                              {todayRitualSummary.completedPct}% ≥ {todayRitualSummary.thresholdPct}%)
                            </strong>{' '}
                            — Không bị phạt Luật 2!
                          </span>
                        </div>
                      )}
                  </div>
                ) : (
                  <div style={{ marginTop: 10 }}>
                    <p style={{ fontSize: 13.5, color: '#cfe7dd', margin: 0 }}>
                      {isTodayRestRegistered
                        ? 'Bạn đã đăng ký nghỉ có phép hợp lệ cho ngày hôm nay. Hãy nghỉ ngơi thật tốt để quay lại mạnh mẽ hơn vào ngày mai!'
                        : 'Tuyệt vời! Tính đến thời điểm hiện tại, bạn đã đạt chuẩn toàn bộ Bộ Luật Núi. Hãy duy trì trạng thái này đến hết ngày để cộng thêm +1 ngày vào chuỗi Streak kỷ luật!'}
                    </p>
                    {!isTodayRestRegistered &&
                      lawConfig.ritualLawEnabled &&
                      todayRitualSummary.totalCount > 0 && (
                        <div className="audit-ritual-passed-mini-banner" style={{ marginTop: 10 }}>
                          <CheckCircle2 size={15} color="#81c784" />
                          <span>
                            Nghi Thức hôm nay:{' '}
                            <strong>
                              {todayRitualSummary.completedCount}/{todayRitualSummary.totalCount} bước (
                              {todayRitualSummary.completedPct}% — Chuẩn ≥{todayRitualSummary.thresholdPct}%)
                            </strong>
                            {todayRitualSummary.completedPct < 100 &&
                              ` • Còn ${
                                todayRitualSummary.totalCount - todayRitualSummary.completedCount
                              } bước phụ bạn có thể tích thêm nếu muốn đạt 100%.`}
                          </span>
                        </div>
                      )}
                  </div>
                )}
              </div>

              {/* 4 MOUNTAIN LAWS CARDS */}
              <div className="mountain-laws-grid">
                {MOUNTAIN_LAWS.map((law) => {
                  const isEnabled = Boolean(lawConfig[law.configKey]);
                  return (
                    <div
                      key={law.id}
                      className={`mountain-law-card ${isEnabled ? 'enabled' : 'disabled'}`}
                    >
                      <div className="law-card-top">
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="zen-tag-red">ĐIỀU LUẬT #{law.number}</span>
                            <span className="time-window-pill">
                              {law.isCore ? 'Luật Cốt Lõi' : 'Luật Bổ Trợ (Tùy chọn)'}
                            </span>
                          </div>
                          <h3 style={{ fontSize: 18, marginTop: 8, color: '#F6F4EE' }}>
                            {law.title}
                          </h3>
                        </div>

                        <button
                          type="button"
                          className={`pow-toggle-switch ${isEnabled ? 'on' : 'off'}`}
                          onClick={() => onToggleLaw(law.configKey)}
                          title="Bật hoặc tắt điều luật này"
                        >
                          {isEnabled ? (
                            <>
                              <ToggleRight size={22} color="#66bb6a" />
                              <span>ĐANG ÁP DỤNG</span>
                            </>
                          ) : (
                            <>
                              <ToggleLeft size={22} color="#B8B4A9" />
                              <span>ĐANG TẮT</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="law-rule-box">
                        <div>
                          <strong style={{ color: '#A8D8C6' }}>Quy định: </strong>
                          <span>{law.rule}</span>
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <strong style={{ color: '#ff8a80' }}>Chế tài tự động: </strong>
                          <span>{law.penalty} (Đưa chuỗi Streak kỷ luật về 0).</span>
                        </div>

                        {law.id === 'LAW_RITUAL' && (
                          <div className="law-ritual-threshold-control">
                            <div>
                              <strong style={{ color: '#f0c878', fontSize: 12.5 }}>
                                🎯 Ngưỡng đạt chuẩn Nghi Thức mỗi ngày:
                              </strong>
                              <div style={{ fontSize: 11.5, color: '#b8b4a9', marginTop: 2 }}>
                                Đạt tối thiểu {ritualThresholdPct}% ({todayRitualSummary.requiredCount}/
                                {todayRitualSummary.totalCount || '—'} bước hôm nay)
                              </div>
                            </div>
                            <select
                              className="zen-input"
                              style={{ padding: '5px 10px', fontSize: 12.5 }}
                              value={ritualThresholdPct}
                              onChange={(e) => onChangeRitualThresholdPct(Number(e.target.value))}
                            >
                              <option value={70}>≥ 70% (&gt;69% — Chuẩn Khoa Học UCL, khuyên dùng)</option>
                              <option value={75}>≥ 75% (Kỷ luật khá cao)</option>
                              <option value={80}>≥ 80% (Kỷ luật nghiêm khắc)</option>
                              <option value={85}>≥ 85% (Gần như hoàn hảo)</option>
                              <option value={100}>100% (Tuyệt đối không sót bước nào)</option>
                            </select>
                          </div>
                        )}
                      </div>

                      <ul className="law-notes-list">
                        {law.notes.map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {activeSubTab === 'HEATMAP' && (
            <DisciplineHeatmap db={db} todayStr={todayStr} />
          )}

          {activeSubTab === 'REST_DAYS' && (
            <div className="rest-day-card" style={{ marginBottom: 0 }}>
              <div className="rest-day-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Coffee size={22} color="#f0c878" />
                  <div>
                    <h3 style={{ margin: 0, fontSize: 17, color: '#F6F4EE' }}>
                      🎋 Thẻ Ngày Nghỉ Có Phép (Bảo Toàn Streak Khi Cần Phục Hồi)
                    </h3>
                    <p className="zen-muted-text" style={{ fontSize: 12.5, marginTop: 3 }}>
                      Kỷ luật bền vững không có nghĩa là vắt kiệt sức. Bạn có hạn ngạch nghỉ có phép
                      mỗi tháng — <strong>bắt buộc phải đăng ký trước giờ chốt sổ</strong> (không
                      được xin bù cho ngày đã qua). Ngày nghỉ hợp lệ được miễn toàn bộ 4 Luật và
                      giữ nguyên chuỗi Streak.
                    </p>
                  </div>
                </div>

                <div className="rest-day-quota-box">
                  <span className="rest-quota-pill">
                    Tháng {currentMonthPrefix}:{' '}
                    <strong>
                      {usedThisMonth}/{maxMonthlyRest} thẻ đã dùng
                    </strong>
                  </span>
                  <label
                    style={{
                      fontSize: 12,
                      color: '#B8B4A9',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    Hạn ngạch/tháng:
                    <select
                      className="zen-input"
                      style={{ padding: '4px 8px', fontSize: 12 }}
                      value={maxMonthlyRest}
                      onChange={(e) => onChangeMaxMonthlyRestDays(Number(e.target.value))}
                    >
                      <option value={0}>0 thẻ (Khắt khe 100%)</option>
                      <option value={1}>1 thẻ / tháng</option>
                      <option value={2}>2 thẻ / tháng (Khuyên dùng)</option>
                      <option value={3}>3 thẻ / tháng</option>
                    </select>
                  </label>
                </div>
              </div>

              {/* Registration form */}
              <form
                className="rest-day-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!restDateDraft || restDateDraft < todayStr) return;
                  onRegisterRestDay(
                    restDateDraft,
                    restReasonDraft.trim() || 'Ngày nghỉ phục hồi năng lượng'
                  );
                  setRestReasonDraft('');
                }}
              >
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    className={`ritual-day-pill ${restDateDraft === todayStr ? 'active' : ''}`}
                    disabled={!canRegisterToday}
                    onClick={() => setRestDateDraft(todayStr)}
                    title={
                      isTodayRestRegistered
                        ? 'Hôm nay đã đăng ký nghỉ có phép'
                        : canRegisterToday
                        ? `Đăng ký nghỉ hôm nay (trước ${timeLeftToday.deadlineTitle})`
                        : 'Đã quá giờ chốt hôm nay'
                    }
                  >
                    <Calendar size={12} /> Hôm nay ({todayStr})
                  </button>
                  <button
                    type="button"
                    className={`ritual-day-pill ${restDateDraft === tomorrowStr ? 'active' : ''}`}
                    onClick={() => setRestDateDraft(tomorrowStr)}
                  >
                    <Calendar size={12} /> Ngày mai ({tomorrowStr})
                  </button>
                  <input
                    type="date"
                    className="zen-input"
                    style={{ padding: '6px 10px', fontSize: 13 }}
                    min={todayStr}
                    value={restDateDraft}
                    onChange={(e) => setRestDateDraft(e.target.value)}
                    required
                  />
                </div>

                <input
                  type="text"
                  className="zen-input"
                  style={{ flex: 1, minWidth: 220 }}
                  placeholder="Lý do xin nghỉ có phép (VD: Ốm mệt, Về quê thăm gia đình, Phục hồi sức khỏe...)"
                  value={restReasonDraft}
                  onChange={(e) => setRestReasonDraft(e.target.value)}
                />

                <button
                  type="submit"
                  className="zen-btn zen-btn-seal"
                  disabled={
                    maxMonthlyRest === 0 ||
                    usedInTargetMonth >= maxMonthlyRest ||
                    !restDateDraft ||
                    restDateDraft < todayStr ||
                    isRestDay(db, restDateDraft, lawConfig)
                  }
                >
                  <Check size={15} />
                  <span>
                    {isRestDay(db, restDateDraft, lawConfig)
                      ? 'Ngày này đã đăng ký'
                      : usedInTargetMonth >= maxMonthlyRest
                      ? `Hết thẻ tháng ${targetMonthPrefix}`
                      : 'Đăng Ký Thẻ Nghỉ Phép'}
                  </span>
                </button>
              </form>

              {restDaysList.length > 0 ? (
                <div className="rest-days-history-strip">
                  {restDaysList.map((r) => {
                    const dayEnd = getShiftEndOfDayMs(r.date, activeShiftMode, nightShiftStartTime);
                    const canCancel = nowTick < dayEnd;
                    return (
                      <div key={r.date} className="rest-day-chip">
                        <div>
                          <strong>🗓️ {r.date}</strong>
                          <span> — {r.reason}</span>
                        </div>
                        {canCancel && (
                          <button
                            type="button"
                            className="zen-btn zen-btn-ghost"
                            style={{ padding: '2px 6px', fontSize: 11.5, color: '#ff8a80' }}
                            onClick={() => onCancelRestDay(r.date)}
                            title="Hủy thẻ nghỉ trước giờ chốt để hoàn lại hạn ngạch tháng"
                          >
                            <Trash2 size={12} /> Hủy thẻ
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="zen-muted-text" style={{ fontSize: 12.5, marginTop: 12 }}>
                  Chưa có ngày nghỉ phép nào được đăng ký. Bạn có thể chọn ngày ở trên để xin nghỉ
                  hợp lệ trước giờ chốt sổ.
                </p>
              )}
            </div>
          )}

          {activeSubTab === 'SHIFT_RECORDS' && (
            <>
              {/* SHIFT WORK CONFIGURATION CARD */}
              <div className="shift-work-selector-card">
                <div className="shift-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Clock size={20} color="#5BAE93" />
                    <div>
                      <strong style={{ fontSize: 16, color: '#F6F4EE' }}>
                        Chế Độ Ca Làm Việc & Giờ Chốt Sổ Luật Núi
                      </strong>
                      <div style={{ fontSize: 12.5, color: '#B8B4A9' }}>
                        Chỉnh linh hoạt giờ vào ca Ngày (7h, 8h...) hoặc ca Đêm (19h, 20h...) để
                        hệ thống tự điều chỉnh hạn chốt Luật Núi và khung khóa cứng 1 tiếng chuẩn bị.
                      </div>
                    </div>
                  </div>
                  <span
                    className={`status-pill-tag ${
                      activeShiftMode === 'NIGHT' ? 'shift-night' : 'shift-day'
                    }`}
                  >
                    {activeShiftMode === 'NIGHT'
                      ? `🌙 ĐANG BẬT: CA ĐÊM (VÀO CA ${nightShiftStartTime} • KHÓA 1H: ${nightLockPreview.prepStartStr}–${nightLockPreview.workStartStr})`
                      : `☀️ ĐANG BẬT: CA NGÀY (VÀO CA ${dayShiftStartTime} • KHÓA 1H: ${dayLockPreview.prepStartStr}–${dayLockPreview.workStartStr})`}
                  </span>
                </div>

                <div className="shift-options-grid">
                  <div
                    className={`shift-option-box ${activeShiftMode === 'DAY' ? 'active' : ''}`}
                    onClick={() => onUpdateShiftConfig({ mode: 'DAY' })}
                  >
                    <div className="shift-box-top">
                      <Sun size={24} color="#ffb74d" />
                      <span className="shift-box-title">
                        ☀️ Ca Ngày (Vào làm {dayShiftStartTime} – Chốt 23:59)
                      </span>
                    </div>
                    <p className="shift-box-desc">
                      Dành cho tuần đi làm ca ngày. Khóa cứng 1 tiếng trước khi đi làm, thời gian
                      trống buổi tối dùng để leo núi và hạn chót xét Luật Núi là{' '}
                      <strong>23:59 cùng ngày</strong>.
                    </p>
                    <div
                      className="shift-time-config-grid"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <label className="zen-label" style={{ marginBottom: 4 }}>
                        Giờ vào ca Ngày linh hoạt:
                      </label>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          type="time"
                          className="zen-input"
                          style={{ padding: '4px 8px', fontSize: 12.5 }}
                          value={dayShiftStartTime}
                          onChange={(e) =>
                            onUpdateShiftConfig({ dayShiftStartTime: e.target.value, silent: true })
                          }
                        />
                        {['07:00', '07:30', '08:00', '08:30', '09:00'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            className={`pomo-preset-btn ${dayShiftStartTime === preset ? 'active' : ''}`}
                            onClick={() =>
                              onUpdateShiftConfig({ dayShiftStartTime: preset, silent: true })
                            }
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                      <div className="shift-lock-preview-pill">
                        🔒 Khóa cứng 1h trước làm: {dayLockPreview.prepStartStr} –{' '}
                        {dayLockPreview.workStartStr}
                      </div>
                    </div>
                    <div className="shift-box-status">
                      {activeShiftMode === 'DAY' ? '✓ Đang áp dụng' : 'Bấm để kích hoạt'}
                    </div>
                  </div>

                  <div
                    className={`shift-option-box ${activeShiftMode === 'NIGHT' ? 'active' : ''}`}
                    onClick={() => onUpdateShiftConfig({ mode: 'NIGHT' })}
                  >
                    <div className="shift-box-top">
                      <Moon size={24} color="#f0c878" />
                      <span className="shift-box-title">
                        🌙 Ca Đêm (Vào làm {nightShiftStartTime} – Chốt {nightShiftStartTime} hôm sau)
                      </span>
                    </div>
                    <p className="shift-box-desc">
                      Dành cho tuần đi làm ca đêm. Ca làm bắt đầu từ <strong>{nightShiftStartTime}</strong>{' '}
                      kéo dài xuyên đêm. Hạn chót hoàn thành Todo là{' '}
                      <strong>{nightShiftStartTime} tối hôm sau</strong> (không bị phạt nhầm lúc 00:00).
                    </p>
                    <div
                      className="shift-time-config-grid"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <label className="zen-label" style={{ marginBottom: 4 }}>
                        Giờ vào ca Đêm linh hoạt:
                      </label>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          type="time"
                          className="zen-input"
                          style={{ padding: '4px 8px', fontSize: 12.5 }}
                          value={nightShiftStartTime}
                          onChange={(e) =>
                            onUpdateShiftConfig({ nightShiftStartTime: e.target.value, silent: true })
                          }
                        />
                        {['18:00', '19:00', '20:00', '21:00', '22:00'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            className={`pomo-preset-btn ${nightShiftStartTime === preset ? 'active' : ''}`}
                            onClick={() =>
                              onUpdateShiftConfig({ nightShiftStartTime: preset, silent: true })
                            }
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                      <div className="shift-lock-preview-pill">
                        🔒 Khóa cứng 1h trước làm: {nightLockPreview.prepStartStr} –{' '}
                        {nightLockPreview.workStartStr}
                      </div>
                    </div>
                    <div className="shift-box-status">
                      {activeShiftMode === 'NIGHT' ? '✓ Đang áp dụng' : 'Bấm để kích hoạt'}
                    </div>
                  </div>
                </div>
              </div>

              {/* VIOLATION LEDGER (SỔ ÁN KỶ LUẬT) */}
              <div className="law-violations-history-card">
                <div className="shift-card-header" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ShieldAlert
                      size={20}
                      color={db.violations.length > 0 ? '#ff8a80' : '#7DBFA8'}
                    />
                    <div>
                      <strong style={{ fontSize: 16, color: '#F6F4EE' }}>
                        📋 Sổ Án Kỷ Luật — Lịch Sử Vi Phạm ({db.violations.length} bản ghi)
                      </strong>
                      <div style={{ fontSize: 12.5, color: '#B8B4A9' }}>
                        Lưu vĩnh viễn các ngày chưa hoàn thành nghĩa vụ Luật Núi (có thể dọn dẹp
                        riêng mục này trong tab Cài Đặt nếu cần reset test).
                      </div>
                    </div>
                  </div>
                </div>

                <div className="violations-log-list" style={{ maxHeight: 360, overflowY: 'auto' }}>
                  {db.violations.length === 0 ? (
                    <div
                      style={{
                        padding: 20,
                        textAlign: 'center',
                        color: '#A8D8C6',
                        background: 'rgba(62, 138, 114, 0.1)',
                        borderRadius: 4,
                        border: '1px dashed rgba(91, 174, 147, 0.35)',
                        fontSize: 13.5,
                      }}
                    >
                      ✅ Sổ án hoàn toàn thanh sạch! Hãy tiếp tục duy trì kỷ luật mỗi ngày.
                    </div>
                  ) : (
                    db.violations.map((v, idx) => (
                      <div key={v.id} className="violation-log-item-severe">
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              alignItems: 'center',
                              flexWrap: 'wrap',
                            }}
                          >
                            <span className="violation-scar-tag">
                              VI PHẠM #{db.violations.length - idx}
                            </span>
                            <span className="violation-scar-tag" style={{ background: '#8e2424' }}>
                              {VIOLATION_TYPE_LABELS[v.type] || 'Vi phạm Luật Núi'}
                            </span>
                            <strong style={{ color: '#ff8a80' }}>Ngày {v.date}</strong>
                            {v.goalTitle && (
                              <span style={{ fontSize: 12, color: '#ffcdd2' }}>
                                &bull; Đỉnh núi: {v.goalTitle}
                              </span>
                            )}
                          </div>
                          <p style={{ color: '#F6F4EE', marginTop: 5, fontSize: 13.5 }}>
                            {v.reason}
                          </p>
                          {v.details && v.details.length > 0 && (() => {
                            const showAll = expandedViolationDetails[v.id] || v.details.length <= 5;
                            const visibleItems = showAll ? v.details : v.details.slice(0, 5);
                            return (
                              <div style={{ marginTop: 8 }}>
                                <div className="violation-details-chips-grid">
                                  {visibleItems.map((det, di) => (
                                    <span key={di} className="violation-detail-chip">
                                      {det}
                                    </span>
                                  ))}
                                </div>
                                {v.details.length > 5 && (
                                  <button
                                    type="button"
                                    className="link-mini-btn"
                                    style={{ marginTop: 6 }}
                                    onClick={() =>
                                      setExpandedViolationDetails((prev) => ({
                                        ...prev,
                                        [v.id]: !prev[v.id],
                                      }))
                                    }
                                  >
                                    {showAll
                                      ? 'Thu gọn bớt'
                                      : `Xem thêm ${v.details.length - 5} mục chi tiết khác...`}
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <span
                            style={{
                              fontSize: 11.5,
                              fontFamily: 'var(--font-mono)',
                              color: '#ff8a80',
                            }}
                          >
                            Streak: {v.previousStreak} &rarr; 0
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};
