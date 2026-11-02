"""Local gameplay smoke check. Requires the host's installed Python Playwright."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
base=os.environ.get('PREVIEW_URL','http://localhost:3199')
out=Path(__file__).resolve().parent
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':1100})
 page=context.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base);page.get_by_role('button',name='Try the local demo').click()
 page.wait_for_selector('#playerControls:not([hidden])')
 page.get_by_role('button',name='Simulated friends').click()
 page.wait_for_function("() => document.querySelector('#population').textContent.includes('5 SIM')")
 # Movement is visible in authoritative events, not inferred from a screenshot.
 def world():
  return page.evaluate("""() => new Promise(resolve => {const s=new EventSource('/api/events');s.onmessage=e=>{s.close();resolve(JSON.parse(e.data));};})""")
 user=page.request.get(base+'/api/me').json()['user'];before=world()
 player=lambda s:next(v for v in s['players'] if v['id']==user['id'])
 page.keyboard.down('d');page.wait_for_timeout(350);page.keyboard.up('d')
 after=world();assert player(after)['x']>player(before)['x']
 page.screenshot(path=str(out/'grove-desktop.png'),full_page=True)
 page.get_by_role('button',name='Demo fusion').click()
 page.wait_for_function("() => document.querySelector('#sceneTag').textContent.includes('GUARDIAN ONLINE')")
 page.get_by_role('button',name='Summon the Glitch').click()
 page.wait_for_selector('#bossHud:not([hidden])')
 page.screenshot(path=str(out/'fusion-desktop.png'),full_page=True)
 page.get_by_role('button',name='Reset challenge').click()
 page.locator('#customViewer').select_option(user['id'])
 page.get_by_role('button',name='Commission custom pet').click()
 page.wait_for_function("() => document.querySelector('#skinStatus').textContent.includes('Queued')")
 page.reload();page.wait_for_function("() => document.querySelector('#skinStatus').textContent.includes('Queued')")
 assert page.request.get(base+'/api/me').json()['user']['id']==user['id']
 mobile=context.new_page();mobile.set_viewport_size({'width':390,'height':844});mobile.goto(base+'/controller');mobile.wait_for_selector('#playerControls:not([hidden])');mobile.screenshot(path=str(out/'controller-mobile.png'),full_page=True)
 assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
 overlay=context.new_page();overlay.goto(base+'/overlay');overlay.wait_for_timeout(200)
 assert overlay.locator('header').is_hidden()
 assert overlay.evaluate("getComputedStyle(document.body).backgroundColor")=='rgba(0, 0, 0, 0)'
 sample_verified=False
 if page.request.get(base+'/api/me').json().get('sampleSkin'):
  sample_context=browser.new_context(viewport={'width':1440,'height':1000})
  sample=sample_context.new_page();sample.on('pageerror',lambda e:errors.append(str(e)))
  sample.goto(base);sample.get_by_role('button',name='Try the local demo').click();sample.wait_for_selector('#playerControls:not([hidden])')
  sample_user=sample.request.get(base+'/api/me').json()['user']['id']
  with sample.expect_response(lambda r:r.url.endswith('/api/host')) as asset_response:
   sample.get_by_role('button',name='Hatch Mossbyte sample').click()
  assert asset_response.value.status==200
  assert sample.request.get(base+'/pets/mossbyte.png').status==200
  ready=sample.request.get(base+'/api/state').json()['skins']
  assert any(j['userId']==sample_user and j['status']=='ready' for j in ready)
  sample.wait_for_timeout(500);sample.screenshot(path=str(out/'mossbyte-hatching.png'),full_page=True)
  sample.wait_for_timeout(2100);sample.screenshot(path=str(out/'mossbyte-hatched.png'),full_page=True)
  assert sample.request.get(base+'/api/me').json()['user']['id']==sample_user
  sample.get_by_role('button',name='Enter fusion circle').click()
  sample.wait_for_function("() => document.querySelector('#join').textContent.includes('Leave')")
  sample_verified=True;sample_context.close()
 assert not errors,errors
 print(json.dumps({'movement':True,'fusion':True,'challenge':True,'queuedAfterReload':True,'identityPreserved':True,'mobileNoOverflow':True,'overlayTransparent':True,'generatedSkinHatch':sample_verified,'pageErrors':errors}))
 browser.close()
