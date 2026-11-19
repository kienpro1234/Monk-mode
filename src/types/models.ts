export interface OfflineGapReport {
  detectedAt: number;
  lastActiveAt: number;
  evaluatedDates: string[];
  missedDates: string[];
  cleanDates: string[];
  missedDeadlineWhileOffline: boolean;
  clockRollbackDetected?: boolean;
  summary: string;
}

export interface AscentSessionEntity {
  id: string;
  title: string;
  startTime: number; // ms epoch
  initialDays: number;
  currentTargetEndTime: number; // ms epoch
  isMonkModeOn: boolean;
  currentStreak: number;
  violationCount: number;
  mottoText: string;
  whitelistedApps: WhitelistedAppItem[];
  processGuardEnabled: boolean;
  autoWallpaperEnabled: boolean;
  lastEvaluatedDate: string; // YYYY-MM-DD — ngày cuối cùng đã được Hệ thống Luật Núi xét duyệt
  lastActiveAt?: number; // Timestamp lần cuối app/daemon ghi nhận hoạt động
  maxObservedAt?: number; // Mốc thời gian lớn nhất từng quan sát (chống tua lùi giờ hệ thống)
  autoStartWithWindows?: boolean;
  autoOpenOnViolation?: boolean;
  pendingOfflineReport?: OfflineGapReport | null;
  lawsAcceptedAt?: number; // Thời điểm người dùng đọc & ký cam kết tuân thủ Luật Núi (luật chỉ có hiệu lực sau khi ký)
  lawConfig?: MountainLawConfig;
  restDays?: RestDayRecord[]; // Danh sách Ngày Nghỉ Có Phép đã đăng ký trước giờ chốt
  heatmapResetDate?: string; // YYYY-MM-DD — Mốc bắt đầu hiển thị lại Bản Đồ Nhiệt Kỷ Luật sau khi Reset Heatmap
  heatmapResetAt?: number; // Timestamp lần cuối Reset dữ liệu Heatmap
  reduceMotion?: boolean; // Tắt hiệu ứng sương mù chuyển động trên nền để tiết kiệm CPU/pin
  timeAuditConfig?: TimeAuditConfig; // Cấu hình ngân sách ngủ / đi làm / sinh hoạt nền 24h
}

/** Phân loại hoạt động của To-Do & Nhật ký thời gian để kiểm toán quỹ thời gian */
export type TodoActivityType =
  | 'STUDY'
  | 'DEEP_WORK'
  | 'HEALTH_REST'
  | 'CHORE'
  | 'WORK_SHIFT'
  | 'LEISURE';

/** Cấu hình ngân sách thời gian cố định hằng ngày (dùng tính thời gian rảnh thực tế & lãng phí) */
export interface TimeAuditConfig {
  sleepHoursPerDay?: number; // Mặc định 7.5 giờ/ngày
  workShiftHoursPerDay?: number; // Mặc định 8 giờ/ngày
  essentialRoutineHoursPerDay?: number; // Tắm rửa, ăn uống, di chuyển (Mặc định 1.5 giờ/ngày)
  dailyTargetProductiveMins?: number; // Mục tiêu thời gian tập trung cao mỗi ngày (Mặc định 180 phút)
}

/** Bản ghi từng phiên làm việc/tập trung thực tế theo thời gian (Pomodoro hoặc ghi nhận thủ công) */
export interface FocusSessionLogEntity {
  id: string;
  date: string; // YYYY-MM-DD theo ngày ca làm việc
  startedAt: number; // ms epoch
  endedAt: number; // ms epoch
  durationMins: number;
  activityType: TodoActivityType;
  goalId?: string;
  strikeId?: string;
  title: string;
  source: 'POMODORO_FULL' | 'POMODORO_EARLY_FINISH' | 'MANUAL_LOG';
}

/** Hồ sơ Mẫu Lịch Tuần lưu theo ca (để chuyển nhanh 1 click giữa Ca Ngày / Ca Đêm / Giờ khác nhau) */
export interface SavedScheduleProfile {
  id: string;
  name: string;
  savedAt: number;
  shiftMode: WorkShiftMode;
  dayShiftStartTime: string;
  nightShiftStartTime: string;
  plan: AIClimbingSchedulePlan;
}

export interface RestDayRecord {
  date: string; // YYYY-MM-DD
  reason: string;
  registeredAt: number;
}

/** Chế độ ca làm việc: Ca Ngày (07:00 - 24:00) hoặc Ca Đêm (19:00 - 19:00 hôm sau) */
export type WorkShiftMode = 'DAY' | 'NIGHT';

/** Bật / tắt từng điều luật trong Bộ Luật Núi & cấu hình ca làm việc */
export interface MountainLawConfig {
  strikeLawEnabled: boolean; // Luật 1: Todo Công Phá phải hoàn thành trong ngày
  ritualLawEnabled: boolean; // Luật 2: Nghi Thức phải hoàn thành đạt ngưỡng tối thiểu mỗi ngày
  emptyDayLawEnabled: boolean; // Luật 3: Không được để ngày trống (không có Todo nào)
  journalLawEnabled: boolean; // Luật 4: Ngày có Công Phá phải viết Tự Vấn
  ritualPassThresholdPct?: number; // Ngưỡng % tối thiểu Luật 2 (mặc định 70 — trên 69% theo khoa học)
  workShiftMode?: WorkShiftMode; // 'DAY' | 'NIGHT' (Mặc định 'DAY')
  dayShiftStartTime?: string; // Giờ bắt đầu đi làm Ca Ngày (mặc định "08:00", linh hoạt "07:00" / "08:00"...)
  nightShiftStartTime?: string; // Giờ bắt đầu đi làm Ca Đêm (mặc định "19:00", linh hoạt "19:00" / "20:00"...)
  nightShiftStartHour?: number; // Giờ bắt đầu ca đêm (legacy/fallback, mặc định 19)
  maxDailyTaskModifications?: number; // Hạn ngạch sửa/xóa Todo mỗi ngày (mặc định 3)
  maxMonthlyRestDays?: number; // Số Thẻ Ngày Nghỉ Có Phép tối đa mỗi tháng (mặc định 2)
}

/** Nhật ký ghi nhận mỗi lần người dùng sửa tên hoặc xóa Todo (để kiểm soát kỷ luật) */
export interface TaskModificationLog {
  id: string;
  date: string; // YYYY-MM-DD
  timestamp: number;
  type: 'EDIT' | 'DELETE';
  goalId: string;
  goalTitle?: string;
  strikeId: string;
  oldTitle: string;
  newTitle?: string;
}

export interface WhitelistedAppItem {
  id: string;
  name: string;
  processName: string;
  category: 'SURVIVAL_COMM' | 'ESSENTIAL_FINANCE' | 'DECLARED_WORK_TOOL';
}

export interface MountainMilestoneItem {
  id: string;
  title: string;
  isCompleted: boolean;
  completedAt?: number;
}

/** Alias cho Checklist mục tiêu (giữ tương thích dữ liệu milestones cũ) */
export type GoalChecklistItem = MountainMilestoneItem;

export interface PeakGoalEntity {
  id: string;
  sessionId: string;
  title: string;
  description: string;
  futureSelfVow?: string; // Lời thề với bản thân tương lai ("Không để nói lời Giá như...")
  category?: string; // VD: "Ngoại Ngữ", "Sự Nghiệp", "Học Thuật", "Thể Chất"
  unit: string;
  targetMetric: number;
  currentMetric: number;
  progressPct: number; // 0..100
  targetDays?: number;
  targetEndTime?: number;
  milestones?: MountainMilestoneItem[];
  isCompleted: boolean;
  completedAt?: number;
  createdAt: number;
}

export interface ProofAnalysisResult {
  brightness: number; // 0..255
  sharpness: number; // Laplacian edge variance
  entropy: number; // 0..8
  isValid: boolean;
  reason?: string;
  source: 'UPLOAD' | 'CLIPBOARD' | 'WEBCAM' | 'SCREEN';
  capturedAt: number;
}

export interface RitualCheckItem {
  id: string;
  title: string;
  completedDates: Record<string, number>; // "YYYY-MM-DD" -> completedAt ms
  createdAt?: number; // Dùng để Luật Núi không xử phạt thói quen vừa mới thêm vào
  daysOfWeek?: number[]; // 0=CN, 1=T2 ... 6=T7 (rỗng hoặc không có = mỗi ngày)
}

export interface RitualGroupEntity {
  id: string;
  title: string; // VD: "Thói quen sau khi ngủ dậy", "Thói quen khi mới đi làm về", "Thói quen khi quyết định ngồi vào bàn học"
  subtitle?: string;
  iconType?: 'MORNING' | 'RETURN_HOME' | 'STUDY_DESK' | 'EVENING' | 'CUSTOM';
  items: RitualCheckItem[];
  createdAt: number;
}

export interface RitualDayCompletion {
  date: string; // YYYY-MM-DD
  completedAt: number;
  completedPomodoroMins: number;
  proofPhotoUri: string | null;
  proofAnalysis?: ProofAnalysisResult | null;
}

export interface RitualHabitEntity {
  id: string;
  goalId: string;
  title: string;
  timeWindowStart: string;
  timeWindowEnd: string;
  requiredPomodoroMins: number;
  requiresPhoto: boolean;
  completionsByDate: Record<string, RitualDayCompletion>;
  violatedDates: Record<string, boolean>;
}

export type StrikeStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'VIOLATED';

/**
 * goalId đặc biệt cho "Việc Vặt" (Side Quests) — các việc nhỏ không thuộc ngọn núi nào
 * (tắm rửa, giặt đồ, dọn nhà...). Dùng chung màn hình Tập Trung + Pomodoro nhưng
 * KHÔNG tính vào tiến độ / lịch sử của bất kỳ Đỉnh Núi nào và KHÔNG bị Luật Núi xử phạt.
 */
export const SIDE_QUEST_GOAL_ID = '__SIDE_QUESTS__';

export interface StrikeProofPhotoItem {
  id: string;
  uri: string;
  caption: string;
  capturedAt: number;
  pomodoroMins?: number;
}

export interface DailyStrikeTodoEntity {
  id: string;
  goalId: string; // Linked PeakGoalEntity.id
  date: string; // "YYYY-MM-DD"
  title: string;
  notes?: string; // Ghi chú chi tiết / các bước nhỏ khi tập trung làm Todo này
  activityType?: TodoActivityType; // Loại việc (Học tập / Công phá sâu / Việc vặt / Đi làm / Giải trí...)
  scheduledTime?: string;
  weightPct?: number;
  status: StrikeStatus;
  requiredPomodoroMins: number;
  completedPomodoroMins: number;
  pomodoroSessionsCount?: number;
  savedPomoSecondsLeft?: number | null;
  savedPomoTotalSeconds?: number | null;
  savedPomoSelectedMins?: number | null;
  requiresPhoto?: boolean; // Bật / Tắt Live PoW cho Todo này
  proofPhotoUri: string | null;
  proofPhotoCaption?: string;
  proofPhotosList?: StrikeProofPhotoItem[];
  proofAnalysis: ProofAnalysisResult | null;
  createdAt?: number;
  completedAt?: number;
}

export interface ReflectionJournalEntity {
  id: string;
  sessionId: string;
  goalId?: string; // Gắn với Ngọn Núi cụ thể
  date: string; // "YYYY-MM-DD"
  content: string;
  validWordCount: number;
  lexicalDiversityScore: number;
  submittedAt: number;
  focusRating: number; // 1..5
  repentanceNote: string;
}

export interface ViolationRecord {
  id: string;
  sessionId: string;
  goalId?: string;
  goalTitle?: string;
  timestamp: number;
  date: string;
  type:
    | 'MISSED_RITUAL'
    | 'UNFINISHED_STRIKE'
    | 'MISSED_JOURNAL'
    | 'EMPTY_DAY'
    | 'POW_POMODORO_ABANDONED'
    | 'MANUAL_SIMULATION';
  reason: string;
  previousStreak: number;
  newTargetEndTime: number;
  autoDetected?: boolean; // true = do Hệ thống Luật Núi tự động phát hiện
  details?: string[]; // Danh sách chi tiết các việc bị bỏ dở
}

export interface SacredScrollSnapshot {
  session: AscentSessionEntity;
  goals: PeakGoalEntity[];
  rituals: RitualHabitEntity[];
  ritualGroups?: RitualGroupEntity[];
  strikes: DailyStrikeTodoEntity[];
  journals: ReflectionJournalEntity[];
  violations: ViolationRecord[];
}

export interface SacredScrollEntity {
  id: string;
  sessionId: string;
  goalId?: string;
  title: string;
  mottoText: string;
  futureSelfVow?: string;
  sealedAt: number;
  totalDaysSpent: number;
  initialDaysCommitted: number;
  totalPomodoroHours: number;
  totalCompletedTodos?: number;
  totalProofPhotos?: number;
  totalJournals?: number;
  violationCount: number;
  sealHash: string;
  snapshotJson: string; // JSON string of SacredScrollSnapshot
  exportedPdfUri: string | null;
}

export type OptimizationCategory =
  | 'COMBO_TIME_SAVER'
  | 'LEARNING_HACK'
  | 'LIFE_TRICK'
  | 'IDEA_INSIGHT';

export interface OptimizationNoteEntity {
  id: string;
  title: string;
  content: string;
  category: OptimizationCategory;
  goalId?: string;
  timeSavedHint?: string;
  isPinned?: boolean;
  appliedCount?: number;
  lastAppliedDate?: string;
  createdAt: number;
  updatedAt: number;
}

export type ScheduleSlotKind = 'CLIMB' | 'PREP_WORK' | 'SLEEP' | 'REST_ROUTINE' | 'BREAK_COMBO';

export interface DailyWorkShiftRecord {
  date: string; // Shift date YYYY-MM-DD
  shiftMode: WorkShiftMode;
  workStartTime: string; // HH:MM (mặc định theo giờ vào ca hiện tại, sửa tay được)
  workEndTime?: string; // HH:MM (tự điền khi bấm "Đã đi làm về" hoặc tự nhập)
  workStartMs?: number;
  workEndMs?: number;
  workDurationMins: number; // Tổng thời gian đi làm thực tế (phút)
  prepLockMins?: number; // Khóa cứng chuẩn bị trước ca (mặc định 60p, 0 nếu nghỉ làm)
  sleepOverrideMins?: number; // (Tùy chọn) Ghi đè số phút ngủ riêng cho ngày này
  isDayOffNoWork?: boolean; // true = hôm nay nghỉ làm (0p đi làm, 0p khóa chuẩn bị)
  confirmedAt: number;
}

export type ScheduleStrategyMode =
  | 'SMART_WEEKLY_ROTATION'
  | 'DAILY_ALL_PEAKS'
  | 'NEGLECTED_PRIORITY';

export interface ClimbingTimeSlotItem {
  id: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  kind: ScheduleSlotKind;
  goalId?: string;
  title: string;
  suggestedTask?: string;
  pomodoroMins: number;
  notes?: string;
}

export interface DayClimbingPlan {
  dayOfWeek: number; // 0=CN, 1=T2 ... 6=T7
  dayLabel: string;
  shiftMode: WorkShiftMode;
  slots: ClimbingTimeSlotItem[];
}

export type AIProviderType = 'GEMINI' | 'GROQ' | 'OPENROUTER';

export type AIEngineMode = 'INTERNAL_SMART' | 'EXTERNAL_LLM';

export interface AIClimbingSchedulePlan {
  id: string;
  createdAt: number;
  updatedAt: number;
  shiftMode: WorkShiftMode;
  strategyMode: ScheduleStrategyMode;
  dayWorkStartTime?: string; // e.g. "07:00" or "08:00" — Giờ vào làm Ca Ngày (để tự khóa 1 tiếng trước giờ làm)
  dayShiftClimbStart: string; // e.g. "20:00"
  dayShiftClimbEnd: string; // e.g. "24:00"
  nightReturnHomeTime: string; // e.g. "07:30"
  nightWakeUpTime: string; // e.g. "14:30"
  nightWorkStartTime: string; // e.g. "20:00"
  maxMountainsPerDay: number;
  aiReasoningSummary: string;
  aiCoachingTips?: string[];
  aiEngineMode?: AIEngineMode;
  aiProvider?: AIProviderType;
  aiModel?: string;
  aiResolvedModel?: string;
  customUserPrompt?: string;
  geminiApiKey?: string;
  externalApiKeys?: Partial<Record<AIProviderType, string>>;
  days: DayClimbingPlan[];
}

export interface MonkDatabaseSchema {
  session: AscentSessionEntity;
  peakGoals: PeakGoalEntity[];
  ritualGroups?: RitualGroupEntity[];
  ritualHabits: RitualHabitEntity[];
  dailyStrikes: DailyStrikeTodoEntity[];
  reflectionJournals: ReflectionJournalEntity[];
  sacredScrolls: SacredScrollEntity[];
  violations: ViolationRecord[];
  taskModificationLogs?: TaskModificationLog[];
  optimizationNotes?: OptimizationNoteEntity[];
  climbingSchedulePlan?: AIClimbingSchedulePlan | null;
  focusSessionLogs?: FocusSessionLogEntity[];
  savedScheduleProfiles?: SavedScheduleProfile[];
  dailyWorkShiftLogs?: Record<string, DailyWorkShiftRecord>;
}

export type ConfirmDeleteTarget =
  | { kind: 'GOAL'; id: string; title: string; strikeCount: number }
  | { kind: 'RITUAL_GROUP'; id: string; title: string; itemCount: number };
