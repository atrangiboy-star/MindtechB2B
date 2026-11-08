import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { BarChart3, Download, FileUp, Layers3, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";

type BoardSource = { id: string; name: string; departmentId: string | null; departmentName: string };
type ReportColumn = { id: string; board_id: string; name: string; column_type: string; is_hidden?: boolean };
type ReportConfig = {
  dimension: string;
  chartType: string;
  boardIds?: string[];
  departments?: string[];
  metricField?: string;
  aggregation?: "count" | "sum" | "average";
  seriesBy?: string;
  dateRange?: string;
};
type SavedReport = { id: string; name: string; configuration: ReportConfig; created_at?: string };
type ReportRow = { label: string; value: number; series?: Record<string, number> };
type Props = { supabase: SupabaseClient | null; user: User; tasks: any[]; refreshTasks: () => Promise<void>; notify: (message: string) => void };

const palette = ["#315be8", "#19a77b", "#f1ad18", "#9b63dc", "#e66f62", "#12a8b6", "#69758c", "#dc6a9b"];
const chartTypes = [
  ["bar", "Bar chart"], ["column", "Column chart"], ["stacked", "Stacked bar"], ["line", "Line chart"], ["area", "Area chart"],
  ["pie", "Pie chart"], ["donut", "Donut chart"], ["funnel", "Funnel chart"], ["table", "Data table"], ["kpi", "KPI card"],
] as const;
const baseDimensions = [
  ["department", "Department"], ["board", "Board"], ["status", "Status"], ["priority", "Priority"],
  ["owner", "Owner"], ["createdMonth", "Created month"], ["dueMonth", "Due month"],
] as const;
const dateRanges = [["all", "All time"], ["30d", "Last 30 days"], ["90d", "Last 90 days"], ["365d", "Last 12 months"]] as const;
const normaliseConfig = (raw: any): ReportConfig => ({
  dimension: typeof raw?.dimension === "string" ? raw.dimension : "status",
  chartType: raw?.chartType === "list" ? "table" : typeof raw?.chartType === "string" ? raw.chartType : "bar",
  boardIds: Array.isArray(raw?.boardIds) ? raw.boardIds.filter((id: unknown) => typeof id === "string") : [],
  departments: Array.isArray(raw?.departments) ? raw.departments.filter((name: unknown) => typeof name === "string") : [],
  metricField: typeof raw?.metricField === "string" ? raw.metricField : "task_count",
  aggregation: raw?.aggregation === "sum" || raw?.aggregation === "average" ? raw.aggregation : "count",
  seriesBy: typeof raw?.seriesBy === "string" ? raw.seriesBy : "status",
  dateRange: typeof raw?.dateRange === "string" ? raw.dateRange : "all",
});
const monthKey = (value: unknown) => {
  if (!value) return "No date";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "No date" : date.toLocaleString(undefined, { month: "short", year: "numeric" });
};
const safeName = (value: string) => value.trim().toLocaleLowerCase();

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ReportVisual({ type, rows, totalLabel, totalValue, metricLabel }: { type: string; rows: ReportRow[]; totalLabel: number; totalValue: number; metricLabel: string }) {
  if (type === "kpi") {
    return <div className="report-kpi"><span>{metricLabel}</span><strong>{new Intl.NumberFormat().format(Number(totalValue.toFixed(2)))}</strong><small>{totalLabel.toLocaleString()} matching rows</small><i><BarChart3 size={20}/></i></div>;
  }
  if (!rows.length) return <div className="report-empty">No matching rows yet. Choose another board or field.</div>;
  if (type === "pie" || type === "donut") {
    const sum = rows.reduce((total, row) => total + Math.max(0, row.value), 0);
    let degrees = 0;
    const segments = rows.map((row, index) => {
      const from = degrees; degrees += sum ? Math.max(0, row.value) / sum * 360 : 0;
      return `${palette[index % palette.length]} ${from}deg ${degrees}deg`;
    });
    return <div className="report-pie-layout"><div className={`report-pie ${type === "donut" ? "is-donut" : ""}`} style={{ background: `conic-gradient(${segments.join(", ")})` }}>
      {type === "donut" && <span><b>{new Intl.NumberFormat().format(sum)}</b><small>{metricLabel}</small></span>}
    </div><div className="report-legend">{rows.map((row, index) => <div key={row.label}><i style={{ background: palette[index % palette.length] }}/><span>{row.label}</span><b>{new Intl.NumberFormat().format(Number(row.value.toFixed(2)))}</b><small>{sum ? `${Math.round(row.value / sum * 100)}%` : "0%"}</small></div>)}</div></div>;
  }
  if (type === "table") return <div className="report-data-table"><table><thead><tr><th>Group</th><th>{metricLabel}</th></tr></thead><tbody>{rows.map(row => <tr key={row.label}><td>{row.label}</td><td>{new Intl.NumberFormat().format(Number(row.value.toFixed(2)))}</td></tr>)}</tbody></table></div>;
  if (type === "column") {
    const max = Math.max(1, ...rows.map(row => row.value));
    return <div className="report-columns">{rows.map((row, index) => <div className="report-column" key={row.label} title={`${row.label}: ${row.value}`}><b>{new Intl.NumberFormat().format(Number(row.value.toFixed(2)))}</b><div><i style={{ height: `${Math.max(2, row.value / max * 100)}%`, background: palette[index % palette.length] }}/></div><span>{row.label.length > 12 ? `${row.label.slice(0, 11)}…` : row.label}</span></div>)}</div>;
  }
  if (type === "funnel") {
    const max = Math.max(1, ...rows.map(row => row.value));
    return <div className="report-funnel">{rows.map((row, index) => <div className="report-funnel-row" key={row.label}><span>{row.label}</span><i style={{ width: `${Math.max(8, row.value / max * 100)}%`, background: palette[index % palette.length] }}/><b>{new Intl.NumberFormat().format(Number(row.value.toFixed(2)))}</b></div>)}</div>;
  }
  if (type === "line" || type === "area") {
    const width = 720, height = 290, left = 42, right = 18, top = 20, bottom = 56;
    const max = Math.max(1, ...rows.map(row => row.value));
    const points = rows.map((row, index) => ({ x: left + (rows.length <= 1 ? (width - left - right) / 2 : index * (width - left - right) / (rows.length - 1)), y: top + (height - top - bottom) * (1 - row.value / max), row }));
    const line = points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
    const area = `${line} L${points[points.length - 1]?.x ?? left},${height - bottom} L${points[0]?.x ?? left},${height - bottom} Z`;
    return <div className="report-chart-scroll"><svg className="report-line-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${type} chart of ${metricLabel}`}>
      {[0, .25, .5, .75, 1].map(tick => { const y = top + (height - top - bottom) * tick; return <g key={tick}><line x1={left} x2={width - right} y1={y} y2={y} className="report-gridline"/><text x={left - 8} y={y + 4} textAnchor="end" className="report-axis-label">{Math.round(max * (1 - tick))}</text></g>; })}
      {type === "area" && <path d={area} fill="url(#report-area-fill)"/>}<defs><linearGradient id="report-area-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={palette[0]} stopOpacity=".32"/><stop offset="100%" stopColor={palette[0]} stopOpacity=".02"/></linearGradient></defs>
      <path d={line} className="report-line-path"/>{points.map((point, index) => <g key={point.row.label}><title>{point.row.label}: {point.row.value}</title><circle cx={point.x} cy={point.y} r="4.5" fill={palette[index % palette.length]} className="report-line-point"/><text x={point.x} y={height - 24} textAnchor="middle" className="report-axis-label">{point.row.label.length > 12 ? `${point.row.label.slice(0, 11)}…` : point.row.label}</text></g>)}
    </svg></div>;
  }
  if (type === "stacked") {
    const keys = [...new Set(rows.flatMap(row => Object.keys(row.series ?? {})))];
    const max = Math.max(1, ...rows.map(row => row.value));
    return <div className="report-stacked-list">{rows.map(row => <div className="report-stacked-row" key={row.label}><span title={row.label}>{row.label}</span><div className="report-stack-track">{keys.map((key, index) => <i key={key} title={`${key}: ${row.series?.[key] ?? 0}`} style={{ width: `${Math.max(0, (row.series?.[key] ?? 0) / max * 100)}%`, background: palette[index % palette.length] }}/>)}</div><b>{new Intl.NumberFormat().format(Number(row.value.toFixed(2)))}</b></div>)}<div className="report-stack-legend">{keys.map((key, index) => <span key={key}><i style={{ background: palette[index % palette.length] }}/>{key}</span>)}</div></div>;
  }
  const max = Math.max(1, ...rows.map(row => row.value));
  return <div className="report-bars">{rows.map((row, index) => <div className="report-bar-row" key={row.label}><span title={row.label}>{row.label}</span><div className="report-bar-track"><i style={{ width: `${Math.max(0, row.value / max * 100)}%`, background: palette[index % palette.length] }}/></div><b>{new Intl.NumberFormat().format(Number(row.value.toFixed(2)))}</b></div>)}</div>;
}

export default function ReportsWorkspace({ supabase, user, tasks, refreshTasks, notify }: Props) {
  const [sources, setSources] = useState<BoardSource[]>([]);
  const [columns, setColumns] = useState<ReportColumn[]>([]);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [reportName, setReportName] = useState("");
  const [dimension, setDimension] = useState("");
  const [chartType, setChartType] = useState("");
  const [metricField, setMetricField] = useState("");
  const [aggregation, setAggregation] = useState<"count" | "sum" | "average" | "">("");
  const [seriesBy, setSeriesBy] = useState("");
  const [dateRange, setDateRange] = useState("");
  const [selectedBoards, setSelectedBoards] = useState<string[]>([]);
  const [sourceSearch, setSourceSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(() => localStorage.getItem("mindtech.reports.autoRefresh") !== "false");
  const refreshRef = useRef(refreshTasks);

  const load = async () => {
    if (!supabase) return;
    const [{ data: boardRows, error: boardError }, { data: departmentRows, error: departmentError }, { data: columnRows, error: columnError }, { data: savedRows, error: savedError }] = await Promise.all([
      supabase.from("boards").select("id,name,department_id,created_at").order("created_at"),
      supabase.from("departments").select("id,name,is_active"),
      supabase.from("board_columns").select("id,board_id,name,column_type,is_hidden").order("position"),
      supabase.from("saved_views").select("id,name,configuration,created_at").eq("owner_id", user.id).eq("view_type", "dashboard").order("created_at"),
    ]);
    if (boardError || departmentError || columnError || savedError) {
      const error = boardError ?? departmentError ?? columnError ?? savedError;
      notify(`Reports could not be loaded: ${error?.message ?? "Unknown database error"}`); return;
    }
    const departmentNames = new Map((departmentRows ?? []).map(row => [String(row.id), String(row.name)]));
    setSources((boardRows ?? []).map(row => ({ id: String(row.id), name: String(row.name), departmentId: row.department_id ? String(row.department_id) : null, departmentName: row.department_id ? departmentNames.get(String(row.department_id)) ?? "Other" : "Other" })));
    setColumns((columnRows ?? []) as ReportColumn[]);
    setReports((savedRows ?? []).map(row => ({ id: String(row.id), name: String(row.name), configuration: normaliseConfig(row.configuration), created_at: row.created_at ? String(row.created_at) : undefined })));
  };

  useEffect(() => { void load(); }, [supabase, user.id]);
  useEffect(() => { refreshRef.current = refreshTasks; }, [refreshTasks]);
  useEffect(() => { localStorage.setItem("mindtech.reports.autoRefresh", String(autoRefresh)); }, [autoRefresh]);
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => { void refreshRef.current(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh]);

  const dimensions = useMemo(() => {
    const custom = new Map<string, string>();
    columns.filter(column => !column.is_hidden && selectedBoards.includes(column.board_id)).forEach(column => { const key = `field:${safeName(column.name)}`; if (!custom.has(key)) custom.set(key, column.name); });
    return [...baseDimensions.map(([value, label]) => ({ value, label })), ...[...custom].map(([value, label]) => ({ value, label }))];
  }, [columns, selectedBoards]);
  const metricFields = useMemo(() => {
    const custom = new Map<string, string>();
    columns.filter(column => !column.is_hidden && selectedBoards.includes(column.board_id) && ["number", "progress", "formula"].includes(column.column_type)).forEach(column => { const key = `field:${safeName(column.name)}`; if (!custom.has(key)) custom.set(key, column.name); });
    return [{ value: "task_count", label: "Task count" }, { value: "progress", label: "Progress (%)" }, ...[...custom].map(([value, label]) => ({ value, label }))];
  }, [columns, selectedBoards]);
  const groupedSources = useMemo(() => {
    const groups = new Map<string, BoardSource[]>();
    sources.filter(source => !sourceSearch.trim() || `${source.name} ${source.departmentName}`.toLocaleLowerCase().includes(sourceSearch.trim().toLocaleLowerCase())).forEach(source => groups.set(source.departmentName, [...(groups.get(source.departmentName) ?? []), source]));
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [sources, sourceSearch]);
  const allBoardsSelected = sources.length > 0 && selectedBoards.length === sources.length;
  const selectedSourceCount = selectedBoards.length;
  const selectedDepartmentCount = new Set(sources.filter(source => selectedBoards.includes(source.id)).map(source => source.departmentName)).size;
  const boardNames = useMemo(() => new Map(sources.map(source => [source.id, source.name])), [sources]);

  const customValue = (task: any, key: string) => {
    const name = key.slice("field:".length);
    const column = columns.find(item => item.board_id === task.board_id && safeName(item.name) === name);
    return column ? task.custom_fields?.[column.id] : undefined;
  };
  const dimensionValue = (task: any, key: string) => {
    if (key === "department") return task.department || "Unassigned";
    if (key === "board") return boardNames.get(task.board_id) ?? "No board";
    if (key === "status") return task.status || "No status";
    if (key === "priority") return task.priority || "No priority";
    if (key === "owner") return task.owner || "Unassigned";
    if (key === "createdMonth") return monthKey(task.created_at);
    if (key === "dueMonth") return monthKey(task.due);
    return customValue(task, key) ?? "Empty";
  };
  const metricValue = (task: any, key: string) => {
    if (key === "task_count") return 1;
    if (key === "progress") return Number(task.progress ?? 0);
    const value = customValue(task, key);
    const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const reportTasks = (configuration: ReportConfig) => {
    const ids = configuration.boardIds ?? [];
    const since = configuration.dateRange && configuration.dateRange !== "all" ? Date.now() - Number.parseInt(configuration.dateRange, 10) * 86_400_000 : 0;
    return tasks.filter(task => {
      if (!ids.length || !task.board_id || !ids.includes(task.board_id)) return false;
      if (configuration.departments?.length && !configuration.departments.includes(task.department)) return false;
      if (since) { const created = Date.parse(task.created_at ?? task.updated_at ?? ""); if (!Number.isFinite(created) || created < since) return false; }
      return true;
    });
  };
  const makeRows = (configuration: ReportConfig) => {
    const items = reportTasks(configuration);
    const groups = new Map<string, { sum: number; count: number; series: Record<string, number> }>();
    const metric = configuration.metricField ?? "task_count";
    const aggregationType = configuration.aggregation ?? "count";
    items.forEach(task => {
      const label = String(dimensionValue(task, configuration.dimension) || "Empty");
      const rawValue = metricValue(task, metric);
      const value = aggregationType === "count" ? 1 : rawValue;
      if (value === null) return;
      const current = groups.get(label) ?? { sum: 0, count: 0, series: {} };
      current.sum += value; current.count += 1;
      const series = String(dimensionValue(task, configuration.seriesBy ?? "status") || "Empty");
      current.series[series] = (current.series[series] ?? 0) + (aggregationType === "count" ? 1 : value);
      groups.set(label, current);
    });
    const rows = [...groups.entries()].map(([label, group]) => ({ label, value: aggregationType === "count" ? group.count : aggregationType === "average" ? group.sum / Math.max(1, group.count) : group.sum, series: group.series }));
    const values = items.map(task => metricValue(task, metric)).filter((value): value is number => value !== null);
    const totalValue = aggregationType === "count" ? items.length : aggregationType === "average" ? values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length) : values.reduce((sum, value) => sum + value, 0);
    if (["createdMonth", "dueMonth"].includes(configuration.dimension)) rows.sort((a, b) => { const aDate = Date.parse(`1 ${a.label}`), bDate = Date.parse(`1 ${b.label}`); return aDate - bDate; });
    else rows.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    return { rows, total: items.length, totalValue };
  };

  const resetForm = () => { setReportName(""); setDimension(""); setChartType(""); setMetricField(""); setAggregation(""); setSeriesBy(""); setDateRange(""); setSelectedBoards([]); setEditingId(null); };
  const toggleBoard = (id: string) => setSelectedBoards(current => {
    return current.includes(id) ? current.filter(boardId => boardId !== id) : [...current, id];
  });
  const saveReport = async () => {
    if (!supabase) return notify("Connect to the workspace before saving reports.");
    const title = reportName.trim(); if (!title) return notify("Enter a report name before saving.");
    if (!selectedBoards.length || !chartType || !dimension || !metricField || !aggregation || !dateRange || (chartType === "stacked" && !seriesBy)) return notify("Select board sources and report logic before saving.");
    setBusy(true);
    const configuration: ReportConfig = { dimension, chartType, boardIds: selectedBoards, metricField, aggregation, seriesBy, dateRange };
    const result = editingId
      ? await supabase.from("saved_views").update({ name: title, configuration }).eq("id", editingId).eq("owner_id", user.id)
      : await supabase.from("saved_views").insert({ owner_id: user.id, name: title, view_type: "dashboard", configuration });
    setBusy(false);
    if (result.error) return notify(`Report was not saved: ${result.error.message}`);
    notify(editingId ? "Report updated online." : "Report added to Reports."); resetForm(); await load();
  };
  const editReport = (report: SavedReport) => {
    const config = normaliseConfig(report.configuration);
    setEditingId(report.id); setReportName(report.name); setDimension(config.dimension); setChartType(config.chartType); setMetricField(config.metricField ?? "task_count"); setAggregation(config.aggregation ?? "count"); setSeriesBy(config.seriesBy ?? "status"); setDateRange(config.dateRange ?? "all"); setSelectedBoards(config.boardIds ?? []);
    document.querySelector(".reports-builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const removeReport = async (report: SavedReport) => {
    if (!supabase || !window.confirm(`Delete report “${report.name}”?`)) return;
    const { error } = await supabase.from("saved_views").delete().eq("id", report.id).eq("owner_id", user.id);
    if (error) notify(`Report was not deleted: ${error.message}`); else { notify("Report deleted."); await load(); }
  };
  const exportReports = () => downloadFile("mindtech-reports.json", JSON.stringify(reports, null, 2), "application/json");
  const importReports = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file || !supabase) return;
    try {
      const source = JSON.parse(await file.text()); const entries = Array.isArray(source) ? source : Array.isArray(source.reports) ? source.reports : [source];
      const rows = entries.map((entry: any) => ({ owner_id: user.id, name: String(entry.name ?? "Imported report").slice(0, 120), view_type: "dashboard", configuration: normaliseConfig(entry.configuration ?? entry) }));
      const { error } = await supabase.from("saved_views").insert(rows); if (error) throw error;
      notify(`${rows.length} report(s) imported.`); await load();
    } catch (error) { notify(`Report import failed: ${(error as Error).message}`); }
    event.target.value = "";
  };
  const exportCsv = (report: SavedReport) => {
    const config = normaliseConfig(report.configuration); const { rows } = makeRows(config);
    const csv = [["Group", "Value", "Series"], ...rows.map(row => [row.label, row.value, JSON.stringify(row.series ?? {})])].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    downloadFile(`${report.name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "report"}.csv`, csv, "text/csv;charset=utf-8");
  };

  const availableDepartments = [...new Set(sources.map(source => source.departmentName))].sort((a, b) => a.localeCompare(b));
  const matchingTaskCount = selectedBoards.length ? tasks.filter(task => selectedBoards.includes(task.board_id ?? "")).length : 0;

  return <div className="reports-workspace">
    <section className="reports-hero"><div className="reports-hero-copy"><div className="reports-eyebrow"><Layers3 size={14}/> BUSINESS INTELLIGENCE</div><h2>Reports</h2><p>Start with a blank canvas. Select the department boards and chart logic you want; nothing is automatically mapped into reports.</p></div><div className="reports-hero-actions"><button className="secondary-button" onClick={() => void Promise.all([refreshTasks(), load()])}><RefreshCw size={15}/> Refresh data</button><button className="secondary-button" onClick={exportReports}><Download size={15}/> Export reports</button><label className="secondary-button upload-button"><FileUp size={15}/> Import JSON<input type="file" accept="application/json,.json" onChange={importReports}/></label></div></section>

    <section className="reports-kpis" aria-label="Report data summary"><article><span>Accessible boards</span><b>{sources.length}</b><small>Across {availableDepartments.length} departments</small></article><article><span>Selected source rows</span><b>{matchingTaskCount}</b><small>{selectedBoards.length ? "From boards you selected" : "No source data selected"}</small></article><article><span>Saved reports</span><b>{reports.length}</b><small>Stored in your workspace account</small></article><article className="reports-refresh-card"><label><input type="checkbox" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)}/> Auto-refresh</label><small>Updates every minute; live task changes update automatically.</small></article></section>

    <section className="panel reports-builder" id="reports-builder"><div className="reports-section-heading"><div><div className="reports-eyebrow">REPORT DESIGNER</div><h3>{editingId ? "Edit report" : "Create a report"}</h3><p>Choose the boards, measures, and visual that should appear together.</p></div><span className="reports-source-pill"><Layers3 size={14}/>{selectedDepartmentCount} departments · {selectedSourceCount} boards</span></div>
      <div className="reports-form-grid"><label className="reports-field reports-title-field">Report name<input maxLength={120} value={reportName} onChange={event => setReportName(event.target.value)} placeholder="e.g. Campaign delivery overview"/></label>
        <label className="reports-field">Chart type<select value={chartType} onChange={event => { setChartType(event.target.value); if (event.target.value === "stacked" && aggregation === "average") setAggregation("sum"); }}><option value="">Choose chart type</option>{chartTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="reports-field">Group / category<select value={dimension} onChange={event => setDimension(event.target.value)}><option value="">Choose a field</option>{dimensions.map(field => <option value={field.value} key={field.value}>{field.label}</option>)}</select></label>
        <label className="reports-field">Measure<select value={metricField} onChange={event => setMetricField(event.target.value)}><option value="">Choose a measure</option>{metricFields.map(field => <option value={field.value} key={field.value}>{field.label}</option>)}</select></label>
        <label className="reports-field">Calculation<select value={aggregation} onChange={event => setAggregation(event.target.value as typeof aggregation)}><option value="">Choose calculation</option><option value="count">Count records</option><option value="sum">Sum values</option>{chartType !== "stacked" && <option value="average">Average values</option>}</select></label>
        {chartType === "stacked" && <label className="reports-field">Stack series by<select value={seriesBy} onChange={event => setSeriesBy(event.target.value)}><option value="">Choose series</option>{dimensions.map(field => <option value={field.value} key={field.value}>{field.label}</option>)}</select></label>}
        <label className="reports-field">Date window<select value={dateRange} onChange={event => setDateRange(event.target.value)}><option value="">Choose a date window</option>{dateRanges.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      </div>
      <div className="reports-source-picker"><div className="reports-source-head"><div><b>Connect department boards</b><small>Boards stay disconnected until you check them. Selecting sources is manual.</small></div><label className="reports-all-source"><input type="checkbox" checked={allBoardsSelected} onChange={() => setSelectedBoards(allBoardsSelected ? [] : sources.map(source => source.id))}/> Select all accessible boards</label></div>
        <label className="reports-source-search"><Search size={15}/><input type="search" value={sourceSearch} onChange={event => setSourceSearch(event.target.value)} placeholder="Search departments and boards"/></label>
        {groupedSources.length ? <div className="reports-source-groups">{groupedSources.map(([department, boards]) => <section key={department}><div className="reports-department-source"><b>{department}</b><small>{boards.length} {boards.length === 1 ? "board" : "boards"}</small></div>{boards.map(board => <label className="reports-board-source" key={board.id}><input type="checkbox" checked={selectedBoards.includes(board.id)} onChange={() => toggleBoard(board.id)}/><span><b>{board.name}</b><small>{board.departmentName}</small></span></label>)}</section>)}</div> : <div className="reports-no-sources"><b>No accessible boards found.</b><span>Ask your administrator to grant board or department access.</span></div>}
      </div>
      <div className="reports-builder-footer"><span>Only records from your selected boards and workspace permissions are included.</span><div>{editingId && <button className="secondary-button" onClick={resetForm}><X size={15}/> Cancel edit</button>}<button className="primary-button" disabled={busy || !reportName.trim() || !selectedBoards.length || !chartType || !dimension || !metricField || !aggregation || !dateRange || (chartType === "stacked" && !seriesBy)} onClick={() => void saveReport()}><Save size={15}/>{busy ? "Saving…" : editingId ? "Save changes" : "Add to Reports"}</button></div></div>
    </section>

    <div className="reports-canvas-heading"><div><div className="reports-eyebrow">LIVE CANVAS</div><h3>Your reports</h3><p>Charts use saved source boards and refresh with shared task data.</p></div><span>{reports.length} {reports.length === 1 ? "report" : "reports"}</span></div>
    {reports.length ? <div className="reports-grid">{reports.map(report => {
      const config = normaliseConfig(report.configuration); const { rows, total, totalValue } = makeRows(config);
      const metric = metricFields.find(field => field.value === config.metricField)?.label ?? (config.metricField === "task_count" ? "Tasks" : config.metricField === "progress" ? "Progress (%)" : config.metricField?.slice(6));
      const sourceCount = config.boardIds?.length ?? 0;
      const departmentCount = new Set(sources.filter(source => config.boardIds?.includes(source.id)).map(source => source.departmentName)).size;
      return <article className={`panel report-card report-card-${config.chartType}`} key={report.id}><header className="report-card-head"><div><span className="report-type-label">{chartTypes.find(([type]) => type === config.chartType)?.[1] ?? "Report"}</span><h4>{report.name}</h4><p>{departmentCount} departments · {sourceCount} boards · {total} matching rows</p></div><div className="report-card-actions"><button className="icon-button" title="Export chart data as CSV" aria-label={`Export ${report.name} as CSV`} onClick={() => exportCsv(report)}><Download size={15}/></button><button className="icon-button" title="Edit report" aria-label={`Edit ${report.name}`} onClick={() => editReport(report)}><Save size={15}/></button><button className="icon-button report-delete-button" title="Delete report" aria-label={`Delete ${report.name}`} onClick={() => void removeReport(report)}><Trash2 size={15}/></button></div></header><ReportVisual type={config.chartType} rows={rows} totalLabel={total} totalValue={totalValue} metricLabel={metric ?? "Tasks"}/></article>;
    })}</div> : <section className="panel reports-first-run"><div className="reports-first-icon"><BarChart3 size={25}/></div><h3>Your BI workspace is ready</h3><p>Select boards from multiple departments, choose a measure and chart type, then add your first report.</p><button className="primary-button" onClick={() => document.querySelector(".reports-builder")?.scrollIntoView({ behavior: "smooth", block: "start" })}><Plus size={15}/> Start building</button></section>}
    <div className="reports-footnote">Reports show data available to your signed-in account. Board permissions are enforced by Supabase row-level security.</div>
  </div>;
}
