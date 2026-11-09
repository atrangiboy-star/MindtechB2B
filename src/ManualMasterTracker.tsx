import { useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { Check, ChevronDown, Download, Filter, Layers3, Save, Search, Table2 } from "lucide-react";

type BoardSource = { id: string; name: string; departmentName: string };
type BoardColumn = { id: string; board_id: string; name: string; column_type: string; is_hidden?: boolean };
type TrackerTask = {
  id: string; board_id?: string; title?: string; department?: string; owner?: string; status?: string; priority?: string;
  due?: string | null; progress?: number; description?: string; links?: string[]; attachments?: { name?: string }[];
  custom_fields?: Record<string, unknown>; created_at?: string; updated_at?: string;
};
type Props = { supabase: SupabaseClient | null; user: User; tasks: TrackerTask[]; notify: (message: string) => void };
type FieldChoice = { key: string; name: string; kind: string; boardId?: string; boardName?: string };

const trackerKind = "mindtech_manual_master_tracker";
const systemFields: FieldChoice[] = [
  { key: "sys:title", name: "Task", kind: "text" }, { key: "sys:department", name: "Department", kind: "text" },
  { key: "sys:owner", name: "Owner", kind: "people" }, { key: "sys:status", name: "Status", kind: "status" },
  { key: "sys:priority", name: "Priority", kind: "priority" }, { key: "sys:due", name: "Due date", kind: "date" },
  { key: "sys:progress", name: "Progress", kind: "progress" }, { key: "sys:description", name: "Description", kind: "long text" },
  { key: "sys:links", name: "Links", kind: "links" }, { key: "sys:attachments", name: "Attachments", kind: "files" },
  { key: "sys:created_at", name: "Created", kind: "date" }, { key: "sys:updated_at", name: "Updated", kind: "date" },
];
const asStrings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const formatValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(item => typeof item === "object" && item && "name" in item ? String((item as { name: unknown }).name) : String(item)).join(", ") || "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};
const readField = (task: TrackerTask, field: FieldChoice) => {
  if (field.key.startsWith("col:")) return task.custom_fields?.[field.key.slice(4)];
  switch (field.key) {
    case "sys:title": return task.title;
    case "sys:department": return task.department;
    case "sys:owner": return task.owner;
    case "sys:status": return task.status;
    case "sys:priority": return task.priority;
    case "sys:due": return task.due;
    case "sys:progress": return task.progress === undefined ? undefined : `${task.progress}%`;
    case "sys:description": return task.description;
    case "sys:links": return task.links;
    case "sys:attachments": return task.attachments;
    case "sys:created_at": return task.created_at;
    case "sys:updated_at": return task.updated_at;
    default: return undefined;
  }
};
const downloadCsv = (name: string, fields: FieldChoice[], sources: BoardSource[], tasks: TrackerTask[]) => {
  const selectedSources = new Map(sources.map(source => [source.id, source]));
  const headings = ["Department", "Table", ...fields.map(field => field.boardName ? `${field.name} (${field.boardName})` : field.name)];
  const escape = (value: unknown) => `"${formatValue(value).replace(/"/g, '""')}"`;
  const rows = tasks.filter(task => task.board_id && selectedSources.has(task.board_id)).map(task => {
    const source = selectedSources.get(task.board_id!)!;
    // Keep CSV columns aligned when each department table has different custom headers.
    const aligned = fields.map(field => field.boardId && field.boardId !== source.id ? "\"\"" : escape(readField(task, field)));
    return [escape(source.departmentName), escape(source.name), ...aligned];
  });
  const csv = [headings.map(escape).join(","), ...rows.map(row => row.join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function ManualMasterTracker({ supabase, user, tasks, notify }: Props) {
  const [sources, setSources] = useState<BoardSource[]>([]);
  const [boardColumns, setBoardColumns] = useState<BoardColumn[]>([]);
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([]);
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [legacyConfig, setLegacyConfig] = useState<Record<string, unknown>>({});
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [sourceSearch, setSourceSearch] = useState("");
  const [fieldSearch, setFieldSearch] = useState("");
  const [rowSearch, setRowSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(true);
  const revision = useRef(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!supabase) { setReady(true); notify("Master Tracker needs an online workspace connection."); return; }
      const [{ data: boardRows, error: boardError }, { data: departmentRows, error: departmentError }, { data: columnRows, error: columnError }, { data: storedViews, error: viewError }] = await Promise.all([
        supabase.from("boards").select("id,name,department_id").order("created_at"),
        supabase.from("departments").select("id,name,is_active"),
        supabase.from("board_columns").select("id,board_id,name,column_type,is_hidden").order("position"),
        supabase.from("saved_views").select("id,configuration").eq("view_type", "table").eq("name", "Master Tracker").order("created_at", { ascending: true }),
      ]);
      if (!alive) return;
      if (boardError) notify(`Department tables could not be loaded: ${boardError.message}`);
      if (departmentError) notify(`Department names could not be loaded: ${departmentError.message}`);
      if (columnError) notify(`Table fields could not be loaded: ${columnError.message}`);
      if (viewError) notify(`Master Tracker selection could not be loaded: ${viewError.message}`);
      const deptNames = new Map((departmentRows ?? []).map(row => [String(row.id), String(row.name)]));
      const loadedSources = (boardRows ?? []).map(row => ({ id: String(row.id), name: String(row.name), departmentName: row.department_id ? deptNames.get(String(row.department_id)) ?? "Other" : "Other" }));
      const loadedColumns = (columnRows ?? []).map(row => ({ ...row, id: String(row.id), board_id: String(row.board_id), name: String(row.name), column_type: String(row.column_type), is_hidden: Boolean(row.is_hidden) })) as BoardColumn[];
      setSources(loadedSources); setBoardColumns(loadedColumns);
      const stored = (storedViews ?? []).find(view => view.configuration?.kind === trackerKind);
      const config = (stored?.configuration && typeof stored.configuration === "object" ? stored.configuration : {}) as Record<string, unknown>;
      setLegacyConfig(config);
      if (stored) setRecordId(String(stored.id));
      const savedBoardIds = asStrings(config.selectedBoardIds);
      const visibleSources = loadedSources.map(source => source.id);
      setSelectedBoardIds(Array.isArray(config.selectedBoardIds) ? savedBoardIds.filter(id => visibleSources.includes(id)) : visibleSources);
      const availableFields = ["sys:title", "sys:department", "sys:owner", "sys:status", "sys:priority", "sys:due", "sys:progress", "sys:description", "sys:links", "sys:attachments", "sys:created_at", "sys:updated_at", ...loadedColumns.filter(column => !column.is_hidden).map(column => `col:${column.id}`)];
      const savedFields = asStrings(config.selectedFieldIds);
      setSelectedFieldIds(Array.isArray(config.selectedFieldIds) ? savedFields.filter(id => availableFields.includes(id)) : availableFields);
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
      const configuration = { ...legacyConfig, kind: trackerKind, selectedBoardIds, selectedFieldIds };
      const result = recordId
        ? await supabase.from("saved_views").update({ name: "Master Tracker", configuration }).eq("id", recordId)
        : await supabase.from("saved_views").insert({ owner_id: user.id, name: "Master Tracker", view_type: "table", configuration }).select("id").single();
      setSaving(false);
      if (result.error) { setSaveError(true); setDirty(false); notify(`Master Tracker selection was not saved: ${result.error.message}`); return; }
      if (!recordId && result.data) setRecordId(String(result.data.id));
      setLegacyConfig(configuration); setSaveError(false);
      if (revision.current === saveRevision) setDirty(false);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [ready, dirty, supabase, user.id, recordId, selectedBoardIds, selectedFieldIds, legacyConfig, saving, notify]);

  const allAvailableFields = useMemo(() => {
    const custom = boardColumns.filter(column => !column.is_hidden && selectedBoardIds.includes(column.board_id)).map(column => ({ key: `col:${column.id}`, name: column.name, kind: column.column_type, boardId: column.board_id, boardName: sources.find(source => source.id === column.board_id)?.name ?? "Table" }));
    return [...systemFields, ...custom];
  }, [boardColumns, selectedBoardIds, sources]);
  const selectedFields = allAvailableFields.filter(field => selectedFieldIds.includes(field.key));
  const departmentGroups = useMemo(() => {
    const grouped = new Map<string, BoardSource[]>();
    sources.filter(source => !sourceSearch.trim() || `${source.name} ${source.departmentName}`.toLocaleLowerCase().includes(sourceSearch.trim().toLocaleLowerCase())).forEach(source => grouped.set(source.departmentName, [...(grouped.get(source.departmentName) ?? []), source]));
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [sources, sourceSearch]);
  const fieldsToChoose = allAvailableFields.filter(field => !fieldSearch.trim() || `${field.name} ${field.boardName ?? ""} ${field.kind}`.toLocaleLowerCase().includes(fieldSearch.trim().toLocaleLowerCase()));
  const selectedSources = sources.filter(source => selectedBoardIds.includes(source.id));
  const matchingCount = tasks.filter(task => task.board_id && selectedBoardIds.includes(task.board_id) && (!rowSearch.trim() || selectedFields.map(field => formatValue(readField(task, field))).join(" ").toLocaleLowerCase().includes(rowSearch.trim().toLocaleLowerCase()))).length;
  const updateSelection = (boards: string[], fields = selectedFieldIds) => { setSelectedBoardIds(boards); setSelectedFieldIds(fields); revision.current += 1; setSaveError(false); setDirty(true); };
  const toggleBoard = (boardId: string) => {
    const enable = !selectedBoardIds.includes(boardId);
    const nextBoards = enable ? [...selectedBoardIds, boardId] : selectedBoardIds.filter(id => id !== boardId);
    const newColumnIds = enable ? boardColumns.filter(column => column.board_id === boardId && !column.is_hidden).map(column => `col:${column.id}`) : [];
    updateSelection(nextBoards, [...new Set([...selectedFieldIds, ...newColumnIds])]);
  };
  const toggleDepartment = (name: string) => {
    const ids = sources.filter(source => source.departmentName === name).map(source => source.id);
    const allSelected = ids.every(id => selectedBoardIds.includes(id));
    const next = allSelected ? selectedBoardIds.filter(id => !ids.includes(id)) : [...new Set([...selectedBoardIds, ...ids])];
    const newColumnIds = allSelected ? [] : boardColumns.filter(column => ids.includes(column.board_id) && !column.is_hidden).map(column => `col:${column.id}`);
    updateSelection(next, [...new Set([...selectedFieldIds, ...newColumnIds])]);
  };
  const toggleField = (key: string) => updateSelection(selectedBoardIds, selectedFieldIds.includes(key) ? selectedFieldIds.filter(id => id !== key) : [...selectedFieldIds, key]);
  const selectAllSources = (selected: boolean) => {
    const ids = selected ? sources.map(source => source.id) : [];
    const newColumnIds = selected ? boardColumns.filter(column => !column.is_hidden).map(column => `col:${column.id}`) : [];
    updateSelection(ids, selected ? [...new Set([...selectedFieldIds, ...newColumnIds])] : selectedFieldIds);
  };
  const selectAllFields = (selected: boolean) => updateSelection(selectedBoardIds, selected ? [...new Set([...selectedFieldIds, ...allAvailableFields.map(field => field.key)])] : selectedFieldIds.filter(key => key.startsWith("sys:")));
  const exportCsv = () => {
    const rows = tasks.filter(task => task.board_id && selectedBoardIds.includes(task.board_id) && (!rowSearch.trim() || selectedFields.map(field => formatValue(readField(task, field))).join(" ").toLocaleLowerCase().includes(rowSearch.trim().toLocaleLowerCase())));
    downloadCsv("master-tracker-selected-data.csv", selectedFields, selectedSources, rows);
  };

  return <section className="panel manual-tracker-panel master-source-panel">
    <div className="manual-tracker-heading"><div><div className="reports-eyebrow"><Layers3 size={14}/> SELECTABLE WORKSPACE DATA</div><h2>Master Tracker</h2><p>Select existing department tables and fields. The tracker displays live board data without adding or changing department rows.</p></div><div className="manual-tracker-actions"><span className={`manual-save-status ${saving ? "is-saving" : saveError ? "is-error" : ""}`}><Save size={13}/>{!ready ? "Loading…" : saving ? "Saving selection…" : saveError ? "Save failed" : recordId ? "Selection saved online" : "Selection ready"}</span>{saveError && <button className="text-button" onClick={() => { revision.current += 1; setSaveError(false); setDirty(true); }}>Retry save</button>}<button className="secondary-button" onClick={exportCsv} disabled={!ready || !selectedBoardIds.length || !selectedFields.length}><Download size={15}/> Export selection</button></div></div>

    <div className="master-selectors">
      <section className="master-select-card"><div className="master-select-heading"><div><span className="master-select-icon"><Layers3 size={16}/></span><div><b>Department tables</b><small>{selectedBoardIds.length} of {sources.length} selected</small></div></div><div className="master-select-actions"><button type="button" className="text-button" onClick={() => selectAllSources(true)}>Select all</button><button type="button" className="text-button" onClick={() => selectAllSources(false)}>Clear</button><button type="button" className="icon-button" aria-expanded={pickerOpen} aria-label="Toggle table selection" onClick={() => setPickerOpen(open => !open)}><ChevronDown size={16}/></button></div></div>
        {pickerOpen && <><label className="master-picker-search"><Search size={14}/><input value={sourceSearch} onChange={event => setSourceSearch(event.target.value)} placeholder="Find a department or table"/></label><div className="master-department-groups">{departmentGroups.map(([department, groupSources]) => { const ids = groupSources.map(source => source.id); const count = ids.filter(id => selectedBoardIds.includes(id)).length; return <div className="master-department-group" key={department}><label className="master-department-option"><input type="checkbox" checked={ids.length > 0 && count === ids.length} ref={element => { if (element) element.indeterminate = count > 0 && count < ids.length; }} onChange={() => toggleDepartment(department)}/><span><b>{department}</b><small>{count}/{ids.length} tables</small></span></label><div className="master-table-options">{groupSources.map(source => <label className="master-table-option" key={source.id}><input type="checkbox" checked={selectedBoardIds.includes(source.id)} onChange={() => toggleBoard(source.id)}/><Table2 size={14}/><span>{source.name}</span></label>)}</div></div>; })}{!sources.length && <div className="master-no-data">No department tables are available to this account.</div>}</div></>}
      </section>

      <section className="master-select-card"><div className="master-select-heading"><div><span className="master-select-icon field"><Check size={16}/></span><div><b>Fields to display</b><small>{selectedFields.length} selected from {allAvailableFields.length} available</small></div></div><div className="master-select-actions"><button type="button" className="text-button" onClick={() => selectAllFields(true)}>Select all</button><button type="button" className="text-button" onClick={() => updateSelection(selectedBoardIds, [])}>Clear all</button></div></div>
        <label className="master-picker-search"><Search size={14}/><input value={fieldSearch} onChange={event => setFieldSearch(event.target.value)} placeholder="Find a field"/></label><div className="master-field-options">{fieldsToChoose.map(field => <label className="master-field-option" key={field.key}><input type="checkbox" checked={selectedFieldIds.includes(field.key)} onChange={() => toggleField(field.key)}/><span><b>{field.name}</b><small>{field.boardName ? `${field.boardName} · ` : "All tables · "}{field.kind}</small></span></label>)}{!fieldsToChoose.length && <div className="master-no-data">Select department tables to load their fields.</div>}</div>
      </section>
    </div>

    <div className="master-data-toolbar"><div><h3>Selected tables</h3><span>{matchingCount} matching rows · {selectedSources.length} tables · {selectedFields.length} fields</span></div><label className="master-picker-search"><Filter size={14}/><input value={rowSearch} onChange={event => setRowSearch(event.target.value)} placeholder="Search selected data"/></label></div>
    {!selectedSources.length ? <div className="master-tracker-empty-state"><div><Table2 size={21}/></div><b>Select department tables to view their data.</b><span>Choose one or more tables above. Existing rows will appear here.</span></div> : !selectedFields.length ? <div className="master-tracker-empty-state"><div><Check size={21}/></div><b>Select at least one field.</b><span>Choose the database columns to display from the field list.</span></div> : selectedSources.map(source => {
      const sourceFields = selectedFields.filter(field => !field.boardId || field.boardId === source.id);
      const sourceTasks = tasks.filter(task => task.board_id === source.id && (!rowSearch.trim() || sourceFields.map(field => formatValue(readField(task, field))).join(" ").toLocaleLowerCase().includes(rowSearch.trim().toLocaleLowerCase())));
      return <section className="master-source-table" key={source.id}><div className="master-source-table-heading"><span className="master-source-table-icon"><Table2 size={16}/></span><div><b>{source.name}</b><small>{source.departmentName} · {sourceTasks.length} {sourceTasks.length === 1 ? "row" : "rows"}</small></div><span className="master-source-live"><i/>Live from department</span></div>{!sourceFields.length ? <div className="master-no-fields">No selected fields belong to this table. Select one of its fields above.</div> : <div className="master-source-table-scroll"><table className="master-source-grid"><thead><tr>{sourceFields.map(field => { const duplicate = field.key.startsWith("col:") && systemFields.some(system => system.name.toLocaleLowerCase() === field.name.toLocaleLowerCase()); const label = duplicate ? `${field.name} (table)` : field.name; return <th key={field.key} title={`${field.name} · ${field.kind}`}>{label}</th>; })}</tr></thead><tbody>{sourceTasks.map(task => <tr key={task.id}>{sourceFields.map(field => <td key={field.key} title={formatValue(readField(task, field))}>{formatValue(readField(task, field))}</td>)}</tr>)}{!sourceTasks.length && <tr><td colSpan={sourceFields.length}><div className="master-source-empty">{rowSearch ? "No rows match this search." : "No rows in this table yet."}</div></td></tr>}</tbody></table></div>}</section>;
    })}
    <div className="manual-tracker-footnote">Read-only view of existing department tables. Your selections save online; department records remain unchanged.</div>
  </section>;
}
