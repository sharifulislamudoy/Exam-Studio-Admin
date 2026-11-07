"use client";

import { useState } from "react";
import type { AssessmentView, UserView } from "./contracts";
import { Field, Panel } from "./ui";

type Submission = {
  status: string;
  finishedAt: string | null;
  revisionFeedback?: string | null;
  writtenScore: number | null;
  mcqScore: number;
  user: UserView;
  assessment: AssessmentView;
};

export function Progress({ students, assessments, submissions }: {
  students: UserView[];
  assessments: AssessmentView[];
  submissions: Submission[];
}) {
  const [studentId, setStudentId] = useState("");
  const student = students.find((item) => item.id === studentId);
  const own = submissions.filter((item) => item.user.id === studentId);
  const submitted = new Map(own.map((item) => [item.assessment.id, item]));
  const completed = own.filter((item) => item.writtenScore !== null && item.revisionFeedback == null);
  const chapters = new Map<string, typeof completed>();
  for (const item of completed) {
    const label = [item.assessment.subject, item.assessment.chapter || "No chapter specified"].join(" · ");
    const group = chapters.get(label) ?? [];
    group.push(item);
    chapters.set(label, group);
  }
  const overdue = student ? assessments.filter((item) =>
    item.published && Date.parse(item.closesAt) < Date.now() &&
    (item.studentIds?.includes(student.id) || item.classNames.includes(student.className ?? "") || submitted.has(item.id)) &&
    (!submitted.has(item.id) || submitted.get(item.id)?.revisionFeedback != null)
  ) : [];

  return <Panel>
    <h2>Student progress</h2>
    <Field label="Student"><select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
      <option value="">Choose a student</option>
      {students.map((item) => <option key={item.id} value={item.id}>{item.name} · Class {item.className ?? "—"}</option>)}
    </select></Field>
    {student && <>
      <h3>Marks by chapter</h3>
      {!chapters.size && <p>No graded work yet.</p>}
      {[...chapters].map(([label, group]) => <details className="question" key={label}>
        <summary>{label} · {group.length} graded</summary>
        <ul>{group.map((item) => <li key={item.assessment.id}>
          {item.assessment.title} · {item.mcqScore + (item.writtenScore ?? 0)} / {item.assessment.totalMarks}
          {item.finishedAt && " · " + new Date(item.finishedAt).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}
        </li>)}</ul>
      </details>)}
      <h3>Overdue work</h3>
      {!overdue.length ? <p>No overdue work for this student's current assignments.</p> :
        <ul>{overdue.map((item) => <li key={item.id}>{item.title} · {submitted.get(item.id)?.revisionFeedback != null ? "Revision pending" : "No submission"}</li>)}</ul>}
    </>}
  </Panel>;
}
