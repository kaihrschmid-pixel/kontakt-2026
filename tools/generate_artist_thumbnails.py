#!/usr/bin/env python3

from __future__ import annotations

import argparse
import io
import sys
import unicodedata
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError


BASE_URL = "https://cfp.kntkt.de"
SCHEDULE_URL = "https://cfp.kntkt.de/kontakt-2026/schedule/export/schedule.xml"
SKIPPED_TRACKS = {"Team-Einreichung", "Soundcheck"}
SIZES = {
    "card": {"1x": (272, 240), "2x": (544, 480)},
    "hero": {"1x": (560, 280), "2x": (1120, 560)},
}


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "kontakt-2026-thumbnail-generator/1.0"},
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.read()


def text_from(parent: ET.Element, tag: str) -> str:
    child = parent.find(tag)
    if child is None or child.text is None:
        return ""
    return child.text.strip()


def parse_schedule(xml_bytes: bytes, base_url: str) -> list[dict]:
    root = ET.fromstring(xml_bytes)
    days = []
    for day_el in root.findall("day"):
        date = day_el.attrib.get("date", "")
        if not date:
            continue
        rooms = {}
        for room_el in day_el.findall("room"):
            room_name = room_el.attrib.get("name", "")
            if not room_name:
                continue
            events = []
            for event_el in room_el.findall("event"):
                track = text_from(event_el, "track")
                if track in SKIPPED_TRACKS:
                    continue
                persons = []
                persons_el = event_el.find("persons")
                if persons_el is not None:
                    for person_el in persons_el.findall("person"):
                        if person_el.text and person_el.text.strip():
                            persons.append(person_el.text.strip())
                logo = text_from(event_el, "logo")
                events.append(
                    {
                        "t": text_from(event_el, "title"),
                        "tr": (track.removesuffix(" regional") or None),
                        "s": text_from(event_el, "start") or "00:00",
                        "d": text_from(event_el, "duration") or "00:30",
                        "l": f"{base_url}{logo}" if logo else "",
                        "desc": text_from(event_el, "description").replace("None", "", 1),
                        "u": text_from(event_el, "url"),
                        "p": persons,
                        "room": room_name,
                        "date": date,
                    }
                )
            if events:
                rooms[room_name] = events
        if rooms:
            days.append({"date": date, "rooms": rooms})
    return days


def ascii_slug(value: str, max_length: int = 64) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    title = "".join(ch.lower() if ch.isalnum() else "-" for ch in normalized).strip("-")
    compact = "-".join(part for part in title.split("-") if part)[:max_length].rstrip("-")
    return compact or "event"


def event_slug(event: dict) -> str:
    room = ascii_slug(event["room"], max_length=24)
    title = ascii_slug(event["t"], max_length=48)
    return f"{event['date']}-{event['s'].replace(':', '')}-{room}-{title}"


def resized_copy(image: Image.Image, bounds: tuple[int, int]) -> Image.Image:
    rendered = ImageOps.exif_transpose(image)
    rendered.thumbnail(bounds, Image.Resampling.LANCZOS)
    return rendered


def save_variant(image: Image.Image, path: Path, bounds: tuple[int, int]) -> dict:
    rendered = resized_copy(image.copy(), bounds)
    path.parent.mkdir(parents=True, exist_ok=True)
    rendered.save(path, format="WEBP", quality=82, method=6)
    return {
        "path": path,
        "width": rendered.width,
        "height": rendered.height,
    }


def generate_images(output_dir: Path, schedule_url: str, base_url: str) -> tuple[int, int]:
    schedule_xml = fetch_bytes(schedule_url)
    days = parse_schedule(schedule_xml, base_url)
    total = 0
    generated = 0

    for day in days:
        for events in day["rooms"].values():
            for event in events:
                if not event["l"]:
                    continue
                total += 1
                try:
                    image_bytes = fetch_bytes(event["l"])
                    image = Image.open(io.BytesIO(image_bytes))
                    image.load()
                except (urllib.error.URLError, TimeoutError, UnidentifiedImageError, OSError) as exc:
                    print(f"skip {event['t']}: {exc}", file=sys.stderr)
                    continue

                slug = event_slug(event)

                for variant, density_bounds in SIZES.items():
                    one_x_file = output_dir / f"{slug}-{variant}.webp"
                    two_x_file = output_dir / f"{slug}-{variant}@2x.webp"
                    save_variant(image, one_x_file, density_bounds["1x"])
                    save_variant(image, two_x_file, density_bounds["2x"])
                generated += 1

    print(f"generated {generated}/{total} thumbnail sets")
    return generated, total


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate local artist thumbnails.")
    parser.add_argument("--schedule-url", default=SCHEDULE_URL)
    parser.add_argument("--base-url", default=BASE_URL)
    parser.add_argument("--output-dir", default="artist-images")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parent.parent
    output_dir = repo_root / args.output_dir

    generate_images(
        output_dir=output_dir,
        schedule_url=args.schedule_url,
        base_url=args.base_url,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
