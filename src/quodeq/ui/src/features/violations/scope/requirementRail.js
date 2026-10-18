/**
 * A principle scope's requirements: the rail beside its findings (failing
 * worst first, then the ones that only pass), the header's "N of M failing",
 * and narrowing the list and its kind filter to one requirement. Pure
 * functions over the scope's findings (the File page's object).
 */
import { groupByRequirement, mostFrequent } from '../../../models/findingsGrouping.js';
import { SEVERITY_ORDER } from '../../../vocab/severity.js';
import { ROW_KIND } from '../../explorer/components/findingListRows.js';

const allViolations = (file) => Object.values(file.violationsBySeverity || {}).flat();
const reqsOf = (items) => items.map((i) => i.req).filter(Boolean);

/**
 * The rail's two groups: the failing requirements worst first (as Fix first
 * ranks them, over the live violations), then the ones with only compliant
 * checks, by id, each with its checks counted.
 * @param {string} dimension
 * @param {{violationsBySeverity: object, compliance?: object[]}} file the scope's findings
 * @param {(v: object) => boolean} isLive false for a violation dismissed on this page
 * @returns {{failing: object[], passing: {req: string, text: string, count: number}[]}}
 */
export function requirementRail(dimension, file, isLive) {
  const failing = groupByRequirement([{ dimension, violations: allViolations(file).filter(isLive) }]);
  const failed = new Set(failing.map((r) => r.req));
  const byReq = new Map();
  for (const c of file.compliance || []) {
    if (!c.req || failed.has(c.req)) continue;
    const list = byReq.get(c.req) || [];
    list.push(c);
    byReq.set(c.req, list);
  }
  const passing = [...byReq.entries()]
    .map(([req, list]) => ({ req, text: mostFrequent(list.map((c) => c.title)) || req, count: list.length }))
    .sort((a, b) => a.req.localeCompare(b.req));
  return { failing, passing };
}

/** How many requirements fail (any violation) of how many were checked (a violation or a compliant check). */
export function requirementCounts(file) {
  const failing = new Set(reqsOf(allViolations(file)));
  const checked = new Set([...failing, ...reqsOf(file.compliance || [])]);
  return { failing: failing.size, total: checked.size };
}

/**
 * The list's rows narrowed to one requirement: its findings, each group
 * header kept only with findings under it and recounted. All rows without `req`.
 * @param {object[]} rows the list's rows (group headers carry no finding)
 * @param {?string} req
 */
export function rowsOfRequirement(rows, req) {
  if (!req) return rows;
  const out = [];
  let pending = null; // a group header waiting for its first finding
  let current = null; // the header the findings below are counted under
  for (const item of rows) {
    const f = item.v || item.c;
    if (!f) { pending = { ...item, count: 0 }; continue; }
    if (f.req !== req) continue;
    if (pending) { out.push(pending); current = pending; pending = null; }
    if (current) current.count += 1;
    out.push(item);
  }
  return out;
}

/**
 * The kind filter's counts inside one requirement: its live violations by
 * severity and its compliant checks.
 * @returns {{sev: object, compliance: number}}
 */
export function reqKindCounts(file, req, isLive) {
  const sev = Object.fromEntries(SEVERITY_ORDER.map((level) => [level, 0]));
  for (const [level, list] of Object.entries(file.violationsBySeverity || {})) {
    if (!(level in sev)) continue;
    sev[level] += list.filter((v) => v.req === req && isLive(v)).length;
  }
  return { sev, compliance: (file.compliance || []).filter((c) => c.req === req).length };
}

/**
 * A group's counts over the findings it shows: violations by severity, and
 * the files they break (as the rail counts them), or with none, the files
 * its compliant checks read.
 */
function groupOf(req, text, items) {
  const sev = {};
  const broken = new Set();
  const checked = new Set();
  for (const item of items) {
    if (item.v) { sev[item.v.severity] = (sev[item.v.severity] || 0) + 1; broken.add(item.v.file); } else checked.add(item.c.file);
  }
  return { req, text, items, sev, fileCount: (broken.size ? broken : checked).size };
}

/**
 * The list's findings grouped by requirement, in the rail's order (failing
 * worst first, then the passing ones), each finding kept in the order
 * `rows` gives it and each group counted over what it shows. Requirements
 * the rail does not know follow by id; findings with none close the list
 * (`req` '').
 * @param {object[]} rows the list's rows (headers and toggles are dropped)
 * @param {{failing: object[], passing: object[]}} rail
 */
export function requirementGroups(rows, rail) {
  const byReq = new Map();
  for (const item of rows) {
    const f = item.v || item.c;
    if (!f) continue;
    const req = f.req || '';
    const list = byReq.get(req) || [];
    list.push(item);
    byReq.set(req, list);
  }
  const known = [...rail.failing, ...rail.passing];
  const text = new Map(known.map((r) => [r.req, r.text]));
  const order = known.map((r) => r.req).filter((req) => byReq.has(req));
  const rest = [...byReq.keys()].filter((req) => req && !text.has(req)).sort();
  if (byReq.has('')) rest.push('');
  return [...order, ...rest].map((req) => groupOf(req, text.get(req) || req, byReq.get(req)));
}

/**
 * The grouped list's rows: each group's header, then its findings while it
 * is open (`isOpen(req)`).
 */
export function groupedRows(groups, isOpen) {
  return groups.flatMap((g) => {
    const open = isOpen(g.req);
    const header = { kind: ROW_KIND.REQ_HEADER, req: g.req, text: g.text, sev: g.sev, count: g.items.length, fileCount: g.fileCount, open };
    return open ? [header, ...g.items] : [header];
  });
}
