// All requests are fixtures. No real uploads, image generation or publishing.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||"playwright");
const origin=process.env.STUDIO_PREVIEW_URL||"http://127.0.0.1:5180";
const out=process.env.STUDIO_QA_DIR||path.join(process.cwd(),".logs","creation-ui");
fs.mkdirSync(out,{recursive:true});
async function main(){
  const browser=await chromium.launch({headless:true,channel:"msedge"});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage();
    const errors=[],unexpected=[];let submittedAd="",savedPlan=null,fail=true;
    page.on("pageerror",error=>errors.push(error.message));
    const org={id:1,name:"Estúdio QA",role:"owner",accountType:"agency"};
    const user={id:1,name:"Felipe",role:"user",organizationRole:"owner",organization:org,organizations:[org]};
    const profiles=[{id:10,name:"Marca A",segment:"Serviços",content_language:"English (US)",color_palette:"Azul escuro e branco",assets:[{id:5,type:"approved_reference",file_url:"https://old.invalid/uploads/style.png",description:"Estilo oficial"}],brand_analyses:[],profile_diagnostics:[],campaigns:[]},{id:20,name:"Marca B",assets:[],brand_analyses:[],profile_diagnostics:[],campaigns:[]}];
    const plans=[{id:99,client_id:10,client_name:"Marca A",name:"Plano antigo",active:false}];
    const headers={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"*","Access-Control-Allow-Credentials":"true"};
    await page.addInitScript(()=>{localStorage.setItem("ecriativo.auth.token","fixture-only");window.__APP_CONFIG__={VITE_API_URL:"http://localhost:3333/api"};});
    await context.route("**/api/**",async route=>{
      const req=route.request(),p=new URL(req.url()).pathname.replace(/^\/api/,""),method=req.method();
      if(method==="OPTIONS")return route.fulfill({status:204,headers});
      let data,status=200;
      if(p==="/auth/me")data={user};
      else if(p==="/clients")data=profiles;
      else if(/^\/clients\/\d+$/.test(p))data=profiles.find(profile=>profile.id===Number(p.split("/")[2]));
      else if(/\/visual-library$/.test(p))data=[{id:1,kind:"product",name:"Só anúncios",active:true,approved:true,allow_ads:true,allow_social:false,photos:[{id:1,file_url:"https://old.invalid/uploads/photo.png"}]},{id:2,kind:"product",name:"Só social",active:true,approved:true,allow_ads:false,allow_social:true,photos:[{id:2,file_url:"https://old.invalid/uploads/photo.png"}]}];
      else if(p==="/campaigns"&&method==="POST"){submittedAd=req.postData();status=503;data={message:"Falha simulada na geração. Seu preenchimento foi mantido."};}
      else if(p==="/social-media/plans"&&method==="GET")data=plans;
      else if(p==="/social-media/plans"&&method==="POST"){
        savedPlan=req.postDataJSON();
        if(fail){status=422;data={message:"Falha simulada ao salvar. Tente novamente."};fail=false;}
        else{plans.push({...savedPlan,id:100,client_name:"Marca A"});data={id:100};}
      }else if(/\/calendar$/.test(p))data={plan:plans.find(plan=>plan.id===Number(p.split("/")[3])),batches:[],contents:[]};
      else{unexpected.push(method+" "+p);data={};}
      await route.fulfill({status,headers,contentType:"application/json",body:JSON.stringify(data)});
    });
    await context.route("**/uploads/**",async route=>{
      assert.ok(route.request().url().startsWith("http://localhost:3333/"));
      if(route.request().method()==="OPTIONS")return route.fulfill({status:204,headers});
      assert.equal(route.request().headers().authorization,"Bearer fixture-only");
      await route.fulfill({headers,contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="150"><rect width="120" height="150" fill="#070021"/><text x="15" y="65" fill="white">Estilo A</text></svg>'});
    });
    await page.goto(origin+"/criar?purpose=ads");
    await page.getByRole("button",{name:"Continuar",exact:true}).click();
    await page.locator("#free_briefing-error").waitFor();
    await page.getByLabel("O que você quer anunciar?").fill("Divulgar o serviço de limpeza profissional.");
    await page.getByRole("button",{name:"Continuar",exact:true}).click();
    await page.getByLabel("Referência visual",{exact:true}).selectOption("5");
    await page.getByLabel("Produtos",{exact:true}).selectOption("manual");
    await page.getByLabel("Só anúncios",{exact:true}).check();
    assert.equal(await page.getByLabel("Só social",{exact:true}).count(),0);
    await page.getByRole("button",{name:"Continuar",exact:true}).click();
    await page.getByRole("button",{name:"Gerar anúncio com IA"}).click();
    await page.locator(".studio-inline-error").filter({hasText:"Falha simulada na geração"}).waitFor();
    assert.match(submittedAd,/"style_asset_id":5/);assert.match(submittedAd,/"product_ids":\[1\]/);
    await page.getByRole("button",{name:/Planejamento para redes sociais/}).click();
    await page.getByLabel("Nome do planejamento").fill("Semana de lançamento");
    await page.getByRole("button",{name:"Continuar",exact:true}).click();
    assert.equal(await page.getByLabel("Referência visual",{exact:true}).inputValue(),"5");
    await page.getByLabel("Post",{exact:true}).uncheck();await page.getByLabel("Carrossel (3 artes)",{exact:true}).check();
    await page.getByRole("button",{name:"Continuar",exact:true}).click();
    await page.locator(".studio-inline-error").filter({hasText:"entre 15 e 100"}).waitFor();
    await page.getByLabel("Limite de imagens por semana").fill("20");
    await page.getByLabel("Produtos",{exact:true}).selectOption("manual");await page.getByLabel("Só social",{exact:true}).check();
    assert.equal(await page.getByLabel("Só anúncios",{exact:true}).count(),0);
    await page.getByRole("button",{name:"Continuar",exact:true}).click();
    await page.getByRole("button",{name:"Voltar",exact:true}).click();
    while(await page.locator(".studio-error-notice").count())await page.locator(".studio-error-notice").getByRole("button",{name:"Fechar",exact:true}).click();
    await page.screenshot({path:path.join(out,"unified-style-desktop.png"),fullPage:true});
    await page.setViewportSize({width:320,height:900});
    await page.waitForTimeout(400); // Allow the existing responsive menu transition to finish.
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.screenshot({path:path.join(out,"unified-style-mobile.png"),fullPage:true});
    await page.getByRole("button",{name:"Continuar",exact:true}).click();
    await page.getByRole("button",{name:"Salvar planejamento"}).click();
    await page.locator(".studio-inline-error").filter({hasText:"Falha simulada ao salvar"}).waitFor();
    await page.getByRole("button",{name:"Salvar planejamento"}).click();
    await page.waitForURL("**/social-media?plan_id=100&created=1");
    await page.getByRole("combobox",{name:"Plano de conteúdo"}).waitFor();
    assert.equal(await page.getByRole("combobox",{name:"Plano de conteúdo"}).inputValue(),"100");
    assert.equal(savedPlan.active,false);assert.equal(savedPlan.automatic,false);assert.equal(savedPlan.visual_selection.style_asset_id,5);assert.deepEqual(savedPlan.visual_selection.product_ids,[2]);
    await page.goto(origin+"/nova-campanha?client_id=20");await page.waitForURL("**/criar?client_id=20&purpose=ads");
    await page.getByLabel("O que você quer anunciar?").fill("Ideia da marca B");await page.getByRole("button",{name:"Continuar",exact:true}).click();
    assert.equal(await page.getByLabel("Referência visual",{exact:true}).inputValue(),"");
    user.organizationRole="member";org.role="member";
    await page.goto(origin+"/criar?purpose=social");await page.getByLabel("O que você quer anunciar?").waitFor();
    assert.equal(await page.getByRole("button",{name:/Planejamento para redes sociais/}).count(),0);
    assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
    console.log("PASS: unified ad/social wizard, persistent style, purpose permissions, limits, inline failures/retry, exact new plan selection, brand reset, member restriction, authenticated previews and mobile layout.");
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
