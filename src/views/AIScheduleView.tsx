import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  Edit3,
  KeyRound,
  Lightbulb,
  Moon,
  Mountain,
  Play,
  Plus,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
  Swords,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  AIClimbingSchedulePlan,
  AIEngineMode,
  AIProviderType,
  ClimbingTimeSlotItem,
  DailyStrikeTodoEntity,
  MonkDatabaseSchema,
  ScheduleSlotKind,
  ScheduleStrategyMode,
  WorkShiftMode,
} from '../types/models';
import {
  AI_PROVIDER_DEFAULTS,
  AIConnectionTestResult,
  analyzeMountainBalance,
  autoPlaceNewSlotInDay,
  cascadeRecalculateDaySlots,
  generateScheduleWithGeminiIfConfigured,
  getDayOfWeekFromDateStr,
  getPreWorkLockWindow,
  isSlotActiveNow,
  isValidHHMM,
  resequenceSlotsAfterOrderChange,
  testExternalAIConnection,
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
} from '../services/aiSchedulePlanner';
import { TabPurposeBanner } from '../components/TabPurposeBanner';
import { DurationHMInput, formatDurationHM } from '../components/DurationHMInput';

type AIScheduleSubTab = 'TODAY_ACTION' | 'WEEK_EDITOR' | 'CONFIG_AI';

interface AIScheduleViewProps {
  db: MonkDatabaseSchema;
  todayStr: string;
  nowTick: number;
  activeShiftMode: WorkShiftMode;
  dayShiftStartTime: string;
  nightShiftStartTime: string;
  onPersistDb: (updater: (prev: MonkDatabaseSchema) => MonkDatabaseSchema) => void;
  onCreateStrikeFromSlot: (params: {
    goalId: string;
    title: string;
    notes?: string;
    pomodoroMins: number;
    scheduledTime?: string;
    enterFocusNow?: boolean;
  }) => void;
  onEnterFocusStrike: (strike: DailyStrikeTodoEntity) => void;
  onSelectGoal: (goalId: string) => void;
  onUpdateShiftConfig: (updates: {
    mode?: WorkShiftMode;
    dayShiftStartTime?: string;
    nightShiftStartTime?: string;
    silent?: boolean;
  }) => void;
  onPopulateTodayFromSchedule: () => void;
  onSaveScheduleProfile: (name: string) => void;
  onLoadScheduleProfile: (profileId: string) => void;
  onDeleteScheduleProfile: (profileId: string) => void;
  onPlayWoodenFish: (volume?: number) => void;
  onPlayTempleBell: (volume?: number) => void;
  onShowMessage: (title: string, msg: string, type?: 'danger' | 'info' | 'seal') => void;
}

const SLOT_KIND_LABELS: Record<ScheduleSlotKind, { label: string; icon: string }> = {
  CLIMB: { label: 'Leo Đỉnh Núi', icon: '⛰️' },
  PREP_WORK: { label: 'Chuẩn Bị Đi Làm (Khóa 1h)', icon: '🎒' },
  SLEEP: { label: 'Ngủ Phục Hồi (Tính Quỹ Rảnh)', icon: '🛏️' },
  REST_ROUTINE: { label: 'Sinh Hoạt / Nghỉ Ngơi', icon: '😴' },
  BREAK_COMBO: { label: 'Nghỉ & Mẹo 1 Công Đôi Việc', icon: '⚡' },
};

export const AIScheduleView: React.FC<AIScheduleViewProps> = ({
  db,
  todayStr,
  nowTick,
  activeShiftMode,
  dayShiftStartTime,
  nightShiftStartTime,
  onPersistDb,
  onCreateStrikeFromSlot,
  onEnterFocusStrike,
  onSelectGoal,
  onUpdateShiftConfig,
  onPopulateTodayFromSchedule,
  onSaveScheduleProfile,
  onLoadScheduleProfile,
  onDeleteScheduleProfile,
  onPlayWoodenFish,
  onPlayTempleBell,
  onShowMessage,
}) => {
  const existingPlan = db.climbingSchedulePlan || null;
  const hasGeneratedDays = Boolean(
    existingPlan && Array.isArray(existingPlan.days) && existingPlan.days.length > 0
  );

  const [activeSubTab, setActiveSubTab] = useState<AIScheduleSubTab>(
    hasGeneratedDays ? 'TODAY_ACTION' : 'CONFIG_AI'
  );

  const [shiftDraft, setShiftDraft] = useState<WorkShiftMode>(
    existingPlan?.shiftMode || activeShiftMode || 'DAY'
  );
  const [strategyDraft, setStrategyDraft] = useState<ScheduleStrategyMode>(
    existingPlan?.strategyMode || 'SMART_WEEKLY_ROTATION'
  );
  const [dayWorkStartDraft, setDayWorkStartDraft] = useState<string>(
    existingPlan?.dayWorkStartTime || dayShiftStartTime || '08:00'
  );
  const [dayStartDraft, setDayStartDraft] = useState<string>(
    existingPlan?.dayShiftClimbStart || '20:00'
  );
  const [dayEndDraft, setDayEndDraft] = useState<string>(
    existingPlan?.dayShiftClimbEnd || '24:00'
  );
  const [nightReturnDraft, setNightReturnDraft] = useState<string>(
    existingPlan?.nightReturnHomeTime || '07:30'
  );
  const [nightWakeDraft, setNightWakeDraft] = useState<string>(
    existingPlan?.nightWakeUpTime || '14:30'
  );
  const [nightWorkStartDraft, setNightWorkStartDraft] = useState<string>(
    existingPlan?.nightWorkStartTime || nightShiftStartTime || '19:00'
  );
  const [maxPerDayDraft, setMaxPerDayDraft] = useState<number>(
    existingPlan?.maxMountainsPerDay || 2
  );
  const [customPromptDraft, setCustomPromptDraft] = useState<string>(
    existingPlan?.customUserPrompt || ''
  );
  const [aiEngineDraft, setAiEngineDraft] = useState<AIEngineMode>(
    existingPlan?.aiEngineMode || (existingPlan?.geminiApiKey ? 'EXTERNAL_LLM' : 'INTERNAL_SMART')
  );
  const [aiProviderDraft, setAiProviderDraft] = useState<AIProviderType>(
    existingPlan?.aiProvider || 'GEMINI'
  );
  const [aiModelDraft, setAiModelDraft] = useState<string>(
    existingPlan?.aiModel || 'auto'
  );
  const [apiKeysByProvider, setApiKeysByProvider] = useState<Partial<Record<AIProviderType, string>>>(
    () => ({
      GEMINI: existingPlan?.externalApiKeys?.GEMINI || existingPlan?.geminiApiKey || '',
      GROQ: existingPlan?.externalApiKeys?.GROQ || '',
      OPENROUTER: existingPlan?.externalApiKeys?.OPENROUTER || '',
    })
  );
  const [isTestingKey, setIsTestingKey] = useState<boolean>(false);
  const [keyTestResult, setKeyTestResult] = useState<AIConnectionTestResult | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [syncShiftToLaws, setSyncShiftToLaws] = useState<boolean>(true);
  const [autoCascadeEnabled, setAutoCascadeEnabled] = useState<boolean>(true);
  const [profileNameDraft, setProfileNameDraft] = useState<string>('');

  const currentApiKeyDraft = apiKeysByProvider[aiProviderDraft] || '';

  const todayDow = useMemo(() => getDayOfWeekFromDateStr(todayStr), [todayStr]);
  const [selectedEditorDow, setSelectedEditorDow] = useState<number>(todayDow);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [quickTaskDraftBySlot, setQuickTaskDraftBySlot] = useState<Record<string, string>>({});

  const activeGoals = useMemo(
    () => db.peakGoals.filter((g) => !g.isCompleted),
    [db.peakGoals]
  );
  const goalsById = useMemo(
    () => new Map(db.peakGoals.map((g) => [g.id, g])),
    [db.peakGoals]
  );

  const balanceInsights = useMemo(
    () => analyzeMountainBalance(db, todayStr),
    [db, todayStr]
  );

  const dayPreWorkPreview = useMemo(
    () => getPreWorkLockWindow(dayWorkStartDraft, 8 * 60),
    [dayWorkStartDraft]
  );
  const nightPreWorkPreview = useMemo(
    () => getPreWorkLockWindow(nightWorkStartDraft, 19 * 60),
    [nightWorkStartDraft]
  );

  const todayPlan = useMemo(() => {
    if (!hasGeneratedDays || !existingPlan) return null;
    return existingPlan.days.find((d) => d.dayOfWeek === todayDow) || null;
  }, [hasGeneratedDays, existingPlan, todayDow]);

  const editorDayPlan = useMemo(() => {
    if (!hasGeneratedDays || !existingPlan) return null;
    return (
      existingPlan.days.find((d) => d.dayOfWeek === selectedEditorDow) ||
      existingPlan.days[0] ||
      null
    );
  }, [hasGeneratedDays, existingPlan, selectedEditorDow]);

  const neglectedCount = useMemo(
    () => balanceInsights.filter((i) => i.status === 'NEGLECTED').length,
    [balanceInsights]
  );

  const handleTestApiKey = async () => {
    setIsTestingKey(true);
    setKeyTestResult(null);
    try {
      const res = await testExternalAIConnection(aiProviderDraft, currentApiKeyDraft, aiModelDraft);
      setKeyTestResult(res);
      if (res.ok) {
        onPlayWoodenFish(0.8);
      }
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleGenerateSchedule = async () => {
    if (activeGoals.length === 0) {
      onShowMessage(
        'CHƯA CÓ ĐỈNH NÚI NÀO ĐỂ LẬP LỊCH',
        'Hãy tạo ít nhất 1 Đỉnh Núi ở tab "1. Các Đỉnh Núi" trước khi để AI lập lịch trình cho bạn.',
        'danger'
      );
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generateScheduleWithGeminiIfConfigured(db, {
        shiftMode: shiftDraft,
        strategyMode: strategyDraft,
        dayWorkStartTime: dayWorkStartDraft,
        dayShiftClimbStart: dayStartDraft,
        dayShiftClimbEnd: dayEndDraft,
        nightReturnHomeTime: nightReturnDraft,
        nightWakeUpTime: nightWakeDraft,
        nightWorkStartTime: nightWorkStartDraft,
        maxMountainsPerDay: maxPerDayDraft,
        aiEngineMode: aiEngineDraft,
        aiProvider: aiProviderDraft,
        aiModel: aiModelDraft,
        externalApiKey: currentApiKeyDraft,
        customUserPrompt: customPromptDraft,
        geminiApiKey: apiKeysByProvider.GEMINI || '',
        todayStr,
      });

      onPersistDb((prev) => ({
        ...prev,
        climbingSchedulePlan: {
          ...result.plan,
          dayWorkStartTime: dayWorkStartDraft,
          externalApiKeys: apiKeysByProvider,
          geminiApiKey: apiKeysByProvider.GEMINI || '',
        },
      }));

      if (syncShiftToLaws) {
        onUpdateShiftConfig({
          mode: shiftDraft,
          dayShiftStartTime: dayWorkStartDraft,
          nightShiftStartTime: nightWorkStartDraft,
          silent: true,
        });
      }

      onPlayTempleBell(0.9);
      setSelectedEditorDow(todayDow);
      setEditingSlotId(null);
      setActiveSubTab('TODAY_ACTION');

      onShowMessage(
        result.usedExternalAI
          ? `🤖 AI THỰC THỤ (${aiProviderDraft} • ${result.resolvedModel || ''}) ĐÃ LẬP LỊCH!`
          : '⚙️ THUẬT TOÁN THÔNG MINH NỘI BỘ ĐÃ LẬP LỊCH 7 NGÀY!',
        result.note ||
          `Đã phân bổ lịch cho ${activeGoals.length} Đỉnh Núi theo ${
            shiftDraft === 'NIGHT'
              ? `Ca Đêm (khóa 1h trước giờ làm: ${nightPreWorkPreview.prepStartStr}–${nightPreWorkPreview.workStartStr})`
              : `Ca Ngày (khóa 1h sáng: ${dayPreWorkPreview.prepStartStr}–${dayPreWorkPreview.workStartStr})`
          }.`,
        'seal'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const updatePlanDays = (updater: (plan: AIClimbingSchedulePlan) => AIClimbingSchedulePlan) => {
    onPersistDb((prev) => {
      if (!prev.climbingSchedulePlan) return prev;
      const nextPlan = updater(prev.climbingSchedulePlan);
      return {
        ...prev,
        climbingSchedulePlan: {
          ...nextPlan,
          updatedAt: Date.now(),
        },
      };
    });
  };

  const handleUpdateSlot = (
    dayOfWeek: number,
    slotId: string,
    patch: Partial<ClimbingTimeSlotItem>,
    changedField?: 'startTime' | 'endTime' | 'pomodoroMins'
  ) => {
    updatePlanDays((plan) => ({
      ...plan,
      days: plan.days.map((d) => {
        if (d.dayOfWeek !== dayOfWeek) return d;

        const patchedSlots = d.slots.map((s) => {
          if (s.id !== slotId) return s;
          const merged = { ...s, ...patch };
          if (patch.goalId && merged.kind === 'CLIMB') {
            const gIdx = db.peakGoals.findIndex((g) => g.id === patch.goalId);
            const gObj = db.peakGoals[gIdx];
            if (gObj) {
              merged.title = `⛰️ Núi #${gIdx + 1}: ${gObj.title}`;
            }
          }
          return merged;
        });

        // Auto-Cascade downstream slots whenever a valid time or duration field is edited
        if (autoCascadeEnabled && changedField) {
          const canCascadeTime =
            changedField === 'pomodoroMins' ||
            (changedField === 'startTime' && isValidHHMM(String(patch.startTime || ''))) ||
            (changedField === 'endTime' && isValidHHMM(String(patch.endTime || '')));

          if (canCascadeTime) {
            return {
              ...d,
              slots: cascadeRecalculateDaySlots(patchedSlots, slotId, changedField, patch),
            };
          }
        }

        return { ...d, slots: patchedSlots };
      }),
    }));
  };

  const handleQuickAdjustSlotMins = (
    dayOfWeek: number,
    slot: ClimbingTimeSlotItem,
    deltaMins: number
  ) => {
    onPlayWoodenFish(0.5);
    const maxSlotMins = slot.kind === 'SLEEP' ? 16 * 60 : 8 * 60;
    const nextMins = Math.max(5, Math.min(maxSlotMins, (slot.pomodoroMins || 30) + deltaMins));
    handleUpdateSlot(dayOfWeek, slot.id, { pomodoroMins: nextMins }, 'pomodoroMins');
  };

  const handleDeleteSlot = (dayOfWeek: number, slotId: string) => {
    onPlayWoodenFish(0.5);
    updatePlanDays((plan) => ({
      ...plan,
      days: plan.days.map((d) => {
        if (d.dayOfWeek !== dayOfWeek) return d;
        const filtered = d.slots.filter((s) => s.id !== slotId);
        return {
          ...d,
          slots: autoCascadeEnabled
            ? resequenceSlotsAfterOrderChange(
                filtered,
                d.shiftMode === 'NIGHT' ? plan.nightWakeUpTime : plan.dayShiftClimbStart,
                d.shiftMode === 'NIGHT' ? nightPreWorkPreview.prepStartStr : plan.dayShiftClimbEnd
              )
            : filtered,
        };
      }),
    }));
    if (editingSlotId === slotId) setEditingSlotId(null);
  };

  const handleMoveSlot = (dayOfWeek: number, idx: number, dir: 'UP' | 'DOWN') => {
    const targetIdx = dir === 'UP' ? idx - 1 : idx + 1;
    onPlayWoodenFish(0.45);
    updatePlanDays((plan) => ({
      ...plan,
      days: plan.days.map((d) => {
        if (d.dayOfWeek !== dayOfWeek) return d;
        if (targetIdx < 0 || targetIdx >= d.slots.length) return d;
        const copy = [...d.slots];
        const tmp = copy[idx];
        copy[idx] = copy[targetIdx];
        copy[targetIdx] = tmp;
        return {
          ...d,
          slots: autoCascadeEnabled
            ? resequenceSlotsAfterOrderChange(
                copy,
                d.shiftMode === 'NIGHT' ? plan.nightWakeUpTime : plan.dayShiftClimbStart,
                d.shiftMode === 'NIGHT' ? nightPreWorkPreview.prepStartStr : plan.dayShiftClimbEnd
              )
            : copy,
        };
      }),
    }));
  };

  const handleAddSlotToDay = (dayOfWeek: number) => {
    onPlayWoodenFish(0.6);
    const defaultGoal = activeGoals[0] || db.peakGoals[0];
    const gIdx = defaultGoal ? db.peakGoals.findIndex((g) => g.id === defaultGoal.id) : -1;
    const newId = `slot-${dayOfWeek}-custom-${Date.now()}`;
    const newSlot: ClimbingTimeSlotItem = {
      id: newId,
      startTime: shiftDraft === 'NIGHT' ? nightWakeDraft : dayStartDraft,
      endTime: shiftDraft === 'NIGHT' ? nightPreWorkPreview.prepStartStr : dayEndDraft,
      kind: defaultGoal ? 'CLIMB' : 'REST_ROUTINE',
      goalId: defaultGoal?.id,
      title: defaultGoal
        ? `⛰️ Núi #${gIdx + 1}: ${defaultGoal.title}`
        : 'Khung giờ tập trung mới',
      suggestedTask: 'Công phá mục tiêu trong khung giờ này',
      pomodoroMins: 45,
    };

    updatePlanDays((plan) => ({
      ...plan,
      days: plan.days.map((d) =>
        d.dayOfWeek === dayOfWeek
          ? { ...d, slots: autoPlaceNewSlotInDay(d.slots, newSlot) }
          : d
      ),
    }));
    setEditingSlotId(newId);
  };

  const handleCreateAllTodayStrikesFromPlan = () => {
    if (!todayPlan) return;
    const climbSlots = todayPlan.slots.filter((s) => s.kind === 'CLIMB' && s.goalId);
    let createdCount = 0;

    for (const slot of climbSlots) {
      if (!slot.goalId) continue;
      const timeRange = `${slot.startTime}-${slot.endTime}`;
      const alreadyExists = db.dailyStrikes.some(
        (st) =>
          st.date === todayStr &&
          st.goalId === slot.goalId &&
          (st.scheduledTime === timeRange || st.title === (slot.suggestedTask || slot.title))
      );
      if (alreadyExists) continue;

      onCreateStrikeFromSlot({
        goalId: slot.goalId,
        title: slot.suggestedTask || `Công phá ${slot.title}`,
        notes: slot.notes || `Theo kế hoạch AI khung giờ ${timeRange}`,
        pomodoroMins: Math.max(5, Math.min(180, slot.pomodoroMins || 45)),
        scheduledTime: timeRange,
        enterFocusNow: false,
      });
      createdCount++;
    }

    if (createdCount > 0) {
      onPlayTempleBell(0.85);
      onShowMessage(
        `⚡ ĐÃ LÊN ${createdCount} TODO CÔNG PHÁ HÔM NAY TỪ KẾ HOẠCH`,
        'Mọi đỉnh núi trong lịch hôm nay đã sẵn sàng Todo Công Phá. Hãy bấm "Vào Tập Trung" ở từng khung giờ để chiến đấu!',
        'seal'
      );
    } else {
      onShowMessage(
        'ĐÃ CÓ ĐỦ CÔNG PHÁ CHO HÔM NAY',
        'Các khung giờ leo núi hôm nay đều đã có Todo Công Phá tương ứng rồi.',
        'info'
      );
    }
  };

  return (
    <section className="module-block">
      <div className="zen-card">
        <div className="section-header-row" style={{ marginBottom: 10 }}>
          <div style={{ flex: '1 1 440px', minWidth: 0 }}>
            <span className="zen-tag-red">CHIẾN LƯỢC GIA AI &amp; LỊCH TRÌNH THEO CA</span>
            <h2 className="section-title" style={{ marginTop: 6 }}>
              🤖 Lịch Trình Leo Núi Thông Minh (Ca Ngày / Ca Đêm)
            </h2>
          </div>

          {hasGeneratedDays && (
            <button
              type="button"
              className="zen-btn zen-btn-seal"
              onClick={handleCreateAllTodayStrikesFromPlan}
            >
              <Zap size={15} />
              <span>⚡ Tạo Toàn Bộ Công Phá Hôm Nay</span>
            </button>
          )}
        </div>

        <TabPurposeBanner
          purpose="Lập lịch 7 ngày cân bằng toàn bộ các Đỉnh Núi theo đúng giờ đi làm Ca Ngày / Ca Đêm (tự động khóa 1 tiếng trước giờ đi làm) để mở máy ra là biết làm ngay việc gì."
          steps={[
            'Chọn giờ đi làm & Tạo lịch bằng AI',
            'Vào Thực Chiến Hôm Nay để chiến Pomodoro',
            'Đổi giờ 1 khung bất kỳ → Các khung sau tự nối tiếp',
          ]}
        />

        {/* 3 CLEAN SUB-TABS */}
        <div className="laws-subtabs-bar" role="tablist" aria-label="Phân mục Lịch Trình AI">
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'TODAY_ACTION'}
            className={`laws-subtab-btn ${activeSubTab === 'TODAY_ACTION' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('TODAY_ACTION')}
          >
            <div className="laws-subtab-top">
              <Zap size={16} />
              <span className="laws-subtab-name">1. Thực Chiến Hôm Nay</span>
            </div>
            <span className={`laws-subtab-pill ${hasGeneratedDays ? 'pill-ok' : 'pill-warn'}`}>
              {hasGeneratedDays && todayPlan
                ? `${WEEKDAY_LABELS[todayDow]} • ${
                    todayPlan.slots.filter((s) => s.kind === 'CLIMB').length
                  } chặng leo núi`
                : 'Chưa tạo lịch'}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'WEEK_EDITOR'}
            className={`laws-subtab-btn ${activeSubTab === 'WEEK_EDITOR' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('WEEK_EDITOR')}
          >
            <div className="laws-subtab-top">
              <Calendar size={16} />
              <span className="laws-subtab-name">2. Chỉnh Sửa Lịch 7 Ngày</span>
            </div>
            <span className="laws-subtab-pill pill-gold">
              ⚡ Tự nối tiếp khung giờ
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'CONFIG_AI'}
            className={`laws-subtab-btn ${activeSubTab === 'CONFIG_AI' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('CONFIG_AI')}
          >
            <div className="laws-subtab-top">
              <Sliders size={16} />
              <span className="laws-subtab-name">3. Thiết Lập Ca &amp; Tạo Lịch AI</span>
            </div>
            <span
              className={`laws-subtab-pill ${
                neglectedCount > 0 ? 'pill-warn' : 'pill-neutral'
              }`}
            >
              {shiftDraft === 'NIGHT'
                ? `🌙 Vào ca ${nightWorkStartDraft}`
                : `☀️ Vào ca ${dayWorkStartDraft}`}{' '}
              {neglectedCount > 0 ? `• ${neglectedCount} núi lơ là` : ''}
            </span>
          </button>
        </div>

        {/* SUB-TAB 1: TODAY ACTION */}
        {activeSubTab === 'TODAY_ACTION' && (
          <div className="laws-tabpanel page-fade-in">
            {!hasGeneratedDays || !existingPlan ? (
              <div className="empty-state-box" style={{ padding: '36px 22px', textAlign: 'center' }}>
                <Mountain size={42} color="#A8D8C6" style={{ margin: '0 auto 10px' }} />
                <h3 style={{ fontSize: 18, marginBottom: 6 }}>
                  Chưa có Lịch Trình Tuần Nào Được Tạo
                </h3>
                <p className="zen-muted-text" style={{ maxWidth: 560, margin: '0 auto 16px' }}>
                  Hãy sang tab <strong>“3. Thiết Lập Ca &amp; Tạo Lịch AI”</strong> để chọn giờ vào ca
                  và bấm tạo lịch 7 ngày trong tích tắc.
                </p>
                <button
                  type="button"
                  className="zen-btn zen-btn-seal"
                  onClick={() => setActiveSubTab('CONFIG_AI')}
                >
                  <Sliders size={15} /> Mở Thiết Lập Ca &amp; Tạo Lịch Ngay →
                </button>
              </div>
            ) : (
              <>
                <div className="section-header-row" style={{ marginBottom: 14 }}>
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="zen-tag-red">
                        CHỈ NAM HÔM NAY ({WEEKDAY_LABELS[todayDow].toUpperCase()} — {todayStr})
                      </span>
                      <span className="time-window-pill">
                        {existingPlan.aiEngineMode === 'EXTERNAL_LLM' && existingPlan.aiResolvedModel
                          ? `🤖 Nguồn: ${existingPlan.aiProvider} (${existingPlan.aiResolvedModel})`
                          : '⚙️ Nguồn: Thuật Toán Chuyên Gia Nội Bộ'}
                      </span>
                    </div>
                    <p className="zen-muted-text" style={{ fontSize: 13.5, marginTop: 8 }}>
                      <Sparkles
                        size={14}
                        style={{ display: 'inline', marginRight: 5, color: '#f0c878' }}
                      />
                      <strong>Chiến lược tuần này:</strong> {existingPlan.aiReasoningSummary}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="zen-btn zen-btn-seal"
                      style={{ fontSize: 12.5 }}
                      onClick={onPopulateTodayFromSchedule}
                      title="Tự động tạo toàn bộ Todo Công Phá cho các khung leo núi hôm nay (bỏ qua khung đã tạo để không trùng)"
                    >
                      <Zap size={14} /> ⚡ Đổ Toàn Bộ Lịch Hôm Nay Thành Todo
                    </button>
                    <button
                      type="button"
                      className="zen-btn zen-btn-outline"
                      style={{ fontSize: 12.5 }}
                      onClick={() => setActiveSubTab('WEEK_EDITOR')}
                    >
                      <Edit3 size={14} /> Chỉnh Khung Giờ →
                    </button>
                  </div>
                </div>

                {(db.savedScheduleProfiles || []).length > 0 && (
                  <div className="schedule-profiles-strip" style={{ marginBottom: 14 }}>
                    <span style={{ fontSize: 12, color: '#B8B4A9', fontWeight: 700 }}>
                      📂 Đổi nhanh Mẫu Lịch Theo Ca:
                    </span>
                    {(db.savedScheduleProfiles || []).map((prof) => (
                      <button
                        key={prof.id}
                        type="button"
                        className={`pomo-preset-btn ${
                          existingPlan?.id === prof.plan?.id ? 'active' : ''
                        }`}
                        onClick={() => onLoadScheduleProfile(prof.id)}
                        title={`Áp dụng "${prof.name}" & tự đồng bộ ca làm việc`}
                      >
                        {prof.shiftMode === 'NIGHT' ? '🌙' : '☀️'} {prof.name}
                      </button>
                    ))}
                  </div>
                )}

                {existingPlan.aiCoachingTips && existingPlan.aiCoachingTips.length > 0 && (
                  <div className="ai-coaching-tips-strip">
                    <div className="ai-coaching-tips-head">
                      <Lightbulb size={15} color="#f0c878" />
                      <strong>Chiến Thuật Ghép Việc &amp; Tối Ưu Năng Lượng:</strong>
                    </div>
                    <div className="ai-coaching-tips-grid">
                      {existingPlan.aiCoachingTips.map((tip, idx) => (
                        <div key={idx} className="ai-coaching-tip-card">
                          <CheckCircle2
                            size={14}
                            color="#7DBFA8"
                            style={{ flexShrink: 0, marginTop: 2 }}
                          />
                          <span>{tip}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!todayPlan || todayPlan.slots.length === 0 ? (
                  <div className="empty-state-box" style={{ padding: 24, textAlign: 'center' }}>
                    Hôm nay ({WEEKDAY_LABELS[todayDow]}) chưa có khung giờ nào. Hãy thêm tại tab
                    Chỉnh Sửa Lịch 7 Ngày.
                  </div>
                ) : (
                  <div className="ai-today-timeline-list">
                    {todayPlan.slots.map((slot) => {
                      const isNow = isSlotActiveNow(slot, nowTick);
                      const linkedGoal = slot.goalId ? goalsById.get(slot.goalId) : null;
                      const timeRange = `${slot.startTime}-${slot.endTime}`;
                      const todayGoalStrikes = linkedGoal
                        ? db.dailyStrikes.filter(
                            (s) => s.goalId === linkedGoal.id && s.date === todayStr
                          )
                        : [];
                      const draftTitle = quickTaskDraftBySlot[slot.id] ?? '';

                      return (
                        <div
                          key={slot.id}
                          className={`ai-today-slot-card kind-${slot.kind.toLowerCase()} ${
                            isNow ? 'is-active-now' : ''
                          }`}
                        >
                          <div className="ai-slot-time-col">
                            <div className="ai-slot-clock">
                              {slot.startTime} – {slot.endTime}
                            </div>
                            <span className="pomo-pill">{formatDurationHM(slot.pomodoroMins)}</span>
                            {isNow && <span className="ai-now-live-pill">🔥 ĐANG TRONG GIỜ</span>}
                          </div>

                          <div className="ai-slot-body-col">
                            <div className="ai-slot-kind-row">
                              <span className="zen-tag-red">
                                {SLOT_KIND_LABELS[slot.kind].icon} {SLOT_KIND_LABELS[slot.kind].label}
                              </span>
                              {linkedGoal && (
                                <button
                                  type="button"
                                  className="link-mini-btn"
                                  onClick={() => onSelectGoal(linkedGoal.id)}
                                >
                                  Mở Đỉnh Núi &rarr;
                                </button>
                              )}
                            </div>

                            <h4 className="ai-slot-title">{slot.title}</h4>
                            {slot.suggestedTask && (
                              <p className="ai-slot-suggested">
                                <strong>Gợi ý:</strong> {slot.suggestedTask}
                              </p>
                            )}
                            {slot.notes && (
                              <p className="zen-muted-text" style={{ fontSize: 12.5, marginTop: 2 }}>
                                {slot.notes}
                              </p>
                            )}

                            {slot.kind === 'CLIMB' && linkedGoal && (
                              <div className="ai-slot-execution-area">
                                {todayGoalStrikes.length > 0 && (
                                  <div className="ai-slot-existing-strikes">
                                    {todayGoalStrikes.map((st) => (
                                      <div key={st.id} className="ai-mini-strike-row">
                                        <span>
                                          {st.status === 'COMPLETED' ? '✅' : '⚔️'} {st.title}{' '}
                                          <small className="zen-muted-text">
                                            ({st.completedPomodoroMins || 0}/{st.requiredPomodoroMins}p)
                                          </small>
                                        </span>
                                        <button
                                          type="button"
                                          className="zen-btn zen-btn-seal"
                                          style={{ padding: '4px 10px', fontSize: 11.5 }}
                                          onClick={() => onEnterFocusStrike(st)}
                                        >
                                          <Play size={12} />
                                          <span>
                                            {st.savedPomoSecondsLeft != null &&
                                            st.savedPomoTotalSeconds != null &&
                                            st.savedPomoSecondsLeft < st.savedPomoTotalSeconds
                                              ? 'Tiếp Tục Pomodoro'
                                              : 'Vào Tập Trung'}
                                          </span>
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                <div className="ai-slot-quick-add">
                                  <input
                                    type="text"
                                    className="zen-input"
                                    style={{ flex: 1, padding: '6px 10px', fontSize: 13 }}
                                    placeholder={`Nhập Công Phá cụ thể (hoặc bỏ trống để dùng gợi ý: "${(
                                      slot.suggestedTask || slot.title
                                    ).slice(0, 42)}...")`}
                                    value={draftTitle}
                                    onChange={(e) =>
                                      setQuickTaskDraftBySlot((prev) => ({
                                        ...prev,
                                        [slot.id]: e.target.value,
                                      }))
                                    }
                                  />
                                  <button
                                    type="button"
                                    className="zen-btn zen-btn-outline"
                                    style={{ padding: '6px 11px', fontSize: 12.5 }}
                                    onClick={() => {
                                      const finalTitle =
                                        draftTitle.trim() ||
                                        slot.suggestedTask ||
                                        `Công phá ${linkedGoal.title}`;
                                      onCreateStrikeFromSlot({
                                        goalId: linkedGoal.id,
                                        title: finalTitle,
                                        notes: slot.notes || `Lịch AI khung giờ ${timeRange}`,
                                        pomodoroMins: Math.max(
                                          5,
                                          Math.min(180, slot.pomodoroMins || 45)
                                        ),
                                        scheduledTime: timeRange,
                                        enterFocusNow: false,
                                      });
                                      setQuickTaskDraftBySlot((prev) => ({
                                        ...prev,
                                        [slot.id]: '',
                                      }));
                                    }}
                                  >
                                    <Plus size={14} /> Lên Công Phá
                                  </button>
                                  <button
                                    type="button"
                                    className="zen-btn zen-btn-seal"
                                    style={{ padding: '6px 11px', fontSize: 12.5 }}
                                    onClick={() => {
                                      const finalTitle =
                                        draftTitle.trim() ||
                                        slot.suggestedTask ||
                                        `Công phá ${linkedGoal.title}`;
                                      onCreateStrikeFromSlot({
                                        goalId: linkedGoal.id,
                                        title: finalTitle,
                                        notes: slot.notes || `Lịch AI khung giờ ${timeRange}`,
                                        pomodoroMins: Math.max(
                                          5,
                                          Math.min(180, slot.pomodoroMins || 45)
                                        ),
                                        scheduledTime: timeRange,
                                        enterFocusNow: true,
                                      });
                                      setQuickTaskDraftBySlot((prev) => ({
                                        ...prev,
                                        [slot.id]: '',
                                      }));
                                    }}
                                  >
                                    <Swords size={14} /> Lên &amp; Chiến Ngay
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* SUB-TAB 2: 7-DAY EDITABLE PLANNER WITH AUTO-CASCADE */}
        {activeSubTab === 'WEEK_EDITOR' && (
          <div className="laws-tabpanel page-fade-in">
            {!hasGeneratedDays || !existingPlan ? (
              <div className="empty-state-box" style={{ padding: '36px 22px', textAlign: 'center' }}>
                <Calendar size={40} color="#A8D8C6" style={{ margin: '0 auto 10px' }} />
                <p className="zen-muted-text" style={{ marginBottom: 14 }}>
                  Chưa có bảng lịch tuần 7 ngày nào để chỉnh sửa.
                </p>
                <button
                  type="button"
                  className="zen-btn zen-btn-seal"
                  onClick={() => setActiveSubTab('CONFIG_AI')}
                >
                  <Sliders size={15} /> Sang Tab Tạo Lịch Trình AI →
                </button>
              </div>
            ) : (
              <>
                <div className="ai-cascade-bar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <Zap size={16} color="#f0c878" />
                    <span style={{ fontSize: 13, color: '#F6F4EE' }}>
                      <strong>Tự động nối tiếp thông minh (Auto-Cascade):</strong> Đổi giờ xong hoặc
                      thời lượng 1 khung → toàn bộ các việc phía sau tự động dời giờ nối tiếp ngay lập
                      tức (luôn né khung khóa 1h đi làm).
                    </span>
                  </div>

                  <label className="settings-toggle-row" style={{ padding: '5px 10px', flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={autoCascadeEnabled}
                      onChange={(e) => setAutoCascadeEnabled(e.target.checked)}
                    />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#a8d8c6' }}>
                      {autoCascadeEnabled ? '⚡ Auto-Cascade: BẬT' : 'Chỉnh tay độc lập'}
                    </span>
                  </label>
                </div>

                {/* 7-Day Compact Overview Matrix */}
                <div className="ai-week-overview-strip">
                  {WEEKDAY_ORDER.map((dow) => {
                    const dayObj = existingPlan.days.find((d) => d.dayOfWeek === dow);
                    const climbSlots = (dayObj?.slots || []).filter((s) => s.kind === 'CLIMB');
                    const isToday = dow === todayDow;
                    const isSelected = dow === selectedEditorDow;
                    return (
                      <button
                        key={dow}
                        type="button"
                        className={`ai-week-day-pill ${isSelected ? 'active' : ''} ${
                          isToday ? 'is-today' : ''
                        }`}
                        onClick={() => {
                          setSelectedEditorDow(dow);
                          setEditingSlotId(null);
                        }}
                      >
                        <div className="ai-wdp-top">
                          <strong>{WEEKDAY_LABELS[dow]}</strong>
                          {isToday && <span className="ai-today-dot">Hôm nay</span>}
                        </div>
                        <div className="ai-wdp-summary">
                          {climbSlots.length === 0 ? (
                            <span>Nghỉ / Tổng kết</span>
                          ) : (
                            climbSlots.map((cs) => {
                              const g = cs.goalId ? goalsById.get(cs.goalId) : null;
                              const gIdx = cs.goalId
                                ? db.peakGoals.findIndex((pg) => pg.id === cs.goalId) + 1
                                : 0;
                              return (
                                <div key={cs.id} className="ai-wdp-mountain-tag">
                                  {g ? `Núi #${gIdx}: ${g.title.slice(0, 16)}` : cs.title.slice(0, 18)}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Selected Day Detailed Editor */}
                {editorDayPlan && (
                  <div className="ai-day-editor-panel">
                    <div className="ai-day-editor-header">
                      <div>
                        <h4 style={{ fontSize: 18, color: '#F6F4EE' }}>
                          <Calendar size={17} style={{ display: 'inline', marginRight: 6 }} />
                          Chi tiết lịch: {editorDayPlan.dayLabel}
                          {editorDayPlan.dayOfWeek === todayDow ? ' (Hôm Nay)' : ''}
                        </h4>
                      </div>

                      <button
                        type="button"
                        className="zen-btn zen-btn-seal"
                        style={{ fontSize: 12.5 }}
                        onClick={() => handleAddSlotToDay(editorDayPlan.dayOfWeek)}
                      >
                        <Plus size={15} />
                        <span>+ Thêm Khung Giờ Mới</span>
                      </button>
                    </div>

                    <div className="ai-editor-slots-list">
                      {editorDayPlan.slots.map((slot, idx) => {
                        const isEditing = editingSlotId === slot.id;
                        return (
                          <div
                            key={slot.id}
                            className={`ai-editor-slot-row kind-${slot.kind.toLowerCase()}`}
                          >
                            {!isEditing ? (
                              <div className="ai-editor-slot-view">
                                <div className="ai-editor-slot-left">
                                  <span className="time-window-pill">
                                    {slot.startTime} – {slot.endTime}
                                  </span>
                                  <span className="pomo-pill">{formatDurationHM(slot.pomodoroMins)}</span>
                                  <span className="zen-tag-red">
                                    {SLOT_KIND_LABELS[slot.kind].icon}{' '}
                                    {SLOT_KIND_LABELS[slot.kind].label}
                                  </span>
                                  <div>
                                    <strong style={{ color: '#F6F4EE', fontSize: 14.5 }}>
                                      {slot.title}
                                    </strong>
                                    {slot.suggestedTask && (
                                      <div className="zen-muted-text" style={{ fontSize: 12.5 }}>
                                        Gợi ý: {slot.suggestedTask}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="ai-editor-slot-actions">
                                  {slot.kind !== 'PREP_WORK' && (
                                    <>
                                      <button
                                        type="button"
                                        className="ai-step-mini-btn"
                                        title="Giảm 15 phút & tự dồn các việc sau lên sớm hơn"
                                        onClick={() =>
                                          handleQuickAdjustSlotMins(editorDayPlan.dayOfWeek, slot, -15)
                                        }
                                      >
                                        -15p
                                      </button>
                                      <button
                                        type="button"
                                        className="ai-step-mini-btn"
                                        title="Tăng 15 phút & tự lùi các việc sau nối tiếp"
                                        onClick={() =>
                                          handleQuickAdjustSlotMins(editorDayPlan.dayOfWeek, slot, 15)
                                        }
                                      >
                                        +15p
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    className="ritual-mini-icon-btn"
                                    disabled={idx === 0}
                                    title="Đưa lên (tự tính lại giờ)"
                                    onClick={() => handleMoveSlot(editorDayPlan.dayOfWeek, idx, 'UP')}
                                  >
                                    <ArrowUp size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    className="ritual-mini-icon-btn"
                                    disabled={idx === editorDayPlan.slots.length - 1}
                                    title="Đưa xuống (tự tính lại giờ)"
                                    onClick={() => handleMoveSlot(editorDayPlan.dayOfWeek, idx, 'DOWN')}
                                  >
                                    <ArrowDown size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    className="zen-btn zen-btn-outline"
                                    style={{ padding: '4px 10px', fontSize: 12 }}
                                    onClick={() => setEditingSlotId(slot.id)}
                                  >
                                    <Edit3 size={13} /> Sửa
                                  </button>
                                  <button
                                    type="button"
                                    className="ritual-mini-icon-btn"
                                    style={{ color: '#ff8a80' }}
                                    title="Xóa khung giờ (tự nối lại giờ các việc sau)"
                                    onClick={() => handleDeleteSlot(editorDayPlan.dayOfWeek, slot.id)}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="ai-editor-slot-form">
                                <div className="ai-editor-form-grid">
                                  <div>
                                    <label className="zen-label">Loại khung giờ</label>
                                    <select
                                      className="zen-input"
                                      style={{ width: '100%' }}
                                      value={slot.kind}
                                      onChange={(e) =>
                                        handleUpdateSlot(editorDayPlan.dayOfWeek, slot.id, {
                                          kind: e.target.value as ScheduleSlotKind,
                                        })
                                      }
                                    >
                                      {(Object.keys(SLOT_KIND_LABELS) as ScheduleSlotKind[]).map((k) => (
                                        <option key={k} value={k}>
                                          {SLOT_KIND_LABELS[k].icon} {SLOT_KIND_LABELS[k].label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  {slot.kind === 'CLIMB' && (
                                    <div>
                                      <label className="zen-label">Chọn Đỉnh Núi</label>
                                      <select
                                        className="zen-input"
                                        style={{ width: '100%' }}
                                        value={slot.goalId || ''}
                                        onChange={(e) =>
                                          handleUpdateSlot(editorDayPlan.dayOfWeek, slot.id, {
                                            goalId: e.target.value,
                                          })
                                        }
                                      >
                                        <option value="">-- Chọn đỉnh núi --</option>
                                        {db.peakGoals.map((g, gIdx) => (
                                          <option key={g.id} value={g.id}>
                                            ⛰️ Núi #{gIdx + 1}: {g.title}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  )}

                                  <div>
                                    <label className="zen-label">Bắt đầu</label>
                                    <input
                                      type="time"
                                      className="zen-input"
                                      style={{ width: '100%' }}
                                      value={slot.startTime}
                                      onChange={(e) =>
                                        handleUpdateSlot(
                                          editorDayPlan.dayOfWeek,
                                          slot.id,
                                          { startTime: e.target.value },
                                          'startTime'
                                        )
                                      }
                                    />
                                  </div>

                                  <div>
                                    <label className="zen-label">Kết thúc (tự đẩy task sau)</label>
                                    <div style={{ display: 'flex', gap: 5 }}>
                                      <input
                                        type="time"
                                        className="zen-input"
                                        style={{ width: '100%' }}
                                        value={slot.endTime === '24:00' ? '23:59' : slot.endTime}
                                        onChange={(e) =>
                                          handleUpdateSlot(
                                            editorDayPlan.dayOfWeek,
                                            slot.id,
                                            { endTime: e.target.value },
                                            'endTime'
                                          )
                                        }
                                      />
                                      <button
                                        type="button"
                                        className="ai-step-mini-btn"
                                        title="Đặt kết thúc lúc 24:00"
                                        onClick={() =>
                                          handleUpdateSlot(
                                            editorDayPlan.dayOfWeek,
                                            slot.id,
                                            { endTime: '24:00' },
                                            'endTime'
                                          )
                                        }
                                      >
                                        24h
                                      </button>
                                    </div>
                                  </div>

                                  <div>
                                    <label className="zen-label">
                                      Thời lượng (Tiếng &amp; Phút &rarr;{' '}
                                      <strong style={{ color: '#A8D8C6' }}>
                                        {formatDurationHM(slot.pomodoroMins)}
                                      </strong>
                                      )
                                    </label>
                                    <DurationHMInput
                                      valueMins={slot.pomodoroMins}
                                      minMins={5}
                                      maxHours={slot.kind === 'SLEEP' ? 16 : 8}
                                      onChangeMins={(nextMins) =>
                                        handleUpdateSlot(
                                          editorDayPlan.dayOfWeek,
                                          slot.id,
                                          { pomodoroMins: nextMins },
                                          'pomodoroMins'
                                        )
                                      }
                                    />
                                  </div>
                                </div>

                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr',
                                    gap: 10,
                                    marginTop: 10,
                                  }}
                                >
                                  <div>
                                    <label className="zen-label">Tiêu đề khung giờ</label>
                                    <input
                                      type="text"
                                      className="zen-input"
                                      style={{ width: '100%' }}
                                      value={slot.title}
                                      onChange={(e) =>
                                        handleUpdateSlot(editorDayPlan.dayOfWeek, slot.id, {
                                          title: e.target.value,
                                        })
                                      }
                                    />
                                  </div>
                                  <div>
                                    <label className="zen-label">Gợi ý Công Phá / Ghi chú</label>
                                    <input
                                      type="text"
                                      className="zen-input"
                                      style={{ width: '100%' }}
                                      value={slot.suggestedTask || ''}
                                      onChange={(e) =>
                                        handleUpdateSlot(editorDayPlan.dayOfWeek, slot.id, {
                                          suggestedTask: e.target.value,
                                        })
                                      }
                                    />
                                  </div>
                                </div>

                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'flex-end',
                                    gap: 8,
                                    marginTop: 10,
                                  }}
                                >
                                  <button
                                    type="button"
                                    className="zen-btn zen-btn-seal"
                                    style={{ padding: '6px 14px', fontSize: 12.5 }}
                                    onClick={() => setEditingSlotId(null)}
                                  >
                                    <Check size={14} /> Xong Khung Giờ Này
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* SUB-TAB 3: SHIFT CONFIG & AI GENERATOR */}
        {activeSubTab === 'CONFIG_AI' && (
          <div className="laws-tabpanel page-fade-in">
            {/* BLOCK 1: MOUNTAIN BALANCE DIAGNOSTICS */}
            <div className="ai-balance-panel">
              <div className="ai-panel-subtitle">
                <span>
                  📊 1. CÂN BẰNG CÁC ĐỈNH NÚI HIỆN TẠI ({activeGoals.length} Đỉnh Đang Leo)
                </span>
              </div>

              {balanceInsights.length === 0 ? (
                <div className="empty-state-box" style={{ padding: '20px', textAlign: 'center' }}>
                  Bạn chưa có Đỉnh Núi nào đang hoạt động. Hãy qua tab{' '}
                  <strong>1. Các Đỉnh Núi</strong> để dựng mục tiêu trước.
                </div>
              ) : (
                <div className="ai-balance-grid">
                  {balanceInsights.map((item) => (
                    <div
                      key={item.goal.id}
                      className={`ai-balance-card status-${item.status.toLowerCase()}`}
                    >
                      <div className="ai-balance-card-top">
                        <strong
                          style={{ color: '#F6F4EE', cursor: 'pointer' }}
                          onClick={() => onSelectGoal(item.goal.id)}
                          title="Bấm để vào thẳng Đỉnh Núi này"
                        >
                          ⛰️ Núi #{item.indexNumber}: {item.goal.title}
                        </strong>
                        <span className={`ai-balance-badge badge-${item.status.toLowerCase()}`}>
                          {item.status === 'OVER_FOCUSED'
                            ? '⚠️ Dồn quá nhiều'
                            : item.status === 'NEGLECTED'
                            ? '🚨 Bị bỏ quên'
                            : '✅ Cân bằng'}
                        </span>
                      </div>

                      <div className="zen-progress-track" style={{ height: 8, margin: '8px 0' }}>
                        <div
                          className="zen-progress-fill"
                          style={{
                            width: `${Math.max(4, item.sharePct)}%`,
                            background:
                              item.status === 'OVER_FOCUSED'
                                ? '#ffb74d'
                                : item.status === 'NEGLECTED'
                                ? '#ff7043'
                                : '#5BAE93',
                          }}
                        />
                      </div>

                      <div className="ai-balance-meta">
                        <span>
                          Tỷ trọng: <strong>{item.sharePct}%</strong>
                        </span>
                        <span>
                          Tập trung: <strong>{item.totalPomoMins}p</strong> (7 ngày:{' '}
                          {item.recent7DaysMins}p)
                        </span>
                        <span>
                          {item.lastWorkedDate ? `Gần nhất: ${item.lastWorkedDate}` : 'Chưa leo gần đây'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* BLOCK 2: FLEXIBLE SHIFT CONFIG & STRATEGY */}
            <div className="ai-generator-config-box">
              <div className="ai-panel-subtitle">
                <span>
                  ⚙️ 2. GIỜ VÀO CA LINH HOẠT &amp; KHÓA CỨNG 1 TIẾNG TRƯỚC KHI ĐI LÀM
                </span>
              </div>

              <div className="ai-shift-selector-grid">
                <button
                  type="button"
                  className={`ai-shift-choice-card ${shiftDraft === 'DAY' ? 'active' : ''}`}
                  onClick={() => setShiftDraft('DAY')}
                >
                  <div className="ai-shift-card-head">
                    <Sun size={20} color="#ffb74d" />
                    <strong>☀️ Đi Làm Ca Ngày</strong>
                    {shiftDraft === 'DAY' && <span className="zen-tag-red">ĐANG CHỌN</span>}
                  </div>
                  <p>
                    Linh hoạt chọn giờ vào làm sáng (7h, 8h...). Tự động khóa cứng 1 tiếng trước giờ
                    đi làm, buổi tối leo núi theo khung giờ bạn đặt.
                  </p>
                </button>

                <button
                  type="button"
                  className={`ai-shift-choice-card ${shiftDraft === 'NIGHT' ? 'active' : ''}`}
                  onClick={() => setShiftDraft('NIGHT')}
                >
                  <div className="ai-shift-card-head">
                    <Moon size={20} color="#f0c878" />
                    <strong>🌙 Đi Làm Ca Đêm</strong>
                    {shiftDraft === 'NIGHT' && <span className="zen-tag-red">ĐANG CHỌN</span>}
                  </div>
                  <p>
                    Linh hoạt giờ vào ca tối (19h, 20h, 21h...). Tự động lùi khóa cứng 1 tiếng trước giờ
                    vào làm để chuẩn bị, thời gian trước đó leo núi hết công suất.
                  </p>
                </button>
              </div>

              {/* Flexible Shift Time Inputs */}
              {shiftDraft === 'DAY' ? (
                <div className="ai-night-shift-panel">
                  <div className="ai-time-inputs-row">
                    <div>
                      <label className="zen-label">Giờ bắt đầu đi làm Ca Ngày (7h, 8h...)</label>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="time"
                          className="zen-input"
                          value={dayWorkStartDraft}
                          onChange={(e) => setDayWorkStartDraft(e.target.value)}
                        />
                        {['07:00', '07:30', '08:00', '08:30', '09:00'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            className={`pomo-preset-btn ${
                              dayWorkStartDraft === preset ? 'active' : ''
                            }`}
                            onClick={() => setDayWorkStartDraft(preset)}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="zen-label">Bắt đầu leo núi (buổi tối)</label>
                      <input
                        type="time"
                        className="zen-input"
                        value={dayStartDraft}
                        onChange={(e) => setDayStartDraft(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="zen-label">Kết thúc leo núi (VD 23:59 / 24:00)</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          type="text"
                          className="zen-input"
                          style={{ width: 96 }}
                          value={dayEndDraft}
                          onChange={(e) => setDayEndDraft(e.target.value)}
                          placeholder="24:00"
                        />
                        <button
                          type="button"
                          className="pomo-preset-btn"
                          onClick={() => {
                            setDayStartDraft('20:00');
                            setDayEndDraft('24:00');
                          }}
                        >
                          20h–24h
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="ai-night-rule-callout">
                    <Clock size={16} color="#ffb74d" />
                    <span>
                      Tự động khóa cứng 1 tiếng sáng chuẩn bị đi làm:{' '}
                      <strong style={{ color: '#ffb74d' }}>
                        {dayPreWorkPreview.prepStartStr} – {dayPreWorkPreview.workStartStr} (Không leo
                        núi)
                      </strong>{' '}
                      &rarr; Khung giờ vàng leo núi buổi tối:{' '}
                      <strong style={{ color: '#81c784' }}>
                        {dayStartDraft} – {dayEndDraft}
                      </strong>
                      .
                    </span>
                  </div>
                </div>
              ) : (
                <div className="ai-night-shift-panel">
                  <div className="ai-time-inputs-row">
                    <div>
                      <label className="zen-label">Giờ sáng về nhà (Tắm rửa, giặt đồ)</label>
                      <input
                        type="time"
                        className="zen-input"
                        value={nightReturnDraft}
                        onChange={(e) => setNightReturnDraft(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="zen-label">Giờ chiều dậy bắt đầu leo núi</label>
                      <input
                        type="time"
                        className="zen-input"
                        value={nightWakeDraft}
                        onChange={(e) => setNightWakeDraft(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="zen-label">Giờ vào ca Ca Đêm (19h, 20h...)</label>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="time"
                          className="zen-input"
                          value={nightWorkStartDraft}
                          onChange={(e) => setNightWorkStartDraft(e.target.value)}
                        />
                        {['18:00', '19:00', '20:00', '21:00', '22:00'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            className={`pomo-preset-btn ${
                              nightWorkStartDraft === preset ? 'active' : ''
                            }`}
                            onClick={() => setNightWorkStartDraft(preset)}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="ai-night-rule-callout">
                    <Clock size={16} color="#f0c878" />
                    <span>
                      Về <strong>{nightReturnDraft}</strong> tắm giặt &amp; ngủ tới{' '}
                      <strong>{nightWakeDraft}</strong> &rarr; Khung leo núi phủ kín:{' '}
                      <strong style={{ color: '#81c784' }}>
                        {nightWakeDraft} – {nightPreWorkPreview.prepStartStr}
                      </strong>{' '}
                      &rarr; Tự khóa cứng 1 tiếng trước giờ vào ca:{' '}
                      <strong style={{ color: '#ffb74d' }}>
                        {nightPreWorkPreview.prepStartStr} – {nightPreWorkPreview.workStartStr} (Không
                        leo núi)
                      </strong>
                      .
                    </span>
                  </div>
                </div>
              )}

              {/* Strategy & Custom Prompt */}
              <div className="ai-strategy-grid">
                <div>
                  <label className="zen-label">Chiến lược chia lịch các Đỉnh Núi</label>
                  <select
                    className="zen-input"
                    style={{ width: '100%' }}
                    value={strategyDraft}
                    onChange={(e) => setStrategyDraft(e.target.value as ScheduleStrategyMode)}
                  >
                    <option value="SMART_WEEKLY_ROTATION">
                      🔄 Xoay vòng thông minh trong tuần (VD: T2 leo núi 1 &amp; 3, T3 leo núi 2 &amp; 4...)
                    </option>
                    <option value="DAILY_ALL_PEAKS">
                      ⛰️ Đảm bảo tất cả các Đỉnh Núi đều có mặt trong khung giờ mỗi ngày
                    </option>
                    <option value="NEGLECTED_PRIORITY">
                      🚨 Ưu tiên kéo lại các Đỉnh Núi đang bị lơ là nhiều hơn
                    </option>
                  </select>
                </div>

                {strategyDraft !== 'DAILY_ALL_PEAKS' && (
                  <div>
                    <label className="zen-label">Số Đỉnh Núi tối đa mỗi ngày</label>
                    <select
                      className="zen-input"
                      style={{ width: '100%' }}
                      value={maxPerDayDraft}
                      onChange={(e) => setMaxPerDayDraft(Number(e.target.value))}
                    >
                      <option value={1}>1 Đỉnh Núi / ngày (Tập trung sâu trọn buổi)</option>
                      <option value={2}>2 Đỉnh Núi / ngày (Cân bằng — Khuyên dùng)</option>
                      <option value={3}>3 Đỉnh Núi / ngày</option>
                      <option value={4}>4 Đỉnh Núi / ngày</option>
                    </select>
                  </div>
                )}
              </div>

              <div style={{ marginTop: 12 }}>
                <label className="zen-label">
                  Yêu cầu riêng cho AI (tùy chọn — AI mặc định tự tối ưu kín 100% khung giờ)
                </label>
                <textarea
                  className="zen-textarea"
                  rows={2}
                  style={{ width: '100%', minHeight: 56 }}
                  placeholder="VD: Chủ nhật nghỉ ngơi tổng kết; ưu tiên học HSK6 lúc mới ngủ dậy..."
                  value={customPromptDraft}
                  onChange={(e) => setCustomPromptDraft(e.target.value)}
                />
              </div>

              {/* BLOCK 3: CHOOSE AI BRAIN ENGINE */}
              <div className="ai-engine-selector-panel">
                <div className="ai-panel-subtitle" style={{ marginBottom: 10 }}>
                  <span>🧠 3. CHỌN BỘ NÃO LẬP LỊCH (THUẬT TOÁN NỘI BỘ HAY AI THẬT QUA KEY)</span>
                </div>

                <div className="ai-engine-choice-grid">
                  <button
                    type="button"
                    className={`ai-engine-choice-card ${
                      aiEngineDraft === 'INTERNAL_SMART' ? 'active' : ''
                    }`}
                    onClick={() => setAiEngineDraft('INTERNAL_SMART')}
                  >
                    <div className="ai-shift-card-head">
                      <Cpu size={18} color="#7DBFA8" />
                      <strong>⚙️ Thuật Toán Nội Bộ (Offline 100%)</strong>
                      {aiEngineDraft === 'INTERNAL_SMART' && (
                        <span className="zen-tag-red">ĐANG CHỌN</span>
                      )}
                    </div>
                    <p>
                      Chạy trực tiếp trên máy trong 0.1 giây, không cần mạng hay API Key, tự cân bằng
                      các đỉnh núi chính xác theo ca.
                    </p>
                  </button>

                  <button
                    type="button"
                    className={`ai-engine-choice-card ${
                      aiEngineDraft === 'EXTERNAL_LLM' ? 'active' : ''
                    }`}
                    onClick={() => setAiEngineDraft('EXTERNAL_LLM')}
                  >
                    <div className="ai-shift-card-head">
                      <Bot size={18} color="#f0c878" />
                      <strong>🤖 AI Thực Thụ (Gemini / Groq / OpenRouter)</strong>
                      {aiEngineDraft === 'EXTERNAL_LLM' && (
                        <span className="zen-tag-red">ĐANG CHỌN</span>
                      )}
                    </div>
                    <p>
                      Đọc sâu Checklist, 22 thói quen &amp; Sổ Bí Kíp để thiết kế lịch phủ kín 100%
                      giờ vàng (tự dò model Free Tier tránh lỗi 404).
                    </p>
                  </button>
                </div>

                {aiEngineDraft === 'EXTERNAL_LLM' && (
                  <div className="ai-gemini-key-box">
                    <div className="ai-provider-tabs">
                      {(['GEMINI', 'GROQ', 'OPENROUTER'] as AIProviderType[]).map((prov) => (
                        <button
                          key={prov}
                          type="button"
                          className={`ritual-day-pill ${aiProviderDraft === prov ? 'active' : ''}`}
                          onClick={() => {
                            setAiProviderDraft(prov);
                            setAiModelDraft(AI_PROVIDER_DEFAULTS[prov].defaultModel);
                            setKeyTestResult(null);
                          }}
                        >
                          {prov === 'GEMINI'
                            ? '✨ Google Gemini (Free Tier)'
                            : prov === 'GROQ'
                            ? '⚡ Groq Cloud (Free — Llama 3.3 70B)'
                            : '🌐 OpenRouter (Free Models)'}
                        </button>
                      ))}
                    </div>

                    <div className="ai-free-tier-guide-callout">
                      {aiProviderDraft === 'GEMINI' ? (
                        <span>
                          💡 Lấy Free API Key tại <code>aistudio.google.com/apikey</code> (không cần
                          nạp 800k Google Cloud Billing). Hệ thống tự dò model khả dụng (
                          <code>gemini-2.5-flash</code>, <code>gemini-2.5-flash-lite</code>...) tránh
                          lỗi 404.
                        </span>
                      ) : aiProviderDraft === 'GROQ' ? (
                        <span>
                          ⚡ Vào <code>console.groq.com/keys</code> lấy key miễn phí 100% không cần
                          thẻ ngân hàng, chạy Llama 3.3 70B cực nhanh.
                        </span>
                      ) : (
                        <span>
                          🌐 Lấy key miễn phí tại <code>openrouter.ai/keys</code> cho các model{' '}
                          <code>:free</code>.
                        </span>
                      )}
                    </div>

                    <div className="ai-external-inputs-grid">
                      <div>
                        <label className="zen-label">
                          <KeyRound size={12} style={{ display: 'inline', marginRight: 5 }} />
                          API Key ({aiProviderDraft})
                        </label>
                        <input
                          type="password"
                          className="zen-input"
                          style={{ width: '100%' }}
                          placeholder={AI_PROVIDER_DEFAULTS[aiProviderDraft].keyPlaceholder}
                          value={currentApiKeyDraft}
                          onChange={(e) => {
                            const val = e.target.value;
                            setApiKeysByProvider((prev) => ({ ...prev, [aiProviderDraft]: val }));
                            setKeyTestResult(null);
                          }}
                        />
                      </div>

                      <div>
                        <label className="zen-label">Model (hoặc Auto tự dò)</label>
                        <select
                          className="zen-input"
                          style={{ width: '100%' }}
                          value={aiModelDraft}
                          onChange={(e) => setAiModelDraft(e.target.value)}
                        >
                          {aiProviderDraft === 'GEMINI' && (
                            <option value="auto">🔄 Auto — Tự dò model Gemini khả dụng</option>
                          )}
                          {AI_PROVIDER_DEFAULTS[aiProviderDraft].fallbackModels.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                          {keyTestResult?.availableModels
                            ?.filter(
                              (m) => !AI_PROVIDER_DEFAULTS[aiProviderDraft].fallbackModels.includes(m)
                            )
                            .map((m) => (
                              <option key={m} value={m}>
                                {m} (phát hiện từ key của bạn)
                              </option>
                            ))}
                        </select>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button
                          type="button"
                          className="zen-btn zen-btn-outline"
                          style={{ width: '100%' }}
                          disabled={isTestingKey}
                          onClick={handleTestApiKey}
                        >
                          <ShieldCheck size={15} />
                          <span>{isTestingKey ? 'Đang kiểm tra...' : '🔍 Test Key & Dò Model'}</span>
                        </button>
                      </div>
                    </div>

                    {keyTestResult && (
                      <div className={`ai-key-test-banner ${keyTestResult.ok ? 'is-ok' : 'is-err'}`}>
                        <strong>
                          {keyTestResult.ok ? '✅ KẾT NỐI THÀNH CÔNG' : '❌ CHƯA KẾT NỐI ĐƯỢC'}
                        </strong>
                        <div>{keyTestResult.message}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="ai-generator-actions-bar">
                <label className="settings-toggle-row" style={{ padding: '6px 10px' }}>
                  <input
                    type="checkbox"
                    checked={syncShiftToLaws}
                    onChange={(e) => setSyncShiftToLaws(e.target.checked)}
                  />
                  <span style={{ fontSize: 12.5 }}>
                    Đồng bộ giờ vào ca ({shiftDraft === 'NIGHT' ? `Ca Đêm ${nightWorkStartDraft}` : `Ca Ngày ${dayWorkStartDraft}`}) sang Bộ Luật Núi
                  </span>
                </label>

                <button
                  type="button"
                  className="zen-btn zen-btn-seal btn-large-ceremony"
                  disabled={isGenerating}
                  onClick={handleGenerateSchedule}
                >
                  <Bot size={18} />
                  <span>
                    {isGenerating
                      ? aiEngineDraft === 'EXTERNAL_LLM'
                        ? `🤖 Đang hỏi AI Thực Thụ (${aiProviderDraft})...`
                        : '⚙️ Đang chạy Thuật Toán Nội Bộ...'
                      : aiEngineDraft === 'EXTERNAL_LLM'
                      ? `🤖 Tạo Lịch Trình Bằng ${aiProviderDraft} AI`
                      : hasGeneratedDays
                      ? '⚙️ Tạo Lại Lịch Bằng Thuật Toán Nội Bộ (7 Ngày)'
                      : '⚙️ Tạo Lịch Trình Thông Minh Ngay'}
                  </span>
                </button>
              </div>

              {/* BLOCK 4: SAVED SCHEDULE PROFILES BY SHIFT */}
              <div className="ai-engine-selector-panel" style={{ marginTop: 18 }}>
                <div className="ai-panel-subtitle" style={{ marginBottom: 8 }}>
                  <span>
                    📂 4. LƯU MẪU LỊCH THEO CA (ĐỔI CA CHỈ 1 CLICK — KHÔNG MẤT CHỈNH SỬA CŨ)
                  </span>
                </div>
                <p className="zen-muted-text" style={{ fontSize: 12.5, marginBottom: 10 }}>
                  Lưu lịch hiện tại thành mẫu riêng (VD: <code>Ca Đêm 20h</code>,{' '}
                  <code>Ca Ngày 07h</code>). Sang tuần đổi ca chỉ cần bấm chọn mẫu để tự động đổi
                  cả Lịch Tuần + Khóa cứng 1h + Hạn Luật Núi.
                </p>

                {existingPlan && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    <input
                      type="text"
                      className="zen-input"
                      style={{ flex: '1 1 240px', padding: '6px 10px', fontSize: 13 }}
                      placeholder={`VD: ${
                        shiftDraft === 'NIGHT'
                          ? `Ca Đêm (Vào ${nightWorkStartDraft})`
                          : `Ca Ngày (Vào ${dayWorkStartDraft})`
                      }`}
                      value={profileNameDraft}
                      onChange={(e) => setProfileNameDraft(e.target.value)}
                    />
                    <button
                      type="button"
                      className="zen-btn zen-btn-outline"
                      onClick={() => {
                        const fallbackName =
                          shiftDraft === 'NIGHT'
                            ? `Ca Đêm (Vào ${nightWorkStartDraft})`
                            : `Ca Ngày (Vào ${dayWorkStartDraft})`;
                        onSaveScheduleProfile(profileNameDraft.trim() || fallbackName);
                        setProfileNameDraft('');
                      }}
                    >
                      <Check size={14} /> Lưu Lịch Hiện Tại Thành Mẫu
                    </button>
                  </div>
                )}

                {(db.savedScheduleProfiles || []).length > 0 && (
                  <div className="schedule-profiles-strip">
                    {(db.savedScheduleProfiles || []).map((prof) => (
                      <div key={prof.id} className="schedule-profile-chip-group">
                        <button
                          type="button"
                          className="zen-btn zen-btn-outline"
                          style={{ padding: '5px 10px', fontSize: 12 }}
                          onClick={() => onLoadScheduleProfile(prof.id)}
                        >
                          {prof.shiftMode === 'NIGHT' ? '🌙' : '☀️'} Áp dụng: {prof.name}
                        </button>
                        <button
                          type="button"
                          className="zen-btn zen-btn-ghost"
                          style={{ padding: '4px 6px', color: '#ff8a80' }}
                          title="Xóa mẫu lịch này"
                          onClick={() => onDeleteScheduleProfile(prof.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
