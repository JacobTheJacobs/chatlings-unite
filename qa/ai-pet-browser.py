import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
base=os.environ.get('PREVIEW_URL','http://localhost:3197')
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox']);context=browser.new_context(viewport={'width':1440,'height':1050});page=context.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base);page.get_by_role('button',name='Try the local demo').click();page.wait_for_selector('#playerControls:not([hidden])')
 page.get_by_role('button',name='Start battery build').click();page.wait_for_selector('#interact:not([hidden])')
 page.get_by_role('button',name='Simulated friends').click()
 page.locator('#petInstruction').fill('Follow me and help the grove')
 page.get_by_role('button',name='Let Codex play').click()
 page.wait_for_function("() => document.querySelector('#petStatus').textContent.includes('local fallback')")
 def world():
  return page.evaluate("""() => new Promise(resolve => {const s=new EventSource('/api/events');s.onmessage=e=>{s.close();resolve(JSON.parse(e.data));};})""")
 first=world();assert first['aiPet']['enabled'];assert first['aiPet']['source']=='local';assert len(first['mission']['batteries'])==3
 page.locator('#world').click();page.keyboard.down('d');page.wait_for_timeout(800);page.keyboard.up('d');page.wait_for_timeout(200);after=world();assert first['aiPet']['pet']['x']!=after['aiPet']['pet']['x'] or first['aiPet']['pet']['y']!=after['aiPet']['pet']['y']
 page.locator('#powerChoice').select_option('bounce');page.get_by_role('button',name='Use ability · F').click();assert len(world()['pads'])==1
 page.screenshot(path=str(Path(__file__).parent/'ai-pet-desktop.png'),full_page=True)
 page.get_by_role('button',name='Stop pet').click();page.wait_for_function("() => document.querySelector('#petStatus').textContent.includes('off')")
 assert not world()['aiPet']['enabled'];assert not errors,errors
 print(json.dumps({'petMovement':True,'fallbackLabel':True,'mission':True,'ability':True,'stop':True,'pageErrors':errors}));browser.close()
