#!/usr/bin/env python3
"""Generate dist/artifact.html from public/index.html.

The preview host supplies its own <!doctype>/<html>/<head>/<body> shell, so the
preview build is just the two marked regions of the real page concatenated:
the <title>/<style> block, then the page body. One source, two outputs.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "index.html")
OUT = os.path.join(ROOT, "dist", "artifact.html")


def region(html: str, name: str) -> str:
    match = re.search(
        r"<!-- ARTIFACT:%s-START -->(.*?)<!-- ARTIFACT:%s-END -->" % (name, name),
        html,
        re.S,
    )
    if not match:
        sys.exit("error: missing ARTIFACT:%s markers in public/index.html" % name)
    return match.group(1).strip()


def main() -> None:
    html = open(SRC, encoding="utf-8").read()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write(region(html, "HEAD") + "\n\n" + region(html, "BODY") + "\n")
    print("wrote %s (%d KB)" % (OUT, os.path.getsize(OUT) // 1024))


if __name__ == "__main__":
    main()
