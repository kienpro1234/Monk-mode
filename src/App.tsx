import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Bot,
  Calendar,
  Cpu,
  Edit3,
  FileText,
  Flame,
  History,
  Lightbulb,
  Moon,
  Mountain,
  PieChart,
  Scale,
  ScrollText,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  Swords,
} from 'lucide-react';
import {
  ConfirmDeleteTarget,
  DailyStrikeTodoEntity,
  DailyWorkShiftRecord,
  FocusSessionLogEntity,
  MonkDatabaseSchema,
  MountainMilestoneItem,
  OptimizationCategory,
  OptimizationNoteEntity,
  PeakGoalEntity,
  ProofAnalysisResult,
  RestDayRecord,
  SacredScrollEntity,
  SavedScheduleProfile,
  SIDE_QUEST_GOAL_ID,
  StrikeProofPhotoItem,
  TaskModificationLog,
  TimeAuditConfig,
  TodoActivityType,
  WorkShiftMode,
} from './types/models';
import {
  AutoStartStatusInfo,
  DaemonStatusInfo,
  desktopBridge,
} from './services/desktopBridge';
import { createInitialDatabase, getTodayDateStr } from './services/defaultData';
import { AmbientSoundMode, soundEngine } from './utils/soundEngine';
import { ShanshuiCanvasBg } from './components/ShanshuiCanvasBg';
import { QuickCommandPalette } from './components/QuickCommandPalette';
import {
  LawEvaluationResult,
  evaluateDayImmediately,
  evaluatePendingDays,
  findDayViolations,
  getEffectiveDayStartTime,
  getEffectiveNightStartTime,
  getLawConfig,
  getShiftDateStr,
  getShiftEndOfDayMs,
  isRitualScheduledForDate,
  parseShiftStartHM,
  shiftDateStr,
} from './services/mountainLaws';
import {
  getDayOfWeekFromDateStr,
  syncPlanPreWorkLock,
} from './services/aiSchedulePlanner';
import {
  computeDayTimeAudit,
  inferTodoActivityType,
  LiveActiveSessionInput,
} from './services/timeAuditEngine';
import { GoalsHubView, MountainStats } from './views/GoalsHubView';
import { AIScheduleView } from './views/AIScheduleView';
import { TimeAuditView } from './views/TimeAuditView';
import { OptimizationVaultView } from './views/OptimizationVaultView';
import { SideQuestsView, SideQuestTemplate } from './views/SideQuestsView';
import { RitualsView } from './views/RitualsView';
import { LawsView } from './views/LawsView';
import { TangKinhCacView } from './views/TangKinhCacView';
import { SettingsView } from './views/SettingsView';
import { FocusChamberView } from './views/FocusChamberView';
import { GoalInnerView, InnerGoalTab } from './views/GoalInnerView';
import { AppModals } from './views/AppModals';

type OuterNavTab =
  | 'GOALS_LIST'
  | 'AI_SCHEDULE'
  | 'TIME_AUDIT'
  | 'OPTIMIZATION_VAULT'
  | 'SIDE_QUESTS'
  | 'RITUALS'
  | 'LAWS'
  | 'TANG_KINH_CAC'
  | 'SETTINGS';

function buildFocusSessionLog(
  strike: DailyStrikeTodoEntity,
  durationMins: number,
  source: FocusSessionLogEntity['source'],
  dateStr: string,
  goals: PeakGoalEntity[],
  endedAtMs: number = Date.now()
): FocusSessionLogEntity {
  const mins = Math.max(1, Math.round(durationMins));
  const goalsMap = new Map(goals.map((g) => [g.id, g]));
  const actType = inferTodoActivityType(strike, goalsMap);
  return {
    id: `flog-${endedAtMs}-${Math.random().toString(36).slice(2, 6)}`,
    date: dateStr,
    startedAt: endedAtMs - mins * 60000,
    endedAt: endedAtMs,
    durationMins: mins,
    activityType: actType,
    goalId: strike.goalId,
    strikeId: strike.id,
    title: strike.title,
    source,
  };
}

const SIDE_QUEST_TEMPLATES: SideQuestTemplate[] = [
  { title: '🚿 Tắm rửa', mins: 15 },
  { title: '👕 Giặt & phơi quần áo', mins: 15 },
  { title: '🧺 Gấp & cất quần áo', mins: 10 },
  { title: '🧹 Dọn dẹp phòng', mins: 15 },
  { title: '🍽️ Rửa bát', mins: 10 },
  { title: '🍳 Nấu ăn', mins: 25 },
  { title: '🛏️ Gấp chăn, dọn giường', mins: 5 },
  { title: '🗑️ Đổ rác', mins: 5 },
];

export const App: React.FC = () => {
  const [db, setDb] = useState<MonkDatabaseSchema>(() => createInitialDatabase());

  // Navigation State
  const [outerTab, setOuterTab] = useState<OuterNavTab>('GOALS_LIST');
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [innerTab, setInnerTab] = useState<InnerGoalTab>('DAILY_STRIKES');
  const [focusedStrikeId, setFocusedStrikeId] = useState<string | null>(null);

  // Drift-Free Timestamp-Anchored Pomodoro Timer State
  const [pomoSecondsLeft, setPomoSecondsLeft] = useState<number>(25 * 60);
  const [pomoTotalSeconds, setPomoTotalSeconds] = useState<number>(25 * 60);
  const [pomoRunning, setPomoRunning] = useState<boolean>(false);
  const pomoStartMinsRef = useRef<number>(25);
  const pomoEndTimeMsRef = useRef<number | null>(null);
  const pomoSecondsLeftRef = useRef<number>(25 * 60);
  const pomoCompletedGuardRef = useRef<boolean>(false);

  // Clock ticker
  const [nowTick, setNowTick] = useState(Date.now());

  // Modals & Overlays
  const [proofModalTarget, setProofModalTarget] = useState<{
    strikeId: string;
    title: string;
    markCompleteAfterProof: boolean;
  } | null>(null);
  const [viewingScroll, setViewingScroll] = useState<SacredScrollEntity | null>(null);
  const [ceremonyScroll, setCeremonyScroll] = useState<SacredScrollEntity | null>(null);
  const [conqueringGoalId, setConqueringGoalId] = useState<string | null>(null);
  const [violationModalOpen, setViolationModalOpen] = useState(false);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<ConfirmDeleteTarget | null>(null);
  const [zoomedHistoryPhoto, setZoomedHistoryPhoto] = useState<{
    uri: string;
    title: string;
    caption: string;
    dateStr: string;
  } | null>(null);

  const [sternToast, setSternToast] = useState<{
    title: string;
    message: string;
    type: 'danger' | 'info' | 'seal';
  } | null>(null);

  // Create / Edit Mountain (Goal) Modal State
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [goalTitleDraft, setGoalTitleDraft] = useState('');
  const [goalCategoryDraft, setGoalCategoryDraft] = useState('Ngoại Ngữ & Chứng Chỉ');
  const [goalDescDraft, setGoalDescDraft] = useState('');
  const [goalVowDraft, setGoalVowDraft] = useState('');
  const [goalHasDeadlineDraft, setGoalHasDeadlineDraft] = useState(false);
  const [goalTargetDateDraft, setGoalTargetDateDraft] = useState('');
  const [goalMilestonesDraft, setGoalMilestonesDraft] = useState<MountainMilestoneItem[]>([]);
  const [newMilestoneText, setNewMilestoneText] = useState('');

  // Drag and Drop reordering state for Ritual Checkboxes
  const [draggingRitualItem, setDraggingRitualItem] = useState<{
    groupId: string;
    itemId: string;
    itemIndex: number;
  } | null>(null);
  const [dragOverTargetIndex, setDragOverTargetIndex] = useState<{
    groupId: string;
    itemIndex: number;
  } | null>(null);

  // Side Quests form state
  const [sideQuestTitle, setSideQuestTitle] = useState('');
  const [sideQuestPomo, setSideQuestPomo] = useState(15);
  const [sideQuestActivityType, setSideQuestActivityType] = useState<TodoActivityType>('CHORE');
  const [sideQuestRequiresPhoto, setSideQuestRequiresPhoto] = useState(false);
  const [sideQuestShowHistory, setSideQuestShowHistory] = useState(false);

  // Break timer, ambient sound & command palette state
  const [breakSecondsLeft, setBreakSecondsLeft] = useState<number | null>(null);
  const [breakTotalSeconds, setBreakTotalSeconds] = useState<number>(300);
  const breakEndTimeMsRef = useRef<number | null>(null);
  const [ambientMode, setAmbientMode] = useState<AmbientSoundMode>('OFF');
  const [ambientVolume, setAmbientVolume] = useState<number>(0.35);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);

  // Settings & Daemon state
  const [confirmResetMode, setConfirmResetMode] = useState<
    'NONE' | 'KEEP_RITUAL_FRAMES' | 'TOTAL_WIPE'
  >('NONE');
  const [globalMottoDraft, setGlobalMottoDraft] = useState(db.session.mottoText);
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatusInfo | null>(null);
  const [autoStartStatus, setAutoStartStatus] = useState<AutoStartStatusInfo | null>(null);

  // Task modification quota modals
  const [strikeBeingEdited, setStrikeBeingEdited] = useState<DailyStrikeTodoEntity | null>(null);
  const [editStrikeTitle, setEditStrikeTitle] = useState('');
  const [editStrikePomo, setEditStrikePomo] = useState(25);
  const [editStrikeActivityType, setEditStrikeActivityType] =
    useState<TodoActivityType>('DEEP_WORK');
  const [editStrikeRequiresPhoto, setEditStrikeRequiresPhoto] = useState(true);
  const [strikeBeingDeleted, setStrikeBeingDeleted] = useState<DailyStrikeTodoEntity | null>(null);
  const [showQuotaExhaustedModal, setShowQuotaExhaustedModal] = useState(false);

  const showSternMessage = useCallback(
    (title: string, message: string, type: 'danger' | 'info' | 'seal' = 'info') => {
      setSternToast({ title, message, type });
    },
    []
  );

  // Auto-dismiss non-critical toasts after 4.5s
  useEffect(() => {
    if (!sternToast || sternToast.type === 'danger') return;
    const t = window.setTimeout(() => setSternToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [sternToast]);

  // DB Ref & Law Engine
  const dbRef = useRef(db);
  dbRef.current = db;
  const [dbLoaded, setDbLoaded] = useState(false);
  const [lawVerdict, setLawVerdict] = useState<LawEvaluationResult | null>(null);

  const announceLawVerdict = useCallback(
    (res: LawEvaluationResult) => {
      if (res.newViolations.length > 0) {
        soundEngine.playViolationGong();
        setLawVerdict(res);
      } else if (res.cleanDays.length > 0) {
        showSternMessage(
          '✅ HỆ THỐNG LUẬT NÚI ĐÃ XÉT DUYỆT — KHÔNG CÓ VI PHẠM',
          `Đã xét ${res.cleanDays.length} ngày vừa qua: bạn giữ vững toàn bộ Luật Núi. Chuỗi ngày kỷ luật hiện tại: ${res.db.session.currentStreak} ngày.`,
          'seal'
        );
      }
    },
    [showSternMessage]
  );

  // Load Database on Mount
  useEffect(() => {
    desktopBridge.loadDatabase().then((loaded) => {
      if (loaded && loaded.session) {
        const cfg = getLawConfig(loaded);
        const shiftDate = getShiftDateStr(
          Date.now(),
          cfg.workShiftMode,
          getEffectiveNightStartTime(cfg)
        );
        const res = evaluatePendingDays(loaded, shiftDate, Date.now());
        setDb(res.db);
        if (res.changed) desktopBridge.saveDatabase(res.db);
        setGlobalMottoDraft(loaded.session.mottoText);
        announceLawVerdict(res);
      }
      setDbLoaded(true);
    });
    desktopBridge.getDaemonStatus().then(setDaemonStatus);
    desktopBridge.getAutoStartStatus().then(setAutoStartStatus);
  }, [announceLawVerdict]);

  // Background Daemon Sync & Heartbeat
  useEffect(() => {
    if (!dbLoaded) return;
    const syncDaemon = async () => {
      const hbRes = await desktopBridge.pingHeartbeat();
      const status = await desktopBridge.getDaemonStatus();
      if (status.ok) setDaemonStatus(status);
      if (hbRes.evaluated) {
        const latest = await desktopBridge.fetchServerDatabase();
        if (latest && latest.session) {
          setDb(latest);
          if (latest.session.pendingOfflineReport?.missedDeadlineWhileOffline) {
            soundEngine.playViolationGong();
          }
        }
      }
    };
    const interval = window.setInterval(syncDaemon, 20000);
    const onFocus = () => {
      syncDaemon();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [dbLoaded]);

  // 15s Clock Ticker (prevents idle 1s full-app re-renders while Pomodoro uses its own dedicated loop)
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowTick(Date.now());
    }, 15000);
    return () => clearInterval(id);
  }, []);

  const persistDb = useCallback((updater: (prev: MonkDatabaseSchema) => MonkDatabaseSchema) => {
    setDb((prev) => {
      const updated = updater(prev);
      desktopBridge.saveDatabase(updated);
      return updated;
    });
  }, []);

  // Drag & Drop handlers for Ritual Items
  const handleDragStartRitualItem = useCallback(
    (groupId: string, itemId: string, itemIndex: number, e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', itemId);
      setDraggingRitualItem({ groupId, itemId, itemIndex });
    },
    []
  );

  const handleDragOverRitualItem = useCallback(
    (groupId: string, itemIndex: number, e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverTargetIndex((prev) => {
        if (prev?.groupId === groupId && prev?.itemIndex === itemIndex) return prev;
        return { groupId, itemIndex };
      });
    },
    []
  );

  const handleDropRitualItem = useCallback(
    (groupId: string, targetIndex: number, e: React.DragEvent) => {
      e.preventDefault();
      if (!draggingRitualItem || draggingRitualItem.groupId !== groupId) {
        setDraggingRitualItem(null);
        setDragOverTargetIndex(null);
        return;
      }
      const fromIndex = draggingRitualItem.itemIndex;
      if (fromIndex === targetIndex) {
        setDraggingRitualItem(null);
        setDragOverTargetIndex(null);
        return;
      }
      persistDb((prev) => ({
        ...prev,
        ritualGroups: (prev.ritualGroups || []).map((g) => {
          if (g.id !== groupId) return g;
          const nextItems = [...g.items];
          const [movedItem] = nextItems.splice(fromIndex, 1);
          nextItems.splice(targetIndex, 0, movedItem);
          return { ...g, items: nextItems };
        }),
      }));
      soundEngine.playWoodenFish(0.7);
      setDraggingRitualItem(null);
      setDragOverTargetIndex(null);
    },
    [draggingRitualItem, persistDb]
  );

  const handleDragEndRitualItem = useCallback(() => {
    setDraggingRitualItem(null);
    setDragOverTargetIndex(null);
  }, []);

  const handleMoveRitualItem = useCallback(
    (groupId: string, fromIndex: number, direction: 'UP' | 'DOWN') => {
      const targetIndex = direction === 'UP' ? fromIndex - 1 : fromIndex + 1;
      persistDb((prev) => ({
        ...prev,
        ritualGroups: (prev.ritualGroups || []).map((g) => {
          if (g.id !== groupId) return g;
          if (targetIndex < 0 || targetIndex >= g.items.length) return g;
          const nextItems = [...g.items];
          const temp = nextItems[fromIndex];
          nextItems[fromIndex] = nextItems[targetIndex];
          nextItems[targetIndex] = temp;
          return { ...g, items: nextItems };
        }),
      }));
      soundEngine.playWoodenFish(0.6);
    },
    [persistDb]
  );

  const lawConfig = useMemo(() => getLawConfig(db), [db]);
  const activeShiftMode: WorkShiftMode = lawConfig.workShiftMode || 'DAY';
  const dayShiftStartTime = getEffectiveDayStartTime(lawConfig);
  const nightShiftStartTime = getEffectiveNightStartTime(lawConfig);
  const maxDailyTaskMods = lawConfig.maxDailyTaskModifications ?? 3;

  const todayStr = useMemo(
    () => getShiftDateStr(nowTick, activeShiftMode, nightShiftStartTime),
    [nowTick, activeShiftMode, nightShiftStartTime]
  );

  const displayDateVn = useMemo(() => {
    const d = new Date(nowTick);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${d.getFullYear()}`;
  }, [nowTick]);

  // Evaluate day turnover automatically while UI is open
  useEffect(() => {
    if (!dbLoaded) return;
    const res = evaluatePendingDays(dbRef.current, todayStr);
    if (!res.changed) return;
    setDb(res.db);
    desktopBridge.saveDatabase(res.db);
    announceLawVerdict(res);
  }, [todayStr, dbLoaded, announceLawVerdict]);

  const lawsActive = Boolean(db.session.lawsAcceptedAt);
  const todayLawPreview = useMemo(
    () => findDayViolations(db, todayStr, lawConfig),
    [db, todayStr, lawConfig]
  );

  const timeLeftToday = useMemo(() => {
    const isNight = activeShiftMode === 'NIGHT';
    let endMs: number;
    let deadlineTitle: string;

    if (!isNight) {
      const target = new Date(nowTick);
      target.setHours(23, 59, 59, 999);
      endMs = target.getTime();
      deadlineTitle = '23:59 đêm nay';
    } else {
      const now = new Date(nowTick);
      const { hour: nh, minute: nm } = parseShiftStartHM(nightShiftStartTime, 19);
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const cutoffMins = nh * 60 + nm;
      if (nowMins < cutoffMins) {
        const target = new Date(nowTick);
        target.setHours(nh, nm, 0, 0);
        endMs = target.getTime();
        deadlineTitle = `${nightShiftStartTime} tối nay`;
      } else {
        const target = new Date(nowTick + 86400000);
        target.setHours(nh, nm, 0, 0);
        endMs = target.getTime();
        deadlineTitle = `${nightShiftStartTime} tối mai`;
      }
    }

    const diff = Math.max(0, endMs - nowTick);
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);

    return {
      h,
      m,
      endMs,
      isNight,
      label: `${h} giờ ${String(m).padStart(2, '0')} phút`,
      deadlineTitle,
    };
  }, [nowTick, activeShiftMode, nightShiftStartTime]);

  const todayTaskMods = useMemo(() => {
    const logs = db.taskModificationLogs || [];
    return logs.filter((l) => l.date === todayStr);
  }, [db.taskModificationLogs, todayStr]);
  const remainingTaskMods = Math.max(0, maxDailyTaskMods - todayTaskMods.length);

  const handleUpdateShiftConfig = useCallback(
    (updates: {
      mode?: WorkShiftMode;
      dayShiftStartTime?: string;
      nightShiftStartTime?: string;
      silent?: boolean;
    }) => {
      const currentCfg = getLawConfig(dbRef.current);
      const nextMode = updates.mode ?? currentCfg.workShiftMode ?? 'DAY';
      const nextDayStart = updates.dayShiftStartTime ?? getEffectiveDayStartTime(currentCfg);
      const nextNightStart = updates.nightShiftStartTime ?? getEffectiveNightStartTime(currentCfg);
      const parsedNight = parseShiftStartHM(nextNightStart, 19);

      if (!updates.silent) soundEngine.playTempleBell(0.85);
      persistDb((prev) => {
        const prevCfg = getLawConfig(prev);
        const nextPlan = prev.climbingSchedulePlan
          ? syncPlanPreWorkLock(prev.climbingSchedulePlan, {
              dayWorkStartTime: nextDayStart,
              nightWorkStartTime: nextNightStart,
            })
          : prev.climbingSchedulePlan;
        return {
          ...prev,
          climbingSchedulePlan: nextPlan,
          session: {
            ...prev.session,
            lawConfig: {
              ...prevCfg,
              workShiftMode: nextMode,
              dayShiftStartTime: nextDayStart,
              nightShiftStartTime: nextNightStart,
              nightShiftStartHour: parsedNight.hour,
            },
          },
        };
      });
      if (!updates.silent) {
        if (nextMode === 'NIGHT') {
          showSternMessage(
            `🌙 ĐÃ KÍCH HOẠT CA ĐÊM (VÀO CA ${nextNightStart})`,
            `Hạn chót Luật Núi được điều chỉnh về ${nextNightStart} hôm sau và khung khóa cứng 1 tiếng trước khi đi làm đã tự động cập nhật!`,
            'seal'
          );
        } else {
          showSternMessage(
            `☀️ ĐÃ KÍCH HOẠT CA NGÀY (VÀO CA ${nextDayStart})`,
            `Hạn chót Luật Núi là 23:59 đêm nay và khung khóa cứng 1 tiếng trước giờ vào ca (${nextDayStart}) đã tự động cập nhật!`,
            'seal'
          );
        }
      }
    },
    [persistDb, showSternMessage]
  );

  const handleSwitchWorkShift = useCallback(
    (newMode: WorkShiftMode) => handleUpdateShiftConfig({ mode: newMode }),
    [handleUpdateShiftConfig]
  );

  // Rest Day Registration & Cancellation (Thẻ Ngày Nghỉ Có Phép)
  const handleRegisterRestDay = useCallback(
    (dateStr: string, reason: string) => {
      const cfg = getLawConfig(dbRef.current);
      const maxCap = cfg.maxMonthlyRestDays ?? 2;
      const nowMs = Date.now();
      const dayEnd = getShiftEndOfDayMs(
        dateStr,
        cfg.workShiftMode,
        getEffectiveNightStartTime(cfg)
      );
      if (dateStr < todayStr || nowMs >= dayEnd) {
        soundEngine.playViolationGong();
        showSternMessage(
          'KHÔNG THỂ ĐĂNG KÝ NGÀY ĐÃ QUA',
          'Thẻ Ngày Nghỉ Có Phép bắt buộc phải đăng ký trước giờ chốt sổ của ngày đó.',
          'danger'
        );
        return;
      }

      const existing = dbRef.current.session.restDays || [];
      if (existing.some((r) => r.date === dateStr)) return;
      const monthPrefix = dateStr.slice(0, 7);
      const usedCount = existing.filter((r) => r.date.startsWith(monthPrefix)).length;
      if (usedCount >= maxCap) {
        soundEngine.playViolationGong();
        showSternMessage(
          'HẾT HẠN NGẠCH NGÀY NGHỈ THÁNG NÀY',
          `Tháng ${monthPrefix} chỉ cho phép tối đa ${maxCap} Thẻ Ngày Nghỉ Có Phép.`,
          'danger'
        );
        return;
      }

      const record: RestDayRecord = {
        date: dateStr,
        reason,
        registeredAt: nowMs,
      };
      soundEngine.playWoodblockStampSound();
      persistDb((prev) => ({
        ...prev,
        session: {
          ...prev.session,
          restDays: [record, ...(prev.session.restDays || [])],
        },
      }));
      showSternMessage(
        '🎋 ĐÃ CẤP THẺ NGÀY NGHỈ CÓ PHÉP',
        `Ngày ${dateStr} đã được ghi nhận nghỉ có phép (${reason}). Mọi điều luật trong ngày này được miễn xét và Streak vẫn được giữ nguyên.`,
        'seal'
      );
    },
    [todayStr, persistDb, showSternMessage]
  );

  const handleCancelRestDay = useCallback(
    (dateStr: string) => {
      const cfg = getLawConfig(dbRef.current);
      const dayEnd = getShiftEndOfDayMs(
        dateStr,
        cfg.workShiftMode,
        getEffectiveNightStartTime(cfg)
      );
      if (Date.now() >= dayEnd) return;
      soundEngine.playWoodenFish(0.6);
      persistDb((prev) => ({
        ...prev,
        session: {
          ...prev.session,
          restDays: (prev.session.restDays || []).filter((r) => r.date !== dateStr),
        },
      }));
      showSternMessage(
        'ĐÃ HỦY THẺ NGHỈ CÓ PHÉP',
        `Ngày ${dateStr} đã quay về ngày kỷ luật bình thường và 1 thẻ tháng đã được hoàn lại.`,
        'info'
      );
    },
    [persistDb, showSternMessage]
  );

  const handleChangeMaxMonthlyRestDays = useCallback(
    (cap: number) => {
      persistDb((prev) => ({
        ...prev,
        session: {
          ...prev.session,
          lawConfig: { ...getLawConfig(prev), maxMonthlyRestDays: cap },
        },
      }));
    },
    [persistDb]
  );

  // Task Modification Quota Handlers
  const handleRequestEditStrike = useCallback(
    (strike: DailyStrikeTodoEntity) => {
      if (remainingTaskMods <= 0) {
        soundEngine.playViolationGong();
        setShowQuotaExhaustedModal(true);
        return;
      }
      soundEngine.playWoodenFish(0.6);
      setStrikeBeingEdited(strike);
      setEditStrikeTitle(strike.title);
      setEditStrikePomo(strike.requiredPomodoroMins || 25);
      setEditStrikeActivityType(
        inferTodoActivityType(strike, new Map(db.peakGoals.map((g) => [g.id, g])))
      );
      setEditStrikeRequiresPhoto(Boolean(strike.requiresPhoto));
    },
    [remainingTaskMods, db.peakGoals]
  );

  const handleConfirmEditStrike = useCallback(() => {
    if (!strikeBeingEdited || !editStrikeTitle.trim()) return;
    if (remainingTaskMods <= 0) {
      setShowQuotaExhaustedModal(true);
      return;
    }

    const log: TaskModificationLog = {
      id: `task-mod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: todayStr,
      timestamp: Date.now(),
      type: 'EDIT',
      goalId: strikeBeingEdited.goalId,
      goalTitle: db.peakGoals.find((g) => g.id === strikeBeingEdited.goalId)?.title,
      strikeId: strikeBeingEdited.id,
      oldTitle: strikeBeingEdited.title,
      newTitle: editStrikeTitle.trim(),
    };

    persistDb((prev) => ({
      ...prev,
      dailyStrikes: prev.dailyStrikes.map((s) =>
        s.id === strikeBeingEdited.id
          ? {
              ...s,
              title: editStrikeTitle.trim(),
              requiredPomodoroMins: editStrikePomo,
              activityType: editStrikeActivityType,
              requiresPhoto: editStrikeRequiresPhoto,
            }
          : s
      ),
      taskModificationLogs: [...(prev.taskModificationLogs || []), log],
    }));

    soundEngine.playTempleBell(0.85);
    setStrikeBeingEdited(null);
    showSternMessage(
      '✏️ ĐÃ CẬP NHẬT NHIỆM VỤ CÔNG PHÁ',
      `Bạn đã sử dụng 1 lượt sửa đổi. Hôm nay còn lại ${remainingTaskMods - 1}/${maxDailyTaskMods} lượt sửa/hủy. Hãy kiên định tập trung hoàn thành nó!`,
      'info'
    );
  }, [
    strikeBeingEdited,
    editStrikeTitle,
    editStrikePomo,
    editStrikeActivityType,
    editStrikeRequiresPhoto,
    remainingTaskMods,
    maxDailyTaskMods,
    todayStr,
    db.peakGoals,
    persistDb,
    showSternMessage,
  ]);

  const handleRequestDeleteStrike = useCallback(
    (strike: DailyStrikeTodoEntity) => {
      if (remainingTaskMods <= 0) {
        soundEngine.playViolationGong();
        setShowQuotaExhaustedModal(true);
        return;
      }
      soundEngine.playWoodenFish(0.6);
      setStrikeBeingDeleted(strike);
    },
    [remainingTaskMods]
  );

  const handleConfirmDeleteStrike = useCallback(() => {
    if (!strikeBeingDeleted) return;
    if (remainingTaskMods <= 0) {
      setShowQuotaExhaustedModal(true);
      return;
    }

    const log: TaskModificationLog = {
      id: `task-mod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: todayStr,
      timestamp: Date.now(),
      type: 'DELETE',
      goalId: strikeBeingDeleted.goalId,
      goalTitle: db.peakGoals.find((g) => g.id === strikeBeingDeleted.goalId)?.title,
      strikeId: strikeBeingDeleted.id,
      oldTitle: strikeBeingDeleted.title,
    };

    persistDb((prev) => ({
      ...prev,
      dailyStrikes: prev.dailyStrikes.filter((s) => s.id !== strikeBeingDeleted.id),
      taskModificationLogs: [...(prev.taskModificationLogs || []), log],
    }));

    soundEngine.playWoodblockStampSound();
    setStrikeBeingDeleted(null);
    showSternMessage(
      '🗑️ ĐÃ HỦY BỎ NHIỆM VỤ',
      `Bạn đã sử dụng 1 lượt hủy Todo hôm nay (còn lại ${remainingTaskMods - 1}/${maxDailyTaskMods} lượt). Hãy suy nghĩ thật kỹ trước khi đặt ra mục tiêu mới!`,
      'info'
    );
  }, [
    strikeBeingDeleted,
    remainingTaskMods,
    maxDailyTaskMods,
    todayStr,
    db.peakGoals,
    persistDb,
    showSternMessage,
  ]);

  // Confirm Delete Goal or Ritual Group
  const handleConfirmDeleteTarget = useCallback(() => {
    if (!confirmDeleteTarget) return;
    soundEngine.playWoodblockStampSound();
    if (confirmDeleteTarget.kind === 'GOAL') {
      const targetId = confirmDeleteTarget.id;
      persistDb((prev) => ({
        ...prev,
        peakGoals: prev.peakGoals.filter((g) => g.id !== targetId),
        dailyStrikes: prev.dailyStrikes.filter((s) => s.goalId !== targetId),
      }));
      if (selectedGoalId === targetId) setSelectedGoalId(null);
      showSternMessage(
        '🗑️ ĐÃ XÓA ĐỈNH NÚI',
        `Đỉnh núi "${confirmDeleteTarget.title}" đã được xóa khỏi danh sách.`,
        'info'
      );
    } else {
      const groupId = confirmDeleteTarget.id;
      persistDb((prev) => ({
        ...prev,
        ritualGroups: (prev.ritualGroups || []).filter((g) => g.id !== groupId),
      }));
      showSternMessage(
        '🗑️ ĐÃ XÓA NHÓM NGHI THỨC',
        `Nhóm "${confirmDeleteTarget.title}" đã được xóa khỏi bảng Nghi Thức.`,
        'info'
      );
    }
    setConfirmDeleteTarget(null);
  }, [confirmDeleteTarget, persistDb, selectedGoalId, showSternMessage]);

  const handleAcceptLaws = () => {
    soundEngine.playWoodblockStampSound();
    persistDb((prev) => ({
      ...prev,
      session: {
        ...prev.session,
        lawsAcceptedAt: Date.now(),
        lastEvaluatedDate: shiftDateStr(todayStr, -1),
        lawConfig: getLawConfig(prev),
      },
    }));
    showSternMessage(
      '📜 ĐÃ KÝ CAM KẾT TUÂN THỦ LUẬT NÚI',
      `Luật Núi có hiệu lực ngay từ hôm nay. Hệ thống tự động xét duyệt mỗi ngày vào ${
        activeShiftMode === 'NIGHT' ? `${nightShiftStartTime} tối hôm sau (Ca Đêm)` : '23:59 mỗi đêm'
      } hoặc ngay khi mở app vào ngày mới.`,
      'seal'
    );
  };

  const handleToggleLaw = (key: keyof typeof lawConfig) => {
    soundEngine.playWoodenFish(0.5);
    persistDb((prev) => {
      const cfg = getLawConfig(prev);
      return {
        ...prev,
        session: { ...prev.session, lawConfig: { ...cfg, [key]: !cfg[key] } },
      };
    });
  };

  const handleChangeRitualThresholdPct = useCallback(
    (pct: number) => {
      const clamped = Math.max(50, Math.min(100, Math.round(pct)));
      soundEngine.playWoodenFish(0.55);
      persistDb((prev) => ({
        ...prev,
        session: {
          ...prev.session,
          lawConfig: { ...getLawConfig(prev), ritualPassThresholdPct: clamped },
        },
      }));
      showSternMessage(
        `🎯 ĐÃ CẬP NHẬT NGƯỠNG LUẬT 2: ≥ ${clamped}%`,
        `Từ giờ Luật Nghi Thức yêu cầu hoàn thành tối thiểu ${clamped}% tổng số bước nghi thức trong ngày.`,
        'seal'
      );
    },
    [persistDb, showSternMessage]
  );

  const handleToggleRitualItemToday = useCallback(
    (groupId: string, itemId: string) => {
      soundEngine.playWoodenFish(0.65);
      persistDb((prev) => ({
        ...prev,
        ritualGroups: (prev.ritualGroups || []).map((g) =>
          g.id === groupId
            ? {
                ...g,
                items: g.items.map((x) => {
                  if (x.id !== itemId) return x;
                  const nextDates = { ...(x.completedDates || {}) };
                  if (nextDates[todayStr]) {
                    delete nextDates[todayStr];
                  } else {
                    nextDates[todayStr] = Date.now();
                  }
                  return { ...x, completedDates: nextDates };
                }),
              }
            : g
        ),
      }));
    },
    [persistDb, todayStr]
  );

  const handleRunLawEvaluationTodayNow = () => {
    const res = evaluateDayImmediately(db, todayStr);
    setDb(res.db);
    desktopBridge.saveDatabase(res.db);
    if (res.newViolations.length > 0) {
      soundEngine.playViolationGong();
      setLawVerdict(res);
      showSternMessage(
        `🚨 HỆ THỐNG LUẬT NÚI PHÁT HIỆN ${res.newViolations.length} VI PHẠM!`,
        res.newViolations.map((v) => v.reason).join(' | '),
        'danger'
      );
    } else {
      soundEngine.playTempleBell(0.85);
      showSternMessage(
        '✅ XÉT DUYỆT HÔM NAY HOÀN TẤT — 0 VI PHẠM!',
        `Bạn đã hoàn thành trọn vẹn nghĩa vụ trong ngày ${todayStr} theo Bộ Luật Núi. Chuỗi ngày kỷ luật hiện tại: ${res.db.session.currentStreak} ngày!`,
        'seal'
      );
    }
  };

  const selectedGoal: PeakGoalEntity | null = useMemo(() => {
    if (!selectedGoalId) return null;
    return db.peakGoals.find((g) => g.id === selectedGoalId) || null;
  }, [db.peakGoals, selectedGoalId]);

  const focusedStrike: DailyStrikeTodoEntity | null = useMemo(() => {
    if (!focusedStrikeId) return null;
    return db.dailyStrikes.find((s) => s.id === focusedStrikeId) || null;
  }, [db.dailyStrikes, focusedStrikeId]);

  const getLiveRemainingSeconds = useCallback(() => {
    if (pomoRunning && pomoEndTimeMsRef.current !== null) {
      return Math.max(0, Math.ceil((pomoEndTimeMsRef.current - Date.now()) / 1000));
    }
    return pomoSecondsLeftRef.current;
  }, [pomoRunning]);

  // Enter Single-Task Focus Mode (restoring saved paused state if present)
  const enterFocusModeForStrike = useCallback(
    (strike: DailyStrikeTodoEntity, autoStart: boolean = false) => {
      setFocusedStrikeId(strike.id);
      const hasSavedPause =
        strike.savedPomoSecondsLeft != null &&
        strike.savedPomoTotalSeconds != null &&
        strike.savedPomoSecondsLeft > 0 &&
        strike.savedPomoSecondsLeft < strike.savedPomoTotalSeconds;

      const mins = hasSavedPause
        ? Math.max(5, strike.savedPomoSelectedMins || Math.round(strike.savedPomoTotalSeconds! / 60))
        : Math.max(5, strike.requiredPomodoroMins || 25);
      const totalSecs = hasSavedPause ? strike.savedPomoTotalSeconds! : mins * 60;
      const leftSecs = hasSavedPause ? strike.savedPomoSecondsLeft! : totalSecs;

      pomoStartMinsRef.current = mins;
      pomoSecondsLeftRef.current = leftSecs;
      pomoCompletedGuardRef.current = false;
      setPomoTotalSeconds(totalSecs);
      setPomoSecondsLeft(leftSecs);
      if (autoStart) {
        pomoEndTimeMsRef.current = Date.now() + leftSecs * 1000;
        setPomoRunning(true);
      } else {
        pomoEndTimeMsRef.current = null;
        setPomoRunning(false);
      }
    },
    []
  );

  const handleTogglePomoRun = useCallback(() => {
    if (pomoRunning) {
      // Pause: snapshot exact remaining seconds from wall-clock target AND persist to DB
      const rem =
        pomoEndTimeMsRef.current !== null
          ? Math.max(0, Math.ceil((pomoEndTimeMsRef.current - Date.now()) / 1000))
          : pomoSecondsLeftRef.current;
      pomoSecondsLeftRef.current = rem;
      setPomoSecondsLeft(rem);
      pomoEndTimeMsRef.current = null;
      setPomoRunning(false);

      if (focusedStrikeId && rem > 0 && rem < pomoTotalSeconds) {
        const selectedMins = pomoStartMinsRef.current;
        persistDb((prev) => ({
          ...prev,
          dailyStrikes: prev.dailyStrikes.map((s) =>
            s.id === focusedStrikeId
              ? {
                  ...s,
                  status: s.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
                  savedPomoSecondsLeft: rem,
                  savedPomoTotalSeconds: pomoTotalSeconds,
                  savedPomoSelectedMins: selectedMins,
                }
              : s
          ),
        }));
      }
    } else {
      const secs =
        pomoSecondsLeftRef.current > 0
          ? pomoSecondsLeftRef.current
          : pomoStartMinsRef.current * 60;
      pomoCompletedGuardRef.current = false;
      pomoSecondsLeftRef.current = secs;
      pomoEndTimeMsRef.current = Date.now() + secs * 1000;
      soundEngine.playTempleBell(0.85);
      setPomoRunning(true);
    }
  }, [pomoRunning, focusedStrikeId, pomoTotalSeconds, persistDb]);

  const handleExitFocusMode = useCallback(() => {
    if (focusedStrikeId) {
      const rem = getLiveRemainingSeconds();
      const selectedMins = pomoStartMinsRef.current;
      if (rem > 0 && rem < pomoTotalSeconds) {
        persistDb((prev) => ({
          ...prev,
          dailyStrikes: prev.dailyStrikes.map((s) =>
            s.id === focusedStrikeId
              ? {
                  ...s,
                  status: s.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
                  savedPomoSecondsLeft: rem,
                  savedPomoTotalSeconds: pomoTotalSeconds,
                  savedPomoSelectedMins: selectedMins,
                }
              : s
          ),
        }));
      } else {
        persistDb((prev) => ({
          ...prev,
          dailyStrikes: prev.dailyStrikes.map((s) =>
            s.id === focusedStrikeId
              ? {
                  ...s,
                  savedPomoSecondsLeft: null,
                  savedPomoTotalSeconds: null,
                  savedPomoSelectedMins: null,
                }
              : s
          ),
        }));
      }
    }
    pomoEndTimeMsRef.current = null;
    setPomoRunning(false);
    setFocusedStrikeId(null);
  }, [focusedStrikeId, getLiveRemainingSeconds, pomoTotalSeconds, persistDb]);

  const handleResetPomoTimer = useCallback(
    (minsOverride?: number) => {
      const mins = minsOverride ?? pomoStartMinsRef.current;
      const secs = mins * 60;
      pomoEndTimeMsRef.current = null;
      pomoCompletedGuardRef.current = false;
      pomoSecondsLeftRef.current = secs;
      setPomoRunning(false);
      setPomoTotalSeconds(secs);
      setPomoSecondsLeft(secs);
      if (focusedStrikeId) {
        persistDb((prev) => ({
          ...prev,
          dailyStrikes: prev.dailyStrikes.map((s) =>
            s.id === focusedStrikeId
              ? {
                  ...s,
                  savedPomoSecondsLeft: null,
                  savedPomoTotalSeconds: null,
                  savedPomoSelectedMins: null,
                }
              : s
          ),
        }));
      }
    },
    [focusedStrikeId, persistDb]
  );

  const startBreakTimer = useCallback((mins: number = 5) => {
    const secs = Math.max(60, Math.round(mins * 60));
    breakEndTimeMsRef.current = Date.now() + secs * 1000;
    setBreakTotalSeconds(secs);
    setBreakSecondsLeft(secs);
  }, []);

  const cancelBreakTimer = useCallback(() => {
    breakEndTimeMsRef.current = null;
    setBreakSecondsLeft(null);
  }, []);

  const handleChangeAmbientMode = useCallback(
    (mode: AmbientSoundMode) => {
      setAmbientMode(mode);
      soundEngine.setAmbientSound(mode, ambientVolume);
    },
    [ambientVolume]
  );

  const handleChangeAmbientVolume = useCallback((vol: number) => {
    setAmbientVolume(vol);
    soundEngine.setAmbientVolume(vol);
  }, []);

  const handleFinishActualPomoSession = useCallback(() => {
    if (!focusedStrikeId) return;
    const rem = getLiveRemainingSeconds();
    const elapsedSecs = Math.max(0, pomoTotalSeconds - rem);
    if (elapsedSecs <= 0) {
      soundEngine.playWoodenFish(0.5);
      showSternMessage(
        'CHƯA CÓ THỜI GIAN TẬP TRUNG THỰC TẾ',
        'Đồng hồ chưa chạy giây nào trong hiệp này. Hãy bấm "Bắt Đầu Pomodoro" trước rồi hoàn thành hiệp khi đạt mục tiêu!',
        'info'
      );
      return;
    }

    const earnedMins = Math.max(1, Math.round(elapsedSecs / 60));
    const plannedMins = pomoStartMinsRef.current;
    soundEngine.playTempleBell(0.95);
    handleResetPomoTimer(plannedMins);
    const endedNow = Date.now();
    persistDb((prev) => {
      const targetStrike = prev.dailyStrikes.find((s) => s.id === focusedStrikeId);
      const nextLogs = targetStrike
        ? [
            buildFocusSessionLog(
              targetStrike,
              earnedMins,
              'POMODORO_EARLY_FINISH',
              todayStr,
              prev.peakGoals,
              endedNow
            ),
            ...(prev.focusSessionLogs || []),
          ]
        : prev.focusSessionLogs || [];
      return {
        ...prev,
        focusSessionLogs: nextLogs,
        dailyStrikes: prev.dailyStrikes.map((s) =>
          s.id === focusedStrikeId
            ? {
                ...s,
                status: s.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
                completedPomodoroMins: (s.completedPomodoroMins || 0) + earnedMins,
                pomodoroSessionsCount: (s.pomodoroSessionsCount || 0) + 1,
                savedPomoSecondsLeft: null,
                savedPomoTotalSeconds: null,
                savedPomoSelectedMins: null,
              }
            : s
        ),
      };
    });
    startBreakTimer(5);
    showSternMessage(
      '✓ ĐÃ HOÀN THÀNH HIỆP POMODORO!',
      `Đã ghi nhận đúng ${earnedMins} phút tập trung thực tế vào Sổ Quỹ Thời Gian & hồ sơ (mục tiêu hiệp đặt ${plannedMins}p).`,
      'seal'
    );
  }, [
    focusedStrikeId,
    getLiveRemainingSeconds,
    pomoTotalSeconds,
    handleResetPomoTimer,
    persistDb,
    todayStr,
    startBreakTimer,
    showSternMessage,
  ]);

  // Anti-Drift Pomodoro Countdown Loop using endTimeMs + visibilitychange / focus sync
  useEffect(() => {
    if (!pomoRunning || !focusedStrikeId) return;

    if (pomoEndTimeMsRef.current === null) {
      pomoEndTimeMsRef.current = Date.now() + pomoSecondsLeftRef.current * 1000;
    }

    const syncRemaining = () => {
      if (!pomoEndTimeMsRef.current || pomoCompletedGuardRef.current) return;
      const rem = Math.max(0, Math.ceil((pomoEndTimeMsRef.current - Date.now()) / 1000));
      pomoSecondsLeftRef.current = rem;
      setPomoSecondsLeft(rem);

      if (rem <= 0) {
        pomoCompletedGuardRef.current = true;
        pomoEndTimeMsRef.current = null;
        soundEngine.playTempleBell(1.0);
        setPomoRunning(false);
        const earned = pomoStartMinsRef.current;
        pomoSecondsLeftRef.current = earned * 60;
        setPomoTotalSeconds(earned * 60);
        setPomoSecondsLeft(earned * 60);
        const endedNow = Date.now();

        persistDb((prev) => {
          const targetStrike = prev.dailyStrikes.find((s) => s.id === focusedStrikeId);
          const nextLogs = targetStrike
            ? [
                buildFocusSessionLog(
                  targetStrike,
                  earned,
                  'POMODORO_FULL',
                  todayStr,
                  prev.peakGoals,
                  endedNow
                ),
                ...(prev.focusSessionLogs || []),
              ]
            : prev.focusSessionLogs || [];
          return {
            ...prev,
            focusSessionLogs: nextLogs,
            dailyStrikes: prev.dailyStrikes.map((s) =>
              s.id === focusedStrikeId
                ? {
                    ...s,
                    status: s.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
                    completedPomodoroMins: (s.completedPomodoroMins || 0) + earned,
                    pomodoroSessionsCount: (s.pomodoroSessionsCount || 0) + 1,
                    savedPomoSecondsLeft: null,
                    savedPomoTotalSeconds: null,
                    savedPomoSelectedMins: null,
                  }
                : s
            ),
          };
        });
        startBreakTimer(5);
        showSternMessage(
          '🔔 HOÀN THÀNH 1 HIỆP POMODORO!',
          `Tuyệt vời! Đã cộng +${earned} phút tập trung thực tế vào Sổ Quỹ Thời Gian & kích hoạt đồng hồ nghỉ ngắn 5 phút.`,
          'seal'
        );
      }
    };

    const handleBeforeUnload = () => {
      if (!pomoEndTimeMsRef.current || pomoCompletedGuardRef.current) return;
      const rem = Math.max(0, Math.ceil((pomoEndTimeMsRef.current - Date.now()) / 1000));
      if (rem > 0 && rem < pomoTotalSeconds) {
        const nextDb: MonkDatabaseSchema = {
          ...dbRef.current,
          dailyStrikes: dbRef.current.dailyStrikes.map((s) =>
            s.id === focusedStrikeId
              ? {
                  ...s,
                  status: s.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
                  savedPomoSecondsLeft: rem,
                  savedPomoTotalSeconds: pomoTotalSeconds,
                  savedPomoSelectedMins: pomoStartMinsRef.current,
                }
              : s
          ),
        };
        desktopBridge.saveDatabase(nextDb, true);
      }
    };

    syncRemaining();
    const timer = window.setInterval(syncRemaining, 250);
    window.addEventListener('focus', syncRemaining);
    document.addEventListener('visibilitychange', syncRemaining);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', syncRemaining);
      document.removeEventListener('visibilitychange', syncRemaining);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [pomoRunning, focusedStrikeId, pomoTotalSeconds, persistDb, todayStr, startBreakTimer, showSternMessage]);

  // Auto-Break Countdown Loop (timestamp-anchored)
  useEffect(() => {
    if (breakSecondsLeft === null) return;
    const tickBreak = () => {
      if (!breakEndTimeMsRef.current) return;
      const rem = Math.max(0, Math.ceil((breakEndTimeMsRef.current - Date.now()) / 1000));
      if (rem <= 0) {
        breakEndTimeMsRef.current = null;
        setBreakSecondsLeft(null);
        soundEngine.playTempleBell(0.75);
        showSternMessage(
          '⏰ HẾT GIỜ NGHỈ NGẮN!',
          'Đã hết giờ nghỉ phục hồi. Bấm Space hoặc Bắt Đầu để quay lại hiệp Pomodoro tiếp theo!',
          'info'
        );
      } else {
        setBreakSecondsLeft(rem);
      }
    };
    const id = window.setInterval(tickBreak, 500);
    return () => window.clearInterval(id);
  }, [breakSecondsLeft !== null, showSternMessage]);

  // Dynamic Window / Browser Tab Title with Live Countdown
  useEffect(() => {
    if (focusedStrike && pomoRunning) {
      const mm = String(Math.floor(pomoSecondsLeft / 60)).padStart(2, '0');
      const ss = String(pomoSecondsLeft % 60).padStart(2, '0');
      document.title = `[${mm}:${ss}] 🔥 ${focusedStrike.title} — Lên Núi`;
    } else if (breakSecondsLeft !== null) {
      const mm = String(Math.floor(breakSecondsLeft / 60)).padStart(2, '0');
      const ss = String(breakSecondsLeft % 60).padStart(2, '0');
      document.title = `[Nghỉ ${mm}:${ss}] 🍵 Nghỉ ngắn — Lên Núi`;
    } else {
      document.title = 'LÊN NÚI (ASCEND THE MOUNTAIN) — Hệ Thống Kỷ Luật Tu Luyện';
    }
  }, [focusedStrike, pomoRunning, pomoSecondsLeft, breakSecondsLeft]);

  // Global Keyboard Shortcuts (Ctrl+K, Ctrl+1..9, Space/Esc in Focus Mode)
  useEffect(() => {
    const tabMap: OuterNavTab[] = [
      'GOALS_LIST',
      'AI_SCHEDULE',
      'TIME_AUDIT',
      'OPTIMIZATION_VAULT',
      'SIDE_QUESTS',
      'RITUALS',
      'LAWS',
      'TANG_KINH_CAC',
      'SETTINGS',
    ];
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const num = Number(e.key);
        if (num >= 1 && num <= 9 && tabMap[num - 1]) {
          e.preventDefault();
          setFocusedStrikeId(null);
          setSelectedGoalId(null);
          setOuterTab(tabMap[num - 1]);
          return;
        }
      }

      if (commandPaletteOpen) return;

      if (focusedStrikeId && !isTyping) {
        if (e.code === 'Space') {
          e.preventDefault();
          handleTogglePomoRun();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleExitFocusMode();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandPaletteOpen, focusedStrikeId, handleTogglePomoRun, handleExitFocusMode]);

  const getMountainStats = useCallback(
    (goalId: string): MountainStats => {
      const goalStrikes = db.dailyStrikes.filter((s) => s.goalId === goalId);
      const completedStrikes = goalStrikes.filter((s) => s.status === 'COMPLETED');
      const todayPendingStrikes = goalStrikes.filter((s) => s.status !== 'COMPLETED');
      const totalPomoMins = goalStrikes.reduce(
        (sum, s) => sum + (s.completedPomodoroMins || 0),
        0
      );
      const totalPomoHours = Number((totalPomoMins / 60).toFixed(1));

      let proofPhotosCount = 0;
      for (const s of goalStrikes) {
        if (s.proofPhotosList && s.proofPhotosList.length > 0) {
          proofPhotosCount += s.proofPhotosList.length;
        } else if (s.proofPhotoUri) {
          proofPhotosCount += 1;
        }
      }

      return {
        totalStrikes: goalStrikes.length,
        completedCount: completedStrikes.length,
        pendingCount: todayPendingStrikes.length,
        totalPomoMins,
        totalPomoHours,
        proofPhotosCount,
        journalsCount: db.reflectionJournals.filter((j) => j.goalId === goalId).length,
        violationsCount: db.violations.filter((v) => v.goalId === goalId).length,
      };
    },
    [db.dailyStrikes, db.reflectionJournals, db.violations]
  );

  // Ritual Groups stats today (respecting weekday schedule)
  const ritualStatsToday = useMemo(() => {
    const groups = db.ritualGroups || [];
    let totalItems = 0;
    let completedItems = 0;
    for (const g of groups) {
      for (const item of g.items) {
        if (!isRitualScheduledForDate(item, todayStr)) continue;
        totalItems++;
        if (item.completedDates?.[todayStr]) {
          completedItems++;
        }
      }
    }
    const pct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 100;
    return {
      totalItems,
      completedItems,
      pct: totalItems === 0 ? 0 : pct,
      groupCount: groups.length,
    };
  }, [db.ritualGroups, todayStr]);

  // Goal Create / Edit Handlers
  const handleOpenCreateGoalModal = () => {
    setEditingGoalId(null);
    setGoalTitleDraft('');
    setGoalCategoryDraft('Ngoại Ngữ & Chứng Chỉ');
    setGoalDescDraft('');
    setGoalVowDraft(
      'Tương lai nhìn lại sẽ là cảm ơn vì hôm nay đã nỗ lực hết mình, chứ không phải hai chữ "Giá như..."'
    );
    setGoalHasDeadlineDraft(false);
    const defaultDate = new Date(Date.now() + 60 * 86400000);
    setGoalTargetDateDraft(getTodayDateStr(defaultDate.getTime()));
    setGoalMilestonesDraft([]);
    setNewMilestoneText('');
    setGoalModalOpen(true);
  };

  const handleOpenEditGoalModal = (goal: PeakGoalEntity) => {
    setEditingGoalId(goal.id);
    setGoalTitleDraft(goal.title);
    setGoalCategoryDraft(goal.category || 'Mục Tiêu Trọng Điểm');
    setGoalDescDraft(goal.description);
    setGoalVowDraft(
      goal.futureSelfVow ||
        'Tương lai nhìn lại sẽ là cảm ơn vì hôm nay đã nỗ lực hết mình, chứ không phải hai chữ "Giá như..."'
    );
    if (goal.targetEndTime || goal.targetDays) {
      setGoalHasDeadlineDraft(true);
      const ms = goal.targetEndTime || goal.createdAt + (goal.targetDays || 60) * 86400000;
      setGoalTargetDateDraft(getTodayDateStr(ms));
    } else {
      setGoalHasDeadlineDraft(false);
      const defaultDate = new Date(Date.now() + 60 * 86400000);
      setGoalTargetDateDraft(getTodayDateStr(defaultDate.getTime()));
    }
    setGoalMilestonesDraft(goal.milestones && goal.milestones.length > 0 ? [...goal.milestones] : []);
    setNewMilestoneText('');
    setGoalModalOpen(true);
  };

  const handleSaveGoalModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalTitleDraft.trim()) return;

    const cleanMilestones = goalMilestonesDraft.filter((m) => m.title.trim().length > 0);
    const completedMsCount = cleanMilestones.filter((m) => m.isCompleted).length;
    const computedPct =
      cleanMilestones.length > 0 ? Math.round((completedMsCount / cleanMilestones.length) * 100) : 0;

    let finalTargetDays: number | undefined = undefined;
    let finalTargetEndTime: number | undefined = undefined;
    if (goalHasDeadlineDraft && goalTargetDateDraft) {
      const [y, m, d] = goalTargetDateDraft.split('-').map(Number);
      const targetMs = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
      finalTargetEndTime = targetMs;
      const baseTime = editingGoalId
        ? db.peakGoals.find((g) => g.id === editingGoalId)?.createdAt || nowTick
        : nowTick;
      finalTargetDays = Math.max(1, Math.ceil((targetMs - baseTime) / 86400000));
    }

    if (editingGoalId) {
      persistDb((prev) => ({
        ...prev,
        peakGoals: prev.peakGoals.map((g) =>
          g.id === editingGoalId
            ? {
                ...g,
                title: goalTitleDraft.trim(),
                category: goalCategoryDraft.trim() || 'Mục Tiêu Lớn',
                description: goalDescDraft.trim(),
                futureSelfVow: goalVowDraft.trim(),
                targetDays: finalTargetDays,
                targetEndTime: finalTargetEndTime,
                milestones: cleanMilestones,
                targetMetric: Math.max(1, cleanMilestones.length),
                currentMetric: completedMsCount,
                progressPct: computedPct,
              }
            : g
        ),
      }));
      showSternMessage(
        'ĐÃ CẬP NHẬT ĐỈNH NÚI',
        `Đã lưu thay đổi cho ngọn núi: "${goalTitleDraft.trim()}".`,
        'info'
      );
    } else {
      const newGoal: PeakGoalEntity = {
        id: `goal-${Date.now()}`,
        sessionId: db.session.id,
        title: goalTitleDraft.trim(),
        category: goalCategoryDraft.trim() || 'Mục Tiêu Lớn',
        description: goalDescDraft.trim() || 'Mục tiêu trọng điểm cần chinh phục dứt điểm.',
        futureSelfVow:
          goalVowDraft.trim() ||
          'Tương lai nhìn lại sẽ là cảm ơn vì đã nỗ lực, chứ không phải là "Giá như..."',
        unit: 'mục',
        targetMetric: Math.max(1, cleanMilestones.length),
        currentMetric: completedMsCount,
        progressPct: computedPct,
        targetDays: finalTargetDays,
        targetEndTime: finalTargetEndTime,
        milestones: cleanMilestones,
        isCompleted: false,
        createdAt: nowTick,
      };
      soundEngine.playTempleBell(0.85);
      persistDb((prev) => ({
        ...prev,
        peakGoals: [newGoal, ...prev.peakGoals],
      }));
      showSternMessage(
        '⛰️ ĐÃ DỰNG NGỌN NÚI MỚI ĐỂ CHINH PHỤC!',
        `Ngọn núi "${newGoal.title}" đã sẵn sàng. Hãy bấm vào ngọn núi để bắt đầu lên danh sách Công Phá mỗi ngày!`,
        'seal'
      );
    }
    setGoalModalOpen(false);
  };

  // Checklist Handlers
  const handleToggleMilestone = (goalId: string, milestoneId: string) => {
    soundEngine.playWoodenFish(0.65);
    persistDb((prev) => ({
      ...prev,
      peakGoals: prev.peakGoals.map((g) => {
        if (g.id !== goalId || !g.milestones) return g;
        const nextMilestones = g.milestones.map((m) =>
          m.id === milestoneId
            ? {
                ...m,
                isCompleted: !m.isCompleted,
                completedAt: !m.isCompleted ? nowTick : undefined,
              }
            : m
        );
        const doneCount = nextMilestones.filter((m) => m.isCompleted).length;
        const pct =
          nextMilestones.length > 0 ? Math.round((doneCount / nextMilestones.length) * 100) : 0;
        return {
          ...g,
          milestones: nextMilestones,
          currentMetric: doneCount,
          targetMetric: nextMilestones.length,
          progressPct: pct,
        };
      }),
    }));
  };

  const handleQuickAddChecklistItem = (goalId: string, rawTitle: string) => {
    const title = rawTitle.trim();
    if (!title) return;
    soundEngine.playWoodenFish(0.65);
    persistDb((prev) => ({
      ...prev,
      peakGoals: prev.peakGoals.map((g) => {
        if (g.id !== goalId) return g;
        const nextList: MountainMilestoneItem[] = [
          ...(g.milestones || []),
          {
            id: `chk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            title,
            isCompleted: false,
          },
        ];
        const doneCount = nextList.filter((m) => m.isCompleted).length;
        return {
          ...g,
          unit: 'mục',
          milestones: nextList,
          currentMetric: doneCount,
          targetMetric: nextList.length,
          progressPct: Math.round((doneCount / nextList.length) * 100),
        };
      }),
    }));
  };

  const handleDeleteChecklistItem = (goalId: string, itemId: string) => {
    soundEngine.playWoodenFish(0.5);
    persistDb((prev) => ({
      ...prev,
      peakGoals: prev.peakGoals.map((g) => {
        if (g.id !== goalId) return g;
        const nextList = (g.milestones || []).filter((m) => m.id !== itemId);
        const doneCount = nextList.filter((m) => m.isCompleted).length;
        return {
          ...g,
          milestones: nextList,
          currentMetric: doneCount,
          targetMetric: nextList.length,
          progressPct: nextList.length > 0 ? Math.round((doneCount / nextList.length) * 100) : 0,
        };
      }),
    }));
  };

  // Conquer Ceremony
  const handleLaunchConquerMountainCeremony = (goal: PeakGoalEntity) => {
    soundEngine.playTempleBell(1.0);
    const goalStrikes = db.dailyStrikes.filter((s) => s.goalId === goal.id);
    const goalJournals = db.reflectionJournals.filter((j) => j.goalId === goal.id);
    const goalViolations = db.violations.filter((v) => v.goalId === goal.id);
    const totalPomoMins = goalStrikes.reduce(
      (sum, s) => sum + (s.completedPomodoroMins || 0),
      0
    );
    const totalHours = Number((totalPomoMins / 60).toFixed(1));
    const daysSpent = Math.max(
      1,
      Math.ceil((nowTick - (goal.createdAt || db.session.startTime)) / 86400000)
    );
    let totalProofPhotos = 0;
    for (const s of goalStrikes) {
      if (s.proofPhotosList && s.proofPhotosList.length > 0) {
        totalProofPhotos += s.proofPhotosList.length;
      } else if (s.proofPhotoUri) {
        totalProofPhotos += 1;
      }
    }

    const completedGoalSnapshot: PeakGoalEntity = {
      ...goal,
      progressPct: 100,
      isCompleted: true,
      completedAt: nowTick,
      milestones: (goal.milestones || []).map((m) => ({ ...m, isCompleted: true })),
    };

    const newScroll: SacredScrollEntity = {
      id: `scroll-${Date.now()}`,
      sessionId: db.session.id,
      goalId: goal.id,
      title: `Chứng Nhận Chinh Phục: ${goal.title}`,
      mottoText: goal.futureSelfVow || db.session.mottoText,
      futureSelfVow: goal.futureSelfVow || db.session.mottoText,
      sealedAt: nowTick,
      totalDaysSpent: daysSpent,
      initialDaysCommitted: goal.targetDays || db.session.initialDays,
      totalPomodoroHours: totalHours,
      totalCompletedTodos: goalStrikes.filter((s) => s.status === 'COMPLETED').length,
      totalProofPhotos,
      totalJournals: goalJournals.length,
      violationCount: goalViolations.length,
      sealHash: `CHU-SA-${Math.random().toString(16).substring(2, 10).toUpperCase()}`,
      snapshotJson: JSON.stringify({
        session: db.session,
        goals: [completedGoalSnapshot],
        rituals: [],
        ritualGroups: db.ritualGroups || [],
        strikes: goalStrikes,
        journals: goalJournals,
        violations: goalViolations,
      }),
      exportedPdfUri: null,
    };

    setConqueringGoalId(goal.id);
    setCeremonyScroll(newScroll);
  };

  const handleFinishConquerCeremony = () => {
    if (!ceremonyScroll) return;
    persistDb((prev) => ({
      ...prev,
      peakGoals: prev.peakGoals.map((g) =>
        g.id === conqueringGoalId
          ? {
              ...g,
              progressPct: 100,
              isCompleted: true,
              completedAt: nowTick,
              milestones: (g.milestones || []).map((m) => ({ ...m, isCompleted: true })),
            }
          : g
      ),
      sacredScrolls: [
        ceremonyScroll,
        ...prev.sacredScrolls.filter((s) => s.goalId !== conqueringGoalId),
      ],
    }));
    setCeremonyScroll(null);
    setConqueringGoalId(null);
    setSelectedGoalId(null);
    setOuterTab('TANG_KINH_CAC');
    showSternMessage(
      '🏆 ĐẠI SỰ VIÊN THÀNH — ĐÃ LƯU CHỨNG NHẬN VÀO TÀNG KINH CÁC!',
      'Toàn bộ lịch sử Todo Công Phá, chuỗi ảnh bằng chứng theo mốc thời gian và nhật ký Tự Vấn của Đỉnh Núi đã được đóng dấu lưu trữ vĩnh viễn.',
      'seal'
    );
  };

  // PoW & Strike Completion Handlers
  const handleToggleStrikeRequiresPhoto = (strikeId: string) => {
    soundEngine.playWoodenFish(0.5);
    persistDb((prev) => ({
      ...prev,
      dailyStrikes: prev.dailyStrikes.map((s) =>
        s.id === strikeId ? { ...s, requiresPhoto: !s.requiresPhoto } : s
      ),
    }));
  };

  const getUnsavedActualMinsForStrike = useCallback(
    (strike: DailyStrikeTodoEntity): number => {
      if (focusedStrikeId === strike.id) {
        const rem = getLiveRemainingSeconds();
        const elapsedSecs = Math.max(0, pomoTotalSeconds - rem);
        return elapsedSecs > 0 ? Math.max(1, Math.round(elapsedSecs / 60)) : 0;
      }
      if (strike.savedPomoSecondsLeft != null && strike.savedPomoTotalSeconds != null) {
        const elapsedSecs = Math.max(
          0,
          strike.savedPomoTotalSeconds - strike.savedPomoSecondsLeft
        );
        return elapsedSecs > 0 ? Math.max(1, Math.round(elapsedSecs / 60)) : 0;
      }
      return 0;
    },
    [focusedStrikeId, getLiveRemainingSeconds, pomoTotalSeconds]
  );

  const handleCompleteStrikeAction = (strike: DailyStrikeTodoEntity) => {
    const isDone = strike.status === 'COMPLETED';
    if (isDone) {
      soundEngine.playWoodenFish(0.5);
      persistDb((prev) => ({
        ...prev,
        dailyStrikes: prev.dailyStrikes.map((s) =>
          s.id === strike.id ? { ...s, status: 'IN_PROGRESS' } : s
        ),
      }));
      return;
    }

    const hasPhoto =
      Boolean(strike.proofPhotoUri) ||
      Boolean(strike.proofPhotosList && strike.proofPhotosList.length > 0);
    if (strike.requiresPhoto && !hasPhoto) {
      setProofModalTarget({
        strikeId: strike.id,
        title: strike.title,
        markCompleteAfterProof: true,
      });
      return;
    }

    const extraMins = getUnsavedActualMinsForStrike(strike);
    if (focusedStrikeId === strike.id) {
      handleResetPomoTimer(pomoStartMinsRef.current);
    }

    const doneNow = Date.now();
    soundEngine.playWoodblockStampSound();
    persistDb((prev) => ({
      ...prev,
      focusSessionLogs:
        extraMins > 0
          ? [
              buildFocusSessionLog(
                strike,
                extraMins,
                'POMODORO_EARLY_FINISH',
                todayStr,
                prev.peakGoals,
                doneNow
              ),
              ...(prev.focusSessionLogs || []),
            ]
          : prev.focusSessionLogs || [],
      dailyStrikes: prev.dailyStrikes.map((s) =>
        s.id === strike.id
          ? {
              ...s,
              status: 'COMPLETED',
              completedAt: doneNow,
              completedPomodoroMins: (s.completedPomodoroMins || 0) + extraMins,
              pomodoroSessionsCount:
                extraMins > 0 ? (s.pomodoroSessionsCount || 0) + 1 : s.pomodoroSessionsCount || 0,
              savedPomoSecondsLeft: null,
              savedPomoTotalSeconds: null,
              savedPomoSelectedMins: null,
            }
          : s
      ),
    }));
  };

  const handleProofConfirmed = async (
    stampedDataUrl: string,
    analysis: ProofAnalysisResult,
    caption: string
  ) => {
    if (!proofModalTarget) return;
    const { strikeId, markCompleteAfterProof } = proofModalTarget;
    setProofModalTarget(null);

    // Upload image to external storage (/api/proofs/upload -> filename in data/proofs/)
    const storedUri = await desktopBridge.uploadProofImage(stampedDataUrl, 'pow');

    const targetStrike = dbRef.current.dailyStrikes.find((s) => s.id === strikeId);
    const extraMins =
      markCompleteAfterProof && targetStrike ? getUnsavedActualMinsForStrike(targetStrike) : 0;
    if (markCompleteAfterProof && focusedStrikeId === strikeId) {
      handleResetPomoTimer(pomoStartMinsRef.current);
    }

    const powNow = Date.now();
    soundEngine.playWoodblockStampSound();
    persistDb((prev) => ({
      ...prev,
      focusSessionLogs:
        extraMins > 0 && targetStrike
          ? [
              buildFocusSessionLog(
                targetStrike,
                extraMins,
                'POMODORO_EARLY_FINISH',
                todayStr,
                prev.peakGoals,
                powNow
              ),
              ...(prev.focusSessionLogs || []),
            ]
          : prev.focusSessionLogs || [],
      dailyStrikes: prev.dailyStrikes.map((s) => {
        if (s.id !== strikeId) return s;
        const nextCompletedMins = (s.completedPomodoroMins || 0) + extraMins;
        const newPhotoItem: StrikeProofPhotoItem = {
          id: `proof-${powNow}`,
          uri: storedUri,
          caption: caption || s.title,
          capturedAt: powNow,
          pomodoroMins: nextCompletedMins,
        };
        const existingList = s.proofPhotosList || [];
        return {
          ...s,
          status: markCompleteAfterProof ? 'COMPLETED' : s.status,
          completedAt: markCompleteAfterProof ? powNow : s.completedAt,
          completedPomodoroMins: nextCompletedMins,
          pomodoroSessionsCount:
            extraMins > 0 ? (s.pomodoroSessionsCount || 0) + 1 : s.pomodoroSessionsCount || 0,
          savedPomoSecondsLeft: markCompleteAfterProof ? null : s.savedPomoSecondsLeft,
          savedPomoTotalSeconds: markCompleteAfterProof ? null : s.savedPomoTotalSeconds,
          savedPomoSelectedMins: markCompleteAfterProof ? null : s.savedPomoSelectedMins,
          proofPhotoUri: storedUri,
          proofPhotoCaption: caption,
          proofPhotosList: [newPhotoItem, ...existingList],
          proofAnalysis: analysis,
        };
      }),
    }));

    showSternMessage(
      '📷 ĐÃ LƯU ẢNH BẰNG CHỨNG VÀO TÀNG KINH CÁC!',
      'Bức ảnh đã được lưu tách rời vào kho lưu trữ và gắn dấu mốc thời gian thực tế.',
      'seal'
    );
  };

  // Global stats across all mountains
  const globalStats = useMemo(() => {
    const activeGoals = db.peakGoals.filter((g) => !g.isCompleted);
    const conqueredGoals = db.peakGoals.filter((g) => g.isCompleted);
    const mountainStrikes = db.dailyStrikes.filter((s) => s.goalId !== SIDE_QUEST_GOAL_ID);
    const totalCompletedTodos = mountainStrikes.filter((s) => s.status === 'COMPLETED').length;
    const totalPomoMins = mountainStrikes.reduce(
      (sum, s) => sum + (s.completedPomodoroMins || 0),
      0
    );
    return {
      activeGoalsCount: activeGoals.length,
      conqueredCount: Math.max(conqueredGoals.length, db.sacredScrolls.length),
      totalCompletedTodos,
      totalPomoHours: Number((totalPomoMins / 60).toFixed(1)),
    };
  }, [db.peakGoals, db.dailyStrikes, db.sacredScrolls]);

  // Side Quests stats (shift-aware across midnight for NIGHT shift)
  const sideQuestStats = useMemo(() => {
    const all = db.dailyStrikes.filter((s) => s.goalId === SIDE_QUEST_GOAL_ID);
    const today = all.filter((s) => s.date === todayStr);
    const doneToday = all.filter(
      (s) =>
        s.status === 'COMPLETED' &&
        s.completedAt &&
        getShiftDateStr(s.completedAt, activeShiftMode, nightShiftStartTime) === todayStr
    );
    const pending = all.filter((s) => s.status !== 'COMPLETED');
    const focusMinsToday = doneToday.reduce((sum, s) => sum + (s.completedPomodoroMins || 0), 0);
    return { all, today, doneToday, pending, focusMinsToday };
  }, [db.dailyStrikes, todayStr, activeShiftMode, nightShiftStartTime]);

  const createSideQuest = (title: string, mins: number, startFocusNow: boolean) => {
    const clean = title.trim();
    if (!clean) return;
    const inferredAct =
      sideQuestActivityType !== 'CHORE'
        ? sideQuestActivityType
        : inferTodoActivityType({ goalId: SIDE_QUEST_GOAL_ID, title: clean }, new Map());
    const created: DailyStrikeTodoEntity = {
      id: `side-${Date.now()}`,
      goalId: SIDE_QUEST_GOAL_ID,
      date: todayStr,
      title: clean,
      notes: '',
      activityType: inferredAct,
      status: 'PENDING',
      requiredPomodoroMins: Math.max(5, mins),
      completedPomodoroMins: 0,
      pomodoroSessionsCount: 0,
      requiresPhoto: sideQuestRequiresPhoto,
      proofPhotoUri: null,
      proofPhotosList: [],
      proofAnalysis: null,
      createdAt: Date.now(),
    };
    soundEngine.playWoodenFish(0.6);
    persistDb((prev) => ({ ...prev, dailyStrikes: [created, ...prev.dailyStrikes] }));
    if (startFocusNow) {
      soundEngine.playTempleBell(0.85);
      enterFocusModeForStrike(created, true);
    }
  };

  const handleUpdateSideQuest = useCallback(
    (
      strikeId: string,
      patch: {
        title: string;
        notes?: string;
        activityType: TodoActivityType;
        requiredPomodoroMins: number;
        requiresPhoto: boolean;
      }
    ) => {
      const cleanTitle = patch.title.trim();
      if (!cleanTitle) return;
      soundEngine.playWoodenFish(0.6);
      persistDb((prev) => ({
        ...prev,
        dailyStrikes: prev.dailyStrikes.map((s) =>
          s.id === strikeId
            ? {
                ...s,
                title: cleanTitle,
                notes: patch.notes ?? '',
                activityType: patch.activityType,
                requiredPomodoroMins: Math.max(5, Math.min(180, patch.requiredPomodoroMins || 15)),
                requiresPhoto: patch.requiresPhoto,
              }
            : s
        ),
      }));
      showSternMessage('✏️ ĐÃ CẬP NHẬT VIỆC VẶT', `Đã lưu thay đổi cho "${cleanTitle}".`, 'seal');
    },
    [persistDb, showSternMessage]
  );

  const handleCreateStrikeFromSlot = useCallback(
    (params: {
      goalId: string;
      title: string;
      notes?: string;
      pomodoroMins: number;
      scheduledTime?: string;
      enterFocusNow?: boolean;
    }) => {
      const clean = params.title.trim();
      if (!clean || !params.goalId) return;
      const goalsMap = new Map(dbRef.current.peakGoals.map((g) => [g.id, g]));
      const created: DailyStrikeTodoEntity = {
        id: `strike-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        goalId: params.goalId,
        date: todayStr,
        title: clean,
        notes: params.notes || '',
        activityType: inferTodoActivityType({ goalId: params.goalId, title: clean }, goalsMap),
        scheduledTime: params.scheduledTime,
        status: 'PENDING',
        requiredPomodoroMins: Math.max(5, Math.min(180, params.pomodoroMins || 25)),
        completedPomodoroMins: 0,
        pomodoroSessionsCount: 0,
        requiresPhoto: true,
        proofPhotoUri: null,
        proofPhotosList: [],
        proofAnalysis: null,
        createdAt: Date.now(),
      };
      soundEngine.playWoodenFish(0.65);
      persistDb((prev) => ({
        ...prev,
        dailyStrikes: [created, ...prev.dailyStrikes],
      }));
      if (params.enterFocusNow) {
        soundEngine.playTempleBell(0.85);
        enterFocusModeForStrike(created, true);
      } else {
        showSternMessage(
          '⚔️ ĐÃ LÊN CÔNG PHÁ TỪ LỊCH TRÌNH AI!',
          `Đã thêm "${created.title}" vào danh sách Công Phá hôm nay.`,
          'seal'
        );
      }
    },
    [todayStr, persistDb, enterFocusModeForStrike, showSternMessage]
  );

  // Đợt 2: 1-Click Populate All Today's AI CLIMB Slots Into Daily Strikes
  const handlePopulateTodayFromSchedule = useCallback(() => {
    const plan = dbRef.current.climbingSchedulePlan;
    if (!plan || !Array.isArray(plan.days)) return;
    const todayDow = getDayOfWeekFromDateStr(todayStr);
    const dayObj = plan.days.find((d) => d.dayOfWeek === todayDow);
    if (!dayObj) return;

    const goalsMap = new Map(dbRef.current.peakGoals.map((g) => [g.id, g]));
    const climbSlots = dayObj.slots.filter((sl) => sl.kind === 'CLIMB' && sl.goalId && goalsMap.has(sl.goalId));
    if (climbSlots.length === 0) {
      showSternMessage(
        'HÔM NAY KHÔNG CÓ KHUNG LEO NÚI NÀO',
        'Ngày hôm nay trên lịch là ngày nghỉ / tổng kết hoặc chưa có Đỉnh Núi gắn vào.',
        'info'
      );
      return;
    }

    const existingToday = dbRef.current.dailyStrikes.filter((s) => s.date === todayStr);
    const toCreate: DailyStrikeTodoEntity[] = [];

    climbSlots.forEach((sl, idx) => {
      const timeRange = `${sl.startTime}-${sl.endTime}`;
      const alreadyExists = existingToday.some(
        (s) => s.goalId === sl.goalId && s.scheduledTime === timeRange
      );
      if (alreadyExists) return;
      const g = goalsMap.get(sl.goalId!);
      const title = sl.suggestedTask || `Công phá ${g?.title || sl.title}`;
      toCreate.push({
        id: `strike-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
        goalId: sl.goalId!,
        date: todayStr,
        title,
        notes: sl.notes || `Khởi tạo tự động từ Lịch AI (${timeRange})`,
        activityType: inferTodoActivityType({ goalId: sl.goalId!, title }, goalsMap),
        scheduledTime: timeRange,
        status: 'PENDING',
        requiredPomodoroMins: Math.max(5, Math.min(180, sl.pomodoroMins || 45)),
        completedPomodoroMins: 0,
        pomodoroSessionsCount: 0,
        requiresPhoto: true,
        proofPhotoUri: null,
        proofPhotosList: [],
        proofAnalysis: null,
        createdAt: Date.now() + idx,
      });
    });

    if (toCreate.length === 0) {
      soundEngine.playWoodenFish(0.6);
      showSternMessage(
        '✓ TOÀN BỘ LỊCH HÔM NAY ĐÃ CÓ TODO',
        'Mọi khung giờ leo núi hôm nay đều đã được tạo Todo Công Phá rồi!',
        'info'
      );
      return;
    }

    soundEngine.playWoodblockStampSound();
    persistDb((prev) => ({
      ...prev,
      dailyStrikes: [...toCreate.reverse(), ...prev.dailyStrikes],
    }));
    showSternMessage(
      `⚡ ĐÃ ĐỔ ${toCreate.length} TODO CÔNG PHÁ CHO HÔM NAY!`,
      'Tất cả các khung leo núi hôm nay đã sẵn sàng trong các Đỉnh Núi & Bảng Việc Cần Làm.',
      'seal'
    );
  }, [todayStr, persistDb, showSternMessage]);

  // Đợt 2: Save / Load / Delete Shift Schedule Profiles
  const handleSaveScheduleProfile = useCallback(
    (name: string) => {
      const plan = dbRef.current.climbingSchedulePlan;
      if (!plan) return;
      const cleanName = name.trim() || 'Mẫu lịch tuần';
      const profile: SavedScheduleProfile = {
        id: `sprof-${Date.now()}`,
        name: cleanName,
        savedAt: Date.now(),
        shiftMode: plan.shiftMode,
        dayShiftStartTime: plan.dayWorkStartTime || dayShiftStartTime,
        nightShiftStartTime: plan.nightWorkStartTime || nightShiftStartTime,
        plan: JSON.parse(JSON.stringify(plan)),
      };
      soundEngine.playWoodblockStampSound();
      persistDb((prev) => ({
        ...prev,
        savedScheduleProfiles: [profile, ...(prev.savedScheduleProfiles || [])],
      }));
      showSternMessage(
        '📂 ĐÃ LƯU MẪU LỊCH THEO CA!',
        `Đã lưu mẫu "${cleanName}". Từ nay bạn có thể đổi sang lịch này chỉ với 1 click.`,
        'seal'
      );
    },
    [dayShiftStartTime, nightShiftStartTime, persistDb, showSternMessage]
  );

  const handleLoadScheduleProfile = useCallback(
    (profileId: string) => {
      const found = (dbRef.current.savedScheduleProfiles || []).find((p) => p.id === profileId);
      if (!found) return;
      soundEngine.playTempleBell(0.9);
      const parsedNight = parseShiftStartHM(found.nightShiftStartTime, 19);
      persistDb((prev) => ({
        ...prev,
        climbingSchedulePlan: JSON.parse(JSON.stringify(found.plan)),
        session: {
          ...prev.session,
          lawConfig: {
            ...getLawConfig(prev),
            workShiftMode: found.shiftMode,
            dayShiftStartTime: found.dayShiftStartTime,
            nightShiftStartTime: found.nightShiftStartTime,
            nightShiftStartHour: parsedNight.hour,
          },
        },
      }));
      showSternMessage(
        `📂 ĐÃ ÁP DỤNG MẪU: "${found.name}"`,
        `Đã chuyển sang Lịch Tuần + Ca ${
          found.shiftMode === 'NIGHT'
            ? `Đêm (${found.nightShiftStartTime})`
            : `Ngày (${found.dayShiftStartTime})`
        } & đồng bộ Luật Núi!`,
        'seal'
      );
    },
    [persistDb, showSternMessage]
  );

  const handleDeleteScheduleProfile = useCallback(
    (profileId: string) => {
      soundEngine.playWoodenFish(0.5);
      persistDb((prev) => ({
        ...prev,
        savedScheduleProfiles: (prev.savedScheduleProfiles || []).filter((p) => p.id !== profileId),
      }));
    },
    [persistDb]
  );

  // Smart Time Audit Manual Logging & Config Handlers
  const handleAddManualTimeLog = useCallback(
    (params: {
      date: string;
      activityType: TodoActivityType;
      title: string;
      durationMins: number;
    }) => {
      const cleanTitle = params.title.trim();
      if (!cleanTitle) return;
      const mins = Math.max(1, Math.min(1440, Math.round(params.durationMins || 30)));
      const now = Date.now();
      const entry: FocusSessionLogEntity = {
        id: `mlog-${now}-${Math.random().toString(36).slice(2, 6)}`,
        date: params.date || todayStr,
        startedAt: now - mins * 60000,
        endedAt: now,
        durationMins: mins,
        activityType: params.activityType,
        title: cleanTitle,
        source: 'MANUAL_LOG',
      };
      soundEngine.playWoodblockStampSound();
      persistDb((prev) => ({
        ...prev,
        focusSessionLogs: [entry, ...(prev.focusSessionLogs || [])],
      }));
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      const durText = h > 0 ? `${h}h ${m}p (${mins} phút)` : `${mins} phút`;
      showSternMessage(
        '⏱️ ĐÃ GHI SỔ QUỸ THỜI GIAN',
        `Đã cộng +${durText} "${cleanTitle}" vào ngày ${entry.date}.`,
        'seal'
      );
    },
    [todayStr, persistDb, showSternMessage]
  );

  const handleDeleteTimeLog = useCallback(
    (logId: string) => {
      soundEngine.playWoodenFish(0.5);
      persistDb((prev) => ({
        ...prev,
        focusSessionLogs: (prev.focusSessionLogs || []).filter((l) => l.id !== logId),
      }));
    },
    [persistDb]
  );

  const handleUpdateTimeAuditConfig = useCallback(
    (patch: Partial<TimeAuditConfig>) => {
      persistDb((prev) => ({
        ...prev,
        session: {
          ...prev.session,
          timeAuditConfig: {
            ...(prev.session.timeAuditConfig || {}),
            ...patch,
          },
        },
      }));
    },
    [persistDb]
  );

  const handleConfirmWorkShift = useCallback(
    (record: DailyWorkShiftRecord) => {
      soundEngine.playWoodblockStampSound();
      persistDb((prev) => ({
        ...prev,
        dailyWorkShiftLogs: {
          ...(prev.dailyWorkShiftLogs || {}),
          [record.date]: record,
        },
      }));
      const h = Math.floor(record.workDurationMins / 60);
      const m = record.workDurationMins % 60;
      const durText = record.isDayOffNoWork
        ? '0h (Hôm nay nghỉ làm)'
        : `${h > 0 ? `${h}h ` : ''}${m}p (${record.workStartTime}${
            record.workEndTime ? ` → ${record.workEndTime}` : ''
          })`;
      showSternMessage(
        '🏠 ĐÃ CHỐT GIỜ ĐI LÀM & TÍNH QUỸ RẢNH',
        `Ngày ${record.date}: Đã ghi nhận thời gian đi làm ${durText}. Hệ thống đã tự động cập nhật realtime Quỹ Thời Gian Rảnh 24h.`,
        'seal'
      );
    },
    [persistDb, showSternMessage]
  );

  const handleClearWorkShift = useCallback(
    (dateStr: string) => {
      soundEngine.playWoodenFish(0.5);
      persistDb((prev) => {
        const next = { ...(prev.dailyWorkShiftLogs || {}) };
        delete next[dateStr];
        return {
          ...prev,
          dailyWorkShiftLogs: next,
        };
      });
    },
    [persistDb]
  );

  const pinnedOptimizationNotes = useMemo(() => {
    const all = db.optimizationNotes || [];
    return [...all].sort((a, b) => {
      if (Boolean(a.isPinned) !== Boolean(b.isPinned)) return a.isPinned ? -1 : 1;
      return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
    });
  }, [db.optimizationNotes]);

  const handleSaveQuickOptimizationNote = useCallback(
    (params: {
      title: string;
      content: string;
      category: OptimizationCategory;
      timeSavedHint?: string;
    }) => {
      const now = Date.now();
      const created: OptimizationNoteEntity = {
        id: `opt-${now}-${Math.random().toString(36).slice(2, 6)}`,
        title: params.title,
        content: params.content,
        category: params.category,
        goalId:
          focusedStrike && focusedStrike.goalId !== SIDE_QUEST_GOAL_ID
            ? focusedStrike.goalId
            : undefined,
        timeSavedHint: params.timeSavedHint,
        isPinned: true,
        appliedCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      soundEngine.playWoodblockStampSound();
      persistDb((prev) => ({
        ...prev,
        optimizationNotes: [created, ...(prev.optimizationNotes || [])],
      }));
      showSternMessage(
        '💡 ĐÃ LƯU Ý TƯỞNG VÀO SỔ BÍ KÍP!',
        `Đã lưu "${created.title}" vào Sổ Bí Kíp Tối Ưu.`,
        'seal'
      );
    },
    [focusedStrike, persistDb, showSternMessage]
  );

  const handleApplyOptimizationNote = useCallback(
    (note: OptimizationNoteEntity) => {
      soundEngine.playWoodenFish(0.75);
      const nextCount = (note.appliedCount || 0) + 1;
      persistDb((prev) => ({
        ...prev,
        optimizationNotes: (prev.optimizationNotes || []).map((n) =>
          n.id === note.id
            ? { ...n, appliedCount: nextCount, lastAppliedDate: todayStr, updatedAt: Date.now() }
            : n
        ),
      }));
      showSternMessage(
        '⚡ ĐÃ ÁP DỤNG BÍ KÍP TỐI ƯU!',
        `Đã ghi nhận áp dụng "${note.title}" (${nextCount} lần).`,
        'seal'
      );
    },
    [todayStr, persistDb, showSternMessage]
  );

  const focusIsSideQuest = focusedStrike?.goalId === SIDE_QUEST_GOAL_ID;
  const focusContextTitle = focusIsSideQuest
    ? '🧹 Việc Vặt (Không Goal)'
    : db.peakGoals.find((g) => g.id === focusedStrike?.goalId)?.title || 'Đỉnh Núi đã xóa';

  const focusedActivityType = useMemo<TodoActivityType>(() => {
    if (!focusedStrike) return 'DEEP_WORK';
    return inferTodoActivityType(
      focusedStrike,
      new Map(db.peakGoals.map((g) => [g.id, g]))
    );
  }, [focusedStrike, db.peakGoals]);

  const liveActiveSession = useMemo<LiveActiveSessionInput | null>(() => {
    if (!focusedStrike) return null;
    const elapsedSecs = Math.max(0, pomoTotalSeconds - pomoSecondsLeft);
    const elapsedMins = elapsedSecs >= 30 ? Math.max(1, Math.round(elapsedSecs / 60)) : 0;
    if (elapsedMins <= 0) return null;
    return {
      strikeId: focusedStrike.id,
      goalId: focusedStrike.goalId,
      title: focusedStrike.title,
      activityType: focusedActivityType,
      elapsedMins,
      date: todayStr,
    };
  }, [focusedStrike, focusedActivityType, pomoTotalSeconds, pomoSecondsLeft, todayStr]);

  const todayTimeAudit = useMemo(
    () => computeDayTimeAudit(db, todayStr, todayStr, nowTick, liveActiveSession),
    [db, todayStr, nowTick, liveActiveSession]
  );

  return (
    <div className={`monk-app-shell ${focusedStrike ? 'fullscreen-todo-mode' : ''}`}>
      <ShanshuiCanvasBg
        isMonkModeOn={false}
        isLockScreenView={false}
        reduceMotion={Boolean(db.session.reduceMotion)}
      />

      {/* Stern Toast Banner */}
      {sternToast && (
        <div className={`stern-toast-banner toast-${sternToast.type}`}>
          <div className="stern-toast-content">
            <AlertTriangle size={20} />
            <div>
              <strong>{sternToast.title}</strong>
              <p>{sternToast.message}</p>
            </div>
          </div>
          <button type="button" className="stern-toast-close" onClick={() => setSternToast(null)}>
            Đã rõ
          </button>
        </div>
      )}

      {/* Offline Catch-Up Banner */}
      {db.session.pendingOfflineReport && !focusedStrike && (
        <div
          className={`offline-catchup-banner ${
            db.session.pendingOfflineReport.missedDeadlineWhileOffline ||
            db.session.pendingOfflineReport.missedDates.length > 0
              ? 'is-violation'
              : 'is-info'
          }`}
        >
          <div className="offline-catchup-body">
            <Cpu size={22} />
            <div>
              <strong>
                {db.session.pendingOfflineReport.missedDeadlineWhileOffline
                  ? '⏰ PHÁT HIỆN TẮT MÁY TRƯỚC GIỜ CHỐT SỔ — ĐÃ TỰ ĐỘNG XÉT DUYỆT BÙ!'
                  : '🛡️ BÁO CÁO ĐỐI SOÁT THỜI GIAN CHẠY NỀN'}
              </strong>
              <p>{db.session.pendingOfflineReport.summary}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className="zen-btn zen-btn-outline"
              onClick={() => setViolationModalOpen(true)}
            >
              Xem Sổ Án
            </button>
            <button
              type="button"
              className="stern-toast-close"
              onClick={() =>
                persistDb((prev) => ({
                  ...prev,
                  session: { ...prev.session, pendingOfflineReport: null },
                }))
              }
            >
              Đã hiểu & Xác nhận
            </button>
          </div>
        </div>
      )}

      {/* TOP COMMAND HEADER */}
      {!focusedStrike && (
        <header className="monk-top-header v3-top-header">
          <div
            className="brand-identity"
            style={{ cursor: 'pointer' }}
            onClick={() => {
              setSelectedGoalId(null);
              setFocusedStrikeId(null);
              setOuterTab('GOALS_LIST');
            }}
          >
            <div className="brand-seal-icon">山</div>
            <div>
              <div className="brand-subtitle">HỆ THỐNG PHÁT TRIỂN BẢN THÂN & KỶ LUẬT THÉP</div>
              <h1 className="brand-title">LÊN NÚI (ASCEND THE MOUNTAIN)</h1>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginTop: 8,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <span className="time-window-pill">
                  ⛰️ {db.peakGoals.length} Đỉnh Núi &bull; ⚔️ {globalStats.totalCompletedTodos}{' '}
                  Todo đã xong ({globalStats.totalPomoHours}h Pomodoro)
                </span>
                <span
                  className={`daemon-live-pill ${daemonStatus?.ok ? 'online' : 'offline'}`}
                  title={
                    daemonStatus?.ok
                      ? `Trình chạy nền đang bảo vệ kỷ luật (PID ${daemonStatus.pid || '-'})`
                      : 'Đang mở dạng trình duyệt tĩnh (khuyên chạy qua script để kích hoạt chạy nền 24/7)'
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedGoalId(null);
                    setFocusedStrikeId(null);
                    setOuterTab('SETTINGS');
                  }}
                >
                  <Cpu size={12} />
                  <span>{daemonStatus?.ok ? 'Chạy nền 24/7: BẬT' : 'Chưa bật trình nền'}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="hero-vow-banner">
            <div className="hero-vow-top-row">
              <div className="hero-vow-tag">
                <Sparkles size={14} color="#f0c878" />
                <span>TÂM NIỆM SỐNG — KHÔNG ĐỂ MỘT GIÂY PHÚT NÀO LÃNG PHÍ</span>
              </div>

              <div className="hero-datetime-box">
                <div className="hero-calendar-date">
                  <Calendar size={15} color="#7DBFA8" />
                  <span>
                    Hôm nay: <strong style={{ color: '#F6F4EE' }}>{displayDateVn}</strong>
                  </span>
                </div>

                <button
                  type="button"
                  className={`shift-mode-pill ${
                    activeShiftMode === 'NIGHT' ? 'night-shift' : 'day-shift'
                  }`}
                  onClick={() =>
                    handleSwitchWorkShift(activeShiftMode === 'NIGHT' ? 'DAY' : 'NIGHT')
                  }
                  title={`Đang áp dụng: ${
                    activeShiftMode === 'NIGHT'
                      ? `Ca Đêm (vào ca ${nightShiftStartTime} – chốt ${nightShiftStartTime} hôm sau)`
                      : `Ca Ngày (vào ca ${dayShiftStartTime} – chốt 23:59)`
                  }. Bấm để chuyển đổi ca.`}
                >
                  {activeShiftMode === 'NIGHT' ? (
                    <>
                      <Moon size={13} color="#f0c878" />
                      <span>Ca Đêm (vào {nightShiftStartTime})</span>
                    </>
                  ) : (
                    <>
                      <Sun size={13} color="#ffb74d" />
                      <span>Ca Ngày (vào {dayShiftStartTime})</span>
                    </>
                  )}
                </button>

                <span className="hero-deadline-hint">
                  Hạn chót: <strong>{timeLeftToday.deadlineTitle}</strong> (còn {timeLeftToday.label})
                </span>

                <button
                  type="button"
                  className={`header-audit-pill ${
                    todayTimeAudit.verdictLevel === 'AWAITING_WORK_LOG'
                      ? 'is-awaiting'
                      : todayTimeAudit.wastedMins >= 150
                      ? 'has-waste'
                      : 'is-clean'
                  }`}
                  onClick={() => {
                    setSelectedGoalId(null);
                    setFocusedStrikeId(null);
                    setOuterTab('TIME_AUDIT');
                  }}
                  title="Bấm để mở Bảng Kiểm Toán Quỹ Thời Gian & Chốt Giờ Đi Làm Về"
                >
                  <PieChart size={13} />
                  {todayTimeAudit.verdictLevel === 'AWAITING_WORK_LOG' ? (
                    <span>🏠 Chờ xác nhận đã đi làm về</span>
                  ) : (
                    <span>
                      Hiệu suất: <strong>{todayTimeAudit.utilizationPct}%</strong> &bull; Lãng phí:{' '}
                      <strong>{todayTimeAudit.wastedMins}p</strong>
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  className="header-cmd-pill"
                  onClick={() => setCommandPaletteOpen(true)}
                  title="Mở bảng tìm kiếm nhanh toàn app (Ctrl+K)"
                >
                  <Search size={12} />
                  <span>Tìm nhanh (Ctrl+K)</span>
                </button>
              </div>
            </div>

            <div className="hero-vow-body-row">
              <div className="motto-quote-display-large">
                “{selectedGoal?.futureSelfVow || db.session.mottoText}”
              </div>

              <div
                className="hero-streak-badge"
                title={`Chuỗi kỷ luật: Bạn đã kiên trì ${db.session.currentStreak} ngày liên tục không vi phạm luật núi! Bấm để xem Sổ Luật.`}
                onClick={() => {
                  setSelectedGoalId(null);
                  setFocusedStrikeId(null);
                  setOuterTab('LAWS');
                }}
              >
                <div className="hero-streak-icon-wrap">
                  <Flame size={28} color="#ff9800" className="streak-flame-anim" />
                </div>
                <div className="hero-streak-text-wrap">
                  <div className="hero-streak-number">
                    {db.session.currentStreak} <span className="hero-streak-unit">NGÀY</span>
                  </div>
                  <div className="hero-streak-label">CHUỖI KỶ LUẬT</div>
                </div>
              </div>
            </div>
          </div>

          <div
            className={`violation-critical-card ${
              db.session.violationCount > 0 ? 'has-violations' : 'zero-violations'
            }`}
            onClick={() => setViolationModalOpen(true)}
            title="Bấm để xem Sổ Án Vi Phạm & Cơ chế Hệ thống tự động xét Luật Núi"
          >
            <div className="violation-card-top">
              <div className="violation-title-badge">
                {db.session.violationCount > 0 ? (
                  <>
                    <ShieldAlert size={18} />
                    <span>CẢNH BÁO VI PHẠM LUẬT NÚI</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={18} color="#7DBFA8" />
                    <span>TRẠNG THÁI KỶ LUẬT LUẬT NÚI</span>
                  </>
                )}
              </div>
              <span className="violation-count-pill">
                {db.session.violationCount > 0
                  ? `${db.session.violationCount} LẦN VI PHẠM`
                  : '0 VI PHẠM'}
              </span>
            </div>

            <div className="violation-card-body">
              {db.session.violationCount > 0 ? (
                <p className="violation-warning-text">
                  ⚠️ <strong>NGHIÊM TRỌNG:</strong> Hệ thống đã ghi nhận{' '}
                  <strong>{db.session.violationCount} lần vi phạm Luật Núi</strong>! Mỗi lần bỏ dở
                  Todo hoặc Nghi thức trong ngày là một vết sẹo kéo lùi ngày chạm đỉnh.
                </p>
              ) : todayLawPreview.length > 0 ? (
                <p className="violation-warning-text">
                  ⏳ <strong>CHƯA CÓ VI PHẠM:</strong> Hôm nay còn{' '}
                  <strong>{todayLawPreview.length} nghĩa vụ</strong> cần hoàn thành trước{' '}
                  {timeLeftToday.deadlineTitle} (còn {timeLeftToday.label}).
                </p>
              ) : (
                <p className="violation-warning-text">
                  ✅ <strong>KỶ LUẬT NGHIÊM MINH:</strong> Chưa có lỗi vi phạm nào. Hệ thống tự động
                  xét duyệt Todo & Nghi thức (ngưỡng ≥{lawConfig.ritualPassThresholdPct ?? 70}%) vào{' '}
                  {timeLeftToday.deadlineTitle}.
                </p>
              )}
            </div>

            <div className="violation-card-footer">
              <span>
                {db.violations[0]
                  ? `Gần nhất (${db.violations[0].date}): ${db.violations[0].reason.slice(0, 42)}...`
                  : 'Hệ thống tự động tính xét theo Bộ Luật Núi'}
              </span>
              <span className="violation-action-link">Xem Luật & Sổ Án &rarr;</span>
            </div>
          </div>
        </header>
      )}

      {/* NAVIGATION BAR */}
      {!focusedStrike &&
        (!selectedGoal ? (
          <nav className="monk-module-nav outer-nine-tabs-nav">
            <button
              type="button"
              className={`module-nav-tab ${outerTab === 'GOALS_LIST' ? 'active' : ''}`}
              onClick={() => setOuterTab('GOALS_LIST')}
            >
              <Mountain size={20} />
              <div>
                <div className="tab-main-name">1. Các Đỉnh Núi</div>
                <div className="tab-sub-role">{db.peakGoals.length} mục tiêu đang theo dõi</div>
              </div>
            </button>

            <button
              type="button"
              className={`module-nav-tab ${outerTab === 'AI_SCHEDULE' ? 'active' : ''}`}
              onClick={() => setOuterTab('AI_SCHEDULE')}
            >
              <Bot size={20} />
              <div>
                <div className="tab-main-name">2. Lịch Trình AI</div>
                <div className="tab-sub-role">
                  {db.climbingSchedulePlan
                    ? db.climbingSchedulePlan.shiftMode === 'NIGHT'
                      ? 'Ca Đêm • Lịch 7 ngày'
                      : 'Ca Ngày • Lịch 7 ngày'
                    : 'Xếp khung giờ cân bằng'}
                </div>
              </div>
            </button>

            <button
              type="button"
              className={`module-nav-tab ${outerTab === 'TIME_AUDIT' ? 'active' : ''}`}
              onClick={() => setOuterTab('TIME_AUDIT')}
            >
              <PieChart size={20} />
              <div>
                <div className="tab-main-name">3. Quỹ Thời Gian</div>
                <div className="tab-sub-role">
                  {todayTimeAudit.verdictLevel === 'AWAITING_WORK_LOG'
                    ? 'Chờ bấm "Đã đi làm về" • Tính quỹ rảnh 24h'
                    : `Tận dụng ${todayTimeAudit.utilizationPct}% • Điểm ${todayTimeAudit.realEffortScore}/100`}
                </div>
              </div>
            </button>

            <button
              type="button"
              className={`module-nav-tab ${outerTab === 'OPTIMIZATION_VAULT' ? 'active' : ''}`}
              onClick={() => setOuterTab('OPTIMIZATION_VAULT')}
            >
              <Lightbulb size={20} />
              <div>
                <div className="tab-main-name">4. Bí Kíp &amp; Ý Tưởng</div>
                <div className="tab-sub-role">
                  {(db.optimizationNotes || []).length} mẹo tối ưu hóa
                </div>
              </div>
            </button>

            <button
              type="button"
              className={`module-nav-tab ${outerTab === 'SIDE_QUESTS' ? 'active' : ''}`}
              onClick={() => setOuterTab('SIDE_QUESTS')}
            >
              <Sparkles size={20} />
              <div>
                <div className="tab-main-name">5. Việc Vặt</div>
                <div className="tab-sub-role">Còn {sideQuestStats.pending.length} việc chờ</div>
              </div>
            </button>

            <button
              type="button"
              className={`module-nav-tab ${outerTab === 'RITUALS' ? 'active' : ''}`}
              onClick={() => setOuterTab('RITUALS')}
            >
              <Flame size={20} />
              <div>
                <div className="tab-main-name">6. Nghi Thức</div>
                <div className="tab-sub-role">
                  {ritualStatsToday.completedItems}/{ritualStatsToday.totalItems} bước (
                  {ritualStatsToday.pct}%)
                </div>
              </div>
            </button>

            <button
              type="button"
              className={`module-nav-tab ${outerTab === 'LAWS' ? 'active' : ''}`}
              onClick={() => setOuterTab('LAWS')}
            >
              <Scale size={20} />
              <div>
                <div className="tab-main-name">7. Luật Núi</div>
                <div className="tab-sub-role">
                  {activeShiftMode === 'NIGHT' ? `Tự xét ${nightShiftStartTime}` : 'Tự xét 23:59'}
                </div>
              </div>
            </button>

            <button
              type="button"
              className={`module-nav-tab tab-tang-kinh-cac ${
                outerTab === 'TANG_KINH_CAC' ? 'active' : ''
              }`}
              onClick={() => setOuterTab('TANG_KINH_CAC')}
            >
              <ScrollText size={20} />
              <div>
                <div className="tab-main-name">8. Tàng Kinh Các</div>
                <div className="tab-sub-role">{db.sacredScrolls.length} núi đã chinh phục</div>
              </div>
            </button>

            <button
              type="button"
              className={`module-nav-tab ${outerTab === 'SETTINGS' ? 'active' : ''}`}
              onClick={() => {
                setConfirmResetMode('NONE');
                setOuterTab('SETTINGS');
              }}
            >
              <Settings size={20} />
              <div>
                <div className="tab-main-name">9. Cài Đặt &amp; Nền</div>
                <div className="tab-sub-role">Chạy nền, Auto-Start &amp; Data</div>
              </div>
            </button>
          </nav>
        ) : (
          <div className="inner-mountain-nav-wrapper">
            <div className="inner-mountain-context-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="zen-btn zen-btn-outline"
                  onClick={() => {
                    setFocusedStrikeId(null);
                    setSelectedGoalId(null);
                    setOuterTab('GOALS_LIST');
                  }}
                >
                  <ArrowLeft size={15} />
                  <span>Quay Lại Danh Sách Các Đỉnh Núi</span>
                </button>

                <div className="inner-mountain-title-pill">
                  <span className="zen-tag-red">ĐANG Ở TRÊN ĐỈNH NÚI</span>
                  <strong>⛰️ {selectedGoal.title}</strong>
                  <span className="pomo-pill">Tiến độ: {selectedGoal.progressPct}%</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {db.peakGoals.length > 1 && (
                  <select
                    className="zen-input"
                    style={{ padding: '6px 10px', fontSize: 12.5 }}
                    value={selectedGoal.id}
                    onChange={(e) => {
                      setFocusedStrikeId(null);
                      setSelectedGoalId(e.target.value);
                    }}
                  >
                    {db.peakGoals.map((g, idx) => (
                      <option key={g.id} value={g.id}>
                        Chuyển nhanh: Núi #{idx + 1} — {g.title.slice(0, 38)} ({g.progressPct}%)
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  className="zen-btn zen-btn-outline"
                  style={{ padding: '6px 11px', fontSize: 12.5 }}
                  onClick={() => {
                    setFocusedStrikeId(null);
                    setSelectedGoalId(null);
                    setOuterTab('LAWS');
                  }}
                >
                  <Scale size={14} />
                  <span>Đọc Luật Núi</span>
                </button>

                <button
                  type="button"
                  className="zen-btn zen-btn-outline"
                  style={{ padding: '6px 11px', fontSize: 12.5 }}
                  onClick={() => handleOpenEditGoalModal(selectedGoal)}
                >
                  <Edit3 size={14} />
                  <span>Sửa Ngọn Núi & Checklist</span>
                </button>

                <button
                  type="button"
                  className="zen-btn zen-btn-seal"
                  style={{ padding: '6px 13px', fontSize: 12.5 }}
                  onClick={() => handleLaunchConquerMountainCeremony(selectedGoal)}
                >
                  <Award size={15} />
                  <span>Đóng Dấu Chinh Phục Đỉnh Núi (Lưu Tàng Kinh Các)</span>
                </button>
              </div>
            </div>

            <nav className="monk-module-nav inner-four-tabs-nav">
              <button
                type="button"
                className={`module-nav-tab ${innerTab === 'DAILY_STRIKES' ? 'active' : ''}`}
                onClick={() => setInnerTab('DAILY_STRIKES')}
              >
                <Swords size={18} />
                <div>
                  <div className="tab-main-name">1. Công Phá (Todo & Focus Pomodoro)</div>
                  <div className="tab-sub-role">
                    Ấn vào từng Todo để vào màn hình tập trung toàn màn hình
                  </div>
                </div>
              </button>

              <button
                type="button"
                className={`module-nav-tab ${innerTab === 'REFLECTION' ? 'active' : ''}`}
                onClick={() => {
                  setFocusedStrikeId(null);
                  setInnerTab('REFLECTION');
                }}
              >
                <FileText size={18} />
                <div>
                  <div className="tab-main-name">2. Tự Vấn (Nhật Ký Đỉnh Núi)</div>
                  <div className="tab-sub-role">
                    Ghi chép bài học & tự vấn gắn riêng với ngọn núi này
                  </div>
                </div>
              </button>

              <button
                type="button"
                className={`module-nav-tab ${innerTab === 'MOUNTAIN_HISTORY' ? 'active' : ''}`}
                onClick={() => {
                  setFocusedStrikeId(null);
                  setInnerTab('MOUNTAIN_HISTORY');
                }}
              >
                <History size={18} />
                <div>
                  <div className="tab-main-name">3. Hành Trình & Bằng Chứng PoW</div>
                  <div className="tab-sub-role">Lịch sử Todo, Checklist & Ảnh bằng chứng</div>
                </div>
              </button>

              <button
                type="button"
                className={`module-nav-tab ${innerTab === 'RITUALS' ? 'active' : ''}`}
                onClick={() => {
                  setFocusedStrikeId(null);
                  setInnerTab('RITUALS');
                }}
              >
                <Flame size={18} />
                <div>
                  <div className="tab-main-name">4. Nghi Thức Đầu Buổi (Rituals)</div>
                  <div className="tab-sub-role">
                    Kiểm tra nhanh thói quen trước khi ngồi vào bàn học
                  </div>
                </div>
              </button>
            </nav>
          </div>
        ))}

      {/* MAIN WORKSPACE CONTENT */}
      <main className={`monk-workspace-main ${focusedStrike ? 'fullscreen-todo-main' : ''}`}>
        {focusedStrike && (
          <section className="module-block">
            <FocusChamberView
              focusedStrike={focusedStrike}
              focusIsSideQuest={focusIsSideQuest}
              focusContextTitle={focusContextTitle}
              pomoSecondsLeft={pomoSecondsLeft}
              pomoTotalSeconds={pomoTotalSeconds}
              pomoRunning={pomoRunning}
              pomoSelectedMins={pomoStartMinsRef.current}
              activityType={focusedActivityType}
              ambientMode={ambientMode}
              ambientVolume={ambientVolume}
              breakSecondsLeft={breakSecondsLeft}
              breakTotalSeconds={breakTotalSeconds}
              pinnedOptimizationNotes={pinnedOptimizationNotes}
              onExitFocus={handleExitFocusMode}
              onSelectDuration={(mins) => {
                const secs = mins * 60;
                pomoStartMinsRef.current = mins;
                pomoEndTimeMsRef.current = null;
                pomoCompletedGuardRef.current = false;
                pomoSecondsLeftRef.current = secs;
                setPomoRunning(false);
                setPomoTotalSeconds(secs);
                setPomoSecondsLeft(secs);
                persistDb((prev) => ({
                  ...prev,
                  dailyStrikes: prev.dailyStrikes.map((s) =>
                    s.id === focusedStrike.id
                      ? {
                          ...s,
                          requiredPomodoroMins: mins,
                          savedPomoSecondsLeft: null,
                          savedPomoTotalSeconds: null,
                          savedPomoSelectedMins: null,
                        }
                      : s
                  ),
                }));
              }}
              onToggleRun={handleTogglePomoRun}
              onResetTimer={() => handleResetPomoTimer()}
              onFinishActualSession={handleFinishActualPomoSession}
              onChangeActivityType={(nextType) => {
                soundEngine.playWoodenFish(0.5);
                persistDb((prev) => ({
                  ...prev,
                  dailyStrikes: prev.dailyStrikes.map((s) =>
                    s.id === focusedStrike.id ? { ...s, activityType: nextType } : s
                  ),
                }));
              }}
              onChangeAmbientMode={handleChangeAmbientMode}
              onChangeAmbientVolume={handleChangeAmbientVolume}
              onStartBreak={startBreakTimer}
              onCancelBreak={cancelBreakTimer}
              onUpdateNotes={(strikeId, notes) => {
                persistDb((prev) => ({
                  ...prev,
                  dailyStrikes: prev.dailyStrikes.map((s) =>
                    s.id === strikeId ? { ...s, notes } : s
                  ),
                }));
              }}
              onSaveQuickOptimizationNote={handleSaveQuickOptimizationNote}
              onApplyOptimizationNote={handleApplyOptimizationNote}
              onToggleRequiresPhoto={handleToggleStrikeRequiresPhoto}
              onOpenProofModal={(strike, markCompleteAfterProof) =>
                setProofModalTarget({
                  strikeId: strike.id,
                  title: strike.title,
                  markCompleteAfterProof,
                })
              }
              onCompleteStrikeAction={handleCompleteStrikeAction}
              onZoomPhoto={setZoomedHistoryPhoto}
            />
          </section>
        )}

        {!focusedStrike && !selectedGoal && (
          <>
            {outerTab === 'GOALS_LIST' && (
              <GoalsHubView
                peakGoals={db.peakGoals}
                nowTick={nowTick}
                todayStr={todayStr}
                climbingSchedulePlan={db.climbingSchedulePlan}
                getMountainStats={getMountainStats}
                onOpenCreateGoalModal={handleOpenCreateGoalModal}
                onOpenEditGoalModal={handleOpenEditGoalModal}
                onSelectGoal={(goalId) => {
                  soundEngine.playWoodenFish(0.6);
                  setSelectedGoalId(goalId);
                  setInnerTab('DAILY_STRIKES');
                  setFocusedStrikeId(null);
                }}
                onToggleChecklistItem={handleToggleMilestone}
                onRequestDeleteGoal={(goal, strikeCount) =>
                  setConfirmDeleteTarget({
                    kind: 'GOAL',
                    id: goal.id,
                    title: goal.title,
                    strikeCount,
                  })
                }
                onGoToRituals={() => setOuterTab('RITUALS')}
                onGoToAISchedule={() => setOuterTab('AI_SCHEDULE')}
              />
            )}

            {outerTab === 'AI_SCHEDULE' && (
              <AIScheduleView
                db={db}
                todayStr={todayStr}
                nowTick={nowTick}
                activeShiftMode={activeShiftMode}
                dayShiftStartTime={dayShiftStartTime}
                nightShiftStartTime={nightShiftStartTime}
                onPersistDb={persistDb}
                onCreateStrikeFromSlot={handleCreateStrikeFromSlot}
                onEnterFocusStrike={(strike) => enterFocusModeForStrike(strike, false)}
                onSelectGoal={(goalId) => {
                  soundEngine.playWoodenFish(0.6);
                  setSelectedGoalId(goalId);
                  setInnerTab('DAILY_STRIKES');
                  setFocusedStrikeId(null);
                }}
                onUpdateShiftConfig={handleUpdateShiftConfig}
                onPopulateTodayFromSchedule={handlePopulateTodayFromSchedule}
                onSaveScheduleProfile={handleSaveScheduleProfile}
                onLoadScheduleProfile={handleLoadScheduleProfile}
                onDeleteScheduleProfile={handleDeleteScheduleProfile}
                onPlayWoodenFish={(v) => soundEngine.playWoodenFish(v)}
                onPlayTempleBell={(v) => soundEngine.playTempleBell(v)}
                onShowMessage={showSternMessage}
              />
            )}

            {outerTab === 'TIME_AUDIT' && (
              <TimeAuditView
                db={db}
                todayStr={todayStr}
                nowTick={nowTick}
                activeShiftMode={activeShiftMode}
                dayShiftStartTime={dayShiftStartTime}
                nightShiftStartTime={nightShiftStartTime}
                liveActiveSession={liveActiveSession}
                onAddManualTimeLog={handleAddManualTimeLog}
                onDeleteTimeLog={handleDeleteTimeLog}
                onUpdateTimeAuditConfig={handleUpdateTimeAuditConfig}
                onConfirmWorkShift={handleConfirmWorkShift}
                onClearWorkShift={handleClearWorkShift}
                onGoToAIScheduleTab={() => setOuterTab('AI_SCHEDULE')}
                onSelectGoal={(goalId) => {
                  soundEngine.playWoodenFish(0.6);
                  setSelectedGoalId(goalId);
                  setInnerTab('DAILY_STRIKES');
                  setFocusedStrikeId(null);
                }}
              />
            )}

            {outerTab === 'OPTIMIZATION_VAULT' && (
              <OptimizationVaultView
                db={db}
                todayStr={todayStr}
                onPersistDb={persistDb}
                onPlayWoodenFish={(v) => soundEngine.playWoodenFish(v)}
                onPlayWoodblockStamp={() => soundEngine.playWoodblockStampSound()}
                onShowMessage={showSternMessage}
              />
            )}

            {outerTab === 'SIDE_QUESTS' && (
              <SideQuestsView
                todayStr={todayStr}
                templates={SIDE_QUEST_TEMPLATES}
                stats={sideQuestStats}
                sideQuestTitle={sideQuestTitle}
                sideQuestPomo={sideQuestPomo}
                sideQuestActivityType={sideQuestActivityType}
                sideQuestRequiresPhoto={sideQuestRequiresPhoto}
                sideQuestShowHistory={sideQuestShowHistory}
                onChangeTitle={setSideQuestTitle}
                onChangePomo={setSideQuestPomo}
                onChangeActivityType={setSideQuestActivityType}
                onToggleRequiresPhoto={() => setSideQuestRequiresPhoto((v) => !v)}
                onChangeShowHistory={setSideQuestShowHistory}
                onCreateSideQuest={createSideQuest}
                onUpdateSideQuest={handleUpdateSideQuest}
                onEnterFocusStrike={(strike, autoStart) =>
                  enterFocusModeForStrike(strike, Boolean(autoStart))
                }
                onCompleteStrikeAction={handleCompleteStrikeAction}
                onDeleteSideQuest={(strikeId) =>
                  persistDb((prev) => ({
                    ...prev,
                    dailyStrikes: prev.dailyStrikes.filter((s) => s.id !== strikeId),
                  }))
                }
                onZoomPhoto={setZoomedHistoryPhoto}
              />
            )}

            {outerTab === 'RITUALS' && (
              <RitualsView
                db={db}
                todayStr={todayStr}
                ritualStatsToday={ritualStatsToday}
                draggingRitualItem={draggingRitualItem}
                dragOverTargetIndex={dragOverTargetIndex}
                onPersistDb={persistDb}
                onPlayWoodenFish={(v) => soundEngine.playWoodenFish(v)}
                onRequestDeleteGroup={(group) =>
                  setConfirmDeleteTarget({
                    kind: 'RITUAL_GROUP',
                    id: group.id,
                    title: group.title,
                    itemCount: group.items.length,
                  })
                }
                onDragStartItem={handleDragStartRitualItem}
                onDragOverItem={handleDragOverRitualItem}
                onDropItem={handleDropRitualItem}
                onDragEndItem={handleDragEndRitualItem}
                onMoveItem={handleMoveRitualItem}
              />
            )}

            {outerTab === 'LAWS' && (
              <LawsView
                db={db}
                todayStr={todayStr}
                nowTick={nowTick}
                lawsActive={lawsActive}
                activeShiftMode={activeShiftMode}
                dayShiftStartTime={dayShiftStartTime}
                nightShiftStartTime={nightShiftStartTime}
                timeLeftToday={timeLeftToday}
                todayLawPreview={todayLawPreview}
                lawConfig={lawConfig}
                onAcceptLaws={handleAcceptLaws}
                onRunLawEvaluationTodayNow={handleRunLawEvaluationTodayNow}
                onSwitchWorkShift={handleSwitchWorkShift}
                onUpdateShiftConfig={handleUpdateShiftConfig}
                onToggleLaw={handleToggleLaw}
                onChangeRitualThresholdPct={handleChangeRitualThresholdPct}
                onToggleRitualItem={handleToggleRitualItemToday}
                onGoToRitualsTab={() => setOuterTab('RITUALS')}
                onSelectGoal={(goalId) => {
                  soundEngine.playWoodenFish(0.6);
                  setSelectedGoalId(goalId);
                  setInnerTab('DAILY_STRIKES');
                  setFocusedStrikeId(null);
                }}
                onGoToAIScheduleTab={() => setOuterTab('AI_SCHEDULE')}
                onRegisterRestDay={handleRegisterRestDay}
                onCancelRestDay={handleCancelRestDay}
                onChangeMaxMonthlyRestDays={handleChangeMaxMonthlyRestDays}
              />
            )}

            {outerTab === 'TANG_KINH_CAC' && (
              <TangKinhCacView
                db={db}
                todayStr={todayStr}
                sacredScrolls={db.sacredScrolls}
                onOpenScroll={(scroll) => {
                  soundEngine.playWoodenFish(0.65);
                  setViewingScroll(scroll);
                }}
              />
            )}

            {outerTab === 'SETTINGS' && (
              <SettingsView
                db={db}
                todayStr={todayStr}
                daemonStatus={daemonStatus}
                autoStartStatus={autoStartStatus}
                confirmResetMode={confirmResetMode}
                globalMottoDraft={globalMottoDraft}
                todayTaskModsCount={todayTaskMods.length}
                maxDailyTaskMods={maxDailyTaskMods}
                onSetConfirmResetMode={setConfirmResetMode}
                onChangeGlobalMottoDraft={setGlobalMottoDraft}
                onPersistDb={persistDb}
                onReplaceDb={setDb}
                onSetAutoStartStatus={setAutoStartStatus}
                onAnnounceLawVerdict={announceLawVerdict}
                onResetSelectedStateAfterWipe={(fresh) => {
                  setDb(fresh);
                  setSelectedGoalId(null);
                  setFocusedStrikeId(null);
                  setGlobalMottoDraft(fresh.session.mottoText);
                }}
                onPlayTempleBell={(v) => soundEngine.playTempleBell(v)}
                onShowMessage={showSternMessage}
              />
            )}
          </>
        )}

        {!focusedStrike && selectedGoal && (
          <GoalInnerView
            db={db}
            selectedGoal={selectedGoal}
            innerTab={innerTab}
            todayStr={todayStr}
            nowTick={nowTick}
            remainingTaskMods={remainingTaskMods}
            maxDailyTaskMods={maxDailyTaskMods}
            ritualStatsToday={ritualStatsToday}
            draggingRitualItem={draggingRitualItem}
            dragOverTargetIndex={dragOverTargetIndex}
            onChangeInnerTab={setInnerTab}
            onPersistDb={persistDb}
            onToggleMilestone={handleToggleMilestone}
            onQuickAddChecklistItem={handleQuickAddChecklistItem}
            onDeleteChecklistItem={handleDeleteChecklistItem}
            onEnterFocusStrike={(strike) => enterFocusModeForStrike(strike, false)}
            onCompleteStrikeAction={handleCompleteStrikeAction}
            onToggleStrikeRequiresPhoto={handleToggleStrikeRequiresPhoto}
            onOpenProofModal={(strike, markCompleteAfterProof) =>
              setProofModalTarget({
                strikeId: strike.id,
                title: strike.title,
                markCompleteAfterProof,
              })
            }
            onRequestEditStrike={handleRequestEditStrike}
            onRequestDeleteStrike={handleRequestDeleteStrike}
            onLaunchConquerCeremony={handleLaunchConquerMountainCeremony}
            onZoomPhoto={setZoomedHistoryPhoto}
            onPlayWoodenFish={(v) => soundEngine.playWoodenFish(v)}
            onPlayWoodblockStamp={() => soundEngine.playWoodblockStampSound()}
            onShowMessage={showSternMessage}
            onRequestDeleteRitualGroup={(group) =>
              setConfirmDeleteTarget({
                kind: 'RITUAL_GROUP',
                id: group.id,
                title: group.title,
                itemCount: group.items.length,
              })
            }
            onDragStartRitualItem={handleDragStartRitualItem}
            onDragOverRitualItem={handleDragOverRitualItem}
            onDropRitualItem={handleDropRitualItem}
            onDragEndRitualItem={handleDragEndRitualItem}
            onMoveRitualItem={handleMoveRitualItem}
          />
        )}
      </main>

      {/* GLOBAL MODALS */}
      <AppModals
        db={db}
        todayStr={todayStr}
        timeLeftTodayLabel={timeLeftToday.label}
        todayLawPreview={todayLawPreview}
        remainingTaskMods={remainingTaskMods}
        maxDailyTaskMods={maxDailyTaskMods}
        goalModalOpen={goalModalOpen}
        editingGoalId={editingGoalId}
        goalTitleDraft={goalTitleDraft}
        goalCategoryDraft={goalCategoryDraft}
        goalDescDraft={goalDescDraft}
        goalVowDraft={goalVowDraft}
        goalHasDeadlineDraft={goalHasDeadlineDraft}
        goalTargetDateDraft={goalTargetDateDraft}
        goalMilestonesDraft={goalMilestonesDraft}
        newMilestoneText={newMilestoneText}
        onCloseGoalModal={() => setGoalModalOpen(false)}
        onSaveGoalModal={handleSaveGoalModal}
        onChangeGoalTitle={setGoalTitleDraft}
        onChangeGoalCategory={setGoalCategoryDraft}
        onChangeGoalDesc={setGoalDescDraft}
        onChangeGoalVow={setGoalVowDraft}
        onChangeGoalHasDeadline={setGoalHasDeadlineDraft}
        onChangeGoalTargetDate={setGoalTargetDateDraft}
        onChangeGoalMilestones={setGoalMilestonesDraft}
        onChangeNewMilestoneText={setNewMilestoneText}
        confirmDeleteTarget={confirmDeleteTarget}
        onCancelDeleteTarget={() => setConfirmDeleteTarget(null)}
        onConfirmDeleteTarget={handleConfirmDeleteTarget}
        violationModalOpen={violationModalOpen}
        lawVerdict={lawVerdict}
        onCloseViolationModal={() => {
          setViolationModalOpen(false);
          setLawVerdict(null);
        }}
        onGoToLawsTab={() => {
          setViolationModalOpen(false);
          setLawVerdict(null);
          setFocusedStrikeId(null);
          setSelectedGoalId(null);
          setOuterTab('LAWS');
        }}
        onRunLawEvaluationTodayNow={handleRunLawEvaluationTodayNow}
        proofModalTarget={proofModalTarget}
        onConfirmProof={handleProofConfirmed}
        onCancelProof={() => setProofModalTarget(null)}
        viewingScroll={viewingScroll}
        ceremonyScroll={ceremonyScroll}
        onFinishCeremony={handleFinishConquerCeremony}
        onCloseScrollViewer={() => {
          setViewingScroll(null);
          setCeremonyScroll(null);
        }}
        onExportedScrollPdf={(scrollId, pdfPath) => {
          persistDb((prev) => ({
            ...prev,
            sacredScrolls: prev.sacredScrolls.map((s) =>
              s.id === scrollId ? { ...s, exportedPdfUri: pdfPath } : s
            ),
          }));
        }}
        zoomedHistoryPhoto={zoomedHistoryPhoto}
        onCloseZoomedPhoto={() => setZoomedHistoryPhoto(null)}
        strikeBeingEdited={strikeBeingEdited}
        editStrikeTitle={editStrikeTitle}
        editStrikePomo={editStrikePomo}
        editStrikeActivityType={editStrikeActivityType}
        editStrikeRequiresPhoto={editStrikeRequiresPhoto}
        onChangeEditStrikeTitle={setEditStrikeTitle}
        onChangeEditStrikePomo={setEditStrikePomo}
        onChangeEditStrikeActivityType={setEditStrikeActivityType}
        onToggleEditStrikeRequiresPhoto={() => setEditStrikeRequiresPhoto((v) => !v)}
        onCloseEditStrike={() => setStrikeBeingEdited(null)}
        onConfirmEditStrike={handleConfirmEditStrike}
        strikeBeingDeleted={strikeBeingDeleted}
        onCloseDeleteStrike={() => setStrikeBeingDeleted(null)}
        onConfirmDeleteStrike={handleConfirmDeleteStrike}
        showQuotaExhaustedModal={showQuotaExhaustedModal}
        onCloseQuotaExhaustedModal={() => setShowQuotaExhaustedModal(false)}
      />

      <QuickCommandPalette
        isOpen={commandPaletteOpen}
        db={db}
        onClose={() => setCommandPaletteOpen(false)}
        onSelectOuterTab={(tab) => {
          setFocusedStrikeId(null);
          setSelectedGoalId(null);
          setOuterTab(tab);
        }}
        onSelectGoal={(goalId) => {
          soundEngine.playWoodenFish(0.6);
          setFocusedStrikeId(null);
          setSelectedGoalId(goalId);
          setInnerTab('DAILY_STRIKES');
        }}
        onEnterFocusStrike={(strike) => enterFocusModeForStrike(strike, false)}
      />
    </div>
  );
};
