import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRunEventStream } from "./useRunEventStream";
import { evaluationKeys } from "../../../api/queryKeys.js";
import { MockEventSource } from "../../../test-utils/MockEventSource.js";

describe("useRunEventStream dimension results with no reader mounted", () => {
  beforeEach(() => {
    vi.stubGlobal("EventSource", MockEventSource);
    MockEventSource.last = null;
    MockEventSource.instances = [];
  });

  it("keeps a finished dimension's result after the slot sits unwatched", async () => {
    // gcTime 0 stands in for the user being on another screen longer than
    // the default 5 minutes between two dimensions finishing.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    renderHook(() => useRunEventStream("job-1"), { wrapper });

    act(() => MockEventSource.last.emit("dimension-completed", { dimension: "security", overallScore: "5.9/10" }));
    await act(() => new Promise((resolve) => { setTimeout(resolve, 20); }));
    act(() => MockEventSource.last.emit("dimension-completed", { dimension: "reliability", overallScore: "5.0/10" }));

    expect(Object.keys(client.getQueryData(evaluationKeys.dimensions("job-1")))).toEqual(["security", "reliability"]);
  });
});
