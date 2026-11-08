import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { BarChart3, Download, FileSpreadsheet, FileUp, Layers3, Plus, Printer, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { evaluateFormula } from "./AdvancedWorkspace";

type BoardSource = { id: string; name: string; departmentId: string | null; departmentName: string };
type ReportColumn = { id: string; board_id: string; name: string; column_type: string; options?: string[]; is_hidden?: boolean };
type FieldMapping = { id: string; name: string; role: "category" | "measure"; columnByBoard: Record<string, string> };
type Aggregation = "sum" | "count" | "average" | "min" | "max";
type PivotValueField = { field: string; aggregation: Aggregation };
type PivotFieldArea = "rows" | "columns" | "values" | "filters";
type ReportFilter = { id: string; field: string; operator: "equals" | "not_equals" | "contains" | "not_contains" | "greater_than" | "less_than" | "is_empty" | "is_not_empty"; value: string };
type ReportConfig = {
  dimension: string;
  chartType: string;
  boardIds?: string[];
  departments?: string[];
  metricField?: string;
  aggregation?: Aggregation;
  seriesBy?: string;
  dateRange?: string;
  dateFrom?: string;
  dateTo?: string;
  fieldMappings?: FieldMapping[];
  binWidth?: number;
  filters?: ReportFilter[];
  filterLogic?: "all" | "any";
  pivotRows?: string[];
  pivotColumns?: string[];
  pivotValues?: PivotValueField[];
  filterFields?: string[];
  visualizations?: string[];
};
type SavedReport = { id: string; name: string; configuration: ReportConfig; created_at?: string };
type ReportRow = { label: string; value: number; x?: number; series?: Record<string, number> };
type PivotStat = { sum: number; count: number; min: number; max: number };
type PivotResult = { rowFields: string[]; columnFields: string[]; values: PivotValueField[]; columnGroups: Array<{ key: string; label: string }>; rows: Array<{ key: string; path: string[]; subtotal: boolean; total: boolean; cells: Record<string, number | null> }>; grandTotal: Record<string, number | null>; matchingRows: number };
type Props = { supabase: SupabaseClient | null; user: User; tasks: any[]; refreshTasks: () => Promise<void>; notify: (message: string) => void };

const palette = ["#315be8", "#19a77b", "#f1ad18", "#9b63dc", "#e66f62", "#12a8b6", "#69758c", "#dc6a9b"];
const rowFormulaPrefix = "__mindtech_row_formula__:";
const chartTypes = [
  ["pivot", "Pivot table"], ["bar", "Bar chart"], ["column", "Column chart"], ["stacked", "Stacked bar"], ["stackedColumn", "Stacked column"], ["line", "Line chart"], ["area", "Area chart"],
  ["pie", "Pie chart"], ["donut", "Donut chart"], ["funnel", "Funnel chart"], ["histogram", "Histogram"], ["scatter", "Scatter plot"], ["table", "Summary table"], ["kpi", "KPI cards"],
] as const;
const baseDimensions = [
  ["department", "Department"], ["board", "Board"], ["status", "Status"], ["priority", "Priority"],
  ["owner", "Owner"], ["createdMonth", "Created month"], ["dueMonth", "Due month"],
] as const;
const dateRanges = [["all", "All time"], ["30d", "Last 30 days"], ["90d", "Last 90 days"], ["365d", "Last 12 months"], ["custom", "Custom date range"]] as const;
const normaliseConfig = (raw: any): ReportConfig => ({
  dimension: typeof raw?.dimension === "string" ? raw.dimension : "status",
  chartType: raw?.chartType === "list" ? "table" : typeof raw?.chartType === "string" ? raw.chartType : "bar",
  boardIds: Array.isArray(raw?.boardIds) ? raw.boardIds.filter((id: unknown) => typeof id === "string") : [],
  departments: Array.isArray(raw?.departments) ? raw.departments.filter((name: unknown) => typeof name === "string") : [],
  metricField: typeof raw?.metricField === "string" ? raw.metricField : "task_count",
  aggregation: ["sum", "average", "min", "max"].includes(raw?.aggregation) ? raw.aggregation : "count",
  seriesBy: typeof raw?.seriesBy === "string" ? raw.seriesBy : "status",
  dateRange: typeof raw?.dateRange === "string" ? raw.dateRange : "all",
  dateFrom: typeof raw?.dateFrom === "string" ? raw.dateFrom : undefined,
  dateTo: typeof raw?.dateTo === "string" ? raw.dateTo : undefined,
  fieldMappings: Array.isArray(raw?.fieldMappings) ? raw.fieldMappings.filter((mapping: any) => mapping && typeof mapping.id === "string" && typeof mapping.name === "string" && (mapping.role === "category" || mapping.role === "measure")).map((mapping: any) => ({ id: mapping.id, name: mapping.name, role: mapping.role as FieldMapping["role"], columnByBoard: mapping.columnByBoard && typeof mapping.columnByBoard === "object" ? Object.fromEntries(Object.entries(mapping.columnByBoard).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : {} })) : [],
  binWidth: Number.isFinite(Number(raw?.binWidth)) && Number(raw?.binWidth) > 0 ? Number(raw.binWidth) : undefined,
  filters: Array.isArray(raw?.filters) ? raw.filters.filter((filter: any) => filter && typeof filter.field === "string" && typeof filter.value === "string").map((filter: any) => ({ id: typeof filter.id === "string" ? filter.id : crypto.randomUUID(), field: filter.field, operator: ["equals", "not_equals", "contains", "not_contains", "greater_than", "less_than", "is_empty", "is_not_empty"].includes(filter.operator) ? filter.operator : "equals", value: filter.value })) : [],
  filterLogic: raw?.filterLogic === "any" ? "any" : "all",
  pivotRows: Array.isArray(raw?.pivotRows) ? raw.pivotRows.filter((field: unknown) => typeof field === "string") : undefined,
  pivotColumns: Array.isArray(raw?.pivotColumns) ? raw.pivotColumns.filter((field: unknown) => typeof field === "string") : undefined,
  pivotValues: Array.isArray(raw?.pivotValues) ? raw.pivotValues.filter((value: any) => value && typeof value.field === "string").map((value: any) => ({ field: value.field, aggregation: ["sum", "count", "average", "min", "max"].includes(value.aggregation) ? value.aggregation : "count" })) : undefined,
  filterFields: Array.isArray(raw?.filterFields) ? raw.filterFields.filter((field: unknown) => typeof field === "string") : undefined,
  visualizations: Array.isArray(raw?.visualizations) ? raw.visualizations.filter((type: unknown) => typeof type === "string") : [],
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

function downloadBlobFile(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function makeStoredZip(files: Array<{ name: string; content: string }>) {
  const encoder = new TextEncoder();
  const crc32 = (bytes: Uint8Array) => { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; };
  const locals: Uint8Array[] = []; const centrals: Uint8Array[] = []; let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name); const data = encoder.encode(file.content); const checksum = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length); const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true); localView.setUint16(6, 0, true); localView.setUint16(8, 0, true); localView.setUint16(10, 0, true); localView.setUint16(12, 33, true); localView.setUint32(14, checksum, true); localView.setUint32(18, data.length, true); localView.setUint32(22, data.length, true); localView.setUint16(26, name.length, true); localView.setUint16(28, 0, true); local.set(name, 30); local.set(data, 30 + name.length); locals.push(local);
    const central = new Uint8Array(46 + name.length); const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true); centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true); centralView.setUint16(8, 0, true); centralView.setUint16(10, 0, true); centralView.setUint16(12, 0, true); centralView.setUint16(14, 33, true); centralView.setUint32(16, checksum, true); centralView.setUint32(20, data.length, true); centralView.setUint32(24, data.length, true); centralView.setUint16(28, name.length, true); centralView.setUint16(30, 0, true); centralView.setUint16(32, 0, true); centralView.setUint16(34, 0, true); centralView.setUint16(36, 0, true); centralView.setUint32(38, 0, true); centralView.setUint32(42, offset, true); central.set(name, 46); centrals.push(central);
    offset += local.length;
  }
  const directorySize = centrals.reduce((size, central) => size + central.length, 0); const end = new Uint8Array(22); const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(4, 0, true); endView.setUint16(6, 0, true); endView.setUint16(8, files.length, true); endView.setUint16(10, files.length, true); endView.setUint32(12, directorySize, true); endView.setUint32(16, offset, true); endView.setUint16(20, 0, true);
  const output = new Uint8Array(offset + directorySize + end.length); let position = 0;
  [...locals, ...centrals, end].forEach(part => { output.set(part, position); position += part.length; });
  return output;
}

function PivotTableView({ model, fieldName }: { model: PivotResult; fieldName: (field: string) => string }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; descending: boolean } | null>(null);
  const fmt = (value: number | null | undefined) => value === null || value === undefined ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  const valueLabel = (value: PivotValueField) => `${fieldName(value.field)} · ${value.aggregation.toUpperCase()}`;
  const columnGroups = model.columnGroups;
  const rows = model.rows.filter(row => !query.trim() || row.path.join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const sortedRows = sort ? [...rows].sort((a, b) => {
    const aValue = sort.key.startsWith("row:") ? a.path[Number(sort.key.slice(4))] ?? "" : a.cells[sort.key];
    const bValue = sort.key.startsWith("row:") ? b.path[Number(sort.key.slice(4))] ?? "" : b.cells[sort.key];
    const comparison = typeof aValue === "number" && typeof bValue === "number" ? aValue - bValue : String(aValue ?? "").localeCompare(String(bValue ?? ""));
    return sort.descending ? -comparison : comparison;
  }) : rows;
  const toggleSort = (key: string) => setSort(current => current?.key === key ? { key, descending: !current.descending } : { key, descending: false });
  const sortLabel = (key: string, label: string) => <button className="pivot-sort-button" type="button" onClick={() => toggleSort(key)}>{label} {sort?.key === key ? sort.descending ? "↓" : "↑" : "↕"}</button>;
  return <div className="report-pivot-wrap"><div className="report-pivot-toolbar"><label><Search size={14}/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search pivot rows"/></label><small>{sortedRows.length} groups · {model.matchingRows} source rows</small></div><div className="report-data-table report-pivot-scroll"><table className="report-pivot-table"><thead><tr>{model.rowFields.length ? model.rowFields.map((field, index) => <th key={field} rowSpan={2}>{sortLabel(`row:${index}`, fieldName(field))}</th>) : <th rowSpan={2}>Records</th>}{columnGroups.map(group => <th key={group.key} colSpan={model.values.length}>{group.label}</th>)}<th colSpan={model.values.length}>Grand total</th></tr><tr>{columnGroups.flatMap(group => model.values.map((value, index) => <th key={`${group.key}-${index}`}>{sortLabel(`${group.key}::${index}`, valueLabel(value))}</th>))}{model.values.map((value, index) => <th key={`total-${index}`}>{sortLabel(`__grand_total__::${index}`, valueLabel(value))}</th>)}</tr></thead><tbody>{sortedRows.map(row => <tr key={row.key} className={row.subtotal ? "pivot-subtotal-row" : ""}>{model.rowFields.length ? model.rowFields.map((field, index) => <td key={field}>{row.path[index] ?? (index === 0 ? "Subtotal" : "")}</td>) : <td>All records</td>}{columnGroups.flatMap(group => model.values.map((_, index) => <td key={`${group.key}-${index}`}>{fmt(row.cells[`${group.key}::${index}`])}</td>))}{model.values.map((_, index) => <td className="pivot-grand-total-cell" key={`grand-${index}`}>{fmt(row.cells[`__grand_total__::${index}`])}</td>)}</tr>)}</tbody><tfoot><tr>{model.rowFields.length ? <th colSpan={model.rowFields.length}>Grand total · {model.matchingRows} rows</th> : <th>Grand total · {model.matchingRows} rows</th>}{columnGroups.flatMap(group => model.values.map((_, index) => <th key={`${group.key}-${index}`}>{fmt(model.grandTotal[`${group.key}::${index}`])}</th>))}{model.values.map((_, index) => <th key={`grand-${index}`}>{fmt(model.grandTotal[`__grand_total__::${index}`])}</th>)}</tr></tfoot></table></div></div>;
}

function ReportVisual({ type, rows, totalLabel, totalValue, metricLabel, pivot, fieldName }: { type: string; rows: ReportRow[]; totalLabel: number; totalValue: number; metricLabel: string; pivot?: PivotResult; fieldName: (field: string) => string }) {
  if (type === "kpi") {
    return <div className="report-kpi"><span>{metricLabel}</span><strong>{new Intl.NumberFormat().format(Number(totalValue.toFixed(2)))}</strong><small>{totalLabel.toLocaleString()} matching rows</small><i><BarChart3 size={20}/></i></div>;
  }
  if (type === "pivot" && pivot) return <PivotTableView model={pivot} fieldName={fieldName}/>;
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
  if (type === "scatter") {
    const width = 720, height = 290, pad = 35;
    const xMin = Math.min(...rows.map(row => row.x ?? 0)), xMax = Math.max(...rows.map(row => row.x ?? 0));
    const yMin = Math.min(...rows.map(row => row.value)), yMax = Math.max(...rows.map(row => row.value));
    return <div className="report-chart-scroll"><svg className="report-line-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Scatter plot of ${metricLabel}`}><line x1={pad} x2={width-pad} y1={height-pad} y2={height-pad} className="report-gridline"/><line x1={pad} x2={pad} y1={pad} y2={height-pad} className="report-gridline"/>{rows.slice(0, 500).map((row, index) => { const x=pad+(width-2*pad)*((row.x??xMin)-xMin)/(xMax-xMin||1); const y=height-pad-(height-2*pad)*(row.value-yMin)/(yMax-yMin||1); return <g key={`${row.label}-${index}`}><title>{`${row.label}: ${row.x}, ${row.value}`}</title><circle cx={x} cy={y} r="4" fill={palette[index%palette.length]} className="report-line-point"/></g>; })}<text x={width/2} y={height-6} textAnchor="middle" className="report-axis-label">X value</text><text x={10} y={height/2} className="report-axis-label">Y</text></svg></div>;
  }
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
  if (type === "stackedColumn") {
    const keys = [...new Set(rows.flatMap(row => Object.keys(row.series ?? {})))];
    const max = Math.max(1, ...rows.map(row => row.value));
    return <div className="report-columns report-stacked-columns">{rows.map(row => <div className="report-column" key={row.label}><b>{new Intl.NumberFormat().format(Number(row.value.toFixed(2)))}</b><div>{keys.map((key, index) => <i key={key} title={`${key}: ${row.series?.[key] ?? 0}`} style={{ height: `${Math.max(0,(row.series?.[key]??0)/max*100)}%`, background: palette[index%palette.length] }}/>)}</div><span>{row.label.length>12?`${row.label.slice(0,11)}…`:row.label}</span></div>)}</div>;
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
  const [, setMetricField] = useState("");
  const [, setAggregation] = useState<Aggregation | "">("");
  const [seriesBy, setSeriesBy] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [binWidth, setBinWidth] = useState("");
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [mappingName, setMappingName] = useState("");
  const [mappingRole, setMappingRole] = useState<FieldMapping["role"]>("category");
  const [mappingColumns, setMappingColumns] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<ReportFilter[]>([]);
  const [filterLogic, setFilterLogic] = useState<"all" | "any">("all");
  const [rowFields, setRowFields] = useState<string[]>([]);
  const [columnFields, setColumnFields] = useState<string[]>([]);
  const [valueFields, setValueFields] = useState<PivotValueField[]>([]);
  const [filterFieldKeys, setFilterFieldKeys] = useState<string[]>([]);
  const [additionalVisuals, setAdditionalVisuals] = useState<string[]>([]);
  const [fieldToAdd, setFieldToAdd] = useState("");
  const [fieldAreaToAdd, setFieldAreaToAdd] = useState<PivotFieldArea>("rows");
  const [selectedBoards, setSelectedBoards] = useState<string[]>([]);
  const [sourceDepartment, setSourceDepartment] = useState("");
  const [sourceBoard, setSourceBoard] = useState("");
  const [sourceSearch, setSourceSearch] = useState("");
  const [fieldSearch, setFieldSearch] = useState("");
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
  const groupedSources = useMemo(() => {
    const groups = new Map<string, BoardSource[]>();
    sources.filter(source => !sourceSearch.trim() || `${source.name} ${source.departmentName}`.toLocaleLowerCase().includes(sourceSearch.trim().toLocaleLowerCase())).forEach(source => groups.set(source.departmentName, [...(groups.get(source.departmentName) ?? []), source]));
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [sources, sourceSearch]);
  const allBoardsSelected = sources.length > 0 && selectedBoards.length === sources.length;
  const selectedSourceCount = selectedBoards.length;
  const selectedDepartmentCount = new Set(sources.filter(source => selectedBoards.includes(source.id)).map(source => source.departmentName)).size;
  const boardNames = useMemo(() => new Map(sources.map(source => [source.id, source.name])), [sources]);
  const availableDepartments = [...new Set(sources.map(source => source.departmentName))].sort((a, b) => a.localeCompare(b));
  const pickerDepartment = availableDepartments.includes(sourceDepartment) ? sourceDepartment : availableDepartments[0] ?? "";
  const tablesForDepartment = sources.filter(source => source.departmentName === pickerDepartment);
  const pickerBoardId = tablesForDepartment.some(source => source.id === sourceBoard) ? sourceBoard : tablesForDepartment[0]?.id ?? "";
  const allFieldChoices = [...new Map([...dimensions, ...metricFields].map(field => [field.value, field])).values()];
  const visibleFieldChoices = allFieldChoices.filter(field => !fieldSearch.trim() || `${field.label} ${field.value}`.toLocaleLowerCase().includes(fieldSearch.trim().toLocaleLowerCase()));
  const selectedVisualizations = [...new Set([chartType, ...additionalVisuals].filter(Boolean))];
  const invalidCustomDateRange = dateRange === "custom" && ((!dateFrom && !dateTo) || Boolean(dateFrom && dateTo && dateFrom > dateTo));

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
    const since = configuration.dateRange && configuration.dateRange !== "all" && configuration.dateRange !== "custom" ? Date.now() - Number.parseInt(configuration.dateRange, 10) * 86_400_000 : 0;
    const dateFromTime = configuration.dateRange === "custom" && configuration.dateFrom ? Date.parse(`${configuration.dateFrom}T00:00:00`) : 0;
    const dateToTime = configuration.dateRange === "custom" && configuration.dateTo ? Date.parse(`${configuration.dateTo}T23:59:59.999`) : 0;
    const candidates = tasks.filter(task => {
      if (!ids.length || !task.board_id || !ids.includes(task.board_id)) return false;
      if (configuration.departments?.length && !configuration.departments.includes(task.department)) return false;
      if (since) { const created = Date.parse(task.created_at ?? task.updated_at ?? ""); if (!Number.isFinite(created) || created < since) return false; }
      if (configuration.dateRange === "custom" && (dateFromTime || dateToTime)) { const created = Date.parse(task.created_at ?? task.updated_at ?? ""); if (!Number.isFinite(created) || (dateFromTime && created < dateFromTime) || (dateToTime && created > dateToTime)) return false; }
      return true;
    });
    const rules = (configuration.filters ?? []).filter(rule => rule.operator === "is_empty" || rule.operator === "is_not_empty" || Boolean(rule.value.trim()));
    if (!rules.length) return candidates;
    return candidates.filter(task => {
      const matches = rules.map(rule => {
        const raw = isNumericField(rule.field, configuration)
          ? metricValue(task, rule.field, configuration)
          : rawFieldValue(task, rule.field, configuration);
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
  const rawFieldValue = (task: any, key: string, configuration: ReportConfig): unknown => {
    if (key === "department") return task.department;
    if (key === "board") return boardNames.get(task.board_id) ?? "No board";
    if (key === "status") return task.status;
    if (key === "priority") return task.priority;
    if (key === "owner") return task.owner;
    if (key === "createdMonth") return monthKey(task.created_at);
    if (key === "dueMonth") return monthKey(task.due);
    return customValue(task, key, configuration);
  };
  const fieldText = (task: any, key: string, configuration: ReportConfig) => {
    const value = rawFieldValue(task, key, configuration);
    return value === null || value === undefined || value === "" ? "Empty" : String(value);
  };
  const valueSpecifications = (configuration: ReportConfig): PivotValueField[] => configuration.pivotValues?.length ? configuration.pivotValues : [{ field: configuration.metricField ?? "task_count", aggregation: configuration.aggregation ?? "count" }];
  const rowSpecification = (configuration: ReportConfig) => configuration.pivotRows ?? (configuration.dimension ? [configuration.dimension] : []);
  const columnSpecification = (configuration: ReportConfig) => configuration.pivotColumns ?? (configuration.seriesBy ? [configuration.seriesBy] : []);
  const fieldLabel = (field: string, configuration?: ReportConfig) => {
    const mapped = configuration?.fieldMappings?.find(item => `map:${item.id}` === field) ?? fieldMappings.find(item => `map:${item.id}` === field);
    if (mapped) return mapped.name;
    const column = field.startsWith("col:") ? columns.find(item => item.id === field.slice(4)) : field.startsWith("field:") ? columns.find(item => safeName(item.name) === field.slice(6)) : undefined;
    if (column) return `${boardNames.get(column.board_id) ?? "Board"} · ${column.name}`;
    return [...baseDimensions].find(([key]) => key === field)?.[1] ?? field.replace(/^field:/, "");
  };
  const makePivot = (configuration: ReportConfig): PivotResult => {
    const items = reportTasks(configuration);
    const rowFieldsForPivot = rowSpecification(configuration);
    const columnFieldsForPivot = configuration.pivotColumns ?? [];
    const valuesForPivot = valueSpecifications(configuration);
    const stats = new Map<string, PivotStat>();
    const columnPaths = new Map<string, string[]>();
    const leafRows = new Map<string, string[]>();
    const updateStat = (rowPath: string[], columnKey: string, valueIndex: number, raw: unknown, spec: PivotValueField) => {
      const isPresent = raw !== null && raw !== undefined && String(raw).trim() !== "";
      if (spec.aggregation === "count" && spec.field !== "task_count" && !isPresent) return;
      const parsed = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/,/g, ""));
      if (spec.aggregation !== "count" && !Number.isFinite(parsed)) return;
      const rowKey = JSON.stringify(rowPath);
      const key = `${rowKey}::${columnKey}::${valueIndex}`;
      const current = stats.get(key) ?? { sum: 0, count: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
      const value = spec.aggregation === "count" ? 1 : parsed;
      current.sum += value; current.count += 1; current.min = Math.min(current.min, value); current.max = Math.max(current.max, value);
      stats.set(key, current);
    };
    items.forEach(task => {
      const rowPath = rowFieldsForPivot.map(field => fieldText(task, field, configuration));
      const columnPath = columnFieldsForPivot.map(field => fieldText(task, field, configuration));
      const columnKey = columnFieldsForPivot.length ? JSON.stringify(columnPath) : "__all__";
      if (columnFieldsForPivot.length) columnPaths.set(columnKey, columnPath);
      if (rowPath.length) leafRows.set(JSON.stringify(rowPath), rowPath);
      const prefixes = rowPath.length ? Array.from({ length: rowPath.length + 1 }, (_, index) => rowPath.slice(0, index)) : [[]];
      valuesForPivot.forEach((spec, valueIndex) => {
        const raw = spec.field === "task_count" ? 1 : rawFieldValue(task, spec.field, configuration);
        prefixes.forEach(prefix => {
          updateStat(prefix, columnKey, valueIndex, raw, spec);
          updateStat(prefix, "__grand_total__", valueIndex, raw, spec);
        });
      });
    });
    const aggregationResult = (stat: PivotStat | undefined, aggregationType: Aggregation): number | null => {
      if (!stat?.count) return null;
      if (aggregationType === "count") return stat.count;
      if (aggregationType === "average") return stat.sum / stat.count;
      if (aggregationType === "min") return stat.min;
      if (aggregationType === "max") return stat.max;
      return stat.sum;
    };
    const columnGroups = [...columnPaths.entries()].filter(([key]) => key !== "__grand_total__").map(([key, path]) => ({ key, label: path.join(" / ") || "All records" })).sort((a, b) => a.label.localeCompare(b.label));
    const orderedRowPaths: Array<{ key: string; path: string[]; subtotal: boolean; total: boolean }> = [];
    if (!rowFieldsForPivot.length) orderedRowPaths.push({ key: "[]", path: [], subtotal: false, total: true });
    else {
      const seen = new Set<string>();
      [...leafRows.values()].sort((a, b) => a.join(" / ").localeCompare(b.join(" / "))).forEach(path => {
        for (let level = 1; level < path.length; level++) {
          const prefix = path.slice(0, level); const key = JSON.stringify(prefix);
          if (!seen.has(key)) { seen.add(key); orderedRowPaths.push({ key, path: prefix, subtotal: true, total: false }); }
        }
        const key = JSON.stringify(path);
        if (!seen.has(key)) { seen.add(key); orderedRowPaths.push({ key, path, subtotal: false, total: false }); }
      });
    }
    const cellsFor = (rowKey: string, includeTotal: boolean) => {
      const cells: Record<string, number | null> = {};
      [...columnGroups.map(group => group.key), ...(includeTotal ? ["__grand_total__"] : [])].forEach(columnKey => valuesForPivot.forEach((value, index) => {
        cells[`${columnKey}::${index}`] = aggregationResult(stats.get(`${rowKey}::${columnKey}::${index}`), value.aggregation);
      }));
      return cells;
    };
    const rows = orderedRowPaths.map(entry => ({ ...entry, cells: cellsFor(entry.key, true) }));
    const grandTotal = cellsFor("[]", true);
    return { rowFields: rowFieldsForPivot, columnFields: columnFieldsForPivot, values: valuesForPivot, columnGroups, rows, grandTotal, matchingRows: items.length };
  };
  const makeRows = (configuration: ReportConfig, visualType = configuration.chartType) => {
    const items = reportTasks(configuration);
    const groups = new Map<string, { sum: number; count: number; min: number; max: number; series: Record<string, number>; seriesCount: Record<string, number>; seriesMin: Record<string, number>; seriesMax: Record<string, number> }>();
    const rowFieldsForChart = rowSpecification(configuration);
    const metricSpecification = valueSpecifications(configuration)[0] ?? { field: configuration.metricField ?? "task_count", aggregation: configuration.aggregation ?? "count" };
    const metric = visualType === "histogram" ? "task_count" : metricSpecification.field;
    const aggregationType: Aggregation = visualType === "histogram" ? "count" : metricSpecification.aggregation;
    const seriesFields = columnSpecification(configuration);
    const histogramWidth = Number(configuration.binWidth);
    if (visualType === "scatter") {
      const xField = rowFieldsForChart.find(field => isNumericField(field, configuration)) ?? metric;
      const points: ReportRow[] = items.map(task => {
        const x = metricValue(task, xField, configuration); const y = metricValue(task, metric, configuration);
        return x === null || y === null ? null : { label: task.title || String(task.id), x, value: y };
      }).filter(point => point !== null) as ReportRow[];
      return { rows: points, total: points.length, totalValue: points.reduce((sum, point) => sum + point.value, 0) };
    }
    items.forEach(task => {
      const groupValues = rowFieldsForChart.map(field => rawFieldValue(task, field, configuration));
      const histogramField = rowFieldsForChart.find(field => isNumericField(field, configuration)) ?? rowFieldsForChart[0];
      const groupedValue = visualType === "histogram" && histogramField ? rawFieldValue(task, histogramField, configuration) : groupValues[0];
      let label = visualType === "histogram" ? "" : groupValues.length ? groupValues.map((value, index) => `${rowFieldsForChart.length > 1 ? `${fieldLabel(rowFieldsForChart[index], configuration)}: ` : ""}${value === null || value === undefined || value === "" ? "Empty" : String(value)}`).join(" / ") : "All records";
      if (visualType === "histogram") {
        const numeric = typeof groupedValue === "number" ? groupedValue : Number(String(groupedValue ?? "").replace(/,/g, ""));
        if (!Number.isFinite(numeric) || !Number.isFinite(histogramWidth) || histogramWidth <= 0) return;
        const low = Math.floor(numeric / histogramWidth) * histogramWidth;
        const precision = Math.min(6, (String(histogramWidth).split(".")[1] ?? "").length);
        label = `${low.toFixed(precision)} – ${(low + histogramWidth).toFixed(precision)}`;
      }
      const rawValue = metric === "task_count" ? 1 : rawFieldValue(task, metric, configuration);
      const rawPresent = rawValue !== null && rawValue !== undefined && String(rawValue).trim() !== "";
      if (aggregationType === "count" && metric !== "task_count" && !rawPresent) return;
      const parsed = typeof rawValue === "number" ? rawValue : Number(String(rawValue ?? "").replace(/,/g, ""));
      if (aggregationType !== "count" && !Number.isFinite(parsed)) return;
      const value = aggregationType === "count" ? 1 : parsed;
      const current = groups.get(label) ?? { sum: 0, count: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY, series: {}, seriesCount: {}, seriesMin: {}, seriesMax: {} };
      current.sum += value; current.count += 1; current.min = Math.min(current.min, value); current.max = Math.max(current.max, value);
      const series = (seriesFields.length ? seriesFields : [configuration.seriesBy ?? "status"]).map(field => fieldText(task, field, configuration)).join(" / ") || "Empty";
      current.series[series] = (current.series[series] ?? 0) + value; current.seriesCount[series] = (current.seriesCount[series] ?? 0) + 1; current.seriesMin[series] = Math.min(current.seriesMin[series] ?? Number.POSITIVE_INFINITY, value); current.seriesMax[series] = Math.max(current.seriesMax[series] ?? Number.NEGATIVE_INFINITY, value);
      groups.set(label, current);
    });
    const aggregate = (group: { sum: number; count: number; min: number; max: number }) => aggregationType === "count" ? group.count : aggregationType === "average" ? group.sum / Math.max(1, group.count) : aggregationType === "min" ? group.min : aggregationType === "max" ? group.max : group.sum;
    const rows = [...groups.entries()].map(([label, group]) => ({ label, value: aggregate(group), series: Object.fromEntries(Object.keys(group.series).map(key => [key, aggregationType === "average" ? group.series[key] / group.seriesCount[key] : aggregationType === "min" ? group.seriesMin[key] : aggregationType === "max" ? group.seriesMax[key] : group.series[key]])) }));
    const totalGroup = { sum: 0, count: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
    groups.forEach(group => { totalGroup.sum += group.sum; totalGroup.count += group.count; totalGroup.min = Math.min(totalGroup.min, group.min); totalGroup.max = Math.max(totalGroup.max, group.max); });
    const totalValue = totalGroup.count ? aggregate(totalGroup) : 0;
    if (visualType === "histogram") rows.sort((a, b) => Number.parseFloat(a.label) - Number.parseFloat(b.label));
    else if (["createdMonth", "dueMonth"].includes(configuration.dimension)) rows.sort((a, b) => { const aDate = Date.parse(`1 ${a.label}`), bDate = Date.parse(`1 ${b.label}`); return aDate - bDate; });
    else rows.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    const matchingRows = visualType === "histogram" ? rows.reduce((sum, row) => sum + (aggregationType === "count" ? row.value : 0), 0) || rows.length : items.length;
    return { rows, total: matchingRows, totalValue };
  };

  const resetForm = () => { setReportName(""); setDimension(""); setChartType(""); setMetricField(""); setAggregation(""); setSeriesBy(""); setDateRange("all"); setDateFrom(""); setDateTo(""); setBinWidth(""); setFieldMappings([]); setMappingName(""); setMappingColumns({}); setFilters([]); setFilterLogic("all"); setRowFields([]); setColumnFields([]); setValueFields([]); setFilterFieldKeys([]); setAdditionalVisuals([]); setSelectedBoards([]); setEditingId(null); };
  const toggleBoard = (id: string) => {
    if (selectedBoards.includes(id)) removeSelectedTable(id);
    else setSelectedBoards(current => [...current, id]);
  };
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
  const addFilterRule = () => {
    const field = filterFieldKeys[0];
    if (!field) return notify("Move a field into the Filters area first.");
    setFilters(current => [...current, { id: crypto.randomUUID(), field, operator: "equals", value: "" }]);
  };
  const updateFilterRule = (id: string, update: Partial<ReportFilter>) => setFilters(current => current.map(filter => filter.id === id ? { ...filter, ...update } : filter));
  const moveFieldToArea = (field: string, area: PivotFieldArea) => {
    if (!field) return;
    setRowFields(current => area === "rows" ? [...new Set([...current, field])] : current.filter(item => item !== field));
    setColumnFields(current => area === "columns" ? [...new Set([...current, field])] : current.filter(item => item !== field));
    setFilterFieldKeys(current => area === "filters" ? [...new Set([...current, field])] : current.filter(item => item !== field));
    setValueFields(current => area === "values" ? current.some(item => item.field === field) ? current : [...current, { field, aggregation: field === "task_count" ? "count" : isNumericField(field, { boardIds: selectedBoards, fieldMappings }) ? "sum" : "count" }] : current.filter(item => item.field !== field));
    if (area === "filters") setFilters(current => current.some(filter => filter.field === field) ? current : [...current, { id: crypto.randomUUID(), field, operator: "equals", value: "" }]);
    else setFilters(current => current.filter(filter => filter.field !== field));
  };
  const removeFieldFromArea = (field: string, area: PivotFieldArea) => {
    if (area === "rows") setRowFields(current => current.filter(item => item !== field));
    if (area === "columns") setColumnFields(current => current.filter(item => item !== field));
    if (area === "values") setValueFields(current => current.filter(item => item.field !== field));
    if (area === "filters") { setFilterFieldKeys(current => current.filter(item => item !== field)); setFilters(current => current.filter(item => item.field !== field)); }
  };
  const updateValueAggregation = (field: string, next: Aggregation) => setValueFields(current => current.map(value => value.field === field ? { ...value, aggregation: next } : value));
  const addSelectedTable = () => {
    if (!pickerBoardId) return;
    setSelectedBoards(current => current.includes(pickerBoardId) ? current : [...current, pickerBoardId]);
  };
  const removeSelectedTable = (boardId: string) => {
    setSelectedBoards(current => current.filter(id => id !== boardId));
    const removedFields = columns.filter(column => column.board_id === boardId).map(column => `col:${column.id}`);
    setRowFields(current => current.filter(field => !removedFields.includes(field)));
    setColumnFields(current => current.filter(field => !removedFields.includes(field)));
    setValueFields(current => current.filter(value => !removedFields.includes(value.field)));
    setFilterFieldKeys(current => current.filter(field => !removedFields.includes(field)));
    setFilters(current => current.filter(filter => !removedFields.includes(filter.field)));
  };
  const saveReport = async () => {
    if (!supabase) return notify("Connect to the workspace before saving reports.");
    const title = reportName.trim(); if (!title) return notify("Enter a report name before saving.");
    if (!selectedBoards.length || !chartType || !selectedVisualizations.length || !valueFields.length || !dateRange || invalidCustomDateRange || (selectedVisualizations.some(type => type === "stacked" || type === "stackedColumn") && !columnFields.length) || (selectedVisualizations.includes("histogram") && (!(Number(binWidth) > 0) || !rowFields.some(field => isNumericField(field, { boardIds: selectedBoards, fieldMappings })))) || (selectedVisualizations.includes("scatter") && (!rowFields.some(field => isNumericField(field, { boardIds: selectedBoards, fieldMappings })) || !valueFields.some(value => isNumericField(value.field, { boardIds: selectedBoards, fieldMappings })))) ) return notify("Connect tables, add fields to the Pivot areas, and complete the selected visualization settings.");
    setBusy(true);
    const primaryValue = valueFields[0];
    const configuration: ReportConfig = { dimension: rowFields[0] ?? (dimension || "department"), chartType, boardIds: selectedBoards, metricField: primaryValue.field, aggregation: primaryValue.aggregation, seriesBy: columnFields[0] ?? (seriesBy || "status"), dateRange, dateFrom, dateTo, fieldMappings, binWidth: Number(binWidth) || undefined, filters, filterLogic, pivotRows: rowFields, pivotColumns: columnFields, pivotValues: valueFields, filterFields: filterFieldKeys, visualizations: selectedVisualizations };
    const result = editingId
      ? await supabase.from("saved_views").update({ name: title, configuration }).eq("id", editingId).eq("owner_id", user.id)
      : await supabase.from("saved_views").insert({ owner_id: user.id, name: title, view_type: "dashboard", configuration });
    setBusy(false);
    if (result.error) return notify(`Report was not saved: ${result.error.message}`);
    notify(editingId ? "Report updated online." : "Report added to Reports."); resetForm(); await load();
  };
  const editReport = (report: SavedReport) => {
    const config = normaliseConfig(report.configuration);
    const visuals = config.visualizations?.length ? config.visualizations : [config.chartType];
    const pivotValues = config.pivotValues?.length ? config.pivotValues : [{ field: config.metricField ?? "task_count", aggregation: config.aggregation ?? "count" }];
    setEditingId(report.id); setReportName(report.name); setDimension(config.dimension); setChartType(visuals[0] ?? config.chartType); setAdditionalVisuals(visuals.slice(1)); setMetricField(config.metricField ?? "task_count"); setAggregation(config.aggregation ?? "count"); setSeriesBy(config.seriesBy ?? "status"); setDateRange(config.dateRange ?? "all"); setDateFrom(config.dateFrom ?? ""); setDateTo(config.dateTo ?? ""); setBinWidth(config.binWidth ? String(config.binWidth) : ""); setFieldMappings(config.fieldMappings ?? []); setMappingColumns({}); setFilters(config.filters ?? []); setFilterLogic(config.filterLogic ?? "all"); setRowFields(config.pivotRows ?? [config.dimension]); setColumnFields(config.pivotColumns ?? []); setValueFields(pivotValues); setFilterFieldKeys(config.filterFields ?? (config.filters ?? []).map(filter => filter.field)); setSelectedBoards(config.boardIds ?? []);
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
  const reportMatrix = (report: SavedReport) => {
    const config = normaliseConfig(report.configuration); const pivot = makePivot(config);
    const columnsForExport = pivot.columnGroups;
    const rowHeaders = pivot.rowFields.length ? pivot.rowFields.map(field => fieldLabel(field, config)) : ["Records"];
    const valueHeader = (value: PivotValueField) => `${fieldLabel(value.field, config)} (${value.aggregation.toUpperCase()})`;
    const headers = [...rowHeaders, ...columnsForExport.flatMap(group => pivot.values.map(value => `${group.label} · ${valueHeader(value)}`)), ...pivot.values.map(value => `Grand total · ${valueHeader(value)}`)];
    const data = pivot.rows.map(row => {
      const dimensions = pivot.rowFields.length ? row.subtotal ? [...row.path, "Subtotal"] : row.path : ["All records"];
      return [...dimensions, ...columnsForExport.flatMap(group => pivot.values.map((_, index) => row.cells[`${group.key}::${index}`] ?? "")), ...pivot.values.map((_, index) => row.cells[`__grand_total__::${index}`] ?? "")];
    });
    const totalDimensions = pivot.rowFields.length ? ["Grand total", ...pivot.rowFields.slice(1).map(() => "")] : ["Grand total"];
    const totals = [...totalDimensions, ...columnsForExport.flatMap(group => pivot.values.map((_, index) => pivot.grandTotal[`${group.key}::${index}`] ?? "")), ...pivot.values.map((_, index) => pivot.grandTotal[`__grand_total__::${index}`] ?? "")];
    return { headers, rows: [...data, totals] };
  };
  const safeExportBase = (name: string) => name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "report";
  const exportCsv = (report: SavedReport) => {
    const matrix = reportMatrix(report);
    const csv = [matrix.headers, ...matrix.rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    downloadFile(`${safeExportBase(report.name)}.csv`, `\uFEFF${csv}`, "text/csv;charset=utf-8");
  };
  const exportExcel = (report: SavedReport) => {
    const matrix = reportMatrix(report);
    const xmlEscape = (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
    const columnName = (index: number) => { let value = index + 1; let label = ""; while (value) { const remainder = (value - 1) % 26; label = String.fromCharCode(65 + remainder) + label; value = Math.floor((value - 1) / 26); } return label; };
    const rows = [matrix.headers, ...matrix.rows].map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => { const reference = `${columnName(columnIndex)}${rowIndex + 1}`; return typeof value === "number" && Number.isFinite(value) ? `<c r="${reference}"><v>${value}</v></c>` : `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`; }).join("")}</row>`).join("");
    const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${rows}</sheetData></worksheet>`;
    const sheetName = ["[", "]", ":", "*", "?", "/", "\\"].reduce((name, character) => name.replaceAll(character, " "), report.name).slice(0, 31) || "Report";
    const files = [
      { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>` },
      { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
      { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
      { name: "xl/worksheets/sheet1.xml", content: worksheet },
    ];
    const bytes = makeStoredZip(files); const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    downloadBlobFile(`${safeExportBase(report.name)}.xlsx`, new Blob([arrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  };
  const printReport = (report: SavedReport) => {
    const matrix = reportMatrix(report); const printWindow = window.open("", "_blank");
    if (!printWindow) return notify("Allow the report print window to open, then choose Save as PDF.");
    const esc = (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    printWindow.document.write(`<!doctype html><html><head><title>${esc(report.name)}</title><style>body{font:14px Arial,sans-serif;color:#17233d;padding:24px}h1{font-size:22px}p{color:#63708a}table{border-collapse:collapse;width:100%;margin-top:18px}th,td{border:1px solid #dbe2ee;padding:8px;text-align:left}th{background:#f1f4fa}tfoot,tbody tr:last-child{font-weight:bold}</style></head><body><h1>${esc(report.name)}</h1><p>Pivot report · ${matrix.rows.length - 1} grouped rows · ${new Date().toLocaleString()}</p><table><thead><tr>${matrix.headers.map(value => `<th>${esc(value)}</th>`).join("")}</tr></thead><tbody>${matrix.rows.map(row => `<tr>${row.map(value => `<td>${esc(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`);
    printWindow.document.close(); printWindow.focus(); window.setTimeout(() => printWindow.print(), 250);
  };

  const matchingTaskCount = selectedBoards.length ? tasks.filter(task => selectedBoards.includes(task.board_id ?? "")).length : 0;
  const previewConfig: ReportConfig = { dimension: rowFields[0] ?? "department", chartType: chartType || "pivot", boardIds: selectedBoards, metricField: valueFields[0]?.field ?? "task_count", aggregation: valueFields[0]?.aggregation ?? "count", seriesBy: columnFields[0] ?? "status", dateRange: dateRange || "all", dateFrom, dateTo, fieldMappings, binWidth: Number(binWidth) || undefined, filters, filterLogic, pivotRows: rowFields, pivotColumns: columnFields, pivotValues: valueFields.length ? valueFields : [{ field: "task_count", aggregation: "count" }], filterFields: filterFieldKeys, visualizations: selectedVisualizations };
  const previewPivot = selectedBoards.length ? makePivot(previewConfig) : null;
  const renderFieldArea = (title: string, area: PivotFieldArea, fields: string[]) => <section className={`reports-pivot-area reports-pivot-area-${area}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); moveFieldToArea(event.dataTransfer.getData("text/plain"), area); }}><header><b>{title}</b><span>{fields.length}</span></header>{fields.length ? <div className="reports-pivot-pills">{fields.map(field => { const numeric = field !== "task_count" && isNumericField(field, { boardIds: selectedBoards, fieldMappings }); return <div className="reports-pivot-pill" key={field} draggable onDragStart={event => event.dataTransfer.setData("text/plain", field)}><span>{fieldLabel(field)}</span>{area === "values" && <select aria-label={`Aggregation for ${fieldLabel(field)}`} value={valueFields.find(value => value.field === field)?.aggregation ?? "count"} onClick={event => event.stopPropagation()} onChange={event => updateValueAggregation(field, event.target.value as Aggregation)}>{numeric ? <><option value="sum">SUM</option><option value="count">COUNT</option><option value="average">AVERAGE</option><option value="min">MIN</option><option value="max">MAX</option></> : <option value="count">COUNT</option>}</select>}<button type="button" aria-label={`Remove ${fieldLabel(field)} from ${title}`} onClick={() => removeFieldFromArea(field, area)}><X size={12}/></button></div>; })}</div> : <div className="reports-pivot-drop-hint">Drop fields here or use the add-field control.</div>}</section>;

  return <div className="reports-workspace">
    <section className="reports-hero"><div className="reports-hero-copy"><div className="reports-eyebrow"><Layers3 size={14}/> BUSINESS INTELLIGENCE</div><h2>BI Dashboard</h2><p>Create visual reports from the department boards you choose. Board fields and chart logic are never connected automatically.</p></div><div className="reports-hero-actions"><button className="primary-button" onClick={() => document.querySelector(".reports-builder")?.scrollIntoView({ behavior: "smooth", block: "start" })}><Plus size={15}/> Create visual</button><button className="secondary-button" onClick={() => void Promise.all([refreshTasks(), load()])}><RefreshCw size={15}/> Refresh data</button><button className="secondary-button" onClick={exportReports}><Download size={15}/> Export reports</button><label className="secondary-button upload-button"><FileUp size={15}/> Import JSON<input type="file" accept="application/json,.json" onChange={importReports}/></label></div></section>

    <section className="reports-kpis" aria-label="Report data summary"><article><span>Accessible boards</span><b>{sources.length}</b><small>Across {availableDepartments.length} departments</small></article><article><span>Selected source rows</span><b>{matchingTaskCount}</b><small>{selectedBoards.length ? "From boards you selected" : "No source data selected"}</small></article><article><span>Saved reports</span><b>{reports.length}</b><small>Stored in your workspace account</small></article><article className="reports-refresh-card"><label><input type="checkbox" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)}/> Auto-refresh</label><small>Updates every minute; live task changes update automatically.</small></article></section>

    <section className="panel reports-builder" id="reports-builder"><div className="reports-section-heading"><div><div className="reports-eyebrow">REPORT DESIGNER</div><h3>{editingId ? "Edit report" : "Create a report"}</h3><p>Choose the boards, measures, and visual that should appear together.</p></div><span className="reports-source-pill"><Layers3 size={14}/>{selectedDepartmentCount} departments · {selectedSourceCount} boards</span></div>
      <div className="reports-form-grid"><label className="reports-field reports-title-field">Report name<input maxLength={120} value={reportName} onChange={event => setReportName(event.target.value)} placeholder="e.g. Campaign delivery overview"/></label>
        <label className="reports-field">Primary visualization<select value={chartType} onChange={event => { const next = event.target.value; if (chartType && chartType !== next) setAdditionalVisuals(current => [...new Set([...current, chartType])]); setAdditionalVisuals(current => current.filter(type => type !== next)); setChartType(next); }}><option value="">Choose a visualization</option>{chartTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="reports-field">Date window<select value={dateRange} onChange={event => setDateRange(event.target.value)}>{dateRanges.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        {dateRange === "custom" && <><label className="reports-field">Created on or after<input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)}/></label><label className="reports-field">Created on or before<input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)}/></label></>}
        {selectedVisualizations.includes("histogram") && <label className="reports-field">Histogram bin width<input type="number" min="0.000001" step="any" value={binWidth} onChange={event => setBinWidth(event.target.value)} placeholder="e.g. 10"/></label>}
      </div>
      <div className="reports-extra-visuals"><b>Also visualize the same data as</b><div>{chartTypes.filter(([type]) => type !== chartType).map(([type, label]) => <label key={type}><input type="checkbox" checked={additionalVisuals.includes(type)} onChange={() => setAdditionalVisuals(current => current.includes(type) ? current.filter(value => value !== type) : [...current, type])}/>{label}</label>)}</div></div>
      <div className="reports-source-picker"><div className="reports-source-head"><div><b>Choose department tables</b><small>Department names, table names, and column headers are loaded from the database. Only tables granted to your account appear.</small></div><label className="reports-all-source"><input type="checkbox" checked={allBoardsSelected} onChange={() => { if (allBoardsSelected) { setSelectedBoards([]); setRowFields([]); setColumnFields([]); setValueFields([]); setFilterFieldKeys([]); setFilters([]); } else setSelectedBoards(sources.map(source => source.id)); }}/> Connect all accessible tables</label></div>
        {!sourcesLoading && !sourceError && sources.length > 0 && <div className="reports-table-picker"><label className="reports-field">Department<select value={pickerDepartment} onChange={event => { setSourceDepartment(event.target.value); setSourceBoard(""); }}>{availableDepartments.map(department => <option value={department} key={department}>{department}</option>)}</select></label><label className="reports-field">Table<select value={pickerBoardId} onChange={event => setSourceBoard(event.target.value)}>{tablesForDepartment.map(table => <option value={table.id} key={table.id}>{table.name}</option>)}</select></label><button className="primary-button" type="button" disabled={!pickerBoardId || selectedBoards.includes(pickerBoardId)} onClick={addSelectedTable}><Plus size={15}/>{selectedBoards.includes(pickerBoardId) ? "Table connected" : "Connect table"}</button></div>}
        <div className="reports-connected-tables"><b>Connected tables · {selectedBoards.length}</b>{selectedBoards.length ? selectedBoards.map(boardId => { const board = sources.find(source => source.id === boardId); return <span key={boardId}><small>{board?.departmentName} / </small>{board?.name}<button type="button" aria-label={`Remove ${board?.name}`} onClick={() => removeSelectedTable(boardId)}><X size={12}/></button></span>; }) : <small>Select a department and table above or use the table list below.</small>}</div>
        <label className="reports-source-search"><Search size={15}/><input type="search" value={sourceSearch} onChange={event => setSourceSearch(event.target.value)} placeholder="Search departments and boards"/></label>
        {sourcesLoading ? <div className="reports-no-sources"><b>Loading accessible boards…</b></div> : sourceError ? <div className="reports-no-sources"><b>Boards could not be loaded.</b><span>{sourceError}</span><button className="secondary-button" onClick={() => void load()}>Retry</button></div> : groupedSources.length ? <div className="reports-source-groups">{groupedSources.map(([department, boards]) => <section key={department}><div className="reports-department-source"><b>{department}</b><small>{boards.length} {boards.length === 1 ? "board" : "boards"}</small></div>{boards.map(board => <label className="reports-board-source" key={board.id}><input type="checkbox" checked={selectedBoards.includes(board.id)} onChange={() => toggleBoard(board.id)}/><span><b>{board.name}</b><small>{board.departmentName}</small></span></label>)}</section>)}</div> : <div className="reports-no-sources"><b>{sourceSearch.trim() ? "No boards match that search." : "No boards are available to this account."}</b><span>{sourceSearch.trim() ? "Try another department or board name." : "Board access is enforced by Supabase. Ask the Super Admin to grant access to the departments you need."}</span></div>}
        <section className="reports-field-mapper"><div className="reports-mapper-heading"><div><b>Map columns across boards</b><small>Give equivalent columns one shared name so you can chart data even when department headers differ.</small></div><span>{fieldMappings.length} mapped fields</span></div>
          {!selectedBoards.length ? <div className="reports-mapper-empty">Select one or more boards above to map their columns.</div> : <><div className="reports-mapping-form"><label className="reports-field">Shared field name<input value={mappingName} onChange={event => setMappingName(event.target.value)} placeholder="e.g. Revenue"/></label><label className="reports-field">Field use<select value={mappingRole} onChange={event => { setMappingRole(event.target.value as FieldMapping["role"]); setMappingColumns({}); }}><option value="category">Category / label</option><option value="measure">Numeric measure</option></select></label>{selectedBoards.map(boardId => { const board = sources.find(source => source.id === boardId); const available = columns.filter(column => column.board_id === boardId && !column.is_hidden && (mappingRole === "category" ? column.column_type !== "attachment" : ["number", "progress", "formula"].includes(column.column_type))); return <label className="reports-field" key={boardId}>{board?.departmentName} · {board?.name}<select value={mappingColumns[boardId] ?? ""} onChange={event => setMappingColumns(current => ({ ...current, [boardId]: event.target.value }))}><option value="">Skip this board</option>{available.map(column => <option key={column.id} value={column.id}>{column.name} · {column.column_type}</option>)}</select></label>; })}<button className="secondary-button" type="button" disabled={!mappingName.trim()} onClick={addFieldMapping}><Plus size={14}/> Add mapping</button></div>
            {fieldMappings.length > 0 && <div className="reports-mapped-fields">{fieldMappings.map(mapping => <article className="reports-mapped-field" key={mapping.id}><div className="reports-mapped-field-title"><b>{mapping.name}</b><span>{mapping.role === "measure" ? "Numeric measure" : "Category"}</span><button className="icon-button report-delete-button" type="button" title={`Remove ${mapping.name} mapping`} aria-label={`Remove ${mapping.name} mapping`} onClick={() => setFieldMappings(current => current.filter(item => item.id !== mapping.id))}><Trash2 size={14}/></button></div><div className="reports-mapped-field-sources">{selectedBoards.map(boardId => { const board = sources.find(source => source.id === boardId); const available = columns.filter(column => column.board_id === boardId && !column.is_hidden && (mapping.role === "category" ? column.column_type !== "attachment" : ["number", "progress", "formula"].includes(column.column_type))); return <label className="reports-field" key={boardId}>{board?.name}<select value={mapping.columnByBoard[boardId] ?? ""} onChange={event => updateFieldMapping(mapping.id, boardId, event.target.value)}><option value="">Skip this board</option>{available.map(column => <option key={column.id} value={column.id}>{column.name} · {column.column_type}</option>)}</select></label>; })}</div></article>)}</div>}
          </>}
        </section>
      </div>
      {selectedBoards.length > 0 && <section className="reports-pivot-designer"><div className="reports-pivot-heading"><div><div className="reports-eyebrow">PIVOT DESIGNER</div><h4>Arrange database fields</h4><p>Drag fields into Rows, Columns, Values, or Filters. Changes update the preview immediately.</p></div><span>{allFieldChoices.length} available fields</span></div><div className="reports-fields-library"><div className="reports-library-heading"><b>Available fields</b><label className="reports-source-search"><Search size={14}/><input type="search" value={fieldSearch} onChange={event => setFieldSearch(event.target.value)} placeholder="Find a column or field"/></label></div><div className="reports-field-choices">{visibleFieldChoices.map(field => <div className="reports-field-choice" key={field.value} draggable onDragStart={event => event.dataTransfer.setData("text/plain", field.value)} title="Drag this field to a Pivot area"><span className="reports-field-drag-handle">⠿</span>{field.label}<small>{field.value.startsWith("col:") ? columns.find(column => `col:${column.id}` === field.value)?.column_type : field.value.startsWith("map:") ? "mapped" : "workspace"}</small></div>)}</div><div className="reports-field-add-control"><select aria-label="Field to add" value={fieldToAdd || visibleFieldChoices[0]?.value || ""} onChange={event => setFieldToAdd(event.target.value)}><option value="">Choose field</option>{allFieldChoices.map(field => <option key={field.value} value={field.value}>{field.label}</option>)}</select><select aria-label="Pivot area" value={fieldAreaToAdd} onChange={event => setFieldAreaToAdd(event.target.value as PivotFieldArea)}><option value="rows">Rows</option><option value="columns">Columns</option><option value="values">Values</option><option value="filters">Filters</option></select><button className="secondary-button" type="button" disabled={!fieldToAdd && !visibleFieldChoices.length} onClick={() => moveFieldToArea(fieldToAdd || visibleFieldChoices[0]?.value || "", fieldAreaToAdd)}><Plus size={14}/> Add field</button></div></div><div className="reports-pivot-areas">{renderFieldArea("Rows", "rows", rowFields)}{renderFieldArea("Columns", "columns", columnFields)}{renderFieldArea("Values", "values", valueFields.map(value => value.field))}{renderFieldArea("Filters", "filters", filterFieldKeys)}</div></section>}
      {filterFieldKeys.length > 0 && <section className="reports-filter-builder"><div className="reports-filter-heading"><div><b>Filter conditions</b><small>Choose exact values or numeric ranges for fields in the Filters area.</small></div><div><label>Match <select value={filterLogic} onChange={event => setFilterLogic(event.target.value as "all" | "any")}><option value="all">all filters</option><option value="any">any filter</option></select></label><button className="secondary-button" type="button" onClick={addFilterRule}><Plus size={14}/> Add condition</button></div></div>
        {filters.length ? <div className="reports-filter-rules">{filters.map(filter => <div className="reports-filter-rule" key={filter.id}><select aria-label="Filter field" value={filter.field} onChange={event => updateFilterRule(filter.id, { field: event.target.value, operator: "equals", value: "" })}>{filterFieldKeys.map(field => <option value={field} key={field}>{fieldLabel(field)}</option>)}</select><select aria-label="Filter condition" value={filter.operator} onChange={event => updateFilterRule(filter.id, { operator: event.target.value as ReportFilter["operator"] })}><option value="equals">is</option><option value="not_equals">is not</option><option value="contains">contains</option><option value="not_contains">does not contain</option>{isNumericField(filter.field, { boardIds: selectedBoards, fieldMappings }) && <><option value="greater_than">is greater than</option><option value="less_than">is less than</option></>}<option value="is_empty">is empty</option><option value="is_not_empty">is not empty</option></select>{filter.operator !== "is_empty" && filter.operator !== "is_not_empty" && <input aria-label="Filter value" value={filter.value} onChange={event => updateFilterRule(filter.id, { value: event.target.value })} placeholder="Enter value"/>}<button className="icon-button report-delete-button" type="button" aria-label="Remove filter condition" title="Remove filter condition" onClick={() => setFilters(current => current.filter(item => item.id !== filter.id))}><Trash2 size={14}/></button></div>)}</div> : <div className="reports-filter-empty">No filter conditions yet. All rows are included.</div>}
      </section>}
      <div className="reports-builder-footer"><span>Data is read using your existing department and table permissions; reports never copy source rows.</span><div>{editingId && <button className="secondary-button" onClick={resetForm}><X size={15}/> Cancel edit</button>}<button className="primary-button" disabled={busy || !reportName.trim() || !selectedBoards.length || !chartType || !valueFields.length || !dateRange || invalidCustomDateRange || (selectedVisualizations.some(type => type === "stacked" || type === "stackedColumn") && !columnFields.length) || (selectedVisualizations.includes("histogram") && (!(Number(binWidth) > 0) || !rowFields.some(field => isNumericField(field, { boardIds: selectedBoards, fieldMappings })))) || (selectedVisualizations.includes("scatter") && (!rowFields.some(field => isNumericField(field, { boardIds: selectedBoards, fieldMappings })) || !valueFields.some(value => isNumericField(value.field, { boardIds: selectedBoards, fieldMappings }))))} onClick={() => void saveReport()}><Save size={15}/>{busy ? "Saving…" : editingId ? "Save changes" : "Save report"}</button></div></div>
    </section>

    <section className="panel reports-live-preview"><div className="reports-canvas-heading"><div><div className="reports-eyebrow">LIVE PREVIEW</div><h3>{reportName || "Untitled report"}</h3><p>{selectedDepartmentCount} departments · {selectedSourceCount} tables · {previewPivot?.matchingRows ?? 0} matching rows</p></div><span>Updates as fields change</span></div>{!selectedBoards.length ? <div className="reports-first-run"><p>Connect a department table to start your interactive report preview.</p></div> : !selectedVisualizations.length ? <div className="reports-first-run"><p>Choose a visualization and place at least one field in Values to preview your report.</p></div> : <div className="reports-preview-visuals">{selectedVisualizations.map(type => { const { rows, total, totalValue } = makeRows(previewConfig, type); const metric = valueFields[0] ? `${fieldLabel(valueFields[0].field)} · ${valueFields[0].aggregation.toUpperCase()}` : "Records"; return <article className="report-preview-visual" key={type}><header><span className="report-type-label">{chartTypes.find(([visual]) => visual === type)?.[1] ?? type}</span></header><ReportVisual type={type} rows={rows} totalLabel={total} totalValue={totalValue} metricLabel={metric} pivot={type === "pivot" ? previewPivot ?? undefined : undefined} fieldName={field => fieldLabel(field, previewConfig)}/></article>; })}</div>}</section>

    <div className="reports-canvas-heading"><div><div className="reports-eyebrow">LIVE CANVAS</div><h3>Dashboard canvas</h3><p>Saved visuals update from the board sources chosen for each report.</p></div><span>{reports.length} {reports.length === 1 ? "report" : "reports"}</span></div>
    {reports.length ? <div className="reports-grid">{reports.map(report => {
      const config = normaliseConfig(report.configuration); const pivot = makePivot(config);
      const visualTypes = config.visualizations?.length ? config.visualizations : [config.chartType];
      const metricFieldForCard = config.pivotValues?.[0]?.field ?? config.metricField ?? "task_count";
      const metric = `${fieldLabel(metricFieldForCard, config)} · ${(config.pivotValues?.[0]?.aggregation ?? config.aggregation ?? "count").toUpperCase()}`;
      const sourceCount = config.boardIds?.length ?? 0;
      const departmentCount = new Set(sources.filter(source => config.boardIds?.includes(source.id)).map(source => source.departmentName)).size;
      return <article className={`panel report-card report-card-${config.chartType}`} key={report.id}><header className="report-card-head"><div><span className="report-type-label">{visualTypes.map(type => chartTypes.find(([item]) => item === type)?.[1] ?? type).join(" · ")}</span><h4>{report.name}</h4><p>{departmentCount} departments · {sourceCount} tables · {pivot.matchingRows} matching rows</p></div><div className="report-card-actions"><button className="icon-button" title="Export as CSV" aria-label={`Export ${report.name} as CSV`} onClick={() => exportCsv(report)}><Download size={15}/></button><button className="icon-button" title="Export as Excel-compatible workbook" aria-label={`Export ${report.name} to Excel`} onClick={() => exportExcel(report)}><FileSpreadsheet size={15}/></button><button className="icon-button" title="Print or save as PDF" aria-label={`Print ${report.name} or save as PDF`} onClick={() => printReport(report)}><Printer size={15}/></button><button className="icon-button" title="Edit report" aria-label={`Edit ${report.name}`} onClick={() => editReport(report)}><Save size={15}/></button><button className="icon-button report-delete-button" title="Delete report" aria-label={`Delete ${report.name}`} onClick={() => void removeReport(report)}><Trash2 size={15}/></button></div></header><div className="reports-saved-visuals">{visualTypes.map(type => { const { rows, total, totalValue } = makeRows(config, type); return <section className="reports-saved-visual" key={type}><span className="report-type-label">{chartTypes.find(([item]) => item === type)?.[1] ?? type}</span><ReportVisual type={type} rows={rows} totalLabel={total} totalValue={totalValue} metricLabel={metric} pivot={type === "pivot" ? pivot : undefined} fieldName={field => fieldLabel(field, config)}/></section>; })}</div></article>;
    })}</div> : <section className="panel reports-first-run"><div className="reports-first-icon"><BarChart3 size={25}/></div><h3>Your BI workspace is ready</h3><p>Select boards from multiple departments, choose a measure and chart type, then add your first report.</p><button className="primary-button" onClick={() => document.querySelector(".reports-builder")?.scrollIntoView({ behavior: "smooth", block: "start" })}><Plus size={15}/> Start building</button></section>}
    <div className="reports-footnote">Reports show data available to your signed-in account. Board permissions are enforced by Supabase row-level security.</div>
  </div>;
}
