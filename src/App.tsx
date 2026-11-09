import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Mountain,
  Flame,
  Swords,
  BookOpen,
  ScrollText,
  Shield,
  Lock,
  Unlock,
  AlertTriangle,
  Plus,
  Check,
  Clock,
  Camera,
  Wallpaper,
  RotateCcw,
  Sparkles,
  Bell,
  Sliders,
  Eye,
  Trash2,
  Award,
  FileText,
  RefreshCw,
  Edit3,
  LayoutGrid,
  CheckSquare,
  Square,
} from 'lucide-react';
import {
  MonkDatabaseSchema,
  PeakGoalEntity,
  RitualHabitEntity,
  DailyStrikeTodoEntity,
  ReflectionJournalEntity,
  SacredScrollEntity,
  ProofAnalysisResult,
  ViolationRecord,
} from './types/models';
import { desktopBridge, RunningOSApp } from './services/desktopBridge';
import { createInitialDatabase, getTodayDateStr } from './services/defaultData';
import { soundEngine } from './utils/soundEngine';
import { analyzeReflectionText, renderMonkDesktopWallpaper } from './utils/proofOfWork';
import { ShanshuiCanvasBg } from './components/ShanshuiCanvasBg';
import { WoodblockSealSvg } from './components/WoodblockSealSvg';
import { PomodoroLockModal } from './components/PomodoroLockModal';
import { LiveProofModal } from './components/LiveProofModal';
import { RelentlessAlarmOverlay, ActiveNaggingAlert } from './components/RelentlessAlarmOverlay';
import { SacredScrollBookViewer } from './components/SacredScrollBookViewer';

type ActiveTab =
  | 'UNIFIED_4_IN_1'
  | 'PEAK_GOALS'
  | 'RITUALS'
  | 'DAILY_STRIKES'
  | 'REFLECTION'
  | 'TANG_KINH_CAC'
  | 'OS_LOCKDOWN';

interface ActivePomodoroTarget {
  type: 'RITUAL' | 'STRIKE';
  id: string;
  title: string;
  requiredMins: number;
  requiresPhoto: boolean;
}

interface ActiveProofTarget {
  type: 'RITUAL' | 'STRIKE';
  id: string;
  title: string;
  completedPomodoroMins: number;
}

export const App: React.FC = () => {
  // Initialize synchronously so UI renders 100% immediately on first paint
  const [db, setDb] = useState<MonkDatabaseSchema>(() => createInitialDatabase());
  const [activeTab, setActiveTab] = useState<ActiveTab>('UNIFIED_4_IN_1');
  const [isLockScreenOverlay, setIsLockScreenOverlay] = useState(false);

  // Dev / Simulation Controls
  const [devBarVisible, setDevBarVisible] = useState(true);
  const [simulatedTimeOffsetMs, setSimulatedTimeOffsetMs] = useState(0);
  const [forceOpenReflectionWindow, setForceOpenReflectionWindow] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());

  // Modals & Overlays
  const [activePomodoro, setActivePomodoro] = useState<ActivePomodoroTarget | null>(null);
  const [activeProof, setActiveProof] = useState<ActiveProofTarget | null>(null);
  const [naggingAlert, setNaggingAlert] = useState<ActiveNaggingAlert | null>(null);
  const [viewingScroll, setViewingScroll] = useState<SacredScrollEntity | null>(null);
  const [ceremonyScroll, setCeremonyScroll] = useState<SacredScrollEntity | null>(null);
  const [sternToast, setSternToast] = useState<{
    title: string;
    message: string;
    type: 'danger' | 'info' | 'seal';
  } | null>(null);

  // Editing Single Peak Goal & Session Motto
  const [editingPeakGoal, setEditingPeakGoal] = useState(false);
  const [goalTitleDraft, setGoalTitleDraft] = useState('');
  const [goalDescDraft, setGoalDescDraft] = useState('');
  const [goalTargetDraft, setGoalTargetDraft] = useState(100);
  const [goalUnitDraft, setGoalUnitDraft] = useState('điểm KPI');
  const [mottoDraft, setMottoDraft] = useState('');
  const [initialDaysDraft, setInitialDaysDraft] = useState(14);

  // New Ritual (Habit Tracker) Form
  const [newRitualTitle, setNewRitualTitle] = useState('');
  const [newRitualStart, setNewRitualStart] = useState('05:00');
  const [newRitualEnd, setNewRitualEnd] = useState('06:30');
  const [newRitualPomo, setNewRitualPomo] = useState(25);
  const [newRitualPhoto, setNewRitualPhoto] = useState(true);

  // New Daily Strike (Todo List) Form
  const [newStrikeTitle, setNewStrikeTitle] = useState('');
  const [newStrikeTime, setNewStrikeTime] = useState('14:00');
  const [newStrikeWeight, setNewStrikeWeight] = useState(25);
  const [newStrikePomo, setNewStrikePomo] = useState(25);

  // Reflection Journal Form
  const [journalDraft, setJournalDraft] = useState('');
  const [repentanceDraft, setRepentanceDraft] = useState('');
  const [focusRatingDraft, setFocusRatingDraft] = useState(5);
  const [clipboardBlockedMsg, setClipboardBlockedMsg] = useState<string | null>(null);

  // OS Lockdown Running Apps
  const [runningApps, setRunningApps] = useState<RunningOSApp[]>([]);
  const [newWhitelistName, setNewWhitelistName] = useState('');
  const [newWhitelistProcess, setNewWhitelistProcess] = useState('');
  const [wallpaperStatusMsg, setWallpaperStatusMsg] = useState<string | null>(null);

  const showSternMessage = useCallback(
    (title: string, message: string, type: 'danger' | 'info' | 'seal' = 'danger') => {
      setSternToast({ title, message, type });
    },
    []
  );

  // Hydrate from persistent DB on mount
  useEffect(() => {
    desktopBridge.loadDatabase().then((loaded) => {
      if (loaded && loaded.session) {
        // Ensure single Peak Goal invariant (mỗi lần chỉ leo 1 Đỉnh Núi duy nhất)
        const singleGoalList =
          loaded.peakGoals && loaded.peakGoals.length > 0
            ? [loaded.peakGoals[0]]
            : createInitialDatabase().peakGoals;
        const normalized = {
          ...loaded,
          peakGoals: singleGoalList,
        };
        setDb(normalized);
        setMottoDraft(normalized.session.mottoText);
        setInitialDaysDraft(normalized.session.initialDays);
        if (singleGoalList[0]) {
          setGoalTitleDraft(singleGoalList[0].title);
          setGoalDescDraft(singleGoalList[0].description);
          setGoalTargetDraft(singleGoalList[0].targetMetric);
          setGoalUnitDraft(singleGoalList[0].unit);
        }
      }
    });
  }, []);

  // Clock ticker (1s)
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Keyboard shortcut Ctrl+Shift+Alt+M (Developer Emergency Unlock) & BeforeUnload Guard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setDb((prev) => {
          const next = { ...prev, session: { ...prev.session, isMonkModeOn: false } };
          desktopBridge.saveDatabase(next);
          return next;
        });
        setNaggingAlert(null);
        desktopBridge.restoreWindowsWallpaper();
        showSternMessage(
          'KHẨN CẤP MỞ KHÓA DEVELOPER (Ctrl+Shift+Alt+M)',
          'Đã cưỡng bức mở khóa Monk Mode và khôi phục hình nền Windows gốc.',
          'info'
        );
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (db?.session.isMonkModeOn) {
        e.preventDefault();
        e.returnValue =
          'GIỚI LUẬT ĐANG KHÓA: Không được phép thoát ứng dụng khi đang ở trên đỉnh núi!';
        return e.returnValue;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [db?.session.isMonkModeOn, showSternMessage]);

  // Listen to Electron OS events
  useEffect(() => {
    if (!window.monkDesktopAPI) return;
    const unsubClose = window.monkDesktopAPI.onCloseBlocked((data) => {
      soundEngine.playViolationGong();
      showSternMessage('CHẶN ĐÓNG ỨNG DỤNG (ZERO-ESCAPE POLICY)', data.message, 'danger');
    });
    const unsubProc = window.monkDesktopAPI.onProcessBlocked((data) => {
      soundEngine.playWoodenFish(0.9);
      showSternMessage(
        'ĐÃ ĐÓNG BĂNG ỨNG DỤNG NGOÀI WHITELIST',
        `Hệ thống vừa chặn tiến trình giải trí/ngoài danh sách trắng: ${data.processName} (${data.title})`,
        'danger'
      );
    });
    const unsubDev = window.monkDesktopAPI.onDevEmergencyUnlock(() => {
      setDb((prev) => {
        const next = {
          ...prev,
          session: { ...prev.session, isMonkModeOn: false },
        };
        desktopBridge.saveDatabase(next);
        return next;
      });
      setNaggingAlert(null);
      showSternMessage(
        'DEV EMERGENCY OVERRIDE (Ctrl+Shift+Alt+M)',
        'Đã cưỡng bức mở khóa Monk Mode và khôi phục hình nền Windows gốc cho Developer.',
        'info'
      );
    });
    return () => {
      unsubClose();
      unsubProc();
      unsubDev();
    };
  }, [showSternMessage]);

  const effectiveNow = nowTick + simulatedTimeOffsetMs;
  const todayStr = getTodayDateStr(effectiveNow);
  const currentHour = new Date(effectiveNow).getHours();

  // Theo Mục 3.3 (Ảnh 2):
  // - Khi Monk Mode: OFF -> Viết tự do, không giới hạn độ dài tối thiểu (mở mọi lúc!)
  // - Khi Monk Mode: ON  -> Chỉ mở từ 20:00 đến 23:59 (hoặc khi bật giả lập giờ 21:00)
  const isReflectionWindowOpen =
    !db.session.isMonkModeOn ||
    forceOpenReflectionWindow ||
    (currentHour >= 20 && currentHour <= 23);

  useEffect(() => {
    desktopBridge.syncMonkLockState({
      isMonkModeOn: db.session.isMonkModeOn,
      whitelistedApps: db.session.whitelistedApps.map((w) => w.processName),
      processGuardEnabled: db.session.processGuardEnabled,
    });
  }, [db]);

  const persistDb = useCallback((updater: (prev: MonkDatabaseSchema) => MonkDatabaseSchema) => {
    setDb((prev) => {
      const updated = updater(prev);
      desktopBridge.saveDatabase(updated);
      return updated;
    });
  }, []);

  // Single Active Peak Goal (Mỗi lần chỉ leo 1 Đỉnh Núi duy nhất)
  const currentPeakGoal: PeakGoalEntity = useMemo(() => {
    return (
      db.peakGoals[0] || {
        id: 'goal-single-peak',
        sessionId: db.session.id,
        title: 'Chinh phục Đỉnh Núi Kỳ Tu Luyện',
        description: 'Mục tiêu lớn duy nhất của kỳ tu luyện.',
        unit: 'điểm KPI',
        targetMetric: 100,
        currentMetric: 0,
        progressPct: 0,
        isCompleted: false,
        createdAt: Date.now(),
      }
    );
  }, [db.peakGoals, db.session.id]);

  const overallProgressPct = Math.min(100, Math.max(0, Math.round(currentPeakGoal.progressPct)));
  const allGoals100Pct = overallProgressPct >= 100;
  const isTimeCommitmentReached = effectiveNow >= db.session.currentTargetEndTime;
  const isDualLockSatisfied = isTimeCommitmentReached && allGoals100Pct;
  const isOvertimeLockActive =
    Boolean(db.session.isMonkModeOn) && isTimeCommitmentReached && !allGoals100Pct;

  const countdownInfo = useMemo(() => {
    const diff = db.session.currentTargetEndTime - effectiveNow;
    if (diff <= 0) {
      return {
        text: 'ĐÃ ĐẾN HẠN XUỐNG NÚI (00 Ngày 00:00:00)',
        isExpired: true,
      };
    }
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return {
      text: `${String(days).padStart(2, '0')} Ngày ${String(hours).padStart(2, '0')}:${String(
        mins
      ).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
      isExpired: false,
    };
  }, [db.session.currentTargetEndTime, effectiveNow]);

  // Execute Mountain Law Violation Penalty (Section 3.2)
  const triggerMountainLawViolation = useCallback(
    (type: ViolationRecord['type'], detailReason: string) => {
      soundEngine.playViolationGong();

      const newTargetEndTime = effectiveNow + db.session.initialDays * 86400000;
      const violation: ViolationRecord = {
        id: `vio-${Date.now()}`,
        sessionId: db.session.id,
        timestamp: effectiveNow,
        date: todayStr,
        type,
        reason: detailReason,
        previousStreak: db.session.currentStreak,
        newTargetEndTime,
      };

      persistDb((prev) => ({
        ...prev,
        session: {
          ...prev.session,
          currentStreak: 0,
          violationCount: prev.session.violationCount + 1,
          currentTargetEndTime: newTargetEndTime,
        },
        violations: [violation, ...prev.violations],
      }));

      showSternMessage(
        'VI PHẠM LUẬT NÚI — CHẾ TÀI TỰ ĐỘNG THỰC THI',
        `“Giới luật đã phá. Chuỗi ngày tu luyện trở về con số không. Núi cao vẫn ở đó, thời gian xuống núi đã lùi lại.” (${detailReason} — Ngày xuống núi mới được cộng bù ${db.session.initialDays} ngày kể từ hôm nay).`,
        'danger'
      );
    },
    [db.session, effectiveNow, todayStr, persistDb, showSternMessage]
  );

  const applyLiveWallpaperToOS = useCallback(
    async (mode: 'HOME_TEMPLE' | 'LOCK_MOUNTAIN' = 'HOME_TEMPLE') => {
      setWallpaperStatusMsg(
        'Đang kết xuất tranh thủy mặc kèm Tâm Niệm & Tiến Độ lên màn hình Windows...'
      );
      const dataUrl = await renderMonkDesktopWallpaper({
        mottoText: db.session.mottoText,
        remainingDaysText: countdownInfo.text,
        progressPct: overallProgressPct,
        currentStreak: db.session.currentStreak,
        mode,
      });
      const res = await desktopBridge.setWindowsWallpaper(dataUrl);
      if (res.ok) {
        setWallpaperStatusMsg(
          `Đã cập nhật Hình nền Windows thành công (${
            mode === 'HOME_TEMPLE' ? 'Nhà sư & Ngôi chùa cổ' : 'Cảnh núi non trùng điệp'
          }). Bản gốc đã được sao lưu an toàn.`
        );
      } else {
        setWallpaperStatusMsg('Đã kết xuất tranh thủy mặc trong ứng dụng.');
      }
    },
    [db.session, countdownInfo.text, overallProgressPct]
  );

  // Toggle Monk Mode ON / OFF
  const handleToggleMonkMode = async () => {
    if (!db.session.isMonkModeOn) {
      soundEngine.playTempleBell(1.0);
      const now = effectiveNow;
      const targetEnd = now + db.session.initialDays * 86400000;

      persistDb((prev) => ({
        ...prev,
        session: {
          ...prev.session,
          isMonkModeOn: true,
          startTime: now,
          currentTargetEndTime: targetEnd,
        },
      }));
      setEditingPeakGoal(false);

      showSternMessage(
        'ĐÃ NHẬP THẤT LÊN NÚI (MONK MODE: ON — BẮT BUỘC PROOF OF WORK)',
        'Cửa hồng trần đã khép. Từ lúc này: (1) Nút OFF bị Khóa Kép, (2) Thực hiện Habit/Todo bắt buộc Khóa Pomodoro chống thoát 30s + Chụp ảnh trực tiếp qua Camera/Screen, (3) Tự Vấn bắt buộc >= 100 từ hợp lệ & chặn Copy/Paste!',
        'seal'
      );

      if (db.session.autoWallpaperEnabled) {
        setTimeout(() => {
          applyLiveWallpaperToOS('HOME_TEMPLE');
        }, 300);
      }
    } else {
      if (!isTimeCommitmentReached && !allGoals100Pct) {
        soundEngine.playViolationGong();
        showSternMessage(
          'KHÓA KÉP (DUAL-LOCK) TỪ CHỐI MỞ KHÓA',
          `Không có cửa thoát hiểm (Zero-Escape Policy). Bạn còn ${countdownInfo.text} và tiến độ Đỉnh Núi mới đạt ${overallProgressPct}% (Yêu cầu: Đủ thời gian VÀ đạt 100% Mục tiêu Đỉnh Núi).`,
          'danger'
        );
        return;
      }

      if (isTimeCommitmentReached && !allGoals100Pct) {
        soundEngine.playViolationGong();
        showSternMessage(
          'CHẾ ĐỘ CƯỠNG BỨC QUÁ GIỜ (OVERTIME LOCK — MỤC 3.1)',
          `Thời gian dự kiến xuống núi đã kết thúc nhưng tiến độ Đỉnh Núi mới đạt ${overallProgressPct}%. Hệ thống từ chối cho phép tắt Monk Mode! Bạn bắt buộc phải ở lại trên núi cho đến khi hoàn thành nốt ${
            100 - overallProgressPct
          }% công việc còn lại.`,
          'danger'
        );
        return;
      }

      if (!isTimeCommitmentReached && allGoals100Pct) {
        soundEngine.playViolationGong();
        showSternMessage(
          'CHƯA ĐỦ THỜI GIAN CAM KẾT TRÊN NÚI',
          `Dù tiến độ Đỉnh Núi đã đạt 100%, bạn vẫn phải giữ trọn giới luật thời gian đã cam kết trên núi (${countdownInfo.text} còn lại).`,
          'danger'
        );
        return;
      }

      // BOTH CONDITIONS SATISFIED -> Launch Sacred Scroll Compilation Ceremony!
      soundEngine.playWoodblockStampSound();
      const totalPomodoroMins =
        db.dailyStrikes.reduce((acc, s) => acc + (s.completedPomodoroMins || 0), 0) +
        db.ritualHabits.reduce((acc, r) => {
          const daysCount = Object.values(r.completionsByDate).reduce(
            (sum, c) => sum + (c.completedPomodoroMins || 0),
            0
          );
          return acc + daysCount;
        }, 0);

      const totalHours = Number(Math.max(12.5, totalPomodoroMins / 60).toFixed(1));
      const daysSpent = Math.max(
        db.session.initialDays,
        Math.ceil((effectiveNow - db.session.startTime) / 86400000)
      );

      const snapshotObj = {
        session: db.session,
        goals: [currentPeakGoal],
        rituals: db.ritualHabits,
        strikes: db.dailyStrikes,
        journals: db.reflectionJournals,
        violations: db.violations,
      };

      const newScroll: SacredScrollEntity = {
        id: `scroll-${Date.now()}`,
        sessionId: db.session.id,
        title: `Bí Kíp Đắc Đạo: ${currentPeakGoal.title.slice(0, 48)}`,
        mottoText: db.session.mottoText,
        sealedAt: effectiveNow,
        totalDaysSpent: daysSpent,
        initialDaysCommitted: db.session.initialDays,
        totalPomodoroHours: totalHours,
        violationCount: db.session.violationCount,
        sealHash: `CHU-SA-9E2A2B-${Math.random().toString(16).substring(2, 10).toUpperCase()}`,
        snapshotJson: JSON.stringify(snapshotObj),
        exportedPdfUri: null,
      };

      setCeremonyScroll(newScroll);
    }
  };

  const handleFinishDescendCeremony = async () => {
    if (!ceremonyScroll) return;
    persistDb((prev) => ({
      ...prev,
      session: {
        ...prev.session,
        isMonkModeOn: false,
      },
      sacredScrolls: [ceremonyScroll, ...prev.sacredScrolls],
    }));
    await desktopBridge.restoreWindowsWallpaper();
    setCeremonyScroll(null);
    setActiveTab('TANG_KINH_CAC');
    showSternMessage(
      'ĐẠI SỰ VIÊN THÀNH — ĐÃ CẤT BÍ KÍP VÀO TÀNG KINH CÁC',
      '“Phong sương đã vượt, đại sự viên thành. Dấu mộc đã đóng, cuốn bí kíp này là minh chứng cho đạo tâm bất động của bạn.” Hình nền Windows gốc đã được khôi phục.',
      'seal'
    );
  };

  // Toggle Ritual Checkbox when Monk Mode is OFF, or start Pomodoro Lock when Monk Mode is ON
  const handleRitualAction = (ritual: RitualHabitEntity) => {
    const isDoneToday = Boolean(ritual.completionsByDate[todayStr]);

    if (!db.session.isMonkModeOn) {
      // Khi Monk Mode: OFF -> Tự giác tích chọn (Checkbox thông thường), cho phép tích hoặc bỏ tích!
      soundEngine.playWoodenFish(0.65);
      persistDb((prev) => ({
        ...prev,
        ritualHabits: prev.ritualHabits.map((r) => {
          if (r.id !== ritual.id) return r;
          const nextCompletions = { ...r.completionsByDate };
          if (isDoneToday) {
            delete nextCompletions[todayStr];
          } else {
            nextCompletions[todayStr] = {
              date: todayStr,
              completedAt: effectiveNow,
              completedPomodoroMins: r.requiredPomodoroMins,
              proofPhotoUri: null,
            };
          }
          return {
            ...r,
            completionsByDate: nextCompletions,
          };
        }),
      }));
      return;
    }

    if (isDoneToday) return;

    // Khi Monk Mode: ON -> Bắt buộc Khóa Pomodoro + Chụp ảnh trực tiếp (nếu requiresPhoto)
    setActivePomodoro({
      type: 'RITUAL',
      id: ritual.id,
      title: ritual.title,
      requiredMins: ritual.requiredPomodoroMins,
      requiresPhoto: ritual.requiresPhoto,
    });
  };

  // Toggle Daily Strike (Todo) Checkbox when Monk Mode is OFF, or start Pomodoro + Live PoW when Monk Mode is ON
  const handleStrikeAction = (strike: DailyStrikeTodoEntity) => {
    const isDone = strike.status === 'COMPLETED';

    if (!db.session.isMonkModeOn) {
      // Khi Monk Mode: OFF -> Tự giác tích chọn (Checkbox thông thường), cộng/trừ trực tiếp % vào Đỉnh Núi!
      soundEngine.playWoodenFish(0.65);
      if (!isDone) {
        completeStrikeAndPushGoal(strike.id, strike.requiredPomodoroMins, null, null);
      } else {
        // Uncheck in OFF mode
        persistDb((prev) => {
          const updatedStrikes = prev.dailyStrikes.map((s) =>
            s.id === strike.id
              ? {
                  ...s,
                  status: 'PENDING' as const,
                  completedPomodoroMins: 0,
                  proofPhotoUri: null,
                  proofAnalysis: null,
                }
              : s
          );
          const updatedGoals = prev.peakGoals.map((g, idx) => {
            if (idx !== 0) return g;
            const newPct = Math.max(0, g.progressPct - strike.weightPct);
            const newMetric = Math.round((newPct / 100) * g.targetMetric);
            return {
              ...g,
              progressPct: newPct,
              currentMetric: newMetric,
              isCompleted: newPct >= 100,
            };
          });
          return { ...prev, dailyStrikes: updatedStrikes, peakGoals: updatedGoals };
        });
      }
      return;
    }

    if (isDone) return;

    // Khi Monk Mode: ON -> Bắt buộc Khóa Pomodoro + Chụp ảnh trực tiếp (Live Camera / Screen Evidence)
    setActivePomodoro({
      type: 'STRIKE',
      id: strike.id,
      title: strike.title,
      requiredMins: strike.requiredPomodoroMins,
      requiresPhoto: true,
    });
  };

  const completeStrikeAndPushGoal = (
    strikeId: string,
    completedMins: number,
    proofUri: string | null,
    proofAnalysis: ProofAnalysisResult | null
  ) => {
    persistDb((prev) => {
      const targetStrike = prev.dailyStrikes.find((s) => s.id === strikeId);
      if (!targetStrike || targetStrike.status === 'COMPLETED') return prev;

      const updatedStrikes = prev.dailyStrikes.map((s) =>
        s.id === strikeId
          ? {
              ...s,
              status: 'COMPLETED' as const,
              completedPomodoroMins: completedMins,
              proofPhotoUri: proofUri,
              proofAnalysis,
              completedAt: effectiveNow,
            }
          : s
      );

      const updatedGoals = prev.peakGoals.map((g, idx) => {
        if (idx !== 0) return g;
        const newPct = Math.min(100, g.progressPct + targetStrike.weightPct);
        const newCurrentMetric = Math.round((newPct / 100) * g.targetMetric);
        return {
          ...g,
          progressPct: newPct,
          currentMetric: newCurrentMetric,
          isCompleted: newPct >= 100,
        };
      });

      return {
        ...prev,
        dailyStrikes: updatedStrikes,
        peakGoals: updatedGoals,
      };
    });
  };

  const handlePomodoroFinished = (completedMins: number) => {
    if (!activePomodoro) return;
    const current = activePomodoro;
    setActivePomodoro(null);

    if (current.requiresPhoto) {
      setActiveProof({
        type: current.type,
        id: current.id,
        title: current.title,
        completedPomodoroMins: completedMins,
      });
    } else {
      soundEngine.playWoodblockStampSound();
      persistDb((prev) => ({
        ...prev,
        ritualHabits: prev.ritualHabits.map((r) =>
          r.id === current.id
            ? {
                ...r,
                completionsByDate: {
                  ...r.completionsByDate,
                  [todayStr]: {
                    date: todayStr,
                    completedAt: effectiveNow,
                    completedPomodoroMins: completedMins,
                    proofPhotoUri: null,
                  },
                },
              }
            : r
        ),
      }));
      showSternMessage(
        'NGHI THỨC ĐÃ HOÀN TẤT',
        `Đã hoàn thành khóa thiền định Pomodoro ${completedMins} phút cho Nghi thức: "${current.title}".`,
        'seal'
      );
    }
  };

  const handleProofConfirmed = (stampedDataUrl: string, analysis: ProofAnalysisResult) => {
    if (!activeProof) return;
    const current = activeProof;
    setActiveProof(null);

    if (current.type === 'RITUAL') {
      persistDb((prev) => ({
        ...prev,
        ritualHabits: prev.ritualHabits.map((r) =>
          r.id === current.id
            ? {
                ...r,
                completionsByDate: {
                  ...r.completionsByDate,
                  [todayStr]: {
                    date: todayStr,
                    completedAt: effectiveNow,
                    completedPomodoroMins: current.completedPomodoroMins,
                    proofPhotoUri: stampedDataUrl,
                    proofAnalysis: analysis,
                  },
                },
              }
            : r
        ),
      }));
      showSternMessage(
        'ĐÃ NGHIỆM THU BẰNG CHỨNG NGHI THỨC',
        `Bằng chứng hình ảnh hợp lệ (Độ sáng: ${analysis.brightness}, Độ nét: ${analysis.sharpness}). Nghi thức "${current.title}" đã được đóng dấu hoàn thành.`,
        'seal'
      );
    } else {
      completeStrikeAndPushGoal(
        current.id,
        current.completedPomodoroMins,
        stampedDataUrl,
        analysis
      );
      showSternMessage(
        'ĐÃ CÔNG PHÁ MỤC TIÊU & ĐẨY TIẾN ĐỘ ĐỈNH NÚI',
        `Nhiệm vụ "${current.title}" đã vượt qua kiểm duyệt Proof of Work và đẩy tiến độ Đỉnh Núi lên!`,
        'seal'
      );
    }
  };

  // Reflection Journal evaluation
  const journalAnalysis = useMemo(() => {
    return analyzeReflectionText(journalDraft);
  }, [journalDraft]);

  const todayJournalSubmitted = useMemo(() => {
    return db.reflectionJournals.find((j) => j.date === todayStr) || null;
  }, [db.reflectionJournals, todayStr]);

  const handleSubmitJournal = (e: React.FormEvent) => {
    e.preventDefault();

    if (db.session.isMonkModeOn && !journalAnalysis.isPassingInMonkMode) {
      soundEngine.playViolationGong();
      showSternMessage(
        'BỘ KIỂM DUYỆT TỰ VẤN TỪ CHỐI BẢN GHI (MONK MODE: ON)',
        journalAnalysis.reason ||
          'Khi bật Monk Mode, yêu cầu tối thiểu 100 từ hợp lệ và mật độ từ vựng (Lexical Diversity) >= 0.45.',
        'danger'
      );
      return;
    }

    if (!journalDraft.trim()) {
      showSternMessage('CHƯA NHẬP NỘI DUNG', 'Hãy nhập nội dung nhật ký Tự Vấn trước khi lưu.', 'danger');
      return;
    }

    const entry: ReflectionJournalEntity = {
      id: `journal-${Date.now()}`,
      sessionId: db.session.id,
      date: todayStr,
      content: journalDraft.trim(),
      validWordCount: journalAnalysis.validWordCount,
      lexicalDiversityScore: journalAnalysis.lexicalDiversityScore,
      submittedAt: effectiveNow,
      focusRating: focusRatingDraft,
      repentanceNote: repentanceDraft.trim() || 'Giữ vững đạo tâm, không phạm giới luật.',
    };

    soundEngine.playWoodblockStampSound();
    persistDb((prev) => ({
      ...prev,
      session: {
        ...prev.session,
        currentStreak: prev.session.currentStreak + 1,
      },
      reflectionJournals: [entry, ...prev.reflectionJournals],
    }));

    setJournalDraft('');
    setRepentanceDraft('');
    showSternMessage(
      'ĐÃ ĐÓNG ẤN NHẬT KÝ TỰ VẤN CUỐI NGÀY',
      `Đã lưu Tự Vấn (${entry.validWordCount} từ hợp lệ, Lexical Diversity: ${entry.lexicalDiversityScore}). Chuỗi ngày tu luyện tăng lên ${
        db.session.currentStreak + 1
      } ngày!`,
      'seal'
    );
  };

  const showGoalModule = activeTab === 'UNIFIED_4_IN_1' || activeTab === 'PEAK_GOALS';
  const showRitualsModule = activeTab === 'UNIFIED_4_IN_1' || activeTab === 'RITUALS';
  const showStrikesModule = activeTab === 'UNIFIED_4_IN_1' || activeTab === 'DAILY_STRIKES';
  const showReflectionModule = activeTab === 'UNIFIED_4_IN_1' || activeTab === 'REFLECTION';
  const showArchiveModule = activeTab === 'UNIFIED_4_IN_1' || activeTab === 'TANG_KINH_CAC';

  return (
    <div
      className={`monk-app-shell ${
        db.session.isMonkModeOn ? 'monk-mode-active' : 'monk-mode-off'
      }`}
    >
      {/* Custom Shanshui Mist & Ink-Wash Canvas Shader Background */}
      <ShanshuiCanvasBg
        isMonkModeOn={db.session.isMonkModeOn}
        isLockScreenView={isLockScreenOverlay}
      />

      {/* Relentless Nagging Engine Overlay */}
      <RelentlessAlarmOverlay
        alert={naggingAlert}
        onDismissLevel1={() => setNaggingAlert(null)}
        onEscalateToLevel2={() => {
          if (naggingAlert) {
            setNaggingAlert({ ...naggingAlert, level: 2 });
          }
        }}
        onStartPomodoroNow={(alert) => {
          setNaggingAlert(null);
          if (alert.targetType === 'RITUAL') {
            const r = db.ritualHabits.find((x) => x.id === alert.targetId);
            if (r) {
              setActivePomodoro({
                type: 'RITUAL',
                id: r.id,
                title: r.title,
                requiredMins: r.requiredPomodoroMins,
                requiresPhoto: r.requiresPhoto,
              });
            }
          } else {
            const s = db.dailyStrikes.find((x) => x.id === alert.targetId);
            if (s) {
              setActivePomodoro({
                type: 'STRIKE',
                id: s.id,
                title: s.title,
                requiredMins: s.requiredPomodoroMins,
                requiresPhoto: true,
              });
            }
          }
        }}
      />

      {/* Full-Screen Shanshui Lock Screen Overlay */}
      {isLockScreenOverlay && (
        <div className="shanshui-lockscreen-overlay">
          <div className="lockscreen-content-box">
            <div className="lockscreen-badge">
              MÀN HÌNH KHÓA TU LUYỆN — CHỐN THÂM SƠN CÙNG CỐC
            </div>
            <h1 className="lockscreen-motto">“{db.session.mottoText}”</h1>

            <div className="lockscreen-countdown-box">
              <span className="lockscreen-label">ĐỒNG HỒ ĐẾM NGƯỢC XUỐNG NÚI</span>
              <div className="lockscreen-digits">{countdownInfo.text}</div>
              <div className="lockscreen-sub">
                Chuỗi ngày kỷ luật: <strong>{db.session.currentStreak} ngày</strong> | Số lần phạm
                giới: <strong>{db.session.violationCount} lần</strong>
              </div>
            </div>

            <div className="lockscreen-progress-section">
              <div className="lockscreen-progress-header">
                <span>TIẾN ĐỘ ĐỈNH NÚI: {currentPeakGoal.title}</span>
                <strong>{overallProgressPct}% / 100%</strong>
              </div>
              <div className="zen-progress-track track-large">
                <div
                  className="zen-progress-fill"
                  style={{ width: `${overallProgressPct}%` }}
                />
              </div>
            </div>

            <div style={{ marginTop: 28 }}>
              <button
                type="button"
                className="zen-btn zen-btn-seal btn-large-ceremony"
                onClick={() => {
                  soundEngine.playTempleBell(0.75);
                  setIsLockScreenOverlay(false);
                }}
              >
                <Mountain size={18} />
                <span>Bước Vào Chánh Điện Tu Luyện (Mở Màn Hình Chính)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stern Ascetic Notification Banner */}
      {sternToast && (
        <div className={`stern-toast-banner toast-${sternToast.type}`}>
          <div className="stern-toast-content">
            <AlertTriangle size={20} />
            <div>
              <strong>{sternToast.title}</strong>
              <p>{sternToast.message}</p>
            </div>
          </div>
          <button
            type="button"
            className="stern-toast-close"
            onClick={() => setSternToast(null)}
          >
            Đã rõ
          </button>
        </div>
      )}

      {/* TOP HERO COMMAND BAR */}
      <header className="monk-top-header">
        <div className="brand-identity">
          <div className="brand-seal-icon">山</div>
          <div>
            <div className="brand-subtitle">HỆ THỐNG KỶ LUẬT CỰC ĐOAN — SHANSHUI ZEN DESKTOP</div>
            <h1 className="brand-title">LÊN NÚI (ASCEND THE MOUNTAIN)</h1>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button
                type="button"
                className="zen-btn zen-btn-seal"
                style={{ padding: '5px 11px', fontSize: 12 }}
                onClick={() => {
                  soundEngine.playWoodenFish(0.6);
                  if (db.sacredScrolls.length > 0) {
                    setViewingScroll(db.sacredScrolls[0]);
                  } else {
                    setActiveTab('TANG_KINH_CAC');
                  }
                }}
              >
                <ScrollText size={14} />
                <span>MỞ TÀNG KINH CÁC ({db.sacredScrolls.length} BÍ KÍP)</span>
              </button>
              <button
                type="button"
                className="zen-btn zen-btn-outline"
                style={{ padding: '5px 10px', fontSize: 12 }}
                onClick={() => setIsLockScreenOverlay(true)}
              >
                <Eye size={13} />
                <span>Màn Hình Khóa</span>
              </button>
            </div>
          </div>
        </div>

        {/* 3 Core Direct Display Metrics (Section 4) */}
        <div className="hero-core-metrics">
          {/* (1) Câu tâm niệm tu luyện */}
          <div className="hero-metric-card motto-card">
            <div className="metric-card-header">
              <span>(1) TÂM NIỆM TU LUYỆN</span>
              {!db.session.isMonkModeOn && (
                <button
                  type="button"
                  className="zen-btn zen-btn-outline"
                  style={{ padding: '2px 8px', fontSize: 11 }}
                  onClick={() => {
                    setMottoDraft(db.session.mottoText);
                    setInitialDaysDraft(db.session.initialDays);
                    setGoalTitleDraft(currentPeakGoal.title);
                    setGoalDescDraft(currentPeakGoal.description);
                    setGoalTargetDraft(currentPeakGoal.targetMetric);
                    setGoalUnitDraft(currentPeakGoal.unit);
                    setEditingPeakGoal(true);
                  }}
                >
                  <Edit3 size={11} /> Sửa Đỉnh Núi / Tâm Niệm
                </button>
              )}
            </div>
            <div className="motto-quote-display">“{db.session.mottoText}”</div>
          </div>

          {/* (2) Đồng hồ đếm ngược ngày/giờ xuống núi */}
          <div className="hero-metric-card countdown-card">
            <div className="metric-card-header">
              <span>(2) ĐẾM NGƯỢC XUỐNG NÚI</span>
              <span className="streak-pill">
                <Flame size={13} /> Streak: {db.session.currentStreak} ngày
              </span>
            </div>
            <div className="countdown-digits">{countdownInfo.text}</div>
            <div className="countdown-sub">
              Cam kết: {db.session.initialDays} ngày | Vi phạm Luật Núi: {db.session.violationCount}{' '}
              lần
            </div>
          </div>

          {/* (3) Thanh tiến độ hoàn thành mục tiêu (%) */}
          <div className="hero-metric-card progress-card">
            <div className="metric-card-header">
              <span>(3) TIẾN ĐỘ ĐỈNH NÚI DUY NHẤT</span>
              <strong style={{ color: overallProgressPct >= 100 ? '#4CAF50' : '#f3a6a7' }}>
                {overallProgressPct}% / 100%
              </strong>
            </div>
            <div className="zen-progress-track">
              <div
                className="zen-progress-fill"
                style={{ width: `${overallProgressPct}%` }}
              />
            </div>
            <div className="countdown-sub">
              {isOvertimeLockActive ? (
                <span style={{ color: '#EF5350', fontWeight: 700 }}>
                  CƯỠNG BỨC QUÁ GIỜ (OVERTIME LOCK): Còn thiếu {100 - overallProgressPct}%!
                </span>
              ) : (
                <span>
                  Khóa Kép: {isTimeCommitmentReached ? 'Đủ giờ' : 'Chưa đủ giờ'} &bull;{' '}
                  {allGoals100Pct ? 'Đạt 100% KPI' : `Đạt ${overallProgressPct}% KPI`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* MONK MODE MASTER SWITCH */}
        <div className="monk-switch-panel">
          <div className="monk-state-indicator">
            <span className={`status-dot ${db.session.isMonkModeOn ? 'dot-on' : 'dot-off'}`} />
            <span>
              {db.session.isMonkModeOn
                ? 'MONK MODE: ON (TRÊN ĐỈNH NÚI)'
                : 'MONK MODE: OFF (DƯỚI CHÂN NÚI)'}
            </span>
          </div>

          <button
            type="button"
            className={`monk-master-toggle-btn ${
              db.session.isMonkModeOn
                ? isDualLockSatisfied
                  ? 'btn-ready-descend'
                  : 'btn-locked-on-mountain'
                : 'btn-ascend-now'
            }`}
            onClick={handleToggleMonkMode}
          >
            {db.session.isMonkModeOn ? (
              isDualLockSatisfied ? (
                <>
                  <Award size={18} />
                  <span>ĐẮC ĐẠO XUỐNG NÚI (MỞ KHÓA)</span>
                </>
              ) : (
                <>
                  <Lock size={17} />
                  <span>
                    {isOvertimeLockActive
                      ? `KHÓA QUÁ GIỜ (THIẾU ${100 - overallProgressPct}%)`
                      : 'ĐANG KHÓA KÉP (DUAL-LOCK)'}
                  </span>
                </>
              )
            ) : (
              <>
                <Unlock size={17} />
                <span>GẠT BẬT MONK MODE: LÊN NÚI</span>
              </>
            )}
          </button>

          <div className="header-sub-actions">
            <span style={{ fontSize: 11, color: '#B8B4A9', fontFamily: 'var(--font-mono)' }}>
              {db.session.isMonkModeOn
                ? 'Đang bật: Khóa Pomodoro + Live PoW + 100 từ'
                : 'Đang tắt: Tích Checkbox tự giác & Viết tự do'}
            </span>
          </div>
        </div>
      </header>

      {/* PROMINENT INTERACTIVE MODULE NAVIGATION BAR */}
      <nav className="monk-module-nav">
        <button
          type="button"
          className={`module-nav-tab ${activeTab === 'UNIFIED_4_IN_1' ? 'active' : ''}`}
          onClick={() => setActiveTab('UNIFIED_4_IN_1')}
        >
          <LayoutGrid size={18} />
          <div>
            <div className="tab-main-name">Tất Cả 4-Trong-1 & Tàng Kinh Các</div>
            <div className="tab-sub-role">Toàn cảnh bàn tu luyện</div>
          </div>
        </button>

        <button
          type="button"
          className={`module-nav-tab ${activeTab === 'PEAK_GOALS' ? 'active' : ''}`}
          onClick={() => setActiveTab('PEAK_GOALS')}
        >
          <Mountain size={18} />
          <div>
            <div className="tab-main-name">1. Đỉnh Núi (The Peak)</div>
            <div className="tab-sub-role">Goal Tracker (1 Goal: {overallProgressPct}%)</div>
          </div>
        </button>

        <button
          type="button"
          className={`module-nav-tab ${activeTab === 'RITUALS' ? 'active' : ''}`}
          onClick={() => setActiveTab('RITUALS')}
        >
          <Flame size={18} />
          <div>
            <div className="tab-main-name">2. Nghi Thức (Rituals)</div>
            <div className="tab-sub-role">Habit Tracker ({db.ritualHabits.length} thói quen)</div>
          </div>
        </button>

        <button
          type="button"
          className={`module-nav-tab ${activeTab === 'DAILY_STRIKES' ? 'active' : ''}`}
          onClick={() => setActiveTab('DAILY_STRIKES')}
        >
          <Swords size={18} />
          <div>
            <div className="tab-main-name">3. Công Phá (Daily Strikes)</div>
            <div className="tab-sub-role">Todo List ({db.dailyStrikes.length} nhiệm vụ)</div>
          </div>
        </button>

        <button
          type="button"
          className={`module-nav-tab ${activeTab === 'REFLECTION' ? 'active' : ''}`}
          onClick={() => setActiveTab('REFLECTION')}
        >
          <FileText size={18} />
          <div>
            <div className="tab-main-name">4. Tự Vấn (Reflection)</div>
            <div className="tab-sub-role">Daily Journal ({db.reflectionJournals.length} đêm)</div>
          </div>
        </button>

        <button
          type="button"
          className={`module-nav-tab tab-tang-kinh-cac ${
            activeTab === 'TANG_KINH_CAC' ? 'active' : ''
          }`}
          onClick={() => setActiveTab('TANG_KINH_CAC')}
        >
          <ScrollText size={18} />
          <div>
            <div className="tab-main-name">5. Tàng Kinh Các</div>
            <div className="tab-sub-role">Bí Kíp Đóng Dấu ({db.sacredScrolls.length} quyển)</div>
          </div>
        </button>

        <button
          type="button"
          className={`module-nav-tab ${activeTab === 'OS_LOCKDOWN' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('OS_LOCKDOWN');
            desktopBridge.listRunningApps().then(setRunningApps);
          }}
        >
          <Shield size={18} />
          <div>
            <div className="tab-main-name">Phong Tỏa & Whitelist</div>
            <div className="tab-sub-role">Hình nền Kép & Luật Núi</div>
          </div>
        </button>
      </nav>

      {/* MAIN WORKSPACE CONTENT */}
      <main className="monk-workspace-main">
        {/* PROOF OF WORK MODE COMPARISON BANNER (MỤC 3.3 TRONG ẢNH 2) */}
        {activeTab !== 'OS_LOCKDOWN' && (
          <div className="pow-comparison-strip">
            <div className="pow-strip-title">
              <Shield size={16} color="#9E2A2B" />
              <strong>CHẾ ĐỘ KIỂM DUYỆT HIỆN TẠI (MỤC 3.3 — PROOF OF WORK):</strong>
            </div>
            <div className="pow-strip-items">
              <span className="pow-strip-badge">
                <strong>Thực hiện Todo / Habit:</strong>{' '}
                {db.session.isMonkModeOn
                  ? '🔒 Khóa Pomodoro (Thoát > 30s hủy phiên)'
                  : '☑️ Tự giác tích chọn (Checkbox thông thường)'}
              </span>
              <span className="pow-strip-badge">
                <strong>Nghiệm thu Kết quả:</strong>{' '}
                {db.session.isMonkModeOn
                  ? '📷 Chụp ảnh Trực tiếp (Camera/Screen + OpenCV chống ảnh đen)'
                  : 'Không yêu cầu hình ảnh minh chứng'}
              </span>
              <span className="pow-strip-badge">
                <strong>Nhật ký Tự Vấn:</strong>{' '}
                {db.session.isMonkModeOn
                  ? '✍️ Bắt buộc >= 100 từ hợp lệ + Chặn Copy/Paste + Lexical >= 0.45'
                  : 'Viết tự do, không giới hạn độ dài tối thiểu'}
              </span>
            </div>
          </div>
        )}

        {/* =====================================================================
            MÔ-ĐUN 1: ĐỈNH NÚI DUY NHẤT CỦA KỲ TU LUYỆN (THE PEAK - GOAL TRACKER)
           ===================================================================== */}
        {showGoalModule && (
          <section className="module-block">
            <div className="zen-card single-peak-hero-card">
              <div className="peak-card-top">
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span className="zen-tag-red">
                      MÔ-ĐUN 1 — ĐỈNH NÚI (THE PEAK / GOAL TRACKER)
                    </span>
                    <span className="time-window-pill">
                      Mỗi kỳ tu luyện chỉ tập trung leo 1 Đỉnh Núi duy nhất &bull; Mọi Habit & Todo
                      đều gắn trực tiếp vào Đỉnh Núi này
                    </span>
                  </div>
                  <h2 style={{ fontSize: 22, marginTop: 10, color: '#F6F4EE' }}>
                    ⛰️ {currentPeakGoal.title}
                  </h2>
                  <p className="zen-muted-text" style={{ marginTop: 4 }}>
                    {currentPeakGoal.description}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {!db.session.isMonkModeOn && (
                    <button
                      type="button"
                      className="zen-btn zen-btn-seal"
                      onClick={() => {
                        setGoalTitleDraft(currentPeakGoal.title);
                        setGoalDescDraft(currentPeakGoal.description);
                        setGoalTargetDraft(currentPeakGoal.targetMetric);
                        setGoalUnitDraft(currentPeakGoal.unit);
                        setMottoDraft(db.session.mottoText);
                        setInitialDaysDraft(db.session.initialDays);
                        setEditingPeakGoal((v) => !v);
                      }}
                    >
                      <Edit3 size={15} />
                      <span>
                        {editingPeakGoal
                          ? 'Đóng Khung Thiết Lập'
                          : 'Thiết Lập / Đổi Mục Tiêu Đỉnh Núi'}
                      </span>
                    </button>
                  )}

                  {overallProgressPct >= 100 && (
                    <WoodblockSealSvg
                      topText="ĐỈNH NÚI"
                      middleText="100%"
                      bottomText="VIÊN MÃN"
                      size={80}
                    />
                  )}
                </div>
              </div>

              {/* Progress Bar of the Single Peak */}
              <div className="peak-metric-box" style={{ marginTop: 14 }}>
                <div className="peak-metric-row">
                  <span>
                    Chỉ số định lượng (KPI/OKR):{' '}
                    <strong>
                      {currentPeakGoal.currentMetric} / {currentPeakGoal.targetMetric}{' '}
                      {currentPeakGoal.unit}
                    </strong>{' '}
                    (Hoàn thành các nhiệm vụ <strong>Công Phá - Todo List</strong> bên dưới để đẩy
                    thanh tiến độ này về 100%)
                  </span>
                  <strong className="peak-pct-number">{overallProgressPct}% / 100%</strong>
                </div>
                <div className="zen-progress-track track-large">
                  <div
                    className="zen-progress-fill"
                    style={{ width: `${overallProgressPct}%` }}
                  />
                </div>
              </div>

              {/* Edit Single Peak Goal Form (Only when Monk Mode is OFF) */}
              {editingPeakGoal && !db.session.isMonkModeOn && (
                <form
                  className="edit-single-peak-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!goalTitleDraft.trim()) return;
                    persistDb((prev) => {
                      const currentPct = prev.peakGoals[0]?.progressPct || 0;
                      const newTarget = Math.max(1, goalTargetDraft);
                      const updatedGoal: PeakGoalEntity = {
                        ...(prev.peakGoals[0] || currentPeakGoal),
                        title: goalTitleDraft.trim(),
                        description:
                          goalDescDraft.trim() ||
                          'Mục tiêu Đỉnh Núi duy nhất của kỳ tu luyện.',
                        targetMetric: newTarget,
                        currentMetric: Math.round((currentPct / 100) * newTarget),
                        unit: goalUnitDraft.trim() || 'điểm KPI',
                      };
                      return {
                        ...prev,
                        session: {
                          ...prev.session,
                          mottoText: mottoDraft.trim() || prev.session.mottoText,
                          initialDays: Math.max(1, initialDaysDraft),
                          currentTargetEndTime:
                            effectiveNow + Math.max(1, initialDaysDraft) * 86400000,
                        },
                        peakGoals: [updatedGoal],
                      };
                    });
                    setEditingPeakGoal(false);
                    showSternMessage(
                      'ĐÃ CẬP NHẬT ĐỈNH NÚI & KỲ TU LUYỆN',
                      `Mục tiêu Đỉnh Núi đã được thiết lập thành: "${goalTitleDraft.trim()}".`,
                      'info'
                    );
                  }}
                >
                  <h4 style={{ color: '#f3a6a7', marginBottom: 8 }}>
                    Thiết Lập Đỉnh Núi Duy Nhất Của Kỳ Tu Luyện (Khi Monk Mode: OFF)
                  </h4>
                  <div className="zen-form-grid">
                    <div>
                      <label style={{ fontSize: 12, color: '#B8B4A9' }}>
                        Tên Đỉnh Núi (Mục tiêu lớn duy nhất của cả kỳ):
                      </label>
                      <input
                        type="text"
                        className="zen-input"
                        style={{ width: '100%', marginTop: 4 }}
                        value={goalTitleDraft}
                        onChange={(e) => setGoalTitleDraft(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: '#B8B4A9' }}>
                        Mô tả chi tiết & Tiêu chí nghiệm thu Đỉnh Núi:
                      </label>
                      <input
                        type="text"
                        className="zen-input"
                        style={{ width: '100%', marginTop: 4 }}
                        value={goalDescDraft}
                        onChange={(e) => setGoalDescDraft(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <label style={{ fontSize: 12, color: '#B8B4A9' }}>
                        Chỉ số KPI mục tiêu:
                        <input
                          type="number"
                          className="zen-input"
                          style={{ width: 110, marginLeft: 6 }}
                          min={1}
                          value={goalTargetDraft}
                          onChange={(e) => setGoalTargetDraft(Number(e.target.value))}
                        />
                      </label>
                      <label style={{ fontSize: 12, color: '#B8B4A9' }}>
                        Đơn vị đo:
                        <input
                          type="text"
                          className="zen-input"
                          style={{ width: 130, marginLeft: 6 }}
                          value={goalUnitDraft}
                          onChange={(e) => setGoalUnitDraft(e.target.value)}
                        />
                      </label>
                      <label style={{ fontSize: 12, color: '#B8B4A9' }}>
                        Số ngày cam kết Lên Núi:
                        <input
                          type="number"
                          className="zen-input"
                          style={{ width: 90, marginLeft: 6 }}
                          min={1}
                          max={365}
                          value={initialDaysDraft}
                          onChange={(e) => setInitialDaysDraft(Number(e.target.value))}
                        />
                      </label>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: '#B8B4A9' }}>
                        Câu tâm niệm khắc trên màn hình chính & Bí Kíp:
                      </label>
                      <input
                        type="text"
                        className="zen-input"
                        style={{ width: '100%', marginTop: 4 }}
                        value={mottoDraft}
                        onChange={(e) => setMottoDraft(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="zen-btn zen-btn-ghost"
                        onClick={() => setEditingPeakGoal(false)}
                      >
                        Hủy
                      </button>
                      <button type="submit" className="zen-btn zen-btn-seal">
                        <Check size={15} />
                        <span>Lưu Thiết Lập Đỉnh Núi</span>
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </section>
        )}

        {/* =====================================================================
            SIDE-BY-SIDE: MÔ-ĐUN 2 (HABIT TRACKER) & MÔ-ĐUN 3 (TODO LIST)
           ===================================================================== */}
        {(showRitualsModule || showStrikesModule) && (
          <div
            className={
              showRitualsModule && showStrikesModule
                ? 'dual-modules-grid'
                : 'single-module-full'
            }
          >
            {/* MÔ-ĐUN 2: NGHI THỨC (RITUALS - HABIT TRACKER) */}
            {showRitualsModule && (
              <section className="zen-card module-column-card">
                <div className="module-col-header">
                  <div>
                    <span className="zen-tag-red">MÔ-ĐUN 2 — HABIT TRACKER</span>
                    <h3 style={{ fontSize: 20, marginTop: 6 }}>
                      🔥 Nghi Thức (Rituals) — Kỷ Luật Lặp Lại Theo Khung Giờ
                    </h3>
                    <p className="zen-muted-text" style={{ fontSize: 13 }}>
                      Các kỷ luật lặp lại hàng ngày theo khung giờ cố định (VD: Dậy lúc 05:00, Đọc
                      sách 60 phút). Bỏ lỡ khung giờ quy định mà chưa hoàn thành sẽ bị tính là{' '}
                      <strong>vi phạm Luật Núi</strong>.
                    </p>
                  </div>
                </div>

                <div className="rituals-list" style={{ marginTop: 14 }}>
                  {db.ritualHabits.map((ritual) => {
                    const todayDone = ritual.completionsByDate[todayStr];

                    return (
                      <div
                        key={ritual.id}
                        className={`task-interactive-row ${todayDone ? 'row-completed' : ''}`}
                      >
                        {/* Left Checkbox / Trigger */}
                        <div className="task-check-col">
                          {!db.session.isMonkModeOn ? (
                            <button
                              type="button"
                              className={`checkbox-square-btn ${todayDone ? 'checked' : ''}`}
                              onClick={() => handleRitualAction(ritual)}
                              title="Chế độ Monk Mode OFF: Tự giác tích chọn (Checkbox thông thường)"
                            >
                              {todayDone ? <CheckSquare size={22} /> : <Square size={22} />}
                            </button>
                          ) : todayDone ? (
                            <WoodblockSealSvg
                              topText="GIỮ"
                              middleText="GIỚI"
                              bottomText="LUẬT"
                              size={54}
                            />
                          ) : (
                            <button
                              type="button"
                              className="zen-btn zen-btn-seal"
                              style={{ padding: '8px 10px', fontSize: 12 }}
                              onClick={() => handleRitualAction(ritual)}
                            >
                              <Flame size={15} />
                              <span>Pomodoro ({ritual.requiredPomodoroMins}p)</span>
                            </button>
                          )}
                        </div>

                        {/* Middle Info */}
                        <div className="task-body-col">
                          <div className="ritual-meta-tags">
                            <span className="time-window-pill">
                              <Clock size={12} /> Khung giờ: {ritual.timeWindowStart} –{' '}
                              {ritual.timeWindowEnd}
                            </span>
                            <span className="pomo-pill">
                              <Flame size={12} /> {ritual.requiredPomodoroMins} phút
                            </span>
                            {ritual.requiresPhoto && (
                              <span className="pow-pill">
                                <Camera size={12} /> Cần ảnh PoW khi bật Monk Mode
                              </span>
                            )}
                          </div>

                          <div
                            className="task-row-title"
                            style={{
                              textDecoration: todayDone ? 'line-through' : 'none',
                              color: todayDone ? '#9E9A8E' : '#F6F4EE',
                            }}
                          >
                            {ritual.title}
                          </div>

                          {todayDone && (
                            <div className="task-done-caption">
                              ✓ Đã hoàn thành hôm nay lúc{' '}
                              {new Date(todayDone.completedAt).toLocaleTimeString('vi-VN')}
                            </div>
                          )}

                          {todayDone?.proofPhotoUri && (
                            <div className="inline-proof-thumb">
                              <img src={todayDone.proofPhotoUri} alt="Proof" />
                              <span>Ảnh bằng chứng PoW đã đóng dấu</span>
                            </div>
                          )}
                        </div>

                        {/* Right Actions */}
                        <div className="task-actions-col">
                          {db.session.isMonkModeOn && !todayDone && (
                            <button
                              type="button"
                              className="zen-btn zen-btn-outline"
                              style={{ padding: '5px 8px', fontSize: 11 }}
                              onClick={() =>
                                triggerMountainLawViolation(
                                  'MISSED_RITUAL',
                                  `Bỏ lỡ khung giờ Nghi thức "${ritual.title}" (${ritual.timeWindowStart}–${ritual.timeWindowEnd})`
                                )
                              }
                              title="Giả lập bỏ lỡ khung giờ quy định để kiểm tra hình phạt Luật Núi"
                            >
                              Phạt trễ giờ
                            </button>
                          )}
                          {!db.session.isMonkModeOn && (
                            <button
                              type="button"
                              className="zen-btn zen-btn-ghost"
                              onClick={() =>
                                persistDb((prev) => ({
                                  ...prev,
                                  ritualHabits: prev.ritualHabits.filter((r) => r.id !== ritual.id),
                                }))
                              }
                              title="Xóa Nghi thức"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Inline Add Habit Form */}
                <form
                  className="inline-add-box"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newRitualTitle.trim()) return;
                    const created: RitualHabitEntity = {
                      id: `ritual-${Date.now()}`,
                      goalId: currentPeakGoal.id,
                      title: newRitualTitle.trim(),
                      timeWindowStart: newRitualStart,
                      timeWindowEnd: newRitualEnd,
                      requiredPomodoroMins: Math.max(5, newRitualPomo),
                      requiresPhoto: newRitualPhoto,
                      completionsByDate: {},
                      violatedDates: {},
                    };
                    persistDb((prev) => ({
                      ...prev,
                      ritualHabits: [...prev.ritualHabits, created],
                    }));
                    setNewRitualTitle('');
                  }}
                >
                  <div className="inline-add-header">+ Thêm Nghi Thức (Habit Tracker) Mới:</div>
                  <input
                    type="text"
                    className="zen-input"
                    placeholder="Nhập thói quen kỷ luật (VD: Dậy lúc 05:00, Đọc sách 60 phút...)"
                    value={newRitualTitle}
                    onChange={(e) => setNewRitualTitle(e.target.value)}
                    required
                  />
                  <div className="inline-add-controls">
                    <label>
                      Từ:{' '}
                      <input
                        type="time"
                        className="zen-input"
                        style={{ width: 102, padding: '4px 6px' }}
                        value={newRitualStart}
                        onChange={(e) => setNewRitualStart(e.target.value)}
                      />
                    </label>
                    <label>
                      Đến:{' '}
                      <input
                        type="time"
                        className="zen-input"
                        style={{ width: 102, padding: '4px 6px' }}
                        value={newRitualEnd}
                        onChange={(e) => setNewRitualEnd(e.target.value)}
                      />
                    </label>
                    <label>
                      Pomodoro (phút):{' '}
                      <input
                        type="number"
                        className="zen-input"
                        style={{ width: 64, padding: '4px 6px' }}
                        min={5}
                        max={180}
                        value={newRitualPomo}
                        onChange={(e) => setNewRitualPomo(Number(e.target.value))}
                      />
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="checkbox"
                        checked={newRitualPhoto}
                        onChange={(e) => setNewRitualPhoto(e.target.checked)}
                      />
                      Cần ảnh PoW
                    </label>
                    <button type="submit" className="zen-btn zen-btn-seal">
                      <Plus size={15} /> Thêm Habit
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* MÔ-ĐUN 3: CÔNG PHÁ (DAILY STRIKES - TODO LIST) */}
            {showStrikesModule && (
              <section className="zen-card module-column-card">
                <div className="module-col-header">
                  <div>
                    <span className="zen-tag-red">MÔ-ĐUN 3 — TODO LIST</span>
                    <h3 style={{ fontSize: 20, marginTop: 6 }}>
                      ⚔️ Công Phá (Daily Strikes) — Nhiệm Vụ Tác Chiến Trong Ngày
                    </h3>
                    <p className="zen-muted-text" style={{ fontSize: 13 }}>
                      Danh sách các nhiệm vụ tác chiến cụ thể cần giải quyết dứt điểm trước 23:59 để{' '}
                      <strong>đẩy thanh tiến độ của Đỉnh Núi tiến về mốc 100%</strong>.
                    </p>
                  </div>
                </div>

                <div className="rituals-list" style={{ marginTop: 14 }}>
                  {db.dailyStrikes.map((strike) => {
                    const isDone = strike.status === 'COMPLETED';

                    return (
                      <div
                        key={strike.id}
                        className={`task-interactive-row ${isDone ? 'row-completed' : ''}`}
                      >
                        {/* Left Checkbox / Trigger */}
                        <div className="task-check-col">
                          {!db.session.isMonkModeOn ? (
                            <button
                              type="button"
                              className={`checkbox-square-btn ${isDone ? 'checked' : ''}`}
                              onClick={() => handleStrikeAction(strike)}
                              title="Chế độ Monk Mode OFF: Tích chọn để cộng ngay % vào Đỉnh Núi"
                            >
                              {isDone ? <CheckSquare size={22} /> : <Square size={22} />}
                            </button>
                          ) : isDone ? (
                            <WoodblockSealSvg
                              topText="CÔNG PHÁ"
                              middleText={`+${strike.weightPct}%`}
                              bottomText="HOÀN TẤT"
                              size={54}
                            />
                          ) : (
                            <button
                              type="button"
                              className="zen-btn zen-btn-seal"
                              style={{ padding: '8px 10px', fontSize: 12 }}
                              onClick={() => handleStrikeAction(strike)}
                            >
                              <Swords size={15} />
                              <span>Công Phá ({strike.requiredPomodoroMins}p)</span>
                            </button>
                          )}
                        </div>

                        {/* Middle Info */}
                        <div className="task-body-col">
                          <div className="ritual-meta-tags">
                            <span className="weight-pill">
                              Đẩy Đỉnh Núi: <strong>+{strike.weightPct}%</strong>
                            </span>
                            <span className="time-window-pill">
                              <Clock size={12} /> Hẹn giờ: {strike.scheduledTime}
                            </span>
                            <span className="pomo-pill">
                              <Flame size={12} /> {strike.requiredPomodoroMins}p Pomodoro
                            </span>
                            <span className="pow-pill">
                              <Camera size={12} /> Live PoW
                            </span>
                          </div>

                          <div
                            className="task-row-title"
                            style={{
                              textDecoration: isDone ? 'line-through' : 'none',
                              color: isDone ? '#9E9A8E' : '#F6F4EE',
                            }}
                          >
                            {strike.title}
                          </div>

                          {isDone && (
                            <div className="task-done-caption">
                              ✓ Đã hoàn thành & đóng góp +{strike.weightPct}% vào Đỉnh Núi
                            </div>
                          )}

                          {strike.proofPhotoUri && (
                            <div className="inline-proof-thumb">
                              <img src={strike.proofPhotoUri} alt={strike.title} />
                              <div>
                                <span>Đã nghiệm thu ảnh PoW</span>
                                {strike.proofAnalysis && (
                                  <div style={{ fontSize: 11, color: '#B8B4A9' }}>
                                    Sáng: {strike.proofAnalysis.brightness} | Nét:{' '}
                                    {strike.proofAnalysis.sharpness}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right Actions */}
                        <div className="task-actions-col">
                          {!isDone && (
                            <button
                              type="button"
                              className="zen-btn zen-btn-outline"
                              style={{ padding: '5px 8px', fontSize: 11 }}
                              onClick={() =>
                                setNaggingAlert({
                                  level: 1,
                                  targetId: strike.id,
                                  targetType: 'STRIKE',
                                  title: strike.title,
                                  scheduledWindow: strike.scheduledTime,
                                  requiredPomodoroMins: strike.requiredPomodoroMins,
                                })
                              }
                              title="Thử chuông chùa nhắc nhở Cấp độ 1 & Cấp độ 2"
                            >
                              <Bell size={12} /> Báo chuông
                            </button>
                          )}
                          {!db.session.isMonkModeOn && (
                            <button
                              type="button"
                              className="zen-btn zen-btn-ghost"
                              onClick={() =>
                                persistDb((prev) => ({
                                  ...prev,
                                  dailyStrikes: prev.dailyStrikes.filter((s) => s.id !== strike.id),
                                }))
                              }
                              title="Xóa Todo"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Inline Add Todo Form */}
                <form
                  className="inline-add-box"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newStrikeTitle.trim()) return;
                    const created: DailyStrikeTodoEntity = {
                      id: `strike-${Date.now()}`,
                      goalId: currentPeakGoal.id,
                      date: todayStr,
                      title: newStrikeTitle.trim(),
                      scheduledTime: newStrikeTime,
                      weightPct: Math.max(5, Math.min(100, newStrikeWeight)),
                      status: 'PENDING',
                      requiredPomodoroMins: Math.max(5, newStrikePomo),
                      completedPomodoroMins: 0,
                      proofPhotoUri: null,
                      proofAnalysis: null,
                    };
                    persistDb((prev) => ({
                      ...prev,
                      dailyStrikes: [...prev.dailyStrikes, created],
                    }));
                    setNewStrikeTitle('');
                  }}
                >
                  <div className="inline-add-header">+ Thêm Nhiệm Vụ Công Phá (Todo List) Mới:</div>
                  <input
                    type="text"
                    className="zen-input"
                    placeholder="Nhập nhiệm vụ tác chiến cần giải quyết dứt điểm trong ngày..."
                    value={newStrikeTitle}
                    onChange={(e) => setNewStrikeTitle(e.target.value)}
                    required
                  />
                  <div className="inline-add-controls">
                    <label>
                      Trọng số đẩy Đỉnh Núi (%):{' '}
                      <input
                        type="number"
                        className="zen-input"
                        style={{ width: 64, padding: '4px 6px' }}
                        min={5}
                        max={100}
                        value={newStrikeWeight}
                        onChange={(e) => setNewStrikeWeight(Number(e.target.value))}
                      />
                    </label>
                    <label>
                      Giờ hẹn:{' '}
                      <input
                        type="time"
                        className="zen-input"
                        style={{ width: 102, padding: '4px 6px' }}
                        value={newStrikeTime}
                        onChange={(e) => setNewStrikeTime(e.target.value)}
                      />
                    </label>
                    <label>
                      Pomodoro (phút):{' '}
                      <input
                        type="number"
                        className="zen-input"
                        style={{ width: 64, padding: '4px 6px' }}
                        min={5}
                        max={180}
                        value={newStrikePomo}
                        onChange={(e) => setNewStrikePomo(Number(e.target.value))}
                      />
                    </label>
                    <button type="submit" className="zen-btn zen-btn-seal">
                      <Plus size={15} /> Thêm Todo
                    </button>
                  </div>
                </form>
              </section>
            )}
          </div>
        )}

        {/* =====================================================================
            MÔ-ĐUN 4: NHẬT KÝ TỰ VẤN CUỐI NGÀY (DAILY JOURNAL - REFLECTION)
           ===================================================================== */}
        {showReflectionModule && (
          <section className="module-block" style={{ marginTop: 22 }}>
            <div className="reflection-layout">
              <div className="zen-card reflection-editor-card">
                <div className="section-header-row" style={{ marginBottom: 12 }}>
                  <div>
                    <span className="zen-tag-red">MÔ-ĐUN 4 — DAILY JOURNAL</span>
                    <h3 style={{ fontSize: 20, marginTop: 6 }}>
                      ✍️ Tự Vấn (Reflection) — Nghi Thức Nghiệm Thu & Sám Hối Cuối Ngày
                    </h3>
                    <p className="zen-muted-text" style={{ fontSize: 13 }}>
                      {db.session.isMonkModeOn
                        ? 'Đang bật Monk Mode: ON — Bắt buộc mở từ 20:00–23:59, đếm đủ tối thiểu 100 từ hợp lệ, chặn hoàn toàn Copy/Paste và kiểm tra mật độ từ vựng (Lexical Diversity >= 0.45).'
                        : 'Đang ở chế độ Monk Mode: OFF — Viết tự do, không giới hạn độ dài tối thiểu.'}
                    </p>
                  </div>

                  {db.session.isMonkModeOn && !isReflectionWindowOpen && (
                    <button
                      type="button"
                      className="zen-btn zen-btn-seal"
                      onClick={() => setForceOpenReflectionWindow(true)}
                    >
                      <Clock size={15} />
                      <span>Mở Cổng Tự Vấn Ngay (Giả Lập 21:00)</span>
                    </button>
                  )}
                </div>

                {clipboardBlockedMsg && (
                  <div className="zen-alert-box alert-danger" style={{ marginBottom: 12 }}>
                    <AlertTriangle size={18} />
                    <span>{clipboardBlockedMsg}</span>
                  </div>
                )}

                <form onSubmit={handleSubmitJournal}>
                  <textarea
                    className="zen-textarea reflection-textarea"
                    rows={6}
                    disabled={!isReflectionWindowOpen}
                    placeholder={
                      isReflectionWindowOpen
                        ? db.session.isMonkModeOn
                          ? 'MONK MODE ON: Hãy tự tay gõ ít nhất 100 từ hợp lệ nhìn nhận lại sự tập trung trong ngày (Chặn hoàn toàn Copy/Paste & gõ ký tự rác lặp lại)...'
                          : 'MONK MODE OFF: Viết tự do nhật ký Tự Vấn trong ngày (không giới hạn số từ tối thiểu)...'
                        : 'Khi bật Monk Mode, cổng Tự Vấn chỉ mở từ 20:00 đến 23:59. Bấm nút "Mở Cổng Tự Vấn Ngay (Giả Lập 21:00)" phía trên để kiểm thử ngay.'
                    }
                    value={journalDraft}
                    onChange={(e) => setJournalDraft(e.target.value)}
                    onPaste={(e) => {
                      if (db.session.isMonkModeOn) {
                        e.preventDefault();
                        soundEngine.playWoodenFish(0.9);
                        setClipboardBlockedMsg(
                          'GIỚI LUẬT TỰ VẤN (MỤC 3.3): Chặn hoàn toàn thao tác Copy/Paste (Clipboard đã bị vô hiệu hóa khi bật Monk Mode)!'
                        );
                      }
                    }}
                    onCopy={(e) => {
                      if (db.session.isMonkModeOn) e.preventDefault();
                    }}
                    onCut={(e) => {
                      if (db.session.isMonkModeOn) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      if (db.session.isMonkModeOn) {
                        e.preventDefault();
                        setClipboardBlockedMsg('Chặn kéo-thả văn bản vào khung Tự Vấn!');
                      }
                    }}
                  />

                  <div className="lexical-inspector-bar">
                    <div className="lexical-metric">
                      <span>Số từ thực tế hợp lệ:</span>
                      <strong
                        style={{
                          color:
                            !db.session.isMonkModeOn || journalAnalysis.validWordCount >= 100
                              ? '#4CAF50'
                              : '#EF5350',
                        }}
                      >
                        {journalAnalysis.validWordCount}{' '}
                        {db.session.isMonkModeOn ? '/ 100 từ bắt buộc' : 'từ (Tự do)'}
                      </strong>
                    </div>

                    <div className="lexical-metric">
                      <span>Mật độ từ vựng (Lexical Diversity):</span>
                      <strong
                        style={{
                          color:
                            !db.session.isMonkModeOn ||
                            journalAnalysis.lexicalDiversityScore >= 0.45
                              ? '#4CAF50'
                              : '#EF5350',
                        }}
                      >
                        {journalAnalysis.lexicalDiversityScore}{' '}
                        {db.session.isMonkModeOn ? '(Yêu cầu >= 0.45)' : ''}
                      </strong>
                    </div>

                    <div className="lexical-metric">
                      <span>Từ rác/lặp bị loại:</span>
                      <strong>{journalAnalysis.invalidSpamWords}</strong>
                    </div>
                  </div>

                  <div className="reflection-actions-row">
                    <button
                      type="button"
                      className="zen-btn zen-btn-outline"
                      disabled={!isReflectionWindowOpen}
                      onClick={() => {
                        setJournalDraft(
                          'Đêm nay ngồi trước màn hình trong không gian tĩnh mịch của đỉnh núi, tôi nhìn nhận lại toàn bộ hành trình làm việc từ sáng sớm lúc năm giờ cho đến giờ phút này. Buổi sáng khi tiếng chuông chùa vang lên, tôi đã lập tức bước vào phiên thiền định Pomodoro đầu tiên mà không trì hoãn dù chỉ một phút. Những nhiệm vụ công phá khó khăn nhất của dự án đã được giải quyết triệt để bằng sự tập trung cao độ. Dù buổi chiều đôi lúc tâm trí có khởi lên chút mệt mỏi, nhưng nhìn vào câu tâm niệm trên màn hình và dấu mộc đỏ Chu Sa, ý chí lại trở nên sắc bén như kiếm thép. Hôm nay tôi giữ trọn vẹn giới luật, xứng đáng tiến thêm một bước gần hơn tới ngày đắc đạo xuống núi.'
                        );
                        setRepentanceDraft(
                          'Giữ vững chánh niệm 100%, không để ngoại cảnh chi phối.'
                        );
                      }}
                    >
                      <Sparkles size={15} />
                      <span>Điền mẫu 135 từ hợp lệ (Test vượt kiểm duyệt)</span>
                    </button>

                    <button
                      type="button"
                      className="zen-btn zen-btn-outline"
                      disabled={!isReflectionWindowOpen}
                      onClick={() => {
                        setJournalDraft(
                          'aaaa bbbb cccc tôi làm việc tôi làm việc tôi làm việc tôi làm việc tôi làm việc tôi làm việc tôi làm việc tôi làm việc tôi làm việc tôi làm việc tôi làm việc tôi làm việc tôi làm việc tôi làm việc tôi làm việc 12345 99999 asdfghjkl'
                        );
                      }}
                    >
                      <span>Thử điền văn bản lặp từ / gõ rác (Test bị chặn)</span>
                    </button>

                    <div style={{ flex: 1 }} />

                    <button
                      type="submit"
                      className="zen-btn zen-btn-seal"
                      disabled={
                        !isReflectionWindowOpen ||
                        (db.session.isMonkModeOn && !journalAnalysis.isPassingInMonkMode)
                      }
                    >
                      <Check size={16} />
                      <span>Đóng Ấn Lưu Nhật Ký Tự Vấn</span>
                    </button>
                  </div>
                </form>
              </div>

              <div className="zen-card reflection-history-card">
                <h3>Nhật Trình Tự Vấn Đã Lưu ({db.reflectionJournals.length} bản ghi)</h3>
                <div className="journal-history-list">
                  {db.reflectionJournals.map((j) => (
                    <div key={j.id} className="journal-history-item">
                      <div className="journal-item-header">
                        <strong>Đêm {j.date}</strong>
                        <span className="zen-tag-red">
                          {j.validWordCount} từ &bull; Lexical: {j.lexicalDiversityScore}
                        </span>
                      </div>
                      <p>{j.content}</p>
                      <div className="journal-item-footer">
                        <span>Độ tập trung: {j.focusRating}/5</span>
                        <span>{j.repentanceNote}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* =====================================================================
            MÔ-ĐUN 5: TÀNG KINH CÁC (SACRED ARCHIVE - BÍ KÍP TU LUYỆN)
           ===================================================================== */}
        {showArchiveModule && (
          <section className="module-block" style={{ marginTop: 22 }}>
            <div className="zen-card">
              <div className="section-header-row" style={{ marginBottom: 14 }}>
                <div>
                  <span className="zen-tag-red">MÔ-ĐUN 5 — SACRED ARCHIVE (TÀNG KINH CÁC)</span>
                  <h3 style={{ fontSize: 22, marginTop: 6 }}>
                    📜 Bí Kíp Tu Luyện (Tàng Kinh Các) — Kệ Sách Cổ Thư Đóng Dấu Mộc Đỏ Chu Sa
                  </h3>
                  <p className="zen-muted-text">
                    Khi hoàn thành 100% khóa tu luyện và xuống núi, toàn bộ nhật trình được đóng
                    quyển thành một cuốn Bí Kíp cổ thư kèm <strong>Dấu Mộc Đỏ Chu Sa</strong> để kẻ
                    tu luyện bấm vào mở ra lật trang đọc lại hoặc xuất file PDF bất cứ lúc nào.
                  </p>
                </div>
              </div>

              <div className="sacred-scrolls-shelf">
                {db.sacredScrolls.map((scroll) => (
                  <div
                    key={scroll.id}
                    className="ancient-scroll-shelf-card"
                    onClick={() => {
                      soundEngine.playWoodenFish(0.65);
                      setViewingScroll(scroll);
                    }}
                  >
                    <div className="shelf-card-spine" />
                    <div className="shelf-card-body">
                      <div className="shelf-card-top">
                        <div>
                          <span className="shelf-scroll-tag">
                            CỔ THƯ ĐÓNG CHỈ GÁY — BẤM ĐỂ MỞ ĐỌC
                          </span>
                          <h3>{scroll.title}</h3>
                          <p className="shelf-motto">“{scroll.mottoText}”</p>
                        </div>
                        <WoodblockSealSvg
                          topText="LÊN NÚI"
                          middleText={`${scroll.totalDaysSpent} NGÀY`}
                          bottomText="CHU SA ẤN"
                          size={86}
                        />
                      </div>

                      <div className="shelf-metrics-row">
                        <span>
                          Khổ luyện: <strong>{scroll.totalDaysSpent} ngày</strong>
                        </span>
                        <span>
                          Thiền định Pomodoro: <strong>{scroll.totalPomodoroHours} giờ</strong>
                        </span>
                        <span>
                          Vấp ngã gia hạn: <strong>{scroll.violationCount} lần</strong>
                        </span>
                        <span>
                          Đắc đạo:{' '}
                          <strong>{new Date(scroll.sealedAt).toLocaleDateString('vi-VN')}</strong>
                        </span>
                      </div>

                      <div className="shelf-card-footer">
                        <span className="seal-hash-code">ẤN CHỨNG: {scroll.sealHash}</span>
                        <button type="button" className="zen-btn zen-btn-seal">
                          <BookOpen size={15} />
                          <span>Mở Cổ Thư Lật Trang & Xuất PDF</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* =====================================================================
            MÔ-ĐUN 6: PHONG TỎA DESKTOP & WHITELIST (SECTION 4 & 6)
           ===================================================================== */}
        {activeTab === 'OS_LOCKDOWN' && (
          <div className="module-section">
            <div className="section-header-row">
              <div>
                <span className="zen-tag-red">
                  MỤC 4 & 6 — PHONG TỎA HỆ THỐNG & KHÔNG GIAN TU LUYỆN
                </span>
                <h2 className="section-title">
                  Hình Nền Tu Luyện Kép, Danh Sách Trắng Tuyệt Đối & Chế Tài Luật Núi
                </h2>
              </div>
            </div>

            {wallpaperStatusMsg && (
              <div className="zen-alert-box alert-warning" style={{ marginBottom: 16 }}>
                <Wallpaper size={18} />
                <span>{wallpaperStatusMsg}</span>
              </div>
            )}

            <div className="lockdown-two-col">
              <div className="zen-card">
                <h3>1. Bộ Đôi Hình Nền Tu Luyện Kép (Dual Ascent Wallpaper)</h3>
                <div className="dual-wallpaper-previews" style={{ marginTop: 12 }}>
                  <div className="wallpaper-preview-box">
                    <img src="./assets/shanshui-mountains.jpg" alt="Lock Screen Mountains" />
                    <div className="wp-caption">
                      <strong>Ảnh ngoài (Màn hình khóa — Lock Screen)</strong>
                      <span>Cảnh núi non hùng vĩ, hiểm trở ẩn hiện trong mây mù và gió núi</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        className="zen-btn zen-btn-outline"
                        onClick={() => setIsLockScreenOverlay(true)}
                      >
                        Xem Màn Hình Khóa
                      </button>
                      <button
                        type="button"
                        className="zen-btn zen-btn-seal"
                        onClick={() => applyLiveWallpaperToOS('LOCK_MOUNTAIN')}
                      >
                        Đặt Làm Hình Nền Windows
                      </button>
                    </div>
                  </div>

                  <div className="wallpaper-preview-box">
                    <img src="./assets/shanshui-monk-temple.jpg" alt="Home Screen Monk Temple" />
                    <div className="wp-caption">
                      <strong>Ảnh trong (Màn hình chính — Home Screen)</strong>
                      <span>Nhà sư ngồi thiền định kiên định cùng ngôi chùa cổ trên đỉnh núi cao</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        className="zen-btn zen-btn-seal"
                        onClick={() => applyLiveWallpaperToOS('HOME_TEMPLE')}
                      >
                        <Wallpaper size={15} />
                        <span>Áp Dụng Hình Nền Nhà Sư + Tiến Độ Lên Windows</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
                  <button
                    type="button"
                    className="zen-btn zen-btn-outline"
                    onClick={async () => {
                      const res = await desktopBridge.restoreWindowsWallpaper();
                      setWallpaperStatusMsg(
                        res.ok
                          ? `Đã khôi phục hình nền Windows gốc: ${res.restoredPath}`
                          : `Thông báo: ${res.reason || 'Chưa có bản sao lưu hình nền mới.'}`
                      );
                    }}
                  >
                    <RotateCcw size={15} />
                    <span>Khôi Phục Hình Nền Windows Gốc Ngay</span>
                  </button>
                </div>
              </div>

              <div className="zen-card">
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <h3>2. Cơ Chế Danh Sách Trắng Tuyệt Đối (Strict Whitelist)</h3>
                  <span className="zen-tag-red">
                    {db.session.isMonkModeOn ? 'ĐÃ KHÓA THÊM MỚI' : 'CHO PHÉP KHAI BÁO'}
                  </span>
                </div>
                <div className="whitelist-items-box" style={{ marginTop: 12 }}>
                  {db.session.whitelistedApps.map((item) => (
                    <div key={item.id} className="whitelist-row">
                      <div>
                        <strong>{item.name}</strong>
                        <div style={{ fontSize: 12, color: '#B8B4A9' }}>
                          Process: <code>{item.processName}</code>
                        </div>
                      </div>
                      {!db.session.isMonkModeOn && item.category === 'DECLARED_WORK_TOOL' && (
                        <button
                          type="button"
                          className="zen-btn zen-btn-ghost"
                          onClick={() =>
                            persistDb((prev) => ({
                              ...prev,
                              session: {
                                ...prev.session,
                                whitelistedApps: prev.session.whitelistedApps.filter(
                                  (w) => w.id !== item.id
                                ),
                              },
                            }))
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {!db.session.isMonkModeOn && (
                  <form
                    style={{ display: 'flex', gap: 8, marginTop: 12 }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!newWhitelistName.trim() || !newWhitelistProcess.trim()) return;
                      persistDb((prev) => ({
                        ...prev,
                        session: {
                          ...prev.session,
                          whitelistedApps: [
                            ...prev.session.whitelistedApps,
                            {
                              id: `wl-${Date.now()}`,
                              name: newWhitelistName.trim(),
                              processName: newWhitelistProcess.trim(),
                              category: 'DECLARED_WORK_TOOL',
                            },
                          ],
                        },
                      }));
                      setNewWhitelistName('');
                      setNewWhitelistProcess('');
                    }}
                  >
                    <input
                      type="text"
                      className="zen-input"
                      style={{ flex: 1 }}
                      placeholder="Tên công cụ Công việc..."
                      value={newWhitelistName}
                      onChange={(e) => setNewWhitelistName(e.target.value)}
                    />
                    <input
                      type="text"
                      className="zen-input"
                      style={{ width: 140 }}
                      placeholder="Process (VD: Code)"
                      value={newWhitelistProcess}
                      onChange={(e) => setNewWhitelistProcess(e.target.value)}
                    />
                    <button type="submit" className="zen-btn zen-btn-seal">
                      <Plus size={15} /> Thêm
                    </button>
                  </form>
                )}

                {runningApps.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <span style={{ fontSize: 12, color: '#B8B4A9' }}>
                      Tiến trình đang mở trên máy:
                    </span>
                    <div className="running-procs-chips">
                      {runningApps.slice(0, 8).map((proc) => (
                        <button
                          key={proc.Id}
                          type="button"
                          className="proc-chip"
                          disabled={db.session.isMonkModeOn}
                          onClick={() => {
                            setNewWhitelistName(
                              proc.MainWindowTitle.slice(0, 32) || proc.ProcessName
                            );
                            setNewWhitelistProcess(proc.ProcessName);
                          }}
                        >
                          + {proc.ProcessName}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* DEVELOPER & SIMULATION BAR */}
      {devBarVisible && (
        <footer className="dev-simulation-bar">
          <div className="dev-bar-label">
            <Sliders size={15} color="#9E2A2B" />
            <strong>BẢNG GIẢ LẬP & KIỂM THỬ NHANH (DEV BAR):</strong>
          </div>

          <div className="dev-bar-buttons">
            <button
              type="button"
              className="dev-sim-btn"
              onClick={() => setSimulatedTimeOffsetMs((prev) => prev + 86400000)}
            >
              +1 Ngày
            </button>

            <button
              type="button"
              className="dev-sim-btn"
              onClick={() => {
                setForceOpenReflectionWindow((v) => !v);
                setActiveTab('REFLECTION');
              }}
            >
              {forceOpenReflectionWindow ? 'Tắt Giả Lập 21:00' : 'Mở Cổng Tự Vấn 21:00'}
            </button>

            <button
              type="button"
              className="dev-sim-btn"
              onClick={() =>
                setNaggingAlert({
                  level: 2,
                  targetId: db.dailyStrikes[0]?.id || 'strike-1',
                  targetType: 'STRIKE',
                  title:
                    db.dailyStrikes[0]?.title ||
                    'Hoàn thiện bộ kiểm duyệt Bằng chứng Xác thực (Proof of Work)',
                  scheduledWindow: '14:00 (Trễ 5 phút)',
                  requiredPomodoroMins: 25,
                })
              }
            >
              Test Báo Động Cấp 2 (Full-Screen Hijack)
            </button>

            <button
              type="button"
              className="dev-sim-btn"
              onClick={() =>
                triggerMountainLawViolation(
                  'MANUAL_SIMULATION',
                  'Giả lập vi phạm Luật Núi (Bỏ lỡ Nghi thức / Không hoàn thành Công phá trước 23:59)'
                )
              }
            >
              Test Phạt Luật Núi (Reset Streak = 0)
            </button>

            <button
              type="button"
              className="dev-sim-btn"
              onClick={() => {
                persistDb((prev) => ({
                  ...prev,
                  session: {
                    ...prev.session,
                    isMonkModeOn: true,
                    currentTargetEndTime: effectiveNow - 3600000,
                  },
                  peakGoals: prev.peakGoals.map((g) => ({
                    ...g,
                    progressPct: 85,
                    currentMetric: Math.round(0.85 * g.targetMetric),
                    isCompleted: false,
                  })),
                }));
                showSternMessage(
                  'ĐÃ KÍCH HOẠT GIẢ LẬP QUÁ GIỜ (OVERTIME LOCK — 85%)',
                  'Thời gian lên núi đã hết nhưng tiến độ Đỉnh Núi mới đạt 85%. Hãy thử bấm vào nút Monk Mode ở góc trên bên phải để kiểm chứng hệ thống từ chối mở khóa!',
                  'info'
                );
              }}
            >
              Test Quá Giờ (Overtime Lock 85%)
            </button>

            <button
              type="button"
              className="dev-sim-btn dev-sim-btn-highlight"
              onClick={() => {
                soundEngine.playTempleBell(0.9);
                persistDb((prev) => ({
                  ...prev,
                  session: {
                    ...prev.session,
                    isMonkModeOn: true,
                    currentTargetEndTime: effectiveNow - 1000,
                  },
                  peakGoals: prev.peakGoals.map((g) => ({
                    ...g,
                    progressPct: 100,
                    currentMetric: g.targetMetric,
                    isCompleted: true,
                  })),
                  dailyStrikes: prev.dailyStrikes.map((s) => ({
                    ...s,
                    status: 'COMPLETED',
                    completedPomodoroMins: s.requiredPomodoroMins,
                    proofPhotoUri: s.proofPhotoUri || './assets/shanshui-monk-temple.jpg',
                  })),
                }));
                showSternMessage(
                  'ĐÃ ĐẠT 100% THỜI GIAN & 100% ĐỈNH NÚI!',
                  'Cả 2 điều kiện Khóa Kép (Dual-Lock) đã thỏa mãn. Hãy bấm nút màu đỏ "ĐẮC ĐẠO XUỐNG NÚI (MỞ KHÓA)" ở góc phải trên cùng để kích hoạt Nghi thức Đóng Dấu Mộc Đỏ Chu Sa!',
                  'seal'
                );
              }}
            >
              <Award size={14} />
              <span>Giả lập Viên Mãn 100% (Đóng Dấu Bí Kíp)</span>
            </button>

            <button
              type="button"
              className="dev-sim-btn"
              onClick={async () => {
                persistDb((prev) => ({
                  ...prev,
                  session: { ...prev.session, isMonkModeOn: false },
                }));
                setNaggingAlert(null);
                await desktopBridge.restoreWindowsWallpaper();
                showSternMessage(
                  'KHẨN CẤP MỞ KHÓA DEVELOPER (Ctrl+Shift+Alt+M)',
                  'Đã tắt Monk Mode và khôi phục hình nền gốc.',
                  'info'
                );
              }}
            >
              Tắt Khóa Khẩn Cấp (Ctrl+Shift+Alt+M)
            </button>
          </div>
        </footer>
      )}

      {/* Focus Timer Lock Modal (Pomodoro) */}
      <PomodoroLockModal
        isOpen={Boolean(activePomodoro)}
        taskTitle={activePomodoro?.title || ''}
        taskTypeLabel={
          activePomodoro?.type === 'RITUAL'
            ? 'NGHI THỨC HÀNG NGÀY (RITUAL / HABIT TRACKER)'
            : 'NHIỆM VỤ CÔNG PHÁ (DAILY STRIKE / TODO LIST)'
        }
        requiredMins={activePomodoro?.requiredMins || 25}
        isMonkModeOn={db.session.isMonkModeOn}
        devModeEnabled={true}
        onCompletePomodoro={handlePomodoroFinished}
        onCancelOrAbandon={(reason) => {
          setActivePomodoro(null);
          showSternMessage('PHIÊN POMODORO ĐÃ BỊ HỦY BỎ', reason, 'danger');
        }}
      />

      {/* Live Proof of Work Modal */}
      <LiveProofModal
        isOpen={Boolean(activeProof)}
        taskTitle={activeProof?.title || ''}
        onConfirmProof={handleProofConfirmed}
        onCancel={() => setActiveProof(null)}
      />

      {/* Sacred Scroll Viewer / Descending Mountain Ceremony Modal */}
      {(viewingScroll || ceremonyScroll) && (
        <SacredScrollBookViewer
          scroll={(ceremonyScroll || viewingScroll)!}
          isCeremonyMode={Boolean(ceremonyScroll)}
          onFinishCeremony={handleFinishDescendCeremony}
          onClose={() => {
            setViewingScroll(null);
            setCeremonyScroll(null);
          }}
          onExportedPdf={(scrollId, pdfPath) => {
            persistDb((prev) => ({
              ...prev,
              sacredScrolls: prev.sacredScrolls.map((s) =>
                s.id === scrollId ? { ...s, exportedPdfUri: pdfPath } : s
              ),
            }));
          }}
        />
      )}
    </div>
  );
};
