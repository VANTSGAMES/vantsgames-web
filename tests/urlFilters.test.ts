import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildTorneosPath,
  normalizeJuegoSlug,
  parseQueryParam,
  validateTacticalNote,
} from "../client/src/lib/urlFilters.ts";

describe("urlFilters — parsing de ?juego= en history y hash routing", () => {
  it("lee ?juego= desde window.location.search (history routing)", () => {
    assert.equal(parseQueryParam("juego", "?juego=valorant&estado=upcoming", ""), "valorant");
  });

  it("lee ?juego= desde window.location.hash (hash routing)", () => {
    assert.equal(parseQueryParam("juego", "", "#/torneos?juego=cs2"), "cs2");
    assert.equal(parseQueryParam("juego", "", "#/torneos?estado=ongoing&juego=clashroyale"), "clashroyale");
  });

  it("prioriza search si ambos existen y devuelve vacío si no existe", () => {
    assert.equal(parseQueryParam("juego", "?juego=fortnite", "#/torneos?juego=lol"), "fortnite");
    assert.equal(parseQueryParam("juego", "", "#/torneos"), "");
  });

  it("normaliza slugs válidos de los 11 juegos y descarta slugs inválidos", () => {
    assert.equal(normalizeJuegoSlug("VALORANT"), "valorant");
    assert.equal(normalizeJuegoSlug("  wildrift "), "wildrift");
    assert.equal(normalizeJuegoSlug("juego-inexistente"), "");
    assert.equal(normalizeJuegoSlug(null), "");
  });

  it("construye rutas limpias para /torneos", () => {
    assert.equal(buildTorneosPath("cs2"), "/torneos?juego=cs2");
    assert.equal(buildTorneosPath("invalid"), "/torneos");
    assert.equal(buildTorneosPath(""), "/torneos");
  });
});

describe("validateTacticalNote — validación de notas tácticas", () => {
  it("acepta notas válidas y normaliza juego", () => {
    const res = validateTacticalNote({
      title: "  Ejecución A Mirage  ",
      content: "  Smoke CT + Stairs + Jungle  ",
      gameSlug: "CS2",
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.title, "Ejecución A Mirage");
      assert.equal(res.content, "Smoke CT + Stairs + Jungle");
      assert.equal(res.gameSlug, "cs2");
    }
  });

  it("rechaza títulos o contenidos vacíos o muy cortos", () => {
    const shortTitle = validateTacticalNote({ title: "A", content: "Contenido válido" });
    assert.equal(shortTitle.ok, false);
    const shortContent = validateTacticalNote({ title: "Título válido", content: " " });
    assert.equal(shortContent.ok, false);
  });
});
