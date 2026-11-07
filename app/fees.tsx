"use client";

import { useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { UserView } from "./contracts";
import { Button, Field, Modal, Panel, Status } from "./ui";

type Payment = { id: string; amountPaisa: number; method: string; paidOn: string; reference: string; voidedAt: string | null };
type Fee = { id: string; student: Pick<UserView, "id" | "name" | "className">; billedPaisa: number; payments: Payment[] };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const collected = (fee: Fee) => fee.payments.reduce((total, item) => total + (item.voidedAt ? 0 : item.amountPaisa), 0);
const money = (paisa: number) => "৳" + (paisa / 100).toLocaleString("en-BD", { maximumFractionDigits: 2 });
const amount = (value: FormDataEntryValue | null) => Math.round(Number(value) * 100);

export function Fees({ students }: { students: UserView[] }) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [editing, setEditing] = useState<"bill" | "payment" | null>(null);
  const [studentId, setStudentId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pendingPayment = useRef<{ key: string; id: string } | null>(null);
  const query = useQuery({
    queryKey: ["fees", month],
    queryFn: () => api<Fee[]>("/admin/fees?month=" + encodeURIComponent(month)),
  });
  const rows = query.data ?? [];
  const fee = rows.find((item) => item.student.id === studentId);
  const billed = rows.reduce((total, item) => total + item.billedPaisa, 0);
  const received = rows.reduce((total, item) => total + collected(item), 0);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (editing === "bill") {
        await api("/admin/fees/" + encodeURIComponent(studentId) + "/" + month, "PUT", { billedPaisa: amount(form.get("amount")) });
      } else if (fee) {
        const body = {
          amountPaisa: amount(form.get("amount")),
          method: form.get("method"),
          paidOn: form.get("paidOn"),
          reference: String(form.get("reference") ?? "").trim(),
        };
        const key = JSON.stringify([fee.id, body]);
        if (pendingPayment.current?.key !== key) {
          const bytes = crypto.getRandomValues(new Uint8Array(16));
          bytes[6] = (bytes[6] & 15) | 64;
          bytes[8] = (bytes[8] & 63) | 128;
          const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
          pendingPayment.current = { key, id: [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-") };
        }
        await api("/admin/fees/" + fee.id + "/payments", "POST", { ...body, id: pendingPayment.current.id });
        pendingPayment.current = null;
      }
      await query.refetch();
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The fee record could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function voidPayment(feeId: string, paymentId: string) {
    if (busy || !window.confirm("Void this payment? The record stays in the history and the balance is updated.")) return;
    setBusy(true);
    setError("");
    try {
      await api("/admin/fees/" + feeId + "/payments/" + paymentId + "/void", "POST");
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not void the payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel><h2>Monthly fees</h2>
      <Field label="Billing month">
        <input type="month" value={month} onChange={(event) => {
          if (!event.target.value) return;
          setMonth(event.target.value);
          setStudentId("");
        }} />
      </Field>
      {error && !editing && <p className="error" role="alert">{error}</p>}
      {query.isPending && <p>Loading fees…</p>}
      {query.error && <p className="error" role="alert">{query.error.message}</p>}
      {query.data && <>
        <p>Billed <b>{money(billed)}</b> · Collected <b>{money(received)}</b> · Due <b>{money(billed - received)}</b></p>
        <Button onClick={() => { setStudentId(""); setError(""); setEditing("bill"); }}>Set monthly fee</Button>
        {!rows.length && <p>No fees have been set for this month.</p>}
        {rows.map((item) => {
          const paid = collected(item);
          const due = item.billedPaisa - paid;
          return <section className="question" key={item.id}>
            <b>{item.student.name}</b>{item.student.className && " · Class " + item.student.className}
            <p>{money(paid)} collected · {money(due)} due <Status>{due === 0 ? "Paid" : paid > 0 ? "Part paid" : "Unpaid"}</Status></p>
            <div className="formfoot">
              <Button secondary onClick={() => { setStudentId(item.student.id); setError(""); setEditing("bill"); }}>Edit fee</Button>
              {due > 0 && <Button onClick={() => { setStudentId(item.student.id); setError(""); setEditing("payment"); }}>Record payment</Button>}
            </div>
            {item.payments.length > 0 && <details><summary>Payment history</summary><ul>
              {item.payments.map((p) => <li key={p.id}>{p.paidOn} · {money(p.amountPaisa)} · {p.method}{p.reference && " · " + p.reference} {p.voidedAt ? <Status>Voided</Status> : <Button secondary disabled={busy} onClick={() => void voidPayment(item.id, p.id)}>Void</Button>}</li>)}
            </ul></details>}
          </section>;
        })}
      </>}
      {editing && <Modal title={editing === "bill" ? "Set monthly fee" : "Record payment"} onClose={() => { if (!busy) setEditing(null); }}>
        <form onSubmit={save}>
          {editing === "bill" ? <Field label="Student">
            <select required value={studentId} onChange={(event) => setStudentId(event.target.value)}>
              <option value="">Choose a student</option>
              {students.filter((s) => s.status === "APPROVED" || rows.some((item) => item.student.id === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name} · Class {s.className}</option>)}
            </select>
          </Field> : <p>{fee?.student.name} · {month}</p>}
          <Field label="Amount (BDT)">
            <input key={studentId} name="amount" type="number" step="0.01" required min={editing === "payment" ? "0.01" : "0"}
              max={editing === "payment" && fee ? (fee.billedPaisa - collected(fee)) / 100 : 1_000_000}
              defaultValue={editing === "bill" && fee ? fee.billedPaisa / 100 : undefined} />
          </Field>
          {editing === "payment" && <>
            <Field label="Payment method"><select name="method">{["Cash", "bKash", "Nagad", "Bank transfer", "Other"].map((method) => <option key={method}>{method}</option>)}</select></Field>
            <Field label="Payment date"><input name="paidOn" type="date" defaultValue={today()} required /></Field>
            <Field label="Reference or note"><input name="reference" maxLength={200} /></Field>
          </>}
          {error && <p className="error" role="alert">{error}</p>}
          <Button type="submit" disabled={busy || !studentId}>{busy ? "Saving…" : "Save"}</Button>
        </form>
      </Modal>}
    </Panel>
  );
}
