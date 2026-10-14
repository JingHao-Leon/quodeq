import { describe, it, expect, vi } from "vitest";
import { applyMutationDelta } from "./applyMutationDelta";
import { projectKeys } from "./queryKeys";

// A mock queryClient backed by a Map keyed by JSON.stringify(key), the same
// double applyMutationDelta.dismissDerived.test.jsx uses.
function makeClient(initial = {}) {
  const store = new Map(Object.entries(initial));
  const getQueryData = vi.fn((key) => store.get(JSON.stringify(key)));
  const setQueryData = vi.fn((key, updater) => {
    const k = JSON.stringify(key);
    const prev = store.get(k);
    const next = typeof updater === "function" ? updater(prev) : updater;
    store.set(k, next);
    return next;
  });
  const invalidateQueries = vi.fn();
  return { client: { getQueryData, setQueryData, invalidateQueries }, store, setQueryData };
}

const PROJECT = "p1";
const RUN = "run-1";

function securityDim() {
  return {
    dimension: "security", overallScore: "5.0", overallGrade: "C",
    violations: [{ req: "R1", file: "a.py", line: 10, severity: "critical" }],
    totals: { violationCount: 1, severity: { critical: 1, major: 0, minor: 0 } },
  };
}
// The Overview's headline number is recomputed on the client from the latest
// trend entry's per-dimension detail scores, so the dismiss must move those
// for the number to follow without waiting for the reconcile refetch.
describe("applyMutationDelta: the trend entry of the rescored run", () => {
  function trend() {
    return [
      { runId: RUN, dimensionDetails: [{ dimension: "security", score: 5.0, grade: "C" }, { dimension: "maintainability", score: 7.0, grade: "B" }] },
      { runId: "run-0", dimensionDetails: [{ dimension: "security", score: 4.0, grade: "D" }] },
    ];
  }

  function dismissLatest(client) {
    applyMutationDelta(client, PROJECT, {
      kind: "dismiss", runId: RUN, isLatest: true,
      dismissed: { req: "R1", file: "a.py", line: 10 },
      dimensions: [{ dimension: "security", overallScore: "6.5/10", overallGrade: "B" }],
    });
  }

  it("patches the detail score and grade of the rescored dimension in both payload shapes", () => {
    const { client, store } = makeClient();
    const dashKey = projectKeys.dashboard(PROJECT, "latest");
    const scoresKey = projectKeys.scores(PROJECT, null);
    store.set(JSON.stringify(dashKey), { dimensions: [securityDim()], trend: trend() });
    store.set(JSON.stringify(scoresKey), { accumulated: { dimensions: [] }, trend: trend() });

    dismissLatest(client);

    for (const key of [dashKey, scoresKey]) {
      const [latest] = store.get(JSON.stringify(key)).trend;
      expect(latest.dimensionDetails[0]).toEqual({ dimension: "security", score: 6.5, grade: "B" });
      expect(latest.dimensionDetails[1]).toEqual({ dimension: "maintainability", score: 7.0, grade: "B" });
    }
  });

  it("keeps every other trend entry's identity and leaves a payload without a trend alone", () => {
    const { client, store, setQueryData } = makeClient();
    const dashKey = projectKeys.dashboard(PROJECT, "latest");
    const before = { dimensions: [securityDim()], trend: trend() };
    store.set(JSON.stringify(dashKey), before);
    const runFindingsKey = projectKeys.runScores(PROJECT, RUN);
    store.set(JSON.stringify(runFindingsKey), { dimensions: [securityDim()] });

    dismissLatest(client);

    const after = store.get(JSON.stringify(dashKey));
    expect(after.trend[1]).toBe(before.trend[1]);
    expect(store.get(JSON.stringify(runFindingsKey)).trend).toBeUndefined();
    expect(setQueryData.mock.calls.every(([, updater]) => typeof updater === "function")).toBe(true);
  });

  it("does not touch the trend when the run is not the latest", () => {
    const { client, store } = makeClient();
    const dashKey = projectKeys.dashboard(PROJECT, "latest");
    const before = { dimensions: [securityDim()], trend: trend() };
    store.set(JSON.stringify(dashKey), before);

    applyMutationDelta(client, PROJECT, {
      kind: "dismiss", runId: RUN, isLatest: false,
      dismissed: { req: "R1", file: "a.py", line: 10 },
      dimensions: [{ dimension: "security", overallScore: "6.5/10", overallGrade: "B" }],
    });

    expect(store.get(JSON.stringify(dashKey)).trend).toBe(before.trend);
  });
});


// The principle page's history reads the same trend detail, one level down:
// the rescored principle grades patch its points by name.
describe("applyMutationDelta: the principle points of the rescored run", () => {
  const point = (principle, score, grade) => ({ principle, score, grade, critical: 0, majors: 1, violations: 2 });

  function seed(store, principles) {
    const dashKey = projectKeys.dashboard(PROJECT, "latest");
    const detail = { dimension: "security", score: 5.0, grade: "C", ...(principles ? { principles } : {}) };
    store.set(JSON.stringify(dashKey), { dimensions: [securityDim()], trend: [{ runId: RUN, dimensionDetails: [detail] }] });
    return dashKey;
  }

  function dismissWithPrinciples(client) {
    applyMutationDelta(client, PROJECT, {
      kind: "dismiss", runId: RUN, isLatest: true,
      dismissed: { req: "R1", file: "a.py", line: 10 },
      dimensions: [{
        dimension: "security", overallScore: "6.5/10", overallGrade: "B",
        principles: [{ principle: "Integrity", score: "8.0/10", grade: "Good" }, { principle: "Gone", score: null, grade: null }],
      }],
    });
  }

  it("patches the rescored principles' score and grade, keeping their counts and the untouched ones", () => {
    const { client, store } = makeClient();
    const untouched = point("Confidentiality", 4.0, "Poor");
    const dashKey = seed(store, [point("Integrity", 6.0, "Fair"), untouched]);

    dismissWithPrinciples(client);

    const [detail] = store.get(JSON.stringify(dashKey)).trend[0].dimensionDetails;
    expect(detail.principles[0]).toEqual(point("Integrity", 8.0, "Good"));
    expect(detail.principles[1]).toBe(untouched);
  });

  it("leaves a detail from before the field without principles", () => {
    const { client, store } = makeClient();
    const dashKey = seed(store, null);

    dismissWithPrinciples(client);

    const [detail] = store.get(JSON.stringify(dashKey)).trend[0].dimensionDetails;
    expect(detail).toEqual({ dimension: "security", score: 6.5, grade: "B" });
  });
});
