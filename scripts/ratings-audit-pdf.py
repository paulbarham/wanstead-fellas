"""Squad Ratings Audit — print sheet (primer 27).

Regenerate with:  python3 scripts/ratings-audit-pdf.py
Needs reportlab:  python3 -m venv .venv && .venv/bin/pip install reportlab


Every player name is rendered statically (the HTML version builds its rows in
JS, which a printer never runs), with empty boxes sized to be written in by
hand. Figures are the real database values pulled 30 Aug 2026; goals are
summed from goals_count and exclude own goals.
"""
import os
import sys
import tempfile
import urllib.request

from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
OUT = os.path.join(REPO, "docs", "primers", "pdf", "27-ratings-audit.pdf")

# Fonts are fetched to a temp cache rather than committed — no binaries in the
# repo, and the script still runs anywhere with network. Anything that fails to
# download (or comes back as a GitHub 404 page rather than a font, which is why
# the sfnt header is checked) falls back to a reportlab built-in.
FONT_CACHE = os.path.join(tempfile.gettempdir(), "wf-ratings-audit-fonts")
FONT_URLS = {
    "BarlowCondensed-Bold.ttf":
        "https://github.com/google/fonts/raw/main/ofl/barlowcondensed/BarlowCondensed-Bold.ttf",
    "BarlowCondensed-SemiBold.ttf":
        "https://github.com/google/fonts/raw/main/ofl/barlowcondensed/BarlowCondensed-SemiBold.ttf",
    "IBMPlexMono-Regular.ttf":
        "https://github.com/google/fonts/raw/main/ofl/ibmplexmono/IBMPlexMono-Regular.ttf",
    "IBMPlexMono-SemiBold.ttf":
        "https://github.com/google/fonts/raw/main/ofl/ibmplexmono/IBMPlexMono-SemiBold.ttf",
}
SFNT = (b"\x00\x01\x00\x00", b"true", b"ttcf", b"OTTO")


def ensure_font(fname):
    """Return a usable local path, or None if it can't be had."""
    os.makedirs(FONT_CACHE, exist_ok=True)
    path = os.path.join(FONT_CACHE, fname)
    if not os.path.exists(path):
        try:
            urllib.request.urlretrieve(FONT_URLS[fname], path)
        except Exception as exc:
            print("  ! could not fetch %s (%s)" % (fname, exc), file=sys.stderr)
            return None
    try:
        with open(path, "rb") as fh:
            if fh.read(4) not in SFNT:
                print("  ! %s is not a font (server returned an error page)" % fname, file=sys.stderr)
                os.remove(path)
                return None
    except OSError:
        return None
    return path


def register(alias, fname, fallback):
    path = ensure_font(fname)
    if path:
        try:
            pdfmetrics.registerFont(TTFont(alias, path))
            return alias
        except Exception as exc:
            print("  ! %s unusable (%s)" % (fname, exc), file=sys.stderr)
    print("  - %s -> %s" % (alias, fallback), file=sys.stderr)
    return fallback


COND      = register("Cond",     "BarlowCondensed-Bold.ttf",     "Helvetica-Bold")
COND_SEMI = register("CondSemi", "BarlowCondensed-SemiBold.ttf", "Helvetica-Bold")
MONO      = register("Mono",     "IBMPlexMono-Regular.ttf",      "Courier")
MONO_BOLD = register("MonoBold", "IBMPlexMono-SemiBold.ttf",     "Courier-Bold")

BODY, BODY_BOLD = "Helvetica", "Helvetica-Bold"

INK    = HexColor("#16211C")
MUTED  = HexColor("#5F6D66")
LINE   = HexColor("#DCE3D8")
ACCENT = HexColor("#1B6B45")
SIGNAL = HexColor("#9C5D12")
UNDER  = HexColor("#25627F")
OVER   = HexColor("#9A3E35")
BOXBG  = HexColor("#FAFBF8")

W, H = A4
ML, MR, MT, MB = 38, 38, 44, 46
CW = W - ML - MR

STATS = ["PAC", "SHO", "PAS", "DRI", "DEF", "PHY"]

UNRATED_AUG = [
    ("Max Farley",        "MID",  "Under 20", 7, 2, 1, 0, 8, "1 MOTM, 8 votes - best evidence of anyone unrated"),
    ("Marshall Winter",   None,   "Under 20", 6, 2, 0, 0, 0, None),
    ("Father Emmanuel",   "MID",  "50+",      5, 0, 0, 1, 1, None),
    ("Ollie Hoad",        "DEF",  "40-49",    3, 0, 0, 0, 0, None),
    ("Gavin Fulcher",     None,   "40-49",    2, 0, 0, 1, 0, None),
    ("Sam Yeats",         "MID",  "40-49",    2, 3, 0, 0, 0, "3 goals in 2 games"),
    ("Matthew Sharpe",    "DEF",  "40-49",    1, 0, 0, 0, 0, None),
    ("Fraser Day",        "ATT",  "20-29",    1, 2, 1, 0, 2, "MOTM on debut"),
]

UNRATED_OLD = [
    ("Rob Hall",          "DEF",  "40-49",    5, 0, 0, 0, 0, "last played 30 Jul"),
    ("Chris Hughes",      "MID",  "40-49",    3, 1, 0, 0, 1, "last played 9 Jul"),
    ("kevin sweeney",     "MID",  "40-49",    2, 0, 0, 0, 0, "last played 30 Jul"),
    ("Ed Adamson",        "MID",  "40-49",    2, 1, 0, 0, 1, "last played 2 Jul"),
    ("Emmanuel",          "MID",  None,       2, 2, 0, 0, 2, "last played 18 Jun - surname missing on profile"),
    ("Bodhi Quinlan-May", None,   "Under 20", 1, 1, 0, 0, 0, "last played 30 Jul"),
    ("Neil Perry",        "GK",   "40-49",    1, 0, 0, 0, 0, "last played 25 Jun - KEEPER: needs the six GK stats, not these"),
    ("Phil Mowat",        "MID",  "40-49",    1, 0, 0, 1, 1, "last played 11 Jun"),
    ("Stuart Jack",       "DEF",  "40-49",    1, 0, 0, 0, 0, "last played 11 Jun"),
    ("James Lightbody",   None,   "Under 20", 1, 0, 0, 0, 1, "last played 28 May"),
    ("Daniel K",          None,   None,       1, 0, 0, 0, 0, "last played 23 Apr"),
]

UNDER_RATED = [
    ("Rory Wilson",  "MID", 8, 5,  2,  1, 8,
     "1.60 votes per game - the highest rate in the whole squad. Only 5 appearances, so treat with some caution."),
    ("Callum Finch", "GK",  7, 17, 0,  2, 12,
     "Most-recognised keeper you have: 2 MOTM wins and 12 votes, yet rated below Peter May."),
    ("Paul Finch",   "GK",  7, 17, 0,  1, 10,
     "10 votes and a MOTM across 17 games. Same story as Callum."),
    ("Mark Pearson", "DEF", 6, 8,  1,  0, 2,
     "0.25 votes per game - a better recognition rate than several players rated 7 and 8."),
]

OVER_RATED = [
    ("Peter May",      "GK",  8, 8,  1,  0, 0,
     "Zero votes and zero MOTM in 8 games, yet rated above both Finches. The clearest mismatch in the data."),
    ("Noah Higgins",   "ATT", 9, 17, 12, 0, 2,
     "Scores well (0.71 a game) but has the lowest peer recognition of any 9 - no MOTM wins, 2 votes in 17 games."),
    ("Michael Farley", "MID", 9, 17, 11, 1, 5,
     "0.29 votes per game and 5 DOTDs, the joint-most in the squad."),
    ("Pete Healey",    "MID", 8, 9,  2,  0, 1,
     "2 goals and 1 vote in 9 games - the weakest output of the 8-rated midfielders."),
    ("Gary Edwards",   "DEF", 8, 10, 1,  0, 2,
     "Modest on every measure available."),
]


class Sheet:
    def __init__(self, path):
        self.c = canvas.Canvas(path, pagesize=A4)
        self.c.setTitle("Squad Ratings Audit")
        self.c.setAuthor("Wanstead Fellas")
        self.y = H - MT
        self.page = 1

    # ---------- primitives ----------
    def space(self, n):
        self.y -= n

    def need(self, n):
        if self.y - n < MB:
            self.footer()
            self.c.showPage()
            self.page += 1
            self.y = H - MT
            return True
        return False

    def footer(self):
        c = self.c
        c.setStrokeColor(LINE)
        c.setLineWidth(0.5)
        c.line(ML, MB - 12, W - MR, MB - 12)
        c.setFont(MONO, 7)
        c.setFillColor(MUTED)
        c.drawString(ML, MB - 22, "WANSTEAD FELLAS  ·  SQUAD RATINGS AUDIT  ·  30 AUG 2026")
        c.drawRightString(W - MR, MB - 22, "PAGE %d" % self.page)

    def wrap(self, text, font, size, width):
        words, lines, cur = text.split(), [], ""
        for w in words:
            t = (cur + " " + w).strip()
            if pdfmetrics.stringWidth(t, font, size) <= width:
                cur = t
            else:
                if cur:
                    lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        return lines

    def para(self, text, font=BODY, size=8.6, colour=MUTED, lead=11.4, width=None):
        width = width or CW
        for ln in self.wrap(text, font, size, width):
            self.need(lead + 2)
            self.c.setFont(font, size)
            self.c.setFillColor(colour)
            self.c.drawString(ML, self.y, ln)
            self.y -= lead

    def box(self, x, y, w, h, label):
        c = self.c
        c.setFont(MONO, 5.6)
        c.setFillColor(MUTED)
        c.drawString(x, y + h + 3, label)
        c.setFillColor(BOXBG)
        c.setStrokeColor(HexColor("#B9C5B6"))
        c.setLineWidth(0.7)
        c.rect(x, y, w, h, stroke=1, fill=1)

    # ---------- blocks ----------
    def masthead(self):
        c = self.c
        c.setFont(MONO, 8)
        c.setFillColor(ACCENT)
        c.drawString(ML, self.y, "WANSTEAD FELLAS  ·  30 AUGUST 2026")
        self.y -= 30
        c.setFont(COND, 34)
        c.setFillColor(INK)
        c.drawString(ML, self.y, "SQUAD RATINGS AUDIT")
        self.y -= 16
        c.setStrokeColor(INK)
        c.setLineWidth(1.6)
        c.line(ML, self.y, W - MR, self.y)
        self.y -= 16
        self.para(
            "Nineteen players are running on flat 7s with no card stats, and nine more look out of step "
            "with what they have actually done on the pitch. Fill this in by hand and send the numbers back.",
            size=9, lead=12, width=CW - 60)
        self.y -= 4

    def callout(self, title, body, colour):
        lines = self.wrap(body, BODY, 8.4, CW - 26)
        h = 20 + len(lines) * 10.6
        self.need(h + 10)
        c = self.c
        top = self.y + 4
        c.setFillColor(HexColor("#F2F5EF"))
        c.setStrokeColor(HexColor("#F2F5EF"))
        c.rect(ML, top - h, CW, h, stroke=0, fill=1)
        c.setFillColor(colour)
        c.rect(ML, top - h, 2.5, h, stroke=0, fill=1)
        c.setFont(BODY_BOLD, 8.8)
        c.setFillColor(INK)
        c.drawString(ML + 12, top - 13, title)
        yy = top - 25
        c.setFont(BODY, 8.4)
        c.setFillColor(MUTED)
        for ln in lines:
            c.drawString(ML + 12, yy, ln)
            yy -= 10.6
        self.y = top - h - 12

    def section(self, title, note=None):
        self.need(70)
        c = self.c
        self.y -= 6
        c.setFont(COND, 17)
        c.setFillColor(INK)
        c.drawString(ML, self.y, title.upper())
        self.y -= 6
        c.setStrokeColor(INK)
        c.setLineWidth(1.2)
        c.line(ML, self.y, W - MR, self.y)
        self.y -= 14
        if note:
            self.para(note, size=8.4, lead=11)
            self.y -= 2

    def subhead(self, text):
        self.need(26)
        c = self.c
        self.y -= 4
        c.setFont(MONO, 7.2)
        c.setFillColor(MUTED)
        c.drawString(ML, self.y, text.upper())
        tw = pdfmetrics.stringWidth(text.upper(), MONO, 7.2)
        c.setStrokeColor(LINE)
        c.setLineWidth(0.6)
        c.line(ML + tw + 8, self.y + 2.5, W - MR, self.y + 2.5)
        self.y -= 13

    def evidence(self, pos, age, apps, goals, motm, dotd, votes):
        bits = [pos or "NO POSITION", age or "NO AGE GROUP",
                "%d app%s" % (apps, "" if apps == 1 else "s"),
                "%d goal%s" % (goals, "" if goals == 1 else "s")]
        if motm:
            bits.append("%d MOTM" % motm)
        if votes:
            bits.append("%d vote%s" % (votes, "" if votes == 1 else "s"))
        if dotd:
            bits.append("%d DOTD" % dotd)
        return "   ".join(bits)

    def rate_row(self, p):
        name, pos, age, apps, goals, motm, dotd, votes, hi = p
        rh = 46 if not hi else 55
        self.need(rh + 4)
        c = self.c
        top = self.y

        c.setStrokeColor(LINE)
        c.setLineWidth(0.6)
        c.line(ML, top + 6, W - MR, top + 6)

        c.setFont(COND_SEMI, 14)
        c.setFillColor(INK)
        c.drawString(ML, top - 8, name)

        c.setFont(MONO, 6.4)
        c.setFillColor(SIGNAL if not pos else MUTED)
        c.drawString(ML, top - 18, self.evidence(pos, age, apps, goals, motm, dotd, votes))

        if hi:
            c.setFont(BODY, 7.4)
            c.setFillColor(ACCENT)
            c.drawString(ML, top - 29, hi)

        # boxes, right-aligned
        bw, bh, gap = 26, 19, 4
        n = len(STATS) + 1 + (0 if pos else 1)
        total = n * bw + (n - 1) * gap
        x = W - MR - total
        by = top - 30
        if not pos:
            self.box(x, by, bw, bh, "POS")
            x += bw + gap
        for s in STATS:
            self.box(x, by, bw, bh, s)
            x += bw + gap
        c.setFillColor(BOXBG)
        c.setStrokeColor(ACCENT)
        c.setLineWidth(1.4)
        c.rect(x, by, bw, bh, stroke=1, fill=1)
        c.setFont(MONO_BOLD, 5.6)
        c.setFillColor(ACCENT)
        c.drawString(x, by + bh + 3, "OVR")

        self.y = top - rh

    def review_row(self, p, colour):
        name, pos, ovr, apps, goals, motm, votes, why = p
        lines = self.wrap(why, BODY, 8, CW - 150)
        rh = 40 + len(lines) * 10
        self.need(rh + 4)
        c = self.c
        top = self.y

        c.setStrokeColor(LINE)
        c.setLineWidth(0.6)
        c.line(ML, top + 6, W - MR, top + 6)
        c.setFillColor(colour)
        c.rect(ML, top - rh + 12, 2.2, rh - 8, stroke=0, fill=1)

        c.setFont(COND_SEMI, 14)
        c.setFillColor(INK)
        c.drawString(ML + 10, top - 8, name)

        c.setFont(MONO, 6.4)
        c.setFillColor(MUTED)
        c.drawString(ML + 10, top - 18,
                     "%s   %d apps   %d goals   %d MOTM   %d votes" % (pos, apps, goals, motm, votes))

        yy = top - 30
        c.setFont(BODY, 8)
        c.setFillColor(MUTED)
        for ln in lines:
            c.drawString(ML + 10, yy, ln)
            yy -= 10

        # current -> new
        bw, bh = 30, 21
        x = W - MR - bw
        by = top - 27
        c.setFont(COND, 21)
        c.setFillColor(MUTED)
        c.drawRightString(x - 22, by + 4, str(ovr))
        c.setFont(MONO, 10)
        c.drawRightString(x - 8, by + 6, "->")
        c.setFillColor(BOXBG)
        c.setStrokeColor(ACCENT)
        c.setLineWidth(1.4)
        c.rect(x, by, bw, bh, stroke=1, fill=1)
        c.setFont(MONO_BOLD, 5.6)
        c.setFillColor(ACCENT)
        c.drawString(x - 4, by + bh + 3, "NEW OVR")

        self.y = top - rh

    def keeper_table(self):
        self.need(120)
        c = self.c
        rows = [("Callum Finch", "7", "17", "2", "12", "0.71", ACCENT),
                ("Paul Finch",   "7", "17", "1", "10", "0.59", ACCENT),
                ("Peter May",    "8", "8",  "0", "0",  "0.00", OVER)]
        cols = [ML, ML + 170, ML + 235, ML + 300, ML + 365, ML + 440]
        heads = ["KEEPER", "OVERALL", "APPS", "MOTM", "VOTES", "PER APP"]
        c.setFont(MONO, 6.4)
        c.setFillColor(MUTED)
        for x, h in zip(cols, heads):
            c.drawString(x, self.y, h)
        self.y -= 5
        c.setStrokeColor(LINE)
        c.setLineWidth(0.6)
        c.line(ML, self.y, W - MR, self.y)
        self.y -= 13
        for name, ovr, apps, motm, votes, per, col in rows:
            c.setFont(BODY_BOLD, 9)
            c.setFillColor(INK)
            c.drawString(cols[0], self.y, name)
            c.setFont(MONO, 8.6)
            for x, v in zip(cols[1:], [ovr, apps, motm, votes]):
                c.setFillColor(OVER if (name == "Peter May" and v == "8") else INK)
                c.drawString(x, self.y, v)
            c.setFont(MONO_BOLD, 8.6)
            c.setFillColor(col)
            c.drawString(cols[5], self.y, per)
            self.y -= 8
            c.setStrokeColor(LINE)
            c.line(ML, self.y, W - MR, self.y)
            self.y -= 13

    def build(self):
        self.masthead()

        self.callout(
            "Fill the six card stats, not just Overall",
            "The balancer only reads card stats when card_pace is set. If you enter Overall on its own, the team "
            "draft carries on seeing a flat 7 while the star cap and the RTG chip use your new number - the two "
            "halves of the balancer end up disagreeing. Scale is 1-10; the squad currently runs 4-10. Overall also "
            "does double duty: Stamina, Aggression, Composure and Work Rate are all derived straight from it, "
            "because there is no card stat for those four.",
            SIGNAL)

        self.section(
            "Rate these",
            "Everyone here has all nine base attributes sitting at the default 7 and no card stats at all. "
            "Positions marked NO POSITION need setting too - the balancer's swaps are position-matched, and a "
            "player without one drops into a catch-all bucket that quietly blocks both the star cap and the age "
            "spread from fixing any team he is on.")

        self.subhead("Played in August  ·  do these first")
        for p in UNRATED_AUG:
            self.rate_row(p)

        self.subhead("Last played July or earlier  ·  lower priority")
        for p in UNRATED_OLD:
            self.rate_row(p)

        self.section(
            "Review these",
            "These are already rated, but the numbers sit awkwardly against the record. This is inference, not "
            "fact: all I can see is goals, MOTM votes and DOTDs - no assists, no defensive actions, no minutes. "
            "MOTM votes are the only peer-judged signal available, and they track popularity and winning teams as "
            "well as ability. You have watched the games; treat these as prompts, not corrections. Leave the box "
            "blank to keep a rating as it is.")

        self.subhead("Possibly under-rated")
        for p in UNDER_RATED:
            self.review_row(p, UNDER)

        self.subhead("Possibly over-rated")
        for p in OVER_RATED:
            self.review_row(p, OVER)

        self.callout(
            "Two that look odd but I would leave alone",
            "Aaron Franklin (ATT, 8) has zero MOTM votes in 9 games, which looks alarming until you see 8 goals in "
            "those 9 - the rating holds up. Lawrie Pointer (DEF, 9) has just one vote, but 6 goals in 6 games from "
            "defence is exceptional, and he is one of the few with hand-curated attributes rather than card stats.",
            ACCENT)

        self.section(
            "The one I would push you on",
            "Your three keepers, ordered by how often team-mates voted for them. Peter May is rated above both "
            "Finches on zero votes and zero MOTM wins across 8 games, while Callum has the best vote rate of any "
            "keeper and two MOTM wins. Whichever way you correct it, the current order looks wrong - and it matters "
            "more than most, because GK distribution is a hard constraint in the balancer, so a mis-rated keeper "
            "skews his whole team's rating sum every single week.")
        self.keeper_table()

        self.footer()
        self.c.save()


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    Sheet(OUT).build()
    print("written: %s (%d bytes)" % (OUT, os.path.getsize(OUT)))
