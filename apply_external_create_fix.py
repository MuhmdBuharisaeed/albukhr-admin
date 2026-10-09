#!/usr/bin/env python3
"""Apply the ALBUKHR External Project create/governance fix to an app checkout.

Run from the repository root:
  python apply_external_create_fix.py --check
  python apply_external_create_fix.py

The script changes only four approved files and refuses to write if any expected
source anchor is missing or duplicated.
"""
from __future__ import annotations
import argparse
import sys
from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one source match, found {count}; no files were written.")
    return source.replace(old, new, 1)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate source anchors without writing files")
    args = parser.parse_args()
    root = Path.cwd()

    targets = {
        "html": root / "external-create.html",
        "css": root / "css" / "external-create.css",
        "policy": root / "js" / "external-project-policy-consent.js",
        "create": root / "js" / "external-create.js",
    }
    missing = [str(p.relative_to(root)) for p in targets.values() if not p.is_file()]
    if missing:
        print("Run this script from the albukhr-app repository root. Missing: " + ", ".join(missing), file=sys.stderr)
        return 2

    changed = {key: path.read_text(encoding="utf-8") for key, path in targets.items()}
    try:
        # The current external-create.html contains two byte-for-byte identical full
        # HTML documents concatenated together. Remove one copy before patching.
        html_source = changed["html"]
        if html_source.count("<!DOCTYPE html>") > 1:
            midpoint = len(html_source) // 2
            if len(html_source) % 2 == 0 and html_source[:midpoint] == html_source[midpoint:]:
                changed["html"] = html_source[:midpoint]
            else:
                raise RuntimeError("external-create.html contains multiple document roots but they are not identical duplicates; no files were written.")

        # HTML: do not expose the application form before consent is accepted.
        changed["html"] = replace_once(
            changed["html"],
            '<link rel="stylesheet" href="css/external-create.css">',
            '<link rel="stylesheet" href="css/external-create.css?v=20261009-consent-gate-2">',
            "HTML CSS cache version",
        )
        changed["html"] = replace_once(
            changed["html"],
            '<form id="externalProjectForm" novalidate>',
            '<form id="externalProjectForm" hidden novalidate>',
            "initially hide form",
        )
        changed["html"] = replace_once(
            changed["html"],
            '<script src="js/external-project-policy-consent.js"></script>',
            '<script src="js/external-project-policy-consent.js?v=20261009-consent-gate-2"></script>',
            "consent script cache version",
        )
        changed["html"] = replace_once(
            changed["html"],
            '<script src="js/external-create.js?v=20261008-logo-1"></script>',
            '<script src="js/external-create.js?v=20261009-validation-2"></script>',
            "create script cache version",
        )

        # CSS: author styles must never override hidden state for these two elements.
        changed["css"] = replace_once(
            changed["css"],
            '*{box-sizing:border-box}',
            '*{box-sizing:border-box}\n#externalProjectForm[hidden],#externalPolicyConsentGate[hidden]{display:none!important}',
            "hidden-state CSS rule",
        )

        # Policy gate: insert a visible pending state immediately, before async auth/policy reads.
        lock_form = '''function lockForm(){
const form=$("externalProjectForm");
if(!form)return;
form.hidden=true;
let gate=$("externalPolicyConsentGate");
if(!gate){
gate=document.createElement("section");
gate.id="externalPolicyConsentGate";
gate.className="external-policy-consent-gate";
gate.innerHTML="<div class='eyebrow'>ALBUKHR EXTERNAL PROJECT GOVERNANCE</div><h2>Verifying Policy &amp; Builder Guidance...</h2><p>Please wait while ALBUKHR verifies your sign-in and loads the current policy versions. The application form remains locked until acknowledgment is recorded.</p>";
if(form.parentNode)form.parentNode.insertBefore(gate,form);
}
}
function render(){style();const form=$("externalProjectForm");'''
        changed["policy"] = replace_once(
            changed["policy"],
            'function render(){style();const form=$("externalProjectForm");',
            lock_form,
            "insert immediate policy lock",
        )

        old_failure = '''const g=document.createElement("section");g.className="external-policy-consent-gate";g.innerHTML=`<h2>Policy acknowledgment unavailable</h2><p>The External Project application cannot continue until the current ALBUKHR Policy and Builder Guidance can be verified.</p><p class="external-policy-consent-status error">${esc(e?.message||"Unknown error")}</p>`;if(form?.parentNode)form.parentNode.insertBefore(g,form);'''
        new_failure = '''let g=$("externalPolicyConsentGate");if(!g){g=document.createElement("section");g.id="externalPolicyConsentGate";if(form?.parentNode)form.parentNode.insertBefore(g,form);}g.className="external-policy-consent-gate";g.innerHTML=`<h2>Policy acknowledgment unavailable</h2><p>The External Project application cannot continue until the current ALBUKHR Policy and Builder Guidance can be verified.</p><p class="external-policy-consent-status error">${esc(e?.message||"Unknown error")}</p>`;'''
        changed["policy"] = replace_once(changed["policy"], old_failure, new_failure, "reuse policy gate on verification failure")
        changed["policy"] = replace_once(
            changed["policy"],
            'if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize,{once:true});else initialize();',
            'style();lockForm();if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize,{once:true});else initialize();',
            "lock form before asynchronous initialization",
        )

        # Form currently uses novalidate and manually checks only a subset of required fields.
        changed["create"] = replace_once(
            changed["create"],
            'function validate(p){\n  for(const k of["p_project_name","p_business_name","p_country","p_contact_email"]){',
            'function validate(p){\n  const form=$("externalProjectForm");\n  if(form&&!form.checkValidity()){\n    form.reportValidity();\n    throw new Error("Complete all required fields and correct any invalid values.");\n  }\n\n  for(const k of["p_project_name","p_business_name","p_country","p_contact_email"]){',
            "validate all HTML required fields",
        )
        # Preserve the new application's ID in the URL if logo upload fails, enabling a safe retry.
        changed["create"] = replace_once(
            changed["create"],
            '      id=await create(p);\n      edit=true;\n      status="draft";',
            '      id=await create(p);\n      keepEditingAfterCreate(id);',
            "preserve application ID after creation",
        )
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 3

    print("Validated these files:")
    for key, path in targets.items():
        changed_flag = changed[key] != path.read_text(encoding="utf-8")
        print(f"  {'READY' if changed_flag else 'NO CHANGE'}  {path.relative_to(root)}")
    if args.check:
        print("CHECK ONLY: no files written.")
        return 0

    # All source anchors validated before the first write; save only targeted files.
    for key, path in targets.items():
        path.write_text(changed[key], encoding="utf-8")
    print("Applied successfully. Review the diff and run your normal tests before deployment.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
