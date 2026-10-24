"""Safely insert the ALBUKHR Media & Channels section into a local repo copy.

Run from the repository root with Python 3. The script fails loudly if the
expected source anchors are missing, and refuses to duplicate the section.
"""
from pathlib import Path

ROOT = Path.cwd()
index_path = ROOT / "index.html"
css_path = ROOT / "assets" / "brand-overrides.css"
snippet_path = Path(__file__).with_name("media-channels-snippet.html")
css_addition_path = Path(__file__).with_name("media-channels.css")

if not index_path.is_file() or not css_path.is_file():
    raise SystemExit("ERROR: Run this script from the albukhr-website repository root.")

index = index_path.read_text(encoding="utf-8")
css = css_path.read_text(encoding="utf-8")
if 'id="media-channels"' in index or ".media-grid{" in css:
    raise SystemExit("No changes made: Media & Channels appears to be present already.")

snippet = snippet_path.read_text(encoding="utf-8")
nav_link = '<a href="#media-channels">Media &amp; Channels</a>'
section_start = '<section class="media-section section-pad" id="media-channels">'
section_end = "</section>\n\n<!-- In the existing contact-section eyebrow"
if nav_link not in snippet or section_start not in snippet or section_end not in snippet:
    raise SystemExit("ERROR: The HTML snippet is not in the expected format.")
section = snippet.split(section_start, 1)[1].split("\n\n<!-- In the existing contact-section", 1)[0]
section = section_start + section

nav_anchor = '  <a href="#documents">Documents</a>\n'
contact_anchor = '  </section>  <section class="contact-section section-pad" id="contact">'
if index.count(nav_anchor) != 1 or index.count(contact_anchor) != 1:
    raise SystemExit("ERROR: Expected navigation or contact insertion anchor is missing or ambiguous; no files changed.")

updated_index = index.replace(nav_anchor, nav_anchor + "  " + nav_link + "\n", 1)
updated_index = updated_index.replace(contact_anchor, "  </section>\n\n  " + section + "\n\n  <section class=\"contact-section section-pad\" id=\"contact\">", 1)
updated_index = updated_index.replace("<p class=\"eyebrow\">05 / Get in touch</p>", "<p class=\"eyebrow\">06 / Get in touch</p>", 1)
css_addition = "\n" + css_addition_path.read_text(encoding="utf-8").replace("/* Add to the end of assets/brand-overrides.css. */\n", "", 1).strip() + "\n"

# All anchors have been verified before either file is written.
index_path.write_text(updated_index, encoding="utf-8")
css_path.write_text(css.rstrip() + "\n" + css_addition, encoding="utf-8")
print("Media & Channels inserted. Review index.html and assets/brand-overrides.css before committing.")
