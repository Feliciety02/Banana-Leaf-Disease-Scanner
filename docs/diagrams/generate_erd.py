"""Generate the DahonMD entity-relationship diagram from the real database schema.

The schema is read from a SQLite database that has every Laravel migration
applied, so the diagram always matches the migrations:

    cd backend
    php artisan migrate --force --database=sqlite   (with DB_DATABASE=<path>.sqlite)
    python ../docs/diagrams/generate_erd.py <path>.sqlite

Outputs dahonmd-erd.drawio (editable, two pages) and dahonmd-erd.svg (preview),
plus dahonmd-erd-simple.drawio/.svg with table names only.
Foreign keys come from the database; links the application keeps without a
database foreign key are listed in LOGICAL_LINKS and drawn dashed.
"""

from __future__ import annotations

import sqlite3
import sys
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from xml.etree import ElementTree as ET

HERE = Path(__file__).parent
DRAWIO = HERE / "dahonmd-erd.drawio"
SVG = HERE / "dahonmd-erd.svg"
SIMPLE_DRAWIO = HERE / "dahonmd-erd-simple.drawio"
SIMPLE_SVG = HERE / "dahonmd-erd-simple.svg"

# Simplified diagram: table names only, on a grid (column, row) chosen so
# related tables sit next to each other.
SIMPLE_W, SIMPLE_H = 240, 56
SIMPLE_COL = 420
# Row tops; the band between scans (row 2) and users (row 3) is taller because most links cross it.
SIMPLE_ROWS = [190, 360, 530, 800, 980]
SIMPLE_LAYOUT = {
    "disease_verifications": (1, 0), "disease_evidence": (3, 0), "research_sources": (4, 0), "article_research_source": (5, 0),
    "disease_symptoms": (1, 1), "diseases": (2, 1), "disease_management": (3, 1), "pesticide_regulatory_checks": (4, 1), "articles": (5, 1),
    "review_claims": (1, 2), "diagnoses": (2, 2), "diagnosis_reviews": (3, 2), "diagnosis_review_revisions": (4, 2),
    "diagnosis_sync_changes": (1, 3), "users": (2, 3), "dataset_candidates": (3, 3), "research_images": (4, 3),
    "personal_access_tokens": (1, 4), "sessions": (2, 4), "password_reset_tokens": (3, 4),
}

FRAMEWORK = ["cache", "cache_locks", "jobs", "job_batches", "failed_jobs", "migrations"]

# Relationships the code relies on without a database foreign key.
LOGICAL_LINKS = [
    ("research_images", "source_user_id", "users", "id", "kept after the account is deleted"),
    ("research_images", "source_diagnosis_id", "diagnoses", "id", "kept after the scan is deleted"),
    ("research_images", "source_candidate_id", "dataset_candidates", "id", "approval that created the copy"),
    ("diagnosis_sync_changes", "diagnosis_id", "diagnoses", "id", "sync log outlives deleted scans"),
    ("articles", "disease_key", "diseases", "model_class_key", "null = general article"),
    ("sessions", "user_id", "users", "id", "web session"),
    ("personal_access_tokens", "tokenable_id", "users", "id", "polymorphic tokenable (app sign-in)"),
    ("password_reset_tokens", "email", "users", "email", "reset by email"),
]

# Audit columns ("who did it") are drawn lighter than ownership links.
AUDIT_COLUMNS = {"created_by", "updated_by", "verified_by", "checked_by", "approved_by", "revoked_by", "reviewed_by", "proposed_by", "replaced_by"}

WIDTH = 270
ROW = 20
HEADER = 30

# (area title, fill, stroke, [(table, x, y)])
AREAS = [
    ("Accounts and sessions", "#EDF4FF", "#9DB6D8", [
        ("users", 40, 120), ("personal_access_tokens", 40, 400), ("sessions", 40, 660), ("password_reset_tokens", 40, 840),
    ]),
    ("Scans, reviews and sync", "#FFF5EE", "#E2B9A3", [
        ("diagnoses", 400, 120), ("review_claims", 400, 720), ("diagnosis_sync_changes", 400, 900),
        ("diagnosis_reviews", 760, 120), ("diagnosis_review_revisions", 760, 520),
    ]),
    ("Research images", "#F3EFFC", "#BCADE0", [
        ("dataset_candidates", 1120, 120), ("research_images", 1120, 380),
    ]),
    ("Disease knowledge and article library", "#EEF7F1", "#A9CDB8", [
        ("diseases", 1480, 120), ("disease_symptoms", 1840, 120), ("disease_management", 1840, 370),
        ("pesticide_regulatory_checks", 1840, 680), ("disease_evidence", 2200, 120), ("disease_verifications", 2200, 380),
        ("research_sources", 2200, 600), ("articles", 2560, 120), ("article_research_source", 2560, 500),
    ]),
]


def read_schema(path: str) -> dict:
    connection = sqlite3.connect(path)
    schema = {}
    for (table,) in connection.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name"):
        columns = [dict(name=r[1], type=(r[2] or "").lower(), notnull=bool(r[3]), pk=bool(r[5])) for r in connection.execute(f"pragma table_info('{table}')")]
        fks = [dict(column=r[3], table=r[2], ref=r[4], on_delete=r[6]) for r in connection.execute(f"pragma foreign_key_list('{table}')")]
        unique = set()
        for index in connection.execute(f"pragma index_list('{table}')").fetchall():
            names = [r[2] for r in connection.execute(f"pragma index_info('{index[1]}')")]
            if index[2] and len(names) == 1:
                unique.add(names[0])
        schema[table] = dict(columns=columns, fks=fks, unique=unique)
    return schema


def table_height(schema: dict, table: str) -> int:
    return HEADER + ROW * len(schema[table]["columns"])


def short_type(value: str) -> str:
    return {"tinyint(1)": "bool", "varchar": "string", "integer": "int"}.get(value, value)


def markers(schema: dict, table: str, column: dict) -> str:
    fk_columns = {fk["column"] for fk in schema[table]["fks"]} | {link[1] for link in LOGICAL_LINKS if link[0] == table}
    tags = []
    if column["pk"]:
        tags.append("PK")
    if column["name"] in fk_columns:
        tags.append("FK")
    if column["name"] in schema[table]["unique"] and not column["pk"]:
        tags.append("UQ")
    return " ".join(tags)


def relationships(schema: dict) -> list[dict]:
    links = []
    for table, info in schema.items():
        nullable = {c["name"]: not c["notnull"] for c in info["columns"]}
        for fk in info["fks"]:
            links.append(dict(child=table, column=fk["column"], parent=fk["table"], ref=fk["ref"], logical=False,
                              optional=nullable.get(fk["column"], True), one_to_one=fk["column"] in info["unique"],
                              note=f"on delete {fk['on_delete'].lower()}", audit=fk["column"] in AUDIT_COLUMNS))
    for child, column, parent, ref, note in LOGICAL_LINKS:
        if child in schema and parent in schema:
            nullable = {c["name"]: not c["notnull"] for c in schema[child]["columns"]}
            links.append(dict(child=child, column=column, parent=parent, ref=ref, logical=True, optional=nullable.get(column, True),
                              one_to_one=column in schema[child]["unique"], note=f"no FK: {note}", audit=False))
    return links


def table_html(schema: dict, table: str) -> str:
    rows = []
    for index, column in enumerate(schema[table]["columns"]):
        shade = "#FFFFFF" if index % 2 == 0 else "#F6F8F7"
        tag = markers(schema, table, column)
        weight = "bold" if column["pk"] else "normal"
        null = "" if column["notnull"] or column["pk"] else " ?"
        label = column['name'] + (" → users" if column['name'] in AUDIT_COLUMNS else "")
        rows.append(
            f"<tr style='background:{shade};height:{ROW}px'><td style='width:34px;color:#8A5A12;font-weight:bold;padding-left:6px'>{escape(tag)}</td>"
            f"<td style='font-weight:{weight};color:#1D2D24'>{escape(label)}</td>"
            f"<td style='color:#6B7571;text-align:right;padding-right:6px'>{escape(short_type(column['type']) + null)}</td></tr>"
        )
    return (f"<div style='font-weight:bold;color:#FFFFFF;background:#214F3A;height:{HEADER}px;line-height:{HEADER}px;text-align:center;font-size:14px'>{escape(table)}</div>"
            f"<table style='width:100%;border-collapse:collapse;font-size:11px;font-family:Arial'>{''.join(rows)}</table>")


def edge_style(link: dict) -> str:
    many = "ERzeroToOne" if link["one_to_one"] else "ERmany"
    one = "ERzeroToOne" if link["optional"] else "ERmandOne"
    color = "#9AA6A0" if link["audit"] else ("#7A6AA8" if link["logical"] else "#3F6B55")
    dashed = "dashed=1;" if link["logical"] or link["audit"] else ""
    return (f"edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;startArrow={many};startFill=0;endArrow={one};endFill=0;"
            f"strokeColor={color};strokeWidth={1 if link['audit'] else 2};fontSize=10;fontColor=#2A4E3A;labelBackgroundColor=#FFFFFF;{dashed}")


def build_drawio(schema: dict, links: list[dict]) -> ET.Element:
    root = ET.Element("mxfile", {"host": "app.diagrams.net", "modified": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                                 "agent": "DahonMD ERD generator", "version": "24.7.17", "type": "device", "pages": "2"})
    positions = {table: (x, y) for _, _, _, tables in AREAS for table, x, y in tables}

    def page(name: str, page_id: str, width: int, height: int):
        diagram = ET.SubElement(root, "diagram", {"id": page_id, "name": name})
        model = ET.SubElement(diagram, "mxGraphModel", {"dx": "1600", "dy": "900", "grid": "1", "gridSize": "10", "guides": "1", "tooltips": "1",
                                                         "connect": "1", "arrows": "1", "fold": "1", "page": "1", "pageScale": "1",
                                                         "pageWidth": str(width), "pageHeight": str(height), "math": "0", "shadow": "0"})
        cells = ET.SubElement(model, "root")
        ET.SubElement(cells, "mxCell", {"id": "0"})
        ET.SubElement(cells, "mxCell", {"id": "1", "parent": "0"})
        return cells

    def vertex(cells, key, value, style, x, y, w, h):
        cell = ET.SubElement(cells, "mxCell", {"id": key, "value": value, "style": style, "vertex": "1", "parent": "1"})
        ET.SubElement(cell, "mxGeometry", {"x": str(x), "y": str(y), "width": str(w), "height": str(h), "as": "geometry"})

    table_style = "shape=rect;html=1;whiteSpace=wrap;overflow=fill;align=left;verticalAlign=top;spacing=0;fillColor=#FFFFFF;strokeColor=#214F3A;strokeWidth=1.5;rounded=0;"

    cells = page("DahonMD ERD", "erd", 2900, 1260)
    vertex(cells, "title", "DahonMD  |  Entity-relationship diagram", "text;html=1;fontSize=28;fontStyle=1;fontColor=#153B2C;", 40, 20, 1200, 44)
    vertex(cells, "subtitle", escape("Generated from the migrated database. Solid lines: foreign keys. Purple dashed: links kept in code without a foreign key. Audit columns ('→ users') are foreign keys to users, labelled instead of drawn. PK primary key, FK foreign key, UQ unique, ? nullable."),
           "text;html=1;fontSize=13;fontColor=#54656C;whiteSpace=wrap;", 40, 62, 2400, 30)
    for index, (title, fill, stroke, tables) in enumerate(AREAS):
        xs = [x for _, x, _ in tables]
        bottom = max(y + table_height(schema, t) for t, _, y in tables)
        x0, x1 = min(xs) - 20, max(xs) + WIDTH + 20
        vertex(cells, f"area_{index}", escape(title), f"rounded=1;arcSize=2;html=1;fillColor={fill};strokeColor={stroke};verticalAlign=top;align=left;spacingLeft=12;spacingTop=6;fontSize=15;fontStyle=1;fontColor=#33463C;", x0, 92, x1 - x0, bottom - 92 + 30)
    for table, (x, y) in positions.items():
        vertex(cells, f"t_{table}", table_html(schema, table), table_style, x, y, WIDTH, table_height(schema, table))
    for index, link in enumerate(links):
        if link["audit"] or link["child"] not in positions or link["parent"] not in positions:
            continue
        cell = ET.SubElement(cells, "mxCell", {"id": f"r{index}", "value": escape(link["column"]), "style": edge_style(link), "edge": "1", "parent": "1",
                                               "source": f"t_{link['child']}", "target": f"t_{link['parent']}"})
        cell.set("tooltip", f"{link['child']}.{link['column']} → {link['parent']}.{link['ref']} ({link['note']})")
        ET.SubElement(cell, "mxGeometry", {"relative": "1", "as": "geometry"})

    cells = page("Laravel system tables", "framework", 1600, 700)
    vertex(cells, "title2", "Laravel system tables (no links to the domain)", "text;html=1;fontSize=24;fontStyle=1;fontColor=#153B2C;", 40, 20, 1200, 40)
    for index, table in enumerate(t for t in FRAMEWORK if t in schema):
        vertex(cells, f"f_{table}", table_html(schema, table), table_style, 40 + (index % 5) * 300, 90 + (index // 5) * 300, WIDTH, table_height(schema, table))
    return root


def build_svg(schema: dict, links: list[dict]) -> str:
    positions = {table: (x, y) for _, _, _, tables in AREAS for table, x, y in tables}
    width, height = 2900, 1260
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" font-family="Arial">',
           f'<rect width="{width}" height="{height}" fill="#FFFFFF"/>',
           '<text x="40" y="52" font-size="28" font-weight="bold" fill="#153B2C">DahonMD | Entity-relationship diagram</text>',
           '<text x="40" y="82" font-size="13" fill="#54656C">Solid: foreign key. Purple dashed: link kept in code without a foreign key. "→ users": audit foreign key, labelled instead of drawn. '
           'Crow\'s foot = many, bar = one, circle = optional. PK primary key, FK foreign key, UQ unique, ? nullable.</text>']
    for title, fill, stroke, tables in AREAS:
        xs = [x for _, x, _ in tables]
        bottom = max(y + table_height(schema, t) for t, _, y in tables)
        x0, x1 = min(xs) - 20, max(xs) + WIDTH + 20
        out.append(f'<rect x="{x0}" y="92" width="{x1 - x0}" height="{bottom - 62}" rx="8" fill="{fill}" stroke="{stroke}"/>')
        out.append(f'<text x="{x0 + 12}" y="112" font-size="15" font-weight="bold" fill="#33463C">{escape(title)}</text>')
    lines = []
    for link in links:
        if link["audit"] or link["child"] not in positions or link["parent"] not in positions:
            continue
        cx, cy = positions[link["child"]]; px, py = positions[link["parent"]]
        ch, ph = table_height(schema, link["child"]), table_height(schema, link["parent"])
        col_names = [c["name"] for c in schema[link["child"]]["columns"]]
        ref_names = [c["name"] for c in schema[link["parent"]]["columns"]]
        y1 = cy + HEADER + ROW * col_names.index(link["column"]) + ROW / 2 if link["column"] in col_names else cy + ch / 2
        y2 = py + HEADER + ROW * ref_names.index(link["ref"]) + ROW / 2 if link["ref"] in ref_names else py + ph / 2
        if px > cx:
            x1, x2, side1, side2 = cx + WIDTH, px, 1, -1
        elif px < cx:
            x1, x2, side1, side2 = cx, px + WIDTH, -1, 1
        else:
            x1, x2, side1, side2 = cx + WIDTH, px + WIDTH, 1, 1
        mid = (x1 + x2) / 2 if px != cx else x1 + 24
        color = "#9AA6A0" if link["audit"] else ("#7A6AA8" if link["logical"] else "#3F6B55")
        dash = ' stroke-dasharray="6 4"' if link["logical"] or link["audit"] else ""
        stroke_width = 1 if link["audit"] else 1.8
        lines.append(f'<polyline points="{x1},{y1} {mid},{y1} {mid},{y2} {x2},{y2}" fill="none" stroke="{color}" stroke-width="{stroke_width}"{dash}/>')
        # Crow's foot (many) at the child end, bar (one) at the parent end; circle when optional / zero-to-one.
        if link["one_to_one"]:
            lines.append(f'<line x1="{x1 + side1 * 10}" y1="{y1 - 6}" x2="{x1 + side1 * 10}" y2="{y1 + 6}" stroke="{color}" stroke-width="1.8"/>')
        else:
            for dy in (-6, 0, 6):
                lines.append(f'<line x1="{x1}" y1="{y1 + dy}" x2="{x1 + side1 * 12}" y2="{y1}" stroke="{color}" stroke-width="1.5"/>')
        lines.append(f'<line x1="{x2 + side2 * 8}" y1="{y2 - 6}" x2="{x2 + side2 * 8}" y2="{y2 + 6}" stroke="{color}" stroke-width="1.8"/>')
        if link["optional"]:
            lines.append(f'<circle cx="{x2 + side2 * 16}" cy="{y2}" r="4" fill="#FFFFFF" stroke="{color}" stroke-width="1.5"/>')
    out.extend(lines)
    for table, (x, y) in positions.items():
        columns = schema[table]["columns"]
        out.append(f'<rect x="{x}" y="{y}" width="{WIDTH}" height="{table_height(schema, table)}" fill="#FFFFFF" stroke="#214F3A" stroke-width="1.5"/>')
        out.append(f'<rect x="{x}" y="{y}" width="{WIDTH}" height="{HEADER}" fill="#214F3A"/>')
        out.append(f'<text x="{x + WIDTH / 2}" y="{y + 20}" font-size="14" font-weight="bold" fill="#FFFFFF" text-anchor="middle">{escape(table)}</text>')
        for index, column in enumerate(columns):
            ry = y + HEADER + ROW * index
            if index % 2:
                out.append(f'<rect x="{x + 1}" y="{ry}" width="{WIDTH - 2}" height="{ROW}" fill="#F6F8F7"/>')
            null = "" if column["notnull"] or column["pk"] else " ?"
            out.append(f'<text x="{x + 6}" y="{ry + 14}" font-size="10" font-weight="bold" fill="#8A5A12">{escape(markers(schema, table, column))}</text>')
            label = column["name"] + (" → users" if column["name"] in AUDIT_COLUMNS else "")
            out.append(f'<text x="{x + 44}" y="{ry + 14}" font-size="11" fill="#1D2D24" font-weight="{"bold" if column["pk"] else "normal"}">{escape(label)}</text>')
            out.append(f'<text x="{x + WIDTH - 6}" y="{ry + 14}" font-size="10" fill="#6B7571" text-anchor="end">{escape(short_type(column["type"]) + null)}</text>')
    out.append("</svg>")
    return "".join(out)


def simple_area(table: str) -> tuple[str, str, str]:
    """(fill, stroke, ink) of the area a table belongs to."""
    colors = [("#EDF4FF", "#5078AF", "#244263"), ("#FFF0E8", "#BB5937", "#5B2B1B"), ("#EEEAFB", "#7965AC", "#433467"), ("#EAF6EF", "#3E8C66", "#1B4C35")]
    for index, (_, _, _, tables) in enumerate(AREAS):
        if table in {name for name, _, _ in tables}:
            return colors[index]
    return colors[0]


def simple_box(table: str) -> tuple[int, int, int, int]:
    col, row = SIMPLE_LAYOUT[table]
    return 60 + (col - 1) * SIMPLE_COL, SIMPLE_ROWS[row], SIMPLE_W, SIMPLE_H


def _crosses(path, boxes, skip, margin: float = 0) -> bool:
    for key, (x, y, w, h) in boxes.items():
        if key in skip:
            continue
        x, y, w, h = x - margin, y - margin, w + 2 * margin, h + 2 * margin
        for (x1, y1), (x2, y2) in zip(path, path[1:]):
            if min(x1, x2) < x + w - 1 and max(x1, x2) > x + 1 and min(y1, y2) < y + h - 1 and max(y1, y2) > y + 1:
                return True
    return False


def simple_route(child: str, parent: str, boxes: dict, used: list) -> tuple[str, list[tuple[float, float]]]:
    """Ports and full path (including both ends) for a child -> parent line that
    avoids other boxes, preferring short routes and lanes not used yet."""
    sx, sy, sw, sh = boxes[child]
    tx, ty, tw, th = boxes[parent]
    sides = {
        "right": lambda x, y, w, h, f: (x + w, y + h * f), "left": lambda x, y, w, h, f: (x, y + h * f),
        "top": lambda x, y, w, h, f: (x + w * f, y), "bottom": lambda x, y, w, h, f: (x + w * f, y + h),
    }
    candidates = []
    fractions = (0.5, 0.3, 0.7)
    for s_side, s_frac, t_side, t_frac in ((a1, f1, a2, f2) for a1 in sides for f1 in fractions for a2 in sides for f2 in fractions):
        if True:
            a = sides[s_side](sx, sy, sw, sh, s_frac)
            b = sides[t_side](tx, ty, tw, th, t_frac)
            horizontal_start = s_side in ("right", "left")
            options = []
            if horizontal_start and t_side in ("right", "left"):
                for mid in {(a[0] + b[0]) / 2, a[0] + (30 if s_side == "right" else -30), b[0] + (30 if t_side == "right" else -30),
                            a[0] + (50 if s_side == "right" else -50), b[0] + (50 if t_side == "right" else -50)}:
                    options.append([a, (mid, a[1]), (mid, b[1]), b])
            elif not horizontal_start and t_side in ("top", "bottom"):
                for mid in {(a[1] + b[1]) / 2, a[1] + (30 if s_side == "bottom" else -30), b[1] + (30 if t_side == "bottom" else -30),
                            a[1] + (55 if s_side == "bottom" else -55), b[1] + (55 if t_side == "bottom" else -55)}:
                    options.append([a, (a[0], mid), (b[0], mid), b])
            elif horizontal_start:
                options.append([a, (b[0], a[1]), b])
            else:
                options.append([a, (a[0], b[1]), b])
            for path in options:
                # The line must leave and enter on the outside of each box.
                out_ok = {"right": path[1][0] >= a[0], "left": path[1][0] <= a[0], "top": path[1][1] <= a[1], "bottom": path[1][1] >= a[1]}[s_side]
                in_ok = {"right": path[-2][0] >= b[0], "left": path[-2][0] <= b[0], "top": path[-2][1] <= b[1], "bottom": path[-2][1] >= b[1]}[t_side]
                if not (out_ok and in_ok) or _crosses(path, boxes, {child, parent}, 14) or _hugs_own(path, boxes[child], boxes[parent]):
                    continue
                length = sum(abs(x2 - x1) + abs(y2 - y1) for (x1, y1), (x2, y2) in zip(path, path[1:]))
                overlap = sum(1 for seg in zip(path, path[1:]) for other in used if _same_lane(seg, other))
                crossings = sum(1 for seg in zip(path, path[1:]) for other in used if _intersects(seg, other))
                bends = len(path) - 2
                # Two lines must not meet at the same point on a box side.
                shared = sum(1 for point in (a, b) if any(abs(point[0] - q[0]) < 8 and abs(point[1] - q[1]) < 8 for seg in used for q in seg))
                off_center = (s_frac != 0.5) + (t_frac != 0.5)
                candidates.append((overlap * 500 + crossings * 120 + shared * 600 + length + bends * 40 + off_center * 15, s_side, s_frac, t_side, t_frac, path))
    if not candidates:
        a = sides["right"](sx, sy, sw, sh); b = sides["left"](tx, ty, tw, th)
        return "exitX=1;exitY=0.5;entryX=0;entryY=0.5;", [a, ((a[0] + b[0]) / 2, a[1]), ((a[0] + b[0]) / 2, b[1]), b]
    _, s_side, s_frac, t_side, t_frac, path = min(candidates, key=lambda item: item[0])
    used.extend(zip(path, path[1:]))
    position = {"right": lambda f: (1, f), "left": lambda f: (0, f), "top": lambda f: (f, 0), "bottom": lambda f: (f, 1)}
    (ex, ey), (nx, ny) = position[s_side](s_frac), position[t_side](t_frac)
    return f"exitX={ex};exitY={ey};entryX={nx};entryY={ny};", path


def _hugs_own(path, source_box, target_box) -> bool:
    """True when a middle segment runs inside the margin of its own end boxes."""
    middle = list(zip(path, path[1:]))[1:-1]
    return any(_crosses([a, b], {"s": source_box, "t": target_box}, set(), 10) for a, b in middle)


def _intersects(seg, other) -> bool:
    (x1, y1), (x2, y2) = seg
    (u1, v1), (u2, v2) = other
    if x1 == x2 and v1 == v2:
        return min(u1, u2) < x1 < max(u1, u2) and min(y1, y2) < v1 < max(y1, y2)
    if y1 == y2 and u1 == u2:
        return min(x1, x2) < u1 < max(x1, x2) and min(v1, v2) < y1 < max(v1, v2)
    return False


def _same_lane(seg, other) -> bool:
    """Parallel segments closer than 12 px count as sharing a lane."""
    (x1, y1), (x2, y2) = seg
    (u1, v1), (u2, v2) = other
    if x1 == x2 and u1 == u2 and abs(x1 - u1) < 12:
        return min(y1, y2) < max(v1, v2) and min(v1, v2) < max(y1, y2)
    if y1 == y2 and v1 == v2 and abs(y1 - v1) < 12:
        return min(x1, x2) < max(u1, u2) and min(u1, u2) < max(x1, x2)
    return False


def label_spot(path, label, taken, boxes) -> tuple[float, float]:
    """A point on the line where the label overlaps no other label or table."""
    half_w, half_h = len(label) * 3.3 + 4, 9
    segments = sorted(zip(path, path[1:]), key=lambda seg: -(abs(seg[1][0] - seg[0][0]) + abs(seg[1][1] - seg[0][1])))
    for (x1, y1), (x2, y2) in segments:
        for t in (0.5, 0.35, 0.65, 0.2, 0.8):
            x, y = x1 + (x2 - x1) * t, y1 + (y2 - y1) * t
            rect = (x - half_w, y - half_h, x + half_w, y + half_h)
            clash = any(rect[0] < r[2] and r[0] < rect[2] and rect[1] < r[3] and r[1] < rect[3] for r in taken)
            inside = any(rect[0] < bx + bw and bx < rect[2] and rect[1] < by + bh and by < rect[3] for bx, by, bw, bh in boxes.values())
            if not clash and not inside:
                taken.append(rect)
                return x, y
    (x1, y1), (x2, y2) = segments[0]
    return (x1 + x2) / 2, (y1 + y2) / 2


def build_simple(schema: dict, links: list[dict]) -> tuple[ET.Element, str]:
    boxes = {table: simple_box(table) for table in SIMPLE_LAYOUT}
    shown = [link for link in links if not link["audit"] and link["child"] in boxes and link["parent"] in boxes]
    width = 60 + 4 * SIMPLE_COL + SIMPLE_W + 60
    height = SIMPLE_ROWS[-1] + SIMPLE_H + 90
    used: list = []
    def distance(link):
        (ax, ay, _, _), (bx, by, _, _) = boxes[link["child"]], boxes[link["parent"]]
        return abs(ax - bx) + abs(ay - by) + (10000 if link["logical"] else 0)
    routes = [(link, *simple_route(link["child"], link["parent"], boxes, used)) for link in sorted(shown, key=distance)]
    audit_targets = sorted({f"{link['child']}.{link['column']}" for link in links if link["audit"]})

    root = ET.Element("mxfile", {"host": "app.diagrams.net", "modified": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                                 "agent": "DahonMD ERD generator", "version": "24.7.17", "type": "device", "pages": "1"})
    diagram = ET.SubElement(root, "diagram", {"id": "erd-simple", "name": "DahonMD ERD (simplified)"})
    model = ET.SubElement(diagram, "mxGraphModel", {"dx": "1600", "dy": "900", "grid": "1", "gridSize": "10", "guides": "1", "tooltips": "1",
                                                     "connect": "1", "arrows": "1", "fold": "1", "page": "1", "pageScale": "1",
                                                     "pageWidth": str(width), "pageHeight": str(height), "math": "0", "shadow": "0"})
    cells = ET.SubElement(model, "root")
    ET.SubElement(cells, "mxCell", {"id": "0"})
    ET.SubElement(cells, "mxCell", {"id": "1", "parent": "0"})

    def vertex(key, value, style, x, y, w, h):
        cell = ET.SubElement(cells, "mxCell", {"id": key, "value": value, "style": style, "vertex": "1", "parent": "1"})
        ET.SubElement(cell, "mxGeometry", {"x": str(x), "y": str(y), "width": str(w), "height": str(h), "as": "geometry"})

    subtitle = ("Table names only. Crow's foot = many, bar = one, circle = optional; the label is the linking column. "
                "Purple dashed: link kept in code without a foreign key. Audit columns (created_by, approved_by ...) also point to users and are not drawn.")
    vertex("title", "DahonMD  |  Entity-relationship diagram (simplified)", "text;html=1;fontSize=28;fontStyle=1;fontColor=#153B2C;", 40, 20, 1400, 44)
    vertex("subtitle", escape(subtitle), "text;html=1;fontSize=13;fontColor=#54656C;whiteSpace=wrap;", 40, 64, width - 80, 36)
    for index, (title, _, _, _) in enumerate(AREAS):
        fill, stroke, ink = simple_area(AREAS[index][3][0][0])
        vertex(f"key_{index}", escape(title), f"rounded=1;html=1;whiteSpace=wrap;fillColor={fill};strokeColor={stroke};fontColor={ink};fontSize=13;fontStyle=1;", 40 + index * 330, 112, 310, 34)
    for table, (x, y, w, h) in boxes.items():
        fill, stroke, ink = simple_area(table)
        vertex(f"t_{table}", escape(table), f"rounded=1;html=1;whiteSpace=wrap;fillColor={fill};strokeColor={stroke};strokeWidth=2;fontColor={ink};fontSize=15;fontStyle=1;", x, y, w, h)
    for index, (link, ports, path) in enumerate(routes):
        style = edge_style(link).replace("edgeStyle=orthogonalEdgeStyle;", "edgeStyle=orthogonalEdgeStyle;") + ports
        cell = ET.SubElement(cells, "mxCell", {"id": f"r{index}", "value": escape(link["column"]), "style": style, "edge": "1", "parent": "1",
                                               "source": f"t_{link['child']}", "target": f"t_{link['parent']}"})
        cell.set("tooltip", f"{link['child']}.{link['column']} → {link['parent']}.{link['ref']} ({link['note']})")
        geometry = ET.SubElement(cell, "mxGeometry", {"relative": "1", "as": "geometry"})
        bends = ET.SubElement(geometry, "Array", {"as": "points"})
        for x, y in path[1:-1]:
            ET.SubElement(bends, "mxPoint", {"x": str(round(x)), "y": str(round(y))})

    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" font-family="Arial">',
           f'<rect width="{width}" height="{height}" fill="#FFFFFF"/>',
           '<text x="40" y="52" font-size="28" font-weight="bold" fill="#153B2C">DahonMD | Entity-relationship diagram (simplified)</text>',
           f'<text x="40" y="88" font-size="13" fill="#54656C">{escape(subtitle)}</text>']
    for index, (title, _, _, _) in enumerate(AREAS):
        fill, stroke, ink = simple_area(AREAS[index][3][0][0])
        out.append(f'<rect x="{40 + index * 330}" y="112" width="310" height="34" rx="8" fill="{fill}" stroke="{stroke}"/>')
        out.append(f'<text x="{40 + index * 330 + 155}" y="134" font-size="13" font-weight="bold" fill="{ink}" text-anchor="middle">{escape(title)}</text>')
    labels: list = []
    for link, _, path in routes:
        color = "#7A6AA8" if link["logical"] else "#3F6B55"
        dash = ' stroke-dasharray="7 5"' if link["logical"] else ""
        out.append(f'<polyline points="{" ".join(f"{x},{y}" for x, y in path)}" fill="none" stroke="{color}" stroke-width="2"{dash}/>')
        (ax, ay), (nx, ny) = path[0], path[1]
        (bx, by), (px, py) = path[-1], path[-2]
        ux, uy = (1 if nx > ax else -1 if nx < ax else 0), (1 if ny > ay else -1 if ny < ay else 0)
        vx, vy = (1 if px > bx else -1 if px < bx else 0), (1 if py > by else -1 if py < by else 0)
        if link["one_to_one"]:
            out.append(f'<line x1="{ax + ux * 10 - uy * 6}" y1="{ay + uy * 10 - ux * 6}" x2="{ax + ux * 10 + uy * 6}" y2="{ay + uy * 10 + ux * 6}" stroke="{color}" stroke-width="2"/>')
        else:
            for spread in (-7, 0, 7):
                out.append(f'<line x1="{ax - uy * spread}" y1="{ay - ux * spread}" x2="{ax + ux * 13}" y2="{ay + uy * 13}" stroke="{color}" stroke-width="1.6"/>')
        out.append(f'<line x1="{bx + vx * 9 - vy * 7}" y1="{by + vy * 9 - vx * 7}" x2="{bx + vx * 9 + vy * 7}" y2="{by + vy * 9 + vx * 7}" stroke="{color}" stroke-width="2"/>')
        if link["optional"]:
            out.append(f'<circle cx="{bx + vx * 18}" cy="{by + vy * 18}" r="4.5" fill="#FFFFFF" stroke="{color}" stroke-width="1.6"/>')
        label = link["column"]
        lx, ly = label_spot(path, label, labels, boxes)
        out.append(f'<rect x="{lx - len(label) * 3.3 - 3}" y="{ly - 8}" width="{len(label) * 6.6 + 6}" height="15" fill="#FFFFFF" opacity="0.92"/>')
        out.append(f'<text x="{lx}" y="{ly + 4}" font-size="11" fill="{color}" text-anchor="middle">{escape(label)}</text>')
    for table, (x, y, w, h) in boxes.items():
        fill, stroke, ink = simple_area(table)
        out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="9" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
        out.append(f'<text x="{x + w / 2}" y="{y + h / 2 + 5}" font-size="15" font-weight="bold" fill="{ink}" text-anchor="middle">{escape(table)}</text>')
    out.append("</svg>")
    crossing = [link["column"] for link, _, path in routes if _crosses(path, boxes, {link["child"], link["parent"]})]
    if crossing:
        raise SystemExit(f"Simplified ERD lines cross tables: {', '.join(crossing)}")
    return root, "".join(out)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python generate_erd.py <migrated-database.sqlite>")
    schema = read_schema(sys.argv[1])
    placed = {table for _, _, _, tables in AREAS for table, _, _ in tables}
    missing = sorted(set(schema) - placed - set(FRAMEWORK) - {"migrations"})
    if missing:
        raise SystemExit(f"Tables without a place in AREAS: {', '.join(missing)}")
    links = relationships(schema)
    root = build_drawio(schema, links)
    ET.indent(root, space="  ")
    ET.ElementTree(root).write(DRAWIO, encoding="utf-8", xml_declaration=True)
    SVG.write_text(build_svg(schema, links), encoding="utf-8")
    missing_simple = sorted(placed - set(SIMPLE_LAYOUT))
    if missing_simple:
        raise SystemExit(f"Tables without a place in SIMPLE_LAYOUT: {', '.join(missing_simple)}")
    simple_root, simple_svg = build_simple(schema, links)
    ET.indent(simple_root, space="  ")
    ET.ElementTree(simple_root).write(SIMPLE_DRAWIO, encoding="utf-8", xml_declaration=True)
    SIMPLE_SVG.write_text(simple_svg, encoding="utf-8")
    print(f"Wrote {DRAWIO.name} and {SVG.name}: {len(placed)} domain tables, {sum(not l['logical'] for l in links)} foreign keys ({sum(l['audit'] for l in links)} audit, labelled), {sum(l['logical'] for l in links)} code-only links")


if __name__ == "__main__":
    main()
