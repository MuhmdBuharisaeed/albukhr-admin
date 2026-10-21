"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("staging lab has no LocalStorage or sessionStorage dependency", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../app/admin-session-lab.js"),
    "utf8"
  );
  assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage)\b/i);
});
