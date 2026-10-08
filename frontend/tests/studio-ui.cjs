// Run against a local frontend with a Playwright installation supplied by PLAYWRIGHT_MODULE.
// All APIs and media are fixtures: no real login, AI generation, upload or publication.
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.STUDIO_PREVIEW_URL || "http://127.0.0.1:5178";
const out = process.env.STUDIO_QA_DIR || path.join(process.cwd(), ".logs", "studio-ui");
fs.mkdirSync(out,{recursive:true});

async function run() {
  const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||"msedge"});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1100}});
    const page=await context.newPage();
    const errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    const org={id:1,name:"Estúdio Horizonte",slug:"horizonte",role:"owner",accountType:"agency",planCode:"pro",billingStatus:"active"};
    const user={id:1,name:"Felipe Fortini",email:"teste@example.invalid",role:"user",organizationRole:"owner",organization:org,organizations:[org]};
    const profiles=[{id:10,name:"Café da Serra",segment:"Cafeteria",business_description:"Café de qualidade para a sua pausa",color_palette:"Azul escuro e branco",content_language:"Português brasileiro",city:"Campinas",time_zone:"America/Sao_Paulo",brand_voice:"Acolhedor",contact_phone:"+55 19 99999-9999",instagram_handle:"cafedaserra",address:"Rua das Flores, 10",anniversary_date:"10-08",assets:[],brand_analyses:[],profile_diagnostics:[],campaigns:[]},{id:20,name:"Ateliê Aurora",segment:"Moda",business_description:"Moda autoral",color_palette:"Azul escuro e branco",content_language:"English (US)",city:"São Paulo",time_zone:"America/Sao_Paulo",brand_voice:"Elegante",assets:[],brand_analyses:[],profile_diagnostics:[],campaigns:[]}];
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="540" height="675"><rect width="540" height="675" fill="#070021"/><text x="55" y="180" fill="white" font-size="36">Uma pausa</text><text x="55" y="230" fill="white" font-size="36">que inspira.</text><circle cx="265" cy="440" r="120" fill="#dde2ee"/><text x="55" y="630" fill="white" font-size="20">Café da Serra</text></svg>';
    const image="data:image/svg+xml;base64,"+Buffer.from(svg).toString("base64");
    const oldImage="https://fixture.invalid/generated/previous.png";
    const contents=[{id:100,batch_id:5,scheduled_date:"2026-10-08",format:"carousel",topic:"Sua pausa merece um café",caption:"Uma pausa para começar o dia. @cafedaserra",alt_text:"Café da Serra",status:"review",error_message:null,images:[{url:image},{url:image},{url:image}],sources:[],revisions:[{at:"2026-10-07T15:00:00Z",caption:"Legenda da versão anterior",images:[{url:oldImage},{url:oldImage},{url:oldImage}]}]}];
    let failRestore=true,restoreRequest;
    const plans=[{id:1,client_id:10,client_name:"Café da Serra",name:"Semana acolhedora",active:true,automatic:false,posts_per_week:3,pillars:["Bastidores"],formats:["carousel"],weekly_image_limit:10,visual_selection:{}},{id:2,client_id:20,client_name:"Ateliê Aurora",name:"Coleção Aurora",active:true,automatic:false,posts_per_week:3,pillars:["Moda"],formats:["post"],weekly_image_limit:10,visual_selection:{}}];
    let savedProfile=null, correction=null, savedPlan=null, schedule=null;
    await page.addInitScript(()=>localStorage.setItem("ecriativo.auth.token","fixture-only"));
    await page.route("**/api/**",async route=>{
      const req=route.request(), url=new URL(req.url()), p=url.pathname.replace(/^\/api/,""), method=req.method();
      if(method==="OPTIONS")return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"*","Access-Control-Allow-Credentials":"true"}});
      let data,status=200;
      if(p==="/auth/me")data={user};
      else if(p==="/clients"&&method==="GET")data=org.accountType==="company"?[profiles[0]]:profiles;
      else if(/^\/clients\/\d+\/visual-library$/.test(p))data=[];
      else if(/whatsapp-settings$/.test(p))data={};
      else if(/^\/clients\/\d+$/.test(p)){
        const item=profiles.find(v=>v.id===Number(p.split("/")[2]));
        if(method==="PUT"){savedProfile=req.postDataJSON();Object.assign(item,savedProfile);}
        data=item;
      }
      else if(p==="/campaigns")data=[];
      else if(p==="/social-media/plans"&&method==="GET")data=plans;
      else if(p==="/social-media/plans"&&method==="POST"){savedPlan=req.postDataJSON();const plan={...savedPlan,id:3,client_name:profiles.find(v=>v.id===savedPlan.client_id)?.name};plans.push(plan);data=plan;}
      else if(/\/calendar$/.test(p)){const plan=plans.find(v=>v.id===Number(p.split("/")[3]));data={plan,batches:[],contents:plan.client_id===10?contents:[]};}
      else if(/\/publishing$/.test(p))data={enabled:false,configured:false,time_zone:"America/Sao_Paulo",accounts:[{id:7,platform:"instagram",name:"cafedaserra",active:true}],publications:[]};
      else if(/\/corrections$/.test(p)){correction=req.postDataJSON();data={queued:1,images:correction.targets[0].image_indexes.length};}
      else if(/\/restore-version$/.test(p)){restoreRequest=req.postDataJSON();if(failRestore){status=409;data={message:"Cancele o agendamento antes de restaurar."};failRestore=false;}else{const item=contents[0],version=item.revisions[restoreRequest.version_index];item.revisions.push({at:"2026-10-07T16:00:00Z",caption:item.caption,images:item.images});item.caption=version.caption;item.images=version.images;item.status="review";data={ok:true};}}
      else if(/\/approve$/.test(p)){contents[0].status="approved";data={};}
      else if(/\/schedule$/.test(p)){schedule=req.postDataJSON();data={};}
      else if(p==="/organization/members")data=[{...user,role:"owner",status:"active",created_at:"2026-10-01"}];
      else if(p==="/organization/experience"){
        const value=req.postDataJSON().account_type;
        if(value==="company"&&profiles.length>1){status=409;data={message:"Esta conta já atende várias marcas. Mantenha agência/profissional para preservar todos os clientes."};}
        else{org.accountType=value;data={accountType:org.accountType};}
      }
      else {throw new Error("Unexpected mock endpoint: "+method+" "+p);}
      await route.fulfill({status,contentType:"application/json",headers:{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Credentials":"true"},body:JSON.stringify(data)});
    });
    await page.goto(origin);await page.getByRole("heading",{name:"Olá, Felipe."}).waitFor();
    await page.screenshot({path:path.join(out,"home-agency.png"),fullPage:true});
    await page.getByRole("combobox",{name:"Marca em trabalho"}).selectOption("20");
    await page.getByRole("heading",{name:"Olá, Felipe."}).waitFor();
    await page.getByRole("link",{name:"Perfil da marca"}).click();
    await page.getByRole("heading",{name:"Vamos preparar Ateliê Aurora"}).waitFor();
    assert.equal(await page.locator("#brand-name").inputValue(),"Ateliê Aurora");
    await page.getByRole("link",{name:"Início",exact:true}).click();
    await page.getByRole("combobox",{name:"Marca em trabalho"}).selectOption("10");
    await page.getByRole("link",{name:"Perfil da marca"}).click();
    await page.locator("#brand-contact_phone").fill("+55 19 98888-7777");
    await page.locator("#brand-instagram_handle").fill("@cafedaserra");
    await page.locator("#brand-address").fill("Av. das Flores, 55 · Campinas");
    await page.getByRole("button",{name:"Salvar e continuar"}).click();
    await page.getByRole("heading",{name:"Uma identidade, em cada publicação"}).waitFor();
    assert.equal(savedProfile.contact_phone,"+55 19 98888-7777");
    assert.equal(savedProfile.address,"Av. das Flores, 55 · Campinas");
    await page.getByRole("button",{name:/4.*Tudo pronto/}).click();
    await page.getByRole("heading",{name:"Café da Serra",exact:true}).waitFor();
    await page.getByRole("link",{name:"Começar a criar"}).click();
    await page.getByRole("button",{name:/Planejamento para redes sociais/}).click();
    await page.getByLabel("Nome do planejamento").fill("Semana de teste");
    await page.getByRole("button",{name:"Continuar",exact:true}).click();
    await page.getByRole("heading",{name:"Como suas artes devem aparecer?"}).waitFor();
    await page.getByRole("button",{name:"Continuar",exact:true}).click();
    await page.getByRole("button",{name:"Salvar planejamento"}).click();
    await page.getByRole("heading",{name:"Sua pausa merece um café"}).waitFor();
    assert.equal(savedPlan.client_id,10);
    await page.getByRole("link",{name:"Revisar",exact:true}).click();
    await page.getByRole("heading",{name:"Sua pausa merece um café"}).waitFor();
    await page.getByRole("button",{name:"Arte 3",exact:true}).click();
    await page.getByLabel("Corrigir arte 3").check();
    await page.getByRole("button",{name:"Refazer artes selecionadas"}).click();
    await page.locator("#social-correction-error").waitFor();
    await page.locator("#social-correction-note").fill("Manter a identidade e corrigir o contato.");
    await page.getByRole("button",{name:"Refazer artes selecionadas"}).click();
    await page.getByRole("button",{name:"Aprovar conteúdo"}).waitFor();
    assert.deepEqual(correction.targets[0].image_indexes,[2]);
    await page.getByText("Versões anteriores (1)",{exact:true}).click();
    await page.getByRole("button",{name:"Usar versão 1",exact:true}).click();
    await page.getByRole("button",{name:"Restaurar versão selecionada"}).click();
    await page.locator(".studio-inline-error").filter({hasText:"Cancele o agendamento"}).first().waitFor();
    assert.equal(contents[0].caption,"Uma pausa para começar o dia. @cafedaserra");
    await page.getByRole("button",{name:"Restaurar versão selecionada"}).click();
    await page.getByLabel("Legenda do conteúdo",{exact:true}).getByText("Legenda da versão anterior",{exact:true}).waitFor();
    assert.equal(restoreRequest.revision_count,1);assert.equal(contents[0].revisions.length,2);assert.equal(contents[0].status,"review");
    await page.getByRole("button",{name:"Aprovar conteúdo"}).click();
    await page.getByRole("link",{name:"Agendar publicação"}).waitFor();
    await page.screenshot({path:path.join(out,"review-desktop.png"),fullPage:true});
    await page.getByRole("link",{name:"Agendar publicação"}).click();
    await page.getByRole("heading",{name:"Seu calendário de publicações"}).waitFor();
    await page.getByLabel("Conteúdo aprovado").selectOption("100");
    await page.getByRole("combobox",{name:/Publicar em/}).selectOption("7");
    await page.getByLabel("Dia e horário no fuso abaixo").fill("2026-10-09T10:30");
    await page.getByRole("button",{name:"Salvar agendamento"}).click();
    await page.getByRole("status").filter({hasText:"Agendamento salvo"}).waitFor();
    assert.equal(schedule.account_id,7);
    assert.equal(schedule.local_datetime,"2026-10-09T10:30");
    await page.getByRole("link",{name:"Redes conectadas"}).click();
    await page.getByRole("heading",{name:"Contas deste cliente"}).waitFor();
    assert.equal(await page.getByLabel("Conteúdo aprovado").count(),0);
    await page.getByRole("link",{name:"Configurações",exact:true}).click();
    await page.getByRole("radio",{name:/Empresa Crio/}).check();
    await page.getByRole("button",{name:"Salvar tipo de conta"}).click();
    await page.locator(".studio-inline-error").filter({hasText:"várias marcas"}).waitFor();
    assert.equal(org.accountType,"agency");
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    assert.equal(await page.locator(".studio-error-notice").isVisible(),true);
    await page.locator(".studio-error-notice").getByRole("button",{name:"Fechar",exact:true}).click();
    profiles.splice(1); // The next scenario models an account with one brand; no actual data is deleted.
    await page.getByRole("button",{name:"Salvar tipo de conta"}).click();
    await page.getByRole("link",{name:"Minha marca",exact:true}).waitFor();
    assert.equal(await page.getByRole("combobox",{name:"Marca em trabalho"}).count(),0);
    await page.getByRole("link",{name:"Início",exact:true}).click();
    await page.screenshot({path:path.join(out,"home-company.png"),fullPage:true});
    for(const width of [736,360,320]){
      await page.setViewportSize({width,height:1000});
      for(const target of ["/","/criar","/clientes/10","/revisar","/calendario","/redes","/empresa","/nova-campanha"]){
        await page.goto(origin+target);await page.locator(".studio-main h1").waitFor();
        await page.waitForTimeout(100);
        const overflowing=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
        assert.equal(overflowing,false,"Horizontal overflow at "+width+"px: "+target);
      }
    }
    await page.goto(origin);await page.locator(".studio-main h1").waitFor();
    await page.setViewportSize({width:390,height:1100});
    await page.screenshot({path:path.join(out,"home-mobile.png"),fullPage:true});
    await page.getByRole("button",{name:"Abrir menu"}).click();
    await page.getByRole("link",{name:"Minha marca",exact:true}).click();
    await page.getByRole("heading",{name:"Vamos preparar Café da Serra"}).waitFor();
    assert.deepEqual(errors,[]);
    console.log("PASS: company/agency, isolated brand, contacts, guided planning, carousel correction, approval, schedule and responsive screens.");
    await context.close();
  } finally {await browser.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
