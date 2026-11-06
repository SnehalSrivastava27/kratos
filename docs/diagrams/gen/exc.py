"""Tiny Excalidraw scene builder: boxes, text, arrows (optionally bound + labelled), lines."""
import json, random

INK = "#1e1e1e"
C = dict(blue="#a5d8ff", green="#b2f2bb", yellow="#ffec99", red="#ffc9c9", violet="#d0bfff",
         orange="#ffd8a8", gray="#e9ecef", teal="#96f2d7", white="#ffffff", none="transparent")
CW = 0.52  # Excalifont average char width / font size (measured ~0.45, padded)


def tw(text, fs):
    return max(len(l) for l in text.split("\n")) * fs * CW


def th(text, fs):
    return len(text.split("\n")) * fs * 1.25


class Scene:
    def __init__(self, seed=1):
        self.els, self.boxes, self.n = [], {}, 0
        random.seed(seed)

    def _id(self, p):
        self.n += 1
        return f"{p}{self.n}"

    def _base(self, t, x, y, w, h, **kw):
        e = dict(id=self._id(t[:2]), type=t, x=x, y=y, width=w, height=h, angle=0, strokeColor=INK,
                 backgroundColor="transparent", fillStyle="solid", strokeWidth=2, strokeStyle="solid",
                 roughness=1, opacity=100, groupIds=[], frameId=None, roundness=None,
                 seed=random.randint(1, 2**31), version=1, versionNonce=random.randint(1, 2**31),
                 isDeleted=False, boundElements=[], updated=1, link=None, locked=False)
        e.update(kw)
        self.els.append(e)
        return e

    def text(self, x, y, text, fs=18, align="left", color=INK, container=None, w=None, valign="top"):
        w = w if w is not None else tw(text, fs)
        return self._base("text", x, y, w, th(text, fs), text=text, originalText=text, fontSize=fs,
                          fontFamily=5, textAlign=align, verticalAlign=valign, containerId=container,
                          autoResize=True, lineHeight=1.25, strokeColor=color)

    def box(self, key, x, y, w, h, text="", fill="white", fs=20, shape="rectangle", dashed=False,
            stroke=INK, valign="middle", sw=2):
        e = self._base(shape, x, y, w, h, backgroundColor=C.get(fill, fill), strokeColor=stroke,
                       strokeStyle="dashed" if dashed else "solid", strokeWidth=sw,
                       roundness={"type": 3} if shape == "rectangle" else {"type": 2})
        self.boxes[key] = e
        if text:
            tH = th(text, fs)
            ty = y + (h - tH) / 2 if valign == "middle" else y + 14
            t = self.text(x + 8, ty, text, fs, "center", container=e["id"], w=w - 16, valign=valign)
            e["boundElements"].append({"type": "text", "id": t["id"]})
        return e

    def anchor(self, key, side, f=0.5, gap=6):
        b = self.boxes[key]
        x, y, w, h = b["x"], b["y"], b["width"], b["height"]
        return {"r": (x + w + gap, y + h * f), "l": (x - gap, y + h * f),
                "t": (x + w * f, y - gap), "b": (x + w * f, y + h + gap)}[side]

    def arrow(self, pts, label=None, fs=16, start=None, end=None, dashed=False, both=False, head=True,
              color=INK, label_at=None, sw=2):
        """pts: absolute points. start/end: box keys to bind. Label: bound text (2-point) or free text."""
        x0, y0 = pts[0]
        rel = [[px - x0, py - y0] for px, py in pts]
        xs, ys = [p[0] for p in rel], [p[1] for p in rel]
        e = self._base("arrow", x0, y0, max(xs) - min(xs), max(ys) - min(ys), points=rel,
                       lastCommittedPoint=None, roundness=None,
                       startArrowhead="arrow" if both else None, endArrowhead="arrow" if head else None,
                       strokeStyle="dashed" if dashed else "solid", elbowed=False, strokeColor=color,
                       strokeWidth=sw,
                       startBinding={"elementId": self.boxes[start]["id"], "focus": 0, "gap": 6} if start else None,
                       endBinding={"elementId": self.boxes[end]["id"], "focus": 0, "gap": 6} if end else None)
        for k in (start, end):
            if k:
                self.boxes[k]["boundElements"].append({"type": "arrow", "id": e["id"]})
        if label:
            w, h = tw(label, fs), th(label, fs)
            if label_at:  # free label at a given top-left
                self.text(label_at[0], label_at[1], label, fs, "left", color=color)
            elif len(pts) == 2:
                mx, my = (pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2
                t = self.text(mx - w / 2, my - h / 2, label, fs, "center", container=e["id"], w=w, valign="middle")
                e["boundElements"].append({"type": "text", "id": t["id"]})
            else:
                raise ValueError("multi-point arrow label needs label_at")
        return e

    def line(self, pts, dashed=True, color="#868e96", sw=1):
        x0, y0 = pts[0]
        rel = [[px - x0, py - y0] for px, py in pts]
        return self._base("line", x0, y0, max(abs(p[0]) for p in rel), max(abs(p[1]) for p in rel),
                          points=rel, lastCommittedPoint=None, startArrowhead=None, endArrowhead=None,
                          strokeStyle="dashed" if dashed else "solid", strokeColor=color, strokeWidth=sw)

    def save(self, path):
        json.dump({"type": "excalidraw", "version": 2, "source": "https://excalidraw.com",
                   "elements": self.els, "appState": {"viewBackgroundColor": "#ffffff", "gridSize": None},
                   "files": {}}, open(path, "w"), indent=1, ensure_ascii=False)


def sequence(s, actors, msgs, x0=40, y0=40, gap=230, bw=190, bh=70, step=58, fills=None, fs=16):
    """Sequence diagram. actors: [(key, label)]. msgs: (from, to, label) or ('note', key|(k1,k2), text, fill)."""
    xs = {}
    for i, (k, lab) in enumerate(actors):
        x = x0 + i * gap
        xs[k] = x + bw / 2
        s.box(k, x, y0, bw, bh, lab, (fills or {}).get(k, "blue"), fs=17)
    y = y0 + bh + 40
    for m in msgs:
        if m[0] == "note":
            _, who, text, fill = m
            a, b = (who, who) if isinstance(who, str) else who
            l, r = min(xs[a], xs[b]) - bw / 2 + 10, max(xs[a], xs[b]) + bw / 2 - 10
            need = tw(text, fs) + 30
            if r - l < need:
                c = (l + r) / 2
                l, r = max(5, c - need / 2), c + need / 2
            h = th(text, fs) + 16
            s.box(f"n{y}", l, y - 10, r - l, h, text, fill, fs=fs, sw=1)
            y += h + 40
            continue
        a, b, text = m[:3]
        dashed = len(m) > 3 and m[3] == "dashed"
        lh = th(text, fs)
        if a == b:  # self call
            x = xs[a]
            s.arrow([(x, y), (x + 60, y), (x + 60, y + 26), (x + 4, y + 26)], text, fs, label_at=(x + 70, y - 2),
                    dashed=dashed)
            y += max(step, lh + 30) + 14
            continue
        xa, xb = xs[a], xs[b]
        y += lh - fs * 1.25  # room for multi-line labels above the arrow
        s.arrow([(xa + (4 if xb > xa else -4), y), (xb - (6 if xb > xa else -6), y)], dashed=dashed)
        lx = min(xa, xb) + 14
        s.text(lx, y - lh - 4, text, fs)
        y += step
    for k in xs:  # lifelines go to the back
        s.els.insert(0, s.els.pop(s.els.index(s.line([(xs[k], y0 + bh), (xs[k], y + 10)]))))
    return y
