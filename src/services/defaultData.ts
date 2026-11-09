import { MonkDatabaseSchema } from '../types/models';

export function getTodayDateStr(nowMs: number = Date.now()): string {
  const d = new Date(nowMs);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createInitialDatabase(): MonkDatabaseSchema {
  const now = Date.now();
  const today = getTodayDateStr(now);
  const yesterday = getTodayDateStr(now - 86400000);
  const initialDays = 14;

  const samplePastScrollSnapshot = {
    session: {
      id: 'session-archive-01',
      title: 'Kỳ Tu Luyện I: Trúc Cơ Tịnh Tâm — 21 Ngày Độc Hành',
      startTime: now - 25 * 86400000,
      initialDays: 21,
      currentTargetEndTime: now - 3 * 86400000,
      isMonkModeOn: false,
      currentStreak: 21,
      violationCount: 1,
      mottoText: 'Tâm bất biến giữa dòng đời vạn biến. Chưa thành đại sự, quyết không rời đỉnh núi.',
      whitelistedApps: [],
      processGuardEnabled: true,
      autoWallpaperEnabled: true,
      lastEvaluatedDate: yesterday,
    },
    goals: [
      {
        id: 'goal-arch-1',
        sessionId: 'session-archive-01',
        title: 'Đỉnh Núi Kỳ I: Hoàn tất Kiến trúc Hệ thống & Đọc 600 trang Sách Chuyên sâu',
        description: 'Mục tiêu duy nhất của kỳ nhập thất 21 ngày trên đỉnh núi.',
        unit: 'điểm KPI',
        targetMetric: 100,
        currentMetric: 100,
        progressPct: 100,
        isCompleted: true,
        createdAt: now - 25 * 86400000,
      },
    ],
    rituals: [
      {
        id: 'rit-arch-1',
        goalId: 'goal-arch-1',
        title: 'Dậy lúc 05:00 — Thiền định & Đọc sách 60 phút',
        timeWindowStart: '05:00',
        timeWindowEnd: '06:30',
        requiredPomodoroMins: 45,
        requiresPhoto: true,
        completionsByDate: {},
        violatedDates: {},
      },
    ],
    strikes: [
      {
        id: 'str-arch-1',
        goalId: 'goal-arch-1',
        date: yesterday,
        title: 'Tối ưu hóa thuật toán khóa kép & kiểm duyệt văn bản Tự Vấn',
        scheduledTime: '09:00',
        weightPct: 50,
        status: 'COMPLETED' as const,
        requiredPomodoroMins: 50,
        completedPomodoroMins: 50,
        proofPhotoUri: './assets/shanshui-monk-temple.jpg',
        proofAnalysis: {
          brightness: 142.5,
          sharpness: 38.4,
          entropy: 4.32,
          isValid: true,
          source: 'SCREEN' as const,
          capturedAt: now - 4 * 86400000,
        },
      },
    ],
    journals: [
      {
        id: 'jrn-arch-1',
        sessionId: 'session-archive-01',
        date: getTodayDateStr(now - 5 * 86400000),
        content:
          'Đêm thứ mười tám trên đỉnh núi cô độc. Hôm nay khi bắt đầu ca làm việc buổi chiều, tâm trí từng khởi lên sự xao nhãng muốn tìm kiếm tin tức bên ngoài hồng trần, nhưng tiếng chuông chùa cảnh báo đã kéo bản thân trở lại thực tại. Tôi nhận ra sự trì hoãn không đến từ việc công việc quá khó, mà đến từ nỗi sợ đối diện với sự tĩnh lặng tuyệt đối của chính mình. Sau ba phiên Pomodoro liên tục không rời màn hình, toàn bộ khối mã nguồn phức tạp nhất đã được giải quyết triệt để. Đạo tâm ngày càng vững chắc, gió núi bên ngoài chẳng còn làm lay động được ý chí bên trong.',
        validWordCount: 118,
        lexicalDiversityScore: 0.78,
        submittedAt: now - 5 * 86400000,
        focusRating: 5,
        repentanceNote: 'Đã dứt trừ tạp niệm lúc 14:30, giữ trọn giới luật.',
      },
      {
        id: 'jrn-arch-2',
        sessionId: 'session-archive-01',
        date: getTodayDateStr(now - 3 * 86400000),
        content:
          'Ngày cuối cùng của khóa tu luyện hai mươi mốt ngày. Nhìn lại chặng đường đã qua, có một lần duy nhất phạm giới luật ở ngày thứ tư khiến chuỗi ngày bị xóa trắng về con số không và thời gian xuống núi bị đẩy lùi. Chính cú vấp ngã đau đớn đó đã đập tan sự chủ quan trong tâm khảm. Từ ngày đó trở đi, mỗi bình minh lúc năm giờ sáng đều là một nghi thức bất khả xâm phạm. Hôm nay thanh tiến độ của Đỉnh Núi đã chạm mốc một trăm phần trăm. Cuốn bí kíp này xứng đáng nhận dấu mộc đỏ Chu Sa.',
        validWordCount: 114,
        lexicalDiversityScore: 0.79,
        submittedAt: now - 3 * 86400000,
        focusRating: 5,
        repentanceNote: 'Viên mãn công đức, sẵn sàng xuống núi.',
      },
    ],
    violations: [
      {
        id: 'vio-arch-1',
        sessionId: 'session-archive-01',
        timestamp: now - 21 * 86400000,
        date: getTodayDateStr(now - 21 * 86400000),
        type: 'MISSED_RITUAL' as const,
        reason: 'Bỏ lỡ khung giờ Nghi thức 05:00 - 06:30. Reset chuỗi ngày về 0 và cộng bù 21 ngày.',
        previousStreak: 3,
        newTargetEndTime: now - 3 * 86400000,
      },
    ],
  };

  // Mỗi kỳ tu luyện chỉ tập trung leo 1 Đỉnh Núi duy nhất (1 Goal lớn của cả kỳ)
  return {
    session: {
      id: 'session-current-01',
      title: 'Kỳ Tu Luyện Hiện Tại: Độc Bộ Đỉnh Tuyết',
      startTime: now - 3 * 86400000,
      initialDays,
      currentTargetEndTime: now + (initialDays - 3) * 86400000,
      isMonkModeOn: false,
      currentStreak: 3,
      violationCount: 0,
      mottoText: 'Phong sương chẳng lay chí lớn. Chưa chạm đỉnh cao 100%, quyết không xuống núi.',
      whitelistedApps: [
        {
          id: 'wl-1',
          name: 'Nghe / Gọi & Tin nhắn SMS cơ bản (Liên lạc sinh tồn)',
          processName: 'PhoneExperienceHost',
          category: 'SURVIVAL_COMM',
        },
        {
          id: 'wl-2',
          name: 'Ứng dụng Ngân hàng / Thanh toán thiết yếu',
          processName: 'BankingApp',
          category: 'ESSENTIAL_FINANCE',
        },
        {
          id: 'wl-3',
          name: 'Visual Studio Code (Công cụ Công việc đã khai báo)',
          processName: 'Code',
          category: 'DECLARED_WORK_TOOL',
        },
        {
          id: 'wl-4',
          name: 'Obsidian / Trình đọc Tài liệu Kỹ thuật',
          processName: 'Obsidian',
          category: 'DECLARED_WORK_TOOL',
        },
      ],
      processGuardEnabled: true,
      autoWallpaperEnabled: true,
      lastEvaluatedDate: today,
    },
    peakGoals: [
      {
        id: 'goal-single-peak',
        sessionId: 'session-current-01',
        title: 'Hoàn thành Hệ thống Phần mềm Cốt lõi & Nắm vững 300 trang Thuật toán',
        description:
          'Mục tiêu Đỉnh Núi duy nhất của kỳ tu luyện này. Mọi Nghi Thức (Habit) và Công Phá (Todo) hàng ngày đều dồn toàn lực đẩy Đỉnh Núi này về mốc 100%.',
        unit: 'điểm KPI',
        targetMetric: 100,
        currentMetric: 30,
        progressPct: 30,
        isCompleted: false,
        createdAt: now - 3 * 86400000,
      },
    ],
    ritualHabits: [
      {
        id: 'ritual-1',
        goalId: 'goal-single-peak',
        title: 'Dậy lúc 05:00 — Thiền định & Đọc sách chuyên sâu 60 phút',
        timeWindowStart: '05:00',
        timeWindowEnd: '06:30',
        requiredPomodoroMins: 30,
        requiresPhoto: true,
        completionsByDate: {
          [today]: {
            date: today,
            completedAt: now - 3600 * 1000 * 4,
            completedPomodoroMins: 30,
            proofPhotoUri: './assets/shanshui-mountains.jpg',
          },
        },
        violatedDates: {},
      },
      {
        id: 'ritual-2',
        goalId: 'goal-single-peak',
        title: 'Nhập thất Ca Sáng (08:00 - 11:30) — Deep Work Không Xao Nhãng',
        timeWindowStart: '08:00',
        timeWindowEnd: '11:30',
        requiredPomodoroMins: 45,
        requiresPhoto: true,
        completionsByDate: {},
        violatedDates: {},
      },
      {
        id: 'ritual-3',
        goalId: 'goal-single-peak',
        title: 'Ôn luyện & Tổng kết Kiến thức Buổi tối (19:30 - 21:00)',
        timeWindowStart: '19:30',
        timeWindowEnd: '21:00',
        requiredPomodoroMins: 25,
        requiresPhoto: true,
        completionsByDate: {},
        violatedDates: {},
      },
    ],
    dailyStrikes: [
      {
        id: 'strike-1',
        goalId: 'goal-single-peak',
        date: today,
        title: 'Thiết kế & lập trình hoàn chỉnh cơ chế Khóa Kép (Dual-Lock) và Luật Núi',
        scheduledTime: '09:00',
        weightPct: 30,
        status: 'COMPLETED',
        requiredPomodoroMins: 30,
        completedPomodoroMins: 30,
        proofPhotoUri: './assets/shanshui-monk-temple.jpg',
        proofAnalysis: {
          brightness: 138.2,
          sharpness: 41.6,
          entropy: 4.45,
          isValid: true,
          source: 'SCREEN',
          capturedAt: now - 7200 * 1000,
        },
        completedAt: now - 7200 * 1000,
      },
      {
        id: 'strike-2',
        goalId: 'goal-single-peak',
        date: today,
        title: 'Hoàn thiện bộ kiểm duyệt Bằng chứng Xác thực (Pomodoro Lock & Live Camera PoW)',
        scheduledTime: '14:00',
        weightPct: 35,
        status: 'PENDING',
        requiredPomodoroMins: 25,
        completedPomodoroMins: 0,
        proofPhotoUri: null,
        proofAnalysis: null,
      },
      {
        id: 'strike-3',
        goalId: 'goal-single-peak',
        date: today,
        title: 'Đọc & ghi chú xong Chương 4 sách Kiến trúc Hệ thống Phân tán',
        scheduledTime: '16:30',
        weightPct: 35,
        status: 'PENDING',
        requiredPomodoroMins: 25,
        completedPomodoroMins: 0,
        proofPhotoUri: null,
        proofAnalysis: null,
      },
    ],
    reflectionJournals: [
      {
        id: 'journal-yesterday',
        sessionId: 'session-current-01',
        date: yesterday,
        content:
          'Ngày thứ hai trên đỉnh núi tuyết. Buổi sáng thức dậy đúng năm giờ khi sương mù còn giăng kín ngoài khung cửa, tâm trí vô cùng minh mẫn. Trong phiên làm việc buổi chiều, tôi đã khóa toàn bộ các ứng dụng ngoài danh sách trắng và hoàn thành trọn vẹn các nhiệm vụ công phá khó nhất trong ngày. Khi không còn lối thoát cho sự trì hoãn, năng suất làm việc tăng lên gấp bội. Mỗi dòng code viết ra đều chắc chắn như nét mực tàu khắc lên giấy Tuyên cổ. Ngày mai cần giữ vững nhịp độ này và tuyệt đối không để tâm viên ý mã xâm chiếm.',
        validWordCount: 109,
        lexicalDiversityScore: 0.77,
        submittedAt: now - 86400000,
        focusRating: 5,
        repentanceNote: 'Không phạm giới luật, hoàn thành 100% Công phá trong ngày.',
      },
    ],
    sacredScrolls: [
      {
        id: 'scroll-01',
        sessionId: 'session-archive-01',
        title: 'Bí Kíp Khổ Luyện Kỳ I: Trúc Cơ Tịnh Tâm (21 Ngày Độc Hành)',
        mottoText: 'Tâm bất biến giữa dòng đời vạn biến. Chưa thành đại sự, quyết không rời đỉnh núi.',
        sealedAt: now - 3 * 86400000,
        totalDaysSpent: 22,
        initialDaysCommitted: 21,
        totalPomodoroHours: 84.5,
        violationCount: 1,
        sealHash: 'CHU-SA-9E2A2B-7F4A19C8E201',
        snapshotJson: JSON.stringify(samplePastScrollSnapshot),
        exportedPdfUri: null,
      },
    ],
    violations: [],
  };
}
