## Assistant

The assistant is a chat panel that knows your project. It explains scores, digs into findings, and drafts standards using the same data you see in the dashboard.

### Opening it

On by default. Toggle it with `` Ctrl+` `` (`` Cmd+` `` works too on macOS). It lives in a resizable drawer at the bottom of the dashboard. To hide it, turn off **Enable assistant** in the *Toolbar* section of **Settings → App**.

### What it can see

The assistant follows you around the app: it knows which project, run, tab, dimension, folder, file, principle or finding you are looking at, so *why is this score low?* or *why does this folder have so many findings?* needs no extra context. Its tools read scores, reports and violations (for the whole project or one folder or file), search findings, read the score history, diff two runs, compare projects, list dismissed and verified findings, and read files from the analyzed repository. It can also read these Help pages, so it can explain what a screen, a panel or a number means in the app's own words. All of its tools are read-only.

### Typing while it works

You do not have to wait for an answer to finish. While the assistant is working, press Enter and your message is queued: it shows above the input with a clock and an × to remove it, and it is sent as soon as the current turn ends. Several messages queue in order. Escape with an empty input stops the turn.

### Actions need your approval

The assistant cannot change anything on its own. Ask it to dismiss a finding, verify one, or create a standard and it drafts the action as a preview card; nothing happens until you press **Apply**.

Creating a standard is an interview. The assistant asks what it should enforce and which source it follows, proposes an outline of principles and requirements in the chat, and drafts the card only once you confirm that outline. The card shows every requirement with a link to the source page it was taken from, so you can read and check the whole standard before you apply it. Reject the card and say what to change if it is not right yet.

### Slash commands and skills

| Key | Value |
| --- | --- |
| /help | What the assistant can do. |
| /skills | List the built-in skills: explain-score, explain-finding, explain-folder, explain-file, explain-trend, compare-runs, compare-projects, verify-finding, create-standard. |
| /clear | Start a fresh conversation. |

Skills are guided workflows. The welcome screen suggests the ones relevant to the tab or page you are on.

### Provider and privacy

By default the assistant uses your evaluation provider; pick a separate provider or model in the *Assistant* section of **Settings → Model** (choose **Custom**). Cloud providers bill each message like any other call. Web search is off by default and only offered on local providers. Closing the drawer keeps the conversation; reloading the page starts a fresh one.
