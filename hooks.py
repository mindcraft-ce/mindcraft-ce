"""
MkDocs hook: generates docs/index.md from README.md with three transformations:

1. Demote headings by one level (h1→h2, h2→h3, …, h5→h6) so that Material for
   MkDocs correctly populates the Table of Contents sidebar. Material treats h1
   as the page title and excludes it from the TOC. Since README.md uses multiple
   h1 sections, demoting them to h2 ensures every major section appears as a
   top-level TOC entry.

2. Rewrite docs/-prefixed links (docs/FAQ.md#anchor → FAQ.md#anchor) so they
   resolve correctly from within docs/index.md.

3. Rewrite remaining relative file links (settings.js, services/viaproxy/README.md)
   to absolute GitHub blob URLs so they work on the website while keeping README.md
   links working on GitHub natively.
"""

import re


def on_pre_build(config, **kwargs):
    with open("README.md", "r", encoding="utf-8") as f:
        content = f.read()

    # Demote headings from bottom up to avoid double-demoting.
    # h5→h6, h4→h5, h3→h4, h2→h3, h1→h2
    for level in range(5, 0, -1):
        content = re.sub(
            r"^" + "#" * level + r" ",
            "#" * (level + 1) + " ",
            content,
            flags=re.MULTILINE,
        )

    # Rewrite docs/-prefixed links so they resolve correctly from within docs/
    # e.g. docs/FAQ.md#anchor -> FAQ.md#anchor
    content = re.sub(r'\(docs/([^)]+)\)', r'(\1)', content)

    # Rewrite any remaining relative file links (not anchors, not external) to
    # absolute GitHub blob URLs so they work on the website.
    github_blob = "https://github.com/mindcraft-ce/mindcraft-ce/blob/develop/"
    content = re.sub(
        r'\((?!https?://)(?!#)(?!docs/)([^)]+\.[a-zA-Z][^)]*)\)',
        lambda m: f'({github_blob}{m.group(1)})',
        content,
    )

    frontmatter = "---\nhide:\n  - navigation\n---\n\n"
    with open("docs/index.md", "w", encoding="utf-8") as f:
        f.write(frontmatter + content)
