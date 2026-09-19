"""Verify the model's citations against what was actually retrieved.

Without this the [Page 3] markers are just text the model chose to emit. With it,
a wrong citation is visible instead of convincing."""

import re

_BRACKET = re.compile(r"\[([^\][]+)\]")
# every "Page 3" / "Pages 3-4" run inside one bracket, since models happily write
# [report.pdf, Page 1, Page 8] with two page marks under a single filename
_PAGES = re.compile(r"Pages?\s+([\d\s,–-]*\d)", re.IGNORECASE)


def parse(answer: str) -> list[tuple[str, int]]:
    """Extract (filename, page) pairs. filename is '' when unqualified."""
    out = []
    for b in _BRACKET.finditer(answer):
        inner = b.group(1)
        runs = list(_PAGES.finditer(inner))
        if not runs:
            continue
        # the filename is whatever precedes the FIRST page mark, not the last
        fname = inner[: runs[0].start()].strip().rstrip(",").strip()
        for run in runs:
            for part in re.split(r"[,\s]+", run.group(1).strip()):
                for n in re.split(r"[–-]", part):
                    if n.isdigit():
                        out.append((fname, int(n)))
    return out


def verify(answer: str, hits: list[dict]) -> list[dict]:
    """Return the citations that do NOT match a retrieved chunk."""
    by_page = {(h["filename"], h["page_num"]) for h in hits}
    pages_only = {h["page_num"] for h in hits}
    bad, seen = [], set()
    for fname, page in parse(answer):
        ok = (fname, page) in by_page if fname else page in pages_only
        if not ok and (fname, page) not in seen:
            seen.add((fname, page))
            bad.append({"filename": fname or None, "page": page})
    return bad


def _self_check():
    hits = [{"filename": "a.pdf", "page_num": 3}, {"filename": "b.pdf", "page_num": 7}]
    assert parse("x [Page 3] y [b.pdf, Page 7]") == [("", 3), ("b.pdf", 7)]
    assert parse("see [Pages 3, 7]") == [("", 3), ("", 7)]
    assert parse("see [a.pdf, Pages 3-7]") == [("a.pdf", 3), ("a.pdf", 7)]

    # observed in the wild: two page marks sharing one filename in one bracket.
    # A naive regex reads the filename as "a.pdf, Page 3" and flags both as fake.
    assert parse("[a.pdf, Page 3, Page 7]") == [("a.pdf", 3), ("a.pdf", 7)]
    assert verify("[a.pdf, Page 3, Page 7]", hits) == [{"filename": "a.pdf", "page": 7}]

    assert verify("grounded [Page 3] and [b.pdf, Page 7]", hits) == []
    assert verify("invented [Page 99]", hits) == [{"filename": None, "page": 99}]
    # right page, wrong document -- the collision the filename label exists to catch
    assert verify("[a.pdf, Page 7]", hits) == [{"filename": "a.pdf", "page": 7}]
    assert verify("no citations at all", hits) == []
    assert verify("[1] a reference, not a citation", hits) == []
    assert len(verify("[Page 99] twice [Page 99]", hits)) == 1, "should dedupe"
    print("ok  citations: multi-page brackets, cross-document collisions, dedupe")


if __name__ == "__main__":
    _self_check()
