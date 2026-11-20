import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Home,
  PieChart,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  DailyWorkShiftRecord,
  MonkDatabaseSchema,
  TimeAuditConfig,
  TodoActivityType,
  WorkShiftMode,
} from '../types/models';
import { shiftDateStr } from '../services/mountainLaws';
import {
  ACTIVITY_TYPE_META,
  ALL_ACTIVITY_TYPES,
  computeDayTimeAudit,
  computeTimeAuditRange,
  computeWeeklyReviewStats,
  computeWorkShiftDurationMins,
  generateWeeklyAICoachReport,
  getTimeAuditConfig,
  LiveActiveSessionInput,
  RangeBucketItem,
  TimeAuditRangeMode,
} from '../services/timeAuditEngine';
import { TabPurposeBanner } from '../components/TabPurposeBanner';
import { DurationHMInput, formatDurationHM } from '../components/DurationHMInput';
import { SuggestedReturnHomeInfo } from '../services/desktopBridge';

type TimeAuditSubTab = 'TODAY_REALTIME' | 'CHARTS' | 'WEEKLY_REVIEW';

interface TimeAuditViewProps {
  db: MonkDatabaseSchema;
  todayStr: string;
  nowTick: number;
  activeShiftMode: WorkShiftMode;
  dayShiftStartTime: string;
  nightShiftStartTime: string;
  liveActiveSession: LiveActiveSessionInput | null;
  suggestedReturnHome?: SuggestedReturnHomeInfo | null;
  onDismissReturnHomeSuggestion?: (shiftDateStr: string) => void;
  onAddManualTimeLog: (params: {
    date: string;
    activityType: TodoActivityType;
    title: string;
    durationMins: number;
  }) => void;
  onDeleteTimeLog: (logId: string) => void;
  onUpdateTimeAuditConfig: (patch: Partial<TimeAuditConfig>) => void;
  onConfirmWorkShift: (record: DailyWorkShiftRecord) => void;
  onClearWorkShift: (dateStr: string) => void;
  onGoToAIScheduleTab: () => void;
  onSelectGoal: (goalId: string) => void;
}

const formatMinsHuman = formatDurationHM;

export const TimeAuditView: React.FC<TimeAuditViewProps> = ({
  db,
  todayStr,
  nowTick,
  activeShiftMode,
  dayShiftStartTime,
  nightShiftStartTime,
  liveActiveSession,
  suggestedReturnHome,
  onDismissReturnHomeSuggestion,
  onAddManualTimeLog,
  onDeleteTimeLog,
  onUpdateTimeAuditConfig,
  onConfirmWorkShift,
  onClearWorkShift,
  onGoToAIScheduleTab,
  onSelectGoal,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<TimeAuditSubTab>('TODAY_REALTIME');
  const [rangeMode, setRangeMode] = useState<TimeAuditRangeMode>('WEEK');
  const [anchorDateStr, setAnchorDateStr] = useState<string>(todayStr);
  const [hoveredBucket, setHoveredBucket] = useState<RangeBucketItem | null>(null);
  const [showBudgetSettings, setShowBudgetSettings] = useState(false);

  // Manual quick log form (giờ + phút)
  const [manualType, setManualType] = useState<TodoActivityType>('WORK_SHIFT');
  const [manualTitle, setManualTitle] = useState('');
  const [manualTotalMins, setManualTotalMins] = useState<number>(60);
  const [manualDate, setManualDate] = useState(todayStr);

  // Work shift check-in & transparent formula drafts
  const defaultWorkStart = activeShiftMode === 'NIGHT' ? nightShiftStartTime : dayShiftStartTime;
  const existingWorkRecord = db.dailyWorkShiftLogs?.[todayStr];
  const [workStartDraft, setWorkStartDraft] = useState<string>(
    existingWorkRecord?.workStartTime || defaultWorkStart
  );
  const [workEndDraft, setWorkEndDraft] = useState<string>(
    existingWorkRecord?.workEndTime ||
      (activeShiftMode === 'NIGHT'
        ? db.climbingSchedulePlan?.nightReturnHomeTime || '07:30'
        : '17:30')
  );
  const [manualWorkInputMode, setManualWorkInputMode] = useState<'CLOCK_RANGE' | 'DURATION_HM'>(
    'CLOCK_RANGE'
  );
  const [manualWorkTotalMins, setManualWorkTotalMins] = useState<number>(
    existingWorkRecord?.workDurationMins ?? 480
  );
  const [showManualWorkEditor, setShowManualWorkEditor] = useState<boolean>(false);
  const [includePrepLockDraft, setIncludePrepLockDraft] = useState<boolean>(
    existingWorkRecord ? (existingWorkRecord.prepLockMins ?? 60) > 0 : true
  );
  const [useCustomSleepDraft, setUseCustomSleepDraft] = useState<boolean>(
    existingWorkRecord?.sleepOverrideMins !== undefined
  );
  const [customSleepTotalMins, setCustomSleepTotalMins] = useState<number>(
    existingWorkRecord?.sleepOverrideMins ?? 360
  );

  useEffect(() => {
    if (!existingWorkRecord) {
      setWorkStartDraft(defaultWorkStart);
      setWorkEndDraft(
        activeShiftMode === 'NIGHT'
          ? db.climbingSchedulePlan?.nightReturnHomeTime || '07:30'
          : '17:30'
      );
    } else {
      setManualWorkTotalMins(existingWorkRecord.workDurationMins ?? 480);
      if (existingWorkRecord.sleepOverrideMins !== undefined) {
        setUseCustomSleepDraft(true);
        setCustomSleepTotalMins(existingWorkRecord.sleepOverrideMins);
      }
    }
  }, [defaultWorkStart, activeShiftMode, existingWorkRecord, db.climbingSchedulePlan?.nightReturnHomeTime]);

  const totalManualLogMins = manualTotalMins;

  const nowArrivalInfo = useMemo(() => {
    const nowD = new Date(nowTick);
    const nowHHMM = `${String(nowD.getHours()).padStart(2, '0')}:${String(
      nowD.getMinutes()
    ).padStart(2, '0')}`;
    const [sy, sm, sd] = todayStr.split('-').map(Number);
    const [wh, wm] = (workStartDraft || defaultWorkStart).split(':').map(Number);
    const startMs = new Date(sy, (sm || 1) - 1, sd || 1, wh || 0, wm || 0, 0, 0).getTime();
    const diffMins = Math.round((nowTick - startMs) / 60000);
    const isPlausibleArrival = diffMins >= 15 && diffMins <= 16 * 60;
    return { nowHHMM, startMs, diffMins, isPlausibleArrival };
  }, [nowTick, todayStr, workStartDraft, defaultWorkStart]);

  const manualWorkComputedMins = useMemo(() => {
    if (manualWorkInputMode === 'DURATION_HM') {
      return Math.max(0, Math.min(18 * 60 + 59, Math.round(manualWorkTotalMins || 0)));
    }
    return computeWorkShiftDurationMins(workStartDraft, workEndDraft);
  }, [manualWorkInputMode, manualWorkTotalMins, workStartDraft, workEndDraft]);

  // Weekly AI critique state
  const [aiCoachResult, setAiCoachResult] = useState<{
    usedExternalAI: boolean;
    providerLabel: string;
    reportText: string;
  } | null>(null);
  const [isLoadingCoach, setIsLoadingCoach] = useState(false);

  const auditCfg = useMemo(() => getTimeAuditConfig(db), [db]);

  const todayAudit = useMemo(
    () => computeDayTimeAudit(db, todayStr, todayStr, nowTick, liveActiveSession),
    [db, todayStr, nowTick, liveActiveSession]
  );

  const rangeSummary = useMemo(
    () => computeTimeAuditRange(db, rangeMode, anchorDateStr, todayStr, nowTick, liveActiveSession),
    [db, rangeMode, anchorDateStr, todayStr, nowTick, liveActiveSession]
  );

  const weeklyStats = useMemo(
    () => computeWeeklyReviewStats(db, todayStr, nowTick, liveActiveSession),
    [db, todayStr, nowTick, liveActiveSession]
  );

  const shiftRangeAnchor = (dir: -1 | 1) => {
    if (rangeMode === 'DAY') {
      setAnchorDateStr((prev) => {
        const next = shiftDateStr(prev, dir);
        return next > todayStr ? todayStr : next;
      });
    } else if (rangeMode === 'WEEK') {
      setAnchorDateStr((prev) => {
        const next = shiftDateStr(prev, dir * 7);
        return next > todayStr ? todayStr : next;
      });
    } else if (rangeMode === 'MONTH') {
      setAnchorDateStr((prev) => {
        const [y, m] = prev.split('-').map(Number);
        const dt = new Date(y, m - 1 + dir, 15, 12);
        const ym = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-15`;
        return ym > todayStr ? todayStr : ym;
      });
    } else {
      setAnchorDateStr((prev) => {
        const [y] = prev.split('-').map(Number);
        const ny = `${y + dir}-06-15`;
        return ny > todayStr ? todayStr : ny;
      });
    }
    setHoveredBucket(null);
  };

  // Pure SVG Donut geometry for Today
  const donutSegments = useMemo(() => {
    const prod = todayAudit.productiveMins;
    const chore = todayAudit.choreMins;
    const leisure = todayAudit.leisureMins;
    const wasted = todayAudit.wastedMins;
    const total = Math.max(1, prod + chore + leisure + wasted);
    const radius = 64;
    const circumference = 2 * Math.PI * radius;

    const raw = [
      { key: 'prod', label: 'Tận dụng cao (Học/Công phá/Thể chất)', mins: prod, color: '#5BAE93' },
      { key: 'chore', label: 'Việc vặt & Sinh hoạt', mins: chore, color: '#f0c878' },
      { key: 'leisure', label: 'Giải trí có kiểm soát', mins: leisure, color: '#ce93d8' },
      { key: 'wasted', label: 'Thời gian lãng phí (Trống Todo)', mins: wasted, color: '#e5534b' },
    ];

    let offset = 0;
    return raw.map((item) => {
      const len = (item.mins / total) * circumference;
      const seg = {
        ...item,
        dashArray: `${len} ${circumference - len}`,
        dashOffset: -offset,
        pct: Math.round((item.mins / total) * 100),
      };
      offset += len;
      return seg;
    });
  }, [todayAudit]);

  const maxChartBarMins = useMemo(() => {
    if (rangeSummary.buckets.length === 0) return 60;
    let maxVal = 60;
    for (const b of rangeSummary.buckets) {
      const sum =
        b.productiveMins + b.choreMins + b.leisureMins + (rangeMode === 'DAY' ? 0 : b.wastedMins);
      if (sum > maxVal) maxVal = sum;
    }
    return maxVal;
  }, [rangeSummary.buckets, rangeMode]);

  const activeInspectedBucket = hoveredBucket || rangeSummary.buckets[rangeSummary.buckets.length - 1] || null;

  return (
    <section className="module-block">
      <div className="zen-card">
        <div className="section-header-row" style={{ marginBottom: 10 }}>
          <div style={{ flex: '1 1 100%' }}>
            <span className="zen-tag-red">
              KIỂM TOÁN QUỸ THỜI GIAN &amp; NỖ LỰC THẬT VS NỖ LỰC ẢO
            </span>
            <h2 className="section-title" style={{ marginTop: 6 }}>
              ⏱️ Bảng Thống Kê Quỹ Thời Gian — Tận Dụng vs Lãng Phí
            </h2>
            <TabPurposeBanner
              purpose="Đo lường minh bạch quỹ thời gian 24h của bạn: bao nhiêu phút thực sự học tập/công phá, làm việc vặt, giải trí có kiểm soát, và bao nhiêu phút đang lãng phí trôi qua không mở Todo."
              steps={[
                'Xem Hiệu Suất & Nỗ Lực Thật hôm nay',
                'Đổi biểu đồ Ngày / Tuần / Tháng / Năm',
                'Đọc Báo Cáo Tuần để chỉnh lại lịch AI',
              ]}
            />
          </div>
        </div>

        {/* 3 SUB-TABS */}
        <div className="laws-subtabs-bar" role="tablist" aria-label="Phân mục Kiểm Toán Thời Gian">
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'TODAY_REALTIME'}
            className={`laws-subtab-btn ${activeSubTab === 'TODAY_REALTIME' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('TODAY_REALTIME')}
          >
            <div className="laws-subtab-top">
              <Activity size={16} />
              <span className="laws-subtab-name">1. Kiểm Toán Hôm Nay (Realtime)</span>
            </div>
            <span
              className={`laws-subtab-pill ${
                !todayAudit.budgetBreakdown.hasConfirmedWorkShift
                  ? 'pill-gold'
                  : todayAudit.verdictLevel === 'ILLUSION_ALERT' || todayAudit.wastedMins >= 150
                  ? 'pill-danger'
                  : 'pill-ok'
              }`}
            >
              {todayAudit.budgetBreakdown.hasConfirmedWorkShift
                ? `Hiệu suất ${todayAudit.utilizationPct}% • Lãng phí ${formatMinsHuman(todayAudit.wastedMins)}`
                : 'Chờ xác nhận giờ đi làm hôm nay'}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'CHARTS'}
            className={`laws-subtab-btn ${activeSubTab === 'CHARTS' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('CHARTS')}
          >
            <div className="laws-subtab-top">
              <BarChart3 size={16} />
              <span className="laws-subtab-name">2. Biểu Đồ Ngày / Tuần / Tháng / Năm</span>
            </div>
            <span className="laws-subtab-pill pill-gold">
              Tổng quát đa chu kỳ ({rangeMode})
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'WEEKLY_REVIEW'}
            className={`laws-subtab-btn ${activeSubTab === 'WEEKLY_REVIEW' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('WEEKLY_REVIEW')}
          >
            <div className="laws-subtab-top">
              <PieChart size={16} />
              <span className="laws-subtab-name">3. Báo Cáo Tuần &amp; AI Chấm Điểm</span>
            </div>
            <span className="laws-subtab-pill pill-neutral">
              Khớp lịch: {weeklyStats.overallAdherencePct}%
            </span>
          </button>
        </div>

        {/* ============================================================
            SUB-TAB 1: TODAY REALTIME AUDIT
           ============================================================ */}
        {activeSubTab === 'TODAY_REALTIME' && (
          <div className="laws-tabpanel page-fade-in">
            {/* WORK SHIFT CHECK-IN & TRANSPARENT 24H FORMULA CARD */}
            {(() => {
              const bb = todayAudit.budgetBreakdown;
              const buildSleepOverride = () =>
                useCustomSleepDraft
                  ? Math.max(0, Math.round(customSleepTotalMins || 0))
                  : undefined;

              const hasReturnSuggestion =
                suggestedReturnHome &&
                suggestedReturnHome.shiftDateStr === todayStr &&
                !bb.hasConfirmedWorkShift;

              return (
                <div
                  className={`work-shift-checkin-card ${
                    bb.hasConfirmedWorkShift ? 'is-confirmed' : 'is-awaiting'
                  }`}
                >
                  {hasReturnSuggestion && (
                    <div className="return-home-suggest-banner">
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <strong style={{ color: '#f0c878', fontSize: 13.5 }}>
                          ✨ Tự động phát hiện bạn vừa đi làm về lúc {suggestedReturnHome.detectedHHMM}!
                        </strong>
                        <div style={{ fontSize: 12, color: '#d6d2c6', marginTop: 2 }}>
                          Ca {suggestedReturnHome.shiftMode === 'NIGHT' ? 'Đêm' : 'Ngày'} từ{' '}
                          <strong>{suggestedReturnHome.workStartTime}</strong> &rarr;{' '}
                          <strong>{suggestedReturnHome.detectedHHMM}</strong> (={' '}
                          <strong>{formatMinsHuman(suggestedReturnHome.estimatedWorkMins)}</strong>)
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="zen-btn zen-btn-seal"
                          style={{ fontSize: 12, padding: '6px 12px' }}
                          onClick={() => {
                            onConfirmWorkShift({
                              date: todayStr,
                              shiftMode: suggestedReturnHome.shiftMode,
                              workStartTime: suggestedReturnHome.workStartTime,
                              workEndTime: suggestedReturnHome.detectedHHMM,
                              workEndMs: suggestedReturnHome.detectedAtMs,
                              workDurationMins: suggestedReturnHome.estimatedWorkMins,
                              prepLockMins: 60,
                              sleepOverrideMins: buildSleepOverride(),
                              confirmedAt: Date.now(),
                            });
                            onDismissReturnHomeSuggestion?.(todayStr);
                          }}
                        >
                          <Check size={14} /> Chốt Đúng Giờ Này
                        </button>
                        <button
                          type="button"
                          className="zen-btn zen-btn-ghost"
                          style={{ fontSize: 11.5, padding: '5px 8px' }}
                          onClick={() => onDismissReturnHomeSuggestion?.(todayStr)}
                        >
                          Bỏ qua
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="section-header-row" style={{ marginBottom: 10 }}>
                    <div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="zen-tag-red">
                          CHẤM CÔNG CA LÀM &amp; CÔNG THỨC QUỸ RẢNH 24H ({todayStr})
                        </span>
                        <span className="time-window-pill">
                          {activeShiftMode === 'NIGHT'
                            ? `🌙 Ca Đêm (vào ca ${nightShiftStartTime})`
                            : `☀️ Ca Ngày (vào ca ${dayShiftStartTime})`}
                        </span>
                        <span className="time-window-pill">
                          🛏️ Giờ ngủ:{' '}
                          {bb.sleepSource === 'AI_SCHEDULE'
                            ? `Từ Lịch AI (${formatMinsHuman(bb.sleepMins)}${
                                bb.sleepWindowLabel ? ` • ${bb.sleepWindowLabel}` : ''
                              })`
                            : bb.sleepSource === 'OVERRIDE'
                            ? `Tự chỉnh hôm nay (${formatMinsHuman(bb.sleepMins)})`
                            : `Mặc định (${formatMinsHuman(bb.sleepMins)})`}
                        </span>
                      </div>
                      <h3 style={{ fontSize: 16.5, color: '#F6F4EE', margin: '6px 0 2px' }}>
                        {bb.hasConfirmedWorkShift
                          ? bb.isDayOffNoWork
                            ? '🌴 Hôm nay đã xác nhận Nghỉ Làm (0h đi làm)'
                            : `🏠 Đã chốt giờ đi làm hôm nay: ${formatMinsHuman(bb.workMins)} (${bb.workStartTime}${
                                bb.workEndTime ? ` → ${bb.workEndTime}` : ''
                              })`
                          : '🏠 Bạn đã đi làm về chưa? Xác nhận để tính chuẩn Quỹ Thời Gian Rảnh hôm nay!'}
                      </h3>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {bb.hasConfirmedWorkShift && (
                        <>
                          <button
                            type="button"
                            className="zen-btn zen-btn-outline"
                            style={{ fontSize: 12, padding: '5px 10px' }}
                            onClick={() => setShowManualWorkEditor((v) => !v)}
                          >
                            <Edit3 size={13} />{' '}
                            {showManualWorkEditor ? 'Đóng chỉnh sửa' : 'Sửa giờ làm / ngủ'}
                          </button>
                          <button
                            type="button"
                            className="zen-btn zen-btn-ghost"
                            style={{ fontSize: 12, padding: '5px 10px', color: '#ff8a80' }}
                            onClick={() => onClearWorkShift(todayStr)}
                          >
                            <RotateCcw size={13} /> Xóa chấm công hôm nay
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Quick 1-click actions when NOT confirmed yet (or editing) */}
                  {(!bb.hasConfirmedWorkShift || showManualWorkEditor) && (
                    <div className="work-checkin-actions-wrap">
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="zen-btn zen-btn-seal"
                          disabled={!nowArrivalInfo.isPlausibleArrival}
                          onClick={() => {
                            onConfirmWorkShift({
                              date: todayStr,
                              shiftMode: activeShiftMode,
                              workStartTime: workStartDraft,
                              workEndTime: nowArrivalInfo.nowHHMM,
                              workStartMs: nowArrivalInfo.startMs,
                              workEndMs: nowTick,
                              workDurationMins: nowArrivalInfo.diffMins,
                              prepLockMins: includePrepLockDraft ? 60 : 0,
                              sleepOverrideMins: buildSleepOverride(),
                              confirmedAt: Date.now(),
                            });
                            setShowManualWorkEditor(false);
                          }}
                          title="Tự lấy mốc bắt đầu từ giờ vào ca và kết thúc ngay tại thời điểm hiện tại"
                        >
                          <Home size={15} />
                          <span>
                            {nowArrivalInfo.isPlausibleArrival
                              ? `🏠 Xác Nhận Đã Đi Làm Về Ngay (${workStartDraft} → ${
                                  nowArrivalInfo.nowHHMM
                                } = ${formatMinsHuman(nowArrivalInfo.diffMins)})`
                              : `🏠 Xác Nhận Đã Đi Làm Về Ngay (Chưa vào ca hoặc đã qua >16h kể từ ${workStartDraft})`}
                          </span>
                        </button>

                        <button
                          type="button"
                          className="zen-btn zen-btn-outline"
                          onClick={() => {
                            onConfirmWorkShift({
                              date: todayStr,
                              shiftMode: activeShiftMode,
                              workStartTime: workStartDraft,
                              workDurationMins: 0,
                              prepLockMins: 0,
                              sleepOverrideMins: buildSleepOverride(),
                              isDayOffNoWork: true,
                              confirmedAt: Date.now(),
                            });
                            setShowManualWorkEditor(false);
                          }}
                        >
                          🌴 Hôm Nay Nghỉ Làm (0h đi làm)
                        </button>

                        <button
                          type="button"
                          className="zen-btn zen-btn-ghost"
                          style={{ fontSize: 12.5 }}
                          onClick={() => setShowManualWorkEditor((v) => !v)}
                        >
                          <Clock size={14} />{' '}
                          {showManualWorkEditor
                            ? 'Ẩn nhập giờ đi làm thủ công'
                            : 'Hoặc tự nhập giờ bắt đầu / kết thúc...'}
                        </button>
                      </div>

                      {(showManualWorkEditor || !nowArrivalInfo.isPlausibleArrival) && (
                        <div className="work-manual-editor-box">
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                            <button
                              type="button"
                              className={`pomo-preset-btn ${
                                manualWorkInputMode === 'CLOCK_RANGE' ? 'active' : ''
                              }`}
                              onClick={() => setManualWorkInputMode('CLOCK_RANGE')}
                            >
                              Nhập Từ giờ → Đến giờ
                            </button>
                            <button
                              type="button"
                              className={`pomo-preset-btn ${
                                manualWorkInputMode === 'DURATION_HM' ? 'active' : ''
                              }`}
                              onClick={() => setManualWorkInputMode('DURATION_HM')}
                            >
                              Nhập Số tiếng &amp; Số phút đi làm
                            </button>
                          </div>

                          <div className="ai-editor-form-grid">
                            {manualWorkInputMode === 'CLOCK_RANGE' ? (
                              <>
                                <div>
                                  <label className="zen-label">Giờ bắt đầu đi làm</label>
                                  <input
                                    type="time"
                                    className="zen-input"
                                    style={{ width: '100%' }}
                                    value={workStartDraft}
                                    onChange={(e) => setWorkStartDraft(e.target.value)}
                                  />
                                </div>
                                <div>
                                  <label className="zen-label">Giờ đi làm về tới nhà</label>
                                  <input
                                    type="time"
                                    className="zen-input"
                                    style={{ width: '100%' }}
                                    value={workEndDraft}
                                    onChange={(e) => setWorkEndDraft(e.target.value)}
                                  />
                                </div>
                              </>
                            ) : (
                              <div>
                                <label className="zen-label">Tổng thời gian đi làm (Tiếng + Phút)</label>
                                <DurationHMInput
                                  valueMins={manualWorkTotalMins}
                                  minMins={0}
                                  maxHours={18}
                                  onChangeMins={setManualWorkTotalMins}
                                />
                              </div>
                            )}

                            <div>
                              <label className="zen-label">Khóa chuẩn bị trước làm &amp; Giờ ngủ</label>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <label style={{ fontSize: 12, color: '#d0ccc0', display: 'flex', gap: 6, alignItems: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={includePrepLockDraft}
                                    onChange={(e) => setIncludePrepLockDraft(e.target.checked)}
                                  />
                                  Trừ 1 tiếng (1h) chuẩn bị trước khi đi làm
                                </label>
                                <label style={{ fontSize: 12, color: '#d0ccc0', display: 'flex', gap: 6, alignItems: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={useCustomSleepDraft}
                                    onChange={(e) => setUseCustomSleepDraft(e.target.checked)}
                                  />
                                  Chỉnh riêng giờ ngủ hôm nay (thay cho Lịch AI)
                                </label>
                                {useCustomSleepDraft && (
                                  <DurationHMInput
                                    valueMins={customSleepTotalMins}
                                    minMins={0}
                                    maxHours={16}
                                    onChangeMins={setCustomSleepTotalMins}
                                  />
                                )}
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="zen-btn zen-btn-seal"
                                onClick={() => {
                                  onConfirmWorkShift({
                                    date: todayStr,
                                    shiftMode: activeShiftMode,
                                    workStartTime: workStartDraft,
                                    workEndTime:
                                      manualWorkInputMode === 'CLOCK_RANGE' ? workEndDraft : undefined,
                                    workDurationMins: manualWorkComputedMins,
                                    prepLockMins: includePrepLockDraft ? 60 : 0,
                                    sleepOverrideMins: buildSleepOverride(),
                                    isDayOffNoWork: manualWorkComputedMins === 0,
                                    confirmedAt: Date.now(),
                                  });
                                  setShowManualWorkEditor(false);
                                }}
                              >
                                <Check size={15} /> Lưu Giờ Làm ({formatMinsHuman(manualWorkComputedMins)})
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Explicit Transparent Formula Strip */}
                  <div className="time-formula-box">
                    <div className="time-formula-chips">
                      <span className="time-formula-chip base">🕛 24h</span>
                      <span className="formula-op">−</span>
                      <span className="time-formula-chip sleep">
                        🛏️ Ngủ {formatMinsHuman(bb.sleepMins)}
                        {bb.sleepSource === 'AI_SCHEDULE' ? ' (từ Lịch AI)' : ''}
                      </span>
                      <span className="formula-op">−</span>
                      <span className="time-formula-chip work">
                        💼 Đi làm{' '}
                        {bb.hasConfirmedWorkShift ? formatMinsHuman(bb.workMins) : 'Chờ chốt...'}
                      </span>
                      <span className="formula-op">−</span>
                      <span className="time-formula-chip prep">
                        🎒 Khóa chuẩn bị {formatMinsHuman(bb.prepLockMins)}
                      </span>
                      <span className="formula-op">=</span>
                      <span className="time-formula-chip result">
                        {bb.hasConfirmedWorkShift
                          ? `🟢 Quỹ Rảnh Cả Ngày: ${formatMinsHuman(bb.fullDayFreeBudgetMins)}`
                          : '⏳ Chờ xác nhận đi làm'}
                      </span>
                    </div>

                    <div className="time-formula-realtime-line">
                      {bb.hasConfirmedWorkShift ? (
                        <span>
                          ⏱️ Tính đến lúc <strong>{nowArrivalInfo.nowHHMM}</strong>: Trong tổng quỹ
                          rảnh <strong>{formatMinsHuman(bb.fullDayFreeBudgetMins)}</strong>, đã trôi qua{' '}
                          <strong>{formatMinsHuman(bb.elapsedFreeBudgetMins)}</strong> (đã tận dụng{' '}
                          <strong style={{ color: '#5BAE93' }}>
                            {formatMinsHuman(todayAudit.trackedDiscretionaryMins)}
                          </strong>{' '}
                          • lãng phí{' '}
                          <strong style={{ color: '#ff8a80' }}>
                            {formatMinsHuman(todayAudit.wastedMins)}
                          </strong>
                          ) &bull; Còn lại hôm nay:{' '}
                          <strong style={{ color: '#f0c878' }}>
                            {formatMinsHuman(bb.remainingFreeBudgetMins)}
                          </strong>
                        </span>
                      ) : (
                        <span>{bb.formulaText}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Hero Real Effort Score Banner */}
            <div className={`time-audit-hero-card level-${todayAudit.verdictLevel.toLowerCase()}`}>
              <div className="time-audit-score-ring">
                <div className="time-audit-score-num">{todayAudit.realEffortScore}</div>
                <div className="time-audit-score-sub">/ 100 ĐIỂM</div>
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="zen-tag-red">ĐÁNH GIÁ NỖ LỰC HÔM NAY ({todayStr})</span>
                  {liveActiveSession && (
                    <span className="time-audit-live-pill">
                      🔴 REALTIME: +{liveActiveSession.elapsedMins}p đang chạy ({liveActiveSession.title})
                    </span>
                  )}
                </div>
                <h3 style={{ fontSize: 19, color: '#F6F4EE', margin: '6px 0 4px' }}>
                  {todayAudit.verdictLabel}
                </h3>
                <div style={{ fontSize: 12.5, color: '#d0ccc0' }}>
                  {todayAudit.budgetBreakdown.hasConfirmedWorkShift ? (
                    <>
                      Quỹ thời gian rảnh đã trôi qua (công thức minh bạch ở trên):{' '}
                      <strong>{formatMinsHuman(todayAudit.discretionaryBudgetMins)}</strong>
                    </>
                  ) : (
                    <>Đã ghi nhận làm việc thực tế hôm nay: <strong>{formatMinsHuman(todayAudit.trackedDiscretionaryMins)}</strong> (bấm chốt giờ đi làm để tính % hiệu suất &amp; lãng phí chính xác).</>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="zen-btn zen-btn-outline"
                style={{ fontSize: 12 }}
                onClick={() => setShowBudgetSettings((v) => !v)}
              >
                <Clock size={14} /> {showBudgetSettings ? 'Ẩn Cài Đặt Mặc Định' : 'Cài Đặt Ngủ / Làm Mặc Định'}
              </button>
            </div>

            {showBudgetSettings && (
              <div className="time-audit-budget-panel">
                <div className="ai-editor-form-grid">
                  <div>
                    <label className="zen-label">Giờ ngủ mặc định / ngày</label>
                    <DurationHMInput
                      valueMins={Math.round(auditCfg.sleepHoursPerDay * 60)}
                      minMins={60}
                      maxHours={14}
                      onChangeMins={(m) =>
                        onUpdateTimeAuditConfig({ sleepHoursPerDay: Number((m / 60).toFixed(2)) })
                      }
                    />
                  </div>
                  <div>
                    <label className="zen-label">Giờ đi làm ca mặc định / ngày</label>
                    <DurationHMInput
                      valueMins={Math.round(auditCfg.workShiftHoursPerDay * 60)}
                      minMins={0}
                      maxHours={16}
                      onChangeMins={(m) =>
                        onUpdateTimeAuditConfig({ workShiftHoursPerDay: Number((m / 60).toFixed(2)) })
                      }
                    />
                  </div>
                  <div>
                    <label className="zen-label">Sinh hoạt cố định (ăn/tắm)</label>
                    <DurationHMInput
                      valueMins={Math.round(auditCfg.essentialRoutineHoursPerDay * 60)}
                      minMins={15}
                      maxHours={6}
                      onChangeMins={(m) =>
                        onUpdateTimeAuditConfig({
                          essentialRoutineHoursPerDay: Number((m / 60).toFixed(2)),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="zen-label">Mục tiêu tập trung cao / ngày</label>
                    <DurationHMInput
                      valueMins={auditCfg.dailyTargetProductiveMins}
                      minMins={15}
                      maxHours={14}
                      onChangeMins={(m) =>
                        onUpdateTimeAuditConfig({ dailyTargetProductiveMins: Math.max(15, m) })
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 5 KPI Cards */}
            <div className="time-audit-kpi-grid">
              <div className="time-audit-kpi-card kpi-jade">
                <div className="kpi-lbl">📚+⚔️ Tận Dụng Cao</div>
                <div className="kpi-val">{formatMinsHuman(todayAudit.productiveMins)}</div>
                <div className="kpi-sub">
                  Học {todayAudit.minsByType.STUDY}p • Công phá {todayAudit.minsByType.DEEP_WORK}p • Thể chất{' '}
                  {todayAudit.minsByType.HEALTH_REST}p
                </div>
              </div>

              <div className="time-audit-kpi-card kpi-gold">
                <div className="kpi-lbl">🧹 Việc Vặt Có Giờ</div>
                <div className="kpi-val">{formatMinsHuman(todayAudit.choreMins)}</div>
                <div className="kpi-sub">Tắm rửa, dọn phòng, nấu ăn...</div>
              </div>

              <div className="time-audit-kpi-card kpi-purple">
                <div className="kpi-lbl">🎮 Giải Trí / Làm Thêm</div>
                <div className="kpi-val">
                  {formatMinsHuman(todayAudit.leisureMins + todayAudit.workShiftLoggedMins)}
                </div>
                <div className="kpi-sub">
                  Chơi: {todayAudit.leisureMins}p • Đi làm log thêm: {todayAudit.workShiftLoggedMins}p
                </div>
              </div>

              <div className="time-audit-kpi-card kpi-crimson">
                <div className="kpi-lbl">🚨 Lãng Phí (Trống Todo)</div>
                <div className="kpi-val">
                  {todayAudit.budgetBreakdown.hasConfirmedWorkShift
                    ? formatMinsHuman(todayAudit.wastedMins)
                    : '—'}
                </div>
                <div className="kpi-sub">
                  {todayAudit.budgetBreakdown.hasConfirmedWorkShift
                    ? 'Quỹ rảnh đã trôi qua chưa bật việc'
                    : 'Chờ bấm "Đã đi làm về" ở trên'}
                </div>
              </div>

              <div className="time-audit-kpi-card kpi-cyan">
                <div className="kpi-lbl">🎯 Hiệu Suất Quỹ Rảnh</div>
                <div className="kpi-val">{todayAudit.utilizationPct}%</div>
                <div className="kpi-sub">
                  Tập trung cao: {todayAudit.highValuePct}% quỹ rảnh
                </div>
              </div>
            </div>

            {/* Real vs Illusion Audit Insights */}
            <div
              className={`time-audit-illusion-box ${
                todayAudit.zeroPomoCompletedTodosCount > 0 ? 'has-illusion' : 'is-authentic'
              }`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {todayAudit.zeroPomoCompletedTodosCount > 0 ? (
                  <ShieldAlert size={20} color="#ff8a80" />
                ) : (
                  <ShieldCheck size={20} color="#5BAE93" />
                )}
                <strong style={{ color: '#F6F4EE', fontSize: 14.5 }}>
                  Kiểm Chứng Nỗ Lực Thật vs Nỗ Lực Ảo:
                </strong>
                <span className="pomo-pill">
                  Todo xong hôm nay: {todayAudit.completedTodosCount}
                </span>
                <span className="pomo-pill">
                  Có PoW / ≥15p Pomodoro: {todayAudit.powVerifiedTodosCount}
                </span>
                {todayAudit.zeroPomoCompletedTodosCount > 0 && (
                  <span className="time-window-pill" style={{ borderColor: '#ff5252', color: '#ff8a80' }}>
                    🚨 {todayAudit.zeroPomoCompletedTodosCount} Todo xong với 0p Pomodoro!
                  </span>
                )}
              </div>
              {todayAudit.insights.length > 0 && (
                <ul className="time-audit-insights-list">
                  {todayAudit.insights.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* 2-Column Visual Grid: SVG Donut + 24h Shift Timeline */}
            <div className="time-audit-two-col">
              {/* Left: Pure SVG Donut Breakdown */}
              <div className="time-audit-panel-card">
                <h4 className="zen-subcard-title" style={{ marginBottom: 12 }}>
                  🍩 Phân Bổ Quỹ Thời Gian Hôm Nay
                </h4>
                <div className="time-audit-donut-row">
                  <svg width="170" height="170" viewBox="0 0 170 170" className="time-audit-donut-svg">
                    <circle
                      cx="85"
                      cy="85"
                      r="64"
                      fill="transparent"
                      stroke="rgba(255,255,255,0.06)"
                      strokeWidth="20"
                    />
                    {donutSegments.map((seg) =>
                      seg.mins > 0 ? (
                        <circle
                          key={seg.key}
                          cx="85"
                          cy="85"
                          r="64"
                          fill="transparent"
                          stroke={seg.color}
                          strokeWidth="20"
                          strokeDasharray={seg.dashArray}
                          strokeDashoffset={seg.dashOffset}
                          transform="rotate(-90 85 85)"
                        />
                      ) : null
                    )}
                    <text
                      x="85"
                      y="81"
                      textAnchor="middle"
                      fill="#F6F4EE"
                      fontSize="24"
                      fontWeight="800"
                    >
                      {todayAudit.utilizationPct}%
                    </text>
                    <text x="85" y="101" textAnchor="middle" fill="#B8B4A9" fontSize="11">
                      Hiệu suất
                    </text>
                  </svg>

                  <div className="time-audit-legend-list">
                    {donutSegments.map((seg) => (
                      <div key={seg.key} className="time-audit-legend-row">
                        <span className="legend-dot" style={{ background: seg.color }} />
                        <span className="legend-lbl">{seg.label}</span>
                        <strong className="legend-val">
                          {formatMinsHuman(seg.mins)} ({seg.pct}%)
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick breakdown by all 6 TodoActivityTypes */}
                <div className="time-audit-type-bars">
                  {ALL_ACTIVITY_TYPES.map((t) => {
                    const meta = ACTIVITY_TYPE_META[t];
                    const mins = todayAudit.minsByType[t];
                    const maxRef = Math.max(60, todayAudit.discretionaryBudgetMins);
                    const widthPct = Math.min(100, Math.round((mins / maxRef) * 100));
                    return (
                      <div key={t} className="audit-type-row">
                        <div className="audit-type-head">
                          <span>
                            {meta.icon} {meta.shortLabel}
                          </span>
                          <strong>{formatMinsHuman(mins)}</strong>
                        </div>
                        <div className="zen-progress-track" style={{ height: 6 }}>
                          <div
                            className="zen-progress-fill"
                            style={{ width: `${widthPct}%`, background: meta.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: 24h Shift Timeline + Today's Session Ledger */}
              <div className="time-audit-panel-card">
                <h4 className="zen-subcard-title" style={{ marginBottom: 10 }}>
                  🕒 Dòng Chảy 24 Giờ Theo Ca &amp; Nhật Ký Phiên Làm Việc
                </h4>
                <div className="hourly-bars-strip" title="Hoạt động Pomodoro / Việc theo từng giờ trong ca">
                  {todayAudit.hourlyBuckets.map((hb) => {
                    const heightPct = Math.min(100, Math.round((hb.totalMins / 60) * 100));
                    const prodH =
                      hb.minsByType.STUDY + hb.minsByType.DEEP_WORK + hb.minsByType.HEALTH_REST;
                    const dominantColor =
                      prodH > 0
                        ? '#5BAE93'
                        : hb.minsByType.CHORE > 0
                        ? '#f0c878'
                        : hb.minsByType.WORK_SHIFT > 0
                        ? '#90a4ae'
                        : '#ce93d8';
                    return (
                      <div
                        key={hb.hour}
                        className="hourly-bar-col"
                        title={`${hb.label}: ${hb.totalMins} phút ghi nhận`}
                      >
                        <div className="hourly-bar-track">
                          {hb.totalMins > 0 && (
                            <div
                              className="hourly-bar-fill"
                              style={{ height: `${Math.max(10, heightPct)}%`, background: dominantColor }}
                            />
                          )}
                        </div>
                        <span className="hourly-bar-lbl">{hb.hour % 3 === 0 ? hb.hour : ''}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Today Session List */}
                <div className="audit-sessions-list">
                  {todayAudit.sessions.length === 0 ? (
                    <div className="empty-state-box" style={{ padding: '18px 14px', textAlign: 'center', fontSize: 12.5 }}>
                      Hôm nay chưa có phiên Pomodoro hoặc hoạt động nào được ghi nhận. Hãy mở 1 Todo
                      hoặc bấm ghi nhận nhanh bên dưới!
                    </div>
                  ) : (
                    todayAudit.sessions.map((sess) => {
                      const meta = ACTIVITY_TYPE_META[sess.activityType];
                      const startStr = new Date(sess.startedAt).toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const endStr = new Date(sess.endedAt).toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const canDelete = !sess.id.startsWith('legacy-') && !sess.id.startsWith('live-');
                      return (
                        <div key={sess.id} className="audit-session-row">
                          <span
                            className="activity-type-pill"
                            style={{ borderColor: meta.color, color: meta.color }}
                          >
                            {meta.icon} {meta.shortLabel}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#F6F4EE' }}>
                              {sess.title}
                            </div>
                            <div style={{ fontSize: 11.5, color: '#B8B4A9' }}>
                              {startStr} – {endStr} &bull;{' '}
                              {sess.source === 'MANUAL_LOG'
                                ? 'Ghi nhận thủ công'
                                : sess.source === 'POMODORO_EARLY_FINISH'
                                ? 'Pomodoro hoàn thành sớm (thực tế)'
                                : 'Pomodoro trọn hiệp'}
                            </div>
                          </div>
                          <span className="pomo-pill">+{sess.durationMins}p</span>
                          {canDelete && (
                            <button
                              type="button"
                              className="zen-btn zen-btn-ghost"
                              style={{ padding: '3px 6px', color: '#ff8a80' }}
                              title="Xóa bản ghi phiên này"
                              onClick={() => onDeleteTimeLog(sess.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Quick Manual Activity Logger (Giờ + Phút) */}
            <form
              className="inline-add-box"
              style={{ marginTop: 16, borderColor: 'rgba(91, 174, 147, 0.45)' }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!manualTitle.trim() || totalManualLogMins <= 0) return;
                onAddManualTimeLog({
                  date: manualDate || todayStr,
                  activityType: manualType,
                  title: manualTitle.trim(),
                  durationMins: Math.max(1, Math.min(24 * 60, totalManualLogMins)),
                });
                setManualTitle('');
              }}
            >
              <div className="inline-add-header">
                + Ghi Nhận Nhanh Hoạt Động Ngoài Pomodoro (Tự Gõ Số Tiếng &amp; Số Phút Tùy Ý)
              </div>
              <div className="ai-editor-form-grid">
                <div>
                  <label className="zen-label">Loại hoạt động</label>
                  <select
                    className="zen-input"
                    style={{ width: '100%' }}
                    value={manualType}
                    onChange={(e) => setManualType(e.target.value as TodoActivityType)}
                  >
                    {ALL_ACTIVITY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ACTIVITY_TYPE_META[t].icon} {ACTIVITY_TYPE_META[t].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="zen-label">Nội dung đã làm *</label>
                  <input
                    type="text"
                    className="zen-input"
                    style={{ width: '100%' }}
                    placeholder="VD: Chơi game giải trí 1h 20p, Đọc sách, Tập thể dục..."
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="zen-label">
                    Thời lượng (Giờ + Phút) &rarr;{' '}
                    <strong style={{ color: '#A8D8C6' }}>
                      {formatMinsHuman(totalManualLogMins)}
                    </strong>
                  </label>
                  <div style={{ marginBottom: 6 }}>
                    <DurationHMInput
                      valueMins={manualTotalMins}
                      minMins={1}
                      maxHours={24}
                      showPreviewBadge={false}
                      onChangeMins={setManualTotalMins}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {[15, 30, 45, 60, 90, 120, 240, 480].map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`pomo-preset-btn ${totalManualLogMins === m ? 'active' : ''}`}
                        onClick={() => setManualTotalMins(m)}
                      >
                        {formatMinsHuman(m)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="zen-label">Ngày ghi nhận</label>
                  <input
                    type="date"
                    className="zen-input"
                    style={{ width: '100%' }}
                    max={todayStr}
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  type="submit"
                  className="zen-btn zen-btn-seal"
                  disabled={!manualTitle.trim() || totalManualLogMins <= 0}
                >
                  <Plus size={15} /> Ghi Vào Sổ Thời Gian (+{formatMinsHuman(totalManualLogMins)})
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ============================================================
            SUB-TAB 2: MULTI-PERIOD STACKED CHARTS (DAY / WEEK / MONTH / YEAR)
           ============================================================ */}
        {activeSubTab === 'CHARTS' && (
          <div className="laws-tabpanel page-fade-in">
            <div className="time-audit-controls-bar">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(
                  [
                    { id: 'DAY', label: 'Theo Ngày (24h)' },
                    { id: 'WEEK', label: 'Theo Tuần (7 ngày)' },
                    { id: 'MONTH', label: 'Theo Tháng' },
                    { id: 'YEAR', label: 'Theo Năm (12 tháng)' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`zen-btn ${rangeMode === item.id ? 'zen-btn-seal' : 'zen-btn-outline'}`}
                    style={{ padding: '6px 12px', fontSize: 12.5 }}
                    onClick={() => {
                      setRangeMode(item.id);
                      setHoveredBucket(null);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="zen-btn zen-btn-outline"
                  style={{ padding: '5px 9px' }}
                  onClick={() => shiftRangeAnchor(-1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <strong style={{ color: '#f0c878', fontSize: 14, minWidth: 140, textAlign: 'center' }}>
                  {rangeSummary.periodLabel}
                </strong>
                <button
                  type="button"
                  className="zen-btn zen-btn-outline"
                  style={{ padding: '5px 9px' }}
                  disabled={anchorDateStr >= todayStr}
                  onClick={() => shiftRangeAnchor(1)}
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  type="button"
                  className="zen-btn zen-btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    setAnchorDateStr(todayStr);
                    setHoveredBucket(null);
                  }}
                >
                  Hôm nay
                </button>
              </div>
            </div>

            {/* Period KPI Summary */}
            <div className="time-audit-kpi-grid" style={{ marginBottom: 16 }}>
              <div className="time-audit-kpi-card kpi-jade">
                <div className="kpi-lbl">Tổng Tập Trung Cao</div>
                <div className="kpi-val">{formatMinsHuman(rangeSummary.totals.productiveMins)}</div>
                <div className="kpi-sub">{rangeSummary.totals.highValuePct}% quỹ rảnh</div>
              </div>
              <div className="time-audit-kpi-card kpi-gold">
                <div className="kpi-lbl">Tổng Việc Vặt</div>
                <div className="kpi-val">{formatMinsHuman(rangeSummary.totals.choreMins)}</div>
                <div className="kpi-sub">Sinh hoạt tối ưu</div>
              </div>
              <div className="time-audit-kpi-card kpi-purple">
                <div className="kpi-lbl">Giải Trí + Đi Làm Log</div>
                <div className="kpi-val">
                  {formatMinsHuman(
                    rangeSummary.totals.leisureMins + rangeSummary.totals.workShiftLoggedMins
                  )}
                </div>
                <div className="kpi-sub">
                  Chơi {formatMinsHuman(rangeSummary.totals.leisureMins)}
                </div>
              </div>
              <div className="time-audit-kpi-card kpi-crimson">
                <div className="kpi-lbl">Tổng Thời Gian Lãng Phí</div>
                <div className="kpi-val">{formatMinsHuman(rangeSummary.totals.wastedMins)}</div>
                <div className="kpi-sub">{rangeSummary.totals.activeDaysCount} ngày hoạt động</div>
              </div>
              <div className="time-audit-kpi-card kpi-cyan">
                <div className="kpi-lbl">Điểm Nỗ Lực Thật TB</div>
                <div className="kpi-val">{rangeSummary.totals.avgRealEffortScore}/100</div>
                <div className="kpi-sub">Hiệu suất chung: {rangeSummary.totals.utilizationPct}%</div>
              </div>
            </div>

            {/* Stacked SVG Column Chart */}
            <div className="time-audit-panel-card" style={{ marginBottom: 16 }}>
              <div className="section-header-row" style={{ marginBottom: 10 }}>
                <strong style={{ color: '#F6F4EE', fontSize: 15 }}>
                  📊 Biểu Đồ Phân Bổ Thời Gian — {rangeSummary.periodLabel}
                </strong>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11.5 }}>
                  <span style={{ color: '#5BAE93' }}>■ Học Tập</span>
                  <span style={{ color: '#81c784' }}>■ Công Phá</span>
                  <span style={{ color: '#4dd0e1' }}>■ Thể Chất</span>
                  <span style={{ color: '#f0c878' }}>■ Việc Vặt</span>
                  <span style={{ color: '#ce93d8' }}>■ Giải Trí</span>
                  {rangeMode !== 'DAY' && <span style={{ color: '#e5534b' }}>■ Lãng Phí</span>}
                </div>
              </div>

              <div className="svg-stacked-chart-scroll">
                <svg
                  viewBox={`0 0 ${Math.max(680, rangeSummary.buckets.length * 36)} 230`}
                  className="svg-stacked-chart"
                >
                  {/* Baseline */}
                  <line
                    x1="10"
                    y1="190"
                    x2={Math.max(670, rangeSummary.buckets.length * 36 - 10)}
                    y2="190"
                    stroke="rgba(255,255,255,0.14)"
                    strokeWidth="1"
                  />
                  {rangeSummary.buckets.map((b, idx) => {
                    const totalW = Math.max(680, rangeSummary.buckets.length * 36);
                    const slotW = (totalW - 20) / Math.max(1, rangeSummary.buckets.length);
                    const barW = Math.max(10, Math.min(34, slotW * 0.66));
                    const x = 10 + idx * slotW + (slotW - barW) / 2;
                    const maxH = 165;

                    const segments = [
                      { val: b.minsByType.STUDY, color: '#5BAE93' },
                      { val: b.minsByType.DEEP_WORK, color: '#81c784' },
                      { val: b.minsByType.HEALTH_REST, color: '#4dd0e1' },
                      { val: b.choreMins, color: '#f0c878' },
                      { val: b.leisureMins, color: '#ce93d8' },
                      ...(rangeMode !== 'DAY' ? [{ val: b.wastedMins, color: '#e5534b' }] : []),
                    ];

                    let curY = 190;
                    const isHovered = activeInspectedBucket?.key === b.key;

                    return (
                      <g
                        key={b.key}
                        style={{ cursor: 'pointer', opacity: b.isInactive ? 0.35 : 1 }}
                        onMouseEnter={() => setHoveredBucket(b)}
                      >
                        <rect
                          x={10 + idx * slotW}
                          y={10}
                          width={slotW}
                          height={205}
                          fill={isHovered ? 'rgba(91, 174, 147, 0.08)' : 'transparent'}
                          rx={4}
                        />
                        {segments.map((seg, sIdx) => {
                          if (seg.val <= 0) return null;
                          const h = Math.max(2, (seg.val / maxChartBarMins) * maxH);
                          curY -= h;
                          return (
                            <rect
                              key={sIdx}
                              x={x}
                              y={curY}
                              width={barW}
                              height={h}
                              fill={seg.color}
                              rx={2}
                            />
                          );
                        })}
                        <text
                          x={x + barW / 2}
                          y={210}
                          textAnchor="middle"
                          fill={isHovered ? '#f0c878' : '#9E9A8E'}
                          fontSize="10"
                          fontWeight={isHovered ? '700' : '400'}
                        >
                          {b.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {activeInspectedBucket && (
                <div className="chart-inspector-strip">
                  <strong>📌 Chi tiết ({activeInspectedBucket.label}):</strong>
                  <span>
                    Tập trung cao:{' '}
                    <strong style={{ color: '#5BAE93' }}>
                      {formatMinsHuman(activeInspectedBucket.productiveMins)}
                    </strong>
                  </span>
                  <span>
                    Việc vặt:{' '}
                    <strong style={{ color: '#f0c878' }}>
                      {formatMinsHuman(activeInspectedBucket.choreMins)}
                    </strong>
                  </span>
                  <span>
                    Giải trí:{' '}
                    <strong style={{ color: '#ce93d8' }}>
                      {formatMinsHuman(activeInspectedBucket.leisureMins)}
                    </strong>
                  </span>
                  {rangeMode !== 'DAY' && (
                    <span>
                      Lãng phí:{' '}
                      <strong style={{ color: '#ff8a80' }}>
                        {formatMinsHuman(activeInspectedBucket.wastedMins)}
                      </strong>{' '}
                      (Hiệu suất {activeInspectedBucket.utilizationPct}%)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Best/Worst & Activity Table */}
            {(rangeSummary.bestDay || rangeSummary.worstDay) && (
              <div className="ai-shift-selector-grid" style={{ marginBottom: 16 }}>
                {rangeSummary.bestDay && (
                  <div className="time-audit-callout good">
                    <Sparkles size={16} color="#81c784" />
                    <span>
                      Ngày bùng nổ nhất: <strong>{rangeSummary.bestDay.label}</strong> —{' '}
                      {formatMinsHuman(rangeSummary.bestDay.productiveMins)} tập trung cao (Điểm thật{' '}
                      {rangeSummary.bestDay.realEffortScore}/100).
                    </span>
                  </div>
                )}
                {rangeSummary.worstDay && rangeSummary.worstDay.wastedMins > 0 && (
                  <div className="time-audit-callout warn">
                    <AlertTriangle size={16} color="#ff8a80" />
                    <span>
                      Ngày lãng phí nhiều nhất: <strong>{rangeSummary.worstDay.label}</strong> —{' '}
                      {formatMinsHuman(rangeSummary.worstDay.wastedMins)} quỹ rảnh bị trôi trống.
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="time-audit-panel-card">
              <h4 className="zen-subcard-title" style={{ marginBottom: 10 }}>
                📋 Bảng Chi Tiết Theo Từng Loại Công Việc ({rangeSummary.periodLabel})
              </h4>
              <div className="audit-breakdown-table">
                {ALL_ACTIVITY_TYPES.map((t) => {
                  const meta = ACTIVITY_TYPE_META[t];
                  const mins = rangeSummary.totals.minsByType[t];
                  const denom = Math.max(
                    1,
                    rangeSummary.totals.discretionaryBudgetMins + rangeSummary.totals.workShiftLoggedMins
                  );
                  const pct = Math.round((mins / denom) * 100);
                  return (
                    <div key={t} className="audit-breakdown-row">
                      <span style={{ color: meta.color, fontWeight: 700, minWidth: 190 }}>
                        {meta.icon} {meta.label}
                      </span>
                      <span className="zen-muted-text" style={{ flex: 1, fontSize: 12 }}>
                        {meta.description}
                      </span>
                      <span className="pomo-pill">{formatMinsHuman(mins)}</span>
                      <span style={{ minWidth: 54, textAlign: 'right', fontSize: 12.5, color: '#e8e4d9' }}>
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            SUB-TAB 3: WEEKLY REVIEW & AI COACH
           ============================================================ */}
        {activeSubTab === 'WEEKLY_REVIEW' && (
          <div className="laws-tabpanel page-fade-in">
            <div className="time-audit-kpi-grid" style={{ marginBottom: 16 }}>
              <div className="time-audit-kpi-card kpi-jade">
                <div className="kpi-lbl">Khớp Lịch AI Tuần</div>
                <div className="kpi-val">{weeklyStats.overallAdherencePct}%</div>
                <div className="kpi-sub">
                  {formatMinsHuman(weeklyStats.totalActualClimbMins)} /{' '}
                  {formatMinsHuman(weeklyStats.totalPlannedMins)} dự kiến
                </div>
              </div>
              <div className="time-audit-kpi-card kpi-gold">
                <div className="kpi-lbl">Nghi Thức TB Tuần</div>
                <div className="kpi-val">{weeklyStats.avgRitualPct}%</div>
                <div className="kpi-sub">Đạt chuẩn kỷ luật Luật Núi</div>
              </div>
              <div className="time-audit-kpi-card kpi-cyan">
                <div className="kpi-lbl">Bí Kíp &amp; Việc Vặt</div>
                <div className="kpi-val">
                  {weeklyStats.optNotesAppliedRecentCount} / {weeklyStats.sideQuestsCompletedCount}
                </div>
                <div className="kpi-sub">Bí kíp dùng • Việc vặt xong</div>
              </div>
              <div className="time-audit-kpi-card kpi-crimson">
                <div className="kpi-lbl">Lãng Phí Tuần Này</div>
                <div className="kpi-val">{formatMinsHuman(weeklyStats.totalWastedMins)}</div>
                <div className="kpi-sub">
                  Nỗ lực ảo: {weeklyStats.zeroPomoCompletedTodosCount} Todo
                </div>
              </div>
              <div className="time-audit-kpi-card kpi-purple">
                <div className="kpi-lbl">Điểm Nỗ Lực Thật Tuần</div>
                <div className="kpi-val">{weeklyStats.realEffortScoreAvg}/100</div>
                <div className="kpi-sub">
                  {weeklyStats.startDateStr.slice(5)} → {weeklyStats.endDateStr.slice(5)}
                </div>
              </div>
            </div>

            {/* Mountain Planned vs Actual Comparison */}
            <div className="time-audit-panel-card" style={{ marginBottom: 16 }}>
              <div className="section-header-row" style={{ marginBottom: 12 }}>
                <h4 className="zen-subcard-title" style={{ margin: 0 }}>
                  ⛰️ So Sánh Kế Hoạch AI vs Thời Gian Tập Trung Thực Tế Từng Đỉnh Núi (Tuần Này)
                </h4>
                <button
                  type="button"
                  className="zen-btn zen-btn-outline"
                  style={{ fontSize: 12 }}
                  onClick={onGoToAIScheduleTab}
                >
                  Điều chỉnh Lịch Tuần →
                </button>
              </div>

              {weeklyStats.mountainStats.length === 0 ? (
                <div className="empty-state-box" style={{ padding: '20px', textAlign: 'center' }}>
                  Chưa có Đỉnh Núi hoặc lịch tuần AI để so sánh.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {weeklyStats.mountainStats.map((m) => {
                    const maxRef = Math.max(60, m.plannedMins, m.actualMins);
                    const planW = Math.round((m.plannedMins / maxRef) * 100);
                    const actW = Math.round((m.actualMins / maxRef) * 100);
                    return (
                      <div key={m.goalId} className="weekly-mountain-compare-row">
                        <div className="weekly-mountain-head">
                          <strong
                            style={{ color: '#F6F4EE', cursor: 'pointer' }}
                            onClick={() => onSelectGoal(m.goalId)}
                          >
                            ⛰️ {m.goalTitle}
                          </strong>
                          <span className="pomo-pill">
                            Thực tế {formatMinsHuman(m.actualMins)} / Dự kiến{' '}
                            {formatMinsHuman(m.plannedMins)} ({m.adherencePct}%)
                          </span>
                        </div>
                        <div className="weekly-compare-bars">
                          <div className="compare-bar-line">
                            <small>Dự kiến AI</small>
                            <div className="zen-progress-track" style={{ flex: 1, height: 8 }}>
                              <div
                                className="zen-progress-fill"
                                style={{ width: `${planW}%`, background: '#f0c878' }}
                              />
                            </div>
                          </div>
                          <div className="compare-bar-line">
                            <small>Thực tế</small>
                            <div className="zen-progress-track" style={{ flex: 1, height: 8 }}>
                              <div
                                className="zen-progress-fill"
                                style={{
                                  width: `${actW}%`,
                                  background: m.actualMins >= m.plannedMins * 0.7 ? '#5BAE93' : '#ff8a80',
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* AI Coach Critique */}
            <div className="time-audit-panel-card">
              <div className="section-header-row" style={{ marginBottom: 10 }}>
                <div>
                  <h4 className="zen-subcard-title" style={{ margin: 0 }}>
                    🤖 Nhận Xét &amp; Chấm Điểm Tuần Này
                  </h4>
                  <div className="zen-muted-text" style={{ fontSize: 12 }}>
                    Tự động tổng hợp từ Lịch AI, Todo Công Phá, Pomodoro thực tế và Nhật Ký Tự Vấn.
                  </div>
                </div>
                <button
                  type="button"
                  className="zen-btn zen-btn-seal"
                  disabled={isLoadingCoach}
                  onClick={async () => {
                    setIsLoadingCoach(true);
                    try {
                      const res = await generateWeeklyAICoachReport(db, weeklyStats);
                      setAiCoachResult(res);
                    } finally {
                      setIsLoadingCoach(false);
                    }
                  }}
                >
                  <Bot size={15} />
                  <span>{isLoadingCoach ? 'Đang phân tích...' : '🤖 AI Đánh Giá Tuần Này'}</span>
                </button>
              </div>

              <div className="weekly-coach-box">
                {aiCoachResult ? (
                  <div>
                    <div style={{ fontSize: 11.5, color: '#f0c878', marginBottom: 8 }}>
                      Nguồn phân tích: <strong>{aiCoachResult.providerLabel}</strong>
                    </div>
                    <div style={{ whiteSpace: 'pre-line', fontSize: 13.5, lineHeight: 1.6, color: '#F6F4EE' }}>
                      {aiCoachResult.reportText}
                    </div>
                  </div>
                ) : (
                  <ul className="time-audit-insights-list" style={{ margin: 0 }}>
                    {weeklyStats.deterministicCoachLines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
