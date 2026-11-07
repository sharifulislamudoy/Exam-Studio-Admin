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
import { api } from "./api";
import { Button, Field, Status, Panel, Modal } from "./ui";
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
  e instanceof Error ? e.message : "কাজটি সম্পন্ন হয়নি।";
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
  const [tab, setTab] = useState("overview");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<AdminAssessment | null | false>(false);
  const [review, setReview] = useState<Submission | null>(null);
  const [busy, setBusy] = useState(false);
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<UserView>("/me"),
    retry: false,
  });
  const enabled = !!me.data && me.data.role === "TEACHER";
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
        <p>লোড হচ্ছে…</p>
      </main>
    );
  if (!enabled)
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
      <aside>
        <h1>Exam Studio</h1>
        <p className="muted">Teacher dashboard</p>
        <nav>
          {[
            ["overview", "সারসংক্ষেপ"],
            ["assessments", "পরীক্ষা ও হোমওয়ার্ক"],
            ["students", "শিক্ষার্থী"],
            ["review", "নম্বর ও ফলাফল"],
          ].map(([id, t]) => (
            <button
              key={id}
              className={tab === id ? "selected" : ""}
              onClick={() => {
                setTab(id);
                setNotice("");
                setError("");
              }}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="account">
          <b>{me.data?.name}</b>
          <small>{me.data?.email}</small>
          <Button
            secondary
            onClick={() =>
              run(() => api("/auth/logout", "POST", {}), "Signed out")
            }
          >
            Logout
          </Button>
        </div>
      </aside>
      <main>
        <header className="pagehead">
          <div>
            <h2>
              {
                (
                  {
                    overview: "সারসংক্ষেপ",
                    assessments: "পরীক্ষা ও হোমওয়ার্ক",
                    students: "শিক্ষার্থী",
                    review: "নম্বর ও ফলাফল",
                  } as Record<string, string>
                )[tab]
              }
            </h2>
            <p className="muted">
              বাংলাদেশ সময় অনুযায়ী সময় নির্ধারণ করুন। CQ ও homework খাতায় দেখা
              হবে।
            </p>
          </div>
          {tab !== "students" && (
            <Button onClick={() => setEditing(null)}>
              নতুন exam / homework
            </Button>
          )}
        </header>
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
        {tab === "overview" && (
          <>
            <div className="stats">
              {[
                [
                  "অনুমোদিত শিক্ষার্থী",
                  ss.filter((s) => s.status === "APPROVED").length,
                ],
                [
                  "Approval বাকি",
                  ss.filter((s) => s.status === "PENDING" || s.requestedClass)
                    .length,
                ],
                ["প্রকাশিত কাজ", ee.filter((e) => e.published).length],
                [
                  "খাতা দেখা বাকি",
                  aa.filter(
                    (a) => a.status === "FINISHED" && a.writtenScore === null,
                  ).length,
                ],
              ].map(([title, value]) => (
                <Panel key={title}>
                  <p className="muted">{title}</p>
                  <strong>{value}</strong>
                </Panel>
              ))}
            </div>
            <Panel>
              <h3>কাজের নিয়ম</h3>
              <ol>
                <li>শিক্ষার্থীর signup ও class পরিবর্তন approve করুন।</li>
                <li>
                  প্রশ্ন, সময়, extra time ও pause limit দিয়ে কাজ প্রকাশ করুন।
                </li>
                <li>
                  MCQ স্বয়ংক্রিয়ভাবে হিসাব হবে; লিখিত খাতা দেখে নম্বর দিন।
                </li>
                <li>চূড়ান্ত deadline শেষে ফলাফল প্রকাশ করুন।</li>
              </ol>
            </Panel>
          </>
        )}
        {tab === "students" && (
          <Panel>
            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th>নাম / ইমেইল</th>
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
                        {s.className || "প্রোফাইল অসম্পূর্ণ"}
                        {s.requestedClass && (
                          <small>নতুন class: {s.requestedClass}</small>
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
                                  "শিক্ষার্থী অনুমোদিত হয়েছে।",
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
                                  "Access বন্ধ করা হয়েছে।",
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
                                    "Class পরিবর্তন অনুমোদিত হয়েছে।",
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
                                    "Class পরিবর্তন বাতিল হয়েছে।",
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
              {!ss.length && <p className="empty">এখনও শিক্ষার্থী নেই।</p>}
            </div>
          </Panel>
        )}
        {(tab === "overview" || tab === "assessments") && (
          <Panel>
            <h3>Exam / homework তালিকা</h3>
            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th>শিরোনাম</th>
                    <th>Class / ধরন</th>
                    <th>সময় ও deadline</th>
                    <th>Status / action</th>
                  </tr>
                </thead>
                <tbody>
                  {ee.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <b>{e.title}</b>
                        <small>
                          {e.subject} · {e.totalMarks} নম্বর · {e.questionCount}{" "}
                          প্রশ্ন
                        </small>
                      </td>
                      <td>
                        {e.classNames.join(", ")}
                        <small>
                          {e.kind} · {e.mode}
                        </small>
                      </td>
                      <td>
                        <small>শুরু: {date(e.opensAt)}</small>
                        <small>শেষ: {date(e.closesAt)}</small>
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
                                      "প্রকাশ করলে প্রশ্ন ও সময় আর সম্পাদনা করা যাবে না। প্রকাশ করবেন?",
                                    )
                                  )
                                    void run(
                                      () =>
                                        api(
                                          `/admin/assessments/${e.id}/publish`,
                                          "POST",
                                        ),
                                      "প্রকাশ হয়েছে। নির্বাচিত class-এ notification যোগ হয়েছে।",
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
                <p className="empty">নতুন পরীক্ষা অথবা homework তৈরি করুন।</p>
              )}
            </div>
          </Panel>
        )}
        {tab === "review" && (
          <Panel>
            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th>শিক্ষার্থী / কাজ</th>
                    <th>অবস্থা</th>
                    <th>নম্বর</th>
                    <th>মূল্যায়ন</th>
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
                          Written: {a.writtenScore ?? "বাকি"} / {a.writtenMax}
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
                          নম্বর দিন / দেখুন
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!aa.length && (
                <p className="empty">
                  কোনো শিক্ষার্থী এখনও পরীক্ষা শুরু করেনি।
                </p>
              )}
            </div>
          </Panel>
        )}
        {editing !== false && (
          <Editor
            initial={editing}
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
                "খসড়া সংরক্ষণ হয়েছে।",
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
                "মূল্যায়ন সংরক্ষণ হয়েছে।",
              );
              if (ok) setReview(null);
            }}
          />
        )}
      </main>
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
        <p className="muted">শিক্ষক ড্যাশবোর্ডে প্রবেশ করুন।</p>
        <form className="login-form" onSubmit={login}>
          <Field label="ইমেইল">
            <input
              name="email"
              type="email"
              autoComplete="username"
              maxLength={254}
              required
            />
          </Field>
          <Field label="পাসওয়ার্ড">
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
            {busy ? "প্রবেশ করা হচ্ছে…" : "লগইন"}
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
    subject: e?.subject || "গণিত",
    classNames: (e?.classNames || ["9"]) as AssessmentInput["classNames"],
    kind: e?.kind || "EXAM",
    mode: e?.mode || "MCQ_CQ",
    instructions: e?.instructions || "MCQ অ্যাপে দাও। লিখিত উত্তর খাতায় রাখো।",
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
  close,
  save,
}: {
  initial: AdminAssessment | null;
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
      title={initial?.id ? "খসড়া সম্পাদনা" : "নতুন exam / homework"}
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
                "সব প্রয়োজনীয় প্রশ্ন, অপশন, নম্বর ও সময় পূরণ করুন।",
            ),
        )}
      >
        <div className="formgrid">
          <Field label="শিরোনাম">
            <input {...f.register("title")} required />
          </Field>
          <Field label="বিষয়">
            <input {...f.register("subject")} required />
          </Field>
          <Field label="কাজের ধরন">
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
          <Field label="প্রশ্নের পদ্ধতি">
            <select
              disabled={data.kind === "HOMEWORK"}
              value={data.mode}
              onChange={(e) => {
                const mode = e.target.value as "MCQ_CQ" | "WRITTEN";
                if (
                  window.confirm(
                    "পদ্ধতি বদলালে বর্তমান প্রশ্নগুলো বদলে যাবে। চালিয়ে যাবেন?",
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
              <option value="WRITTEN">সাধারণ লিখিত প্রশ্ন</option>
            </select>
          </Field>
          <Field label="খোলার সময় (এই কম্পিউটারের সময়)">
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
          <Field label="চূড়ান্ত deadline">
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
            <legend>যে class-এর জন্য</legend>
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
          <Field label="নির্দেশনা">
            <textarea rows={3} {...f.register("instructions")} />
          </Field>
        </div>
        {data.kind === "EXAM" && (
          <>
            <h3>সময় ও pause</h3>
            <div className="formgrid">
              {data.mode === "MCQ_CQ" ? (
                <>
                  {minutes("mcqSeconds", "MCQ মূল সময় (মিনিট)")}
                  {minutes("mcqExtraSeconds", "MCQ extra সময় (মিনিট)")}
                  {minutes("cqSeconds", "CQ সময় (মিনিট)")}
                </>
              ) : (
                minutes("writtenSeconds", "লিখিত সময় (মিনিট)")
              )}
              <Field label="Pause অনুমতি">
                <select
                  value={String(data.allowPause)}
                  onChange={(e) =>
                    f.setValue("allowPause", e.target.value === "true")
                  }
                >
                  <option value="true">অনুমতি থাকবে (Class 3 ছাড়া)</option>
                  <option value="false">অনুমতি থাকবে না</option>
                </select>
              </Field>
              {data.allowPause && (
                <>
                  <Field label="সর্বোচ্চ pause সংখ্যা">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      {...f.register("maxPauseCount", { valueAsNumber: true })}
                    />
                  </Field>
                  {minutes("maxPauseSeconds", "মোট pause সময় (মিনিট)")}
                </>
              )}
            </div>
            <p className="muted">
              Extra সময়েও MCQ উত্তর দেওয়া যাবে। Pause করলে final deadline বাড়বে
              না। MCQ শেষের সঙ্গে সঙ্গে CQ-এর সময় চলবে।
            </p>
          </>
        )}
        <div className="sectionhead">
          <h3>প্রশ্ন</h3>
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
                + লিখিত প্রশ্ন
              </Button>
            )}
          </div>
        </div>
        {fields.map((q, i) => (
          <section className="question" key={q.id}>
            <div className="sectionhead">
              <b>
                প্রশ্ন {i + 1} · {data.questions[i]?.type}
              </b>
              <Button type="button" secondary onClick={() => remove(i)}>
                বাদ দিন
              </Button>
            </div>
            <Field label="প্রশ্নের বিবরণ">
              <textarea
                rows={4}
                required
                {...f.register(`questions.${i}.text`)}
              />
            </Field>
            <Field label="নম্বর">
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
                  {["ক", "খ", "গ", "ঘ"].map((l, j) => (
                    <Field key={l} label={l}>
                      <input
                        required
                        {...f.register(`questions.${i}.options.${j}`)}
                      />
                    </Field>
                  ))}
                </div>
                <Field label="সঠিক উত্তর">
                  <select
                    {...f.register(`questions.${i}.correctIndex`, {
                      valueAsNumber: true,
                    })}
                  >
                    {["ক", "খ", "গ", "ঘ"].map((l, j) => (
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
          মোট নম্বর:{" "}
          {data.questions.reduce((s, q) => s + (Number(q.marks) || 0), 0)}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="formfoot">
          <Button type="button" secondary disabled={busy} onClick={close}>
            বাতিল
          </Button>
          <Button disabled={busy}>
            {busy ? "সংরক্ষণ হচ্ছে…" : "খসড়া সংরক্ষণ"}
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
  async function submit(publish: boolean) {
    setBusy(true);
    try {
      await save({ writtenScore: Number(score), feedback, publish });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="খাতা দেখে নম্বর দিন" onClose={close}>
      <p>
        <b>{a.user.name}</b> · {a.assessment.title}
      </p>
      <p>
        MCQ: {a.mcqScore} · লিখিত পূর্ণমান: {a.writtenMax}
      </p>
      {a.assessment.questions
        .filter((q) => q.type === "MCQ")
        .map((q) => (
          <div className="question" key={q.id}>
            <p>{q.text}</p>
            <small>
              সঠিক: {q.options?.[q.correctIndex ?? -1]} · শিক্ষার্থীর উত্তর:{" "}
              {q.options?.[
                a.answers.find((x) => x.questionId === q.id)?.selectedIndex ??
                  -1
              ] || "দেয়নি"}
            </small>
          </div>
        ))}
      <Field label={`খাতা দেখে মোট লিখিত নম্বর (০–${a.writtenMax})`}>
        <input
          type="number"
          min={0}
          max={a.writtenMax}
          step="0.5"
          value={score}
          onChange={(e) => setScore(e.target.value)}
        />
      </Field>
      <Field label="মন্তব্য">
        <textarea
          rows={4}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
      </Field>
      <p className="muted">
        চূড়ান্ত deadline: {date(a.assessment.closesAt)}। এর পরে ফলাফল প্রকাশ করা
        যাবে।
      </p>
      <div className="formfoot">
        <Button
          secondary
          disabled={busy || score === ""}
          onClick={() => submit(false)}
        >
          নম্বর সংরক্ষণ
        </Button>
        <Button
          disabled={
            busy ||
            score === "" ||
            Date.now() < Date.parse(a.assessment.closesAt)
          }
          onClick={() => submit(true)}
        >
          ফলাফল প্রকাশ
        </Button>
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
    "A5 কাগজের জন্য OK চাপুন। A4-এর জন্য Cancel চাপুন।",
  )
    ? "A5"
    : "A4";
  frame.srcdoc = `<!doctype html><html lang="bn"><head><meta charset="utf-8"><style>@page{size:${paper};margin:12mm}body{font:14px/1.7 Arial,sans-serif;color:#000;background:#fff}h1,h2{text-align:center;margin:0}h1{font-size:20px}h2{font-size:16px}.meta{display:flex;justify-content:space-between;border-bottom:1px solid #000;padding:10px 0}.q{break-inside:avoid;margin:16px 0;white-space:pre-line}.opts{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-weight:normal}</style></head><body><h1>CT Exam</h1><h2>${escape(e.title)}</h2><p style="text-align:center">Class ${e.classNames.join(", ")} · ${escape(e.subject)}</p><div class="meta"><span>সময়: ${e.kind === "EXAM" ? (e.mode === "MCQ_CQ" ? e.mcqSeconds + e.mcqExtraSeconds + e.cqSeconds : e.writtenSeconds) / 60 : "—"} মিনিট</span><span>পূর্ণমান: ${e.totalMarks}</span></div><p>নাম: _____________________ &nbsp; তারিখ: __________</p><p>${escape(e.instructions)}</p>${e.questions.map((q, i) => `<div class="q"><b>${i + 1}. ${escape(q.text)} [${q.marks}]</b>${q.type === "MCQ" ? `<div class="opts">${q.options?.map((o, j) => `<span>${["ক", "খ", "গ", "ঘ"][j]}) ${escape(o)}</span>`).join("")}</div>` : ""}</div>`).join("")}</body></html>`;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60000);
  };
}
