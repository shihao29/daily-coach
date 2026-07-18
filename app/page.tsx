"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Habit = {
  id: number;
  name: string;
  target: number;
  unit: string;
  time: string;
  reminderEnabled: boolean;
  tone: "sand" | "clay" | "stone";
};

type DailyLogs = Record<string, Record<number, number>>;

const HABITS_KEY = "daily-coach:habits:v1";
const LOGS_KEY = "daily-coach:logs:v1";

const DEFAULT_HABITS: Habit[] = [
  {
    id: 101,
    name: "好好喝水",
    target: 8,
    unit: "杯",
    time: "10:00",
    reminderEnabled: false,
    tone: "sand",
  },
  {
    id: 102,
    name: "晚间拉伸",
    target: 1,
    unit: "次",
    time: "21:30",
    reminderEnabled: false,
    tone: "clay",
  },
];

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function notificationId(id: number) {
  return 10_000 + (id % 2_000_000_000);
}

function initials(name: string) {
  return name.replace(/\s/g, "").slice(0, 1) || "做";
}

export default function Home() {
  const [habits, setHabits] = useState<Habit[]>(DEFAULT_HABITS);
  const [logs, setLogs] = useState<DailyLogs>({});
  const [hydrated, setHydrated] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState("");
  const [name, setName] = useState("");
  const [target, setTarget] = useState(1);
  const [unit, setUnit] = useState("次");
  const [time, setTime] = useState("09:00");
  const webTimers = useRef(new Map<number, number>());
  const today = dateKey();

  useEffect(() => {
    try {
      const storage = typeof window !== "undefined" ? window.localStorage : null;
      const savedHabits = storage?.getItem(HABITS_KEY);
      const savedLogs = storage?.getItem(LOGS_KEY);
      if (savedHabits) setHabits(JSON.parse(savedHabits));
      if (savedLogs) setLogs(JSON.parse(savedLogs));
    } catch {
      // Corrupt local data should not prevent the app from opening.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const storage = typeof window !== "undefined" ? window.localStorage : null;
    storage?.setItem(HABITS_KEY, JSON.stringify(habits));
    storage?.setItem(LOGS_KEY, JSON.stringify(logs));
  }, [habits, hydrated, logs]);

  useEffect(() => {
    if (!hydrated || !("Notification" in window)) return;
    if (window.Notification.permission !== "granted") return;
    habits.filter((habit) => habit.reminderEnabled).forEach(scheduleWebTimer);

    return () => {
      webTimers.current.forEach((timer) => window.clearTimeout(timer));
      webTimers.current.clear();
    };
  }, [habits, hydrated]);

  const totalTarget = habits.reduce((sum, habit) => sum + habit.target, 0);
  const totalDone = habits.reduce(
    (sum, habit) => sum + Math.min(logs[today]?.[habit.id] ?? 0, habit.target),
    0,
  );
  const progress = totalTarget ? Math.round((totalDone / totalTarget) * 100) : 0;
  const completedHabits = habits.filter(
    (habit) => (logs[today]?.[habit.id] ?? 0) >= habit.target,
  ).length;

  const streak = useMemo(() => {
    let count = 0;
    for (let offset = 0; offset < 30; offset += 1) {
      const day = new Date();
      day.setDate(day.getDate() - offset);
      const dayLog = logs[dateKey(day)] ?? {};
      const checked = Object.values(dayLog).some((value) => value > 0);
      if (!checked) {
        if (offset === 0) continue;
        break;
      }
      count += 1;
    }
    return count;
  }, [logs]);

  const nextHabit = habits.find(
    (habit) => (logs[today]?.[habit.id] ?? 0) < habit.target,
  );
  const coachCopy =
    progress === 100
      ? "今天的约定都完成了。收尾，然后安心休息。"
      : progress > 0
        ? `已经走了 ${progress}%。下一步：${nextHabit?.name ?? "继续保持"}。`
        : "不用等状态完美，先完成最小的一步。";

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  function changeCount(habit: Habit, amount: number) {
    setLogs((current) => {
      const dayLog = current[today] ?? {};
      const nextCount = Math.max(
        0,
        Math.min(habit.target, (dayLog[habit.id] ?? 0) + amount),
      );
      return { ...current, [today]: { ...dayLog, [habit.id]: nextCount } };
    });
  }

  function scheduleWebTimer(habit: Habit) {
    const currentTimer = webTimers.current.get(habit.id);
    if (currentTimer) window.clearTimeout(currentTimer);

    const [hour, minute] = habit.time.split(":").map(Number);
    const next = new Date();
    next.setHours(hour, minute, 0, 0);
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);

    const timer = window.setTimeout(() => {
      new window.Notification("该照顾自己了", {
        body: `${habit.name} · 今日目标 ${habit.target}${habit.unit}`,
      });
      scheduleWebTimer(habit);
    }, next.getTime() - Date.now());
    webTimers.current.set(habit.id, timer);
  }

  async function enableReminder(habit: Habit) {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { LocalNotifications } = await import(
          "@capacitor/local-notifications"
        );
        const currentPermission = await LocalNotifications.checkPermissions();
        const permission =
          currentPermission.display === "granted"
            ? currentPermission
            : await LocalNotifications.requestPermissions();

        if (permission.display !== "granted") {
          notify("没有通知权限，暂时无法提醒");
          return;
        }

        await LocalNotifications.createChannel({
          id: "daily-coach",
          name: "每日监督提醒",
          description: "你为每日项目设置的提醒",
          importance: 4,
        });
        await LocalNotifications.cancel({
          notifications: [{ id: notificationId(habit.id) }],
        });
        const [hour, minute] = habit.time.split(":").map(Number);
        await LocalNotifications.schedule({
          notifications: [
            {
              id: notificationId(habit.id),
              title: "该照顾自己了",
              body: `${habit.name} · 今日目标 ${habit.target}${habit.unit}`,
              channelId: "daily-coach",
              schedule: {
                on: { hour, minute },
                repeats: true,
                allowWhileIdle: true,
              },
            },
          ],
        });
      } else {
        if (!("Notification" in window)) {
          notify("当前浏览器不支持通知，请安装安卓版");
          return;
        }
        const permission = await window.Notification.requestPermission();
        if (permission !== "granted") {
          notify("没有通知权限，暂时无法提醒");
          return;
        }
        scheduleWebTimer(habit);
      }

      setHabits((current) =>
        current.map((item) =>
          item.id === habit.id ? { ...item, reminderEnabled: true } : item,
        ),
      );
      notify(
        `已开启 ${habit.time} 提醒${
          Capacitor.isNativePlatform() ? "" : "，网页需保持打开"
        }`,
      );
    } catch {
      notify("提醒开启失败，请稍后再试");
    }
  }

  function addHabit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;

    setHabits((current) => [
      ...current,
      {
        id: Date.now() % 2_000_000_000,
        name: cleanName,
        target: Math.max(1, Math.min(target, 99)),
        unit: unit.trim() || "次",
        time,
        reminderEnabled: false,
        tone: current.length % 2 === 0 ? "stone" : "sand",
      },
    ]);
    setName("");
    setTarget(1);
    setUnit("次");
    setTime("09:00");
    setShowAdd(false);
    notify("新的约定已经加入今天");
  }

  return (
    <main className="site-shell">
      <section className="app-panel" aria-label="朝夕监督教练">
        <header className="topbar">
          <a className="brand" href="#today" aria-label="朝夕首页">
            <span className="brand-mark">朝</span>
            <span>朝夕</span>
          </a>
          <a className="download-link" href="/daily-coach.apk" download>
            获取安卓版
          </a>
        </header>

        <div className="today-heading" id="today">
          <div>
            <p className="eyebrow">
              {new Intl.DateTimeFormat("zh-CN", {
                month: "long",
                day: "numeric",
                weekday: "long",
              }).format(new Date())}
            </p>
            <h1>今天，也照顾好自己。</h1>
            <p className="intro">把想做的事变成今天能完成的小约定。</p>
          </div>
          <div
            className="progress-ring"
            style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}
            aria-label={`今日进度 ${progress}%`}
          >
            <span>{progress}%</span>
          </div>
        </div>

        <section className="coach-note" aria-label="今日教练建议">
          <span className="coach-label">今日教练</span>
          <p>{coachCopy}</p>
        </section>

        <section className="habit-section" aria-labelledby="habit-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">今日约定</p>
              <h2 id="habit-title">慢慢来，但要做到。</h2>
            </div>
            <button className="add-button" type="button" onClick={() => setShowAdd(true)}>
              <span aria-hidden="true">＋</span> 添加
            </button>
          </div>

          <div className="habit-list">
            {habits.map((habit) => {
              const done = logs[today]?.[habit.id] ?? 0;
              const completed = done >= habit.target;
              return (
                <article className={`habit-card ${completed ? "is-complete" : ""}`} key={habit.id}>
                  <div className={`habit-icon tone-${habit.tone}`} aria-hidden="true">
                    {initials(habit.name)}
                  </div>
                  <div className="habit-copy">
                    <div className="habit-title-row">
                      <h3>{habit.name}</h3>
                      <span>
                        {done}/{habit.target} {habit.unit}
                      </span>
                    </div>
                    <div className="mini-progress" aria-hidden="true">
                      <span style={{ width: `${Math.min(100, (done / habit.target) * 100)}%` }} />
                    </div>
                    <div className="habit-actions">
                      <button
                        className={`reminder-button ${habit.reminderEnabled ? "is-on" : ""}`}
                        type="button"
                        onClick={() => enableReminder(habit)}
                      >
                        {habit.reminderEnabled ? "提醒已开" : "开启提醒"} · {habit.time}
                      </button>
                      <div className="count-actions">
                        {done > 0 && (
                          <button
                            className="undo-button"
                            type="button"
                            aria-label={`${habit.name}撤销一次`}
                            onClick={() => changeCount(habit, -1)}
                          >
                            −
                          </button>
                        )}
                        <button
                          className="check-button"
                          type="button"
                          disabled={completed}
                          onClick={() => changeCount(habit, 1)}
                        >
                          {completed ? "已完成 ✓" : habit.target === 1 ? "完成" : "记一次"}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="summary-strip" aria-label="今日统计">
          <div>
            <strong>{completedHabits}</strong>
            <span>已完成项目</span>
          </div>
          <div>
            <strong>{habits.length - completedHabits}</strong>
            <span>还在进行</span>
          </div>
          <div>
            <strong>{streak}</strong>
            <span>连续打卡天</span>
          </div>
        </section>

        <footer className="app-footer">
          <p>数据只保存在你的设备里。</p>
          <a href="/daily-coach.apk" download>
            下载 APK
          </a>
        </footer>
      </section>

      <aside className="install-panel" aria-label="安卓版下载说明">
        <span className="install-kicker">ANDROID · MVP</span>
        <h2>把陪伴，装进口袋。</h2>
        <p>同一套监督体验，安装后可以在后台按时提醒你。</p>
        <a className="apk-button" href="/daily-coach.apk" download>
          下载 Android 安装包
          <span>APK · 首个测试版</span>
        </a>
        <ol>
          <li><span>01</span> 用安卓手机打开这个网站</li>
          <li><span>02</span> 下载 APK 并允许本次安装</li>
          <li><span>03</span> 打开“朝夕”，开启通知权限</li>
        </ol>
        <p className="install-note">首次安装时，安卓会提示“未知来源”，这是测试版未上架应用商店的正常提示。</p>
      </aside>

      {showAdd && (
        <div className="modal-backdrop" role="presentation">
          <section className="add-sheet" role="dialog" aria-modal="true" aria-labelledby="add-title">
            <div className="sheet-heading">
              <div>
                <p className="eyebrow">新建约定</p>
                <h2 id="add-title">今天想照顾好什么？</h2>
              </div>
              <button className="close-button" type="button" aria-label="关闭" onClick={() => setShowAdd(false)}>
                ×
              </button>
            </div>
            <form onSubmit={addHabit}>
              <label>
                项目名称
                <input
                  autoFocus
                  maxLength={18}
                  placeholder="例如：喝水、阅读、早点睡"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <div className="form-row">
                <label>
                  每日目标
                  <input
                    min="1"
                    max="99"
                    type="number"
                    value={target}
                    onChange={(event) => setTarget(Number(event.target.value))}
                  />
                </label>
                <label>
                  单位
                  <input maxLength={4} value={unit} onChange={(event) => setUnit(event.target.value)} />
                </label>
              </div>
              <label>
                提醒时间
                <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
              </label>
              <button className="submit-button" type="submit">加入今天</button>
            </form>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
