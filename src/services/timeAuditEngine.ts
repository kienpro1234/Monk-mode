import {
  DailyStrikeTodoEntity,
  DailyWorkShiftRecord,
  FocusSessionLogEntity,
  MonkDatabaseSchema,
  PeakGoalEntity,
  SIDE_QUEST_GOAL_ID,
  TimeAuditConfig,
  TodoActivityType,
} from '../types/models';
import {
  getEffectiveDayStartTime,
  getEffectiveNightStartTime,
  getLawConfig,
  getRitualDayEvaluation,
  getShiftDateStr,
  isRestDay,
  parseShiftStartHM,
  shiftDateStr,
} from './mountainLaws';
import {
  callConfiguredExternalAIText,
  getPreWorkLockWindow,
  parseTimeToMins,
} from './aiSchedulePlanner';

export const ALL_ACTIVITY_TYPES: TodoActivityType[] = [
  'STUDY',
  'DEEP_WORK',
  'HEALTH_REST',
  'CHORE',
  'WORK_SHIFT',
  'LEISURE',
];

export const ACTIVITY_TYPE_META: Record<
  TodoActivityType,
  {
    label: string;
    shortLabel: string;
    icon: string;
    color: string;
    isProductive: boolean;
    description: string;
  }
> = {
  STUDY: {
    label: 'Học Tập / Nạp Kiến Thức',
    shortLabel: 'Học Tập',
    icon: '📚',
    color: '#5BAE93',
    isProductive: true,
    description: 'Ngoại ngữ (HSK/IELTS), đọc sách chuyên môn, luyện đề, nghiên cứu',
  },
  DEEP_WORK: {
    label: 'Công Phá Kỹ Năng / Dự Án',
    shortLabel: 'Công Phá',
    icon: '⚔️',
    color: '#81c784',
    isProductive: true,
    description: 'Dự án mục tiêu lớn, thực hành kỹ năng, code, tập guitar...',
  },
  HEALTH_REST: {
    label: 'Thể Chất & Phục Hồi Chủ Động',
    shortLabel: 'Thể Chất',
    icon: '💪',
    color: '#4dd0e1',
    isProductive: true,
    description: 'Tập gym, planche, chạy bộ, giãn cơ, thiền phục hồi sức khỏe',
  },
  CHORE: {
    label: 'Việc Vặt & Sinh Hoạt',
    shortLabel: 'Việc Vặt',
    icon: '🧹',
    color: '#f0c878',
    isProductive: false,
    description: 'Tắm rửa, giặt giũ, dọn phòng, nấu ăn, mua sắm thiết yếu',
  },
  WORK_SHIFT: {
    label: 'Đi Làm Ca / Kiếm Sống',
    shortLabel: 'Đi Làm',
    icon: '💼',
    color: '#90a4ae',
    isProductive: false,
    description: 'Thời gian đi làm ca ngày / ca đêm (ngoài quỹ rảnh cá nhân)',
  },
  LEISURE: {
    label: 'Giải Trí / Chơi Có Kiểm Soát',
    shortLabel: 'Giải Trí',
    icon: '🎮',
    color: '#ce93d8',
    isProductive: false,
    description: 'Chơi game, xem phim, giải trí có chủ đích bấm giờ rõ ràng',
  },
};

export const DEFAULT_TIME_AUDIT_CONFIG: Required<TimeAuditConfig> = {
  sleepHoursPerDay: 7.5,
  workShiftHoursPerDay: 8,
  essentialRoutineHoursPerDay: 1.5,
  dailyTargetProductiveMins: 180,
};

export function getTimeAuditConfig(db: MonkDatabaseSchema): Required<TimeAuditConfig> {
  const raw = db.session?.timeAuditConfig;
  return {
    sleepHoursPerDay: Math.max(4, Math.min(12, raw?.sleepHoursPerDay ?? 7.5)),
    workShiftHoursPerDay: Math.max(0, Math.min(14, raw?.workShiftHoursPerDay ?? 8)),
    essentialRoutineHoursPerDay: Math.max(0.5, Math.min(6, raw?.essentialRoutineHoursPerDay ?? 1.5)),
    dailyTargetProductiveMins: Math.max(30, Math.min(720, raw?.dailyTargetProductiveMins ?? 180)),
  };
}

export function inferTodoActivityType(
  strike: Pick<DailyStrikeTodoEntity, 'goalId' | 'title' | 'activityType'>,
  goalsById: Map<string, Pick<PeakGoalEntity, 'id' | 'title' | 'category'>>
): TodoActivityType {
  if (strike.activityType && ACTIVITY_TYPE_META[strike.activityType]) {
    return strike.activityType;
  }

  const titleLower = (strike.title || '').toLowerCase();
  if (strike.goalId === SIDE_QUEST_GOAL_ID) {
    if (/(đi làm|tăng ca|trực ca|công ty|vào ca)/i.test(titleLower)) return 'WORK_SHIFT';
    if (/(game|chơi |xem phim|netflix|lướt web|thư giãn)/i.test(titleLower)) return 'LEISURE';
    return 'CHORE';
  }

  const goal = goalsById.get(strike.goalId);
  const combined = `${goal?.title || ''} ${goal?.category || ''} ${titleLower}`.toLowerCase();

  if (
    /(gym|6 múi|body|cơ bắp|planche|chạy bộ|thể dục|workout|sức khỏe|thể chất|calisthenics|yoga|hít đất)/i.test(
      combined
    )
  ) {
    return 'HEALTH_REST';
  }
  if (
    /(hsk|ielts|toeic|tiếng trung|tiếng anh|ngoại ngữ|từ vựng|nghe |đọc sách|chứng chỉ|học |ôn thi|giáo trình|khóa học|study)/i.test(
      combined
    )
  ) {
    return 'STUDY';
  }
  if (/(đi làm|công ty|trực ca|tăng ca)/i.test(combined)) {
    return 'WORK_SHIFT';
  }
  if (/(chơi game|giải trí|xem phim)/i.test(combined)) {
    return 'LEISURE';
  }

  return 'DEEP_WORK';
}

export interface LiveActiveSessionInput {
  strikeId: string;
  goalId: string;
  title: string;
  activityType: TodoActivityType;
  elapsedMins: number;
  date: string;
}

export interface HourlyActivityBucket {
  hour: number;
  label: string;
  minsByType: Record<TodoActivityType, number>;
  totalMins: number;
}

export interface DayTimeBudgetBreakdown {
  hasConfirmedWorkShift: boolean;
  isDayOffNoWork: boolean;
  workStartTime: string;
  workEndTime?: string;
  workMins: number;
  sleepMins: number;
  sleepSource: 'OVERRIDE' | 'AI_SCHEDULE' | 'DEFAULT_CONFIG';
  sleepWindowLabel?: string;
  prepLockMins: number;
  prepLockLabel?: string;
  fullDayFreeBudgetMins: number;
  elapsedFreeBudgetMins: number;
  remainingFreeBudgetMins: number;
  formulaText: string;
}

export interface DayTimeAuditResult {
  date: string;
  isToday: boolean;
  isRestDay: boolean;
  isInactive: boolean;
  minsByType: Record<TodoActivityType, number>;
  productiveMins: number; // STUDY + DEEP_WORK + HEALTH_REST
  choreMins: number;
  workShiftLoggedMins: number;
  leisureMins: number;
  trackedDiscretionaryMins: number; // productive + chore + leisure
  discretionaryBudgetMins: number;
  wastedMins: number;
  utilizationPct: number;
  highValuePct: number;
  plannedScheduleMins: number;
  scheduleAdherencePct: number;
  completedTodosCount: number;
  zeroPomoCompletedTodosCount: number;
  powVerifiedTodosCount: number;
  realEffortScore: number;
  verdictLevel:
    | 'ELITE'
    | 'SOLID'
    | 'DRIFTING'
    | 'ILLUSION_ALERT'
    | 'REST'
    | 'IDLE'
    | 'AWAITING_WORK_LOG';
  verdictLabel: string;
  insights: string[];
  hourlyBuckets: HourlyActivityBucket[];
  sessions: FocusSessionLogEntity[];
  budgetBreakdown: DayTimeBudgetBreakdown;
}

export type TimeAuditRangeMode = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';

export interface RangeBucketItem {
  key: string;
  label: string;
  minsByType: Record<TodoActivityType, number>;
  productiveMins: number;
  choreMins: number;
  leisureMins: number;
  workShiftLoggedMins: number;
  discretionaryBudgetMins: number;
  wastedMins: number;
  utilizationPct: number;
  realEffortScore: number;
  isInactive?: boolean;
  isRestDay?: boolean;
}

export interface TimeAuditRangeSummary {
  mode: TimeAuditRangeMode;
  periodLabel: string;
  startDateStr: string;
  endDateStr: string;
  totals: {
    minsByType: Record<TodoActivityType, number>;
    productiveMins: number;
    choreMins: number;
    leisureMins: number;
    workShiftLoggedMins: number;
    trackedDiscretionaryMins: number;
    discretionaryBudgetMins: number;
    wastedMins: number;
    utilizationPct: number;
    highValuePct: number;
    avgRealEffortScore: number;
    activeDaysCount: number;
    restDaysCount: number;
    zeroPomoCompletedTodosCount: number;
    powVerifiedTodosCount: number;
  };
  buckets: RangeBucketItem[];
  bestDay: RangeBucketItem | null;
  worstDay: RangeBucketItem | null;
  dayDetail: DayTimeAuditResult | null;
}

export interface WeeklyMountainPlanVsActual {
  goalId: string;
  goalTitle: string;
  plannedMins: number;
  actualMins: number;
  adherencePct: number;
}

export interface WeeklyReviewStats {
  startDateStr: string;
  endDateStr: string;
  mountainStats: WeeklyMountainPlanVsActual[];
  totalPlannedMins: number;
  totalActualClimbMins: number;
  overallAdherencePct: number;
  avgRitualPct: number;
  sideQuestsCompletedCount: number;
  optNotesAppliedRecentCount: number;
  totalProductiveMins: number;
  totalChoreMins: number;
  totalWastedMins: number;
  zeroPomoCompletedTodosCount: number;
  realEffortScoreAvg: number;
  deterministicCoachLines: string[];
}

function createEmptyMinsByType(): Record<TodoActivityType, number> {
  return {
    STUDY: 0,
    DEEP_WORK: 0,
    HEALTH_REST: 0,
    CHORE: 0,
    WORK_SHIFT: 0,
    LEISURE: 0,
  };
}

function parseDateParts(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split('-').map(Number);
  return [y || 2026, m || 1, d || 1];
}

function mergeBlockedIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  const valid = intervals
    .map(([a, b]): [number, number] => [Math.max(0, Math.min(1440, a)), Math.max(0, Math.min(1440, b))])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of valid) {
    if (merged.length === 0 || s > merged[merged.length - 1][1]) {
      merged.push([s, e]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    }
  }
  return merged;
}

function formatAuditMinsCompact(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m}p`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h ${r}p`;
}

/**
 * Tính tổng số phút đi làm giữa giờ bắt đầu và giờ kết thúc (tự xử lý ca đêm vắt qua 00:00).
 */
export function computeWorkShiftDurationMins(startTimeStr: string, endTimeStr: string): number {
  const startM = parseTimeToMins(startTimeStr, -1);
  const endM = parseTimeToMins(endTimeStr, -1);
  if (startM < 0 || endM < 0) return 0;
  let diff = endM - startM;
  if (diff <= 0) diff += 1440;
  return Math.max(0, Math.min(18 * 60, diff));
}

/**
 * Tự động đọc các khung Ngủ Phục Hồi (kind='SLEEP' hoặc tiêu đề có chữ Ngủ) trong Lịch Trình AI
 * để đồng bộ vào công thức Quỹ Thời Gian Rảnh 24h.
 */
export function extractSleepFromSchedule(
  db: MonkDatabaseSchema,
  dayOfWeek: number,
  fallbackSleepMins: number
): {
  totalSleepMins: number;
  intervalsClock: Array<[number, number]>;
  windowLabel?: string;
  source: 'AI_SCHEDULE' | 'DEFAULT_CONFIG';
} {
  const dayPlan = db.climbingSchedulePlan?.days?.find((d) => d.dayOfWeek === dayOfWeek);
  const sleepSlots = (dayPlan?.slots || []).filter(
    (sl) =>
      sl.kind === 'SLEEP' ||
      (sl.kind === 'REST_ROUTINE' && /ngủ|sleep/i.test(sl.title || ''))
  );
  if (sleepSlots.length === 0) {
    return {
      totalSleepMins: fallbackSleepMins,
      intervalsClock: [],
      source: 'DEFAULT_CONFIG',
    };
  }

  let totalSleepMins = 0;
  const intervalsClock: Array<[number, number]> = [];
  const labels: string[] = [];

  for (const sl of sleepSlots) {
    const s = parseTimeToMins(sl.startTime, -1);
    const e = parseTimeToMins(sl.endTime, -1);
    if (s < 0 || e < 0) continue;
    let dur = e - s;
    if (dur <= 0) dur += 1440;
    dur = Math.max(30, Math.min(840, dur));
    totalSleepMins += dur;
    intervalsClock.push([s, e]);
    labels.push(`${sl.startTime}–${sl.endTime}`);
  }

  if (totalSleepMins <= 0) {
    return {
      totalSleepMins: fallbackSleepMins,
      intervalsClock: [],
      source: 'DEFAULT_CONFIG',
    };
  }

  return {
    totalSleepMins,
    intervalsClock,
    windowLabel: labels.join(', '),
    source: 'AI_SCHEDULE',
  };
}

function addClockIntervalAsShiftOffset(
  blocked: Array<[number, number]>,
  sClock: number,
  eClock: number,
  shiftStartClockMins: number
) {
  let dur = eClock - sClock;
  if (dur <= 0) dur += 1440;
  let sOff = sClock - shiftStartClockMins;
  if (sOff < 0) sOff += 1440;
  const eOff = sOff + dur;
  if (eOff <= 1440) {
    blocked.push([sOff, eOff]);
  } else {
    blocked.push([sOff, 1440]);
    blocked.push([0, eOff - 1440]);
  }
}

function computeTransparentDiscretionaryStats(params: {
  db: MonkDatabaseSchema;
  targetDateStr: string;
  isToday: boolean;
  nowMs: number;
  cfg: Required<TimeAuditConfig>;
  dayOfWeek: number;
  workRecord?: DailyWorkShiftRecord;
  trackedDiscretionaryMins: number;
}): DayTimeBudgetBreakdown {
  const { db, targetDateStr, isToday, nowMs, cfg, dayOfWeek, workRecord, trackedDiscretionaryMins } =
    params;
  const lawCfg = getLawConfig(db);
  const shiftMode = lawCfg.workShiftMode || 'DAY';
  const dayStartStr = getEffectiveDayStartTime(lawCfg);
  const nightStartStr = getEffectiveNightStartTime(lawCfg);

  const sleepInfo = extractSleepFromSchedule(
    db,
    dayOfWeek,
    Math.round(cfg.sleepHoursPerDay * 60)
  );
  const hasOverrideSleep =
    workRecord?.sleepOverrideMins !== undefined && workRecord.sleepOverrideMins !== null;
  const sleepMins = hasOverrideSleep
    ? Math.max(0, Math.min(14 * 60, Math.round(workRecord!.sleepOverrideMins!)))
    : sleepInfo.totalSleepMins;
  const sleepSource: DayTimeBudgetBreakdown['sleepSource'] = hasOverrideSleep
    ? 'OVERRIDE'
    : sleepInfo.source;
  const sleepWindowLabel = hasOverrideSleep
    ? `${formatAuditMinsCompact(sleepMins)} (tự chỉnh)`
    : sleepInfo.windowLabel;

  const defaultWorkStart = shiftMode === 'NIGHT' ? nightStartStr : dayStartStr;
  const workStartTime = workRecord?.workStartTime || defaultWorkStart;
  const workEndTime = workRecord?.workEndTime;
  const isDayOff = Boolean(workRecord?.isDayOffNoWork);
  const prepLock = getPreWorkLockWindow(workStartTime, shiftMode === 'NIGHT' ? 19 * 60 : 8 * 60);
  const prepLockLabel = isDayOff
    ? undefined
    : `${prepLock.prepStartStr} – ${prepLock.workStartStr}`;

  // For TODAY before user confirms work shift (chưa bấm "Đã đi làm về" / chưa tự nhập giờ làm)
  if (isToday && !workRecord) {
    return {
      hasConfirmedWorkShift: false,
      isDayOffNoWork: false,
      workStartTime,
      workMins: 0,
      sleepMins,
      sleepSource,
      sleepWindowLabel,
      prepLockMins: 60,
      prepLockLabel,
      fullDayFreeBudgetMins: 0,
      elapsedFreeBudgetMins: trackedDiscretionaryMins,
      remainingFreeBudgetMins: 0,
      formulaText: `Chờ xác nhận giờ đi làm (bắt đầu từ ${workStartTime}). Sau khi bấm "Đã đi làm về" hoặc tự nhập giờ làm, hệ thống sẽ tính chuẩn xác: 24h − Ngủ (${formatAuditMinsCompact(
        sleepMins
      )}) − Đi làm − Khóa 1h = Quỹ rảnh hôm nay.`,
    };
  }

  const workMins = workRecord
    ? isDayOff
      ? 0
      : Math.max(0, Math.round(workRecord.workDurationMins))
    : Math.round(cfg.workShiftHoursPerDay * 60);
  const prepLockMins = workRecord ? (isDayOff ? 0 : workRecord.prepLockMins ?? 60) : 60;
  const fullDayFreeBudgetMins = Math.max(0, 1440 - sleepMins - workMins - prepLockMins);

  const prepPart = prepLockMins > 0 ? ` − Khóa chuẩn bị ${formatAuditMinsCompact(prepLockMins)}` : '';
  const workPart = isDayOff
    ? ' − Đi làm 0p (Nghỉ)'
    : ` − Đi làm ${formatAuditMinsCompact(workMins)}${
        workEndTime ? ` (${workStartTime}→${workEndTime})` : ''
      }`;
  const formulaText = `24h (1440p) − Ngủ ${formatAuditMinsCompact(sleepMins)}${workPart}${prepPart} = Quỹ rảnh ${formatAuditMinsCompact(
    fullDayFreeBudgetMins
  )} (${fullDayFreeBudgetMins}p)`;

  if (!isToday) {
    return {
      hasConfirmedWorkShift: Boolean(workRecord),
      isDayOffNoWork: isDayOff,
      workStartTime,
      workEndTime,
      workMins,
      sleepMins,
      sleepSource,
      sleepWindowLabel,
      prepLockMins,
      prepLockLabel,
      fullDayFreeBudgetMins,
      elapsedFreeBudgetMins: Math.max(trackedDiscretionaryMins, fullDayFreeBudgetMins),
      remainingFreeBudgetMins: 0,
      formulaText,
    };
  }

  // Compute exact non-free blocked intervals along today's 24h shift window [0, 1440]
  const [y, m, d] = parseDateParts(targetDateStr);
  const nightHM = parseShiftStartHM(nightStartStr, 19);
  const shiftStartClockMins = shiftMode === 'NIGHT' ? nightHM.hour * 60 + nightHM.minute : 0;
  const shiftStartMs =
    shiftMode === 'NIGHT'
      ? new Date(y, m - 1, d, nightHM.hour, nightHM.minute, 0, 0).getTime()
      : new Date(y, m - 1, d, 0, 0, 0, 0).getTime();

  const blocked: Array<[number, number]> = [];
  const workStartClockMins = parseTimeToMins(workStartTime, shiftMode === 'NIGHT' ? 19 * 60 : 8 * 60);

  if (!isDayOff && workMins > 0) {
    addClockIntervalAsShiftOffset(
      blocked,
      workStartClockMins,
      (workStartClockMins + workMins) % 1440 || 1440,
      shiftStartClockMins
    );
  }

  if (!isDayOff && prepLockMins > 0) {
    if (shiftMode !== 'NIGHT') {
      const pStart = Math.max(0, workStartClockMins - prepLockMins);
      blocked.push([pStart, workStartClockMins]);
    } else {
      blocked.push([Math.max(0, 1440 - prepLockMins), 1440]);
    }
  }

  if (sleepMins > 0) {
    if (sleepSource === 'AI_SCHEDULE' && sleepInfo.intervalsClock.length > 0) {
      for (const [sc, ec] of sleepInfo.intervalsClock) {
        addClockIntervalAsShiftOffset(blocked, sc, ec, shiftStartClockMins);
      }
    } else if (shiftMode !== 'NIGHT') {
      const anchorBeforePrep = !isDayOff ? Math.max(0, workStartClockMins - prepLockMins) : 7 * 60;
      if (anchorBeforePrep >= sleepMins) {
        blocked.push([anchorBeforePrep - sleepMins, anchorBeforePrep]);
      } else {
        blocked.push([0, anchorBeforePrep]);
        blocked.push([1440 - (sleepMins - anchorBeforePrep), 1440]);
      }
    } else {
      const workEndOff = isDayOff
        ? 0
        : Math.min(1380, ((workStartClockMins - shiftStartClockMins + 1440) % 1440) + workMins);
      const sleepStart = Math.min(1320, workEndOff + (isDayOff ? 60 : 30));
      blocked.push([sleepStart, Math.min(1380, sleepStart + sleepMins)]);
    }
  }

  const nowOffsetMins = Math.max(0, Math.min(1440, Math.floor((nowMs - shiftStartMs) / 60000)));
  const merged = mergeBlockedIntervals(blocked);
  let blockedElapsed = 0;
  for (const [bs, be] of merged) {
    if (bs >= nowOffsetMins) break;
    blockedElapsed += Math.min(nowOffsetMins, be) - bs;
  }

  const rawElapsedFreeMins = Math.min(
    fullDayFreeBudgetMins,
    Math.max(0, nowOffsetMins - blockedElapsed)
  );
  const elapsedFreeBudgetMins = Math.max(trackedDiscretionaryMins, rawElapsedFreeMins);
  const remainingFreeBudgetMins = Math.max(0, fullDayFreeBudgetMins - rawElapsedFreeMins);

  return {
    hasConfirmedWorkShift: true,
    isDayOffNoWork: isDayOff,
    workStartTime,
    workEndTime,
    workMins,
    sleepMins,
    sleepSource,
    sleepWindowLabel,
    prepLockMins,
    prepLockLabel,
    fullDayFreeBudgetMins,
    elapsedFreeBudgetMins,
    remainingFreeBudgetMins,
    formulaText,
  };
}

export function computeDayTimeAudit(
  db: MonkDatabaseSchema,
  targetDateStr: string,
  todayStr: string,
  nowMs: number = Date.now(),
  liveSession?: LiveActiveSessionInput | null
): DayTimeAuditResult {
  const lawCfg = getLawConfig(db);
  const shiftMode = lawCfg.workShiftMode || 'DAY';
  const nightStartStr = getEffectiveNightStartTime(lawCfg);
  const cfg = getTimeAuditConfig(db);

  const goalsById = new Map((db.peakGoals || []).map((g) => [g.id, g]));
  const minsByType = createEmptyMinsByType();
  const daySessions: FocusSessionLogEntity[] = [];

  // Initialize 24h ordered along the active shift start
  const nightHM = parseShiftStartHM(nightStartStr, 19);
  const startHour = shiftMode === 'NIGHT' ? nightHM.hour : 0;
  const hourlyBuckets: HourlyActivityBucket[] = Array.from({ length: 24 }, (_, idx) => {
    const h = (startHour + idx) % 24;
    return {
      hour: h,
      label: `${String(h).padStart(2, '0')}h`,
      minsByType: createEmptyMinsByType(),
      totalMins: 0,
    };
  });
  const hourlyByHour = new Map(hourlyBuckets.map((b) => [b.hour, b]));

  const addMinutesToHourly = (endMs: number, durationMins: number, type: TodoActivityType) => {
    if (durationMins <= 0) return;
    let remaining = durationMins;
    let cursorEnd = endMs;
    while (remaining > 0) {
      const slice = Math.min(remaining, 60);
      const midPoint = cursorEnd - Math.round((slice * 60000) / 2);
      const hr = new Date(midPoint).getHours();
      const bucket = hourlyByHour.get(hr);
      if (bucket) {
        bucket.minsByType[type] += slice;
        bucket.totalMins += slice;
      }
      cursorEnd -= slice * 60000;
      remaining -= slice;
    }
  };

  // 1. Explicit FocusSessionLogEntity records for this date
  const loggedMinsByStrike = new Map<string, number>();
  for (const log of db.focusSessionLogs || []) {
    if (!log || log.date !== targetDateStr) continue;
    const mins = Math.max(0, Math.round(log.durationMins || 0));
    if (mins <= 0) continue;
    const actType = ACTIVITY_TYPE_META[log.activityType] ? log.activityType : 'DEEP_WORK';
    minsByType[actType] += mins;
    daySessions.push({ ...log, durationMins: mins, activityType: actType });
    if (log.strikeId) {
      loggedMinsByStrike.set(log.strikeId, (loggedMinsByStrike.get(log.strikeId) || 0) + mins);
    }
    addMinutesToHourly(log.endedAt || nowMs, mins, actType);
  }

  // 2. Backwards-compatibility reconciliation from legacy dailyStrikes without double-counting
  const strikesOnDate: DailyStrikeTodoEntity[] = [];
  for (const strike of db.dailyStrikes || []) {
    const strikeEffectiveDate = strike.completedAt
      ? getShiftDateStr(strike.completedAt, shiftMode, nightStartStr)
      : strike.date;
    if (strikeEffectiveDate === targetDateStr || strike.date === targetDateStr) {
      strikesOnDate.push(strike);
    }
    if (strikeEffectiveDate !== targetDateStr) continue;

    const totalCompletedMins = Math.max(0, Math.round(strike.completedPomodoroMins || 0));
    const alreadyLogged = loggedMinsByStrike.get(strike.id) || 0;
    const deltaMins = totalCompletedMins - alreadyLogged;
    if (deltaMins > 0) {
      const actType = inferTodoActivityType(strike, goalsById);
      minsByType[actType] += deltaMins;
      const [sy, sm, sd] = parseDateParts(targetDateStr);
      const refEndMs =
        strike.completedAt ||
        new Date(sy, sm - 1, sd, shiftMode === 'NIGHT' ? 16 : 20, 0, 0).getTime();
      daySessions.push({
        id: `legacy-${strike.id}-${targetDateStr}`,
        date: targetDateStr,
        startedAt: refEndMs - deltaMins * 60000,
        endedAt: refEndMs,
        durationMins: deltaMins,
        activityType: actType,
        goalId: strike.goalId,
        strikeId: strike.id,
        title: strike.title,
        source: 'POMODORO_FULL',
      });
      addMinutesToHourly(refEndMs, deltaMins, actType);
    }
  }

  // 3. Live active Pomodoro session in progress (real-time credit!)
  if (liveSession && liveSession.date === targetDateStr && liveSession.elapsedMins > 0) {
    const actType = ACTIVITY_TYPE_META[liveSession.activityType]
      ? liveSession.activityType
      : 'DEEP_WORK';
    minsByType[actType] += liveSession.elapsedMins;
    daySessions.push({
      id: `live-${liveSession.strikeId}`,
      date: targetDateStr,
      startedAt: nowMs - liveSession.elapsedMins * 60000,
      endedAt: nowMs,
      durationMins: liveSession.elapsedMins,
      activityType: actType,
      goalId: liveSession.goalId,
      strikeId: liveSession.strikeId,
      title: `🔴 Đang chạy: ${liveSession.title}`,
      source: 'POMODORO_EARLY_FINISH',
    });
    addMinutesToHourly(nowMs, liveSession.elapsedMins, actType);
  }

  daySessions.sort((a, b) => b.endedAt - a.endedAt);

  // 4. Completion authenticity & AI planned mins check
  const completedToday = strikesOnDate.filter((s) => {
    if (s.status !== 'COMPLETED') return false;
    const effDate = s.completedAt
      ? getShiftDateStr(s.completedAt, shiftMode, nightStartStr)
      : s.date;
    return effDate === targetDateStr;
  });

  let zeroPomoCompletedTodosCount = 0;
  let powVerifiedTodosCount = 0;
  for (const s of completedToday) {
    const actType = inferTodoActivityType(s, goalsById);
    const hasPhoto = Boolean(s.proofPhotoUri) || Boolean(s.proofPhotosList && s.proofPhotosList.length > 0);
    const totalPomo = s.completedPomodoroMins || 0;
    if (ACTIVITY_TYPE_META[actType].isProductive && totalPomo === 0 && (s.pomodoroSessionsCount || 0) === 0) {
      zeroPomoCompletedTodosCount++;
    }
    if (hasPhoto || totalPomo >= 15) {
      powVerifiedTodosCount++;
    }
  }

  const [py, pm, pd] = parseDateParts(targetDateStr);
  const dayOfWeek = new Date(py, pm - 1, pd, 12).getDay();
  const planDay = db.climbingSchedulePlan?.days?.find((d) => d.dayOfWeek === dayOfWeek);
  const plannedScheduleMins = (planDay?.slots || [])
    .filter((sl) => sl.kind === 'CLIMB')
    .reduce((sum, sl) => sum + (sl.pomodoroMins || 0), 0);

  const productiveMins = minsByType.STUDY + minsByType.DEEP_WORK + minsByType.HEALTH_REST;
  const choreMins = minsByType.CHORE;
  const workShiftLoggedMins = minsByType.WORK_SHIFT;
  const leisureMins = minsByType.LEISURE;
  const trackedDiscretionaryMins = productiveMins + choreMins + leisureMins;

  const isToday = targetDateStr === todayStr;
  const sessionStartStr = db.session?.startTime
    ? getShiftDateStr(db.session.startTime, shiftMode, nightStartStr)
    : todayStr;
  const heatmapResetDate = db.session?.heatmapResetDate || '';
  const effectiveStartStr =
    heatmapResetDate && heatmapResetDate > sessionStartStr ? heatmapResetDate : sessionStartStr;

  const isApprovedRest = isRestDay(db, targetDateStr, lawCfg);
  const hasViolationOnDate = (db.violations || []).some((v) => v.date === targetDateStr);
  const isFutureDate = targetDateStr > todayStr;
  const isBeforeStart = targetDateStr < effectiveStartStr;
  const isInactive =
    isFutureDate ||
    (isBeforeStart && daySessions.length === 0) ||
    (!isToday &&
      daySessions.length === 0 &&
      strikesOnDate.length === 0 &&
      !hasViolationOnDate &&
      !isApprovedRest &&
      targetDateStr <= effectiveStartStr);

  const workRecord = db.dailyWorkShiftLogs?.[targetDateStr];
  const budgetBreakdown = computeTransparentDiscretionaryStats({
    db,
    targetDateStr,
    isToday,
    nowMs,
    cfg,
    dayOfWeek,
    workRecord,
    trackedDiscretionaryMins,
  });

  let discretionaryBudgetMins = 0;
  if (isApprovedRest || isInactive) {
    discretionaryBudgetMins = trackedDiscretionaryMins;
  } else if (isToday && !budgetBreakdown.hasConfirmedWorkShift) {
    discretionaryBudgetMins = trackedDiscretionaryMins;
  } else {
    discretionaryBudgetMins = budgetBreakdown.elapsedFreeBudgetMins;
  }

  const awaitingWorkLog = isToday && !isApprovedRest && !budgetBreakdown.hasConfirmedWorkShift;
  const wastedMins =
    isApprovedRest || isInactive || awaitingWorkLog
      ? 0
      : Math.max(0, discretionaryBudgetMins - trackedDiscretionaryMins);

  const utilizedUsefulMins = productiveMins + choreMins;
  const utilizationPct = awaitingWorkLog
    ? trackedDiscretionaryMins > 0
      ? 100
      : 0
    : discretionaryBudgetMins > 0
    ? Math.min(100, Math.round((utilizedUsefulMins / discretionaryBudgetMins) * 100))
    : isToday
    ? 100
    : 0;
  const highValuePct = awaitingWorkLog
    ? 0
    : discretionaryBudgetMins > 0
    ? Math.min(100, Math.round((productiveMins / discretionaryBudgetMins) * 100))
    : 0;
  const scheduleAdherencePct =
    plannedScheduleMins > 0 ? Math.min(150, Math.round((productiveMins / plannedScheduleMins) * 100)) : 0;

  // Real Effort Score (0..100): blends productive target attainment + non-waste + authenticity
  const targetRatio = Math.min(1, productiveMins / cfg.dailyTargetProductiveMins);
  const budgetRatio =
    discretionaryBudgetMins > 0
      ? Math.min(1, utilizedUsefulMins / discretionaryBudgetMins)
      : targetRatio;
  const rawScore = Math.round(
    targetRatio * 60 +
      budgetRatio * 30 +
      (completedToday.length > 0 && zeroPomoCompletedTodosCount === 0 ? 10 : 4) -
      zeroPomoCompletedTodosCount * 12
  );
  const realEffortScore = isApprovedRest || isInactive ? 100 : Math.max(0, Math.min(100, rawScore));

  let verdictLevel: DayTimeAuditResult['verdictLevel'] = 'SOLID';
  let verdictLabel = 'Ổn định — Có nỗ lực thực tế';
  if (isInactive) {
    verdictLevel = 'IDLE';
    verdictLabel = 'Chưa có dữ liệu hoạt động';
  } else if (isApprovedRest) {
    verdictLevel = 'REST';
    verdictLabel = 'Ngày Nghỉ Có Phép (Được bảo toàn kỷ luật)';
  } else if (awaitingWorkLog) {
    verdictLevel = 'AWAITING_WORK_LOG';
    verdictLabel = `Chờ chốt giờ đi làm (Bấm "Đã đi làm về" hoặc tự nhập để tính chuẩn quỹ rảnh)`;
  } else if (zeroPomoCompletedTodosCount > 0) {
    verdictLevel = 'ILLUSION_ALERT';
    verdictLabel =
      productiveMins < 30
        ? 'Cảnh báo Nỗ Lực Ảo (Tick Todo nhưng chưa bấm Pomodoro)'
        : 'Cần cẩn trọng: Có Todo tick xong 0 phút Pomodoro (Nỗ Lực Ảo)';
  } else if (realEffortScore >= 80 && highValuePct >= 45) {
    verdictLevel = 'ELITE';
    verdictLabel = 'Chiến Binh Kỷ Luật — Nỗ lực thật xuất sắc';
  } else if (wastedMins >= 150 || (discretionaryBudgetMins >= 90 && utilizationPct < 35)) {
    verdictLevel = 'DRIFTING';
    verdictLabel = 'Lãng phí nhiều quỹ thời gian rảnh';
  }

  const insights: string[] = [];
  if (!isInactive && !isApprovedRest) {
    if (awaitingWorkLog) {
      insights.push(
        `🏠 Bấm "Xác nhận đã đi làm về" hoặc tự nhập giờ đi làm ở khung bên trên để mở khóa công thức Quỹ rảnh = 24h − Ngủ (${formatAuditMinsCompact(
          budgetBreakdown.sleepMins
        )}) − Đi làm − Khóa 1h.`
      );
    }
    if (zeroPomoCompletedTodosCount > 0) {
      insights.push(
        `🚨 Phát hiện ${zeroPomoCompletedTodosCount} Todo Công Phá được đánh dấu xong với 0 phút Pomodoro — hãy luôn bật Pomodoro khi làm để đo nỗ lực thật.`
      );
    }
    if (wastedMins > 60) {
      insights.push(
        `⏳ Có ${wastedMins} phút trong quỹ rảnh (${(wastedMins / 60).toFixed(
          1
        )}h) trôi qua mà chưa mở Todo hoặc chưa ghi nhận hoạt động.`
      );
    }
    if (productiveMins >= cfg.dailyTargetProductiveMins) {
      insights.push(
        `🔥 Đạt vượt mục tiêu tập trung cao (${productiveMins}/${cfg.dailyTargetProductiveMins} phút Học Tập + Công Phá + Thể Chất).`
      );
    } else if (discretionaryBudgetMins > 0) {
      insights.push(
        `🎯 Hiện đã tập trung cao ${productiveMins}/${cfg.dailyTargetProductiveMins} phút mục tiêu ngày.`
      );
    }
    if (plannedScheduleMins > 0) {
      insights.push(
        `📅 Khớp Lịch AI: ${productiveMins}/${plannedScheduleMins} phút leo núi dự kiến (${scheduleAdherencePct}%).`
      );
    }
  }

  return {
    date: targetDateStr,
    isToday,
    isRestDay: isApprovedRest,
    isInactive,
    minsByType,
    productiveMins,
    choreMins,
    workShiftLoggedMins,
    leisureMins,
    trackedDiscretionaryMins,
    discretionaryBudgetMins,
    wastedMins,
    utilizationPct,
    highValuePct,
    plannedScheduleMins,
    scheduleAdherencePct,
    completedTodosCount: completedToday.length,
    zeroPomoCompletedTodosCount,
    powVerifiedTodosCount,
    realEffortScore,
    verdictLevel,
    verdictLabel,
    insights,
    hourlyBuckets,
    sessions: daySessions,
    budgetBreakdown,
  };
}

function getDatesInRange(startDateStr: string, endDateStr: string): string[] {
  const result: string[] = [];
  let cursor = startDateStr;
  let guard = 0;
  while (cursor <= endDateStr && guard < 400) {
    result.push(cursor);
    cursor = shiftDateStr(cursor, 1);
    guard++;
  }
  return result;
}

export function computeTimeAuditRange(
  db: MonkDatabaseSchema,
  mode: TimeAuditRangeMode,
  anchorDateStr: string,
  todayStr: string,
  nowMs: number = Date.now(),
  liveSession?: LiveActiveSessionInput | null
): TimeAuditRangeSummary {
  const safeAnchor = anchorDateStr > todayStr ? todayStr : anchorDateStr;
  const totalsByType = createEmptyMinsByType();
  let productiveMins = 0;
  let choreMins = 0;
  let leisureMins = 0;
  let workShiftLoggedMins = 0;
  let discretionaryBudgetMins = 0;
  let wastedMins = 0;
  let scoreSum = 0;
  let activeDaysCount = 0;
  let restDaysCount = 0;
  let zeroPomoTotal = 0;
  let powVerifiedTotal = 0;

  let startDateStr = safeAnchor;
  let endDateStr = safeAnchor;
  let periodLabel = safeAnchor;
  let dayDetail: DayTimeAuditResult | null = null;
  const buckets: RangeBucketItem[] = [];

  if (mode === 'DAY') {
    const dayRes = computeDayTimeAudit(db, safeAnchor, todayStr, nowMs, liveSession);
    dayDetail = dayRes;
    const [y, m, d] = parseDateParts(safeAnchor);
    periodLabel = `Ngày ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;

    for (const t of ALL_ACTIVITY_TYPES) {
      totalsByType[t] = dayRes.minsByType[t];
    }
    productiveMins = dayRes.productiveMins;
    choreMins = dayRes.choreMins;
    leisureMins = dayRes.leisureMins;
    workShiftLoggedMins = dayRes.workShiftLoggedMins;
    discretionaryBudgetMins = dayRes.discretionaryBudgetMins;
    wastedMins = dayRes.wastedMins;
    scoreSum = dayRes.realEffortScore;
    activeDaysCount = dayRes.isInactive ? 0 : 1;
    restDaysCount = dayRes.isRestDay ? 1 : 0;
    zeroPomoTotal = dayRes.zeroPomoCompletedTodosCount;
    powVerifiedTotal = dayRes.powVerifiedTodosCount;

    for (const hb of dayRes.hourlyBuckets) {
      const hProd = hb.minsByType.STUDY + hb.minsByType.DEEP_WORK + hb.minsByType.HEALTH_REST;
      buckets.push({
        key: String(hb.hour),
        label: hb.label,
        minsByType: { ...hb.minsByType },
        productiveMins: hProd,
        choreMins: hb.minsByType.CHORE,
        leisureMins: hb.minsByType.LEISURE,
        workShiftLoggedMins: hb.minsByType.WORK_SHIFT,
        discretionaryBudgetMins: Math.max(hb.totalMins, 60),
        wastedMins: 0,
        utilizationPct: Math.min(100, Math.round(((hProd + hb.minsByType.CHORE) / 60) * 100)),
        realEffortScore: dayRes.realEffortScore,
      });
    }
  } else if (mode === 'WEEK' || mode === 'MONTH') {
    if (mode === 'WEEK') {
      const [y, m, d] = parseDateParts(safeAnchor);
      const dow = new Date(y, m - 1, d, 12).getDay();
      const offsetFromMon = dow === 0 ? 6 : dow - 1;
      startDateStr = shiftDateStr(safeAnchor, -offsetFromMon);
      endDateStr = shiftDateStr(startDateStr, 6);
      periodLabel = `Tuần ${startDateStr.slice(5)} → ${endDateStr.slice(5)}`;
    } else {
      const [y, m] = parseDateParts(safeAnchor);
      const lastDom = new Date(y, m, 0).getDate();
      startDateStr = `${y}-${String(m).padStart(2, '0')}-01`;
      endDateStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDom).padStart(2, '0')}`;
      periodLabel = `Tháng ${String(m).padStart(2, '0')}/${y}`;
    }

    const dates = getDatesInRange(startDateStr, endDateStr);
    const weekdayShort = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    for (const dt of dates) {
      const dRes = computeDayTimeAudit(db, dt, todayStr, nowMs, liveSession);
      for (const t of ALL_ACTIVITY_TYPES) {
        totalsByType[t] += dRes.minsByType[t];
      }
      productiveMins += dRes.productiveMins;
      choreMins += dRes.choreMins;
      leisureMins += dRes.leisureMins;
      workShiftLoggedMins += dRes.workShiftLoggedMins;
      discretionaryBudgetMins += dRes.discretionaryBudgetMins;
      wastedMins += dRes.wastedMins;
      zeroPomoTotal += dRes.zeroPomoCompletedTodosCount;
      powVerifiedTotal += dRes.powVerifiedTodosCount;
      if (dRes.isRestDay) restDaysCount++;
      if (!dRes.isInactive && !dRes.isRestDay) {
        scoreSum += dRes.realEffortScore;
        activeDaysCount++;
      }

      const [dy, dm, dd] = parseDateParts(dt);
      const dow = new Date(dy, dm - 1, dd, 12).getDay();
      buckets.push({
        key: dt,
        label: mode === 'WEEK' ? `${weekdayShort[dow]} ${String(dd).padStart(2, '0')}` : String(dd),
        minsByType: { ...dRes.minsByType },
        productiveMins: dRes.productiveMins,
        choreMins: dRes.choreMins,
        leisureMins: dRes.leisureMins,
        workShiftLoggedMins: dRes.workShiftLoggedMins,
        discretionaryBudgetMins: dRes.discretionaryBudgetMins,
        wastedMins: dRes.wastedMins,
        utilizationPct: dRes.utilizationPct,
        realEffortScore: dRes.realEffortScore,
        isInactive: dRes.isInactive,
        isRestDay: dRes.isRestDay,
      });
    }
  } else {
    // YEAR mode: 12 monthly buckets
    const yearNum = parseDateParts(safeAnchor)[0];
    startDateStr = `${yearNum}-01-01`;
    endDateStr = `${yearNum}-12-31`;
    periodLabel = `Năm ${yearNum}`;

    for (let month = 1; month <= 12; month++) {
      const monthStr = `${yearNum}-${String(month).padStart(2, '0')}`;
      const lastDom = new Date(yearNum, month, 0).getDate();
      const mStart = `${monthStr}-01`;
      const mEnd = `${monthStr}-${String(lastDom).padStart(2, '0')}`;
      const mMins = createEmptyMinsByType();
      let mProd = 0;
      let mChore = 0;
      let mLeisure = 0;
      let mWork = 0;
      let mBudget = 0;
      let mWasted = 0;
      let mScoreSum = 0;
      let mActiveDays = 0;

      for (const dt of getDatesInRange(mStart, mEnd)) {
        if (dt > todayStr) break;
        const dRes = computeDayTimeAudit(db, dt, todayStr, nowMs, liveSession);
        for (const t of ALL_ACTIVITY_TYPES) {
          mMins[t] += dRes.minsByType[t];
          totalsByType[t] += dRes.minsByType[t];
        }
        mProd += dRes.productiveMins;
        mChore += dRes.choreMins;
        mLeisure += dRes.leisureMins;
        mWork += dRes.workShiftLoggedMins;
        mBudget += dRes.discretionaryBudgetMins;
        mWasted += dRes.wastedMins;
        zeroPomoTotal += dRes.zeroPomoCompletedTodosCount;
        powVerifiedTotal += dRes.powVerifiedTodosCount;
        if (dRes.isRestDay) restDaysCount++;
        if (!dRes.isInactive && !dRes.isRestDay) {
          mScoreSum += dRes.realEffortScore;
          mActiveDays++;
          scoreSum += dRes.realEffortScore;
          activeDaysCount++;
        }
      }

      productiveMins += mProd;
      choreMins += mChore;
      leisureMins += mLeisure;
      workShiftLoggedMins += mWork;
      discretionaryBudgetMins += mBudget;
      wastedMins += mWasted;

      const util = mBudget > 0 ? Math.min(100, Math.round(((mProd + mChore) / mBudget) * 100)) : 0;
      buckets.push({
        key: monthStr,
        label: `T${month}`,
        minsByType: mMins,
        productiveMins: mProd,
        choreMins: mChore,
        leisureMins: mLeisure,
        workShiftLoggedMins: mWork,
        discretionaryBudgetMins: mBudget,
        wastedMins: mWasted,
        utilizationPct: util,
        realEffortScore: mActiveDays > 0 ? Math.round(mScoreSum / mActiveDays) : 0,
        isInactive: mActiveDays === 0,
      });
    }
  }

  const trackedDiscretionaryMins = productiveMins + choreMins + leisureMins;
  const utilizationPct =
    discretionaryBudgetMins > 0
      ? Math.min(100, Math.round(((productiveMins + choreMins) / discretionaryBudgetMins) * 100))
      : 0;
  const highValuePct =
    discretionaryBudgetMins > 0
      ? Math.min(100, Math.round((productiveMins / discretionaryBudgetMins) * 100))
      : 0;
  const avgRealEffortScore =
    activeDaysCount > 0 ? Math.round(scoreSum / activeDaysCount) : dayDetail?.realEffortScore ?? 0;

  const activeBuckets =
    mode === 'WEEK' || mode === 'MONTH'
      ? buckets.filter((b) => !b.isInactive && !b.isRestDay)
      : [];
  const bestDay =
    activeBuckets.length > 0
      ? [...activeBuckets].sort((a, b) => b.productiveMins - a.productiveMins)[0]
      : null;
  const worstDay =
    activeBuckets.length > 0
      ? [...activeBuckets].sort((a, b) => b.wastedMins - a.wastedMins)[0]
      : null;

  return {
    mode,
    periodLabel,
    startDateStr,
    endDateStr,
    totals: {
      minsByType: totalsByType,
      productiveMins,
      choreMins,
      leisureMins,
      workShiftLoggedMins,
      trackedDiscretionaryMins,
      discretionaryBudgetMins,
      wastedMins,
      utilizationPct,
      highValuePct,
      avgRealEffortScore,
      activeDaysCount,
      restDaysCount,
      zeroPomoCompletedTodosCount: zeroPomoTotal,
      powVerifiedTodosCount: powVerifiedTotal,
    },
    buckets,
    bestDay,
    worstDay,
    dayDetail,
  };
}

export function computeWeeklyReviewStats(
  db: MonkDatabaseSchema,
  todayStr: string,
  nowMs: number = Date.now(),
  liveSession?: LiveActiveSessionInput | null
): WeeklyReviewStats {
  const weekSummary = computeTimeAuditRange(db, 'WEEK', todayStr, todayStr, nowMs, liveSession);
  const dates = getDatesInRange(weekSummary.startDateStr, weekSummary.endDateStr);
  const lawCfg = getLawConfig(db);
  const shiftMode = lawCfg.workShiftMode || 'DAY';
  const nightStartStr = getEffectiveNightStartTime(lawCfg);

  // Planned mins per mountain from active climbingSchedulePlan
  const plannedByGoal = new Map<string, number>();
  for (const dt of dates) {
    const [y, m, d] = parseDateParts(dt);
    const dow = new Date(y, m - 1, d, 12).getDay();
    const dayObj = db.climbingSchedulePlan?.days?.find((x) => x.dayOfWeek === dow);
    for (const sl of dayObj?.slots || []) {
      if (sl.kind === 'CLIMB' && sl.goalId) {
        plannedByGoal.set(sl.goalId, (plannedByGoal.get(sl.goalId) || 0) + (sl.pomodoroMins || 0));
      }
    }
  }

  // Actual mins per mountain during this 7-day range
  const actualByGoal = new Map<string, number>();
  for (const dt of dates) {
    if (dt > todayStr) continue;
    const dRes = computeDayTimeAudit(db, dt, todayStr, nowMs, liveSession);
    for (const sess of dRes.sessions) {
      if (sess.goalId && sess.goalId !== SIDE_QUEST_GOAL_ID) {
        actualByGoal.set(sess.goalId, (actualByGoal.get(sess.goalId) || 0) + sess.durationMins);
      }
    }
  }

  const mountainStats: WeeklyMountainPlanVsActual[] = (db.peakGoals || [])
    .filter((g) => !g.isCompleted || (actualByGoal.get(g.id) || 0) > 0 || (plannedByGoal.get(g.id) || 0) > 0)
    .map((g) => {
      const plannedMins = plannedByGoal.get(g.id) || 0;
      const actualMins = actualByGoal.get(g.id) || 0;
      const adherencePct =
        plannedMins > 0 ? Math.min(150, Math.round((actualMins / plannedMins) * 100)) : actualMins > 0 ? 100 : 0;
      return {
        goalId: g.id,
        goalTitle: g.title,
        plannedMins,
        actualMins,
        adherencePct,
      };
    });

  const totalPlannedMins = mountainStats.reduce((s, x) => s + x.plannedMins, 0);
  const totalActualClimbMins = mountainStats.reduce((s, x) => s + x.actualMins, 0);
  const overallAdherencePct =
    totalPlannedMins > 0 ? Math.min(150, Math.round((totalActualClimbMins / totalPlannedMins) * 100)) : 0;

  // Ritual weekly pass %
  const evalDates = dates.filter((dt) => dt <= todayStr);
  let ritualPctSum = 0;
  let ritualDaysCount = 0;
  for (const dt of evalDates) {
    const rEval = getRitualDayEvaluation(db, dt, lawCfg);
    if (rEval.totalCount > 0) {
      ritualPctSum += rEval.completedPct;
      ritualDaysCount++;
    }
  }
  const avgRitualPct = ritualDaysCount > 0 ? Math.round(ritualPctSum / ritualDaysCount) : 100;

  const sideQuestsCompletedCount = (db.dailyStrikes || []).filter((s) => {
    if (s.goalId !== SIDE_QUEST_GOAL_ID || s.status !== 'COMPLETED') return false;
    const effDate = s.completedAt
      ? getShiftDateStr(s.completedAt, shiftMode, nightStartStr)
      : s.date;
    return effDate >= weekSummary.startDateStr && effDate <= weekSummary.endDateStr;
  }).length;

  const optNotesAppliedRecentCount = (db.optimizationNotes || []).reduce(
    (sum, n) =>
      n.lastAppliedDate &&
      n.lastAppliedDate >= weekSummary.startDateStr &&
      n.lastAppliedDate <= weekSummary.endDateStr
        ? sum + 1
        : sum,
    0
  );

  const lines: string[] = [];
  if (totalPlannedMins > 0) {
    lines.push(
      `📊 Tỷ lệ khớp Lịch AI tuần này: ${totalActualClimbMins}/${totalPlannedMins} phút (${overallAdherencePct}%).`
    );
  }
  const neglected = mountainStats.filter((m) => m.plannedMins > 0 && m.actualMins < m.plannedMins * 0.4);
  if (neglected.length > 0) {
    lines.push(
      `⚠️ Đỉnh núi đang bị hụt nhịp so với lịch: ${neglected.map((n) => `"${n.goalTitle}"`).join(', ')}.`
    );
  }
  if (weekSummary.totals.zeroPomoCompletedTodosCount > 0) {
    lines.push(
      `🚨 Cảnh báo Nỗ Lực Ảo: ${weekSummary.totals.zeroPomoCompletedTodosCount} Todo được tick hoàn thành trong tuần nhưng chưa chạy Pomodoro thực tế.`
    );
  }
  if (weekSummary.totals.wastedMins > 180) {
    lines.push(
      `⏳ Tổng thời gian rảnh bị trôi qua không mở Todo trong tuần là ${weekSummary.totals.wastedMins} phút (~${(
        weekSummary.totals.wastedMins / 60
      ).toFixed(1)} giờ) — hãy gom vào 1–2 khung cố định hoặc kích hoạt Auto-Schedule.`
    );
  }
  if (lines.length === 0) {
    lines.push('🔥 Kỷ luật rất đều đặn! Hãy duy trì nhịp Pomodoro & Nghi thức hiện tại.');
  }

  return {
    startDateStr: weekSummary.startDateStr,
    endDateStr: weekSummary.endDateStr,
    mountainStats,
    totalPlannedMins,
    totalActualClimbMins,
    overallAdherencePct,
    avgRitualPct,
    sideQuestsCompletedCount,
    optNotesAppliedRecentCount,
    totalProductiveMins: weekSummary.totals.productiveMins,
    totalChoreMins: weekSummary.totals.choreMins,
    totalWastedMins: weekSummary.totals.wastedMins,
    zeroPomoCompletedTodosCount: weekSummary.totals.zeroPomoCompletedTodosCount,
    realEffortScoreAvg: weekSummary.totals.avgRealEffortScore,
    deterministicCoachLines: lines,
  };
}

export async function generateWeeklyAICoachReport(
  db: MonkDatabaseSchema,
  weeklyStats: WeeklyReviewStats
): Promise<{ usedExternalAI: boolean; providerLabel: string; reportText: string }> {
  const systemText = [
    'Bạn là Huấn Luyện Viên Kỷ Luật Cá Nhân hệ thống LÊN NÚI.',
    'Phân tích thẳng thắn, súc tích bằng tiếng Việt dữ liệu tuần qua của người dùng.',
    'Chỉ ra rõ: (1) Đang nỗ lực thật hay có dấu hiệu nỗ lực ảo/lệch núi; (2) Nguyên nhân lãng phí quỹ thời gian rảnh; (3) 2 hành động cụ thể tuần tới (dưới 180 chữ, gạch đầu dòng rõ ràng).',
  ].join('\n');

  const recentJournals = (db.reflectionJournals || [])
    .slice(0, 5)
    .map((j) => `[${j.date}] focus=${j.focusRating}/5: ${j.repentanceNote || j.content.slice(0, 120)}`);

  const res = await callConfiguredExternalAIText(
    db.climbingSchedulePlan,
    systemText,
    JSON.stringify({ weeklyStats, recentJournals })
  );

  if (res.ok && res.text) {
    return {
      usedExternalAI: true,
      providerLabel: `${res.provider} (${res.resolvedModel})`,
      reportText: res.text.trim(),
    };
  }

  return {
    usedExternalAI: false,
    providerLabel: 'Hệ Thống Đánh Giá Nội Bộ',
    reportText: weeklyStats.deterministicCoachLines.join('\n\n'),
  };
}
