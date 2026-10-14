/**
 * A principle scope's requirements: the rail beside its findings (failing
 * worst first, then the ones that only pass), the header's "N of M failing",
 * and narrowing the list and its kind filter to one requirement. Pure
 * functions over the scope's findings (the File page's object).
 */
import { groupByRequirement, mostFrequent } from '../../../models/findingsGrouping.js';
import { SEVERITY_ORDER } from '../../../vocab/severity.js';

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
