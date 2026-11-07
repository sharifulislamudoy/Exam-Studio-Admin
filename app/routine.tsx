"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { UserView } from "./contracts";
import { Button, Field, Modal, Panel } from "./ui";

type Entry = { date: string; status: "PRESENT" | "ABSENT" | "RESCHEDULED"; movedTo: string | null };
type Lesson = { id: string; weekday: number; startsAt: string; minutes: number; subject: string; active: boolean; student: { name: string }; attendance: Entry[] };
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dhakaNow = () => new Date(Date.now() + 6 * 3600000);
const dateLabel = (date: string) => new Date(date).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });

export function Routine({ students, todayOnly = false }: { students: UserView[]; todayOnly?: boolean }) {
  const [dialog, setDialog] = useState<"add" | Lesson | null>(null);
  const [status, setStatus] = useState<Entry["status"]>("PRESENT");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: ["routine"], queryFn: () => api<Lesson[]>("/admin/routine") });
  const today = dhakaNow().toISOString().slice(0, 10);
  const weekday = dhakaNow().getUTCDay();
  const lessons = query.data ?? [];
  const todayLessons = lessons.flatMap((lesson) => {
    const entry = lesson.attendance.find((a) => a.date === today);
    const recurring = lesson.active && lesson.weekday === weekday && !entry?.movedTo;
    const moved = lesson.attendance.filter((a) => a.movedTo && new Date(Date.parse(a.movedTo) + 6 * 3600000).toISOString().slice(0, 10) === today);
    return [
      ...(recurring ? [{ key: lesson.id, lesson, time: lesson.startsAt }] : []),
      ...moved.map((a) => ({ key: lesson.id + a.date, lesson, time: new Date(Date.parse(a.movedTo!) + 6 * 3600000).toISOString().slice(11, 16) })),
    ];
  }).sort((a, b) => a.time.localeCompare(b.time));

  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await task();
      await query.refetch();
      setDialog(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the lesson.");
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || busy) return;
    const form = new FormData(event.currentTarget);
    if (dialog === "add") {
      void run(() => api("/admin/routine", "POST", {
        studentId: form.get("studentId"),
        weekday: Number(form.get("weekday")),
        startsAt: form.get("startsAt"),
        minutes: Number(form.get("minutes")),
        subject: form.get("subject"),
      }));
    } else {
      const date = form.get("date");
      const movedTo = form.get("movedTo");
      void run(() => api("/admin/routine/" + dialog.id + "/attendance", "PUT", {
        date, status, ...(status === "RESCHEDULED" ? { movedTo: movedTo + ":00+06:00" } : {}),
      }));
    }
  }

  if (todayOnly) return <Panel>
    <h3>Today's lessons</h3>
    {query.isPending ? <p>Loading…</p> : query.error ? <p role="alert">{query.error.message}</p> : todayLessons.length ?
      <ul>{todayLessons.map(({ key, lesson, time }) => <li key={key}>{time} · {lesson.student.name} · {lesson.subject}</li>)}</ul> :
      <p>No lessons scheduled today.</p>}
  </Panel>;

  return <Panel>
    <h2>Weekly routine</h2>
    <p className="muted">All times are in Bangladesh time.</p>
    <Button onClick={() => { setError(""); setDialog("add"); }}>Add lesson</Button>
    {query.isPending && <p>Loading lessons…</p>}
    {query.error && <p role="alert">{query.error.message}</p>}
    {error && !dialog && <p className="error" role="alert">{error}</p>}
    {query.data && !lessons.length && <p>No lessons scheduled.</p>}
    {lessons.map((item) => <section key={item.id} className="question">
      <b>{item.student.name} · {item.subject}</b>
      <p>{weekdays[item.weekday]} · {item.startsAt} · {item.minutes} min{!item.active && " · Archived"}</p>
      {item.active && <div className="formfoot">
        <Button secondary disabled={busy} onClick={() => { setStatus("PRESENT"); setError(""); setDialog(item); }}>Attendance or reschedule</Button>
        <Button secondary disabled={busy} onClick={() => {
          if (window.confirm("Stop repeating this weekly lesson? Existing attendance stays in the history."))
            void run(() => api("/admin/routine/" + item.id + "/archive", "POST", {}));
        }}>Archive</Button>
      </div>}
      {item.attendance.length > 0 && <details><summary>Recent attendance and changes</summary>
        <ul>{item.attendance.map((a) => <li key={a.date}>{a.date} · {a.status === "RESCHEDULED" && a.movedTo ? "Moved to " + dateLabel(a.movedTo) : a.status === "PRESENT" ? "Present" : "Absent"}</li>)}</ul>
      </details>}
    </section>)}
    {dialog && <Modal title={dialog === "add" ? "Add weekly lesson" : "Attendance or reschedule"} onClose={() => { if (!busy) setDialog(null); }}>
      <form onSubmit={save}>
        {dialog === "add" ? <>
          <Field label="Student"><select name="studentId" required defaultValue=""><option value="">Choose a student</option>
            {students.filter((s) => s.status === "APPROVED" && s.profileComplete).map((s) => <option key={s.id} value={s.id}>{s.name} · Class {s.className}</option>)}
          </select></Field>
          <Field label="Subject"><input name="subject" required maxLength={80} /></Field>
          <Field label="Day"><select name="weekday">{weekdays.map((day, i) => <option key={day} value={i}>{day}</option>)}</select></Field>
          <Field label="Start time (Bangladesh)"><input name="startsAt" type="time" required /></Field>
          <Field label="Duration (minutes)"><input name="minutes" type="number" min={5} max={480} defaultValue={60} required /></Field>
        </> : <>
          <Field label="Original lesson date"><input name="date" type="date" defaultValue={today} required /></Field>
          <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value as Entry["status"])}>
            <option value="PRESENT">Present</option><option value="ABSENT">Absent</option><option value="RESCHEDULED">Reschedule</option>
          </select></Field>
          {status === "RESCHEDULED" && <Field label="New time (Bangladesh)"><input name="movedTo" type="datetime-local" required /></Field>}
        </>}
        {error && <p className="error" role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </form>
    </Modal>}
  </Panel>;
}
