"""Generate the editable, multi-page diagrams.net user-flow document."""

from __future__ import annotations

from datetime import datetime, timezone
from html import escape
from pathlib import Path
from xml.etree import ElementTree as ET


OUTPUT = Path(__file__).with_name("dahonmd-complete-user-flows.drawio")

PALETTE = {
    "action": ("#FFF0E8", "#BB5937", "#5B2B1B"),
    "support": ("#EDF4FF", "#5078AF", "#244263"),
    "system": ("#EAF6EF", "#3E8C66", "#1B4C35"),
    "decision": ("#FFF7DE", "#B98A2D", "#584319"),
    "outcome": ("#DDEFE4", "#2F7952", "#17432E"),
    "data": ("#EEEAFB", "#7965AC", "#433467"),
    "error": ("#FDEBED", "#BB4B57", "#762B34"),
    "note": ("#F4F6F8", "#8A99A4", "#36434A"),
}


def rich(value: str) -> str:
    return "<div style='text-align:center'>" + "<br>".join(escape(part) for part in value.split("\n")) + "</div>"


class Page:
    def __init__(self, file: ET.Element, page_id: str, name: str, subtitle: str, height: int = 1320):
        self.diagram = ET.SubElement(file, "diagram", {"id": page_id, "name": name})
        model = ET.SubElement(
            self.diagram,
            "mxGraphModel",
            {
                "dx": "1420", "dy": "760", "grid": "1", "gridSize": "10",
                "guides": "1", "tooltips": "1", "connect": "1", "arrows": "1",
                "fold": "1", "page": "1", "pageScale": "1",
                "pageWidth": "1900", "pageHeight": str(height), "math": "0", "shadow": "0",
            },
        )
        self.root = ET.SubElement(model, "root")
        ET.SubElement(self.root, "mxCell", {"id": "0"})
        ET.SubElement(self.root, "mxCell", {"id": "1", "parent": "0"})
        self.ids: set[str] = set()
        self.geo: dict[str, tuple[int, int, int, int]] = {}
        self.width = 1900
        self.height = height
        self.text("title", f"DahonMD  |  {name}", 40, 24, 1800, 48, 29, "#153B2C", bold=True)
        self.text("subtitle", subtitle, 40, 76, 1790, 34, 14, "#54656C")
        self.legend()

    def _cell(self, key: str, value: str, style: str, x: int, y: int, w: int, h: int) -> None:
        if key in self.ids:
            raise ValueError(f"Duplicate cell ID on {self.diagram.get('name')}: {key}")
        self.ids.add(key)
        cell = ET.SubElement(self.root, "mxCell", {"id": key, "value": value, "style": style, "vertex": "1", "parent": "1"})
        ET.SubElement(cell, "mxGeometry", {"x": str(x), "y": str(y), "width": str(w), "height": str(h), "as": "geometry"})

    def text(self, key: str, value: str, x: int, y: int, w: int, h: int, size: int = 14, color: str = "#445660", bold: bool = False) -> None:
        style = (
            "text;html=1;whiteSpace=wrap;overflow=fill;align=left;verticalAlign=middle;"
            f"fontSize={size};fontColor={color};fontStyle={1 if bold else 0};strokeColor=none;fillColor=none;"
        )
        self._cell(key, escape(value), style, x, y, w, h)

    def lane(self, key: str, title: str, x: int, w: int = 440) -> None:
        self._cell(
            f"{key}_bg", "",
            "rounded=1;arcSize=12;fillColor=#F9FBFA;strokeColor=#DBE6E0;strokeWidth=1;",
            x, 164, w, self.height - 210,
        )
        self._cell(
            f"{key}_header", escape(title),
            "rounded=1;arcSize=15;whiteSpace=wrap;html=1;align=center;verticalAlign=middle;"
            "fillColor=#214F3A;strokeColor=#214F3A;fontColor=#FFFFFF;fontSize=18;fontStyle=1;",
            x + 10, 176, w - 20, 52,
        )

    def box(self, key: str, label: str, x: int, y: int, kind: str = "action", w: int = 380, h: int = 72) -> None:
        fill, stroke, ink = PALETTE[kind]
        style = (
            "rounded=1;arcSize=14;whiteSpace=wrap;html=1;align=center;verticalAlign=middle;"
            f"fillColor={fill};strokeColor={stroke};strokeWidth=2;fontColor={ink};fontSize=15;fontStyle=1;"
            "spacing=8;shadow=0;" + ("dashed=1;" if kind == "note" else "")
        )
        self._cell(key, rich(label), style, x, y, w, h)
        self.geo[key] = (x, y, w, h)

    def note(self, key: str, label: str, x: int, y: int, w: int = 380, h: int = 70) -> None:
        fill, stroke, ink = PALETTE["note"]
        style = (
            "rounded=1;arcSize=11;whiteSpace=wrap;html=1;align=center;verticalAlign=middle;"
            f"fillColor={fill};strokeColor={stroke};dashed=1;fontColor={ink};fontSize=13;spacing=7;"
        )
        self._cell(key, rich(label), style, x, y, w, h)
        self.geo[key] = (x, y, w, h)

    def edge(self, key: str, source: str, target: str, label: str = "", direction: str = "down", dashed: bool = False, points: list[tuple[int, int]] | None = None) -> None:
        if source not in self.ids or target not in self.ids:
            raise ValueError(f"Unknown connector on {self.diagram.get('name')}: {source} -> {target}")
        if key in self.ids:
            raise ValueError(f"Duplicate edge ID: {key}")
        self.ids.add(key)
        ports = {
            "down": "exitX=0.5;exitY=1;entryX=0.5;entryY=0;",
            "right": "exitX=1;exitY=0.5;entryX=0;entryY=0.5;",
            "left": "exitX=0;exitY=0.5;entryX=1;entryY=0.5;",
            "up": "exitX=0.5;exitY=0;entryX=0.5;entryY=1;",
            "below": "exitX=0.5;exitY=1;entryX=0.5;entryY=1;",
        }[direction]
        if points is None and source in self.geo and target in self.geo:
            routed = self._clear_route(source, target, ports)
            if routed:
                ports, points = routed
        style = (
            "edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;"
            "strokeColor=#557065;strokeWidth=2;endArrow=block;endFill=1;"
            "fontColor=#2A4E3A;fontSize=12;labelBackgroundColor=#FFFFFF;"
            + ports + ("dashed=1;" if dashed else "")
        )
        cell = ET.SubElement(
            self.root, "mxCell",
            {"id": key, "value": escape(label), "style": style, "edge": "1", "parent": "1", "source": source, "target": target},
        )
        geometry = ET.SubElement(cell, "mxGeometry", {"relative": "1", "as": "geometry"})
        if points:
            bends = ET.SubElement(geometry, "Array", {"as": "points"})
            for x, y in points:
                ET.SubElement(bends, "mxPoint", {"x": str(x), "y": str(y)})

    @staticmethod
    def _port_values(ports: str) -> dict[str, float]:
        return {part.split("=")[0]: float(part.split("=")[1]) for part in ports.split(";") if part}

    def _crosses(self, path: list[tuple[float, float]], skip: set[str]) -> bool:
        for key, (x, y, w, h) in self.geo.items():
            if key in skip:
                continue
            for (x1, y1), (x2, y2) in zip(path, path[1:]):
                if min(x1, x2) < x + w - 1 and max(x1, x2) > x + 1 and min(y1, y2) < y + h - 1 and max(y1, y2) > y + 1:
                    return True
        return False

    def _clear_route(self, source: str, target: str, ports: str):
        """Keeps the plain route when it is clear; otherwise detours around boxes
        through the side gutters or the gaps between rows."""
        sx, sy, sw, sh = self.geo[source]
        tx, ty, tw, th = self.geo[target]
        skip = {source, target}
        v = self._port_values(ports)
        a = (sx + sw * v["exitX"], sy + sh * v["exitY"])
        b = (tx + tw * v["entryX"], ty + th * v["entryY"])
        if v["exitY"] in (0, 1) and v["entryY"] in (0, 1):
            mid = (a[1] + b[1]) / 2 if v["exitY"] != v["entryY"] else max(a[1], b[1]) + 30
            plain = [a, (a[0], mid), (b[0], mid), b]
        else:
            mid = (a[0] + b[0]) / 2
            plain = [a, (mid, a[1]), (mid, b[1]), b]
        if not self._crosses(plain, skip):
            return None
        smid, tmid = sy + sh / 2, ty + th / 2
        candidates = []
        # Side gutters, just outside the boxes' right or left edges.
        for offset in (16, 34):
            gx = max(sx + sw, tx + tw) + offset
            candidates.append(("exitX=1;exitY=0.5;entryX=1;entryY=0.5;", [(sx + sw, smid), (gx, smid), (gx, tmid), (tx + tw, tmid)]))
            gx = min(sx, tx) - offset
            candidates.append(("exitX=0;exitY=0.5;entryX=0;entryY=0.5;", [(sx, smid), (gx, smid), (gx, tmid), (tx, tmid)]))
        # Row gaps: leave from the bottom or top, travel in the gap next to the target, enter from the side.
        if ty > sy:
            for gy in (ty - 24, sy + sh + 24):
                side_x, entry = (tx, "entryX=0;entryY=0.5;") if tx > sx else (tx + tw, "entryX=1;entryY=0.5;")
                candidates.append(("exitX=0.5;exitY=1;" + entry, [(sx + sw / 2, sy + sh), (sx + sw / 2, gy), (side_x - 20 if tx > sx else side_x + 20, gy), (side_x - 20 if tx > sx else side_x + 20, tmid), (side_x, tmid)]))
                candidates.append(("exitX=0.5;exitY=1;entryX=0.5;entryY=0;", [(sx + sw / 2, sy + sh), (sx + sw / 2, gy), (tx + tw / 2, gy), (tx + tw / 2, ty)]))
        else:
            for gy in (ty + th + 24, sy - 24):
                candidates.append(("exitX=0.5;exitY=0;entryX=0.5;entryY=1;", [(sx + sw / 2, sy), (sx + sw / 2, gy), (tx + tw / 2, gy), (tx + tw / 2, ty + th)]))
        for new_ports, path in candidates:
            if not self._crosses(path, skip):
                return new_ports, [(round(x), round(y)) for x, y in path[1:-1]]
        return None

    def legend(self) -> None:
        entries = [
            ("action", "User action"), ("support", "Optional step"),
            ("system", "System response"), ("decision", "Decision"),
            ("outcome", "Outcome"), ("data", "Saved data"),
            ("error", "Exception / retry"),
            ("note", "Context note"),
        ]
        for index, (kind, label) in enumerate(entries):
            self.box(f"legend_{kind}", label, 245 + index * 198, 117, kind, 190, 38)
        self.text("legend_label", "Diagram key", 40, 120, 180, 32, 14, "#153B2C", True)


def build() -> ET.Element:
    file = ET.Element(
        "mxfile",
        {
            "host": "app.diagrams.net", "modified": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "agent": "DahonMD user-flow generator", "version": "24.7.17", "type": "device", "pages": "29",
        },
    )
    overview(file)
    access(file)
    scanning(file)
    review(file)
    research(file)
    knowledge(file)
    administration(file)
    supporting(file)
    mobile_scan_detail(file)
    web_scan_detail(file)
    sync_recovery(file)
    review_followup(file)
    privacy_removal(file)
    content_publication(file)
    account_sessions(file)
    expert_queue(file)
    admin_decisions(file)
    exception_recovery(file)
    lifecycle_visibility(file)
    library_reading(file)
    alerts_and_assistant(file)
    scan_result_next(file)
    history_screen(file)
    account_settings(file)
    scan_location(file)
    article_authoring(file)
    admin_accounts_audit(file)
    admin_insights(file)
    connection_recovery(file)
    return file


def overview(file: ET.Element) -> None:
    p = Page(file, "overview", "01  Role handoffs", "Every role's main journeys and how work passes between them. The page number on each box (p9, p21 ...) is where that step is drawn in detail.", 1420)
    for key, title, x in [("guest", "GUEST  ·  mobile / web", 30), ("farmer", "FARMER  ·  mobile / web", 490), ("expert", "AGRICULTURIST  ·  mobile / web", 950), ("admin", "ADMINISTRATOR  ·  mobile / web", 1410)]:
        p.lane(key, title, x)
    for key, label, x, y, kind in [
        ("g_scan", "Scan a leaf; see the AI result  ·  p9, p22", 60, 260, "action"),
        ("g_history", "Keep device-only history  ·  p23", 60, 385, "action"),
        ("g_auth", "Register or sign in  ·  p15, p29", 60, 510, "action"),
        ("g_help", "Guide and article library, offline  ·  p20", 60, 635, "support"),
        ("g_chat", "Ask Dahon: sign in first  ·  p21", 60, 760, "support"),
        ("g_web", "Web: screen a photo; sign in to save  ·  p10", 60, 885, "support"),
        ("g_connect", "Phone: connect to the server  ·  p29", 60, 1010, "support"),
        ("f_sync", "Sync scans and private photos  ·  p11", 520, 260, "action"),
        ("f_ask", "Ask an agriculturist to review  ·  p23", 520, 385, "action"),
        ("f_notify", "Notified when the answer is ready  ·  p21", 520, 510, "system"),
        ("f_verdict", "Read verdict; reply or send a new photo  ·  p12", 520, 635, "action"),
        ("f_chat", "Ask Dahon about a scan  ·  p21", 520, 760, "support"),
        ("f_location", "Add or remove scan location  ·  p25", 520, 885, "support"),
        ("f_consent", "Research consent or removal  ·  p13", 520, 1010, "action"),
        ("f_account", "Profile, photo, sign out, delete  ·  p24", 520, 1135, "action"),
        ("e_badge", "Queue badge counts requests  ·  p21", 980, 260, "data"),
        ("e_queue", "Claim and inspect the case  ·  p16", 980, 385, "action"),
        ("e_review", "Save verdict and advice  ·  p12", 980, 510, "action"),
        ("e_nom", "Nominate eligible research photo  ·  p5", 980, 635, "action"),
        ("e_content", "Verify disease evidence  ·  p14", 980, 1135, "action"),
        ("e_library", "Read guide and article library  ·  p20", 980, 760, "support"),
        ("e_map", "See scan location on a map  ·  p25", 980, 885, "support"),
        ("a_dash", "Dashboard, analytics, model comparison  ·  p28", 1440, 260, "support"),
        ("a_see", "Inspect verdict and scan audit  ·  p27", 1440, 510, "action"),
        ("a_decide", "Decide nominated candidate  ·  p27", 1440, 760, "action"),
        ("a_copy", "Audit or remove research copy  ·  p13", 1440, 885, "action"),
        ("a_accounts", "Manage accounts  ·  p27", 1440, 1010, "action"),
        ("a_content", "Disease knowledge, sources, articles  ·  p14, p26", 1440, 1135, "action"),
    ]:
        p.box(key, label, x, y, kind)
    for key, a, b, d, label in [
        ("o1", "g_scan", "g_history", "down", "save"), ("o2", "g_history", "g_auth", "down", "sign in"),
        ("o3", "g_auth", "f_sync", "right", "farmer session"), ("o4", "f_sync", "f_ask", "down", "request"),
        ("o5", "f_ask", "e_queue", "right", "queue"), ("o6", "e_badge", "e_queue", "down", "open"),
        ("o7", "e_queue", "e_review", "down", "assess"), ("o8", "e_review", "f_notify", "left", "sync outcome"),
        ("o9", "f_notify", "f_verdict", "down", "read"), ("o10", "e_review", "a_see", "right", "same verdict"),
        ("o11", "e_review", "e_nom", "down", "if eligible"), ("o12", "e_nom", "a_decide", "right", "independent decision"),
        ("o13", "a_decide", "a_copy", "down", "approved"), ("o14", "a_copy", "f_consent", "left", "farmer control"),
        ("o15", "a_content", "e_content", "left", "review"),
    ]:
        p.edge(key, a, b, label, d)
    p.note("o_note", "Admin and agriculturist content review controls what farmers can read. Research approval never adds an image to model training automatically. Pages 2–8 show each area; pages 9–29 show individual journeys.", 60, 1270, 1760, 80)


def access(file: ET.Element) -> None:
    p = Page(file, "access", "02  Entry, identity and sessions", "Entry paths for visitors and all authenticated roles. Staff accounts are provisioned by an administrator.", 1330)
    for key, title, x in [("visitor", "VISITOR / GUEST", 30), ("identity", "IDENTITY SERVICE", 490), ("roles", "ROLE LANDING", 950), ("account", "ACCOUNT CONTROL", 1410)]:
        p.lane(key, title, x)
    items = [
        ("v_open", "Open mobile app or public website", 60, 255, "action"), ("v_offline", "Scan on phone without account", 60, 375, "action"),
        ("v_register", "Create farmer account", 60, 500, "action"), ("v_login", "Sign in", 60, 625, "action"),
        ("v_reset", "Forgot password / reset by email", 60, 840, "support"), ("v_privacy", "Read privacy and deletion pages", 60, 1010, "support"),
        ("i_register", "Validate registration; create farmer", 520, 500, "system"), ("i_login", "Check credentials and session", 520, 625, "system"),
        ("i_valid", "Credentials valid?", 520, 750, "decision"), ("i_verify", "Email verification gate for staff and research consent", 520, 890, "decision"),
        ("r_farmer", "Farmer home / scan / history", 980, 500, "outcome"), ("r_expert", "Agriculturist queue / content", 980, 625, "outcome"),
        ("r_admin", "Admin dashboard / management", 980, 750, "outcome"), ("r_error", "Show error; retry login", 980, 890, "error"),
        ("a_edit", "Edit profile, avatar, email", 1440, 310, "support"), ("a_password", "Change password / end other sessions", 1440, 445, "action"),
        ("a_logout", "Sign out; settle pending scans", 1440, 590, "action"), ("a_delete", "Farmer deletes account and chooses research-copy removal", 1440, 740, "action"),
        ("a_staff", "Admin creates / edits staff accounts", 1440, 955, "action"),
    ]
    for key, label, x, y, kind in items:
        p.box(key, label, x, y, kind)
    for key, a, b, d, label in [
        ("a1", "v_open", "v_offline", "down", "mobile"), ("a2", "v_open", "v_register", "down", "account path"),
        ("a3", "v_register", "i_register", "right", "submit"), ("a4", "i_register", "r_farmer", "right", "created"),
        ("a5", "v_login", "i_login", "right", "credentials"), ("a6", "i_login", "i_valid", "down", "validate"),
        ("a7", "i_valid", "r_farmer", "right", "farmer"), ("a8", "i_valid", "r_expert", "right", "expert"),
        ("a9", "i_valid", "r_admin", "right", "admin"), ("a10", "i_valid", "r_error", "right", "invalid"),
        ("a11", "r_expert", "i_verify", "left", "verify email"), ("a12", "r_admin", "i_verify", "left", "verify email"),
        ("a13", "a_staff", "r_expert", "left", "provisioned"),
    ]:
        p.edge(key, a, b, label, d)
    p.note("access_note", "Forgot/reset and email verification use server links. Signed-out phone scans attach to a farmer account on sign-in, then sync when online.", 60, 1150, 1300, 80)


def scanning(file: ET.Element) -> None:
    p = Page(file, "scanning", "03  Scan, result and history", "Mobile inference is offline and on-device. The web screening path uses the optional connected inference service.", 1380)
    for key, title, x in [("input", "GUEST / FARMER INPUT", 30), ("model", "CLASSIFICATION", 490), ("history", "LOCAL OR WEB HISTORY", 950), ("sync", "SIGNED-IN SYNC", 1410)]:
        p.lane(key, title, x)
    items = [
        ("s_capture", "Take photo or choose gallery image", 60, 260, "action"), ("s_quality", "Review image; retake if unclear", 60, 385, "action"),
        ("s_guides", "Open photo tips / guide", 60, 550, "support"), ("s_delete", "Delete saved scan", 60, 1090, "action"),
        ("m_path", "Mobile local model OR web inference API", 520, 260, "system"), ("m_result", "Class and relative model confidence", 520, 385, "outcome"),
        ("m_uncertain", "Below threshold or service unavailable?", 520, 510, "decision"),
        ("m_retry", "Retake photo; no disease-specific guidance", 520, 635, "action"),
        ("m_guidance", "Read verified guidance if supported", 520, 765, "support"),
        ("h_save", "Save result and photo in history", 980, 385, "action"), ("h_guest", "Mobile guest: device-only local record", 980, 520, "data"),
        ("h_farmer", "Farmer: pending sync outbox", 980, 650, "data"), ("h_view", "Open history; see AI result and review status", 980, 785, "action"),
        ("h_scores", "Inspect model scores / comparison", 980, 930, "support"),
        ("c_sync", "Upload metadata, then private photo", 1440, 650, "action"), ("c_ack", "Server acknowledgement / pull updates", 1440, 785, "system"),
        ("c_retry", "Failed or offline: retain local copy; retry", 1440, 930, "action"),
        ("c_tomb", "Delete tombstone syncs to other devices", 1440, 1090, "data"),
    ]
    for key, label, x, y, kind in items:
        p.box(key, label, x, y, kind)
    for key, a, b, d, label in [
        ("s1", "s_capture", "s_quality", "down", "review"), ("s2", "s_quality", "m_path", "right", "scan"),
        ("s3", "m_path", "m_result", "down", "inference"), ("s4", "m_result", "m_uncertain", "down", "interpret"),
        ("s5", "m_uncertain", "m_retry", "down", "uncertain"), ("s6", "m_retry", "s_capture", "left", "try again"),
        ("s7", "m_result", "h_save", "right", "save"), ("s8", "h_save", "h_guest", "down", "guest"),
        ("s9", "h_save", "h_farmer", "down", "signed in"), ("s10", "h_farmer", "c_sync", "right", "reconnect"),
        ("s11", "c_sync", "c_ack", "down", "stored"), ("s12", "c_sync", "c_retry", "down", "failure"),
        ("s13", "c_ack", "h_view", "left", "refresh"), ("s14", "h_guest", "h_view", "down", "local"),
        ("s15", "h_view", "s_delete", "left", "delete"), ("s16", "s_delete", "c_tomb", "right", "synced scan"),
    ]:
        p.edge(key, a, b, label, d)
    p.note("scan_note", "The AI result remains distinct from a later agriculturist verdict. Research contribution requires separate consent; ordinary history sync does not grant it.", 520, 1180, 840, 80)
    p.note("scan_guest_note", "Public web visitors may screen a photo but must sign in to save it. If phone camera permission is denied, the gallery remains an option.", 60, 1180, 380, 80)


def review(file: ET.Element) -> None:
    p = Page(file, "review", "04  Agricultural review and handoff", "The agriculturist's verdict is separate from the original AI result and returns to both farmer and administrator.", 1440)
    for key, title, x in [("farmer", "FARMER", 30), ("server", "CASE STATE", 490), ("expert", "AGRICULTURIST", 950), ("admin", "ADMINISTRATOR", 1410)]:
        p.lane(key, title, x)
    items = [
        ("r_ask", "Request review from synced scan", 60, 260, "action"), ("r_note", "Add note / upload missing photo", 60, 395, "action"),
        ("r_read", "Read verdict, message and next steps", 60, 785, "action"), ("r_seen", "Mark review seen across devices", 60, 905, "support"),
        ("r_reply", "Reply or send new photo for reassessment", 60, 1040, "action"),
        ("q_pending", "Farmer request or uncertain scan enters queue", 520, 260, "system"), ("q_claim", "Claim prevents overlapping review", 520, 395, "system"),
        ("q_save", "Save current review version and revision audit", 520, 650, "data"),
        ("q_sync", "Sync same current verdict to both roles", 520, 785, "system"),
        ("q_reopen", "Follow-up reopens case; old verdict retained", 520, 1040, "system"),
        ("e_open", "Open case: original AI, photo, notes", 980, 395, "action"),
        ("e_photo", "Photo available and clear?", 980, 520, "decision"),
        ("e_choose", "Choose confirmed / alternate / cannot determine / outside classes", 980, 650, "action"),
        ("e_support", "Compare reference photos; add internal note", 980, 785, "support"),
        ("e_revise", "Reassess follow-up; corrections need reason; approved labels locked", 980, 1040, "action"),
        ("a_view", "Inspect scan, final verdict and revision history", 1440, 785, "action"),
        ("a_queue", "Track reviewed / pending counts", 1440, 925, "support"),
    ]
    for key, label, x, y, kind in items:
        p.box(key, label, x, y, kind)
    for key, a, b, d, label in [
        ("r1", "r_ask", "q_pending", "right", "submit"), ("r2", "r_note", "q_pending", "right", "context"),
        ("r3", "q_pending", "q_claim", "down", "offer"), ("r4", "q_claim", "e_open", "right", "assigned"),
        ("r5", "e_open", "e_photo", "down", "inspect"), ("r6", "e_photo", "e_choose", "down", "assess"),
        ("r7", "e_choose", "q_save", "left", "save"), ("r8", "q_save", "q_sync", "down", "publish current"),
        ("r9", "q_sync", "r_read", "left", "farmer result"), ("r10", "q_sync", "a_view", "right", "admin result"),
        ("r11", "r_read", "r_reply", "down", "needs follow-up"), ("r12", "r_reply", "q_reopen", "right", "submit"),
        ("r13", "q_reopen", "e_revise", "right", "new assessment"),
    ]:
        p.edge(key, a, b, label, d)
    p.note("review_note", "If the photo is unavailable, the reviewer can record 'Cannot determine' and request a better photo. Version checks reject stale saves.", 520, 1190, 1300, 80)


def research(file: ET.Element) -> None:
    p = Page(file, "research", "05  Research photo consent and removal", "Approval stores a separate private copy. Consent, dataset eligibility and eventual model training are different steps.", 1560)
    for key, title, x in [("farmer", "FARMER CONTROL", 30), ("gate", "ELIGIBILITY GATE", 490), ("staff", "AGRICULTURIST / REVIEWER", 950), ("audit", "ADMIN / PRIVATE STORAGE", 1410)]:
        p.lane(key, title, x)
    items = [
        ("f_opt", "Opt in to current v2 research consent", 60, 270, "action"),
        ("f_renew", "Old v1 consent: renew before approval", 60, 400, "action"),
        ("f_terms", "Read consent terms and privacy policy", 60, 600, "support"),
        ("f_list", "See approved research photo IDs", 60, 900, "action"),
        ("f_scan_delete", "Delete original scan: copy stays", 60, 1035, "action"),
        ("f_account_delete", "Delete account: choose keep or remove copies", 60, 1170, "action"),
        ("f_revoke", "Withdraw consent / remove approved copy", 60, 1320, "action"),
        ("g_check", "Retained photo + current consent + completed review?", 520, 270, "decision"),
        ("g_quality", "Determinate verdict + good image quality?", 520, 540, "decision"),
        ("g_fail", "Otherwise: pending / uncertain / rejected", 520, 760, "outcome"),
        ("g_revoked", "Revocation blocks use; candidate rejected", 520, 1320, "system"),
        ("e_nom", "Nominate eligible reviewed photo", 980, 400, "action"),
        ("e_decide", "Another agriculturist or admin decides", 980, 540, "action"),
        ("e_reject", "Reject or keep uncertain", 980, 760, "action"),
        ("a_copy", "On approval: private copy + label/hash/audit", 1440, 680, "data"),
        ("a_ntrain", "No automatic training inclusion", 1440, 815, "note"),
        ("a_audit", "Admin lists copies / views audit", 1440, 1035, "action"),
        ("a_remove", "Admin removal needs recorded reason", 1440, 1170, "action"),
        ("a_delete", "Delete private file; keep removal audit", 1440, 1320, "system"),
    ]
    for key, label, x, y, kind in items:
        p.box(key, label, x, y, kind)
    for key, a, b, d, label in [
        ("d1", "f_opt", "g_check", "right", "consent"), ("d2", "f_renew", "g_check", "right", "renew"),
        ("d3", "g_check", "e_nom", "right", "eligible"), ("d4", "g_check", "g_fail", "down", "no"),
        ("d5", "e_nom", "e_decide", "down", "candidate"), ("d6", "e_decide", "g_quality", "left", "approval check"),
        ("d7", "g_quality", "a_copy", "right", "approve"), ("d8", "g_quality", "e_reject", "right", "fails check"),
        ("d9", "a_copy", "f_list", "left", "visible to farmer"),
        ("d10", "f_list", "f_scan_delete", "down", "optional"), ("d11", "f_scan_delete", "f_account_delete", "down", "optional"),
        ("d12", "f_list", "f_revoke", "down", "withdraw"), ("d13", "a_copy", "a_audit", "down", "audit"),
        ("d14", "a_audit", "a_remove", "down", "correction / request"),
        ("d15", "f_revoke", "g_revoked", "right", "revoke"), ("d16", "g_revoked", "a_delete", "right", "remove"),
        ("d17", "a_remove", "a_delete", "down", "revoke"), ("d18", "f_account_delete", "a_delete", "right", "if remove chosen"),
    ]:
        if key == "d9":
            p.edge(key, a, b, label, "left", points=[(1390, 870), (450, 870)])
        else:
            p.edge(key, a, b, label, d)


def knowledge(file: ET.Element) -> None:
    p = Page(file, "knowledge", "06  Disease knowledge and article library", "Only verified disease guidance and published articles reach farmer-facing views.", 1460)
    for key, title, x in [("author", "ADMIN AUTHORING", 30), ("evidence", "EVIDENCE / STATUS GATE", 490), ("reviewer", "AGRICULTURIST", 950), ("public", "FARMER / GUEST", 1410)]:
        p.lane(key, title, x)
    items = [
        ("k_draft", "Create or edit disease dossier", 60, 270, "action"),
        ("k_sources", "Add research sources and mapped claims", 60, 410, "action"),
        ("k_mgmt", "Add symptoms and management guidance", 60, 545, "action"),
        ("k_reg", "Record regulatory check for chemical advice", 60, 680, "action"),
        ("k_article", "Create / edit article with images and sources", 60, 1050, "action"),
        ("k_publish", "Publish or unpublish article", 60, 1180, "action"),
        ("e_researched", "Draft → researched (not public)", 520, 410, "system"),
        ("e_checks", "Evidence and regulatory checks pass?", 520, 680, "decision"),
        ("e_verified", "Verified disease becomes public", 520, 905, "outcome"),
        ("e_rework", "Content edit returns to researched", 520, 1050, "system"),
        ("r_open", "Inspect dossier and cited evidence", 980, 545, "action"),
        ("r_decide", "Verify / request revision / reject", 980, 770, "action"),
        ("r_refs", "Browse sources, library and guide", 980, 1050, "support"),
        ("p_guide", "Read verified disease guide", 1440, 905, "action"),
        ("p_article", "Read published article online/offline", 1440, 1180, "support"),
    ]
    for key, label, x, y, kind in items:
        p.box(key, label, x, y, kind)
    for key, a, b, d, label in [
        ("k1", "k_draft", "k_sources", "down", "research"), ("k2", "k_sources", "e_researched", "right", "map"),
        ("k3", "k_mgmt", "k_reg", "down", "chemical"), ("k4", "k_reg", "e_checks", "right", "check"),
        ("k5", "e_researched", "r_open", "right", "review"), ("k6", "r_open", "r_decide", "down", "decide"),
        ("k7", "r_decide", "e_checks", "left", "verify"), ("k8", "e_checks", "e_verified", "down", "pass"),
        ("k9", "e_verified", "p_guide", "right", "show"), ("k10", "e_verified", "e_rework", "down", "edited"),
        ("k11", "k_article", "k_publish", "down", "editorial"), ("k12", "k_publish", "p_article", "right", "published"),
    ]:
        p.edge(key, a, b, label, d)
    p.note("knowledge_note", "Uncertain scans receive retry guidance. A verified knowledge record does not make the AI result a confirmed diagnosis.", 520, 1290, 840, 80)


def administration(file: ET.Element) -> None:
    p = Page(file, "administration", "07  Administrator operations", "Administrator-only account, scan, research and monitoring interactions.", 1350)
    for key, title, x in [("users", "ACCOUNTS", 30), ("scans", "SCANS / VERDICTS", 490), ("research", "RESEARCH CONTROL", 950), ("monitor", "MONITORING / SYSTEM", 1410)]:
        p.lane(key, title, x)
    items = [
        ("u_list", "Search and inspect user accounts", 60, 270, "action"),
        ("u_create", "Create farmer / agriculturist", 60, 405, "action"),
        ("u_edit", "Edit role and account fields", 60, 540, "action"),
        ("u_delete", "Delete account; retain independent research copy unless removed", 60, 675, "action"),
        ("s_list", "Browse diagnoses and status", 520, 270, "action"),
        ("s_detail", "Inspect AI result + final agriculturist verdict", 520, 405, "action"),
        ("s_audit", "Read review revisions and farmer advice", 520, 540, "action"),
        ("s_delete", "Delete scan; approved copy stays", 520, 675, "action"),
        ("d_candidates", "Inspect nominated dataset candidates", 980, 270, "action"),
        ("d_decide", "Approve / reject / uncertain decision", 980, 405, "action"),
        ("d_copies", "Inspect private-copy audit; photo via admin API", 980, 540, "action"),
        ("d_revoke", "Remove research copy with reason", 980, 675, "action"),
        ("m_dash", "Dashboard and operational counts", 1440, 270, "support"),
        ("m_analytics", "Web: review trends, agreement, provenance", 1440, 405, "support"),
        ("m_compare", "Web: run baseline / enhanced comparison", 1440, 540, "support"),
        ("m_system", "Web: read model/system information", 1440, 675, "support"),
        ("m_articles", "Disease and source content; web: articles and photos", 1440, 810, "action"),
    ]
    for key, label, x, y, kind in items:
        p.box(key, label, x, y, kind)
    for key, a, b, d, label in [
        ("ad1", "u_list", "u_create", "down", "new"), ("ad2", "u_list", "u_edit", "down", "update"),
        ("ad3", "u_edit", "u_delete", "down", "remove"),
        ("ad4", "s_list", "s_detail", "down", "open"), ("ad5", "s_detail", "s_audit", "down", "review"),
        ("ad6", "s_audit", "s_delete", "down", "if needed"),
        ("ad7", "d_candidates", "d_decide", "down", "decision"), ("ad8", "d_decide", "d_copies", "down", "approved"),
        ("ad9", "d_copies", "d_revoke", "down", "correction / request"),
        ("ad10", "m_dash", "m_analytics", "down", "explore"), ("ad11", "m_analytics", "m_compare", "down", "compare"),
        ("ad12", "m_compare", "m_system", "down", "inspect"),
    ]:
        p.edge(key, a, b, label, d)
    p.note("admin_note", "Web exposes research-copy audit/removal, the article library with photo uploads, analytics and model information. The phone admin covers users, scans, disease knowledge and research sources. See pages 14, 17 and 20.", 60, 990, 1300, 80)


def supporting(file: ET.Element) -> None:
    p = Page(file, "supporting", "08  Supporting interactions by role", "Independent navigation options for each role; see later pages for step-by-step paths.", 1320)
    for key, title, x in [("guest", "GUEST", 30), ("farmer", "FARMER", 490), ("expert", "AGRICULTURIST", 950), ("admin", "ADMINISTRATOR", 1410)]:
        p.lane(key, title, x)
    groups = [
        ("g", 60, [
            ("home", "Open scan / app landing", "action"), ("guide", "Phone: guide and article library (offline)", "support"),
            ("history", "View or delete device-only history", "action"), ("server", "Configure mobile test server address", "support"),
            ("policy", "Language (phone: EN / Filipino / Bisaya); privacy", "support"),
        ]),
        ("f", 520, [
            ("home", "Open home / history", "action"), ("guide", "Read verified guide and article library", "support"),
            ("chat", "Ask Dahon, or ask about one synced scan", "support"), ("location", "Add or remove optional scan location", "support"),
            ("profile", "Language, profile, password, sign out / delete", "action"),
        ]),
        ("e", 980, [
            ("home", "Open queue / reviewed scans", "action"), ("reference", "Compare educational reference photos", "support"),
            ("sources", "Evidence, guide, article library; web: Ask Dahon", "support"), ("content", "Verify disease content / decide candidate", "action"),
            ("profile", "Language, profile, password; sign out", "support"),
        ]),
        ("a", 1440, [
            ("home", "Open administrator dashboard", "action"), ("stats", "View analytics and AI–review agreement", "support"),
            ("model", "View model comparison and system info", "support"), ("content", "Maintain users, content, articles and audits", "action"),
            ("profile", "Language, profile, password; sign out", "support"),
        ]),
    ]
    ys = [275, 430, 585, 740, 895]
    for prefix, x, rows in groups:
        for (suffix, label, kind), y in zip(rows, ys):
            p.box(f"{prefix}_{suffix}", label, x, y, kind)
        for i in range(len(rows) - 1):
            p.edge(f"{prefix}_nav_{i}", f"{prefix}_{rows[i][0]}", f"{prefix}_{rows[i + 1][0]}", "navigate", "down", True)
    p.note("support_note", "Each lane lists independent menu options, not a required sequence. Chat, synchronization, staff tools and account updates need internet and sign-in; the phone's core scan and the saved article library do not. The website offers English and Filipino.", 60, 1090, 1760, 88)


def detail_page(
    file: ET.Element, page_id: str, name: str, subtitle: str,
    lanes: list[str], items: list[tuple[str, str, int, int, str]],
    edges: list[tuple[str, str, str, str]], note: str,
) -> None:
    p = Page(file, page_id, name, subtitle, 1710)
    for index, title in enumerate(lanes):
        p.lane(f"lane_{index}", title, 30 + 460 * index)
    for key, label, lane, y, kind in items:
        p.box(key, label, 60 + 460 * lane, y, kind)
    for index, (source, target, label, direction) in enumerate(edges):
        p.edge(f"flow_{index}", source, target, label, direction)
    p.note("detail_note", note, 60, 1550, 1760, 88)


def mobile_scan_detail(file: ET.Element) -> None:
    detail_page(
        file, "mobile-scan", "09  Mobile scan: capture to history",
        "Offline phone journey, including image checks, uncertain results and optional account sync.",
        ["GUEST / FARMER", "PHOTO CHECK", "ON-DEVICE MODEL", "RESULT / HISTORY"],
        [
            ("open", "Open Scan; choose camera or gallery", 0, 260, "action"),
            ("permission", "Camera permission denied? Use gallery or settings", 0, 390, "decision"),
            ("retake", "Improve lighting, focus and visible leaf area", 0, 630, "support"),
            ("retry", "Retake or choose another image", 0, 900, "action"),
            ("guide", "Open photo tips or disease guide", 0, 1170, "support"),
            ("quality", "Check photo quality and leaf presence", 1, 390, "system"),
            ("accepted", "Banana leaf photo accepted?", 1, 520, "decision"),
            ("blocked", "Show reason; keep user on capture step", 1, 765, "error"),
            ("prepare", "Resize and normalize image for model", 2, 390, "system"),
            ("infer", "Run bundled four-class model on phone", 2, 520, "system"),
            ("threshold", "Result passes confidence rule?", 2, 765, "decision"),
            ("offline", "Inference needs no account or network", 2, 1170, "note"),
            ("shown", "Show original AI class and confidence", 3, 520, "outcome"),
            ("uncertain", "Show uncertain result and retake advice", 3, 765, "outcome"),
            ("saved", "Save photo and result to local history", 3, 900, "data"),
            ("next", "Open history, verified guide or review request", 3, 1035, "action"),
            ("sync", "Signed-in farmer: queue optional sync", 3, 1290, "system"),
        ],
        [
            ("open", "permission", "camera route", "down"),
            ("open", "quality", "selected photo", "right"),
            ("quality", "accepted", "inspect", "down"),
            ("accepted", "blocked", "no", "down"),
            ("blocked", "retry", "try again", "left"),
            ("retake", "quality", "new photo", "right"),
            ("accepted", "prepare", "yes", "right"),
            ("prepare", "infer", "input", "down"),
            ("infer", "threshold", "scores", "down"),
            ("retry", "quality", "new image", "right"),
            ("threshold", "shown", "supported", "right"),
            ("threshold", "uncertain", "uncertain", "right"),
            ("shown", "saved", "auto-save", "down"),
            ("uncertain", "saved", "auto-save", "down"),
            ("saved", "next", "continue", "down"),
            ("saved", "sync", "if signed in", "down"),
        ],
        "The AI screen is an initial classification. The agriculturist's later verdict is stored separately and can correct it.",
    )


def web_scan_detail(file: ET.Element) -> None:
    detail_page(
        file, "web-scan", "10  Web scan: visitor to saved case",
        "Public screening uses the connected inference service; account sign-in is required to save and request review.",
        ["VISITOR / FARMER", "CONNECTED INFERENCE", "RESULT / RETRY", "ACCOUNT / SAVED CASE"],
        [
            ("open", "Open public web scanner", 0, 260, "action"),
            ("choose", "Choose leaf image; preview and confirm", 0, 390, "action"),
            ("retry", "Choose clearer photo and resubmit", 0, 900, "action"),
            ("guide", "Guide, article library and Ask Dahon need sign-in", 0, 1170, "support"),
            ("submit", "Send image to screening endpoint", 1, 390, "system"),
            ("available", "Inference service available?", 1, 520, "decision"),
            ("model", "Return class, confidence and receipt", 1, 765, "system"),
            ("unavailable", "Show service error; allow retry", 1, 1035, "error"),
            ("show", "Show AI result and explanation", 2, 765, "outcome"),
            ("uncertain", "Uncertain? Offer retake or save", 2, 900, "decision"),
            ("compare", "Open optional model comparison", 2, 1170, "support"),
            ("auth", "Signed in as farmer?", 3, 765, "decision"),
            ("login", "Sign in or register to save result", 3, 900, "action"),
            ("save", "Save scan in farmer history", 3, 1035, "data"),
            ("review", "If needed, request agriculturist review", 3, 1170, "action"),
            ("sync", "Browser queues failed sync for retry", 3, 1305, "system"),
        ],
        [
            ("open", "choose", "start", "down"),
            ("choose", "submit", "screen", "right"),
            ("submit", "available", "request", "down"),
            ("available", "model", "yes", "down"),
            ("available", "unavailable", "no", "down"),
            ("unavailable", "retry", "retry later", "left"),
            ("retry", "submit", "resubmit", "right"),
            ("model", "show", "result", "right"),
            ("show", "uncertain", "interpret", "down"),
            ("uncertain", "retry", "retake", "left"),
            ("show", "auth", "save", "right"),
            ("auth", "login", "no", "down"),
            ("login", "save", "authenticated", "down"),
            ("auth", "save", "yes", "down"),
            ("save", "review", "optional", "down"),
            ("save", "sync", "network failure", "down"),
        ],
        "A public web visitor can see a screening result without creating a case. A failed inference has no disease verdict to save.",
    )


def sync_recovery(file: ET.Element) -> None:
    detail_page(
        file, "sync-recovery", "11  Scan sync and recovery",
        "A local scan stays usable while metadata, photos, review updates and deletions move between signed-in devices.",
        ["LOCAL DEVICE / BROWSER", "OUTBOX / SERVER", "PRIVATE PHOTO", "PULL / OTHER DEVICES"],
        [
            ("saved", "Local scan has stable client ID", 0, 260, "system"),
            ("signed", "Farmer signs in; app attaches guest scans", 0, 390, "action"),
            ("offline", "Offline? Keep local item and retry", 0, 765, "error"),
            ("delete", "Delete scan from history", 0, 1170, "action"),
            ("queue", "Queue metadata in durable outbox", 1, 390, "data"),
            ("push", "Push pending changes with retry IDs", 1, 520, "system"),
            ("ack", "Server accepts or reports a conflict?", 1, 765, "decision"),
            ("recover", "Keep failed item; show retry state", 1, 900, "error"),
            ("tomb", "Queue deletion tombstone", 1, 1170, "data"),
            ("upload", "Upload private photo separately", 2, 520, "system"),
            ("missing", "Photo upload missing or failed?", 2, 765, "decision"),
            ("photo_retry", "Retry photo from retained local file", 2, 900, "action"),
            ("ready", "Synced photo supports expert review", 2, 1035, "outcome"),
            ("pull", "Pull scans and review changes by cursor", 3, 520, "system"),
            ("merge", "Update local result, verdict and seen state", 3, 765, "system"),
            ("other", "Other signed-in devices show current case", 3, 900, "outcome"),
            ("removed", "Tombstone removes scan on other devices", 3, 1170, "outcome"),
        ],
        [
            ("saved", "signed", "optional", "down"),
            ("signed", "queue", "connect", "right"),
            ("queue", "push", "send", "down"),
            ("push", "ack", "response", "down"),
            ("push", "offline", "unavailable", "left"),
            ("ack", "recover", "failed", "down"),
            ("recover", "push", "retry", "up"),
            ("ack", "upload", "accepted", "right"),
            ("upload", "missing", "check", "down"),
            ("missing", "photo_retry", "yes", "down"),
            ("missing", "ready", "no", "down"),
            ("upload", "pull", "refresh", "right"),
            ("pull", "merge", "updates", "down"),
            ("merge", "other", "shared account", "down"),
            ("delete", "tomb", "sync deletion", "right"),
            ("tomb", "removed", "pull", "right"),
        ],
        "Metadata sync does not grant research consent. Local and browser outboxes retry independently; review requires a synced case and available photo.",
    )


def review_followup(file: ET.Element) -> None:
    detail_page(
        file, "review-followup", "12  Review, follow-up and correction",
        "The original AI output, current expert verdict and revision history remain distinct across farmer and admin views.",
        ["FARMER", "CASE / QUEUE", "AGRICULTURIST", "ADMINISTRATOR"],
        [
            ("request", "Open synced scan; request review", 0, 260, "action"),
            ("photo", "Add concern and missing photo if needed", 0, 390, "action"),
            ("read", "Read verdict, message and next steps", 0, 900, "outcome"),
            ("seen", "Acknowledge review; sync seen state", 0, 1035, "action"),
            ("follow", "Reply or send a new photo for reassessment", 0, 1170, "action"),
            ("pending", "Create pending case; retain original AI", 1, 390, "system"),
            ("claim", "Lease claim to one reviewer", 1, 520, "system"),
            ("version", "Validate expected review version", 1, 765, "decision"),
            ("publish", "Save verdict, advice and revision audit", 1, 900, "system"),
            ("reopen", "Follow-up reopens case; retain prior verdict", 1, 1170, "system"),
            ("inspect", "Inspect AI result, photo and farmer notes", 2, 520, "action"),
            ("usable", "Photo available and sufficient?", 2, 650, "decision"),
            ("choose", "Confirm, correct, cannot determine, or outside classes", 2, 765, "action"),
            ("advice", "Write farmer advice; optional internal note", 2, 900, "action"),
            ("revise", "Reassess; record reason for correction", 2, 1170, "action"),
            ("admin_current", "See same current verdict and advice", 3, 900, "outcome"),
            ("audit", "Inspect review revisions and status", 3, 1035, "action"),
            ("locked", "Approved research label? Resolve copy first", 3, 1305, "decision"),
        ],
        [
            ("request", "photo", "context", "down"),
            ("photo", "pending", "submit", "right"),
            ("pending", "claim", "queue", "down"),
            ("claim", "inspect", "assigned", "right"),
            ("inspect", "usable", "assess", "down"),
            ("usable", "choose", "decide", "down"),
            ("choose", "advice", "message", "down"),
            ("advice", "version", "save", "left"),
            ("version", "publish", "current", "down"),
            ("publish", "read", "farmer", "left"),
            ("publish", "admin_current", "admin", "right"),
            ("read", "seen", "viewed", "down"),
            ("seen", "follow", "question", "down"),
            ("follow", "reopen", "submit", "right"),
            ("reopen", "revise", "new review", "right"),
            ("revise", "locked", "correction check", "right"),
            ("locked", "version", "if unlocked", "left"),
            ("admin_current", "audit", "history", "down"),
        ],
        "An unavailable photo can produce 'Cannot determine' with a request for a clearer image. Stale version saves are rejected; the reviewer reloads the case.",
    )


def privacy_removal(file: ET.Element) -> None:
    detail_page(
        file, "privacy-removal", "13  Privacy, consent and deletion",
        "The ordinary scan and an approved research copy have separate storage and separate removal controls.",
        ["FARMER", "ELIGIBILITY / CONSENT", "PRIVATE RESEARCH COPY", "STAFF / AUDIT"],
        [
            ("terms", "Read research terms and privacy policy", 0, 260, "support"),
            ("grant", "Grant current research consent", 0, 390, "action"),
            ("renew", "Renew older consent before approval", 0, 650, "action"),
            ("list", "List own approved research images", 0, 900, "action"),
            ("scan_delete", "Delete original scan from history", 0, 1035, "action"),
            ("withdraw", "Withdraw consent or remove own copy", 0, 1170, "action"),
            ("account", "Delete account; choose copy retention", 0, 1305, "action"),
            ("current", "Current consent? Renew older version", 1, 390, "decision"),
            ("eligible", "Photo + completed determinate review?", 1, 520, "decision"),
            ("nominate", "Eligible image may be nominated", 1, 650, "system"),
            ("revoke", "Withdrawal blocks candidate use", 1, 1170, "system"),
            ("copied", "Approval creates independent private copy", 2, 765, "data"),
            ("retained", "Scan deletion leaves approved copy", 2, 1035, "outcome"),
            ("remove", "Delete copy; retain removal audit", 2, 1170, "system"),
            ("keep", "Keep choice retains independent copy", 2, 1305, "outcome"),
            ("training", "No automatic model training", 2, 1435, "note"),
            ("decision", "Different expert or admin decides", 3, 650, "action"),
            ("approve", "Approve, reject or mark uncertain", 3, 765, "action"),
            ("inspect", "Admin inspects copy and audit", 3, 900, "action"),
            ("staff_remove", "Admin removes copy with reason", 3, 1170, "action"),
        ],
        [
            ("terms", "grant", "accept", "down"),
            ("grant", "current", "check", "right"),
            ("current", "renew", "older terms", "left"),
            ("renew", "eligible", "new consent", "right"),
            ("current", "eligible", "valid", "down"),
            ("eligible", "nominate", "yes", "down"),
            ("nominate", "decision", "candidate", "right"),
            ("decision", "approve", "independent", "down"),
            ("approve", "copied", "approved", "left"),
            ("copied", "list", "farmer view", "left"),
            ("copied", "inspect", "audit", "right"),
            ("list", "scan_delete", "optional", "down"),
            ("scan_delete", "retained", "copy remains", "right"),
            ("list", "withdraw", "remove", "down"),
            ("withdraw", "revoke", "revoke", "right"),
            ("revoke", "remove", "approved copy", "right"),
            ("inspect", "staff_remove", "correction", "down"),
            ("staff_remove", "remove", "record reason", "left"),
            ("account", "remove", "remove selected", "right"),
            ("account", "keep", "keep selected", "right"),
        ],
        "Account deletion follows its own keep-or-remove choice. The saved research file is private, with a hash, label and audit record.",
    )


def content_publication(file: ET.Element) -> None:
    detail_page(
        file, "content-publication", "14  Knowledge review and publication",
        "Editorial controls determine which disease guidance and articles appear to farmers and guests.",
        ["ADMIN AUTHOR", "EVIDENCE / STATUS", "AGRICULTURIST", "FARMER / GUEST"],
        [
            ("draft", "Create disease draft or edit dossier", 0, 260, "action"),
            ("symptoms", "Add symptoms and management steps", 0, 390, "action"),
            ("sources", "Link sources to supported claims", 0, 520, "action"),
            ("chemical", "Record check for chemical guidance", 0, 650, "action"),
            ("article", "Web: write article; upload photos (saved as WebP)", 0, 1170, "action"),
            ("publish_article", "Publish: needs a reference and credited photos", 0, 1305, "action"),
            ("researched", "Mark dossier researched for review", 1, 520, "system"),
            ("check", "Evidence and required checks complete?", 1, 765, "decision"),
            ("verified", "Verified guidance can be displayed", 1, 900, "outcome"),
            ("rework", "Material edit returns status to researched", 1, 1035, "system"),
            ("inspect", "Inspect dossier, sources and claims", 2, 520, "action"),
            ("decide", "Verify or request revision", 2, 765, "action"),
            ("reference", "Use source library and reference photos", 2, 1170, "support"),
            ("guide", "Read verified disease guidance", 3, 900, "outcome"),
            ("revised", "Updated guide appears after re-verification", 3, 1035, "outcome"),
            ("read_article", "Read article and photos; see page 20", 3, 1305, "outcome"),
        ],
        [
            ("draft", "symptoms", "compose", "down"),
            ("symptoms", "sources", "document", "down"),
            ("sources", "chemical", "if relevant", "down"),
            ("sources", "researched", "ready", "right"),
            ("researched", "inspect", "review", "right"),
            ("inspect", "decide", "assess", "down"),
            ("decide", "check", "verify", "left"),
            ("check", "verified", "pass", "down"),
            ("verified", "guide", "publish", "right"),
            ("verified", "rework", "edit", "down"),
            ("rework", "inspect", "review again", "right"),
            ("verified", "revised", "updated version", "right"),
            ("article", "publish_article", "editorial", "down"),
            ("publish_article", "read_article", "published", "right"),
        ],
        "A scan's AI result remains a screen even when the disease guide is verified. Uncertain scans receive retake advice rather than disease-specific steps.",
    )


def account_sessions(file: ET.Element) -> None:
    detail_page(
        file, "account-sessions", "15  Accounts, sessions and device scans",
        "Entry, email verification, guest-scan ownership, profile changes and sign-out decisions for every role.",
        ["VISITOR / GUEST", "IDENTITY SERVICE", "FARMER ACCOUNT", "STAFF ACCOUNT"],
        [
            ("guest", "Use phone scanner and local history", 0, 260, "action"),
            ("register", "Register as farmer or sign in", 0, 390, "action"),
            ("reset", "Forgot password? Request reset link", 0, 765, "action"),
            ("privacy", "Read privacy or public deletion page", 0, 1170, "support"),
            ("public_delete", "Submit public account-deletion form", 0, 1305, "action"),
            ("validate", "Validate credentials and create session", 1, 390, "system"),
            ("valid", "Credentials accepted?", 1, 520, "decision"),
            ("error", "Show error; retry sign-in", 1, 650, "error"),
            ("reset_link", "Send reset link; accept new password", 1, 765, "system"),
            ("verify", "Email verification link or resend", 1, 900, "system"),
            ("signout_choice", "Pending changes? Sync or confirm discard", 1, 1170, "decision"),
            ("expired", "Expired session returns to sign-in", 1, 1305, "system"),
            ("attach", "App attaches signed-out scans to farmer", 2, 650, "system"),
            ("auto", "Sync attached scans when online", 2, 765, "system"),
            ("profile", "Edit name, email, avatar or password", 2, 900, "action"),
            ("location", "Add or remove optional scan location", 2, 1035, "support"),
            ("signout", "Sign out; check pending sync or photos", 2, 1170, "decision"),
            ("delete", "Delete account; choose research-copy removal", 2, 1305, "action"),
            ("provision", "Admin creates agriculturist accounts", 3, 260, "action"),
            ("gate", "Verify email to use staff tools", 3, 520, "decision"),
            ("landing", "Open agriculturist or admin workspace", 3, 650, "outcome"),
            ("staff_profile", "Edit profile, avatar or password", 3, 900, "action"),
            ("staff_exit", "Sign out or delete own account", 3, 1170, "action"),
        ],
        [
            ("guest", "register", "connect", "down"),
            ("register", "validate", "submit", "right"),
            ("validate", "valid", "check", "down"),
            ("valid", "error", "no", "down"),
            ("reset", "reset_link", "email", "right"),
            ("privacy", "public_delete", "if needed", "down"),
            ("valid", "attach", "farmer", "right"),
            ("attach", "auto", "online", "down"),
            ("auto", "profile", "account", "down"),
            ("profile", "location", "optional", "down"),
            ("profile", "signout", "exit", "down"),
            ("signout", "signout_choice", "check", "left"),
            ("profile", "delete", "separate action", "down"),
            ("provision", "gate", "staff sign-in", "down"),
            ("valid", "gate", "staff", "right"),
            ("gate", "verify", "unverified", "left"),
            ("gate", "landing", "verified", "down"),
            ("landing", "staff_profile", "account", "down"),
            ("staff_profile", "staff_exit", "exit", "down"),
            ("expired", "register", "sign in again", "left"),
        ],
        "Mobile and web keep their own pending-change safeguards on sign-out. A session expiry keeps unsynced phone records tied to their owner until re-authentication.",
    )


def expert_queue(file: ET.Element) -> None:
    detail_page(
        file, "expert-queue", "16  Agriculturist queue and decision paths",
        "Queue entry, claim conflicts, photo limits, supported decisions and review publication.",
        ["CASE SOURCE", "QUEUE / CLAIM", "AGRICULTURIST", "FARMER / ADMIN"],
        [
            ("uncertain", "Saved uncertain scan is eligible for queue", 0, 260, "system"),
            ("requested", "Farmer explicitly requests review", 0, 390, "action"),
            ("follow", "Farmer follow-up reopens prior review", 0, 520, "action"),
            ("photo", "Missing photo can be sent or retried", 0, 900, "action"),
            ("pending", "List open cases and review reasons", 1, 390, "system"),
            ("claim", "Claim case; renew while open", 1, 520, "system"),
            ("conflict", "Another reviewer holds active claim?", 1, 650, "decision"),
            ("held", "Choose another case or wait for release", 1, 765, "error"),
            ("release", "Release claim on close or completion", 1, 1170, "system"),
            ("reviewed", "Completed case appears in reviewed list", 1, 1305, "outcome"),
            ("inspect", "Inspect photo, original AI and farmer note", 2, 520, "action"),
            ("image", "Photo available and clear enough?", 2, 650, "decision"),
            ("choose", "Confirm, alternate class or outside classes", 2, 765, "action"),
            ("cannot", "Cannot determine; request better photo", 2, 900, "action"),
            ("advice", "Add next steps and optional farmer message", 2, 1035, "action"),
            ("save", "Save with current version; stale save reloads", 2, 1170, "decision"),
            ("nominate", "If eligible, nominate research image", 2, 1305, "support"),
            ("progress", "Farmer sees waiting or in-progress state", 3, 520, "outcome"),
            ("verdict", "Farmer sees verdict and advice after sync", 3, 1170, "outcome"),
            ("admin", "Admin sees same verdict and revision audit", 3, 1305, "outcome"),
        ],
        [
            ("uncertain", "pending", "queue", "right"),
            ("requested", "pending", "queue", "right"),
            ("follow", "pending", "reopen", "right"),
            ("pending", "claim", "open", "down"),
            ("claim", "conflict", "check", "down"),
            ("claim", "progress", "started", "right"),
            ("conflict", "held", "yes", "down"),
            ("conflict", "inspect", "available", "right"),
            ("inspect", "image", "assess", "down"),
            ("image", "choose", "usable", "down"),
            ("image", "cannot", "missing", "down"),
            ("cannot", "photo", "ask farmer", "left"),
            ("choose", "advice", "explain", "down"),
            ("cannot", "advice", "explain", "down"),
            ("advice", "save", "submit", "down"),
            ("save", "release", "stored", "left"),
            ("release", "reviewed", "complete", "down"),
            ("reviewed", "nominate", "if eligible", "right"),
            ("save", "verdict", "current result", "right"),
            ("reviewed", "admin", "audit", "right"),
        ],
        "A competing claim or stale version prevents overlapping saves. A corrected verdict keeps earlier assessments in the revision history.",
    )


def admin_decisions(file: ET.Element) -> None:
    detail_page(
        file, "admin-decisions", "17  Administrator decisions and oversight",
        "Day-to-day admin actions across accounts, scans, research copies, content and monitoring.",
        ["DASHBOARD / MONITORING", "ACCOUNT CONTROL", "SCAN / REVIEW AUDIT", "RESEARCH / CONTENT"],
        [
            ("home", "Open dashboard counts and activity", 0, 260, "action"),
            ("analytics", "Inspect trends and AI–review agreement", 0, 520, "support"),
            ("comparison", "Run baseline / enhanced comparison", 0, 765, "support"),
            ("system", "Inspect model and system information", 0, 1035, "support"),
            ("users", "Search farmers and agriculturists", 1, 260, "action"),
            ("create", "Create farmer or agriculturist account", 1, 390, "action"),
            ("edit", "Edit account details or credentials", 1, 520, "action"),
            ("remove_user", "Delete account; apply copy-retention rule", 1, 900, "action"),
            ("scans", "Browse diagnoses and review status", 2, 260, "action"),
            ("detail", "Inspect original AI and current verdict", 2, 390, "action"),
            ("history", "Read advice, revisions and farmer follow-up", 2, 520, "action"),
            ("remove_scan", "Delete scan; independent copy remains", 2, 900, "action"),
            ("candidate", "Decide nominated image independently", 3, 260, "action"),
            ("copy", "Inspect approved copy and audit", 3, 390, "action"),
            ("remove_copy", "Remove copy with recorded reason", 3, 520, "action"),
            ("source", "Maintain sources and claim mappings", 3, 900, "action"),
            ("disease", "Create, edit or remove disease guidance", 3, 1035, "action"),
            ("article", "Create, source, publish or delete articles", 3, 1170, "action"),
        ],
        [
            ("home", "analytics", "inspect", "down"),
            ("analytics", "comparison", "compare", "down"),
            ("comparison", "system", "model", "down"),
            ("users", "create", "new", "down"),
            ("users", "edit", "update", "down"),
            ("edit", "remove_user", "if requested", "down"),
            ("scans", "detail", "open", "down"),
            ("detail", "history", "audit", "down"),
            ("history", "remove_scan", "if needed", "down"),
            ("candidate", "copy", "approved", "down"),
            ("copy", "remove_copy", "correction", "down"),
            ("source", "disease", "evidence", "down"),
            ("disease", "article", "editorial", "down"),
        ],
        "These lanes are independent admin tasks, not one required sequence. Public guidance follows verification; approved research files follow separate removal rules.",
    )


def exception_recovery(file: ET.Element) -> None:
    detail_page(
        file, "exception-recovery", "18  Exceptions and recovery",
        "When an action fails, the user sees a recoverable state or a clear next step; unsent work stays visible.",
        ["CAPTURE / AI", "SYNC / STORAGE", "AGRICULTURAL REVIEW", "CONSENT / REMOVAL"],
        [
            ("permission", "Camera permission denied", 0, 260, "error"),
            ("gallery", "Use gallery or enable camera in settings", 0, 390, "action"),
            ("rejected", "Leaf gate rejects a non-banana photo", 0, 650, "error"),
            ("retake", "Explain problem; choose another leaf", 0, 765, "action"),
            ("model", "Local model cannot complete analysis", 0, 1035, "error"),
            ("model_retry", "Show error; retry when model is ready", 0, 1170, "action"),
            ("no_verdict", "No scan result is invented", 0, 1305, "outcome"),
            ("offline", "No network or metadata push fails", 1, 260, "error"),
            ("outbox", "Keep scan in local or browser outbox", 1, 390, "data"),
            ("push", "Retry when online; show sync status", 1, 520, "action"),
            ("photo", "Private photo upload fails", 1, 765, "error"),
            ("photo_retry", "Keep photo; retry its upload", 1, 900, "action"),
            ("deletion", "Remote scan deletion fails", 1, 1170, "error"),
            ("tombstone", "Keep pending deletion for retry", 1, 1305, "data"),
            ("missing", "Reviewer cannot see a usable photo", 2, 260, "error"),
            ("cannot", "Record cannot determine; ask for image", 2, 390, "action"),
            ("follow", "Farmer replies or sends new photo", 2, 520, "action"),
            ("claim", "Another reviewer holds the case", 2, 765, "error"),
            ("wait", "Choose another case or wait for release", 2, 900, "action"),
            ("stale", "Review version changed before save", 2, 1170, "error"),
            ("reload", "Reload case; preserve earlier revision", 2, 1305, "action"),
            ("consent", "Email or consent version is not current", 3, 260, "error"),
            ("renew", "Verify email or renew research consent", 3, 390, "action"),
            ("ineligible", "Photo or verdict fails dataset checks", 3, 650, "error"),
            ("reject", "Keep candidate unapproved", 3, 765, "outcome"),
            ("removal", "Research file removal needs retry", 3, 1035, "error"),
            ("retry_remove", "Retry removal; retain audit record", 3, 1170, "action"),
        ],
        [
            ("permission", "gallery", "fallback", "down"),
            ("rejected", "retake", "new photo", "down"),
            ("model", "model_retry", "try again", "down"),
            ("model_retry", "no_verdict", "until success", "down"),
            ("offline", "outbox", "retain", "down"),
            ("outbox", "push", "reconnect", "down"),
            ("photo", "photo_retry", "retry", "down"),
            ("deletion", "tombstone", "retain", "down"),
            ("missing", "cannot", "assess", "down"),
            ("cannot", "follow", "request", "down"),
            ("claim", "wait", "resolve", "down"),
            ("stale", "reload", "refresh", "down"),
            ("consent", "renew", "resolve", "down"),
            ("ineligible", "reject", "hold", "down"),
            ("removal", "retry_remove", "retry", "down"),
        ],
        "Each lane shows independent recovery paths. Research approval never bypasses consent, image-quality, verdict or audit checks.",
    )


def lifecycle_visibility(file: ET.Element) -> None:
    detail_page(
        file, "lifecycle-visibility", "19  Records, states and visibility",
        "Follow what is saved, who can see it, and what changes after review, approval or deletion.",
        ["SCAN RECORD", "REVIEW VERDICT", "RESEARCH IMAGE", "KNOWLEDGE CONTENT"],
        [
            ("local", "Phone saves scan and original AI result", 0, 260, "data"),
            ("guest", "Guest sees device-only history", 0, 390, "outcome"),
            ("pending", "Farmer record waits in sync outbox", 0, 520, "data"),
            ("synced", "Synced case appears on signed-in devices", 0, 650, "outcome"),
            ("scan_delete", "Delete scan; sync tombstone", 0, 1035, "action"),
            ("scan_removed", "Ordinary scan disappears from history", 0, 1170, "outcome"),
            ("unreviewed", "Original AI result stays unchanged", 1, 260, "data"),
            ("review_pending", "Request or uncertainty enters queue", 1, 520, "system"),
            ("claimed", "Agriculturist claim shows in progress", 1, 650, "system"),
            ("completed", "Current expert verdict goes to farmer and admin", 1, 765, "outcome"),
            ("follow", "Farmer follow-up reopens assessment", 1, 1035, "action"),
            ("revision", "New verdict keeps earlier revision audit", 1, 1170, "data"),
            ("consent", "Current farmer consent is recorded", 2, 260, "data"),
            ("candidate", "Expert nominates eligible reviewed photo", 2, 520, "action"),
            ("decision", "Different expert or admin decides", 2, 650, "decision"),
            ("copy", "Approval saves independent private copy", 2, 765, "data"),
            ("retained", "Copy can remain after ordinary scan deletion", 2, 1035, "outcome"),
            ("remove", "Withdrawal or removal deletes copy; keeps audit", 2, 1170, "action"),
            ("draft", "Admin creates draft disease guidance", 3, 260, "data"),
            ("researched", "Evidence and checks move it to researched", 3, 520, "system"),
            ("verified", "Expert verification makes guidance public", 3, 765, "outcome"),
            ("edit", "Material edit returns guidance for review", 3, 1035, "system"),
            ("article", "Sourced articles have a separate publish path", 3, 1170, "outcome"),
        ],
        [
            ("local", "guest", "signed out", "down"),
            ("local", "pending", "farmer account", "down"),
            ("pending", "synced", "online", "down"),
            ("synced", "scan_delete", "optional", "down"),
            ("scan_delete", "scan_removed", "sync", "down"),
            ("unreviewed", "review_pending", "review needed", "down"),
            ("review_pending", "claimed", "picked up", "down"),
            ("claimed", "completed", "save", "down"),
            ("completed", "follow", "question", "down"),
            ("follow", "revision", "reassess", "down"),
            ("consent", "candidate", "eligible", "down"),
            ("candidate", "decision", "review", "down"),
            ("decision", "copy", "approved", "down"),
            ("copy", "retained", "source deleted", "down"),
            ("retained", "remove", "farmer / staff", "down"),
            ("draft", "researched", "evidence", "down"),
            ("researched", "verified", "verify", "down"),
            ("verified", "edit", "later change", "down"),
        ],
        "The AI output, expert verdict, research copy and public guidance have different owners and update rules. No approved image enters model training automatically.",
    )


def library_reading(file: ET.Element) -> None:
    detail_page(
        file, "library-reading", "20  Guide and article library reading",
        "How readers find, open and keep articles, including offline use and photo credits.",
        ["READER", "FIND", "ARTICLE", "SAVED ON DEVICE"],
        [
            ("open", "Open Guide, then Library (phone: not admin; web: signed in)", 0, 260, "action"),
            ("from_disease", "From a disease: 'Read articles about this'", 0, 520, "support"),
            ("extra", "Reference-only guide entries: freckle, bunchy top", 0, 765, "support"),
            ("advice", "Ask your agriculturist before acting", 0, 1035, "note"),
            ("search", "Search titles, text, captions and authors", 1, 390, "action"),
            ("filter", "Filter by leaf condition and topic", 1, 520, "action"),
            ("results", "Matching articles; title matches first", 1, 650, "outcome"),
            ("none", "No match: clear search and filters", 1, 900, "error"),
            ("read", "Summary, steps and placed photos", 2, 650, "outcome"),
            ("photo", "Tap photo for full screen; credit and license shown", 2, 765, "support"),
            ("refs", "Numbered references; open source link online", 2, 900, "support"),
            ("lang", "Article text in English; menus translated", 2, 1035, "note"),
            ("bundled", "First launch: articles and photos shipped in app", 3, 260, "data"),
            ("online", "Online? On open, and on reconnect at most hourly", 3, 390, "decision"),
            ("download", "Download published articles; save admin-added photos", 3, 520, "system"),
            ("saved", "Phone keeps text and photos; browser keeps text", 3, 650, "data"),
            ("offline", "Offline: show the saved copy", 3, 900, "outcome"),
        ],
        [
            ("open", "search", "browse", "right"),
            ("from_disease", "filter", "pre-filtered", "right"),
            ("search", "filter", "narrow", "down"),
            ("filter", "results", "list", "down"),
            ("results", "read", "open", "right"),
            ("results", "none", "nothing found", "down"),
            ("read", "photo", "view", "down"),
            ("photo", "refs", "check sources", "down"),
            ("bundled", "online", "update", "down"),
            ("online", "download", "yes", "down"),
            ("download", "saved", "store", "down"),
            ("saved", "read", "read", "left"),
            ("saved", "offline", "later, no signal", "down"),
        ],
        "Articles summarise their cited sources and do not replace a diagnosis. The guide's freckle and bunchy top entries are educational only; the scan model cannot detect them. Admins write and publish articles on page 14.",
    )


def alerts_and_assistant(file: ET.Element) -> None:
    detail_page(
        file, "alerts-assistant", "21  Review alerts, badges and Ask Dahon",
        "How a farmer learns an expert answered, and how each role reaches the Ask Dahon assistant.",
        ["FARMER", "PHONE / BROWSER", "ASK DAHON", "AGRICULTURIST"],
        [
            ("request", "Request expert review", 0, 260, "action"),
            ("permission", "Allow notifications? Asked once", 0, 390, "decision"),
            ("denied", "Denied: no alert; badge still shows", 0, 520, "error"),
            ("tap", "Tap the notification", 0, 650, "action"),
            ("history", "History opens: 'New expert review'", 0, 765, "outcome"),
            ("seen", "Open the scan; marked seen on all devices", 0, 900, "action"),
            ("ask_scan", "'Ask Dahon about this' on a synced scan", 0, 1035, "support"),
            ("sync", "Auto sync: reconnect, app reopened, every minute", 1, 260, "system"),
            ("new_review", "New expert review found?", 1, 390, "decision"),
            ("notify", "Phone notification (on device, no push server)", 1, 520, "system"),
            ("badge", "Tab badge: History count for farmers", 1, 650, "data"),
            ("web_badge", "Web: History and Review Queue badges", 1, 1170, "data"),
            ("open_chat", "Open Ask Dahon (phone: guest, farmer; web: all)", 2, 260, "action"),
            ("signed_in", "Signed in and online?", 2, 390, "decision"),
            ("sign_in", "Sign in; the chat resumes", 2, 520, "action"),
            ("chat", "Ask about banana care and diseases", 2, 650, "action"),
            ("scan_context", "About a scan: uses only that scan's result and review", 2, 765, "system"),
            ("chat_error", "No answer: show error; scanning still works", 2, 900, "error"),
            ("queue_badge", "Home badge counts farmer review requests", 3, 260, "data"),
            ("claim", "Claim and assess the case", 3, 390, "action"),
            ("save", "Save verdict and optional farmer message", 3, 520, "action"),
            ("map", "Optional scan location: open map", 3, 650, "support"),
        ],
        [
            ("request", "permission", "first request", "down"),
            ("permission", "denied", "no", "down"),
            ("sync", "new_review", "pull", "down"),
            ("new_review", "notify", "yes, if allowed", "down"),
            ("notify", "badge", "count", "down"),
            ("notify", "tap", "alert", "left"),
            ("tap", "history", "open", "down"),
            ("history", "seen", "read", "down"),
            ("seen", "ask_scan", "optional", "down"),
            ("ask_scan", "scan_context", "scan topic", "right"),
            ("open_chat", "signed_in", "send", "down"),
            ("signed_in", "sign_in", "no", "down"),
            ("sign_in", "chat", "resume", "down"),
            ("chat", "scan_context", "with a scan", "down"),
            ("scan_context", "chat_error", "if it fails", "down"),
            ("queue_badge", "claim", "open", "down"),
            ("claim", "save", "decide", "down"),
            ("save", "map", "if shared", "down"),
        ],
        "A saved verdict reaches the farmer on the next sync; the phone then shows the notification and badge. Ask Dahon gives general advice; the agriculturist's verdict remains the decision on a scan.",
    )


def scan_result_next(file: ET.Element) -> None:
    detail_page(
        file, "scan-result", "22  Scan result and next steps",
        "What the phone shows after a check, and every next step it offers.",
        ["RESULT", "NEXT STEP", "GUIDE", "SAVE"],
        [
            ("shown", "Result card: condition and how sure", 0, 260, "outcome"),
            ("sure", "'Not sure'?", 0, 390, "decision"),
            ("retake", "Photo tips and quality notice; Retake or compare in the guide", 0, 520, "action"),
            ("more", "More info: exact scores; never shown as 100%", 0, 650, "support"),
            ("footer", "Footer: 'For research use only'", 0, 765, "note"),
            ("steps", "What to do now: short numbered steps", 1, 390, "outcome"),
            ("farmer", "Signed-in farmer, saved, not healthy?", 1, 520, "decision"),
            ("ask", "Ask an expert: opens the scan in History", 1, 650, "action"),
            ("another", "Sure result: 'Scan another leaf'", 1, 900, "action"),
            ("full", "See full treatment, or how to keep it healthy", 2, 390, "action"),
            ("guide", "Guide opens at that condition", 2, 520, "outcome"),
            ("products", "Show products used: FPA-listed; ask your agriculturist", 2, 650, "support"),
            ("articles", "Read articles about this condition", 2, 765, "support"),
            ("autosave", "Saved automatically after the check", 3, 260, "system"),
            ("who", "Who is signed in?", 3, 390, "decision"),
            ("saved", "Farmer: saved to History, then syncs. Guest: saved on this phone", 3, 520, "data"),
            ("failed", "Save failed: 'Try saving again'", 3, 650, "error"),
            ("open", "'Open' jumps to the saved scan", 3, 765, "support"),
        ],
        [
            ("shown", "sure", "check", "down"),
            ("sure", "retake", "yes", "down"),
            ("sure", "steps", "no", "right"),
            ("steps", "full", "more detail", "right"),
            ("steps", "farmer", "need help", "down"),
            ("farmer", "ask", "yes", "down"),
            ("full", "guide", "open", "down"),
            ("guide", "products", "if any", "down"),
            ("products", "articles", "read more", "down"),
            ("shown", "autosave", "save", "right"),
            ("autosave", "who", "store", "down"),
            ("who", "saved", "result", "down"),
            ("saved", "failed", "if it fails", "down"),
            ("failed", "open", "after retry", "down"),
        ],
        "Uncertain results show photo tips instead of treatment steps, with Retake and a guide link to compare signs. Healthy results show care tips and no 'Ask an expert' button.",
    )


def history_screen(file: ET.Element) -> None:
    detail_page(
        file, "history-screen", "23  History: filters, statuses and review stages",
        "How a farmer finds a scan, reads its details, asks for and follows a review, and manages the record.",
        ["HISTORY LIST", "SCAN DETAILS", "EXPERT REVIEW", "SHARING AND CLEANUP"],
        [
            ("open", "Open History", 0, 260, "action"),
            ("filter", "Filter: All, Not sure, Expert review, Could not send", 0, 390, "action"),
            ("counts", "Header: waiting, could not send, up to date", 0, 520, "system"),
            ("item", "Tap a scan to show details", 0, 650, "action"),
            ("details", "AI result, how sure, also possible, your note", 1, 650, "outcome"),
            ("photo", "View photo full screen", 1, 765, "support"),
            ("guide", "Read about the condition in the guide", 1, 900, "support"),
            ("dahon", "Ask Dahon about this (synced scans)", 1, 1035, "support"),
            ("signed", "Signed in? If not: 'Sign in to ask an expert'", 2, 390, "decision"),
            ("note", "Optional note: why the result looks wrong", 2, 520, "action"),
            ("stages", "Stages: Sent, Expert reviewing, Answer ready", 2, 650, "system"),
            ("answer", "Answer: checked by, message, what to do now", 2, 765, "outcome"),
            ("reply", "Reply or send a new photo", 2, 900, "action"),
            ("retry", "'Could not send': Try again or Resend photo", 3, 260, "error"),
            ("share", "Share for research, renew consent or stop sharing", 3, 390, "action"),
            ("location", "Add or remove scan location (page 25)", 3, 520, "support"),
            ("delete", "Delete scan and confirm", 3, 650, "action"),
            ("deleted", "Removed here; deletion syncs to other devices", 3, 765, "system"),
        ],
        [
            ("open", "filter", "narrow", "down"),
            ("filter", "counts", "list", "down"),
            ("counts", "item", "choose", "down"),
            ("item", "details", "expand", "right"),
            ("details", "photo", "view", "down"),
            ("photo", "guide", "learn", "down"),
            ("guide", "dahon", "ask", "down"),
            ("details", "signed", "ask an expert", "right"),
            ("signed", "note", "yes", "down"),
            ("note", "stages", "send", "down"),
            ("stages", "answer", "ready", "down"),
            ("answer", "reply", "follow-up", "down"),
            ("delete", "deleted", "confirm", "down"),
        ],
        "Opening a new expert answer marks it seen on every device. Deleting a scan does not delete an approved research copy; see page 13.",
    )


def account_settings(file: ET.Element) -> None:
    detail_page(
        file, "account-settings", "24  Account: profile, photo, language and leaving",
        "The phone's Account tab for a signed-in farmer. Staff get the same profile, photo, language and sign-out controls.",
        ["ACCOUNT TAB", "PROFILE PHOTO", "NAME, EMAIL, PASSWORD", "SIGN OUT AND DELETE"],
        [
            ("open", "Open Account", 0, 260, "action"),
            ("language", "Language in the header: EN, Filipino, Bisaya", 0, 390, "support"),
            ("scans", "Your scans: saved, reviewed, waiting to sync", 0, 520, "support"),
            ("found", "Scans made while signed out found?", 0, 650, "decision"),
            ("add", "'Add to account': link them and send", 0, 765, "action"),
            ("privacy", "Privacy: who sees photos and location; policy", 0, 1035, "support"),
            ("avatar", "Tap the profile photo", 1, 260, "action"),
            ("modal", "View, add, change or remove the photo", 1, 390, "action"),
            ("remove", "Remove? Initials are shown instead", 1, 520, "decision"),
            ("everywhere", "New photo shows everywhere, also to staff", 1, 650, "outcome"),
            ("edit", "Edit name or email", 2, 260, "action"),
            ("email", "Email changed?", 2, 390, "decision"),
            ("verify", "Needs current password; verification link sent", 2, 520, "system"),
            ("password", "Change password: 8+ characters, mixed case, number, symbol", 2, 650, "action"),
            ("others", "Other signed-in devices are signed out", 2, 765, "outcome"),
            ("signout", "Sign out", 3, 260, "action"),
            ("pending", "Waiting scans or photos?", 3, 390, "decision"),
            ("send", "Send waiting scans first", 3, 520, "system"),
            ("discard", "Cannot send: 'Discard and sign out'?", 3, 650, "error"),
            ("delete", "Delete my account: confirm password", 3, 900, "action"),
            ("copies", "Also remove approved research photos?", 3, 1035, "decision"),
            ("gone", "Account and synced data deleted; device-only scans stay", 3, 1170, "outcome"),
        ],
        [
            ("open", "language", "header", "down"),
            ("language", "scans", "summary", "down"),
            ("scans", "found", "check", "down"),
            ("found", "add", "yes", "down"),
            ("avatar", "modal", "open", "down"),
            ("modal", "remove", "remove", "down"),
            ("remove", "everywhere", "confirm", "down"),
            ("edit", "email", "save", "down"),
            ("email", "verify", "yes", "down"),
            ("password", "others", "saved", "down"),
            ("signout", "pending", "check", "down"),
            ("pending", "send", "yes", "down"),
            ("send", "discard", "fails", "down"),
            ("delete", "copies", "choose", "down"),
            ("copies", "gone", "delete", "down"),
        ],
        "Signing out never silently drops scans: waiting scans are sent first, and the farmer must confirm before unsent changes are discarded.",
    )


def scan_location(file: ET.Element) -> None:
    detail_page(
        file, "scan-location", "25  Optional scan location",
        "A farmer may attach a rounded location to one saved scan so staff can see where a disease is spreading.",
        ["FARMER", "PHONE", "SERVER", "AGRICULTURIST / ADMIN"],
        [
            ("open", "Open a saved scan in History", 0, 260, "action"),
            ("add", "Add my location", 0, 390, "action"),
            ("permission", "Location permission granted?", 0, 520, "decision"),
            ("denied", "Denied: no location saved", 0, 650, "error"),
            ("remove", "Remove location", 0, 900, "action"),
            ("get", "Get the current position", 1, 520, "system"),
            ("round", "Round to 3 decimals (about 110 m)", 1, 650, "system"),
            ("shown", "'Location added: near ...'; View on map", 1, 765, "outcome"),
            ("save", "Saved on the phone and sent with sync", 2, 765, "data"),
            ("stored", "Server keeps only the rounded point", 2, 900, "data"),
            ("deleted", "Removal deletes it on the server too", 2, 1035, "system"),
            ("staff", "Staff see 'View on map' on the scan", 3, 900, "outcome"),
            ("purpose", "Used to see whether a disease spreads in an area", 3, 1035, "note"),
        ],
        [
            ("open", "add", "choose", "down"),
            ("add", "permission", "ask", "down"),
            ("permission", "denied", "no", "down"),
            ("permission", "get", "yes", "right"),
            ("get", "round", "privacy", "down"),
            ("round", "shown", "show", "down"),
            ("shown", "save", "store", "right"),
            ("save", "stored", "sync", "down"),
            ("stored", "staff", "visible", "right"),
            ("remove", "deleted", "remove", "right"),
        ],
        "Location is never added automatically; it is per scan and can be removed at any time from History.",
    )


def article_authoring(file: ET.Element) -> None:
    detail_page(
        file, "article-authoring", "26  Admin article authoring with photos",
        "Website Article Library editor: writing, photos with credits, references and publishing rules.",
        ["EDITOR", "PHOTOS", "REFERENCES", "SAVE AND PUBLISH"],
        [
            ("open", "Article Library: Add or Edit", 0, 260, "action"),
            ("fields", "Title, condition, topic, language, authors, summary", 0, 390, "action"),
            ("body", "Write text: '##' headings, '-' bullets", 0, 520, "action"),
            ("preview", "Preview the article", 0, 650, "support"),
            ("upload", "Add photo (JPG, PNG or WebP)", 1, 260, "action"),
            ("webp", "Server re-encodes to WebP, at most 1600 px", 1, 390, "system"),
            ("placed", "Photo line added to the text", 1, 520, "system"),
            ("credit", "Caption, credit, license and source links", 1, 650, "action"),
            ("move", "Move the photo line where it belongs", 1, 765, "support"),
            ("unphoto", "Remove photo: its line is removed too", 1, 900, "support"),
            ("search", "Search research sources", 2, 260, "action"),
            ("pick", "Tick references in citation order", 2, 390, "action"),
            ("missing", "Show what is missing", 2, 520, "error"),
            ("sources", "Add missing sources under Research Sources", 2, 650, "note"),
            ("status", "Status: Draft (hidden) or Published", 3, 260, "decision"),
            ("check", "Has a reference; photos credited and found?", 3, 390, "decision"),
            ("saved", "Saved; phones get it on their next connection", 3, 520, "outcome"),
            ("delete", "Delete article and confirm", 3, 900, "action"),
        ],
        [
            ("open", "fields", "fill in", "down"),
            ("fields", "body", "write", "down"),
            ("body", "preview", "check", "down"),
            ("upload", "webp", "upload", "down"),
            ("webp", "placed", "insert", "down"),
            ("placed", "credit", "describe", "down"),
            ("credit", "move", "arrange", "down"),
            ("search", "pick", "cite", "down"),
            ("status", "check", "published", "down"),
            ("check", "saved", "yes", "down"),
            ("check", "missing", "no", "left"),
        ],
        "Drafts can be saved without references. Publishing is refused until the article cites at least one source and every photo has a caption, credit and license.",
    )


def admin_accounts_audit(file: ET.Element) -> None:
    detail_page(
        file, "admin-accounts", "27  Admin accounts, diagnosis audit and research candidates",
        "Website administrator screens for people, scan records and dataset decisions.",
        ["ACCOUNTS", "ACCOUNT CHANGES", "DIAGNOSES", "RESEARCH CANDIDATES"],
        [
            ("open", "Accounts: Farmers or Agriculturists tab", 0, 260, "action"),
            ("search", "Search and open an account", 0, 390, "action"),
            ("create", "Create an agriculturist after checking qualifications", 0, 520, "action"),
            ("farmers", "Farmers register themselves; admins can also add them", 0, 650, "note"),
            ("edit", "Edit name, email, role or password", 1, 390, "action"),
            ("delete", "Delete account and confirm", 1, 520, "action"),
            ("rule", "Approved research copies follow page 13", 1, 650, "note"),
            ("verify", "Staff verify their email before using tools", 1, 765, "system"),
            ("list", "Diagnoses: filter the list", 2, 260, "action"),
            ("detail", "Original AI, agriculturist verdict, farmer notes", 2, 390, "outcome"),
            ("revisions", "Review revisions and advice", 2, 520, "support"),
            ("remove", "Delete diagnosis and confirm", 2, 650, "action"),
            ("noedit", "Admins cannot create or silently edit diagnoses", 2, 765, "note"),
            ("candidates", "Candidate dataset images", 3, 260, "action"),
            ("decide", "Approve, reject or mark uncertain", 3, 390, "decision"),
            ("copy", "Approval saves a separate private copy", 3, 520, "data"),
            ("audit", "Inspect copy audit; remove with reason", 3, 650, "action"),
        ],
        [
            ("open", "search", "find", "down"),
            ("search", "create", "new", "down"),
            ("search", "edit", "open", "right"),
            ("edit", "delete", "remove", "down"),
            ("delete", "rule", "research copies", "down"),
            ("list", "detail", "open", "down"),
            ("detail", "revisions", "history", "down"),
            ("revisions", "remove", "if needed", "down"),
            ("candidates", "decide", "review", "down"),
            ("decide", "copy", "approve", "down"),
            ("copy", "audit", "later", "down"),
        ],
        "The phone admin covers accounts, scans, disease knowledge and research sources; research-copy audit and the dataset decisions shown here are on the website.",
    )


def admin_insights(file: ET.Element) -> None:
    detail_page(
        file, "admin-insights", "28  Analytics and model comparison",
        "Website-only administrator views for monitoring scans, reviews and the two models.",
        ["DASHBOARD", "ANALYTICS", "MODEL COMPARISON", "SYSTEM"],
        [
            ("dashboard", "Dashboard: counts and recent activity", 0, 260, "action"),
            ("turnaround", "Review turnaround and overdue cases", 0, 390, "outcome"),
            ("activity", "Diagnoses over time; condition summary", 1, 260, "outcome"),
            ("agreement", "AI and agriculturist agreement, by confidence band", 1, 390, "outcome"),
            ("confused", "Most confused classes; disagreements by AI class", 1, 520, "outcome"),
            ("channels", "Mobile versus web scans", 1, 650, "outcome"),
            ("dataset", "Research dataset candidates", 1, 765, "outcome"),
            ("real", "Only recorded values; no invented performance figures", 1, 900, "note"),
            ("pick", "Select one banana leaf image", 2, 260, "action"),
            ("run", "Run baseline and proposed CA-MobileNetV3-Small", 2, 390, "system"),
            ("compare", "Side-by-side results", 2, 520, "outcome"),
            ("unsaved", "Research runs are not saved to farmer history", 2, 650, "note"),
            ("system", "System and model information (admin only)", 3, 260, "action"),
        ],
        [
            ("dashboard", "turnaround", "monitor", "down"),
            ("activity", "agreement", "compare", "down"),
            ("agreement", "confused", "inspect", "down"),
            ("confused", "channels", "split", "down"),
            ("channels", "dataset", "research", "down"),
            ("pick", "run", "run both", "down"),
            ("run", "compare", "results", "down"),
        ],
        "These views read existing records only. They never change a scan, a verdict or a research copy.",
    )


def connection_recovery(file: ET.Element) -> None:
    detail_page(
        file, "connection-recovery", "29  Connecting the phone and account recovery",
        "Linking the app to a server, signing in, resetting a password, verifying email and deleting an account from the web.",
        ["PHONE SETUP", "SIGN IN", "PASSWORD RESET", "EMAIL AND DELETION PAGES"],
        [
            ("first", "First launch: scanning works with no account or server", 0, 260, "outcome"),
            ("link", "Scan the QR code or open the connect link, or type the address in Account", 0, 390, "action"),
            ("reachable", "Server reachable?", 0, 520, "decision"),
            ("connected", "Connected: address saved", 0, 650, "outcome"),
            ("builtin", "'Use built-in address' resets it", 0, 900, "support"),
            ("error", "'Could not use that address'; try again", 1, 520, "error"),
            ("login", "Log in or sign up", 1, 650, "action"),
            ("test", "Test builds: one-tap test accounts", 1, 765, "support"),
            ("expired", "Session expired: sign in again; the tab resumes", 1, 900, "error"),
            ("noserver", "No server yet: 'Ask the person who set up the app'", 1, 1035, "error"),
            ("forgot", "Forgot password? Enter email", 2, 260, "action"),
            ("mail", "Email with a reset link", 2, 390, "system"),
            ("reset", "Reset page: set a new password", 2, 520, "action"),
            ("done", "Sign in with the new password", 2, 650, "outcome"),
            ("verify", "Open the email verification link", 3, 260, "action"),
            ("verified", "'Email verified' page", 3, 390, "outcome"),
            ("resend", "Resend the link from the app or website", 3, 520, "support"),
            ("deletion", "Public account-deletion page", 3, 650, "action"),
            ("form", "Email, password, optional research-copy removal", 3, 765, "action"),
            ("removed", "Account and scans removed", 3, 900, "outcome"),
        ],
        [
            ("first", "link", "connect", "down"),
            ("link", "reachable", "check", "down"),
            ("reachable", "connected", "yes", "down"),
            ("reachable", "error", "no", "right"),
            ("connected", "login", "sign in", "right"),
            ("login", "test", "test build", "down"),
            ("forgot", "mail", "request", "down"),
            ("mail", "reset", "open link", "down"),
            ("reset", "done", "saved", "down"),
            ("verify", "verified", "confirm", "down"),
            ("deletion", "form", "fill in", "down"),
            ("form", "removed", "confirm", "down"),
        ],
        "Farmers can scan and keep history without verifying email; verification is needed to recover the account, share photos for research and use staff tools.",
    )


if __name__ == "__main__":
    root = build()
    ET.indent(root, space="  ")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(root).write(OUTPUT, encoding="utf-8", xml_declaration=True)
    print(f"Wrote {OUTPUT} ({len(root.findall('diagram'))} pages)")
