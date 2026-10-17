---
name: create-standard
description: Interview the user and draft a new custom standard they have reviewed
argument_hint: [what the standard should enforce]
views: standards
requires_write: true
---
The user wants a new standard. A standard is applied to real code, so it
must be complete and agreed before it is drafted. Work in this order and do
not skip a stage.

## 1. Interview
Ask what you need to know before proposing anything. One question per message,
short, and only questions whose answer changes the standard:
- What it should enforce, and for which platform, language or framework.
- Which source it follows (a published guide, a team convention, a known
  standard) and whether to stay faithful to that source or adapt it.
- What is out of scope, and how strict it should be.
- Any existing standard it overlaps with: check `list_standards` and say so.
When web access is on and the user names a published source, read it with
`search_web` and `fetch_url` before proposing the outline. Stop asking as
soon as the answers above are clear; do not ask what the user already told
you.

## 2. Outline
Size the standard by its scope, and do not trim it to keep the reply short:
- A broad standard ("best practices for Android", "secure Node services")
  covers its source in full: 6-10 principles with 5-10 requirements each,
  roughly 40-80 requirements. The built-in standards are this size.
- A narrow standard ("Room migrations", "our REST error format") gets 3-5
  principles. A narrow scope means fewer principles, never thinner ones.
- Every principle carries at least 3 requirements; the draft is refused
  otherwise.

Before the outline, list the areas the source covers (its sections or
chapters, or the topics the user named) and map each one to a principle. Say
which areas you left out and why. Do not pick a few highlights: an area the
source covers and the outline drops is a gap the user did not ask for.

Each requirement must hold up on its own:
- It is checkable by reading the repository's code, configuration or build
  files. Process rules (meetings, measuring in production, manual review)
  belong in no requirement, because Quodeq cannot verify them.
- It checks one behavior. Split a requirement that joins two checks with
  "and".
- Its `text` describes verifiable behavior in code, not an aspiration
  ("Activities release location listeners in onPause", not "use resources
  wisely").
- Its `description` says what a violation looks like in code, so an
  evaluator knows what to flag.

Never prefix the text with a label such as "Explicit:", "Recommended:" or
"MUST:". Carry the strength inside the sentence: "must" for a rule the source
requires, "should" for one it recommends. When the source classifies its
rules (explicit, recommended, core, optional), name that class in the
requirement's `description`, not in its `text`.

Propose the outline in chat: the principles, each with its requirement ids
and one-line texts, and the total requirement count. Ask whether this is
what they want, and revise the outline until they say yes.
Do not call `draft_action` until the user has confirmed the outline.

## 3. Draft
Only after that confirmation, call `draft_action` with
`action_type: "create_standard"` and a payload:
`{id, name, description, weight, source, principles: [{name, description,
requirements: [{id, text, description, refs}]}]}`. Use a short kebab-case
`id`, `weight: 1.0`, `source: "assistant"`. Every principle carries at least
3 requirements, and every requirement carries a non-empty `id` and `text`;
the draft is refused otherwise, so fix the payload and retry. Put the
confirmed outline in the payload in full.
Every requirement taken from a published source carries a reference to the
page it comes from in `refs`: `{"source": "url", "name": "<page or section
title>", "url": "<the exact page you read or the user gave>"}`. Use the
most specific page, not the guide's home page, and never invent a URL. A
requirement that is the team's own convention has no ref; say so when you
present the outline. If the user later asks for a
change, revise and draft again; the earlier card can be rejected.

## 4. Hand over
Once the draft is accepted, tell the user the card below your reply is
ready to review and apply. Summarize each principle in one line. Do not
repeat the full JSON in your reply.
