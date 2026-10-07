// Run on a local frontend. All assets, authentication and uploads are fixtures.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.STUDIO_PREVIEW_URL || "http://127.0.0.1:5178";
const out = process.env.STUDIO_QA_DIR || path.join(process.cwd(), ".logs", "brand-assets-ui");
fs.mkdirSync(out, { recursive: true });
const svg = color => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220"><path d="M160 70L200 40L240 70V120H160Z" fill="none" stroke="${color}" stroke-width="7"/><text x="200" y="165" text-anchor="middle" fill="${color}" font-family="sans-serif" font-size="29">Café da Serra</text></svg>`;

async function run() {
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    const errors = [], unexpected = [], mediaRequests = [];
    page.on("pageerror", error => errors.push(error.message));
    const org = { id: 1, name: "Estúdio de teste", role: "owner", accountType: "company" };
    const user = { id: 1, name: "Felipe", role: "user", organizationRole: "owner", organization: org, organizations: [org] };
    const makeAsset = (id, type, file, description) => ({ id, client_id: 10, type, file_url: "https://old-host.example.invalid/uploads/" + file, description });
    const profile = { id: 10, name: "Café da Serra", segment: "Cafeteria", content_language: "Português", color_palette: "Azul e branco", assets: [makeAsset(1,"logo_main","logo.png","Logo oficial"),makeAsset(2,"logo_white","white.png","Versão branca"),makeAsset(3,"reference_image","reference.jpg","Referência de publicação"),makeAsset(4,"brand_material","guide.PDF","Manual da marca"),makeAsset(5,"reference_image","missing.png","Referência antiga")], brand_analyses: [], profile_diagnostics: [], campaigns: [] };
    await page.addInitScript(() => localStorage.setItem("ecriativo.auth.token", "fixture-only"));
    await context.route("**/api/**", async route => {
      const req = route.request(), p = new URL(req.url()).pathname.replace(/^\/api/, "");
      const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Credentials": "true" };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      let data;
      if (p === "/auth/me") data = { user };
      else if (p === "/clients") data = [profile];
      else if (p === "/clients/10") data = profile;
      else if (p.endsWith("/whatsapp-settings")) data = {};
      else if (p === "/clients/10/assets" && req.method() === "POST") {
        profile.assets = [makeAsset(6,"logo_main","new-logo.png","Logo atualizada"),...profile.assets.filter(asset => asset.type !== "logo_main")]; data = profile.assets[0];
      } else { unexpected.push(p); data = {}; }
      await route.fulfill({ headers, contentType: "application/json", body: JSON.stringify(data) });
    });
    await context.route("**/uploads/**", async route => {
      const req = route.request(), url = new URL(req.url());
      const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Credentials": "true" };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      mediaRequests.push({ host: url.hostname, authorization: req.headers().authorization });
      if (url.pathname.endsWith("missing.png")) return route.fulfill({ status: 404, headers, body: "Missing fixture" });
      if (url.pathname.toLowerCase().endsWith(".pdf")) return route.fulfill({ headers, contentType: "application/pdf", body: "%PDF-1.4\n%%EOF" });
      await route.fulfill({ headers, contentType: "image/svg+xml", body: svg(url.pathname.endsWith("white.png") ? "#fff" : "#070021") });
    });
    await page.goto(origin + "/clientes/10");
    await page.getByRole("heading", { name: "Arquivos cadastrados" }).waitFor();
    const gallery = page.locator(".brand-asset-list");
    await gallery.getByRole("img", { name: "Logo oficial", exact: true }).waitFor();
    assert.equal(await gallery.getByRole("img", { name: "Logo oficial", exact: true }).evaluate(image => image.complete && image.naturalWidth > 0), true);
    assert.equal(await gallery.locator(".brand-asset-card").count(), 5);
    await gallery.getByText("Imagem indisponível").waitFor();
    await gallery.getByRole("button", { name: "Ampliar Logo principal: Logo oficial" }).click();
    await page.getByRole("dialog").waitFor();
    await page.getByRole("dialog").getByRole("img", { name: "Logo oficial" }).waitFor();
    await page.screenshot({ path: path.join(out, "brand-asset-expanded.png"), fullPage: true });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("dialog").getByRole("button", { name: "Baixar Logo principal: Logo oficial" }).click();
    assert.equal((await downloadPromise).suggestedFilename(), "logo.png");
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Ampliar Logo principal: Logo oficial");
    await gallery.getByRole("button", { name: "Ampliar Logo branca: Versão branca" }).click();
    assert.equal(await page.getByRole("dialog").locator(".brand-asset-large").evaluate(el => el.classList.contains("brand-asset-dark")), true);
    await page.getByRole("button", { name: "Fechar visualização" }).click();
    const pdfPromise = page.waitForEvent("download");
    await gallery.getByRole("button", { name: "Baixar Material da marca: Manual da marca" }).click();
    assert.equal((await pdfPromise).suggestedFilename(), "guide.PDF");
    await gallery.getByRole("button", { name: "Baixar Imagem de referência: Referência antiga" }).click();
    await gallery.getByRole("alert").waitFor();
    await page.screenshot({ path: path.join(out, "brand-assets-desktop.png"), fullPage: true });
    await page.reload();
    await gallery.getByRole("img", { name: "Logo oficial", exact: true }).waitFor();
    await page.locator('input[type="file"]').setInputFiles({ name: "new-logo.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH0kAAAAASUVORK5CYII=", "base64") });
    await page.getByRole("button", { name: "Adicionar arquivo", exact: true }).click();
    await gallery.getByRole("img", { name: "Logo atualizada", exact: true }).waitFor();
    assert.equal(await gallery.getByRole("img", { name: "Logo oficial", exact: true }).count(), 0);
    await page.reload();
    await gallery.getByRole("img", { name: "Logo atualizada", exact: true }).waitFor();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await gallery.getByRole("button", { name: "Ampliar Logo principal: Logo atualizada" }).click();
      await page.getByRole("dialog").getByRole("img").waitFor();
      assert.equal(await page.getByRole("dialog").evaluate(el => el.scrollWidth <= el.clientWidth), true);
      await page.screenshot({ path: path.join(out, `brand-asset-expanded-${width}.png`), fullPage: true });
      await page.getByRole("button", { name: "Fechar visualização" }).click();
    }
    assert.equal(mediaRequests.every(req => req.authorization === "Bearer fixture-only" && req.host !== "old-host.example.invalid"), true);
    profile.assets = [];
    await page.reload();
    await page.getByText("Nenhum arquivo adicionado ainda.").waitFor();
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    console.log("PASS: authenticated thumbnails/downloads, old host remapping, transparent logos, modal/keyboard/focus, PDF, missing files, upload replacement, reload persistence, mobile and empty state.");
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
