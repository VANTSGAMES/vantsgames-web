import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyGoogleOAuthError } from "../client/src/lib/googleOAuthErrors";
import { NAV, PERFIL_LINKS } from "../client/src/lib/nav";

describe("googleOAuthErrors (sin Firebase)", () => {
  it("classifies gsi_script_blocked with CSP guidance for accounts.google.com", () => {
    const res = classifyGoogleOAuthError("gsi_script_blocked", "", "vants.cc");
    assert.equal(res.needsHostConfig, true);
    assert.match(res.actionHint || "", /accounts\.google\.com/);
    assert.match(res.description, /vants\.cc/);
  });

  it("classifies origin_mismatch with Authorized JavaScript origins guidance", () => {
    const res = classifyGoogleOAuthError("origin_mismatch", "", "vants.cc");
    assert.equal(res.needsHostConfig, true);
    assert.match(res.actionHint || "", /https:\/\/vants\.cc/);
  });

  it("classifies popup_closed without host config warning", () => {
    const res = classifyGoogleOAuthError("popup_closed", "", "vants.cc");
    assert.equal(res.needsHostConfig, false);
    assert.match(res.title, /cancelado/i);
  });
});

describe("clean removal of VANTS AI Studio, Mapa de Arenas LAN, and Firebase", () => {
  it("does not expose /arenas or /ai-studio in NAV or PERFIL_LINKS", () => {
    const allLinks = [...NAV.flatMap((g) => g.links), ...PERFIL_LINKS];
    assert.equal(allLinks.some((l) => l.to === "/arenas" || /mapa de arenas/i.test(l.label)), false);
    assert.equal(allLinks.some((l) => l.to === "/ai-studio" || /ai studio/i.test(l.label)), false);
  });

  it("does not import Firebase in googleWorkspace.ts or middleware/auth.ts", () => {
    const wsSrc = readFileSync("client/src/lib/googleWorkspace.ts", "utf8");
    const mwSrc = readFileSync("src/middleware/auth.ts", "utf8");
    assert.equal(/firebase/i.test(wsSrc), false);
    assert.equal(/firebase/i.test(mwSrc), false);
  });

  it("requests ONLY 4 non-sensitive Google scopes (zero Gmail/Sheets/Docs/Calendar/Drive.readonly scopes)", () => {
    const wsSrc = readFileSync("client/src/lib/googleWorkspace.ts", "utf8");
    const authJsSrc = readFileSync("integraciones/src/auth.js", "utf8");
    for (const src of [wsSrc, authJsSrc]) {
      assert.match(src, /https:\/\/www\.googleapis\.com\/auth\/drive\.file/);
      assert.equal(/googleapis\.com\/auth\/(gmail|spreadsheets|documents|calendar|tasks|chat|forms|meetings|drive\.readonly)/i.test(src), false);
    }
  });

  it("includes Google API Services User Data Policy (Limited Use) and preserves Riot RSO compliance in privacidad.html", () => {
    const priv = readFileSync("client/src/content/privacidad.html", "utf8");
    assert.match(priv, /Google API Services User Data Policy/i);
    assert.match(priv, /Limited Use/i);
    assert.match(priv, /drive\.file/i);
    assert.match(priv, /Riot Sign On/i);
  });
});
