"""Merge cover + body into final PDF, with metadata."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89  # A4 in points

def normalize_page_to_a4(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    # Force exact A4 if any dimension differs by more than 0.1pt
    if abs(w - A4_W) > 0.1 or abs(h - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
    return page

COVER = '/home/z/my-project/pdf-report/cover.pdf'
BODY = '/home/z/my-project/pdf-report/body.pdf'
OUT = '/home/z/my-project/pdf-report/TM-Flow-Technical-Report.pdf'

writer = PdfWriter()

# Cover as page 1
cover_reader = PdfReader(COVER)
writer.add_page(normalize_page_to_a4(cover_reader.pages[0]))

# Body pages follow
body_reader = PdfReader(BODY)
for page in body_reader.pages:
    writer.add_page(normalize_page_to_a4(page))

writer.add_metadata({
    '/Title': 'TM Flow - Technical & Product Report',
    '/Author': 'Z.ai',
    '/Creator': 'Z.ai',
    '/Subject': 'TM Flow v1.0 — Tender Management Platform technical and product report',
    '/Keywords': 'TM Flow, tender management, SaaS, South Africa, FastAPI, Next.js, AI',
})

with open(OUT, 'wb') as f:
    writer.write(f)

import os
print(f"Final PDF: {OUT}")
print(f"Size: {os.path.getsize(OUT)/1024:.1f} KB")
print(f"Pages: {len(writer.pages)}")
