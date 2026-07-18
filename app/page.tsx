"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

type Tab = "checkin" | "calendar" | "reports" | "profile";
type Tone = "sand" | "clay" | "stone";
type Habit = {
  id: number;
  name: string;
  target: number;
  unit: string;
  time: string;
  reminderEnabled: boolean;
  tone: Tone;
  avatar?: string;
  archived?: boolean;
  createdAt?: string;
  archivedAt?: string;
  targetHistory?: { from: string; target: number }[];
};
type DailyLogs = Record<string, Record<number, number>>;
type Report = {
  id: string;
  start: string;
  end: string;
  createdAt: string;
  content: string;
  metrics?: unknown;
  followUps: { question: string; answer: string }[];
  generationCount?: number;
};
type State = {
  habits: Habit[];
  logs: DailyLogs;
  reports: Report[];
  profile: { name: string };
};

const DB_NAME = "daily-coach-v2";
const STORE = "state";
const LEGACY_HABITS = "daily-coach:habits:v1";
const LEGACY_LOGS = "daily-coach:logs:v1";
const FALLBACK_STATE = "daily-coach:state:v2";
const MAX_REPORT_GENERATIONS = 2;
const MAX_REPORT_FOLLOW_UPS = 5;
const DEFAULT_STATE: State = {
  habits: [
    {
      id: 101,
      name: "好好喝水",
      target: 8,
      unit: "杯",
      time: "10:00",
      reminderEnabled: false,
      tone: "sand",
      createdAt: dateKey(),
    },
    {
      id: 102,
      name: "晚间拉伸",
      target: 1,
      unit: "次",
      time: "21:30",
      reminderEnabled: false,
      tone: "clay",
      createdAt: dateKey(),
    },
  ],
  logs: {},
  reports: [],
  profile: { name: "29" },
};

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function shiftDate(date: Date, offset: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + offset);
  return next;
}
function displayDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function normalizeState(value?: Partial<State>): State {
  const logs =
    value?.logs && typeof value.logs === "object" ? value.logs : DEFAULT_STATE.logs;
  const habits = Array.isArray(value?.habits)
    ? value.habits.map((habit) => {
      const firstLoggedDay = Object.keys(logs)
          .sort()
          .find((day) => logs[day]?.[habit.id] !== undefined);
        const createdAt = habit.createdAt || firstLoggedDay || dateKey();
        const targetHistory = Array.isArray(habit.targetHistory)
          ? habit.targetHistory
              .filter(
                (entry) =>
                  typeof entry?.from === "string" &&
                  Number.isFinite(entry?.target) &&
                  entry.target > 0,
              )
              .sort((a, b) => a.from.localeCompare(b.from))
          : [];
        return {
          ...habit,
          createdAt,
          targetHistory: targetHistory.length
            ? targetHistory
            : [{ from: createdAt, target: Math.max(1, habit.target || 1) }],
        };
      })
    : DEFAULT_STATE.habits.map((habit) => ({ ...habit, createdAt: dateKey() }));
  const reports = Array.isArray(value?.reports)
    ? value.reports.map((report) => ({
        ...report,
        followUps: Array.isArray(report.followUps) ? report.followUps : [],
        generationCount: report.generationCount || 1,
      }))
    : [];
  return {
    habits,
    logs,
    reports,
    profile: { name: "29" },
  };
}

function habitWasActiveOn(habit: Habit, day: string) {
  if (habit.createdAt && day < habit.createdAt) return false;
  if (habit.archivedAt && day > habit.archivedAt) return false;
  return !habit.archived || Boolean(habit.archivedAt);
}

function targetOn(habit: Habit, day: string) {
  const applicable = habit.targetHistory
    ?.filter((entry) => entry.from <= day)
    .sort((a, b) => a.from.localeCompare(b.from));
  return applicable?.at(-1)?.target || habit.target;
}

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function readState(): Promise<State> {
  try {
    const db = await openStore();
    const value = await new Promise<State | undefined>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get("app");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (value) return normalizeState(value);
  } catch {
    /* fall through to legacy storage */
  }
  try {
    const fallback = JSON.parse(localStorage.getItem(FALLBACK_STATE) || "null");
    if (fallback) return normalizeState(fallback);
    const habits = JSON.parse(localStorage.getItem(LEGACY_HABITS) || "null");
    const logs = JSON.parse(localStorage.getItem(LEGACY_LOGS) || "null");
    if (habits || logs)
      return normalizeState({
        ...DEFAULT_STATE,
        habits: habits || DEFAULT_STATE.habits,
        logs: logs || {},
      });
  } catch {
    /* corrupted legacy data is ignored */
  }
  return normalizeState(DEFAULT_STATE);
}
async function writeState(state: State) {
  try {
    const db = await openStore();
    await new Promise<void>((resolve, reject) => {
      const request = db
        .transaction(STORE, "readwrite")
        .objectStore(STORE)
        .put(state, "app");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    db.close();
  } catch {
    try {
      localStorage.setItem(FALLBACK_STATE, JSON.stringify(state));
    } catch {
      /* The browser has no writable local storage. */
    }
  }
}
function periodFor(date = new Date()) {
  const end = new Date(date);
  const daysSinceFriday = (end.getDay() + 2) % 7;
  end.setDate(end.getDate() - daysSinceFriday);
  return { start: dateKey(shiftDate(end, -6)), end: dateKey(end) };
}
function navLabel(tab: Tab) {
  return {
    checkin: "打卡",
    calendar: "日历",
    reports: "周报",
    profile: "我的",
  }[tab];
}

async function prepareAvatar(file: File) {
  return new Promise<string>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext("2d");
      if (!context) return reject(new Error("image"));
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      context.drawImage(
        image,
        (image.naturalWidth - size) / 2,
        (image.naturalHeight - size) / 2,
        size,
        size,
        0,
        0,
        256,
        256,
      );
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    image.src = url;
  });
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("checkin");
  const [state, setState] = useState<State>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [toast, setToast] = useState("");
  const [month, setMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(dateKey());
  const [reportLoading, setReportLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [native, setNative] = useState(false);
  const [platformReady, setPlatformReady] = useState(false);
  const [swipedId, setSwipedId] = useState<number | null>(null);
  const touchX = useRef(0);
  const touchY = useRef(0);
  const today = dateKey();
  const habits = state.habits.filter((habit) => !habit.archived);

  useEffect(() => {
    readState().then((next) => {
      setState(next);
      setHydrated(true);
    });
    import("@capacitor/core")
      .then(({ Capacitor }) => setNative(Capacitor.isNativePlatform()))
      .catch(() => undefined)
      .finally(() => setPlatformReady(true));
  }, []);
  useEffect(() => {
    if (!hydrated || !native) return;
    void import("@capacitor/local-notifications")
      .then(async ({ LocalNotifications }) => {
        const permission = await LocalNotifications.requestPermissions();
        if (permission.display === "granted") {
          await LocalNotifications.cancel({ notifications: [{ id: 9001 }] });
          await LocalNotifications.schedule({
            notifications: [
              {
                id: 9001,
                title: "朝夕周报时间",
                body: "看看这周哪些项目做得好，哪些规律被忽略了。",
                schedule: {
                  on: { weekday: 6, hour: 23, minute: 57 },
                  repeats: true,
                  allowWhileIdle: true,
                },
              },
            ],
          });
        }
      })
      .catch(() => undefined);
  }, [hydrated, native]);
  useEffect(() => {
    if (hydrated) void writeState(state);
  }, [state, hydrated]);
  useEffect(() => {
    if (!showAdd && !editing) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowAdd(false);
        setEditing(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showAdd, editing]);

  const todayDone = habits.reduce(
    (sum, habit) =>
      sum + Math.min(state.logs[today]?.[habit.id] || 0, habit.target),
    0,
  );
  const todayTarget = habits.reduce((sum, habit) => sum + habit.target, 0);
  const progress = todayTarget
    ? Math.round((todayDone / todayTarget) * 100)
    : 0;
  const completed = habits.filter(
    (habit) => (state.logs[today]?.[habit.id] || 0) >= habit.target,
  ).length;
  const streak = useMemo(() => {
    let count = 0;
    for (let i = 0; i < 365; i += 1) {
      const day = dateKey(shiftDate(new Date(), -i));
      if (!Object.values(state.logs[day] || {}).some((value) => value > 0)) {
        if (i === 0) continue;
        break;
      }
      count += 1;
    }
    return count;
  }, [state.logs]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  }
  function changeCount(habit: Habit, amount: number) {
    setState((current) => {
      const day = current.logs[today] || {};
      return {
        ...current,
        logs: {
          ...current.logs,
          [today]: {
            ...day,
            [habit.id]: Math.max(
              0,
              Math.min(habit.target, (day[habit.id] || 0) + amount),
            ),
          },
        },
      };
    });
  }
  async function saveHabit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    if (!name) return;
    const file = form.get("avatar");
    let avatar = editing?.avatar;
    if (file instanceof File && file.size > 0) {
      if (file.size > 12 * 1024 * 1024)
        return notify("头像图片不能超过 12 MB");
      try {
        avatar = await prepareAvatar(file);
      } catch {
        return notify("头像图片无法读取，请换一张再试");
      }
    }
    const target = Math.max(1, Number(form.get("target") || 1));
    const previousTargetHistory = editing?.targetHistory?.length
      ? editing.targetHistory
      : editing
        ? [{ from: editing.createdAt || today, target: editing.target }]
        : [];
    const targetHistory = editing
      ? target === editing.target
        ? previousTargetHistory
        : [
            ...previousTargetHistory.filter((entry) => entry.from !== today),
            { from: today, target },
          ].sort((a, b) => a.from.localeCompare(b.from))
      : [{ from: today, target }];
    const next: Habit = {
      id:
        editing?.id ||
        Math.max(100, ...state.habits.map((habit) => habit.id)) + 1,
      name,
      target,
      unit: String(form.get("unit") || "次").trim(),
      time: String(form.get("time") || "09:00"),
      reminderEnabled: editing?.reminderEnabled || false,
      tone: editing?.tone || "sand",
      avatar,
      createdAt: editing?.createdAt || today,
      archivedAt: editing?.archivedAt,
      targetHistory,
    };
    setState((current) => ({
      ...current,
      habits: editing
        ? current.habits.map((item) =>
            item.id === editing.id ? { ...item, ...next } : item,
          )
        : [...current.habits, next],
    }));
    setSwipedId(null);
    setEditing(null);
    setShowAdd(false);
    if (
      native &&
      next.reminderEnabled &&
      editing?.time !== next.time
    ) {
      void scheduleHabitReminder(next).catch(() =>
        notify("项目已保存，但提醒时间更新失败，请重新开启提醒"),
      );
    }
    notify(editing ? "项目已更新" : "项目已添加");
  }
  function archiveHabit(habit: Habit) {
    if (!window.confirm(`确定删除“${habit.name}”吗？历史记录仍会保留。`))
      return;
    setState((current) => ({
      ...current,
      habits: current.habits.map((item) =>
        item.id === habit.id
          ? { ...item, archived: true, archivedAt: today }
          : item,
      ),
    }));
    setSwipedId(null);
    if (native && habit.reminderEnabled) {
      void import("@capacitor/local-notifications")
        .then(({ LocalNotifications }) =>
          LocalNotifications.cancel({
            notifications: [{ id: reminderId(habit.id) }],
          }),
        )
        .catch(() => undefined);
    }
    notify("项目已归档，历史记录仍会保留");
  }
  function reminderId(habitId: number) {
    return 10000 + (habitId % 2000000000);
  }
  async function scheduleHabitReminder(habit: Habit) {
    const { LocalNotifications } = await import(
      "@capacitor/local-notifications"
    );
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display !== "granted") throw new Error("permission");
    await LocalNotifications.cancel({
      notifications: [{ id: reminderId(habit.id) }],
    });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: reminderId(habit.id),
          title: "朝夕提醒",
          body: `${habit.name} · 今天的目标 ${habit.target}${habit.unit}`,
          schedule: {
            on: {
              hour: Number(habit.time.slice(0, 2)),
              minute: Number(habit.time.slice(3)),
            },
            repeats: true,
            allowWhileIdle: true,
          },
        },
      ],
    });
  }
  async function toggleReminder(habit: Habit) {
    if (!native) {
      notify("定时提醒请在安卓版中开启");
      return;
    }
    try {
      if (habit.reminderEnabled) {
        const { LocalNotifications } = await import(
          "@capacitor/local-notifications"
        );
        await LocalNotifications.cancel({
          notifications: [{ id: reminderId(habit.id) }],
        });
      } else {
        await scheduleHabitReminder(habit);
      }
      setState((current) => ({
        ...current,
        habits: current.habits.map((item) =>
          item.id === habit.id
            ? { ...item, reminderEnabled: !habit.reminderEnabled }
            : item,
        ),
      }));
      notify(
        habit.reminderEnabled
          ? "提醒已关闭"
          : `${habit.time} 提醒已开启`,
      );
    } catch {
      notify("提醒设置失败，请检查通知权限后重试");
    }
  }
  function downloadData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `朝夕备份-${today}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  async function importData(file?: File) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      notify("备份文件不能超过 20 MB");
      return;
    }
    try {
      const parsed = JSON.parse(await file.text()) as State;
      if (!Array.isArray(parsed.habits) || typeof parsed.logs !== "object")
        throw new Error();
      const imported = normalizeState(parsed);
      setState({
        ...imported,
        habits: imported.habits.map((habit) => ({
          ...habit,
          reminderEnabled: false,
        })),
      });
      notify("数据已导入，请重新开启需要的提醒");
    } catch {
      notify("这不是有效的朝夕备份文件");
    }
  }
  function clearData() {
    if (!window.confirm("确定清空所有打卡、项目和周报吗？此操作无法撤销。"))
      return;
    setState(normalizeState(DEFAULT_STATE));
    if (native) {
      void import("@capacitor/local-notifications")
        .then(({ LocalNotifications }) =>
          LocalNotifications.cancel({
            notifications: [
              { id: 9001 },
              ...state.habits.map((habit) => ({ id: reminderId(habit.id) })),
            ],
          }),
        )
        .catch(() => undefined);
    }
    notify("数据已清空");
  }
  async function generateReport() {
    const period = periodFor();
    const existing = state.reports.find(
      (report) => report.start === period.start && report.end === period.end,
    );
    const generationCount = existing?.generationCount || (existing ? 1 : 0);
    if (generationCount >= MAX_REPORT_GENERATIONS) {
      notify("本周周报已生成 2 次，已达到省钱上限");
      return;
    }
    if (
      existing &&
      !window.confirm("重新生成会消耗一次 AI 额度，并替换当前周报。继续吗？")
    )
      return;
    setReportLoading(true);
    const periodStart = new Date(`${period.start}T12:00:00`);
    const periodDays = Array.from({ length: 7 }, (_, index) =>
      dateKey(shiftDate(periodStart, index)),
    );
    const reportHabits = state.habits.filter((habit) =>
      periodDays.some(
        (day) =>
          habitWasActiveOn(habit, day) ||
          state.logs[day]?.[habit.id] !== undefined,
      ),
    );
    const metrics = reportHabits.map((habit) => {
      const daily = periodDays.map((day) => {
        const active =
          habitWasActiveOn(habit, day) ||
          state.logs[day]?.[habit.id] !== undefined;
        const target = targetOn(habit, day);
        const count = state.logs[day]?.[habit.id] || 0;
        return { date: day, count, target, active, completed: active && count >= target };
      });
      const previousWeeks = Array.from({ length: 4 }, (_, week) => {
        const start = shiftDate(periodStart, -(week + 1) * 7);
        const weekDays = Array.from({ length: 7 }, (_, index) =>
          dateKey(shiftDate(start, index)),
        );
        const activeDays = weekDays.filter(
          (day) =>
            habitWasActiveOn(habit, day) ||
            state.logs[day]?.[habit.id] !== undefined,
        );
        const completedDays = activeDays.filter(
          (day) =>
            (state.logs[day]?.[habit.id] || 0) >= targetOn(habit, day),
        ).length;
        return {
          start: dateKey(start),
          activeDays: activeDays.length,
          completedDays,
          completionRate: activeDays.length
            ? Math.round((completedDays / activeDays.length) * 100)
            : null,
        };
      });
      return {
        name: habit.name,
        target: habit.target,
        unit: habit.unit,
        daily,
        activeDays: daily.filter((day) => day.active).length,
        completed: daily.filter((day) => day.completed).length,
        previousWeeks,
      };
    });
    try {
      const response = await fetch("/api/coach/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", period, metrics }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "周报生成失败");
      const report: Report = {
        id: `${period.start}:${period.end}`,
        start: period.start,
        end: period.end,
        createdAt: payload.generatedAt || period.end,
        content: payload.content,
        metrics,
        followUps: [],
        generationCount: generationCount + 1,
      };
      setState((current) => ({
        ...current,
        reports: [
          report,
          ...current.reports.filter(
            (item) => item.start !== period.start || item.end !== period.end,
          ),
        ],
      }));
      notify("本周周报已生成");
    } catch (error) {
      notify(error instanceof Error ? error.message : "周报暂时生成失败");
    } finally {
      setReportLoading(false);
    }
  }
  async function askReport(event: FormEvent) {
    event.preventDefault();
    const current = state.reports[0];
    const trimmedQuestion = question.trim();
    if (!current || !trimmedQuestion) return;
    if (current.followUps.length >= MAX_REPORT_FOLLOW_UPS) {
      notify("这份周报已达到 5 次追问上限");
      return;
    }
    setReportLoading(true);
    try {
      const response = await fetch("/api/coach/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "follow_up",
          report: {
            start: current.start,
            end: current.end,
            content: current.content,
            metrics: current.metrics,
            followUps: current.followUps.slice(-MAX_REPORT_FOLLOW_UPS),
          },
          question: trimmedQuestion,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "追问失败");
      setState((value) => ({
        ...value,
        reports: value.reports.map((item) =>
          item.id === current.id
            ? {
                ...item,
                followUps: [
                  ...item.followUps,
                  { question: trimmedQuestion, answer: payload.content },
                ],
              }
            : item,
        ),
      }));
      setQuestion("");
    } catch (error) {
      notify(error instanceof Error ? error.message : "追问暂时失败");
    } finally {
      setReportLoading(false);
    }
  }
  const currentReport = state.reports[0];
  const latestPeriod = periodFor();
  const reportIsCurrent =
    currentReport?.start === latestPeriod.start &&
    currentReport?.end === latestPeriod.end;
  const latestStoredReport = state.reports.find(
    (report) =>
      report.start === latestPeriod.start && report.end === latestPeriod.end,
  );
  const currentGenerationCount = currentReport?.generationCount || 1;
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const firstWeekday = monthStart.getDay();
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();

  return (
    <main
      className={`site-shell ${platformReady && !native ? "with-install" : ""}`}
    >
      <section className="app-panel" aria-label="朝夕应用">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">朝</span>
            <span>朝夕 · {state.profile.name}</span>
          </div>
          {platformReady && !native && (
            <a className="download-link" href="/daily-coach.apk" download>
              获取安卓版
            </a>
          )}
        </header>
        {tab === "checkin" && (
          <section className="screen">
            <div className="today-heading">
              <div>
                <p className="eyebrow">{displayDate(new Date())}</p>
                <h1>今天，也照顾好自己。</h1>
                <p className="intro">把想做的事，变成今天能完成的小约定。</p>
              </div>
              <div
                className="progress-ring"
                style={
                  { "--progress": `${progress * 3.6}deg` } as CSSProperties
                }
              >
                <span>{progress}%</span>
              </div>
            </div>
            <section className="coach-note">
              <span className="coach-label">今日进度</span>
              <p>
                {progress === 100
                  ? "今天的约定都完成了，收尾，然后安心休息。"
                  : progress
                    ? `已经走了 ${progress}%，下一步：完成一个最小动作。`
                    : "不用等状态完美，先完成最小的一步。"}
              </p>
            </section>
            <section className="habit-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">今日约定</p>
                  <h2>慢慢来，但要做到。</h2>
                </div>
                <button className="add-button" onClick={() => setShowAdd(true)}>
                  ＋ 添加
                </button>
              </div>
              <div className="habit-list">
                {habits.map((habit) => {
                  const done = state.logs[today]?.[habit.id] || 0;
                  const complete = done >= habit.target;
                  return (
                    <article
                      className={`habit-card ${complete ? "is-complete" : ""} ${swipedId === habit.id ? "is-swiped" : ""}`}
                      key={habit.id}
                       onTouchStart={(event) => {
                         touchX.current = event.changedTouches[0].clientX;
                         touchY.current = event.changedTouches[0].clientY;
                       }}
                       onTouchEnd={(event) => {
                         const deltaX =
                           event.changedTouches[0].clientX - touchX.current;
                         const deltaY =
                           event.changedTouches[0].clientY - touchY.current;
                         if (Math.abs(deltaX) <= Math.abs(deltaY)) return;
                         if (deltaX < -45) setSwipedId(habit.id);
                         if (deltaX > 45) setSwipedId(null);
                      }}
                    >
                      <div className={`habit-icon tone-${habit.tone}`}>
                        {habit.avatar ? (
                          <span
                            className="habit-photo"
                            style={{ backgroundImage: `url(${habit.avatar})` }}
                            aria-hidden="true"
                          />
                        ) : (
                          habit.name.slice(0, 1)
                        )}
                      </div>
                      <div className="habit-copy">
                        <div className="habit-title-row">
                          <h3>{habit.name}</h3>
                          <span>
                            {done}/{habit.target} {habit.unit}
                          </span>
                        </div>
                        <div className="mini-progress">
                          <span
                            style={{
                              width: `${Math.min(100, (done / habit.target) * 100)}%`,
                            }}
                          />
                        </div>
                        <div className="habit-actions">
                          <div className="swipe-hint">
                            <button
                              className="text-button"
                              onClick={() => {
                                setEditing(habit);
                                setSwipedId(null);
                              }}
                            >
                              设置
                            </button>
                            <button
                              className="text-button danger"
                              onClick={() => archiveHabit(habit)}
                            >
                              删除
                            </button>
                            <button
                              className="text-button"
                              onClick={() => void toggleReminder(habit)}
                            >
                              {habit.reminderEnabled
                                ? `${habit.time} · 关闭提醒`
                                : "开启提醒"}
                            </button>
                          </div>
                          <div className="count-actions">
                            {done > 0 && (
                              <button
                                className="undo-button"
                                onClick={() => changeCount(habit, -1)}
                                aria-label="撤销一次"
                              >
                                −
                              </button>
                            )}
                            <button
                              className="check-button"
                              disabled={complete}
                              onClick={() => changeCount(habit, 1)}
                            >
                              {complete
                                ? "已完成 ✓"
                                : habit.target === 1
                                  ? "完成"
                                  : "记一次"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
            <section className="summary-strip">
              <div>
                <strong>{completed}</strong>
                <span>已完成项目</span>
              </div>
              <div>
                <strong>{habits.length - completed}</strong>
                <span>还在进行</span>
              </div>
              <div>
                <strong>{streak}</strong>
                <span>连续打卡天</span>
              </div>
            </section>
          </section>
        )}
        {tab === "calendar" && (
          <section className="screen inner-screen">
            <div className="page-heading">
              <div>
                <p className="eyebrow">记录回看</p>
                <h2>日历</h2>
              </div>
              <div className="month-controls">
                <button
                  onClick={() =>
                    setMonth(
                      new Date(month.getFullYear(), month.getMonth() - 1, 1),
                    )
                  }
                >
                  ‹
                </button>
                <strong>
                  {month.getFullYear()}年{month.getMonth() + 1}月
                </strong>
                <button
                  onClick={() =>
                    setMonth(
                      new Date(month.getFullYear(), month.getMonth() + 1, 1),
                    )
                  }
                >
                  ›
                </button>
              </div>
            </div>
            <div className="calendar-grid calendar-week">
              <span>日</span>
              <span>一</span>
              <span>二</span>
              <span>三</span>
              <span>四</span>
              <span>五</span>
              <span>六</span>
            </div>
            <div
              className="calendar-grid calendar-days"
              onTouchStart={(event) => {
                touchX.current = event.changedTouches[0].clientX;
                touchY.current = event.changedTouches[0].clientY;
              }}
              onTouchEnd={(event) => {
                const deltaY = event.changedTouches[0].clientY - touchY.current;
                const deltaX = event.changedTouches[0].clientX - touchX.current;
                if (Math.abs(deltaY) > 80 && Math.abs(deltaY) > Math.abs(deltaX)) {
                  setMonth(
                    new Date(
                      month.getFullYear(),
                      month.getMonth() + (deltaY < 0 ? 1 : -1),
                      1,
                    ),
                  );
                }
              }}
            >
              {Array.from(
                { length: firstWeekday + daysInMonth },
                (_, index) => {
                  if (index < firstWeekday)
                    return (
                      <span className="calendar-empty" key={`e${index}`} />
                    );
                  const day = index - firstWeekday + 1;
                  const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dayHabits = state.habits.filter(
                    (habit) =>
                      habitWasActiveOn(habit, key) ||
                      state.logs[key]?.[habit.id] !== undefined,
                  );
                  const values = dayHabits.map((habit) =>
                    Math.min(
                      targetOn(habit, key),
                      state.logs[key]?.[habit.id] || 0,
                    ),
                  );
                  const rate = dayHabits.length
                    ? Math.round(
                        (values.reduce((a, b) => a + b, 0) /
                          Math.max(
                            1,
                            dayHabits.reduce(
                              (a, habit) => a + targetOn(habit, key),
                              0,
                            ),
                          )) *
                          100,
                      )
                    : 0;
                  return (
                    <button
                      className={`calendar-day level-${rate === 0 ? 0 : rate < 40 ? 1 : rate < 80 ? 2 : 3} ${key === selectedDay ? "selected" : ""}`}
                      key={key}
                      onClick={() => setSelectedDay(key)}
                    >
                      <strong>{day}</strong>
                      <small>{rate}%</small>
                    </button>
                  );
                },
              )}
            </div>
            <div className="day-detail">
              <p className="eyebrow">{selectedDay}</p>
              {state.habits
                .filter(
                  (habit) =>
                    habitWasActiveOn(habit, selectedDay) ||
                    state.logs[selectedDay]?.[habit.id] !== undefined,
                )
                .map((habit) => (
                  <div className="detail-row" key={habit.id}>
                    <span>
                      {habit.name}
                      {habit.archived ? "（已归档）" : ""}
                    </span>
                    <strong>
                      {state.logs[selectedDay]?.[habit.id] || 0}/
                      {targetOn(habit, selectedDay)}
                    </strong>
                  </div>
                ))}
            </div>
          </section>
        )}
        {tab === "reports" && (
          <section className="screen inner-screen report-screen">
            <div className="page-heading">
              <div>
                <p className="eyebrow">客观回顾</p>
                <h2>AI 周报</h2>
              </div>
              <button
                className="history-button"
                onClick={() => setShowHistory((value) => !value)}
              >
                历史
              </button>
            </div>
            {showHistory && (
              <div className="report-history">
                {state.reports.length ? (
                  state.reports.map((report) => (
                    <button
                      key={report.id}
                      onClick={() => {
                        setState((value) => ({
                          ...value,
                          reports: [
                            report,
                            ...value.reports.filter(
                              (item) => item.id !== report.id,
                            ),
                          ],
                        }));
                        setShowHistory(false);
                      }}
                    >
                      {report.start} — {report.end}
                    </button>
                  ))
                ) : (
                  <p>还没有历史周报</p>
                )}
              </div>
            )}
            {currentReport ? (
              <>
                {!reportIsCurrent && (
                  <button
                    className="new-report-banner"
                    onClick={() => {
                      if (latestStoredReport) {
                        setState((value) => ({
                          ...value,
                          reports: [
                            latestStoredReport,
                            ...value.reports.filter(
                              (item) => item.id !== latestStoredReport.id,
                            ),
                          ],
                        }));
                      } else {
                        void generateReport();
                      }
                    }}
                    disabled={reportLoading}
                  >
                    新周期 {latestPeriod.start} — {latestPeriod.end}
                    {latestStoredReport ? "已有周报 · 点击查看" : "尚未生成 · 点击生成"}
                  </button>
                )}
                <article className="report-card">
                  <div className="report-card-heading">
                    <p className="eyebrow">
                      {currentReport.start} — {currentReport.end}
                    </p>
                    <button
                      className="text-button"
                      disabled={
                        reportLoading ||
                        (reportIsCurrent &&
                          currentGenerationCount >= MAX_REPORT_GENERATIONS)
                      }
                      onClick={() => {
                        if (!reportIsCurrent && latestStoredReport) {
                          setState((value) => ({
                            ...value,
                            reports: [
                              latestStoredReport,
                              ...value.reports.filter(
                                (item) => item.id !== latestStoredReport.id,
                              ),
                            ],
                          }));
                        } else {
                          void generateReport();
                        }
                      }}
                    >
                      {reportIsCurrent
                        ? currentGenerationCount >= MAX_REPORT_GENERATIONS
                          ? "本周已达上限"
                          : "再生成一次"
                        : latestStoredReport
                          ? "查看最新周报"
                          : "生成最新周报"}
                    </button>
                  </div>
                  <div className="report-content">{currentReport.content}</div>
                </article>
                {currentReport.followUps.length < MAX_REPORT_FOLLOW_UPS ? (
                  <form className="followup" onSubmit={askReport}>
                    <label htmlFor="report-question">
                      针对这份周报追问 · {currentReport.followUps.length}/
                      {MAX_REPORT_FOLLOW_UPS}
                    </label>
                    <div>
                      <input
                        id="report-question"
                        value={question}
                        maxLength={300}
                        onChange={(event) => setQuestion(event.target.value)}
                        placeholder="例如：下周我最该优先做什么？"
                      />
                      <button disabled={reportLoading}>问</button>
                    </div>
                  </form>
                ) : (
                  <p className="usage-note">本周追问已达 5 次，先把注意力放回行动。</p>
                )}
                {currentReport.followUps.map((item, index) => (
                  <div
                    className="followup-item"
                    key={`${item.question}-${index}`}
                  >
                    <strong>{item.question}</strong>
                    <p>{item.answer}</p>
                  </div>
                ))}
              </>
            ) : (
              <div className="empty-report">
                <p>每周五晚上生成一份客观周报，帮你看见自己容易忽略的规律。</p>
                <button
                  className="primary-button"
                  onClick={() => void generateReport()}
                  disabled={reportLoading}
                >
                  {reportLoading ? "生成中…" : "生成本周周报"}
                </button>
                <small>每周期最多生成 2 次、追问 5 次，避免不必要的 AI 消耗。</small>
              </div>
            )}
          </section>
        )}
        {tab === "profile" && (
          <section className="screen inner-screen">
            <div className="page-heading">
              <div>
                <p className="eyebrow">你的空间</p>
                <h2>我的</h2>
              </div>
              <div className="profile-avatar">29</div>
            </div>
            <div className="profile-card">
              <strong>29</strong>
              <span>把注意力放回今天。</span>
            </div>
            <div className="stats-grid">
              <div>
                <strong>{state.habits.length}</strong>
                <span>累计项目</span>
              </div>
              <div>
                <strong>{streak}</strong>
                <span>连续打卡</span>
              </div>
              <div>
                <strong>{state.reports.length}</strong>
                <span>周报份数</span>
              </div>
            </div>
            <button className="wide-button" onClick={downloadData}>
              导出我的数据
            </button>
            <label className="wide-button secondary-button">
              导入备份数据
              <input
                type="file"
                accept="application/json,.json"
                onChange={(event) => void importData(event.target.files?.[0])}
              />
            </label>
            <button className="wide-button danger-button" onClick={clearData}>
              清空所有数据
            </button>
            <p className="privacy-note">
              数据保存在你的设备上。AI 周报只发送本周统计和前四周汇总。
            </p>
          </section>
        )}
        <nav className="bottom-nav" aria-label="主导航">
          {(["checkin", "calendar", "reports", "profile"] as Tab[]).map(
            (item, index) => (
              <button
                className={tab === item ? "active" : ""}
                key={item}
                onClick={() => setTab(item)}
              >
                <span className="nav-icon">{["✓", "▦", "✦", "○"][index]}</span>
                {navLabel(item)}
              </button>
            ),
          )}
        </nav>
      </section>
      {platformReady && !native && (
        <aside className="install-panel">
          <span className="install-kicker">ANDROID · MVP</span>
          <h2>把朝夕，装进手机。</h2>
          <p>安装后拥有完整的打卡和提醒体验。</p>
          <a className="apk-button" href="/daily-coach.apk" download>
            下载 Android 安装包<span>APK · 当前测试版</span>
          </a>
          <ol>
            <li>
              <span>01</span>用安卓手机打开这个网站
            </li>
            <li>
              <span>02</span>下载 APK 并允许本次安装
            </li>
            <li>
              <span>03</span>打开朝夕，开启通知权限
            </li>
          </ol>
        </aside>
      )}
      {(showAdd || editing) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setShowAdd(false);
            setEditing(null);
          }}
        >
          <section
            className="add-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="habit-form-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-heading">
              <div>
                <p className="eyebrow">{editing ? "编辑项目" : "新建约定"}</p>
                <h2 id="habit-form-title">
                  {editing ? "把项目调整到适合你的节奏" : "今天想照顾好什么？"}
                </h2>
              </div>
              <button
                className="close-button"
                aria-label="关闭"
                onClick={() => {
                  setShowAdd(false);
                  setEditing(null);
                }}
              >
                ×
              </button>
            </div>
            <form onSubmit={saveHabit}>
              <label>
                项目名称
                <input
                  name="name"
                  defaultValue={editing?.name || ""}
                  autoFocus
                  required
                  maxLength={18}
                  placeholder="例如：喝水、阅读、拉伸"
                />
              </label>
              <div className="form-row">
                <label>
                  每日目标
                  <input
                    name="target"
                    type="number"
                    min="1"
                    max="99"
                    defaultValue={editing?.target || 1}
                  />
                </label>
                <label>
                  单位
                  <input
                    name="unit"
                    maxLength={4}
                    defaultValue={editing?.unit || "次"}
                  />
                </label>
              </div>
              <label>
                提醒时间
                <input
                  name="time"
                  type="time"
                  defaultValue={editing?.time || "09:00"}
                />
              </label>
              <label>
                项目头像
                <input name="avatar" type="file" accept="image/*" />
              </label>
              <button className="submit-button" type="submit">
                保存项目
              </button>
            </form>
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}
