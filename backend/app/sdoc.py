from __future__ import annotations

import hashlib
import json
from typing import Any


def fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


GRAMMAR_ELEMENTS: dict[str, list[tuple[str, bool]]] = {
    "FACT_REF": [("REF", True), ("REF_VERSION", True), ("DISPOSITION", True), ("AUTHOR", True), ("AT", True), ("STATEMENT", True)],
    "ENTITY_REF": [("REF", True), ("KIND", True), ("REF_VERSION", True), ("AUTHOR", True), ("AT", True), ("STATEMENT", True)],
    "STATEMENT": [("SUPPORTS", False), ("AUTHOR", True), ("AT", True), ("STATEMENT", True)],
    "QUERY": [("KIND", True), ("FILTER", True), ("COLUMNS", True), ("AUTHOR", True), ("AT", True), ("STATEMENT", True)],
    "FIGURE": [("REF", True), ("CAPTION", True), ("AUTHOR", True), ("AT", True), ("STATEMENT", True)],
    "TABLE": [("QUERY", True), ("COLUMNS", True), ("AUTHOR", True), ("AT", True), ("STATEMENT", True)],
}


def _grammar(elements: dict[str, list[tuple[str, bool]]]) -> str:
    lines = ["[GRAMMAR]", "ELEMENTS:"]
    for tag, fields in elements.items():
        lines.extend(
            [
                f"- TAG: {tag}",
                "  PROPERTIES:",
                "    VIEW_STYLE: Narrative",
                "  FIELDS:",
                "  - TITLE: MID",
                "    TYPE: String",
                "    REQUIRED: True",
            ]
        )
        for title, required in fields:
            lines.extend(
                [
                    f"  - TITLE: {title}",
                    "    TYPE: String",
                    f"    REQUIRED: {'True' if required else 'False'}",
                ]
            )
    return "\n".join(lines)


def _multiline(value: Any) -> list[str]:
    text = str(value or "—").replace("<<<", "‹‹‹")
    return [">>>", text, "<<<"]


def _node_statement(element: dict[str, Any]) -> str:
    if element["kind"] == "fact_ref":
        fact = element.get("resolved") or {}
        value = fact.get("value_text") or ""
        if fact.get("value_num") is not None:
            number = f"{fact['value_num']:g}" if isinstance(fact["value_num"], float) else str(fact["value_num"])
            value = " ".join(part for part in [value, number, fact.get("value_unit")] if part)
        return f"{fact.get('subject', 'Факт')}: {fact.get('predicate', '')} {value}".strip()
    if element["kind"] == "entity_ref":
        entity = element.get("resolved") or {}
        description = (entity.get("fields") or {}).get("description") or (entity.get("fields") or {}).get("interest") or entity.get("title")
        return f"{entity.get('code', '')} · {entity.get('title', '')}: {description}".strip()
    if element["kind"] == "statement":
        return element.get("text") or "—"
    if element["kind"] == "query":
        return "Динамический перечень формируется из сущностей по заданному фильтру."
    return element.get("text") or "Производный элемент документа."


def generate_structure_sdoc(document: dict[str, Any], grammar: str | None = None) -> str:
    lines = [
        "[DOCUMENT]",
        f"TITLE: {document['title']}",
        "OPTIONS:",
        "  ENABLE_MID: True",
        "  MARKUP: Text",
        "  AUTO_LEVELS: On",
        "",
        (grammar or _grammar(GRAMMAR_ELEMENTS)).strip(),
    ]
    for section in document["sections"]:
        lines.extend(["", "[[SECTION]]", f"MID: {section['id']}", f"TITLE: {section['no']} {section['title']}"])
        for element in section["elements"]:
            tag = element["kind"].upper()
            lines.extend(["", f"[{tag}]", f"MID: {element['id']}"])
            if tag == "FACT_REF":
                resolved = element.get("resolved") or {}
                lines.extend([
                    f"REF: {element['ref_id']}",
                    f"REF_VERSION: {resolved.get('version') or element.get('ref_version') or 1}",
                    f"DISPOSITION: {resolved.get('disposition', 'noted')}",
                    f"AUTHOR: {element['author']}",
                    f"AT: {element['at']}",
                    "STATEMENT: " + _multiline(_node_statement(element))[0],
                    *_multiline(_node_statement(element))[1:],
                ])
            elif tag == "ENTITY_REF":
                resolved = element.get("resolved") or {}
                lines.extend([
                    f"REF: {element['ref_id']}",
                    f"KIND: {resolved.get('kind', 'entity')}",
                    f"REF_VERSION: {resolved.get('version') or element.get('ref_version') or 1}",
                    f"AUTHOR: {element['author']}",
                    f"AT: {element['at']}",
                    "STATEMENT: " + _multiline(_node_statement(element))[0],
                    *_multiline(_node_statement(element))[1:],
                ])
            elif tag == "STATEMENT":
                lines.extend([
                    f"SUPPORTS: {', '.join(element.get('supports') or []) or '—'}",
                    f"AUTHOR: {element['author']}",
                    f"AT: {element['at']}",
                    "STATEMENT: " + _multiline(_node_statement(element))[0],
                    *_multiline(_node_statement(element))[1:],
                ])
            elif tag == "QUERY":
                query = element.get("query") or {}
                lines.extend([
                    f"KIND: {query.get('kind', 'entity')}",
                    f"FILTER: {query.get('filter', 'all')}",
                    f"COLUMNS: {', '.join(query.get('columns', []))}",
                    f"AUTHOR: {element['author']}",
                    f"AT: {element['at']}",
                    "STATEMENT: >>>",
                    _node_statement(element),
                    "<<<",
                ])
            elif tag == "FIGURE":
                lines.extend([
                    f"REF: {element.get('ref_id') or '—'}",
                    f"CAPTION: {element.get('text') or 'Иллюстрация'}",
                    f"AUTHOR: {element['author']}",
                    f"AT: {element['at']}",
                    "STATEMENT: >>>",
                    _node_statement(element),
                    "<<<",
                ])
            else:
                query = element.get("query") or {}
                lines.extend([
                    f"QUERY: {json.dumps(query, ensure_ascii=False)}",
                    f"COLUMNS: {', '.join(query.get('columns', [])) or '—'}",
                    f"AUTHOR: {element['author']}",
                    f"AT: {element['at']}",
                    "STATEMENT: >>>",
                    _node_statement(element),
                    "<<<",
                ])
        lines.extend(["", "[[/SECTION]]"])
    return "\n".join(lines) + "\n"


RENDER_GRAMMAR = {
    "TEXT": [("SOURCE_ELEMENTS", True), ("ENGINE", True), ("FINGERPRINT", True), ("STATEMENT", True)]
}


def generate_rendered_sdoc(document_title: str, rendering: dict[str, Any], grammar: str | None = None) -> str:
    lines = [
        "[DOCUMENT]",
        f"TITLE: {document_title} · изложение",
        "OPTIONS:",
        "  ENABLE_MID: True",
        "  MARKUP: Text",
        "  AUTO_LEVELS: On",
        "",
        (grammar or _grammar(RENDER_GRAMMAR)).strip(),
    ]
    for section in rendering["sections"]:
        links = sorted({link for item in section.get("element_links", []) for link in item.get("mids", [])})
        lines.extend([
            "",
            "[[SECTION]]",
            f"MID: render-{section['no'].replace('§', '')}",
            f"TITLE: {section['no']} {section['title']}",
            "",
            "[TEXT]",
            f"MID: rendered-{rendering['document_id']}-{section['no'].replace('§', '')}",
            f"SOURCE_ELEMENTS: {', '.join(links)}",
            f"ENGINE: {rendering['engine']}",
            f"FINGERPRINT: {rendering['prompt_fingerprint']}",
            "STATEMENT: >>>",
            section["text"].replace("<<<", "‹‹‹"),
            "<<<",
            "",
            "[[/SECTION]]",
        ])
    return "\n".join(lines) + "\n"
