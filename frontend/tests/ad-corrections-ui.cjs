// Local UI checks: all authentication, campaign data and generation calls are fixtures.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.STUDIO_PREVIEW_URL || "http://127.0.0.1:5179";
const out = process.env.STUDIO_QA_DIR || path.join(process.cwd(), ".logs", "ad-corrections-ui");
fs.mkdirSync(out, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    const errors = [], unexpected = [], correctionRequests = [];
    page.on("pageerror", error => errors.push(error.message));
    const org = { id: 1, name: "Estúdio de teste", role: "owner", accountType: "company" };
    const user = { id: 1, name: "Felipe", role: "user", organizationRole: "owner", organization: org, organizations: [org] };
    const campaign = { id: 30, client_id: 10, cliente: "Café da Serra", segmento: "Cafeteria", formato: "4:5", created_at: "2026-10-07T12:00:00Z", status: "completed", creative_status: "approved", image_url: "https://fixture.invalid/generated/old.png", generated_image_url: "https://fixture.invalid/generated/old.png", strategy: { headline: "Uma pausa que inspira", texto_principal: "Legenda original do anúncio", cta: "Conheça nosso café", angulo: "Pausa", publico: "Local", promessa: "Café de qualidade", briefing_criativo: {} }, creative: { prompt_imagem: "Original", negative_prompt: "Logo inventada", direcao_visual_resumida: "Azul e branco" }, reviews: [], pipeline_run: null, image_corrections: [] };
    let failRequest = true,failRestore=true;
    const restoreRequests=[];
    await page.addInitScript(() => localStorage.setItem("ecriativo.auth.token", "fixture-only"));
    await context.route("**/api/**", async route => {
      const req = route.request(), p = new URL(req.url()).pathname.replace(/^\/api/, "");
      const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Credentials": "true" };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      let data, status = 200;
      if (p === "/auth/me") data = { user };
      else if (p === "/clients") data = [{ id: 10, name: "Café da Serra" }];
      else if (p === "/campaigns/30/navigation") data = { previous_id: null, next_id: null };
      else if (p === "/campaigns/30") data = campaign;
      else if (p === "/campaigns/30/image-corrections" && req.method() === "POST") {
        const body = req.postDataJSON(); correctionRequests.push(body);
        if (failRequest) { status = 503; data = { message: "Falha simulada. Tente novamente." }; }
        else { const correction = { id: correctionRequests.length, campaign_id: 30, note: body.note, status: "queued", before_image_url: campaign.image_url, image_url: null, created_at: "2026-10-07T15:00:00Z", requester_name: "Felipe" }; campaign.image_corrections.unshift(correction); data = { correction }; }
      } else if(p==="/campaigns/30/restore-image-version"&&req.method()==="POST") {
        const body=req.postDataJSON();restoreRequests.push(body);
        if(failRestore){status=422;data={message:"Arquivo indisponível. A versão atual foi mantida."};failRestore=false;}
        else {const source=campaign.image_corrections.find(item=>item.id===body.correction_id);const url=body.version==="before"?source.before_image_url:source.image_url;
          campaign.image_corrections.unshift({id:100+restoreRequests.length,campaign_id:30,note:"Versão restaurada, sem geração",status:"completed",before_image_url:campaign.image_url,image_url:url,created_at:"2026-10-07T16:00:00Z"});campaign.image_url=url;campaign.creative_status="waiting_review";data=campaign;}
      } else { unexpected.push(p); data = {}; }
      await route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify(data) });
    });
    await context.route("**/generated/**", async route => {
      const req = route.request();
      const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Credentials": "true" };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      await route.fulfill({ headers, contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="675"><rect width="540" height="675" fill="#070021"/><circle cx="270" cy="380" r="160" fill="#ccd7e9"/><text x="35" y="110" fill="white" font-family="sans-serif" font-size="35">${req.url().includes("new.png") ? "Seu café. Sua pausa." : "Uma pausa que inspira"}</text><text x="35" y="635" fill="white" font-family="sans-serif" font-size="20">Café da Serra</text></svg>` });
    });
    await page.goto(origin + "/campanhas/30");
    await page.getByRole("button", { name: "Corrigir arte", exact: true }).click();
    await page.getByRole("button", { name: "Gerar versão corrigida", exact: true }).click();
    await page.getByText("Descreva o ajuste desejado com pelo menos 5 caracteres.").waitFor();
    assert.equal(correctionRequests.length, 0);
    await page.getByLabel("O que você quer corrigir?").fill("Trocar o título e manter as cores e as fotos reais.");
    await page.getByRole("button", { name: "Gerar versão corrigida", exact: true }).click();
    await page.getByText("Falha simulada. Tente novamente.").waitFor();
    assert.equal(await page.getByLabel("O que você quer corrigir?").inputValue(), "Trocar o título e manter as cores e as fotos reais.");
    await page.screenshot({ path: path.join(out,"ad-correction-form.png"), fullPage: true });
    failRequest = false;
    await page.getByRole("button", { name: "Gerar versão corrigida", exact: true }).click();
    await page.locator(".ad-correction-progress").getByText("Na fila", { exact: true }).waitFor();
    assert.equal(correctionRequests[1].base_image_url, "https://fixture.invalid/generated/old.png");
    assert.equal(await page.getByRole("button", { name: "Aprovar", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Enviar via WhatsApp", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Corrigir arte", exact: true }).count(), 0);
    await page.reload();
    await page.locator(".ad-correction-progress").getByText("Na fila", { exact: true }).waitFor();
    const correction = campaign.image_corrections[0]; correction.status = "processing";
    await page.locator(".ad-correction-progress").getByText("Corrigindo a imagem", { exact: true }).waitFor();
    correction.status = "completed"; correction.image_url = "https://fixture.invalid/generated/new.png";
    campaign.image_url = correction.image_url; campaign.creative_status = "waiting_review";
    await page.getByText("Nova versão pronta.", { exact: false }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Aprovar", exact: true }).isDisabled(), false);
    assert.equal(await page.locator(".studio-campaign-content").getByText("Legenda original do anúncio", { exact: true }).count(), 1);
    await page.getByText("Histórico de correções (1)", { exact: true }).click();
    await page.getByRole("img", { name: "Arte antes desta correção" }).waitFor();
    await page.getByRole("img", { name: "Arte corrigida nesta versão" }).waitFor();
    await page.screenshot({ path: path.join(out,"ad-correction-history.png"), fullPage: true });
    await page.getByRole("button",{name:"Usar esta versão",exact:true}).click();
    await page.getByRole("button",{name:"Confirmar uso desta versão",exact:true}).click();
    await page.getByText("Arquivo indisponível. A versão atual foi mantida.").waitFor();
    assert.equal(campaign.image_url,"https://fixture.invalid/generated/new.png");
    await page.getByRole("button",{name:"Confirmar uso desta versão",exact:true}).click();
    await page.getByText("Versão restaurada, sem custo de IA.",{exact:false}).waitFor();
    assert.equal(campaign.image_url,"https://fixture.invalid/generated/old.png");
    assert.equal(restoreRequests[1].version,"before");
    assert.equal(correctionRequests.length,2); // Restoration does not request a new generation.
    await page.screenshot({path:path.join(out,"ad-restored-version.png"),fullPage:true});
    await page.locator(".ad-correction-history").first().getByRole("button",{name:"Usar esta versão",exact:true}).click();
    await page.getByRole("button",{name:"Confirmar uso desta versão",exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll(".ad-correction-history").length===3);
    assert.equal(campaign.image_url,"https://fixture.invalid/generated/new.png");
    await page.getByRole("button", { name: "Corrigir arte", exact: true }).click();
    await page.getByLabel("O que você quer corrigir?").fill("Aumentar o telefone na imagem.");
    await page.getByRole("button", { name: "Gerar versão corrigida", exact: true }).click();
    const failed = campaign.image_corrections[0]; failed.status = "failed"; failed.error_message = "Falha simulada de geração.";
    await page.getByText("A correção não foi concluída. A arte anterior foi mantida.").waitFor();
    assert.equal(campaign.image_url, "https://fixture.invalid/generated/new.png");
    await page.getByRole("button", { name: "Usar este pedido novamente", exact: true }).click();
    assert.equal(await page.getByLabel("O que você quer corrigir?").inputValue(), "Aumentar o telefone na imagem.");
    assert.equal(correctionRequests.length, 3);
    for (const width of [390,320]) {
      await page.setViewportSize({ width, height: 950 });
      await page.waitForTimeout(250); // Let the existing sidebar breakpoint transition finish.
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Horizontal overflow at " + width);
      await page.screenshot({ path: path.join(out,`ad-correction-${width}.png`), fullPage: true });
    }
    user.organizationRole = "member"; await page.reload();
    await page.getByText("Peça a um administrador da conta para solicitar uma correção.").waitFor();
    assert.equal(await page.getByRole("button", { name: "Corrigir arte", exact: true }).count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    console.log("PASS: form validation, persistent local errors, note preservation, version baseline, queued/reload/processing/completion polling, approval guard, unchanged caption, before/after history, failed retry, mobile and read-only member access.");
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
