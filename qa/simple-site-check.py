"""Isolated development server only: no Twitch messages or live commissions."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
base='http://localhost:3199';out=Path(__file__).resolve().parent
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':1000})
 page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.goto(base);page.wait_for_function("() => document.querySelector('#connection').textContent.includes('Connected')")
 assert page.get_by_role('heading',name='Your chat. Alive on screen.').is_visible()
 assert page.get_by_role('link',name='Join othersideh’s chat').is_visible()
 assert not page.get_by_role('button',name='Enter fusion circle').count()
 assert page.locator('#adminPage').is_hidden()
 page.wait_for_timeout(1000);page.screenshot(path=str(out/'simple-viewer.png'),full_page=True)
 page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(200)
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(out/'simple-viewer-mobile.png'),full_page=True)
 # Only this isolated test server has keyless local demo-host mode.
 response=context.request.post(base+'/api/demo',data={'name':'StarryToast'});assert response.status==200
 user=response.json()['user'];page.goto(base+'/admin');page.wait_for_selector('#adminControls:not([hidden])')
 page.locator('#movementMode').select_option('physics')
 page.wait_for_function("document.querySelector('#movementHelp').textContent.includes('Gravity')")
 assert context.request.get(base+'/api/admin/status').json()['desktop']['mode']=='physics'
 page.locator('#movementMode').select_option('walk')
 page.wait_for_function("document.querySelector('#movementHelp').textContent.includes('Flick to throw')")
 assert context.request.get(base+'/api/admin/status').json()['desktop']['mode']=='walk'
 page.get_by_role('button',name='Make custom pet',exact=True).first.click()
 page.wait_for_selector('.viewer-row button:disabled')
 jobs=context.request.get(base+'/api/skins/host').json();assert any(j['userId']==user['id'] and j['requestedBy']=='admin' and j['status']=='queued' for j in jobs)
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(out/'simple-admin-mobile.png'),full_page=True)
 page.set_viewport_size({'width':1440,'height':1000});page.screenshot(path=str(out/'simple-admin.png'),full_page=True)
 overlay=context.new_page();overlay.on('pageerror',lambda e:errors.append(str(e)));overlay.goto(base+'/overlay');overlay.wait_for_timeout(300)
 assert overlay.evaluate("getComputedStyle(document.body).backgroundColor")=='rgba(0, 0, 0, 0)'
 # Check the public role gate in a separate context, with no desktop actions.
 gate=browser.new_context();gate.route('**/api/me',lambda route:route.fulfill(json={'user':None,'host':False,'oauth':True,'demo':False}))
 g=gate.new_page();g.goto(base+'/admin');g.wait_for_selector('#adminGate:not([hidden])');assert g.locator('#adminControls').is_hidden()
 assert not errors,errors
 print(json.dumps({'simpleViewer':True,'mobileNoOverflow':True,'adminCommission':True,'streamerGate':True,'legacyOverlayTransparent':True,'pageErrors':errors}))
 browser.close()
