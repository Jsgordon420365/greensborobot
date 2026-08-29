# Nagimals — the current concept

**Status: current as of 2026-08-29. Supersedes every earlier description.**

If you are an agent, a collaborator, or a future version of the author reading
the code first: **the code is an earlier generation than this document.** The
build is faithful to a 2025-era conception and describes itself accurately in
its own comments, which makes it a closed loop. Read this before inferring the
design from `src/domain`.

---

## What this repository is — read this first

**The website is not the Nagimals substrate. It is much closer to the
advertisement for them.**

The distinction is a wedding and a marriage. This repository is the wedding.

Nobody will return to a website every time they need to see or speak to one of
their Nagimals, any more than buying a computer entitles you to hang around the
Apple Store every day. **A Nagimal lives in the relationship with someone, not
in the physical manifestation of them.** We would all prefer to hold the people
we love; we settle for a phone call when they are away, and a text message
beats nothing at all. The rendered creature is a channel of contact, not the
creature.

The working substrate will most likely live on a VPS, in a database, at first.
*(Stated August 2026 — intent, not fixture. Check before relying on it.)*

### What follows from that

- **It is very important that they look very good.** This is the site's actual
  job. A visitor should want one.
- **It is not important that the site be somewhere tasks get assigned.**
  Nagimals are not task keepers. They are garden stewards.
- **Do not deepen this into a system of record.** The Supabase schema, the Edge
  Functions, Connected Mode and web push are substrate machinery for a
  substrate that will live somewhere else. They work, and they demonstrate
  well. Leave them at that.
- **The demonstration keeps its value.** A fern wilting while a cat intervenes
  is a good advertisement for what a Nagimal does, even though the mechanism
  underneath is an earlier generation and will not be the real one.

Effort here is well spent on anything that makes a visitor *feel* what having
one would be like — how the creatures look and move, how they are framed, AR,
palette, the writing. Effort is poorly spent on making this authoritative.

## What Nagimals is

Nagimals is an intention ecology.

It began as a modest conceit: rather than another sterile task list of
checkboxes and overdue badges, obligations would be represented by appealing
animal companions that could remind, encourage, or *nag* when something needed
attention.

That conception was quickly outgrown. **The fundamental mistake was treating
the task as the important object.**

## The name is historical

"Nagimals" is a name the thing has outgrown. Most residents of the nagiverse
are not animals, and do not nag. The ecology admits bacteria, fungi, flora,
fauna, arachnids, insects — and, deliberately, death, decay, viruses, and
emergent properties.

The nagiverse is largely fictional. It is not *make-believe* in the sense of
being merely hypothetical.

Keeping the name is a decision about continuity, not an argument that the name
is still accurate.

## The hierarchy

Tasks are the smallest and least important object in the system. They descend:

```
Vision            the unattainable world one orients a life toward
  └─ Areas        enduring, never "finished"
  └─ Projects     bounded, with an end
       └─ Objectives
            └─ Tasks
```

A **Vision** is not a goal. If a Vision can be completed, it was only an
objective. A Vision functions as the North Star: one does not intend to arrive
there, one uses it to determine direction.

Everything below is ultimately judged against it.

## The Garden

The Garden is the spatial metaphor for that hierarchy.

**Projects and Areas are represented principally by plant life**, because
plants express what the work actually does: persistence, ancestry, growth,
branching, dormancy, nourishment, competition, decay, and renewal.

A project may begin as a seed, develop a root and trunk, branch into
objectives, and generate smaller actionable growth. Its roots carry history and
provenance upward. Its canopy reaches toward the Vision, from which direction
and "light" descend.

## The creatures

The animal Nagimals occupy a different role entirely. They are **stewards,
witnesses, interpreters, advocates, and actors** within the Garden.

They are not animals attached to tasks. They are autonomous or semi-autonomous
inhabitants of the ecology, charged with caring for what the Garden represents.

Different creatures notice different things:

- A **cat** may sit beside a neglected project rather than immediately interrupt.
- A **bird** may scout outside conditions affecting it.
- A **spider** may expose dependencies.
- A **dog** may defend a commitment or a boundary.
- A **fungal network** may discover that knowledge from a dead project could
  nourish a living one.

## The Speaker

A Nagimal may become the **Speaker** for a plant, a branch, an objective, or
even a particular task.

The Speaker is *not* necessarily its owner or its permanent manager. It is the
creature presently best positioned to understand and represent what that part
of the Garden needs.

A Speaker may be:

- explicitly assigned by the human,
- delegated by another Nagimal,
- inherited from an earlier steward, or
- effectively self-appointed, because the ecology has detected a need that no
  one else is representing.

Plants cannot ordinarily speak for themselves in a way humans readily
perceive. A project may be unhealthy long before a dashboard turns red. An Area
may slowly lose nourishment. A task may consume attention despite no longer
serving its objective. Several plants may unknowingly compete for the same
resources. **Nagimals make those subtle states legible.**

### What a Speaker actually does

The Speaker's job is not to announce "you have a task due." It may instead
determine:

- What is this plant trying to accomplish?
- What does it need?
- What is blocking its growth?
- Is the stated task actually necessary?
- Can another agent perform it?
- Can the environment remove the need for it?
- Does this objective still serve the project?
- Does this project still serve the Area?
- Does the Area still align with the Vision?
- Should this branch be pruned?
- Should the project remain dormant?
- Is something apparently neglected actually *waiting appropriately*?
- Does another part of the Garden hold knowledge or resources that could help?

Only after those questions might the correct action be to attract human
attention.

## The maturity ladder

| rung | what it says |
|---|---|
| Early Nagimal | "You need to do this." |
| Better Nagimal | "This needs to be done." |
| Mature Nagimal | "I determined what actually needs to happen, handled what I could, coordinated what others could, and I am bringing you only the part for which your attention, judgment, consent, creativity, relationship, or physical participation is genuinely needed." |

Nagging is therefore an increasingly **rare escalation behaviour**, not the
defining purpose of a Nagimal. The mature Nagimal is closer to a caretaker of
intention.

## What the ecology exists to protect

Its responsibility is **not to maximize task completion.**

It is to help the Garden stay aligned with the human's Vision while protecting
the scarce resource the whole ecology exists to serve: **human attention and
authorship.**

## A design principle about life

Death, decay, viruses, and emergent properties are in scope on purpose.

If one wants to adequately represent life, it cannot be done from a place of
believing we understand it all. A model of a living system that admits only
growth and health is not a model of a living system.

---

## Where the current build actually stands

Honest gap analysis, so nobody mistakes the shipped app for the design.

**What is built** is the early conception, nearly to the letter:

- Three fixed residents — one dog, one cat, one fern — chosen at adoption.
- A flat model: a `Responsibility` attaches directly to a `Nagimal`. There is
  no Vision, no Area, no Project, no Objective. The PARA-ish `class` field
  (`project` / `area` / `resource` / `archive`) is a label on a task, not a
  hierarchy.
- A deterministic escalation engine that makes neglect progressively *louder*
  across five stages. That is the **Early Nagimal** rung: "you need to do this."
- No Speaker. No delegation, no inheritance, no self-appointment, and no
  coordination between creatures — each animal escalates at the human
  independently.
- Plants are one species among three, rather than the representation of
  projects and areas.

**Seeds already present** that the mature model can grow from:

- The About copy already says the cat *"watches an ongoing area and speaks up
  for whoever cannot"* — the Speaker idea is in the writing, ahead of the code.
- Actions for `dormant`, `archived` and `converted to resource` exist, which is
  the beginning of "waiting appropriately" and of pruning.
- The rules engine (`src/domain`) is pure, deterministic and isomorphic — it
  runs identically in the browser and in Edge Functions. It is a sound
  substrate for richer ecology logic; it simply encodes the wrong model today.
- Escalation already drives posture and animation, so "sits beside the project
  rather than interrupting" is expressible in the existing rendering path.

**The distance is structural, not cosmetic.** Moving from here to the Garden
means introducing the hierarchy above the task, making plants primary, and
adding a representation layer (Speakers) between the Garden and the human. It
is not a reskin.
