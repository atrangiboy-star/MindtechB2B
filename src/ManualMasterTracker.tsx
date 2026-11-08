import { useEffect, useRef, useState } from "react";
import type { ClipboardEvent, FormEvent } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { Download, Plus, Save, Sigma, Trash2 } from "lucide-react";
import { evaluateFormula } from "./AdvancedWorkspace";

type ColumnKind = "text" | "number" | "date" | "dropdown" | "checkbox" | "formula";
type ManualColumn = { id: string; name: string; kind: ColumnKind; formula: string; options: string[] };
type ManualRow = { id: string; values: Record<string, string | boolean> };
type TrackerConfig = { columns: ManualColumn[]; rows: ManualRow[] };
type Props = { supabase: SupabaseClient | null; user: User; notify: (message: string) => void };
const kinds: { value: ColumnKind; label: string }[] = [
  { value: "text", label: "Text" }, { value: "number", label: "Number" }, { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" }, { value: "checkbox", label: "Checkbox" }, { value: "formula", label: "Formula" },
];
const makeId = () => crypto.randomUUID();
const parseConfig = (raw: any): TrackerConfig => ({
  columns: Array.isArray(raw?.columns) ? raw.columns.filter((column: any) => column && typeof column.id === "string" && typeof column.name === "string").map((column: any) => ({
    id: column.id, name: column.name, kind: kinds.some(kind => kind.value === column.kind) ? column.kind as ColumnKind : "text",
    formula: typeof column.formula === "string" ? column.formula : "", options: Array.isArray(column.options) ? column.options.filter((value: unknown) => typeof value === "string") : [],
  })) : [],
  rows: Array.isArray(raw?.rows) ? raw.rows.filter((row: any) => row && typeof row.id === "string" && row.values && typeof row.values === "object").map((row: any) => ({ id: row.id, values: row.values })) : [],
});

export default function ManualMasterTracker({ supabase, user, notify }: Props) {
  const [columns, setColumns] = useState<ManualColumn[]>([]);
  const [rows, setRows] = useState<ManualRow[]>([]);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [columnName, setColumnName] = useState("");
  const [columnKind, setColumnKind] = useState<ColumnKind>("text");
  const [formula, setFormula] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const revision = useRef(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!supabase) { setReady(true); return; }
      const { data, error } = await supabase.from("saved_views").select("id,configuration").eq("view_type", "master_tracker").order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (!alive) return;
      if (error) notify(`Blank Master Tracker could not load: ${error.message}`);
      if (data) {
        const config = parseConfig(data.configuration);
        setRecordId(String(data.id)); setColumns(config.columns); setRows(config.rows);
      }
      setReady(true);
    };
    void load();
    return () => { alive = false; };
  }, [supabase, user.id, notify]);

  useEffect(() => {
    if (!ready || !dirty || !supabase || saving) return;
    const saveRevision = revision.current;
    const timer = window.setTimeout(async () => {
      setSaving(true);
      const configuration = { columns, rows };
      const result = recordId
        ? await supabase.from("saved_views").update({ name: "Master Tracker", configuration }).eq("id", recordId)
        : await supabase.from("saved_views").insert({ owner_id: user.id, name: "Master Tracker", view_type: "master_tracker", configuration }).select("id").single();
      setSaving(false);
      if (result.error) { setSaveError(true); setDirty(false); notify(`Master Tracker was not saved: ${result.error.message}`); return; }
      if (!recordId && result.data) setRecordId(String(result.data.id));
      setSaveError(false);
      if (revision.current === saveRevision) setDirty(false);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [ready, dirty, columns, rows, recordId, supabase, user.id, notify, saving]);

  const markDirty = () => { revision.current += 1; setSaveError(false); setDirty(true); };
  const addColumn = (event: FormEvent) => {
    event.preventDefault();
    const clean = columnName.trim();
    if (!clean) return;
    const column: ManualColumn = { id: makeId(), name: clean, kind: columnKind, formula: columnKind === "formula" ? formula.trim() : "", options: columnKind === "dropdown" ? optionsText.split(",").map(value => value.trim()).filter(Boolean) : [] };
    setColumns(current => [...current, column]); setColumnName(""); setFormula(""); setOptionsText(""); markDirty();
  };
  const addRow = () => { if (!columns.length) return; setRows(current => [...current, { id: makeId(), values: {} }]); markDirty(); };
  const deleteRow = (rowId: string, rowNumber: number) => {
    if (!window.confirm(`Delete manual row ${rowNumber}?`)) return;
    setRows(current => current.filter(row => row.id !== rowId)); markDirty();
  };
  const updateColumn = (id: string, patch: Partial<ManualColumn>) => { setColumns(current => current.map(column => column.id === id ? { ...column, ...patch } : column)); markDirty(); };
  const updateCell = (rowId: string, columnId: string, value: string | boolean) => {
    setRows(current => current.map(row => row.id === rowId ? { ...row, values: { ...row.values, [columnId]: value } } : row)); markDirty();
  };
  const deleteColumn = (column: ManualColumn) => {
    if (!window.confirm(`Delete the “${column.name}” column and its values?`)) return;
    setColumns(current => current.filter(item => item.id !== column.id));
    setRows(current => current.map(row => { const values = { ...row.values }; delete values[column.id]; return { ...row, values }; })); markDirty();
  };
  const formulaValue = (row: ManualRow, column: ManualColumn) => evaluateFormula(column.formula || "0", Object.fromEntries(columns.map(item => [item.name, row.values[item.id] ?? 0])));
  const handlePaste = (event: ClipboardEvent<HTMLTableElement>) => {
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return;
    const target = event.target as HTMLElement;
    const startRow = Number(target.getAttribute("data-grid-row"));
    const startColumn = Number(target.getAttribute("data-grid-column"));
    if (!Number.isInteger(startRow) || !Number.isInteger(startColumn)) return;
    event.preventDefault();
    const matrix = text.replace(/\r/g, "").split("\n"); if (matrix.at(-1) === "") matrix.pop();
    setRows(current => {
      const next = [...current];
      while (next.length < startRow + matrix.length) next.push({ id: makeId(), values: {} });
      matrix.forEach((line, rowOffset) => line.split("\t").forEach((raw, columnOffset) => {
        const column = columns[startColumn + columnOffset];
        if (!column || column.kind === "formula") return;
        const value = column.kind === "checkbox" ? ["true", "1", "yes", "checked", "✓"].includes(raw.trim().toLocaleLowerCase()) : raw;
        const rowIndex = startRow + rowOffset; next[rowIndex] = { ...next[rowIndex], values: { ...next[rowIndex].values, [column.id]: value } };
      }));
      return next;
    });
    markDirty();
  };
  const exportCsv = () => {
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const matrix = [columns.map(column => column.name), ...rows.map(row => columns.map(column => column.kind === "formula" ? formulaValue(row, column) : row.values[column.id] ?? ""))];
    const csv = matrix.map(line => line.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "master-tracker.csv"; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section className="panel manual-tracker-panel">
    <div className="manual-tracker-heading"><div><div className="reports-eyebrow"><Sigma size={14}/> MANUAL WORKSPACE</div><h2>Master Tracker</h2><p>Blank by design. No department rows, fields, or status logic are copied here.</p></div><div className="manual-tracker-actions"><span className={`manual-save-status ${saving ? "is-saving" : saveError ? "is-error" : ""}`}><Save size={13}/>{!ready ? "Loading…" : saving ? "Saving…" : dirty ? "Unsaved changes" : saveError ? "Save failed" : recordId ? "Saved online" : supabase ? "Blank · ready" : "Online save unavailable"}</span>{saveError && <button className="text-button" onClick={() => { revision.current += 1; setSaveError(false); setDirty(true); }}>Retry save</button>}<button className="secondary-button" onClick={exportCsv} disabled={!ready || !columns.length}><Download size={15}/> Export CSV</button><button className="primary-button" onClick={addRow} disabled={!ready || !columns.length}><Plus size={15}/> Add row</button></div></div>
    <form className="manual-column-form" onSubmit={addColumn}><label>Column name<input maxLength={80} value={columnName} onChange={event => setColumnName(event.target.value)} placeholder="Name this column"/></label><label>Column type<select value={columnKind} onChange={event => setColumnKind(event.target.value as ColumnKind)}>{kinds.map(kind => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label>{columnKind === "formula" && <label className="manual-wide-field">Formula<input value={formula} onChange={event => setFormula(event.target.value)} placeholder="e.g. [Amount] * [Quantity]"/></label>}{columnKind === "dropdown" && <label className="manual-wide-field">Dropdown choices<input value={optionsText} onChange={event => setOptionsText(event.target.value)} placeholder="Open, In progress, Done"/></label>}<button className="secondary-button" disabled={!ready || !columnName.trim()} type="submit"><Plus size={15}/> Add column</button></form>
    {columns.length ? <div className="manual-tracker-scroll"><table className="manual-tracker-grid" onPaste={handlePaste}><thead><tr>{columns.map(column => <th key={column.id}><div className="manual-column-heading"><input aria-label={`Column name: ${column.name}`} value={column.name} onChange={event => updateColumn(column.id, { name: event.target.value })}/><select aria-label={`Column type: ${column.name}`} value={column.kind} onChange={event => updateColumn(column.id, { kind: event.target.value as ColumnKind })}>{kinds.map(kind => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select><button className="icon-button" type="button" title={`Delete ${column.name} column`} aria-label={`Delete ${column.name} column`} onClick={() => deleteColumn(column)}><Trash2 size={14}/></button></div>{column.kind === "formula" && <input className="manual-column-detail" aria-label={`Formula for ${column.name}`} value={column.formula} onChange={event => updateColumn(column.id, { formula: event.target.value })} placeholder="Formula, e.g. [Amount] * [Quantity]"/>}{column.kind === "dropdown" && <input className="manual-column-detail" aria-label={`Choices for ${column.name}`} value={column.options.join(", ")} onChange={event => updateColumn(column.id, { options: event.target.value.split(",").map(value => value.trim()).filter(Boolean) })} placeholder="Comma-separated choices"/>}</th>)}<th className="manual-row-actions-heading" aria-label="Row actions"/></tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={row.id}>{columns.map((column, columnIndex) => <td key={column.id}>{column.kind === "formula" ? <output className="manual-formula-value">{formulaValue(row, column)}</output> : column.kind === "checkbox" ? <input type="checkbox" checked={Boolean(row.values[column.id])} data-grid-row={rowIndex} data-grid-column={columnIndex} aria-label={`${column.name}, row ${rowIndex + 1}`} onChange={event => updateCell(row.id, column.id, event.target.checked)}/> : column.kind === "dropdown" ? <select data-grid-row={rowIndex} data-grid-column={columnIndex} aria-label={`${column.name}, row ${rowIndex + 1}`} value={String(row.values[column.id] ?? "")} onChange={event => updateCell(row.id, column.id, event.target.value)}><option value="">Select…</option>{column.options.map(option => <option key={option}>{option}</option>)}</select> : <input data-grid-row={rowIndex} data-grid-column={columnIndex} aria-label={`${column.name}, row ${rowIndex + 1}`} type={column.kind === "number" ? "number" : column.kind === "date" ? "date" : "text"} value={String(row.values[column.id] ?? "")} onChange={event => updateCell(row.id, column.id, event.target.value)}/>}</td>)}<td className="manual-row-action"><button className="icon-button" type="button" aria-label={`Delete manual row ${rowIndex + 1}`} title="Delete row" onClick={() => deleteRow(row.id, rowIndex + 1)}><Trash2 size={14}/></button></td></tr>)}{rows.length === 0 && <tr><td colSpan={columns.length + 1}><div className="manual-tracker-empty">Your table is blank. Add a row or paste spreadsheet cells into the first row.</div></td></tr>}</tbody></table></div> : <div className="manual-tracker-empty-state"><div><Sigma size={21}/></div><b>No columns or rows have been added.</b><span>Add only the fields and logic you want in this tracker.</span></div>}
    <div className="manual-tracker-footnote">This tracker is separate from department board data. Changes save as a Master Tracker view and do not update department rows.</div>
  </section>;
}
