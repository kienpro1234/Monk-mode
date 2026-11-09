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
  // Desktop-specific lockdown configuration (Strict Whitelist)
  whitelistedApps: WhitelistedAppItem[];
  processGuardEnabled: boolean;
  autoWallpaperEnabled: boolean;
  lastEvaluatedDate: string; // YYYY-MM-DD
}

export interface WhitelistedAppItem {
  id: string;
  name: string;
  processName: string;
  category: 'SURVIVAL_COMM' | 'ESSENTIAL_FINANCE' | 'DECLARED_WORK_TOOL';
}

export interface PeakGoalEntity {
  id: string;
  sessionId: string;
  title: string;
  description: string;
  unit: string;
  targetMetric: number;
  currentMetric: number;
  progressPct: number; // 0..100
  isCompleted: boolean;
  createdAt: number;
}

export interface ProofAnalysisResult {
  brightness: number; // 0..255
  sharpness: number; // Laplacian edge variance
  entropy: number; // 0..8
  isValid: boolean;
  reason?: string;
  source: 'WEBCAM' | 'SCREEN';
  capturedAt: number;
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
  goalId: string; // Linked PeakGoalEntity.id
  title: string;
  timeWindowStart: string; // "HH:mm" e.g. "05:00"
  timeWindowEnd: string; // "HH:mm" e.g. "06:30"
  requiredPomodoroMins: number;
  requiresPhoto: boolean;
  completionsByDate: Record<string, RitualDayCompletion>;
  violatedDates: Record<string, boolean>;
}

export type StrikeStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'VIOLATED';

export interface DailyStrikeTodoEntity {
  id: string;
  goalId: string; // Linked PeakGoalEntity.id
  date: string; // "YYYY-MM-DD"
  title: string;
  scheduledTime: string; // "HH:mm" for Relentless Nagging Engine
  weightPct: number; // Contribution % to PeakGoal
  status: StrikeStatus;
  requiredPomodoroMins: number;
  completedPomodoroMins: number;
  proofPhotoUri: string | null;
  proofAnalysis: ProofAnalysisResult | null;
  completedAt?: number;
}

export interface ReflectionJournalEntity {
  id: string;
  sessionId: string;
  date: string; // "YYYY-MM-DD"
  content: string;
  validWordCount: number;
  lexicalDiversityScore: number; // 0..1 (must be >= 0.45 in Monk Mode)
  submittedAt: number;
  focusRating: number; // 1..5
  repentanceNote: string;
}

export interface ViolationRecord {
  id: string;
  sessionId: string;
  timestamp: number;
  date: string;
  type: 'MISSED_RITUAL' | 'UNFINISHED_STRIKE' | 'MISSED_JOURNAL' | 'POW_POMODORO_ABANDONED' | 'MANUAL_SIMULATION';
  reason: string;
  previousStreak: number;
  newTargetEndTime: number;
}

export interface SacredScrollSnapshot {
  session: AscentSessionEntity;
  goals: PeakGoalEntity[];
  rituals: RitualHabitEntity[];
  strikes: DailyStrikeTodoEntity[];
  journals: ReflectionJournalEntity[];
  violations: ViolationRecord[];
}

export interface SacredScrollEntity {
  id: string;
  sessionId: string;
  title: string;
  mottoText: string;
  sealedAt: number;
  totalDaysSpent: number;
  initialDaysCommitted: number;
  totalPomodoroHours: number;
  violationCount: number;
  sealHash: string;
  snapshotJson: string; // JSON string of SacredScrollSnapshot
  exportedPdfUri: string | null;
}

export interface MonkDatabaseSchema {
  session: AscentSessionEntity;
  peakGoals: PeakGoalEntity[];
  ritualHabits: RitualHabitEntity[];
  dailyStrikes: DailyStrikeTodoEntity[];
  reflectionJournals: ReflectionJournalEntity[];
  sacredScrolls: SacredScrollEntity[];
  violations: ViolationRecord[];
}
