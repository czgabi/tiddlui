"""Relevance + popularity ranking for merged search results.

The engine widens recall by fanning out query variants; this re-orders the
combined pool the way a mainstream music app would:

  1. coverage bucket — results matching *all* the meaningful query words rank
     above partial matches, so an exact hit can't be buried under noise;
  2. within a bucket, **popularity** decides (Tidal only fills this in for
     reasonably-spelled queries — typo searches come back as 0, so we fall back
     to text relevance, which still favours the right track);
  3. matching the *artist* is rewarded, not just the title — naming the artist
     is a strong signal ("Levels" by Avicii over "Avici Levels (Remix)").

Accent- and apostrophe-insensitive throughout ("warrior's" == "warriors").
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

# Words too common to count toward coverage (they match almost anything).
_STOPWORDS = {
    "the", "a", "an", "of", "and", "or", "feat", "ft", "featuring", "with", "vs", "x",
}

# Match weights: exact word > close typo > loose substring; artist edges title.
_TITLE_W = {"word": 3.0, "edit": 2.6, "sub": 1.8}
_ARTIST_W = {"word": 3.5, "edit": 3.0, "sub": 1.6}
_BOTH_BONUS = 2.0  # query touches both title and artist


def _normalize(s: Any) -> str:
    s = str(s or "").lower()
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    s = s.replace("'", "").replace("’", "").replace("`", "")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _within_one_edit(a: str, b: str) -> bool:
    """True when a and b are within edit distance 1 (no full DP matrix)."""
    if a == b:
        return True
    la, lb = len(a), len(b)
    if abs(la - lb) > 1:
        return False
    i = j = edits = 0
    while i < la and j < lb:
        if a[i] == b[j]:
            i += 1
            j += 1
            continue
        edits += 1
        if edits > 1:
            return False
        if la > lb:
            i += 1
        elif lb > la:
            j += 1
        else:
            i += 1
            j += 1
    if i < la or j < lb:
        edits += 1
    return edits <= 1


def content_tokens(query: str) -> list[str]:
    """Normalized query words with filler ("the", "feat", …) dropped."""
    toks = [t for t in _normalize(query).split() if t]
    content = [t for t in toks if t not in _STOPWORDS]
    return content or toks  # all-stopword query: keep what we have


def _weight(token: str, words: list[str], whole: str, wmap: dict[str, float]) -> float:
    if token in words:
        return wmap["word"]
    if len(token) >= 4 and any(_within_one_edit(w, token) for w in words):
        return wmap["edit"]
    if token in whole:
        return wmap["sub"]
    return 0.0


def _evaluate(qtokens: list[str], title: str, artist: str) -> tuple[float, float]:
    title_words = title.split()
    artist_words = artist.split()
    score = 0.0
    covered = 0
    hit_title = hit_artist = False
    for tok in qtokens:
        st = _weight(tok, title_words, title, _TITLE_W)
        sa = _weight(tok, artist_words, artist, _ARTIST_W)
        if st or sa:
            covered += 1
            score += max(st, sa)
            hit_title = hit_title or bool(st)
            hit_artist = hit_artist or bool(sa)
    if hit_title and hit_artist:
        score += _BOTH_BONUS
    coverage = covered / len(qtokens) if qtokens else 0.0
    return score, coverage


def _item_artist(item: dict) -> str:
    parts = [item.get("artist") or ""]
    parts.extend(item.get("artists") or [])
    return " ".join(p for p in parts if p)


def rank(query: str, items: list[dict]) -> list[dict]:
    """Sort one result category by relevance, then popularity. Stable, pure."""
    qtokens = content_tokens(query)
    if not qtokens or not items:
        return items
    nquery = _normalize(query)

    def key(item: dict) -> tuple[int, float]:
        title = _normalize(item.get("title"))
        artist = _normalize(_item_artist(item))
        score, coverage = _evaluate(qtokens, title, artist)
        bucket = 3 if coverage >= 0.999 else 2 if coverage >= 0.5 else 1 if coverage > 0 else 0
        # Popularity only counts once a result is actually relevant, so a popular
        # but unrelated track can't jump a closer match.
        pop = (item.get("popularity") or 0) if coverage >= 0.5 else 0
        if nquery and nquery in title:  # whole query sits inside the title
            score += 4.0
        within = pop * 100 + score
        return (bucket, within)

    return sorted(items, key=key, reverse=True)
