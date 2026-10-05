"""Invoice and payment receipt PDFs, drawn with ReportLab so they look identical on every PC and printer."""

from decimal import Decimal
from io import BytesIO
from pathlib import Path

from django.conf import settings
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, A5
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, Image, KeepTogether, PageTemplate, Paragraph, Spacer, Table, TableStyle,
)

from apps.clinic.models import ClinicSettings

FONT_DIR = Path(__file__).parent / "fonts"
LOGO = Path(settings.PROJECT_DIR) / "assets" / "logo-mark.png"

# Palette derived from the clinic's gold monogram (keep in sync with frontend tokens).
INK = colors.HexColor("#211B15")
MUTED = colors.HexColor("#6B6157")
GOLD = colors.HexColor("#A8741F")
GOLD_SOFT = colors.HexColor("#E9D9B4")
IVORY = colors.HexColor("#FBF7EF")
LINE = colors.HexColor("#E6DED1")
STATUS_COLORS = {
    "PAID": ("#1F6B4A", "#E3F1E9"),
    "PARTIAL": ("#8A5A00", "#FBEFD5"),
    "PENDING": ("#9A3B26", "#F8E4DE"),
    "CANCELLED": ("#5C5550", "#ECE8E3"),
}
STATUS_LABELS = {"PAID": "PAID", "PARTIAL": "PARTIALLY PAID", "PENDING": "PAYMENT PENDING", "CANCELLED": "CANCELLED"}

_fonts_ready = False


def _register_fonts():
    global _fonts_ready
    if _fonts_ready:
        return
    for name, file in [
        ("Inter", "Inter-Regular.ttf"),
        ("Inter-Medium", "Inter-Medium.ttf"),
        ("Inter-SemiBold", "Inter-SemiBold.ttf"),
        ("Inter-Bold", "Inter-Bold.ttf"),
        ("Cormorant", "CormorantGaramond-SemiBold.ttf"),
    ]:
        pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / file)))
    pdfmetrics.registerFontFamily("Inter", normal="Inter", bold="Inter-SemiBold", italic="Inter", boldItalic="Inter-SemiBold")
    _fonts_ready = True


def style(name, **kw):
    if "parent" in kw:
        return ParagraphStyle(name, **kw)
    base = {"fontName": "Inter", "fontSize": 9, "leading": 12.5, "textColor": INK}
    base.update(kw)
    return ParagraphStyle(name, **base)


def inr(value, symbol=True):
    """Indian digit grouping: 1,23,456.00"""
    value = Decimal(value).quantize(Decimal("0.01"))
    sign = "-" if value < 0 else ""
    whole, frac = f"{abs(value):.2f}".split(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups + [tail])
    return f"{sign}{'₹' if symbol else ''}{whole}.{frac}"


_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
         "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _two(n):
    return _ONES[n] if n < 20 else (_TENS[n // 10] + (" " + _ONES[n % 10] if n % 10 else ""))


def _three(n):
    h, r = divmod(n, 100)
    parts = ([_ONES[h] + " Hundred"] if h else []) + ([_two(r)] if r else [])
    return " ".join(parts)


def amount_in_words(value):
    value = Decimal(value).quantize(Decimal("0.01"))
    rupees, paise = int(value), int((value - int(value)) * 100)
    if rupees == 0:
        words = "Zero"
    else:
        parts = []
        for divisor, label in [(10_000_000, "Crore"), (100_000, "Lakh"), (1000, "Thousand")]:
            chunk, rupees = divmod(rupees, divisor)
            if chunk:
                parts.append(f"{_three(chunk) if chunk < 1000 else amount_in_words(chunk).replace('Rupees ', '').replace(' Only', '')} {label}")
        if rupees:
            parts.append(_three(rupees))
        words = " ".join(parts)
    text = f"Rupees {words}"
    if paise:
        text += f" and {_two(paise)} Paise"
    return text + " Only"


def _local(dt):
    return timezone.localtime(dt)


def _fmt_dt(dt):
    return _local(dt).strftime("%d %b %Y, %I:%M %p")


def _esc(text):
    return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _header(clinic, doc_title, doc_number, doc_date, status, width):
    """Logo + clinic identity on the left, document title and number on the right."""
    logo = Image(str(LOGO), width=19 * mm, height=16 * mm) if LOGO.exists() else Spacer(19 * mm, 16 * mm)
    identity = [
        Paragraph(_esc(clinic.name), style("cn", fontName="Cormorant", fontSize=22, leading=26)),
        Spacer(1, 1),
        Paragraph(_esc(clinic.subtitle).upper(), style("cs", fontName="Inter-Medium", fontSize=7.2, leading=10, textColor=GOLD, letterSpacing=1.4)),
    ]
    if clinic.tagline:
        identity.append(Paragraph(_esc(clinic.tagline), style("ct", fontSize=7.5, textColor=MUTED)))

    right = [
        Paragraph(doc_title, style("dt", fontName="Inter-SemiBold", fontSize=8, textColor=GOLD, alignment=TA_RIGHT, letterSpacing=2)),
        Paragraph(_esc(doc_number), style("dn", fontName="Inter-SemiBold", fontSize=13, leading=16, alignment=TA_RIGHT)),
        Paragraph(_fmt_dt(doc_date), style("dd", fontSize=8.5, textColor=MUTED, alignment=TA_RIGHT)),
    ]
    if status:
        fg, bg = STATUS_COLORS[status]
        pill = Table(
            [[Paragraph(STATUS_LABELS[status], style("st", fontName="Inter-SemiBold", fontSize=7, leading=9, textColor=colors.HexColor(fg), alignment=1, letterSpacing=0.8))]],
            colWidths=[30 * mm],
        )
        pill.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(bg)),
            ("ROUNDEDCORNERS", [6, 6, 6, 6]),
            ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        right_table = Table([[r] for r in right] + [[pill]], colWidths=[62 * mm])
        right_table.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "RIGHT"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0.5), ("TOPPADDING", (0, -1), (-1, -1), 4),
        ]))
        right = right_table

    t = Table([[logo, identity, right]], colWidths=[23 * mm, width - 23 * mm - 62 * mm, 62 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    rule = Table([[""]], colWidths=[width], rowHeights=[1.2])
    rule.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 1.1, GOLD)]))
    return [t, Spacer(1, 5 * mm), rule, Spacer(1, 5 * mm)]


def _label(text):
    return Paragraph(text.upper(), style("lb", fontName="Inter-SemiBold", fontSize=6.8, leading=9, textColor=MUTED, letterSpacing=1))


def _party_block(invoice_or_payment, clinic, width, doctor=None):
    patient = invoice_or_payment.patient
    meta = [f"Patient ID: <font name='Inter-Medium'>{_esc(patient.uhid)}</font>", f"Mobile: {_esc(patient.phone)}"]
    demo = " · ".join(filter(None, [f"{patient.age} yrs" if patient.age is not None else "", patient.get_gender_display()]))
    if demo:
        meta.append(demo)
    left = [_label("Billed to"), Spacer(1, 1.5 * mm),
            Paragraph(_esc(patient.name), style("pn", fontName="Inter-SemiBold", fontSize=11, leading=14))]
    left += [Paragraph(m, style("pm", fontSize=8.5, textColor=MUTED)) for m in meta]

    right = []
    if doctor:
        right += [_label("Consulting doctor"), Spacer(1, 1.5 * mm),
                  Paragraph(_esc(doctor.name), style("dn2", fontName="Inter-SemiBold", fontSize=10, leading=13))]
        if doctor.qualification:
            right.append(Paragraph(_esc(doctor.qualification), style("dq", fontSize=8.5, textColor=MUTED)))
        if clinic.show_doctor_registration and doctor.registration_no:
            right.append(Paragraph(f"Reg. No: {_esc(doctor.registration_no)}", style("dr", fontSize=8.5, textColor=MUTED)))
    if clinic.gstin:
        right += [Spacer(1, 2 * mm), Paragraph(f"GSTIN: <font name='Inter-Medium'>{_esc(clinic.gstin)}</font>", style("gst", fontSize=8.5, textColor=MUTED))]

    t = Table([[left, right]], colWidths=[width * 0.55, width * 0.45])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


def _make_doc(buf, pagesize, margin_x, top, bottom, title, author):
    doc = BaseDocTemplate(
        buf, pagesize=pagesize, leftMargin=margin_x, rightMargin=margin_x, topMargin=top, bottomMargin=bottom,
        title=title, author=author,
    )
    # Zero-padding frame so tables sized to doc.width line up exactly with the page margins.
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, 0, 0, 0, 0, id="body")
    return doc, frame


def _build(doc, frame, story, on_page):
    doc.addPageTemplates([PageTemplate(id="page", frames=[frame], onPage=on_page)])
    doc.build(story)


def _footer_canvas(clinic, cancelled=False):
    def draw(canvas, doc):
        canvas.saveState()
        w, h = doc.pagesize
        if cancelled:
            canvas.setFont("Inter-Bold", 64)
            canvas.setFillColor(colors.Color(0.6, 0.2, 0.15, alpha=0.08))
            canvas.translate(w / 2, h / 2)
            canvas.rotate(35)
            canvas.drawCentredString(0, 0, "CANCELLED")
            canvas.rotate(-35)
            canvas.translate(-w / 2, -h / 2)
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.6)
        canvas.line(doc.leftMargin, 17.5 * mm, w - doc.rightMargin, 16 * mm)
        canvas.setFont("Inter", 7.2)
        canvas.setFillColor(MUTED)
        address = " ".join(clinic.address.split())
        contact = [
            f"Phone {clinic.phone}" if clinic.phone else "",
            f"WhatsApp {clinic.whatsapp}" if clinic.whatsapp else "",
            clinic.email, clinic.working_hours,
        ]
        line = "   ·   ".join(filter(None, contact))
        if canvas.stringWidth(line, "Inter", 7.2) <= doc.width:
            lines = [address, line]
        else:
            lines = [address, "   ·   ".join(filter(None, contact[:2])), "   ·   ".join(filter(None, contact[2:]))]
        y = 11.5 * mm + (len(lines) - 2) * 3.5 * mm
        for text in lines:
            canvas.drawCentredString(w / 2, y, text)
            y -= 3.5 * mm
        canvas.drawRightString(w - doc.rightMargin, 4 * mm, f"Page {doc.page}")
        canvas.restoreState()
    return draw


def render_invoice_pdf(invoice):
    _register_fonts()
    clinic = ClinicSettings.load()
    buf = BytesIO()
    doc, frame = _make_doc(buf, A4, 16 * mm, 14 * mm, 22 * mm, f"Invoice {invoice.number}", clinic.name)
    width = doc.width
    story = _header(clinic, "TAX INVOICE" if clinic.gstin else "INVOICE", invoice.number, invoice.invoice_date,
                    invoice.payment_status, width)
    story += [_party_block(invoice, clinic, width, invoice.doctor), Spacer(1, 6 * mm)]

    # ---- Items ----
    head = style("th", fontName="Inter-SemiBold", fontSize=7.2, leading=9, textColor=MUTED, letterSpacing=0.6)
    head_r = style("thr", parent=head, alignment=TA_RIGHT)
    cell = style("td", fontSize=8.8, leading=11.5)
    cell_r = style("tdr", parent=cell, alignment=TA_RIGHT)
    sub = style("tds", fontSize=7.6, leading=10, textColor=MUTED)
    show_tax = invoice.tax_total > 0
    show_disc = invoice.discount_total > 0

    cols = [("#", 7 * mm, False), ("TREATMENT / PRODUCT", None, False), ("QTY", 12 * mm, True), ("RATE", 22 * mm, True)]
    if show_disc:
        cols.append(("DISCOUNT", 20 * mm, True))
    if show_tax:
        cols.append(("GST", 20 * mm, True))
    cols.append(("AMOUNT", 25 * mm, True))
    fixed = sum(c[1] for c in cols if c[1])
    widths = [c[1] or (width - fixed) for c in cols]

    rows = [[Paragraph(c[0], head_r if c[2] else head) for c in cols]]
    for i, item in enumerate(invoice.items.all(), 1):
        desc = [Paragraph(_esc(item.description), style("dsc", parent=cell, fontName="Inter-Medium"))]
        extra = " · ".join(filter(None, [item.details, f"HSN/SAC {item.code}" if item.code else ""]))
        if extra:
            desc.append(Paragraph(_esc(extra), sub))
        qty = f"{item.quantity.normalize():f}"
        row = [Paragraph(str(i), cell), desc, Paragraph(qty, cell_r), Paragraph(inr(item.unit_price, False), cell_r)]
        if show_disc:
            d = "—" if not item.discount_amount else inr(item.discount_amount, False)
            if item.discount_type == "PERCENT" and item.discount_amount:
                d += f"<br/><font size='7' color='#6B6157'>{item.discount_value.normalize():f}%</font>"
            row.append(Paragraph(d, cell_r))
        if show_tax:
            g = "—" if not item.tax_amount else f"{inr(item.tax_amount, False)}<br/><font size='7' color='#6B6157'>@{item.tax_rate.normalize():f}%</font>"
            row.append(Paragraph(g, cell_r))
        row.append(Paragraph(inr(item.line_total, False), style("amt", parent=cell_r, fontName="Inter-Medium")))
        rows.append(row)

    table = Table(rows, colWidths=widths, repeatRows=1)
    ts = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, INK),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
    ]
    for r in range(1, len(rows)):
        ts.append(("LINEBELOW", (0, r), (-1, r), 0.5, LINE))
    table.setStyle(TableStyle(ts))
    story += [table, Spacer(1, 5 * mm)]

    # ---- Totals + amount in words ----
    lbl = style("tl", fontSize=8.8, textColor=MUTED)
    val = style("tv", fontSize=8.8, alignment=TA_RIGHT)
    totals = [[Paragraph("Subtotal", lbl), Paragraph(inr(invoice.subtotal), val)]]
    if show_disc:
        totals.append([Paragraph("Discount", lbl), Paragraph("− " + inr(invoice.discount_total), val)])
    if show_tax:
        half = (invoice.tax_total / 2).quantize(Decimal("0.01"))
        totals += [
            [Paragraph("Taxable amount", lbl), Paragraph(inr(invoice.taxable_total), val)],
            [Paragraph("CGST", lbl), Paragraph(inr(half), val)],
            [Paragraph("SGST", lbl), Paragraph(inr(invoice.tax_total - half), val)],
        ]
    if invoice.round_off:
        totals.append([Paragraph("Round off", lbl), Paragraph(inr(invoice.round_off), val)])
    total_row = len(totals)
    totals.append([
        Paragraph("Total", style("gt", fontName="Inter-SemiBold", fontSize=11)),
        Paragraph(inr(invoice.total), style("gv", fontName="Inter-Bold", fontSize=12.5, leading=15, alignment=TA_RIGHT)),
    ])
    totals.append([Paragraph("Amount paid", lbl), Paragraph(inr(invoice.amount_paid), val)])
    if invoice.amount_refunded:
        totals.append([Paragraph("Refunded", lbl), Paragraph("− " + inr(invoice.amount_refunded), val)])
    if invoice.status != "CANCELLED":
        totals.append([
            Paragraph("Balance due", style("bd", fontName="Inter-SemiBold", fontSize=9.5)),
            Paragraph(inr(invoice.balance_due), style("bv", fontName="Inter-SemiBold", fontSize=9.5, alignment=TA_RIGHT)),
        ])
    tot = Table(totals, colWidths=[34 * mm, 34 * mm])
    tot.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 2.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("LINEABOVE", (0, total_row), (-1, total_row), 0.8, INK),
        ("TOPPADDING", (0, total_row), (-1, total_row), 6), ("BOTTOMPADDING", (0, total_row), (-1, total_row), 6),
        ("LINEBELOW", (0, total_row), (-1, total_row), 0.5, LINE),
    ]))
    words = [_label("Amount in words"), Spacer(1, 1.5 * mm),
             Paragraph(amount_in_words(invoice.total), style("aw", fontName="Inter-Medium", fontSize=9, leading=12.5))]
    if invoice.notes:
        words += [Spacer(1, 4 * mm), _label("Notes"), Spacer(1, 1.5 * mm), Paragraph(_esc(invoice.notes).replace("\n", "<br/>"), style("nt", fontSize=8.5, textColor=MUTED))]
    summary = Table([[words, tot]], colWidths=[width - 74 * mm, 74 * mm])
    summary.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (1, 0), (1, 0), 6 * mm),
    ]))
    story += [KeepTogether(summary), Spacer(1, 6 * mm)]

    # ---- Payments ----
    payments = list(invoice.payments.order_by("paid_at", "id"))
    if payments:
        prow = [
            [_label("Payment details"), "", "", "", ""],
            [Paragraph(h, head_r if i == 4 else head) for i, h in enumerate(["DATE", "RECEIPT NO.", "MODE", "REFERENCE", "AMOUNT"])],
        ]
        for p in payments:
            prow.append([
                Paragraph(_local(p.paid_at).strftime("%d %b %Y, %I:%M %p"), cell), Paragraph(p.receipt_number, cell),
                Paragraph(p.get_mode_display(), cell), Paragraph(_esc(p.reference) or "—", cell),
                Paragraph(inr(p.amount), cell_r),
            ])
        for r in invoice.refunds.order_by("refunded_at", "id"):
            prow.append([
                Paragraph(_local(r.refunded_at).strftime("%d %b %Y, %I:%M %p"), cell), Paragraph(r.refund_number, cell),
                Paragraph(f"Refund · {r.get_mode_display()}", cell), Paragraph(_esc(r.reference) or "—", cell),
                Paragraph("− " + inr(r.amount), cell_r),
            ])
        pt = Table(prow, colWidths=[38 * mm, 34 * mm, 34 * mm, width - 136 * mm, 30 * mm], hAlign="LEFT")
        pt.setStyle(TableStyle([
            ("SPAN", (0, 0), (-1, 0)), ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
            ("LINEBELOW", (0, 1), (-1, 1), 0.6, LINE), ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 1), (-2, -1), 3),
        ]))
        story += [KeepTogether(pt), Spacer(1, 6 * mm)]

    if invoice.status == "CANCELLED":
        story += [_label("Cancellation"), Spacer(1, 1.5 * mm),
                  Paragraph(f"Cancelled on {_fmt_dt(invoice.cancelled_at)}. Reason: {_esc(invoice.cancel_reason)}",
                            style("cx", fontSize=8.5, textColor=colors.HexColor('#9A3B26'))), Spacer(1, 6 * mm)]

    # ---- Terms + signature ----
    terms = []
    if clinic.invoice_terms:
        terms += [_label("Terms & conditions"), Spacer(1, 1.5 * mm),
                  Paragraph(_esc(clinic.invoice_terms).replace("\n", "<br/>"), style("tc", fontSize=7.6, leading=10.5, textColor=MUTED))]
    if clinic.refund_policy:
        terms += [Spacer(1, 3 * mm), _label("Cancellation & refund policy"), Spacer(1, 1.5 * mm),
                  Paragraph(_esc(clinic.refund_policy).replace("\n", "<br/>"), style("rp", fontSize=7.6, leading=10.5, textColor=MUTED))]
    sign = []
    if clinic.signature:
        try:
            sign.append(Image(clinic.signature.path, width=32 * mm, height=14 * mm, kind="proportional"))
        except (FileNotFoundError, OSError):
            sign.append(Spacer(1, 14 * mm))
    else:
        sign.append(Spacer(1, 14 * mm))
    sign += [Paragraph("Authorised signatory", style("sg", fontSize=8, textColor=MUTED, alignment=TA_RIGHT)),
             Paragraph(_esc(clinic.name), style("sgn", fontName="Inter-Medium", fontSize=8.5, alignment=TA_RIGHT))]
    bottom = Table([[terms or "", sign]], colWidths=[width - 60 * mm, 60 * mm])
    bottom.setStyle(TableStyle([
        ("VALIGN", (0, 0), (0, 0), "TOP"), ("VALIGN", (1, 0), (1, 0), "BOTTOM"), ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(KeepTogether(bottom))
    if clinic.invoice_footer:
        story += [Spacer(1, 6 * mm), Paragraph(_esc(clinic.invoice_footer), style("ft", fontName="Cormorant", fontSize=12, textColor=GOLD, alignment=1))]

    _build(doc, frame, story, _footer_canvas(clinic, cancelled=invoice.status == "CANCELLED"))
    return buf.getvalue()


def render_receipt_pdf(payment):
    _register_fonts()
    clinic = ClinicSettings.load()
    invoice = payment.invoice
    buf = BytesIO()
    doc, frame = _make_doc(buf, A5, 12 * mm, 11 * mm, 22 * mm, f"Receipt {payment.receipt_number}", clinic.name)
    width = doc.width
    story = _header(clinic, "PAYMENT RECEIPT", payment.receipt_number, payment.paid_at, None, width)
    story += [_party_block(payment, clinic, width, invoice.doctor), Spacer(1, 6 * mm)]

    amount_box = Table([
        [_label("Amount received")],
        [Paragraph(inr(payment.amount), style("ar", fontName="Inter-Bold", fontSize=20, leading=24))],
        [Paragraph(amount_in_words(payment.amount), style("aw", fontSize=8.5, textColor=MUTED))],
    ], colWidths=[width])
    amount_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), IVORY), ("BOX", (0, 0), (-1, -1), 0.6, GOLD_SOFT),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
        ("LEFTPADDING", (0, 0), (-1, -1), 5 * mm), ("TOPPADDING", (0, 0), (-1, 0), 4 * mm),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 4 * mm),
    ]))
    story += [amount_box, Spacer(1, 5 * mm)]

    lbl = style("rl", fontSize=8.8, textColor=MUTED)
    val = style("rv", fontName="Inter-Medium", fontSize=8.8, alignment=TA_RIGHT)
    rows = [
        ("Against invoice", invoice.number),
        ("Invoice total", inr(invoice.total)),
        ("Payment mode", payment.get_mode_display()),
    ]
    if payment.reference:
        rows.append(("Reference", payment.reference))
    rows.append(("Balance due after this payment", inr(invoice.balance_due)))
    if payment.received_by:
        rows.append(("Received by", payment.received_by.display_name))
    t = Table([[Paragraph(a, lbl), Paragraph(_esc(b), val)] for a, b in rows], colWidths=[width * 0.55, width * 0.45])
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, LINE), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story += [t, Spacer(1, 8 * mm),
              Paragraph("Authorised signatory", style("sg", fontSize=8, textColor=MUTED, alignment=TA_RIGHT))]
    _build(doc, frame, story, _footer_canvas(clinic))
    return buf.getvalue()
