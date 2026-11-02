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
    # Also rewrite HTML href="docs/..." links (e.g. in <a> tags in the README)
    content = re.sub(r'href="docs/([^"]+)"', r'href="\1"', content)

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

if __name__ == "__main__":
    on_pre_build({})
