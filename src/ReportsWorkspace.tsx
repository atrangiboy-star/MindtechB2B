import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { BarChart3, Download, FileUp, Layers3, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { evaluateFormula } from "./AdvancedWorkspace";

type BoardSource = { id: string; name: string; departmentId: string | null; departmentName: string };
type ReportColumn = { id: string; board_id: string; name: string; column_type: string; options?: string[]; is_hidden?: boolean };
type FieldMapping = { id: string; name: string; role: "category" | "measure"; columnByBoard: Record<string, string> };
type ReportFilter = { id: string; field: string; operator: "equals" | "not_equals" | "contains" | "not_contains" | "greater_than" | "less_than" | "is_empty" | "is_not_empty"; value: string };
type ReportConfig = {
  dimension: string;
  chartType: string;
  boardIds?: string[];
  departments?: string[];
  metricField?: string;
  aggregation?: "count" | "sum" | "average";
  seriesBy?: string;
  dateRange?: string;
  fieldMappings?: FieldMapping[];
  binWidth?: number;
  filters?: ReportFilter[];
  filterLogic?: "all" | "any";
};
type SavedReport = { id: string; name: string; configuration: ReportConfig; created_at?: string };
type ReportRow = { label: string; value: number; series?: Record<string, number> };
type Props = { supabase: SupabaseClient | null; user: User; tasks: any[]; refreshTasks: () => Promise<void>; notify: (message: string) => void };

const palette = ["#315be8", "#19a77b", "#f1ad18", "#9b63dc", "#e66f62", "#12a8b6", "#69758c", "#dc6a9b"];
const rowFormulaPrefix = "__mindtech_row_formula__:";
const chartTypes = [
  ["bar", "Bar chart"], ["column", "Column chart"], ["stacked", "Stacked bar"], ["line", "Line chart"], ["area", "Area chart"],
  ["pie", "Pie chart"], ["donut", "Donut chart"], ["funnel", "Funnel chart"], ["histogram", "Histogram"], ["table", "Data table"], ["kpi", "KPI card"],
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
  fieldMappings: Array.isArray(raw?.fieldMappings) ? raw.fieldMappings.filter((mapping: any) => mapping && typeof mapping.id === "string" && typeof mapping.name === "string" && (mapping.role === "category" || mapping.role === "measure")).map((mapping: any) => ({ id: mapping.id, name: mapping.name, role: mapping.role as FieldMapping["role"], columnByBoard: mapping.columnByBoard && typeof mapping.columnByBoard === "object" ? Object.fromEntries(Object.entries(mapping.columnByBoard).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : {} })) : [],
  binWidth: Number.isFinite(Number(raw?.binWidth)) && Number(raw?.binWidth) > 0 ? Number(raw.binWidth) : undefined,
  filters: Array.isArray(raw?.filters) ? raw.filters.filter((filter: any) => filter && typeof filter.field === "string" && typeof filter.value === "string").map((filter: any) => ({ id: typeof filter.id === "string" ? filter.id : crypto.randomUUID(), field: filter.field, operator: ["equals", "not_equals", "contains", "not_contains", "greater_than", "less_than", "is_empty", "is_not_empty"].includes(filter.operator) ? filter.operator : "equals", value: filter.value })) : [],
  filterLogic: raw?.filterLogic === "any" ? "any" : "all",
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
  if (type === "column" || type === "histogram") {
    const max = Math.max(1, ...rows.map(row => row.value));
    return <div className={`report-columns ${type === "histogram" ? "report-histogram" : ""}`}>{rows.map((row, index) => <div className="report-column" key={row.label} title={`${row.label}: ${row.value}`}><b>{new Intl.NumberFormat().format(Number(row.value.toFixed(2)))}</b><div><i style={{ height: `${Math.max(2, row.value / max * 100)}%`, background: type === "histogram" ? palette[0] : palette[index % palette.length] }}/></div><span>{row.label.length > 12 ? `${row.label.slice(0, 11)}…` : row.label}</span></div>)}</div>;
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
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sourceError, setSourceError] = useState("");
  const [columns, setColumns] = useState<ReportColumn[]>([]);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [reportName, setReportName] = useState("");
  const [dimension, setDimension] = useState("");
  const [chartType, setChartType] = useState("");
  const [metricField, setMetricField] = useState("");
  const [aggregation, setAggregation] = useState<"count" | "sum" | "average" | "">("");
  const [seriesBy, setSeriesBy] = useState("");
  const [dateRange, setDateRange] = useState("");
  const [binWidth, setBinWidth] = useState("");
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [mappingName, setMappingName] = useState("");
  const [mappingRole, setMappingRole] = useState<FieldMapping["role"]>("category");
  const [mappingColumns, setMappingColumns] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<ReportFilter[]>([]);
  const [filterLogic, setFilterLogic] = useState<"all" | "any">("all");
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
      supabase.from("board_columns").select("id,board_id,name,column_type,options,is_hidden").order("position"),
      supabase.from("saved_views").select("id,name,configuration,created_at").eq("owner_id", user.id).eq("view_type", "dashboard").order("created_at"),
    ]);
    if (boardError) {
      setSources([]); setSourceError(boardError.message); setSourcesLoading(false);
      notify(`Accessible boards could not be loaded: ${boardError.message}`); return;
    }
    setSourceError(""); setSourcesLoading(false);
    if (departmentError) notify(`Department names could not be loaded: ${departmentError.message}`);
    if (columnError) notify(`Board fields could not be loaded: ${columnError.message}`);
    if (savedError) notify(`Saved reports could not be loaded: ${savedError.message}`);
    const departmentNames = new Map((departmentRows ?? []).map(row => [String(row.id), String(row.name)]));
    setSources((boardRows ?? []).map(row => ({ id: String(row.id), name: String(row.name), departmentId: row.department_id ? String(row.department_id) : null, departmentName: row.department_id ? departmentNames.get(String(row.department_id)) ?? "Other" : "Other" })));
    setColumns((columnRows ?? []).map(row => ({ ...row, options: Array.isArray(row.options) ? row.options.filter((value): value is string => typeof value === "string") : [] })) as ReportColumn[]);
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
    const custom = columns.filter(column => !column.is_hidden && selectedBoards.includes(column.board_id)).map(column => ({ value: `col:${column.id}`, label: `${sources.find(source => source.id === column.board_id)?.name ?? "Board"} · ${column.name}` }));
    const mapped = fieldMappings.filter(mapping => mapping.role === "category").map(mapping => ({ value: `map:${mapping.id}`, label: `${mapping.name} · mapped` }));
    return [...baseDimensions.map(([value, label]) => ({ value, label })), ...custom, ...mapped];
  }, [columns, selectedBoards, fieldMappings, sources]);
  const metricFields = useMemo(() => {
    const custom = columns.filter(column => !column.is_hidden && selectedBoards.includes(column.board_id) && ["number", "progress", "formula"].includes(column.column_type)).map(column => ({ value: `col:${column.id}`, label: `${sources.find(source => source.id === column.board_id)?.name ?? "Board"} · ${column.name}` }));
    const mapped = fieldMappings.filter(mapping => mapping.role === "measure").map(mapping => ({ value: `map:${mapping.id}`, label: `${mapping.name} · mapped` }));
    return [{ value: "task_count", label: "Task count" }, { value: "progress", label: "Progress (%)" }, ...custom, ...mapped];
  }, [columns, selectedBoards, fieldMappings, sources]);
  const filterFields = useMemo(() => [...new Map([...dimensions, ...metricFields].map(field => [field.value, field])).values()], [dimensions, metricFields]);
  const groupedSources = useMemo(() => {
    const groups = new Map<string, BoardSource[]>();
    sources.filter(source => !sourceSearch.trim() || `${source.name} ${source.departmentName}`.toLocaleLowerCase().includes(sourceSearch.trim().toLocaleLowerCase())).forEach(source => groups.set(source.departmentName, [...(groups.get(source.departmentName) ?? []), source]));
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [sources, sourceSearch]);
  const allBoardsSelected = sources.length > 0 && selectedBoards.length === sources.length;
  const selectedSourceCount = selectedBoards.length;
  const selectedDepartmentCount = new Set(sources.filter(source => selectedBoards.includes(source.id)).map(source => source.departmentName)).size;
  const boardNames = useMemo(() => new Map(sources.map(source => [source.id, source.name])), [sources]);

  const columnValue = (task: any, column: ReportColumn) => {
    if (column.column_type !== "formula") return task.custom_fields?.[column.id];
    const formula = String(task.custom_fields?.[`${rowFormulaPrefix}${column.id}`] ?? column.options?.[0] ?? "0");
    const formulaValues = Object.fromEntries(columns.filter(item => item.board_id === task.board_id).map(item => [item.name, task.custom_fields?.[item.id] ?? 0]));
    return evaluateFormula(formula, { ...formulaValues, Task: task.title, Progress: task.progress, Priority: task.priority, Department: task.department });
  };
  const customValue = (task: any, key: string, configuration?: ReportConfig) => {
    if (key.startsWith("col:")) {
      const column = columns.find(item => item.id === key.slice("col:".length) && item.board_id === task.board_id);
      return column ? columnValue(task, column) : undefined;
    }
    if (key.startsWith("map:")) {
      const mapping = configuration?.fieldMappings?.find(item => `map:${item.id}` === key) ?? fieldMappings.find(item => `map:${item.id}` === key);
      const columnId = mapping?.columnByBoard[String(task.board_id ?? "")];
      const column = columns.find(item => item.id === columnId && item.board_id === task.board_id);
      return column ? columnValue(task, column) : undefined;
    }
    const name = key.slice("field:".length);
    const column = columns.find(item => item.board_id === task.board_id && safeName(item.name) === name);
    if (!column) return undefined;
    return columnValue(task, column);
  };
  const dimensionValue = (task: any, key: string, configuration?: ReportConfig) => {
    if (key === "department") return task.department || "Unassigned";
    if (key === "board") return boardNames.get(task.board_id) ?? "No board";
    if (key === "status") return task.status || "No status";
    if (key === "priority") return task.priority || "No priority";
    if (key === "owner") return task.owner || "Unassigned";
    if (key === "createdMonth") return monthKey(task.created_at);
    if (key === "dueMonth") return monthKey(task.due);
    return customValue(task, key, configuration) ?? "Empty";
  };
  const metricValue = (task: any, key: string, configuration?: ReportConfig) => {
    if (key === "task_count") return 1;
    if (key === "progress") return Number(task.progress ?? 0);
    const value = customValue(task, key, configuration);
    const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const isNumericField = (key: string, configuration: Pick<ReportConfig, "boardIds" | "fieldMappings">) => {
    if (key === "task_count" || key === "progress") return true;
    if (key.startsWith("map:")) return configuration.fieldMappings?.some(mapping => `map:${mapping.id}` === key && mapping.role === "measure") ?? false;
    if (key.startsWith("col:")) return columns.some(column => column.id === key.slice("col:".length) && configuration.boardIds?.includes(column.board_id) && ["number", "progress", "formula"].includes(column.column_type));
    const name = key.slice("field:".length);
    return columns.some(column => configuration.boardIds?.includes(column.board_id) && safeName(column.name) === name && ["number", "progress", "formula"].includes(column.column_type));
  };
  const reportTasks = (configuration: ReportConfig) => {
    const ids = configuration.boardIds ?? [];
    const since = configuration.dateRange && configuration.dateRange !== "all" ? Date.now() - Number.parseInt(configuration.dateRange, 10) * 86_400_000 : 0;
    const candidates = tasks.filter(task => {
      if (!ids.length || !task.board_id || !ids.includes(task.board_id)) return false;
      if (configuration.departments?.length && !configuration.departments.includes(task.department)) return false;
      if (since) { const created = Date.parse(task.created_at ?? task.updated_at ?? ""); if (!Number.isFinite(created) || created < since) return false; }
      return true;
    });
    const rules = configuration.filters ?? [];
    if (!rules.length) return candidates;
    return candidates.filter(task => {
      const matches = rules.map(rule => {
        const raw = isNumericField(rule.field, configuration)
          ? metricValue(task, rule.field, configuration)
          : dimensionValue(task, rule.field, configuration);
        const text = String(raw ?? "").trim();
        if (rule.operator === "is_empty") return !text;
        if (rule.operator === "is_not_empty") return Boolean(text);
        const target = rule.value.trim();
        if (rule.operator === "greater_than" || rule.operator === "less_than") {
          if (!text) return false;
          const number = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/,/g, ""));
          const expected = Number(target.replace(/,/g, ""));
          return Number.isFinite(number) && Number.isFinite(expected) && (rule.operator === "greater_than" ? number > expected : number < expected);
        }
        const actual = text.toLocaleLowerCase(); const expected = target.toLocaleLowerCase();
        if (rule.operator === "contains") return actual.includes(expected);
        if (rule.operator === "not_contains") return !actual.includes(expected);
        return rule.operator === "not_equals" ? actual !== expected : actual === expected;
      });
      return configuration.filterLogic === "any" ? matches.some(Boolean) : matches.every(Boolean);
    });
  };
  const makeRows = (configuration: ReportConfig) => {
    const items = reportTasks(configuration);
    const groups = new Map<string, { sum: number; count: number; series: Record<string, number> }>();
    const metric = configuration.metricField ?? "task_count";
    const aggregationType = configuration.aggregation ?? "count";
    const histogramWidth = Number(configuration.binWidth);
    items.forEach(task => {
      const groupedValue = dimensionValue(task, configuration.dimension, configuration);
      let label = groupedValue === null || groupedValue === undefined || groupedValue === "" ? "Empty" : String(groupedValue);
      if (configuration.chartType === "histogram") {
        const numeric = typeof groupedValue === "number" ? groupedValue : Number(String(groupedValue ?? "").replace(/,/g, ""));
        if (!Number.isFinite(numeric) || !Number.isFinite(histogramWidth) || histogramWidth <= 0) return;
        const low = Math.floor(numeric / histogramWidth) * histogramWidth;
        const precision = Math.min(6, (String(histogramWidth).split(".")[1] ?? "").length);
        label = `${low.toFixed(precision)} – ${(low + histogramWidth).toFixed(precision)}`;
      }
      const rawValue = metricValue(task, metric, configuration);
      const value = aggregationType === "count" ? 1 : rawValue;
      if (value === null) return;
      const current = groups.get(label) ?? { sum: 0, count: 0, series: {} };
      current.sum += value; current.count += 1;
      const series = String(dimensionValue(task, configuration.seriesBy ?? "status", configuration) || "Empty");
      current.series[series] = (current.series[series] ?? 0) + (aggregationType === "count" ? 1 : value);
      groups.set(label, current);
    });
    const rows = [...groups.entries()].map(([label, group]) => ({ label, value: aggregationType === "count" ? group.count : aggregationType === "average" ? group.sum / Math.max(1, group.count) : group.sum, series: group.series }));
    const values = items.map(task => metricValue(task, metric, configuration)).filter((value): value is number => value !== null);
    const totalValue = aggregationType === "count" ? (configuration.chartType === "histogram" ? rows.reduce((sum, row) => sum + row.value, 0) : items.length) : aggregationType === "average" ? values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length) : values.reduce((sum, value) => sum + value, 0);
    if (configuration.chartType === "histogram") rows.sort((a, b) => Number.parseFloat(a.label) - Number.parseFloat(b.label));
    else if (["createdMonth", "dueMonth"].includes(configuration.dimension)) rows.sort((a, b) => { const aDate = Date.parse(`1 ${a.label}`), bDate = Date.parse(`1 ${b.label}`); return aDate - bDate; });
    else rows.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    const matchingRows = configuration.chartType === "histogram" && aggregationType === "count" ? rows.reduce((sum, row) => sum + row.value, 0) : items.length;
    return { rows, total: matchingRows, totalValue };
  };

  const resetForm = () => { setReportName(""); setDimension(""); setChartType(""); setMetricField(""); setAggregation(""); setSeriesBy(""); setDateRange(""); setBinWidth(""); setFieldMappings([]); setMappingName(""); setMappingColumns({}); setFilters([]); setFilterLogic("all"); setSelectedBoards([]); setEditingId(null); };
  const toggleBoard = (id: string) => setSelectedBoards(current => {
    return current.includes(id) ? current.filter(boardId => boardId !== id) : [...current, id];
  });
  const addFieldMapping = () => {
    const name = mappingName.trim();
    if (!selectedBoards.length) return notify("Select department boards before mapping their columns.");
    if (!name) return notify("Enter a name for this mapped field.");
    const columnByBoard = Object.fromEntries(selectedBoards.map(boardId => [boardId, mappingColumns[boardId] ?? ""]).filter(([, columnId]) => Boolean(columnId)));
    if (!Object.keys(columnByBoard).length) return notify("Choose at least one source column to map.");
    const mapping: FieldMapping = { id: crypto.randomUUID(), name, role: mappingRole, columnByBoard };
    setFieldMappings(current => [...current.filter(item => !(item.name.toLocaleLowerCase() === name.toLocaleLowerCase() && item.role === mappingRole)), mapping]);
    setMappingName(""); setMappingColumns({});
  };
  const updateFieldMapping = (mappingId: string, boardId: string, columnId: string) => {
    setFieldMappings(current => current.map(mapping => mapping.id === mappingId ? { ...mapping, columnByBoard: { ...mapping.columnByBoard, [boardId]: columnId } } : mapping));
  };
  const addFilterRule = () => setFilters(current => [...current, { id: crypto.randomUUID(), field: filterFields[0]?.value ?? "department", operator: "equals", value: "" }]);
  const updateFilterRule = (id: string, update: Partial<ReportFilter>) => setFilters(current => current.map(filter => filter.id === id ? { ...filter, ...update } : filter));
  const saveReport = async () => {
    if (!supabase) return notify("Connect to the workspace before saving reports.");
    const title = reportName.trim(); if (!title) return notify("Enter a report name before saving.");
    if (!selectedBoards.length || !chartType || (chartType !== "kpi" && !dimension) || !metricField || !aggregation || !dateRange || (chartType === "stacked" && !seriesBy) || (chartType === "histogram" && !(Number(binWidth) > 0))) return notify("Select board sources, fields, and chart settings before saving.");
    setBusy(true);
    const configuration: ReportConfig = { dimension: dimension || "department", chartType, boardIds: selectedBoards, metricField, aggregation, seriesBy, dateRange, fieldMappings, binWidth: Number(binWidth) || undefined, filters, filterLogic };
    const result = editingId
      ? await supabase.from("saved_views").update({ name: title, configuration }).eq("id", editingId).eq("owner_id", user.id)
      : await supabase.from("saved_views").insert({ owner_id: user.id, name: title, view_type: "dashboard", configuration });
    setBusy(false);
    if (result.error) return notify(`Report was not saved: ${result.error.message}`);
    notify(editingId ? "Report updated online." : "Report added to Reports."); resetForm(); await load();
  };
  const editReport = (report: SavedReport) => {
    const config = normaliseConfig(report.configuration);
    setEditingId(report.id); setReportName(report.name); setDimension(config.dimension); setChartType(config.chartType); setMetricField(config.metricField ?? "task_count"); setAggregation(config.aggregation ?? "count"); setSeriesBy(config.seriesBy ?? "status"); setDateRange(config.dateRange ?? "all"); setBinWidth(config.binWidth ? String(config.binWidth) : ""); setFieldMappings(config.fieldMappings ?? []); setMappingColumns({}); setFilters(config.filters ?? []); setFilterLogic(config.filterLogic ?? "all"); setSelectedBoards(config.boardIds ?? []);
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
    <section className="reports-hero"><div className="reports-hero-copy"><div className="reports-eyebrow"><Layers3 size={14}/> BUSINESS INTELLIGENCE</div><h2>BI Dashboard</h2><p>Create visual reports from the department boards you choose. Board fields and chart logic are never connected automatically.</p></div><div className="reports-hero-actions"><button className="primary-button" onClick={() => document.querySelector(".reports-builder")?.scrollIntoView({ behavior: "smooth", block: "start" })}><Plus size={15}/> Create visual</button><button className="secondary-button" onClick={() => void Promise.all([refreshTasks(), load()])}><RefreshCw size={15}/> Refresh data</button><button className="secondary-button" onClick={exportReports}><Download size={15}/> Export reports</button><label className="secondary-button upload-button"><FileUp size={15}/> Import JSON<input type="file" accept="application/json,.json" onChange={importReports}/></label></div></section>

    <section className="reports-kpis" aria-label="Report data summary"><article><span>Accessible boards</span><b>{sources.length}</b><small>Across {availableDepartments.length} departments</small></article><article><span>Selected source rows</span><b>{matchingTaskCount}</b><small>{selectedBoards.length ? "From boards you selected" : "No source data selected"}</small></article><article><span>Saved reports</span><b>{reports.length}</b><small>Stored in your workspace account</small></article><article className="reports-refresh-card"><label><input type="checkbox" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)}/> Auto-refresh</label><small>Updates every minute; live task changes update automatically.</small></article></section>

    <section className="panel reports-builder" id="reports-builder"><div className="reports-section-heading"><div><div className="reports-eyebrow">REPORT DESIGNER</div><h3>{editingId ? "Edit report" : "Create a report"}</h3><p>Choose the boards, measures, and visual that should appear together.</p></div><span className="reports-source-pill"><Layers3 size={14}/>{selectedDepartmentCount} departments · {selectedSourceCount} boards</span></div>
      <div className="reports-form-grid"><label className="reports-field reports-title-field">Report name<input maxLength={120} value={reportName} onChange={event => setReportName(event.target.value)} placeholder="e.g. Campaign delivery overview"/></label>
        <label className="reports-field">Chart type<select value={chartType} onChange={event => { const next = event.target.value; setChartType(next); if (next === "histogram") { setDimension(""); setMetricField("task_count"); setAggregation("count"); setBinWidth(""); setSeriesBy(""); } else if (next === "kpi") { setDimension(""); setSeriesBy(""); } else if (next === "stacked" && aggregation === "average") setAggregation("sum"); }}><option value="">Choose chart type</option>{chartTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        {chartType !== "kpi" && <label className="reports-field">{chartType === "histogram" ? "Numeric value field" : "Group / category"}<select value={dimension} onChange={event => setDimension(event.target.value)}><option value="">Choose a field</option>{(chartType === "histogram" ? metricFields.filter(field => field.value !== "task_count") : dimensions).map(field => <option value={field.value} key={field.value}>{field.label}</option>)}</select></label>}
        {chartType === "histogram" ? <label className="reports-field">Bin width<input type="number" min="0.000001" step="any" value={binWidth} onChange={event => setBinWidth(event.target.value)} placeholder="Enter numeric interval"/></label> : <><label className="reports-field">Measure<select value={metricField} onChange={event => setMetricField(event.target.value)}><option value="">Choose a measure</option>{metricFields.map(field => <option value={field.value} key={field.value}>{field.label}</option>)}</select></label><label className="reports-field">Calculation<select value={aggregation} onChange={event => setAggregation(event.target.value as typeof aggregation)}><option value="">Choose calculation</option><option value="count">Count records</option><option value="sum">Sum values</option>{chartType !== "stacked" && <option value="average">Average values</option>}</select></label></>}
        {chartType === "stacked" && <label className="reports-field">Stack series by<select value={seriesBy} onChange={event => setSeriesBy(event.target.value)}><option value="">Choose series</option>{dimensions.map(field => <option value={field.value} key={field.value}>{field.label}</option>)}</select></label>}
        <label className="reports-field">Date window<select value={dateRange} onChange={event => setDateRange(event.target.value)}><option value="">Choose a date window</option>{dateRanges.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      </div>
      <div className="reports-source-picker"><div className="reports-source-head"><div><b>Connect department boards</b><small>Only boards granted to your account appear here. Ask your Super Admin for additional department access.</small></div><label className="reports-all-source"><input type="checkbox" checked={allBoardsSelected} onChange={() => setSelectedBoards(allBoardsSelected ? [] : sources.map(source => source.id))}/> Select all accessible boards</label></div>
        <label className="reports-source-search"><Search size={15}/><input type="search" value={sourceSearch} onChange={event => setSourceSearch(event.target.value)} placeholder="Search departments and boards"/></label>
        {sourcesLoading ? <div className="reports-no-sources"><b>Loading accessible boards…</b></div> : sourceError ? <div className="reports-no-sources"><b>Boards could not be loaded.</b><span>{sourceError}</span><button className="secondary-button" onClick={() => void load()}>Retry</button></div> : groupedSources.length ? <div className="reports-source-groups">{groupedSources.map(([department, boards]) => <section key={department}><div className="reports-department-source"><b>{department}</b><small>{boards.length} {boards.length === 1 ? "board" : "boards"}</small></div>{boards.map(board => <label className="reports-board-source" key={board.id}><input type="checkbox" checked={selectedBoards.includes(board.id)} onChange={() => toggleBoard(board.id)}/><span><b>{board.name}</b><small>{board.departmentName}</small></span></label>)}</section>)}</div> : <div className="reports-no-sources"><b>{sourceSearch.trim() ? "No boards match that search." : "No boards are available to this account."}</b><span>{sourceSearch.trim() ? "Try another department or board name." : "Board access is enforced by Supabase. Ask the Super Admin to grant access to the departments you need."}</span></div>}
        <section className="reports-field-mapper"><div className="reports-mapper-heading"><div><b>Map columns across boards</b><small>Give equivalent columns one shared name so you can chart data even when department headers differ.</small></div><span>{fieldMappings.length} mapped fields</span></div>
          {!selectedBoards.length ? <div className="reports-mapper-empty">Select one or more boards above to map their columns.</div> : <><div className="reports-mapping-form"><label className="reports-field">Shared field name<input value={mappingName} onChange={event => setMappingName(event.target.value)} placeholder="e.g. Revenue"/></label><label className="reports-field">Field use<select value={mappingRole} onChange={event => { setMappingRole(event.target.value as FieldMapping["role"]); setMappingColumns({}); }}><option value="category">Category / label</option><option value="measure">Numeric measure</option></select></label>{selectedBoards.map(boardId => { const board = sources.find(source => source.id === boardId); const available = columns.filter(column => column.board_id === boardId && !column.is_hidden && (mappingRole === "category" ? column.column_type !== "attachment" : ["number", "progress", "formula"].includes(column.column_type))); return <label className="reports-field" key={boardId}>{board?.departmentName} · {board?.name}<select value={mappingColumns[boardId] ?? ""} onChange={event => setMappingColumns(current => ({ ...current, [boardId]: event.target.value }))}><option value="">Skip this board</option>{available.map(column => <option key={column.id} value={column.id}>{column.name} · {column.column_type}</option>)}</select></label>; })}<button className="secondary-button" type="button" disabled={!mappingName.trim()} onClick={addFieldMapping}><Plus size={14}/> Add mapping</button></div>
            {fieldMappings.length > 0 && <div className="reports-mapped-fields">{fieldMappings.map(mapping => <article className="reports-mapped-field" key={mapping.id}><div className="reports-mapped-field-title"><b>{mapping.name}</b><span>{mapping.role === "measure" ? "Numeric measure" : "Category"}</span><button className="icon-button report-delete-button" type="button" title={`Remove ${mapping.name} mapping`} aria-label={`Remove ${mapping.name} mapping`} onClick={() => setFieldMappings(current => current.filter(item => item.id !== mapping.id))}><Trash2 size={14}/></button></div><div className="reports-mapped-field-sources">{selectedBoards.map(boardId => { const board = sources.find(source => source.id === boardId); const available = columns.filter(column => column.board_id === boardId && !column.is_hidden && (mapping.role === "category" ? column.column_type !== "attachment" : ["number", "progress", "formula"].includes(column.column_type))); return <label className="reports-field" key={boardId}>{board?.name}<select value={mapping.columnByBoard[boardId] ?? ""} onChange={event => updateFieldMapping(mapping.id, boardId, event.target.value)}><option value="">Skip this board</option>{available.map(column => <option key={column.id} value={column.id}>{column.name} · {column.column_type}</option>)}</select></label>; })}</div></article>)}</div>}
          </>}
        </section>
      </div>
      <section className="reports-filter-builder"><div className="reports-filter-heading"><div><b>Row filters</b><small>Define your own logic for which source rows this visual includes.</small></div><div><label>Match <select value={filterLogic} onChange={event => setFilterLogic(event.target.value as "all" | "any")}><option value="all">all filters</option><option value="any">any filter</option></select></label><button className="secondary-button" type="button" onClick={addFilterRule}><Plus size={14}/> Add filter</button></div></div>
        {filters.length ? <div className="reports-filter-rules">{filters.map(filter => <div className="reports-filter-rule" key={filter.id}><select aria-label="Filter field" value={filter.field} onChange={event => updateFilterRule(filter.id, { field: event.target.value, operator: "equals", value: "" })}><option value="">Choose a field</option>{filterFields.map(field => <option value={field.value} key={field.value}>{field.label}</option>)}</select><select aria-label="Filter condition" value={filter.operator} onChange={event => updateFilterRule(filter.id, { operator: event.target.value as ReportFilter["operator"] })}>{<><option value="equals">is</option><option value="not_equals">is not</option><option value="contains">contains</option><option value="not_contains">does not contain</option>{isNumericField(filter.field, { boardIds: selectedBoards, fieldMappings }) && <><option value="greater_than">is greater than</option><option value="less_than">is less than</option></>}<option value="is_empty">is empty</option><option value="is_not_empty">is not empty</option></>}</select>{filter.operator !== "is_empty" && filter.operator !== "is_not_empty" && <input aria-label="Filter value" value={filter.value} onChange={event => updateFilterRule(filter.id, { value: event.target.value })} placeholder={isNumericField(filter.field, { boardIds: selectedBoards, fieldMappings }) ? "Value" : "Text to match"}/>}<button className="icon-button report-delete-button" type="button" aria-label="Remove filter" title="Remove filter" onClick={() => setFilters(current => current.filter(item => item.id !== filter.id))}><Trash2 size={14}/></button></div>)}</div> : <div className="reports-filter-empty">No filters applied. Every row on the selected boards is included.</div>}
      </section>
      <div className="reports-builder-footer"><span>Only records from your selected boards and workspace permissions are included.</span><div>{editingId && <button className="secondary-button" onClick={resetForm}><X size={15}/> Cancel edit</button>}<button className="primary-button" disabled={busy || !reportName.trim() || !selectedBoards.length || !chartType || (chartType !== "kpi" && !dimension) || !metricField || !aggregation || !dateRange || (chartType === "stacked" && !seriesBy) || (chartType === "histogram" && !(Number(binWidth) > 0))} onClick={() => void saveReport()}><Save size={15}/>{busy ? "Saving…" : editingId ? "Save changes" : "Add to Reports"}</button></div></div>
    </section>

    <div className="reports-canvas-heading"><div><div className="reports-eyebrow">LIVE CANVAS</div><h3>Dashboard canvas</h3><p>Saved visuals update from the board sources chosen for each report.</p></div><span>{reports.length} {reports.length === 1 ? "report" : "reports"}</span></div>
    {reports.length ? <div className="reports-grid">{reports.map(report => {
      const config = normaliseConfig(report.configuration); const { rows, total, totalValue } = makeRows(config);
      const metric = config.fieldMappings?.find(mapping => `map:${mapping.id}` === config.metricField)?.name ?? metricFields.find(field => field.value === config.metricField)?.label ?? (config.metricField === "task_count" ? "Tasks" : config.metricField === "progress" ? "Progress (%)" : config.metricField?.slice(6));
      const sourceCount = config.boardIds?.length ?? 0;
      const departmentCount = new Set(sources.filter(source => config.boardIds?.includes(source.id)).map(source => source.departmentName)).size;
      return <article className={`panel report-card report-card-${config.chartType}`} key={report.id}><header className="report-card-head"><div><span className="report-type-label">{chartTypes.find(([type]) => type === config.chartType)?.[1] ?? "Report"}</span><h4>{report.name}</h4><p>{departmentCount} departments · {sourceCount} boards · {total} matching rows</p></div><div className="report-card-actions"><button className="icon-button" title="Export chart data as CSV" aria-label={`Export ${report.name} as CSV`} onClick={() => exportCsv(report)}><Download size={15}/></button><button className="icon-button" title="Edit report" aria-label={`Edit ${report.name}`} onClick={() => editReport(report)}><Save size={15}/></button><button className="icon-button report-delete-button" title="Delete report" aria-label={`Delete ${report.name}`} onClick={() => void removeReport(report)}><Trash2 size={15}/></button></div></header><ReportVisual type={config.chartType} rows={rows} totalLabel={total} totalValue={totalValue} metricLabel={metric ?? "Tasks"}/></article>;
    })}</div> : <section className="panel reports-first-run"><div className="reports-first-icon"><BarChart3 size={25}/></div><h3>Your BI workspace is ready</h3><p>Select boards from multiple departments, choose a measure and chart type, then add your first report.</p><button className="primary-button" onClick={() => document.querySelector(".reports-builder")?.scrollIntoView({ behavior: "smooth", block: "start" })}><Plus size={15}/> Start building</button></section>}
    <div className="reports-footnote">Reports show data available to your signed-in account. Board permissions are enforced by Supabase row-level security.</div>
  </div>;
}
