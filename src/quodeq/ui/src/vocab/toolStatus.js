// Mirror of src/quodeq/assistant/tool_activity.py:ToolStatus. Where one tool
// call is: started, finished well, or failed. Two frames share a callId; the
// second one carries the final status and duration.
export const TOOL_STATUS = Object.freeze({ RUNNING: 'running', OK: 'ok', ERROR: 'error' });
