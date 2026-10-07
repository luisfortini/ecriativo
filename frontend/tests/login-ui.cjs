// Local UI regression checks. All authentication/API calls are mocked.
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.STUDIO_PREVIEW_URL || "http://127.0.0.1:5178";
const out = process.env.STUDIO_QA_DIR || path.join(process.cwd(), ".logs", "login-ui");

async function run() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [], unexpected = [], requests = [];
    page.on("pageerror", error => errors.push(error.message));
    const organization = { id: 1, name: "Estúdio de teste", role: "owner", accountType: "company" };
    const user = { id: 1, name: "Felipe Teste", email: "teste@example.invalid", role: "user", organizationRole: "owner", organization, organizations: [organization] };
    let mode = "invalid", releaseLogin;
    await context.route("**/api/**", async route => {
      const req = route.request(), endpoint = new URL(req.url()).pathname.replace(/^\/api/, "");
      const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Credentials": "true" };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      let data, status = 200;
      if (endpoint === "/auth/login") {
        requests.push(req.postDataJSON());
        if (mode === "offline") return route.abort("failed");
        if (mode === "pending") await new Promise(resolve => { releaseLogin = resolve; });
        if (mode === "invalid") { status = 401; data = { message: "E-mail ou senha inválidos. Confira seus dados." }; }
        else data = { token: "fixture-only", user };
      } else if (endpoint === "/auth/me") data = { user };
      else if (endpoint === "/clients") data = [];
      else { unexpected.push(endpoint); data = {}; }
      return route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify(data) });
    });
    await page.goto(origin + "/criar");
    await page.getByRole("heading", { name: "Vamos criar algo bom?" }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/login");
    assert.equal(await page.locator("#password").getAttribute("autocomplete"), "current-password");
    await page.screenshot({ path: path.join(out, "login-desktop.png"), fullPage: true });
    // Native validation blocks an empty form without a request.
    await page.getByRole("button", { name: "Entrar no meu estúdio" }).click();
    assert.equal(requests.length, 0);
    await page.getByLabel("Seu e-mail", { exact: true }).fill("teste@example.invalid");
    await page.getByLabel("Sua senha", { exact: true }).fill("fixture-password");
    await page.getByRole("button", { name: "Mostrar senha" }).click();
    assert.equal(await page.locator("#password").getAttribute("type"), "text");
    await page.getByRole("button", { name: "Ocultar senha" }).click();
    assert.equal(await page.locator("#password").getAttribute("type"), "password");
    await page.locator("#password").focus();
    await page.locator("#password").evaluate(input => input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "A", modifierCapsLock: true })));
    await page.getByText("Caps Lock está ativado.", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Entrar no meu estúdio" }).click();
    await page.getByRole("alert").waitFor();
    assert.equal(await page.locator(".login-error").evaluate(element => element === document.activeElement), true);
    assert.equal(await page.locator("#password").inputValue(), "fixture-password");
    await page.waitForTimeout(5500);
    assert.equal(await page.getByRole("alert").isVisible(), true);
    await page.screenshot({ path: path.join(out, "login-error-desktop.png"), fullPage: true });
    await page.locator(".login-help summary").click();
    await page.getByText("Use o e-mail cadastrado pela sua equipe.", { exact: false }).waitFor();
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "Horizontal overflow at " + width);
      await page.screenshot({ path: path.join(out, "login-error-" + width + ".png"), fullPage: true });
    }
    mode = "offline";
    await page.getByRole("button", { name: "Entrar no meu estúdio" }).click();
    await page.getByText("Não conseguimos conectar ao servidor.", { exact: false }).waitFor();
    mode = "pending";
    await page.locator("#password").press("Enter");
    await page.getByRole("button", { name: "Entrando no seu estúdio…" }).waitFor();
    assert.equal(await page.locator("#email").isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Entrando no seu estúdio…" }).isDisabled(), true);
    // Even a programmatic duplicate submit must not start a second login.
    await page.locator("form").evaluate(form => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(requests.length, 3);
    mode = "success";
    releaseLogin();
    await page.getByRole("heading", { name: "O que você quer criar?" }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/criar");
    await page.goto(origin + "/login");
    await page.getByRole("heading", { name: "Olá, Felipe." }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/");
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    assert.equal(requests[0].email, "teste@example.invalid");
    console.log("Login UI passed: desktop/mobile, overflow, password toggle, Caps Lock, persistent/focused errors, offline state, duplicate prevention, keyboard login, destination and restored session.");
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
