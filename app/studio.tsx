"use client";
import { useState, type FormEvent } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  assessmentSchema,
  CLASSES,
  type AssessmentInput,
  type AssessmentView,
  type QuestionView,
  type UserView,
} from "./contracts";
import { Progress } from "./progress";
import { Routine } from "./routine";
import { Fees } from "./fees";
import { api } from "./api";
import { Button, Field, Status, Panel, Modal } from "./ui";
import {
  DashboardIcon,
  DashboardShell,
  type DashboardTab,
} from "./dashboard-shell";
type AdminAssessment = Omit<AssessmentView, "questions"> & {
  questions: (QuestionView & { correctIndex?: number })[];
};
type Submission = {
  id: string;
  status: string;
  phase: string;
  startedAt: string;
  finishedAt: string | null;
  writtenScore: number | null;
  feedback: string;
  revisionFeedback?: string | null;
  resultPublished: boolean;
  mcqScore: number;
  writtenMax: number;
  totalMax: number;
  user: UserView;
  assessment: AdminAssessment;
  answers: { questionId: string; selectedIndex: number }[];
};
const date = (s: string) =>
  new Date(s).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong.";
export default function Dashboard() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Studio />
    </QueryClientProvider>
  );
}
function Studio() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<DashboardTab>("overview");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<AdminAssessment | null | false>(false);
  const [review, setReview] = useState<Submission | null>(null);
  const [busy, setBusy] = useState(false);
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<UserView | null>("/me"),
    retry: false,
  });
  const teacher = me.data?.role === "TEACHER" ? me.data : null;
  const enabled = teacher !== null;
  const students = useQuery({
    queryKey: ["students"],
    queryFn: () => api<UserView[]>("/admin/students"),
    enabled,
    refetchInterval: 15000,
  });
  const exams = useQuery({
    queryKey: ["exams"],
    queryFn: () => api<AdminAssessment[]>("/assessments"),
    enabled,
    refetchInterval: 15000,
  });
  const attempts = useQuery({
    queryKey: ["attempts"],
    queryFn: () => api<Submission[]>("/admin/submissions"),
    enabled,
    refetchInterval: 15000,
  });
  async function run(task: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    try {
      await task();
      setNotice(success);
      await qc.invalidateQueries();
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (me.isPending)
    return (
      <main className="login">
        <p>Loading…</p>
      </main>
    );
  if (!teacher)
    return (
      <Login
        onSuccess={() => void qc.invalidateQueries({ queryKey: ["me"] })}
      />
    );
  const ss = students.data || [],
    ee = exams.data || [],
    aa = attempts.data || [];
  return (
    <div className="shell">
      <DashboardShell
        teacher={teacher}
        tab={tab}
        onTabChange={(nextTab) => {
          setTab(nextTab);
          setNotice("");
          setError("");
        }}
        onCreate={() => setEditing(null)}
        onLogout={async () => {
          await api("/auth/logout", "POST", {}, false);
          await qc.cancelQueries({ queryKey: ["me"], exact: true });
          qc.setQueryData(["me"], null);
          for (const key of ["students", "exams", "attempts"]) {
            qc.removeQueries({ queryKey: [key], exact: true });
          }
          qc.removeQueries({ queryKey: ["fees"] });
          qc.removeQueries({ queryKey: ["routine"] });
          qc.removeQueries({ queryKey: ["homework-photo"] });
          setTab("overview");
          setNotice("");
          setError("");
        }}
      >
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}
        {[students.error, exams.error, attempts.error]
          .filter(Boolean)
          .map((e, i) => (
            <p className="error" key={i}>
              {message(e)}
            </p>
          ))}
        {tab === "routine" && <Routine students={ss} />}
        {tab === "fees" && teacher.canManageFees && <Fees students={ss} />}
        {tab === "overview" && (
          <>
            <div className="stats">
              {([
                [
                  "users",
                  "Approved students",
                  ss.filter((student) => student.status === "APPROVED").length,
                ],
                [
                  "clock",
                  "Approval pending",
                  ss.filter(
                    (student) => student.status === "PENDING" || student.requestedClass,
                  ).length,
                ],
                [
                  "clipboard",
                  "Published tasks",
                  ee.filter((exam) => exam.published).length,
                ],
                [
                  "chart",
                  "Awaiting review",
                  aa.filter(
                    (attempt) =>
                      attempt.status === "FINISHED" && attempt.writtenScore === null,
                  ).length,
                ],
              ] as const).map(([icon, title, value]) => (
                <Panel key={title}>
                  <span className={`stat-icon stat-${icon}`}>
                    <DashboardIcon name={icon} />
                  </span>
                  <strong>{value.toLocaleString("en-BD")}</strong>
                  <p className="muted">{title}</p>
                </Panel>
              ))}
            </div>
            <Routine students={ss} todayOnly />
          </>
        )}
        {tab === "students" && <Progress students={ss} assessments={ee} submissions={aa} />}
        {tab === "students" && (
          <Panel>
            <div
              className="table-scroll"
              role="region"
              aria-label="Student list"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Name / Email</th>
                    <th>Class</th>
                    <th>Status</th>
                    <th>Approval</th>
                  </tr>
                </thead>
                <tbody>
                  {ss.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <b>{s.name}</b>
                        <small>{s.email}</small>
                        <small>ID: {s.id}</small>
                      </td>
                      <td>
                        {s.className || "Profile incomplete"}
                        {s.requestedClass && (
                          <small>Requested class: {s.requestedClass}</small>
                        )}
                      </td>
                      <td>
                        <Status>{s.status}</Status>
                      </td>
                      <td>
                        <div className="actions">
                          {s.status !== "APPROVED" && (
                            <Button
                              disabled={busy || !s.profileComplete}
                              onClick={() =>
                                run(
                                  () =>
                                    api(
                                      `/admin/students/${s.id}/decision`,
                                      "POST",
                                      { action: "APPROVE" },
                                    ),
                                  "Student approved.",
                                )
                              }
                            >
                              Approve
                            </Button>
                          )}
                          {s.status !== "REJECTED" && (
                            <Button
                              secondary
                              disabled={busy}
                              onClick={() =>
                                run(
                                  () =>
                                    api(
                                      `/admin/students/${s.id}/decision`,
                                      "POST",
                                      { action: "REJECT" },
                                    ),
                                  "Access Disabled.",
                                )
                              }
                            >
                              Reject
                            </Button>
                          )}
                          {s.requestedClass && (
                            <>
                              <Button
                                disabled={busy}
                                onClick={() =>
                                  run(
                                    () =>
                                      api(
                                        `/admin/students/${s.id}/decision`,
                                        "POST",
                                        { action: "APPROVE_CLASS" },
                                      ),
                                    "Class Class change approved.",
                                  )
                                }
                              >
                                Approve class
                              </Button>
                              <Button
                                secondary
                                disabled={busy}
                                onClick={() =>
                                  run(
                                    () =>
                                      api(
                                        `/admin/students/${s.id}/decision`,
                                        "POST",
                                        { action: "REJECT_CLASS" },
                                      ),
                                    "Class Class change declined.",
                                  )
                                }
                              >
                                Reject class
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!ss.length && <p className="empty">No students yet.</p>}
            </div>
          </Panel>
        )}
        {(tab === "overview" || tab === "assessments") && (
          <Panel>
            <h3>Exam / homework List</h3>
            <div
              className="table-scroll"
              role="region"
              aria-label="Exams and homework"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Class / Type</th>
                    <th>Schedule</th>
                    <th>Status / action</th>
                  </tr>
                </thead>
                <tbody>
                  {ee.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <b>{e.title}</b>
                        <small>
                          {e.subject} · {e.totalMarks} marks · {e.questionCount}{" "}
                          Question
                        </small>
                      </td>
                      <td>
                        {e.classNames.join(", ")}{Boolean(e.studentIds?.length) && (e.classNames.length ? " + " : "") + e.studentIds!.length + " selected"}
                        <small>
                          {e.kind} · {e.mode}
                        </small>
                      </td>
                      <td>
                        <small>Start: {date(e.opensAt)}</small>
                        <small>End: {date(e.closesAt)}</small>
                        {e.kind === "EXAM" && (
                          <small>
                            {e.mode === "MCQ_CQ"
                              ? `MCQ ${e.mcqSeconds / 60}+${e.mcqExtraSeconds / 60} min · CQ ${e.cqSeconds / 60} min`
                              : `Written ${e.writtenSeconds / 60} min`}
                          </small>
                        )}
                      </td>
                      <td>
                        <Status>{e.published ? "Published" : "Draft"}</Status>
                        <div className="actions">
                          {!e.published && (
                            <>
                              <Button secondary onClick={() => setEditing(e)}>
                                Edit
                              </Button>
                              <Button
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "Publishing locks the questions and schedule. Publish this assessment?",
                                    )
                                  )
                                    void run(
                                      () =>
                                        api(
                                          `/admin/assessments/${e.id}/publish`,
                                          "POST",
                                        ),
                                      "Published and sent to the assigned students.",
                                    );
                                }}
                              >
                                Publish
                              </Button>
                            </>
                          )}
                          <Button
                            secondary
                            onClick={() =>
                              setEditing({
                                ...e,
                                id: "",
                                published: false,
                                title: e.title + " — Copy",
                                opensAt: new Date().toISOString(),
                                closesAt: new Date(
                                  Date.now() + 86400000,
                                ).toISOString(),
                              })
                            }
                          >
                            Copy
                          </Button>
                          <Button secondary onClick={() => printExam(e)}>
                            Print
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!ee.length && (
                <p className="empty">Create an exam or homework assignment.</p>
              )}
            </div>
          </Panel>
        )}
        {tab === "review" && (
          <Panel>
            <div
              className="table-scroll"
              role="region"
              aria-label="Submissions"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Student / Task</th>
                    <th>Status</th>
                    <th>marks</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {aa.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <b>
                          {a.user.name} · Class {a.user.className}
                        </b>
                        <small>{a.assessment.title}</small>
                      </td>
                      <td>
                        <Status>{a.status}</Status>
                        <small>{a.phase}</small>
                        {a.finishedAt && <small>{date(a.finishedAt)}</small>}
                      </td>
                      <td>
                        MCQ: {a.mcqScore}
                        <small>
                          Written: {a.writtenScore ?? "remaining"} / {a.writtenMax}
                        </small>
                        <small>
                          {a.resultPublished ? "Published" : "Not published"}
                        </small>
                      </td>
                      <td>
                        <Button
                          secondary
                          disabled={a.status !== "FINISHED"}
                          onClick={() => setReview(a)}
                        >
                          Review submission
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!aa.length && (
                <p className="empty">
                  No student has started yet.
                </p>
              )}
            </div>
          </Panel>
        )}
        {editing !== false && (
          <Editor
            initial={editing}
            students={ss}
            close={() => setEditing(false)}
            save={async (body) => {
              const ok = await run(
                () =>
                  api(
                    editing?.id
                      ? `/admin/assessments/${editing.id}`
                      : "/admin/assessments",
                    editing?.id ? "PUT" : "POST",
                    body,
                  ),
                "Draft saved.",
              );
              if (ok) setEditing(false);
            }}
          />
        )}
        {review && (
          <Grade
            item={review}
            close={() => setReview(null)}
            save={async (body) => {
              const ok = await run(
                () =>
                  api(`/admin/submissions/${review.id}/grade`, "POST", body),
                "Review saved.",
              );
              if (ok) setReview(null);
            }}
          />
        )}
      </DashboardShell>
    </div>
  );
}
function Login({ onSuccess }: { onSuccess: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(
        "/auth/login",
        "POST",
        {
          email: fields.get("email"),
          password: fields.get("password"),
          platform: "web",
        },
        false,
      );
      onSuccess();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <Panel>
        <h1>Exam Studio</h1>
        <p className="muted">Sign in to the teacher dashboard.</p>
        <form className="login-form" onSubmit={login}>
          <Field label="Email">
            <input
              name="email"
              type="email"
              autoComplete="username"
              maxLength={254}
              required
            />
          </Field>
          <Field label="Password">
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={128}
              required
            />
          </Field>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Panel>
    </main>
  );
}
const newQuestion = (
  type: "MCQ" | "CQ" | "WRITTEN",
): AssessmentInput["questions"][number] => ({
  type,
  text: "",
  marks: type === "MCQ" ? 1 : 10,
  ...(type === "MCQ" ? { options: ["", "", "", ""], correctIndex: 0 } : {}),
});
function initialForm(e: AdminAssessment | null): AssessmentInput {
  return {
    title: e?.title || "",
    subject: e?.subject || "Mathematics",
    chapter: e?.chapter || "",
    classNames: (e?.classNames || ["9"]) as AssessmentInput["classNames"],
    studentIds: e?.studentIds ?? [],
    homeworkMethod: e?.homeworkMethod ?? "NOTEBOOK",
    kind: e?.kind || "EXAM",
    mode: e?.mode || "MCQ_CQ",
    instructions: e?.instructions || "MCQ in the app. Write your answers in your notebook.",
    opensAt: e?.opensAt || new Date().toISOString(),
    closesAt: e?.closesAt || new Date(Date.now() + 10 * 3600000).toISOString(),
    mcqSeconds: e?.mcqSeconds ?? 1200,
    mcqExtraSeconds: e?.mcqExtraSeconds ?? 300,
    cqSeconds: e?.cqSeconds ?? 3600,
    writtenSeconds: e?.writtenSeconds ?? 3600,
    allowPause: e?.allowPause ?? true,
    maxPauseCount: e?.maxPauseCount ?? 2,
    maxPauseSeconds: e?.maxPauseSeconds ?? 600,
    questions: e?.questions.map((q) => ({
      type: q.type,
      text: q.text,
      marks: q.marks,
      ...(q.type === "MCQ"
        ? { options: q.options, correctIndex: q.correctIndex }
        : {}),
    })) || [newQuestion("MCQ"), newQuestion("CQ")],
  };
}
function Editor({
  initial,
  students,
  close,
  save,
}: {
  initial: AdminAssessment | null;
  students: UserView[];
  close: () => void;
  save: (data: AssessmentInput) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const f = useForm<AssessmentInput>({
    resolver: zodResolver(assessmentSchema),
    defaultValues: initialForm(initial),
  });
  const { fields, append, remove, replace } = useFieldArray({
    control: f.control,
    name: "questions",
  });
  const data = f.watch();
  const busy = f.formState.isSubmitting;
  const local = (s: string) => {
    const d = new Date(s);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  const minutes = (
    key:
      | "mcqSeconds"
      | "mcqExtraSeconds"
      | "cqSeconds"
      | "writtenSeconds"
      | "maxPauseSeconds",
    label: string,
  ) => (
    <Field label={label}>
      <input
        type="number"
        min="0"
        max="360"
        step="0.5"
        value={data[key] / 60}
        onChange={(e) => f.setValue(key, Number(e.target.value) * 60)}
      />
    </Field>
  );
  return (
    <Modal
      title={initial?.id ? "Edit draft" : "Create task"}
      onClose={close}
    >
      <form
        onSubmit={f.handleSubmit(
          async (v) => {
            setError("");
            try {
              await save(v);
            } catch (e) {
              setError(message(e));
            }
          },
          (errors) =>
            setError(
              Object.values(errors)
                .map((e) => e.message)
                .filter(Boolean)
                .join("; ") ||
                "Complete the required questions, options, marks and times.",
            ),
        )}
      >
        <div className="formgrid">
          <Field label="Title">
            <input {...f.register("title")} required />
          </Field>
          <Field label="Subject">
            <input {...f.register("subject")} required />
          </Field>
          <Field label="Task type">
            <select
              value={data.kind}
              onChange={(e) => {
                const kind = e.target.value as "EXAM" | "HOMEWORK";
                f.setValue("kind", kind);
                if (kind === "HOMEWORK") {
                  f.setValue("mode", "WRITTEN");
                  replace([newQuestion("WRITTEN")]);
                }
              }}
            >
              <option value="EXAM">Exam</option>
              <option value="HOMEWORK">Homework</option>
            </select>
          </Field>
          <Field label="Question format">
            <select
              disabled={data.kind === "HOMEWORK"}
              value={data.mode}
              onChange={(e) => {
                const mode = e.target.value as "MCQ_CQ" | "WRITTEN";
                if (
                  window.confirm(
                    "Changing the format replaces the current questions. Continue?",
                  )
                ) {
                  f.setValue("mode", mode);
                  replace(
                    mode === "MCQ_CQ"
                      ? [newQuestion("MCQ"), newQuestion("CQ")]
                      : [newQuestion("WRITTEN")],
                  );
                }
              }}
            >
              <option value="MCQ_CQ">MCQ → CQ</option>
              <option value="WRITTEN">Written only</option>
            </select>
          </Field>
          <Field label="Opens at (local time)">
            <input
              type="datetime-local"
              required
              value={local(data.opensAt)}
              onChange={(e) =>
                e.target.value &&
                f.setValue("opensAt", new Date(e.target.value).toISOString())
              }
            />
          </Field>
          <Field label="Final deadline">
            <input
              type="datetime-local"
              required
              value={local(data.closesAt)}
              onChange={(e) =>
                e.target.value &&
                f.setValue("closesAt", new Date(e.target.value).toISOString())
              }
            />
          </Field>
          <fieldset className="wide">
            <legend>Assign to classes</legend>
            <div className="checks">
              {CLASSES.map((c) => (
                <label key={c}>
                  <input
                    type="checkbox"
                    value={c}
                    {...f.register("classNames")}
                  />{" "}
                  Class {c}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="wide">
            <legend>Individual students</legend>
            <p className="muted">Select students, classes, or both.</p>
            <div className="checks">
              {students.filter((student) => student.status === "APPROVED" || data.studentIds?.includes(student.id)).map((student) => (
                <label key={student.id}>
                  <input type="checkbox" checked={data.studentIds?.includes(student.id) ?? false}
                    onChange={(event) => {
                      const current = data.studentIds ?? [];
                      f.setValue("studentIds", event.target.checked ? [...current, student.id] : current.filter((id) => id !== student.id));
                    }} />
                  {" "}{student.name} · Class {student.className}
                </label>
              ))}
            </div>
          </fieldset>
          {data.kind === "HOMEWORK" && <Field label="Submission method">
            <select {...f.register("homeworkMethod")}>
              <option value="NOTEBOOK">Bring your notebook</option>
              <option value="PHOTO">Submit a photo</option>
            </select>
          </Field>}
          <Field label="Chapter"><input {...f.register("chapter")} maxLength={120} placeholder="e.g. Chapter 16.2" /></Field>
          <Field label="Instructions">
            <textarea rows={3} {...f.register("instructions")} />
          </Field>
        </div>
        {data.kind === "EXAM" && (
          <>
            <h3>Timing and pauses</h3>
            <div className="formgrid">
              {data.mode === "MCQ_CQ" ? (
                <>
                  {minutes("mcqSeconds", "MCQ Main time (min)")}
                  {minutes("mcqExtraSeconds", "MCQ extra Time (min)")}
                  {minutes("cqSeconds", "CQ Time (min)")}
                </>
              ) : (
                minutes("writtenSeconds", "Written time (min)")
              )}
              <Field label="Pause Permission">
                <select
                  value={String(data.allowPause)}
                  onChange={(e) =>
                    f.setValue("allowPause", e.target.value === "true")
                  }
                >
                  <option value="true">Allowed for Classes 8, 9 and 11</option>
                  <option value="false">Disabled</option>
                </select>
              </Field>
              {data.allowPause && (
                <>
                  <Field label="Maximum pauses">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      {...f.register("maxPauseCount", { valueAsNumber: true })}
                    />
                  </Field>
                  {minutes("maxPauseSeconds", "Total pause time (min)")}
                </>
              )}
            </div>
            <p className="muted">
              Extra also allows MCQ answers. Pausing does not extend the final deadline
              . The written timer starts as soon as the MCQ section ends.
            </p>
          </>
        )}
        <div className="sectionhead">
          <h3>Question</h3>
          <div className="actions">
            {data.mode === "MCQ_CQ" && data.kind === "EXAM" ? (
              <>
                <Button
                  type="button"
                  secondary
                  onClick={() => append(newQuestion("MCQ"))}
                >
                  + MCQ
                </Button>
                <Button
                  type="button"
                  secondary
                  onClick={() => append(newQuestion("CQ"))}
                >
                  + CQ
                </Button>
              </>
            ) : (
              <Button
                type="button"
                secondary
                onClick={() => append(newQuestion("WRITTEN"))}
              >
                + Written questions
              </Button>
            )}
          </div>
        </div>
        {fields.map((q, i) => (
          <section className="question" key={q.id}>
            <div className="sectionhead">
              <b>
                Question {i + 1} · {data.questions[i]?.type}
              </b>
              <Button type="button" secondary onClick={() => remove(i)}>
                Remove
              </Button>
            </div>
            <Field label="Question details">
              <textarea
                rows={4}
                required
                {...f.register(`questions.${i}.text`)}
              />
            </Field>
            <Field label="marks">
              <input
                type="number"
                min="0.5"
                max="100"
                step="0.5"
                required
                {...f.register(`questions.${i}.marks`, { valueAsNumber: true })}
              />
            </Field>
            {data.questions[i]?.type === "MCQ" && (
              <>
                <div className="formgrid">
                  {["A", "B", "C", "D"].map((l, j) => (
                    <Field key={l} label={l}>
                      <input
                        required
                        {...f.register(`questions.${i}.options.${j}`)}
                      />
                    </Field>
                  ))}
                </div>
                <Field label="Correct answer">
                  <select
                    {...f.register(`questions.${i}.correctIndex`, {
                      valueAsNumber: true,
                    })}
                  >
                    {["A", "B", "C", "D"].map((l, j) => (
                      <option value={j} key={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
          </section>
        ))}
        <p>
          Total marks:{" "}
          {data.questions.reduce((s, q) => s + (Number(q.marks) || 0), 0)}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="formfoot">
          <Button type="button" secondary disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button disabled={busy}>
            {busy ? "Saving…" : "Save draft"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function Grade({
  item: a,
  close,
  save,
}: {
  item: Submission;
  close: () => void;
  save: (b: unknown) => Promise<void>;
}) {
  const [score, setScore] = useState(String(a.writtenScore ?? ""));
  const [feedback, setFeedback] = useState(a.feedback);
  const [busy, setBusy] = useState(false);
  const photo = useQuery({
    queryKey: ["homework-photo", a.id],
    queryFn: () => api<{ photo: string | null }>("/admin/submissions/" + a.id + "/photo"),
    enabled: a.assessment.homeworkMethod === "PHOTO",
    staleTime: 0,
    gcTime: 0,
  });
  async function submit(publish: boolean, needsRevision = false) {
    setBusy(true);
    try {
      await save({ writtenScore: Number(score), feedback, publish, needsRevision });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Review written answers" onClose={close}>
      <p>
        <b>{a.user.name}</b> · {a.assessment.title}
      </p>
      <p>
        MCQ: {a.mcqScore} · Written maximum: {a.writtenMax}
      </p>
      {photo.isFetching && <p>Loading submission photo…</p>}
      {photo.error && <p className="error">{photo.error.message}</p>}
      {!photo.isFetching && photo.data?.photo && <img src={"data:image/jpeg;base64," + photo.data.photo} alt="Submitted homework" style={{ maxWidth: "100%", maxHeight: 480, objectFit: "contain" }} />}
      {a.revisionFeedback !== null && a.revisionFeedback !== undefined && <p>Awaiting resubmission · {a.revisionFeedback}</p>}
      {a.assessment.questions
        .filter((q) => q.type === "MCQ")
        .map((q) => (
          <div className="question" key={q.id}>
            <p>{q.text}</p>
            <small>
              Correct: {q.options?.[q.correctIndex ?? -1]} · Student answer:{" "}
              {q.options?.[
                a.answers.find((x) => x.questionId === q.id)?.selectedIndex ??
                  -1
              ] || "Unanswered"}
            </small>
          </div>
        ))}
      <Field label={`Written score (0–${a.writtenMax})`}>
        <input
          type="number"
          min={0}
          max={a.writtenMax}
          step="0.5"
          value={score}
          onChange={(e) => setScore(e.target.value)}
        />
      </Field>
      <Field label="Feedback">
        <textarea
          rows={4}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
      </Field>
      <p className="muted">
        Final deadline: {date(a.assessment.closesAt)}. Results can be published after this deadline.

      </p>
      <div className="formfoot">
        <Button
          secondary
          disabled={busy || score === "" || a.revisionFeedback != null}
          onClick={() => submit(false)}
        >
          Save marks
        </Button>
        <Button
          disabled={
            busy ||
            score === "" || a.revisionFeedback != null ||
            Date.now() < Date.parse(a.assessment.closesAt)
          }
          onClick={() => submit(true)}
        >
          Publish results
        </Button>
        {a.assessment.kind === "HOMEWORK" && !a.resultPublished && Date.now() < Date.parse(a.assessment.closesAt) &&
          <Button secondary disabled={busy || !feedback.trim()} onClick={() => submit(false, true)}>Request revision</Button>}
      </div>
    </Modal>
  );
}
function printExam(e: AdminAssessment) {
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const paper = window.confirm(
    "A5 Select OK for A5 or Cancel for A4.",
  )
    ? "A5"
    : "A4";
  frame.srcdoc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>@page{size:${paper};margin:12mm}body{font:14px/1.7 Arial,sans-serif;color:#000;background:#fff}h1,h2{text-align:center;margin:0}h1{font-size:20px}h2{font-size:16px}.meta{display:flex;justify-content:space-between;border-bottom:1px solid #000;padding:10px 0}.q{break-inside:avoid;margin:16px 0;white-space:pre-line}.opts{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-weight:normal}</style></head><body><h1>CT Exam</h1><h2>${escape(e.title)}</h2><p style="text-align:center">Class ${e.classNames.join(", ")} · ${escape(e.subject)}</p><div class="meta"><span>Time: ${e.kind === "EXAM" ? (e.mode === "MCQ_CQ" ? e.mcqSeconds + e.mcqExtraSeconds + e.cqSeconds : e.writtenSeconds) / 60 : "—"} min</span><span>Total marks: ${e.totalMarks}</span></div><p>Name: _____________________ &nbsp; Date: __________</p><p>${escape(e.instructions)}</p>${e.questions.map((q, i) => `<div class="q"><b>${i + 1}. ${escape(q.text)} [${q.marks}]</b>${q.type === "MCQ" ? `<div class="opts">${q.options?.map((o, j) => `<span>${["A", "B", "C", "D"][j]}) ${escape(o)}</span>`).join("")}</div>` : ""}</div>`).join("")}</body></html>`;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60000);
  };
}
