// Mirror of src/quodeq/assistant/tool_activity.py:ToolKind. Who a tool call
// belongs to: quodeq's own registry, or the harness around it (Claude Code's
// ToolSearch), which the transcript shows as one "preparing" line.
export const TOOL_KIND = Object.freeze({ QUODEQ: 'quodeq', HARNESS: 'harness' });
