# DahonMD user-flow diagrams

Open [dahonmd-complete-user-flows.drawio](dahonmd-complete-user-flows.drawio) in
[diagrams.net](https://app.diagrams.net/) with **File → Open From → Device**.
The file has twenty-nine editable pages:

1. Role handoffs
2. Entry, identity and sessions
3. Scan, result and history
4. Agricultural review and handoff
5. Research photo consent and removal
6. Disease knowledge and article library
7. Administrator operations
8. Supporting interactions by role
9. Mobile scan: capture to history
10. Web scan: visitor to saved case
11. Scan sync and recovery
12. Review, follow-up and correction
13. Privacy, consent and deletion
14. Knowledge review and publication
15. Accounts, sessions and device scans
16. Agriculturist queue and decision paths
17. Administrator decisions and oversight
18. Exceptions and recovery
19. Records, states and visibility
20. Guide and article library reading
21. Review alerts, badges and Ask Dahon
22. Scan result and next steps
23. History: filters, statuses and review stages
24. Account: profile, photo, language and leaving
25. Optional scan location
26. Admin article authoring with photos
27. Admin accounts, diagnosis audit and research candidates
28. Analytics and model comparison
29. Connecting the phone and account recovery

The expanded key on each page shows eight meanings: orange for user actions,
blue for optional steps, pale green for system responses, yellow for decisions,
dark green for outcomes, purple for saved data, red for exceptions and retries,
and dashed gray for context notes. Labeled arrows show the next action or
handoff. Pages 1–8 map the full system; pages 9–29 show individual steps,
screens, recovery paths, library reading and review alerts in more detail.
Arrows are routed around boxes, so no arrow passes behind an unrelated step.

| User | Implemented journeys shown |
| --- | --- |
| Mobile guest | Offline scan, local history, guide and offline article library, Ask Dahon after sign-in, account entry, server connection, privacy (pages 1–3, 8–9, 15, 18–22, 29) |
| Web visitor | Public screening, registration and sign-in; the guide, article library and Ask Dahon open after sign-in; password reset, email verification and public account deletion (pages 1–2, 8, 10, 15, 18–19, 21, 29) |
| Farmer | Scan/history, automatic scan sync, review and follow-up, review notifications and badges, Ask Dahon, location, article library, research consent/removal, profile, photo and sign-out (pages 1–5, 8–13, 15–16, 18–25, 29) |
| Agriculturist | Queue badge and claim, assessments and corrections, content verification, research nomination/decision, article library, scan location map, profile (pages 1–2, 4–6, 8, 12, 14–16, 18–21, 24–25, 29) |
| Administrator | Accounts, scan and verdict audit, knowledge, web article library with photo uploads, research decisions and copy removal, analytics/model comparison and system information, profile (pages 1–2, 5–8, 13–15, 17–20, 24, 26–29) |

The roles shown are guest, farmer, agriculturist (`agricultural_expert` in the
API), and administrator. There is no separate researcher login. The diagram
distinguishes mobile guest history from public web screening: the phone can
save a local scan without an account; the public website requires sign-in to
save one. Mobile inference remains offline; web screening uses the optional
connected inference service.

This diagram reflects the currently implemented UI and API as of October 2026.
It is generated from [generate_user_flows.py](generate_user_flows.py), which can
be rerun after a workflow change. Source paths checked for the map include
`mobile-frontend/src/app/navigation.ts`, the connected and history screens,
`web-frontend/src/RoleApp.jsx`, `backend/routes/api.php`, the library and
notification services, and `docs/architecture/overview.md`.

## Entity-relationship diagram

[dahonmd-erd.drawio](dahonmd-erd.drawio) (editable) and
[dahonmd-erd.svg](dahonmd-erd.svg) (preview) show every database table with
its columns, keys and relationships. Page 1 groups the 20 application tables
into accounts, scans and reviews, research images, and disease knowledge with
the article library; page 2 lists Laravel's own system tables.

- Solid lines are database foreign keys, drawn in crow's-foot notation.
- Purple dashed lines are links the code keeps without a foreign key, for
  example a research image keeps its source scan's ID after that scan is deleted.
- Audit columns such as `created_by` or `approved_by` point to `users`; they
  are labelled `→ users` in the table instead of drawn, to keep the lines readable.

A simplified version, [dahonmd-erd-simple.drawio](dahonmd-erd-simple.drawio)
([preview](dahonmd-erd-simple.svg)), shows only the table names and the same
relationships, with the linking column written on each line.

The diagram is generated from a database with every migration applied, so it
cannot drift from the schema. To regenerate it after a migration change:

```bash
cd backend
touch /tmp/erd.sqlite
DB_CONNECTION=sqlite DB_DATABASE=/tmp/erd.sqlite php artisan migrate --force
python ../docs/diagrams/generate_erd.py /tmp/erd.sqlite
```

This regenerates both the full and the simplified diagram.

The generator stops with an error if a new table has no place in its layout.
