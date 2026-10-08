"""Generate the current, editable role-flow map for diagrams.net.

The detailed screen/action inventory lives in ROLE_USER_FLOWS.md. This diagram
shows the implemented paths and cross-role handoffs without treating menu
options as mandatory steps.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

from generate_user_flows import Page


OUTPUT = Path(__file__).with_name("dahonmd-role-user-flows-2026-10-07.drawio")


def page(
    document: ET.Element,
    page_id: str,
    title: str,
    subtitle: str,
    lanes: list[tuple[str, list[tuple[str, str, str]]]],
    handoffs: list[tuple[str, str, str]],
    note: str,
) -> None:
    flow = Page(document, page_id, title, subtitle, 1710)
    lane_of = {key: index for index, (_, steps) in enumerate(lanes) for key, _, _ in steps}
    for lane_index, (heading, steps) in enumerate(lanes):
        flow.lane(f"lane_{lane_index}", heading, 30 + 460 * lane_index)
        for row_index, (key, label, kind) in enumerate(steps):
            flow.box(key, label, 60 + 460 * lane_index, 260 + 155 * row_index, kind)
            if row_index:
                flow.edge(f"seq_{lane_index}_{row_index}", steps[row_index - 1][0], key, "", "down")
    for index, (start, end, label) in enumerate(handoffs):
        direction = "right" if lane_of[start] < lane_of[end] else "left" if lane_of[start] > lane_of[end] else "down"
        flow.edge(f"handoff_{index}", start, end, label, direction, dashed=True)
    flow.note("footer", note, 60, 1515, 1760, 115)


def role_handoff_page(document: ET.Element) -> None:
    """Use a short, slide-sized overview; the later pages hold the detail."""
    flow = Page(
        document, "handoffs", "01  DahonMD screening and expert review workflow",
        "Main journey: photo → offline AI → local result → optional expert request → expert answer. Dashed arrows are optional steps.", 1130,
    )
    # The full legend is useful on detailed pages but takes too much slide space.
    for cell in list(flow.root):
        key = cell.get("id", "")
        if key.startswith("legend_"):
            flow.root.remove(cell)
            flow.ids.discard(key)
            flow.geo.pop(key, None)
    flow.text("path_key", "Solid arrows: review path     ·     Dashed arrows: optional handoff", 40, 120, 1700, 35, 15, "#315444", True)

    for index, title in enumerate(("Farmer", "Device / system", "Agriculturist", "Administrator / oversight")):
        flow.lane(f"lane_{index}", title, 30 + 460 * index)
    # Oversight is a supporting branch, so its lane stays visually quiet.
    for cell in flow.root:
        if cell.get("id") == "lane_3_bg":
            cell.set("style", cell.get("style", "").replace("#F9FBFA", "#FCFDFC").replace("#DBE6E0", "#E6ECE8"))
        elif cell.get("id") == "lane_3_header":
            cell.set("style", cell.get("style", "").replace("#214F3A", "#E9F0EB").replace("fontColor=#FFFFFF", "fontColor=#315444"))

    boxes = (
        ("h_scan", "1  Camera / Gallery:\nchoose a leaf photo", 0, 235, "action"),
        ("h_local", "3  See result and local History", 0, 370, "outcome"),
        ("h_ask", "4  Ask an expert\nwhen help is needed", 0, 505, "action"),
        ("h_read", "7  Read expert answer\nbeside the AI result", 0, 910, "outcome"),
        ("h_offline", "2  AI classifies on-device\n— no server required", 1, 235, "system"),
        ("h_sync", "Sign in + online:\ncase syncs, review optional", 1, 505, "system"),
        ("h_pending", "Expert request enters\nthe review queue", 1, 640, "data"),
        ("h_verdict", "Store expert assessment\nseparately from AI result", 1, 910, "data"),
        ("h_queue", "5  Agriculturist claims\nthe case", 2, 640, "action"),
        ("h_inspect", "Inspect photo, AI result\nand farmer's note", 2, 775, "action"),
        ("h_assess", "6  Submit assessment\nand next steps", 2, 910, "action"),
        ("h_users", "Manage farmer and\nagriculturist accounts", 3, 235, "support"),
        ("h_audit", "Audit diagnosis and\nexpert review records", 3, 910, "support"),
    )
    for key, label, lane, y, kind in boxes:
        oversight = lane == 3
        flow.box(key, label, 75 + 460 * lane if oversight else 60 + 460 * lane, y + 15, kind, 350 if oversight else 380, 66 if oversight else 72)
        if not oversight:
            for cell in flow.root:
                if cell.get("id") == key:
                    cell.set("style", cell.get("style", "").replace("fontSize=15", "fontSize=18").replace("strokeWidth=2", "strokeWidth=3"))
                    break

    arrows = (
        ("h_scan", "h_offline", "", "right", False),
        ("h_offline", "h_local", "", "left", False),
        ("h_local", "h_ask", "if needed", "down", True),
        ("h_ask", "h_sync", "connected step", "right", True),
        ("h_sync", "h_pending", "", "down", False),
        ("h_pending", "h_queue", "", "right", False),
        ("h_queue", "h_inspect", "", "down", False),
        ("h_inspect", "h_assess", "", "down", False),
        ("h_assess", "h_verdict", "", "left", False),
        ("h_verdict", "h_read", "", "left", False),
        ("h_verdict", "h_audit", "optional oversight", "right", True),
    )
    for index, (start, end, label, direction, optional) in enumerate(arrows):
        flow.edge(f"handoff_{index}", start, end, label, direction, dashed=optional)
    flow.note(
        "footer",
        "Research is separate: with farmer consent, an eligible completed case may enter the candidate queue; independent staff approval is still required. Uncertain scans may also be prioritized for expert review. See pages 4 and 6 for those branches.",
        60, 1015, 1760, 90,
    )


def journey_page(
    document: ET.Element,
    page_id: str,
    title: str,
    subtitle: str,
    lanes: list[tuple[str, list[tuple[str, str, str, int]]]],
    connectors: list[tuple[str, str, str, bool]],
    note: str,
) -> None:
    """Draw an explicit screen journey; unrelated options get no sequence arrow."""
    flow = Page(document, page_id, title, subtitle, 1710)
    positions: dict[str, tuple[int, int]] = {}
    for lane_index, (heading, steps) in enumerate(lanes):
        flow.lane(f"lane_{lane_index}", heading, 30 + 460 * lane_index)
        for key, label, kind, row in steps:
            flow.box(key, label, 60 + 460 * lane_index, 260 + 175 * row, kind)
            positions[key] = (lane_index, row)
    for index, (start, end, label, optional) in enumerate(connectors):
        source_lane, source_row = positions[start]
        target_lane, target_row = positions[end]
        direction = "right" if source_lane < target_lane else "left" if source_lane > target_lane else "down" if source_row < target_row else "up"
        flow.edge(f"path_{index}", start, end, label, direction, dashed=optional)
    flow.note("footer", note, 60, 1515, 1760, 115)


def build() -> ET.Element:
    document = ET.Element("mxfile", {
        "host": "app.diagrams.net",
        "modified": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "agent": "DahonMD current role-flow generator",
        "version": "24.7.17",
        "type": "device",
        "pages": "16",
    })

    role_handoff_page(document)

    page(document, "guest", "02  Guest and identity", "Android and website entry have different offline and save behavior.", [
        ("Android guest", [
            ("g_open", "Open Scan without\naccount or server", "action"),
            ("g_photo", "Camera / Gallery →\nCheck leaf on-device", "action"),
            ("g_local", "Result and photo saved\nto local History", "data"),
            ("g_guide", "Open Guide and\noffline library", "support"),
            ("g_account", "Account focuses on Sign in;\nCreate account is secondary", "action"),
        ]),
        ("Website visitor", [
            ("g_site", "Open public website", "action"),
            ("g_webscan", "Photo → connected\ninference screening", "action"),
            ("g_webresult", "View result or\nservice-unavailable state", "decision"),
            ("g_websave", "Sign in before saving\nto account History", "action"),
        ]),
        ("Identity and consent", [
            ("g_signup", "Login or new farmer signup", "action"),
            ("g_terms", "Signup discloses future\nresearch consideration", "note"),
            ("g_session", "Role-based home after\nauthentication", "system"),
            ("g_claim", "Guest scans remain local until\nfarmer chooses Add device scans", "decision"),
        ]),
        ("Exceptions", [
            ("g_nonleaf", "Rejected non-leaf / poor image:\nretake or choose new photo", "error"),
            ("g_offline", "No internet: Android scan works;\nconnected actions wait", "error"),
            ("g_server", "Retry connection or use\nserver QR / settings", "support"),
            ("g_reset", "Forgot password and email\nverification links", "support"),
        ]),
    ], [
        ("g_account", "g_signup", "open login"),
        ("g_signup", "g_claim", "signed in"),
    ], "A guest can view local History without signing in. Asking an agriculturist requires a farmer account and connection; the result screen resumes after login.")

    page(document, "farmer", "03  Farmer scanning and history", "The Android scan is local first; web scanning and synchronization need the connected service.", [
        ("Android farmer", [
            ("f_capture", "Camera / Gallery →\nCheck leaf", "action"),
            ("f_model", "224 × 224 RGB → bundled\nTFLite four-class model", "system"),
            ("f_result", "See score, next step, retake\nand guide link", "outcome"),
            ("f_save", "Local scan saved automatically;\nsync when connected", "data"),
            ("f_direct", "Opinion text + Ask an expert\non the result itself", "action"),
        ]),
        ("Website farmer", [
            ("f_webphoto", "Upload / capture leaf photo", "action"),
            ("f_webmodel", "Connected inference API\nreturns screening", "system"),
            ("f_webresult", "See result or uncertainty;\nretake if needed", "decision"),
            ("f_websave", "Save result and optional\nreview request", "action"),
        ]),
        ("History and sync", [
            ("f_history", "Filter and open scan\ninline in History", "action"),
            ("f_status", "Local / queued / failed /\nsynced / review stage", "system"),
            ("f_retry", "Retry sync or resend photo\nwhen upload fails", "error"),
            ("f_expert", "View expert result beside\noriginal AI screening", "outcome"),
            ("f_delete", "Delete scan or withdraw\nthat scan's research consent", "support"),
        ]),
        ("Guidance and location", [
            ("f_guide", "Guide and articles explain\nvisible signs and care", "support"),
            ("f_chat", "Signed-in Ask Dahon can\ndiscuss a synced case", "support"),
            ("f_location", "Optionally add / remove\napproximate scan location", "support"),
            ("f_retake", "Low score / poor image:\ntake a clearer photo", "decision"),
        ]),
    ], [
        ("f_save", "f_history", "saved"),
        ("f_direct", "f_expert", "later review"),
    ], "The score is a model score, not a confirmed diagnosis. The agriculturist verdict never overwrites the original AI class or score.")

    page(document, "review", "04  Expert review and follow-up", "One case can cycle through request, assessment and farmer follow-up while preserving revisions.", [
        ("Farmer", [
            ("r_request", "Ask expert from result\nor saved History case", "action"),
            ("r_note", "Optional concern: why AI\nmay be wrong", "support"),
            ("r_wait", "See waiting / in-progress\nreview stage", "system"),
            ("r_answer", "Read verdict, message,\nnext steps and original AI", "outcome"),
            ("r_follow", "Reply or send clearer photo\non same case", "action"),
        ]),
        ("Review queue", [
            ("r_queue", "New request or uncertain\ncase enters queue", "system"),
            ("r_claim", "Agriculturist claims case;\nothers see active claim", "system"),
            ("r_photo", "Photo missing? Farmer can\nresend; expert can defer", "error"),
            ("r_reopen", "Follow-up reopens same case\nwith prior revision visible", "system"),
        ]),
        ("Agriculturist", [
            ("r_open", "Open photo, AI result, notes,\nfarmer history and location", "action"),
            ("r_choice", "Same / alternate class;\nor cannot determine / other / field", "decision"),
            ("r_message", "Template or Other message;\nquality and next steps", "action"),
            ("r_save", "Save structured assessment;\ninternal note stays staff-only", "action"),
            ("r_correct", "Reviewed Cases shows answer\nand earlier versions", "support"),
        ]),
        ("Stored outcomes", [
            ("r_ai", "AI prediction retained\nin diagnoses", "data"),
            ("r_review", "Expert verdict stored in\ndiagnosis_reviews", "data"),
            ("r_versions", "Earlier assessments stored\nas revisions", "data"),
            ("r_alert", "Farmer sees new review;\nopening marks it seen", "outcome"),
        ]),
    ], [
        ("r_request", "r_queue", "submit"),
        ("r_queue", "r_open", "choose case"),
        ("r_save", "r_review", "persist"),
        ("r_review", "r_answer", "answer ready"),
        ("r_follow", "r_reopen", "reopen"),
    ], "An expert can disagree with the model or report uncertainty. A completed, determinate review of a good image is required before dataset approval.")

    page(document, "knowledge", "05  Disease knowledge and library", "The four screening classes have governed records; article content is a separate library.", [
        ("Administrator", [
            ("k_records", "Disease Knowledge card grid:\nfour model-class records", "action"),
            ("k_edit", "Edit summary, symptoms,\nmanagement and evidence", "action"),
            ("k_submit", "Submit researched content\nfor expert verification", "action"),
            ("k_sources", "Manage research sources and\nregulatory checks", "action"),
            ("k_articles", "Author / edit / archive articles;\nboth editors can upload photos", "action"),
        ]),
        ("Agriculturist", [
            ("k_queue", "Open disease records\nawaiting verification", "action"),
            ("k_evidence", "Review claims, evidence,\nsources and limitations", "action"),
            ("k_decide", "Verify / request revision /\nreject content", "decision"),
            ("k_read", "Read research sources and\narticle library", "support"),
        ]),
        ("Farmer", [
            ("k_guide", "Open Guide from result\nor bottom navigation", "action"),
            ("k_class", "Compare leaf conditions and\nread practical advice", "outcome"),
            ("k_library", "Read articles on mobile\nor signed-in website", "support"),
            ("k_limit", "Guidance does not turn AI\nscreening into diagnosis", "note"),
        ]),
        ("Published state", [
            ("k_seed", "ScientificKnowledgeSeeder\nprovides initial class records", "data"),
            ("k_status", "Researched → verified /\nrevision / rejected", "data"),
            ("k_visibility", "Verified guidance is eligible\nfor farmer display", "system"),
            ("k_scope", "No unsupported class is added\nto the four-class model", "note"),
        ]),
    ], [
        ("k_submit", "k_queue", "review"),
        ("k_decide", "k_visibility", "publish state"),
        ("k_visibility", "k_class", "guidance"),
    ], "Android admin Knowledge includes Diseases, Articles and Sources. Website admin adds a larger disease grid; both article editors can add photos.")

    page(document, "research", "06  Consent and dataset candidates", "Candidate creation is automatic; approval and retention are separate staff decisions.", [
        ("Farmer consent", [
            ("d_terms", "New signup agreement\ndiscloses future consideration", "action"),
            ("d_scan", "Future signed-in scan has\ncurrent consent and photo", "data"),
            ("d_manage", "Account can turn sharing off;\nHistory can withdraw one scan", "support"),
            ("d_remove", "Account can remove an\napproved private copy", "action"),
        ]),
        ("Automatic queue", [
            ("d_review", "Agriculturist completes\nreview of consented case", "system"),
            ("d_check", "Check retained photo, active\nconsent and completed review", "decision"),
            ("d_candidate", "Create one pending candidate\nwithout copying photo", "data"),
            ("d_reopen", "Farmer follow-up makes an\nundecided candidate stale", "system"),
            ("d_requeue", "New completed review puts\nstale candidate back in queue", "system"),
        ]),
        ("Independent staff", [
            ("d_grid", "Open photo grid; compare AI,\nexpert result and consent", "action"),
            ("d_independent", "Decision maker did not\nassess this case", "decision"),
            ("d_decide", "Approve / keep uncertain /\nreject with notes", "action"),
            ("d_quality", "Approval needs clear photo,\ncurrent consent and firm verdict", "decision"),
        ]),
        ("Retention / audit", [
            ("d_copy", "Approval stores separate\nprivate research copy", "data"),
            ("d_audit", "Farmer and admin can inspect\nretained-copy audit", "support"),
            ("d_withdraw", "Withdraw / remove copy;\nretry pending file removal", "action"),
            ("d_training", "No automatic model training\nor deployment", "note"),
        ]),
    ], [
        ("d_scan", "d_check", "eligible scan"),
        ("d_check", "d_grid", "pending"),
        ("d_decide", "d_copy", "approved"),
        ("d_manage", "d_withdraw", "withdraw"),
    ], "Existing accounts keep their current research preference. Old eligible reviewed scans are queued by the one-time migration; rejected or undecided scans are not silently approved.")

    page(document, "admin", "07  Administrator operations", "Android covers core oversight; the website adds analytics, research audit and model views.", [
        ("People", [
            ("a_home", "Open Dashboard / Home\nfor live counts", "action"),
            ("a_users", "Users / Accounts: search\nfarmers or agriculturists", "action"),
            ("a_create", "Create or edit staff and\nfarmer accounts", "action"),
            ("a_delete", "Delete an account\nwhen authorized", "support"),
        ]),
        ("Diagnosis audit", [
            ("a_scans", "Open Scans / Diagnoses\nlist and filters", "action"),
            ("a_case", "Inspect photo, farmer, source,\nAI result and expert review", "action"),
            ("a_remove", "Delete server diagnosis\nwhen authorized", "support"),
            ("a_separate", "AI and human results\nremain separate records", "data"),
        ]),
        ("Knowledge and research", [
            ("a_knowledge", "Manage disease records,\nsources and articles", "action"),
            ("a_expert", "Expert verifies disease\ncontent independently", "system"),
            ("a_grid", "Web Dataset Candidates:\nindependent decision grid", "action"),
            ("a_copies", "Web research-copy audit\nand removal with reason", "action"),
        ]),
        ("Web-only insights", [
            ("a_analytics", "Analytics and review\nturnaround metrics", "action"),
            ("a_compare", "Model Comparison\nresearch view", "action"),
            ("a_system", "Model Information and\nsystem status", "action"),
            ("a_profile", "Profile, language and\nsign-out", "support"),
        ]),
    ], [
        ("a_knowledge", "a_expert", "submit for review"),
        ("a_expert", "a_grid", "reviewed cases"),
    ], "The admin does not directly change an Android model prediction. Dataset candidate approval retains a photo for governed research only.")

    page(document, "recovery", "08  Account, privacy and recovery", "These branches apply across the main role journeys and keep failed work visible.", [
        ("Farmer account", [
            ("x_profile", "Edit name, email, password,\nprofile photo and language", "action"),
            ("x_verify", "Resend verification email\nwhere needed", "support"),
            ("x_research", "Change research preference;\nremove private copies", "action"),
            ("x_signout", "Sign out after checking\nunsent changes", "decision"),
            ("x_delete", "Delete account; choose whether\nto remove research copies", "action"),
        ]),
        ("Staff account", [
            ("x_stafflogin", "Verified staff login", "action"),
            ("x_staffprofile", "Profile / password / photo\nand language", "action"),
            ("x_staffsignout", "Sign out or recover\nexpired session", "support"),
            ("x_denied", "Wrong role or unverified:\nprotected action denied", "error"),
        ]),
        ("Connection", [
            ("x_offline", "No network or tunnel:\nAndroid scan remains usable", "error"),
            ("x_retry", "Retry connection; scan QR\nor set server address", "action"),
            ("x_sync", "Retry queued sync, deletion\nor photo upload", "support"),
            ("x_relogin", "Changed server or expired\nsession: sign in again", "support"),
        ]),
        ("Data and records", [
            ("x_local", "Guest scans stay in\nprivate device storage", "data"),
            ("x_owner", "Account scans and reviews\nare farmer-owned on server", "data"),
            ("x_history", "Review corrections retain\nrevision history", "data"),
            ("x_copy", "Approved research copy has\nseparate removal path", "data"),
        ]),
    ], [
        ("x_retry", "x_sync", "connected"),
        ("x_delete", "x_copy", "removal choice"),
    ], "Android Account no longer repeats the History shortcut or non-actionable Scan photos / Scan location rows. Signed-out Account emphasizes Sign in.")

    journey_page(document, "guest-detail", "09  Guest entry: phone and web", "Screen actions and branches available before a farmer account is used.", [
        ("Android guest", [
            ("g9_open", "Open Scan without\naccount or internet", "action", 0),
            ("g9_pick", "Camera or Gallery;\npreview and Check leaf", "action", 1),
            ("g9_model", "Bundled model screens\nthe photo on-device", "system", 2),
            ("g9_result", "Result and photo save\nin local History", "outcome", 3),
            ("g9_history", "Filter/open History; view\nphoto or delete scan", "support", 4),
            ("g9_guide", "Open Guide and cached\narticles; change language", "support", 5),
        ]),
        ("Website visitor", [
            ("g9_land", "Open public site; choose\nlanguage or Scan", "action", 0),
            ("g9_webphoto", "Use camera, file picker\nor development sample", "action", 1),
            ("g9_api", "Connected inference\nreturns screening result", "system", 2),
            ("g9_webresult", "View score, guidance,\nretake or model scores", "outcome", 3),
            ("g9_authsave", "To save or request review,\nopen farmer login", "decision", 4),
        ]),
        ("Identity", [
            ("g9_login", "Sign in or create\nfarmer account", "action", 0),
            ("g9_terms", "New signup accepts terms\nand research disclosure", "decision", 1),
            ("g9_reset", "Forgot password / reset;\nemail verification", "support", 2),
            ("g9_claim", "After phone login, choose\nAdd device scans if wanted", "support", 4),
        ]),
        ("Alternate outcomes", [
            ("g9_retake", "Wrong photo or non-leaf:\nchoose another image", "error", 1),
            ("g9_savefail", "Local save fails:\nRetry save", "error", 3),
            ("g9_offline", "Web service unavailable:\nretry when connected", "error", 4),
            ("g9_connect", "Phone connected feature fails:\nRetry / server QR or settings", "support", 5),
        ]),
    ], [
        ("g9_open", "g9_pick", "", False), ("g9_pick", "g9_model", "", False),
        ("g9_model", "g9_result", "", False), ("g9_result", "g9_history", "optional", True),
        ("g9_result", "g9_guide", "optional", True), ("g9_pick", "g9_retake", "if rejected", True),
        ("g9_result", "g9_savefail", "if save fails", True),
        ("g9_land", "g9_webphoto", "", False), ("g9_webphoto", "g9_api", "", False),
        ("g9_api", "g9_webresult", "", False), ("g9_api", "g9_offline", "if unavailable", True),
        ("g9_webresult", "g9_authsave", "if saving", True),
        ("g9_authsave", "g9_login", "", True), ("g9_login", "g9_claim", "phone scans", True),
    ], "Guests can screen without an account. Only Android screening and saved guest History work offline; the public website uses its connected inference service. Guest phone scans stay local until explicitly added to an account.")

    journey_page(document, "farmer-phone-detail", "10  Farmer: Android scan and History", "The result screen contains the direct Ask an expert action; History stays inline.", [
        ("Scan tab", [
            ("f10_pick", "Open Scan; choose Camera\nor Gallery", "action", 0),
            ("f10_preview", "Preview photo; Check leaf\nor choose a different photo", "decision", 1),
            ("f10_gate", "Check whether the photo\nshows a banana leaf", "decision", 2),
            ("f10_model", "224 × 224 RGB; bundled\nTFLite model runs offline", "system", 3),
            ("f10_result", "See class, score, guidance,\nretake and Ask an expert", "outcome", 4),
            ("f10_save", "Save photo and result\nto local History", "data", 5),
        ]),
        ("History tab", [
            ("f10_filter", "Filter scans and open\na card inline", "action", 0),
            ("f10_detail", "See photo, AI result,\nsync and review stage", "outcome", 1),
            ("f10_loc", "Add/remove approximate\nlocation if wanted", "support", 2),
            ("f10_delete", "Delete scan with\nconfirmation", "support", 3),
            ("f10_export", "Export scan History\nas CSV", "support", 4),
        ]),
        ("Account sync", [
            ("f10_login", "Signed-in farmer account\nwith connection", "decision", 0),
            ("f10_guest", "Old guest scan: Add device\nscans before sync", "support", 1),
            ("f10_photo", "Pending review without photo:\nResend photo", "support", 4),
            ("f10_sync", "Sync metadata and photo;\npull server updates", "system", 5),
            ("f10_retry", "Failed sync or deletion:\nTry again", "error", 6),
        ]),
        ("Guidance and errors", [
            ("f10_home", "Home shows saved, uncertain\nand pending-sync counts", "support", 0),
            ("f10_nonleaf", "Non-leaf or wrong image:\nretake", "error", 1),
            ("f10_low", "Poor image / low score:\nretake or ask expert", "decision", 2),
            ("f10_guide", "Open matching Guide\nand cached Library", "support", 3),
            ("f10_savefail", "Local save error:\nRetry save", "error", 4),
        ]),
    ], [
        ("f10_pick", "f10_preview", "", False), ("f10_preview", "f10_gate", "check", False),
        ("f10_gate", "f10_model", "accepted", False),
        ("f10_model", "f10_result", "", False), ("f10_result", "f10_save", "", False),
        ("f10_filter", "f10_detail", "", False),
        ("f10_save", "f10_sync", "if signed in", True), ("f10_sync", "f10_retry", "if failed", True),
        ("f10_detail", "f10_loc", "optional", True), ("f10_result", "f10_guide", "optional", True),
        ("f10_gate", "f10_nonleaf", "if rejected", True), ("f10_result", "f10_low", "if uncertain", True),
        ("f10_save", "f10_savefail", "if failed", True),
    ], "A phone scan is local first and remains usable in Airplane mode. History has inline details, retry, location, deletion and export. Sync requires a signed-in farmer and working server connection.")

    journey_page(document, "farmer-web-detail", "11  Farmer: website scan and History", "Web screening and model comparison need the connected service; saving needs a farmer account.", [
        ("Scan page", [
            ("f11_open", "Open Scan; use camera,\nGallery/file or sample", "action", 0),
            ("f11_preview", "Check photo or choose\na different one", "decision", 1),
            ("f11_api", "Check leaf calls connected\ninference service", "system", 2),
            ("f11_result", "See screening result,\nscores and available guide", "outcome", 3),
            ("f11_save", "Save result to farmer\nHistory", "action", 4),
        ]),
        ("Result branches", [
            ("f11_home", "Home shows scans, new\nreviews and next action", "support", 0),
            ("f11_uncertain", "Uncertain: retake, save\nwithout review, or ask expert", "decision", 2),
            ("f11_unavailable", "Service unavailable:\nreturn to Scan and retry", "error", 3),
            ("f11_compare", "Optional experimental\nmodel comparison", "support", 4),
            ("f11_sample", "Development sample is\nfor interface testing", "note", 5),
        ]),
        ("History", [
            ("f11_list", "Open History; filter\nand select a saved case", "action", 0),
            ("f11_detail", "See photo, AI score, sync\nand expert review status", "outcome", 1),
            ("f11_request", "Request review from\na saved case", "support", 2),
            ("f11_reply", "Reply or attach new photo\nafter review", "support", 3),
            ("f11_delete", "Delete saved scan\nwith confirmation", "support", 4),
        ]),
        ("Connection and account", [
            ("f11_login", "Visitor must sign in\nbefore saving", "decision", 0),
            ("f11_queue", "Offline browser change\nwaits in sync outbox", "system", 2),
            ("f11_retry", "Reconnect: flush outbox\nand pull latest cases", "system", 3),
            ("f11_chat", "Ask Dahon about a synced\ncase if connected", "support", 4),
        ]),
    ], [
        ("f11_open", "f11_preview", "", False), ("f11_preview", "f11_api", "", False),
        ("f11_api", "f11_result", "", False), ("f11_result", "f11_save", "valid result", True),
        ("f11_api", "f11_unavailable", "if down", True), ("f11_result", "f11_uncertain", "if uncertain", True),
        ("f11_uncertain", "f11_save", "save", True), ("f11_save", "f11_list", "", False),
        ("f11_list", "f11_detail", "", False), ("f11_detail", "f11_request", "optional", True),
        ("f11_detail", "f11_reply", "after review", True), ("f11_save", "f11_queue", "if offline", True),
        ("f11_queue", "f11_retry", "reconnect", False),
    ], "A low-confidence website result can request review directly. Other saved results can request review from History. A service-unavailable or research-only comparison is not a supported saved diagnosis.")

    journey_page(document, "farmer-review-detail", "12  Farmer: review, consent and account", "This page starts after a scan exists; the review and research branches are separate choices.", [
        ("Ask an expert", [
            ("f12_start", "Result or History:\nAsk an expert", "action", 0),
            ("f12_note", "Optional note explains why\nAI may be wrong", "support", 1),
            ("f12_send", "Send request and photo\nwhen signed in / connected", "action", 2),
            ("f12_wait", "History shows waiting\nor in-progress review", "system", 3),
            ("f12_answer", "Read expert verdict beside\noriginal AI screening", "outcome", 4),
            ("f12_follow", "Reply or send clearer photo;\ncase reopens", "support", 5),
        ]),
        ("Review outcomes", [
            ("f12_same", "Expert agrees with AI\nclass", "outcome", 0),
            ("f12_other", "Expert chooses another\nsupported class", "outcome", 1),
            ("f12_unknown", "Cannot determine /\nother condition / field check", "decision", 2),
            ("f12_message", "See farmer message,\nnext steps and photo", "outcome", 4),
            ("f12_retry", "Photo missing or sync fails:\nresend / retry", "error", 5),
        ]),
        ("Research privacy", [
            ("f12_terms", "New signup explains future\nresearch consideration", "note", 0),
            ("f12_switch", "Account/Profile: turn future\nsharing on or off", "action", 1),
            ("f12_one", "History: withdraw consent\nfor one scan", "support", 2),
            ("f12_copy", "Remove approved private\nresearch photo", "action", 3),
            ("f12_delete", "Delete account; choose\nresearch-copy removal", "action", 4),
        ]),
        ("Account and guide", [
            ("f12_claim", "Add old guest scans to\naccount only if chosen", "support", 0),
            ("f12_profile", "Edit name, email, password,\nphoto or language", "action", 1),
            ("f12_verify", "Resend email verification;\nforgot-password recovery", "support", 2),
            ("f12_guide", "Read Guide/Library or\nask Dahon when connected", "support", 3),
            ("f12_signout", "Sign out; phone warns of\nunsent changes", "decision", 4),
        ]),
    ], [
        ("f12_start", "f12_note", "optional note", True), ("f12_start", "f12_send", "submit", False),
        ("f12_send", "f12_wait", "", False), ("f12_wait", "f12_answer", "review done", False),
        ("f12_answer", "f12_message", "", False), ("f12_answer", "f12_follow", "optional", True),
        ("f12_send", "f12_retry", "if failed", True), ("f12_terms", "f12_switch", "change later", True),
        ("f12_switch", "f12_one", "per scan", True), ("f12_one", "f12_copy", "if approved", True),
    ], "An expert may agree, disagree or decline to decide from the photo. The AI prediction is never overwritten. Research consent and approved-photo removal have separate controls from normal scan deletion.")

    journey_page(document, "expert-review-detail", "13  Agriculturist: case review", "The phone and website expose the same assessment choices; Reviewed Cases is read-only.", [
        ("Queue and claim", [
            ("e13_login", "Verified agriculturist\nsigns in while connected", "action", 0),
            ("e13_queue", "Home / Review Queue: see\nrequests and uncertain scans", "action", 1),
            ("e13_claim", "Open case and claim it;\nclaim renews while open", "system", 2),
            ("e13_conflict", "Another active claim:\nchoose another case or retry", "error", 3),
            ("e13_release", "Leave unfinished case:\nrelease or let claim expire", "support", 4),
        ]),
        ("Inspect evidence", [
            ("e13_photo", "Enlarge submitted photo;\ncheck missing/blurred image", "action", 0),
            ("e13_ai", "Compare AI class, score,\nfarmer note and location", "action", 1),
            ("e13_prior", "Review earlier assessment,\nreply and recent scans", "support", 2),
            ("e13_ref", "Open reference leaf photos\nand disease guide", "support", 3),
        ]),
        ("Assessment", [
            ("e13_choice", "Choose same class, another\nclass, or uncertain outcome", "decision", 0),
            ("e13_missing", "Missing photo permits only\nCannot determine", "error", 1),
            ("e13_message", "Choose response template\nor Other text", "action", 2),
            ("e13_steps", "Set photo quality, next steps\nand optional internal note", "action", 3),
            ("e13_submit", "Save assessment and\nrelease claim", "action", 4),
        ]),
        ("After review", [
            ("e13_farmer", "Farmer sees verdict, message\nand original AI result", "outcome", 0),
            ("e13_read", "Reviewed tab / page shows\ncompleted case read-only", "support", 1),
            ("e13_reopen", "Farmer follow-up reopens\nsame case in queue", "system", 2),
            ("e13_versions", "Earlier answers stay\nin revision history", "data", 3),
            ("e13_error", "Save fails: keep draft\nand retry", "error", 4),
        ]),
    ], [
        ("e13_login", "e13_queue", "", False), ("e13_queue", "e13_claim", "choose case", False),
        ("e13_claim", "e13_photo", "", False), ("e13_photo", "e13_ai", "", False),
        ("e13_ai", "e13_choice", "assess", False), ("e13_choice", "e13_message", "", False),
        ("e13_message", "e13_steps", "", False), ("e13_steps", "e13_submit", "", False),
        ("e13_submit", "e13_farmer", "answer ready", False), ("e13_claim", "e13_conflict", "if held", True),
        ("e13_photo", "e13_missing", "if missing", True), ("e13_submit", "e13_error", "if failed", True),
        ("e13_farmer", "e13_reopen", "if farmer replies", True),
    ], "Possible assessments: same supported class, different supported class, cannot determine, possible other condition, or field/laboratory check. Farmer-facing text differs from the staff-only internal note.")

    journey_page(document, "expert-content-detail", "14  Agriculturist: content and research", "Content verification and dataset approval are different jobs with separate decisions.", [
        ("Disease knowledge", [
            ("e14_content", "Content / Disease Knowledge:\nopen researched class record", "action", 0),
            ("e14_evidence", "Inspect symptoms, claims,\nsources and image limits", "action", 1),
            ("e14_verify", "Verify, request revision,\nor reject with notes", "decision", 2),
            ("e14_visible", "Verified advice becomes\neligible for farmer Guide", "outcome", 3),
        ]),
        ("Reference reading", [
            ("e14_sources", "Read research source\nrecords and citations", "support", 0),
            ("e14_library", "Read farmer Article\nLibrary", "support", 1),
            ("e14_guide", "Open general Guide\non the phone", "support", 2),
        ]),
        ("Candidate grid", [
            ("e14_auto", "Consented reviewed photo\nautomatically enters queue", "system", 0),
            ("e14_grid", "Content / Dataset Candidates\nor web candidate grid", "action", 1),
            ("e14_inspect", "Inspect photo, AI result,\nexpert verdict and consent", "action", 2),
            ("e14_ind", "Another staff member must\nmake the dataset decision", "decision", 3),
        ]),
        ("Decision and account", [
            ("e14_gate", "Approve only good photo +\nfirm review + current consent", "decision", 0),
            ("e14_decide", "Approve, keep uncertain,\nor reject with notes", "action", 1),
            ("e14_copy", "Approval stores separate\nprivate research copy", "data", 2),
            ("e14_revoke", "Consent withdrawn / case\nreopened: status rechecked", "system", 3),
            ("e14_profile", "Edit profile/password/photo,\nlanguage or sign out", "support", 4),
        ]),
    ], [
        ("e14_content", "e14_evidence", "", False), ("e14_evidence", "e14_verify", "", False),
        ("e14_verify", "e14_visible", "if verified", True), ("e14_auto", "e14_grid", "", False),
        ("e14_grid", "e14_inspect", "", False), ("e14_inspect", "e14_ind", "", False),
        ("e14_ind", "e14_gate", "check", False), ("e14_gate", "e14_decide", "", False),
        ("e14_decide", "e14_copy", "if approved", True),
    ], "The same agriculturist cannot approve a candidate based on their own case assessment. Approval is not model training. Admins author sources and articles; agriculturists inspect and verify disease content.")

    journey_page(document, "admin-people-detail", "15  Administrator: accounts and scans", "Android covers account/scan oversight; the website adds richer filters and analytics.", [
        ("System overview", [
            ("a15_login", "Verified admin signs in\nwhile connected", "action", 0),
            ("a15_dash", "Home / Dashboard shows\nfarmer and scan counts", "outcome", 1),
            ("a15_metrics", "See uncertain scans,\nphoto backlog, review waits", "outcome", 2),
            ("a15_refresh", "Refresh live database\nmetrics; retry on failure", "support", 3),
        ]),
        ("Accounts", [
            ("a15_list", "Users / Accounts: search\nfarmers or agriculturists", "action", 0),
            ("a15_create", "Create farmer or qualified\nagriculturist account", "action", 1),
            ("a15_edit", "Edit name, email or\npassword", "action", 2),
            ("a15_delete", "Confirm account deletion;\nretain review audit as allowed", "decision", 3),
            ("a15_verify", "New/changed email requires\nverification for staff tools", "system", 4),
        ]),
        ("Diagnosis audit", [
            ("a15_scans", "Scans / Diagnoses:\nsearch and filter records", "action", 0),
            ("a15_open", "Open photo, farmer, date,\nsource and AI score", "action", 1),
            ("a15_review", "See separate expert verdict,\nmessage and revisions", "outcome", 2),
            ("a15_source", "Check server-verified vs\nclient-reported provenance", "support", 3),
            ("a15_remove", "Confirm deletion of\nserver diagnosis", "decision", 4),
        ]),
        ("Web oversight", [
            ("a15_analytics", "Analytics: activity and\nAI-expert agreement", "action", 0),
            ("a15_model", "Model Information shows\nsystem/model status", "support", 1),
            ("a15_profile", "Edit profile, password,\nphoto or sign out", "support", 2),
            ("a15_denied", "Wrong role or unverified\nemail blocks staff API", "error", 3),
        ]),
    ], [
        ("a15_login", "a15_dash", "", False), ("a15_dash", "a15_metrics", "", False),
        ("a15_dash", "a15_list", "manage users", True), ("a15_list", "a15_create", "optional", True),
        ("a15_list", "a15_edit", "optional", True), ("a15_list", "a15_delete", "optional", True),
        ("a15_create", "a15_verify", "email sent", False),
        ("a15_dash", "a15_scans", "audit", True), ("a15_scans", "a15_open", "", False),
        ("a15_open", "a15_review", "", False), ("a15_open", "a15_remove", "if authorized", True),
        ("a15_dash", "a15_analytics", "web only", True),
    ], "Dashboard figures are connected database values, not proof that the model is diagnostically accurate. An administrator views the original AI result alongside the independent expert assessment.")

    journey_page(document, "admin-governance-detail", "16  Administrator: knowledge and research", "Knowledge publishing, research-photo decisions and model views are separate admin tasks.", [
        ("Disease records", [
            ("a16_grid", "Knowledge / Disease grid:\nfour validated model classes", "action", 0),
            ("a16_edit", "Edit farmer summary, signs,\nmanagement and limitations", "action", 1),
            ("a16_evidence", "Attach claims, evidence\nand regulatory checks", "action", 2),
            ("a16_submit", "Submit researched record\nfor expert verification", "action", 3),
            ("a16_verify", "Independent expert verifies\nor requests revision", "system", 4),
            ("a16_archive", "Archive record while\nretaining history", "support", 5),
        ]),
        ("Sources and articles", [
            ("a16_sources", "Add/edit/delete research\nsources and citations", "action", 0),
            ("a16_article", "Create/edit farmer article;\ndraft or publish", "action", 1),
            ("a16_photo", "Upload licensed article\nphotos in either editor", "support", 2),
            ("a16_publish", "Published library reaches\nphones on next connection", "outcome", 3),
            ("a16_remove", "Archive/delete outdated\narticle or source", "support", 4),
        ]),
        ("Research records", [
            ("a16_candidates", "Web candidate grid shows\nconsented reviewed photos", "action", 0),
            ("a16_ind", "Check reviewer independence,\nconsent, quality and verdict", "decision", 1),
            ("a16_decide", "Approve, uncertain or reject\nwith reason", "action", 2),
            ("a16_audit", "Audit approved private\nresearch copies", "action", 3),
            ("a16_revoke", "Remove copy with reason;\nretry pending file removal", "support", 4),
        ]),
        ("Analytics and model", [
            ("a16_analytics", "Web Analytics: trends,\nreview wait and agreement", "action", 0),
            ("a16_compare", "Web Model Comparison:\nsubmit allowed research image", "action", 1),
            ("a16_info", "Web Model Information:\ninspect current system state", "support", 2),
            ("a16_no_train", "No automatic retraining\nor model replacement", "note", 3),
            ("a16_account", "Profile, password, photo,\nlanguage and sign-out", "support", 4),
        ]),
    ], [
        ("a16_grid", "a16_edit", "", False), ("a16_edit", "a16_evidence", "", False),
        ("a16_evidence", "a16_submit", "", False), ("a16_submit", "a16_verify", "content review", False),
        ("a16_sources", "a16_article", "cited material", True), ("a16_article", "a16_publish", "if published", True),
        ("a16_candidates", "a16_ind", "", False), ("a16_ind", "a16_decide", "", False),
        ("a16_decide", "a16_audit", "if approved", True), ("a16_audit", "a16_revoke", "if removal needed", True),
    ], "The Android admin has Diseases, Articles and Sources under Knowledge. Dataset Candidates, research-image audit, Analytics, Model Comparison and Model Information are web admin tools.")

    return document


if __name__ == "__main__":
    root = build()
    ET.indent(root, space="  ")
    ET.ElementTree(root).write(OUTPUT, encoding="utf-8", xml_declaration=True)
    print(f"Wrote {OUTPUT} ({len(root.findall('diagram'))} pages)")
