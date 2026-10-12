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
Propose the outline in chat: 2-5 principles, each with 2-6 requirements,
shown as the requirement ids and one-line texts under each principle. Every
requirement text describes verifiable behavior in code, not an aspiration
("Activities release location listeners in onPause", not "use resources
wisely"). Ask whether this is what they want, and revise the outline until
they say yes.
Do not call `draft_action` until the user has confirmed the outline.

## 3. Draft
Only after that confirmation, call `draft_action` with
`action_type: "create_standard"` and a payload:
`{id, name, description, weight, source, principles: [{name, description,
requirements: [{id, text, description, refs}]}]}`. Use a short kebab-case
`id`, `weight: 1.0`, `source: "assistant"`. Every principle carries at least
one requirement, and every requirement carries a non-empty `id` and `text`;
the draft is refused otherwise, so fix the payload and retry. Put the
confirmed outline in the payload in full. If the user later asks for a
change, revise and draft again; the earlier card can be rejected.

## 4. Hand over
Tell the user the draft card is ready to review and apply. Summarize each
principle in one line. Do not repeat the full JSON in your reply.
