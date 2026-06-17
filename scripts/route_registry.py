#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "config" / "routes.json"

@dataclass(frozen=True)
class Route:
    route: str
    file: str
    title: str
    description: str
    indexable: bool
    lastmod: str
    breadcrumbs: tuple[str, ...]
    application: dict[str, str] | None

    @property
    def path(self) -> Path:
        return ROOT / self.file


def load_registry() -> dict:
    data = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("routes"), list):
        raise ValueError("routes registry is invalid")
    return data


def load_routes(indexable_only: bool = False) -> list[Route]:
    data = load_registry()
    routes = []
    seen_routes = set()
    seen_files = set()
    for raw in data["routes"]:
        item = Route(
            route=str(raw["route"]),
            file=str(raw["file"]),
            title=str(raw["title"]),
            description=str(raw["description"]),
            indexable=bool(raw.get("indexable", True)),
            lastmod=str(raw["lastmod"]),
            breadcrumbs=tuple(str(value) for value in raw.get("breadcrumbs", [])),
            application=raw.get("application"),
        )
        if not item.route.startswith("/") or (item.route != "/" and not item.route.endswith("/")):
            raise ValueError(f"route is not normalized: {item.route}")
        if item.route in seen_routes or item.file in seen_files:
            raise ValueError(f"duplicate route entry: {item.route}")
        date.fromisoformat(item.lastmod)
        seen_routes.add(item.route)
        seen_files.add(item.file)
        if not indexable_only or item.indexable:
            routes.append(item)
    return routes


def site_url() -> str:
    return str(load_registry()["site"]).rstrip("/")


def og_image() -> str:
    return str(load_registry()["og_image"])


def public_pages(include_non_indexable: bool = True) -> list[str]:
    data = load_registry()
    pages = [route.file for route in load_routes()]
    if include_non_indexable:
        pages.extend(str(value) for value in data.get("non_indexable_pages", []))
    return pages


def route_map(indexable_only: bool = False) -> dict[str, Route]:
    return {route.route: route for route in load_routes(indexable_only=indexable_only)}
