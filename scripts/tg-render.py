#!/usr/bin/env python3
"""Dry-render agent Markdown the way Switch's Telegram bridge does, without sending anything.

Mirrors TelegramAdapter._render_outbound (switch_core/bridges/collaboration/telegram/adapter.py,
Switch 0.31.0): same regexes, same order. Mentions stay plain text (agents are not Telegram users).

  python3 scripts/tg-render.py              # render the example from switch/agents/*.md + self-check
  python3 scripts/tg-render.py < msg.md     # render your own message (pass "-")
"""
import html
import re
import sys

CODE_BLOCK = re.compile(r"```[A-Za-z0-9_+.-]*\n?(.*?)```", re.DOTALL)
INLINE_CODE = re.compile(r"`([^`\n]+)`")
HEADING = re.compile(r"^ {0,3}#{1,6}[ \t]+(.*)$", re.MULTILINE)
BULLET = re.compile(r"^([ \t]*)[-*+][ \t]+", re.MULTILINE)
LINK = re.compile(r"\[([^\[\]\n]*)\]\(([^()\s]*)\)")
BOLD = re.compile(r"\*\*([^\n]+?)\*\*")
STRIKE = re.compile(r"~~([^\n]+?)~~")
ITALIC_STAR = re.compile(r"(?<![\w*])\*([^*\n]+?)\*(?![\w*])")
ITALIC_USCORE = re.compile(r"(?<![\w_])_([^_\n]+?)_(?![\w_])")
LINKABLE = ("http://", "https://", "tg://", "mailto:")


def render(content: str) -> str:
    stash: list[str] = []

    def keep(s: str) -> str:
        stash.append(s)
        return f"\x00{len(stash) - 1}\x00"

    text = CODE_BLOCK.sub(lambda m: keep(f"<pre>{html.escape(m.group(1).strip(chr(10)), quote=False)}</pre>"), content)
    text = INLINE_CODE.sub(lambda m: keep(f"<code>{html.escape(m.group(1), quote=False)}</code>"), text)
    text = html.escape(text, quote=False)
    text = HEADING.sub(r"<b>\1</b>", text)
    text = BULLET.sub(r"\1• ", text)
    text = BOLD.sub(r"<b>\1</b>", text)
    text = STRIKE.sub(r"<s>\1</s>", text)
    text = ITALIC_STAR.sub(r"<i>\1</i>", text)
    text = ITALIC_USCORE.sub(r"<i>\1</i>", text)

    def link(m: re.Match) -> str:
        label, href = m.group(1), m.group(2)
        if not href.lower().startswith(LINKABLE):
            shown = keep(f"<code>{href}</code>")
            return f"{label}: {shown}" if label else shown
        return keep(f'<a href="{href.replace(chr(34), "&quot;")}">{label}</a>')

    text = LINK.sub(link, text)
    for i, s in enumerate(stash):
        text = text.replace(f"\x00{i}\x00", s)
    return text


def well_nested(rendered: str) -> bool:
    """Telegram rejects HTML whose tags cross, e.g. <b><i>x</b></i>."""
    stack = []
    for close, tag in re.findall(r"<(/?)(b|i|s|code|pre|a)\b[^>]*>", rendered):
        if not close:
            stack.append(tag)
        elif not stack or stack.pop() != tag:
            return False
    return not stack


def example() -> str:
    from pathlib import Path
    md = (Path(__file__).resolve().parent.parent / "switch/agents/d2c-ops.md").read_text()
    return md.split("Example:\n", 1)[1].split("\n\nThe Telegram group", 1)[0]


if __name__ == "__main__":
    src = sys.stdin.read() if sys.argv[1:] == ["-"] else example()
    out = render(src)
    print(out)
    if not well_nested(out):
        sys.exit("BROKEN: tags cross; Telegram would reject this message")
    if sys.argv[1:] != ["-"]:  # self-check on the rules' own example
        assert out.startswith("📦 <b>Stock plan for the sale</b>\n\n• <b>Delhi:</b> short by <b>70</b>"), out
        assert "<b><i>Move stock Mumbai → Delhi by 9 Nov, or Delhi orders take 4 days.</i></b>" in out, out
        assert out.rstrip().endswith("<i>Next: @d2c-captain please approve the transfer.</i>"), out
        assert not well_nested(render("**_Spend **₹5L** now_**"))  # why the rules forbid bold inside the key line
        assert "_" in render("_Next: post in war_room topic_")  # snake_case breaks an italic line
        print("\nok: renders as intended, tags well nested")
