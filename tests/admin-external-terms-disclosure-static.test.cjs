"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Terms and Disclosure workbench uses Mainnet security dependencies", () => {
  const html = read("admin-external-terms-disclosure.html");
  const js = read("js/admin-external-terms-disclosure.js");
  assert.match(html, /js\/core\/environment-core\.js/);
  assert.match(html, /js\/core\/supabase-core\.js/);
  assert.match(html, /js\/core\/supabase-admin-auth\.js/);
  assert.match(js, /environment\.isMainnet\(\)/);
  assert.match(js, /auth\(\)\.ensureMfa\(\)/);
  assert.match(js, /currentLevel === "aal2"/);
});

test("Workbench restricts publication UI to global reviewer roles", () => {
  const js = read("js/admin-external-terms-disclosure.js");
  assert.match(js, /roles\.includes\("super_admin"\)/);
  assert.match(js, /roles\.includes\("approval_admin"\)/);
  assert.doesNotMatch(js, /roles\.includes\("external_admin"\)/);
});

test("Workbench calls only trusted Terms and Disclosure RPCs", () => {
  const js = read("js/admin-external-terms-disclosure.js");
  for (const rpc of [
    "get_external_project_applications",
    "get_external_project_terms_admin_workspace",
    "get_external_project_disclosure_admin_workspace",
    "start_external_project_terms",
    "save_external_project_terms_draft",
    "submit_external_project_terms",
    "review_external_project_terms",
    "publish_external_project_terms",
    "start_external_project_disclosure",
    "save_external_project_disclosure_draft",
    "submit_external_project_disclosure",
    "review_external_project_disclosure",
    "publish_external_project_disclosure"
  ]) assert.ok(js.includes('"' + rpc + '"'), "Missing RPC reference: " + rpc);
  assert.doesNotMatch(js, /\.from\s*\(/, "Direct table access must not be introduced.");
});

test("All required investor Disclosure sections are represented", () => {
  const js = read("js/admin-external-terms-disclosure.js");
  for (const key of [
    "project_overview", "ownership_and_control", "business_and_operations",
    "funding_and_use_of_funds", "investment_terms", "risk_disclosure",
    "due_diligence_summary", "custody_and_fund_controls", "legal_and_regulatory",
    "related_parties_and_conflicts", "fees_and_costs", "reporting_and_reconciliation",
    "assumptions_and_limitations", "investor_rights_and_obligations",
    "documents_and_references", "material_events"
  ]) assert.ok(js.includes('"' + key + '"'), "Missing required disclosure section: " + key);
});

test("Workbench has no browser storage, payment, payout or activation execution", () => {
  const js = read("js/admin-external-terms-disclosure.js");
  assert.doesNotMatch(js, /\b(?:localStorage|sessionStorage)\b/i);
  assert.doesNotMatch(js, /\b(?:createPayment|submitPayment|A2U|withdrawal|activate_external_project)\b/i);
});

test("Application review UI matches the trusted global reviewer and AAL2 gates", () => {
  const js = read("js/admin-external-projects.js");
  assert.match(js, /roles\.includes\("approval_admin"\)/);
  assert.match(js, /currentLevel!=="aal2"/);
  assert.doesNotMatch(js, /roles\.includes\("external_admin"\)/);
});

test("Disclosure drafts can be saved progressively while submission requires every section", () => {
  const js = read("js/admin-external-terms-disclosure.js");
  assert.match(js, /p_content: disclosureContent\(!!requireComplete\)/);
  assert.match(js, /disclosureContent\(true\)/);
});


test("Risk assessment UI uses the same global reviewer and actual AAL2 gates", () => {
  const html = read("admin-external-risk-assesment.html");
  assert.match(html, /roles\.includes\("super_admin"\)/);
  assert.match(html, /roles\.includes\("approval_admin"\)/);
  assert.match(html, /getAuthenticatorAssuranceLevel\(\)/);
  assert.match(html, /currentLevel!==\"aal2\"/);
  assert.doesNotMatch(html, /roles\.includes\("external_admin"\)/);
  assert.doesNotMatch(html, /AAL2 VERIFIED\";bind/);
});


test("Due Diligence page requires global reviewer authority and actual AAL2", () => {
  const html = read("admin-external-due-diligence.html");
  assert.match(html, /roles\.includes\("super_admin"\)/);
  assert.match(html, /roles\.includes\("approval_admin"\)/);
  assert.match(html, /getAuthenticatorAssuranceLevel\(\)/);
  assert.match(html, /currentLevel!==\"aal2\"/);
  assert.doesNotMatch(html, /roles\.includes\("external_admin"\)/);
  assert.doesNotMatch(html, /textContent=\"AAL2 VERIFIED\"/);
});

test("Funding page requires global reviewer authority and actual AAL2", () => {
  const html = read("admin-external-funding.html");
  assert.match(html, /roles\.includes\("super_admin"\)/);
  assert.match(html, /roles\.includes\("approval_admin"\)/);
  assert.match(html, /getAuthenticatorAssuranceLevel\(\)/);
  assert.match(html, /currentLevel!==\"aal2\"/);
  assert.doesNotMatch(html, /roles\.includes\("external_admin"\)/);
  assert.doesNotMatch(html, /textContent=\"AAL2 VERIFIED\"/);
});
