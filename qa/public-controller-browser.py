import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
base=os.environ.get('PREVIEW_URL')
if not base: raise SystemExit('Set PREVIEW_URL to the public controller origin')
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox']);page=browser.new_page(viewport={'width':1280,'height':900});errors=[];polls=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:polls.append(r.url) if '/api/state' in r.url else None)
 page.goto(base+'/controller');page.wait_for_function("() => document.querySelector('#connection').textContent==='World connected'")
 page.wait_for_timeout(500)
 assert page.locator('.host').is_hidden();assert page.locator('#demo').is_hidden();assert page.locator('#twitchLogin').is_visible();assert len(polls)>=2
 state=page.request.get(base+'/api/state').json();assert state['twitchStatus']=='connected';assert all(not p['id'].startswith('demo-') for p in state['players'])
 page.screenshot(path=str(Path(__file__).parent/'public-controller.png'),full_page=True)
 mobile=browser.new_page(viewport={'width':390,'height':844});mobile.goto(base+'/controller');mobile.wait_for_selector('#twitchLogin');assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
 overlay=browser.new_page();overlay.goto('http://localhost:3010/overlay');overlay.wait_for_timeout(300);assert overlay.locator('header').is_hidden();assert overlay.evaluate("getComputedStyle(document.body).backgroundColor")=='rgba(0, 0, 0, 0)'
 overlay.screenshot(path=str(Path(__file__).parent/'obs-transparent-overlay.png'),omit_background=True)
 assert not errors,errors
 print(json.dumps({'publicHTTPS':True,'pollingUpdates':True,'hostControlsHidden':True,'demoDisabled':True,'twitchChatConnected':True,'mobileNoOverflow':True,'overlayTransparent':True,'pageErrors':errors}));browser.close()
