"""Local Chromium UI regression checks. No production accounts or mail required."""
import os, tempfile, subprocess, socket, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

project = Path(__file__).resolve().parent.parent
temp = tempfile.mkdtemp(prefix='ath-community-ui-')
with socket.socket() as s:
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
base = f'http://localhost:{port}'
shots = Path(os.environ.get('ATH_SHOTS', project.parent / 'community-shots'))
shots.mkdir(parents=True, exist_ok=True)
env = {**os.environ, 'PORT':str(port), 'DB_PATH':str(Path(temp)/'db.sqlite'), 'UPLOAD_DIR':str(Path(temp)/'uploads')}
server = subprocess.Popen(['node','--no-warnings','test/community-server.mjs'], cwd=project, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
checks = 0
def check(condition, label):
    global checks
    assert condition, label
    checks += 1
    print('OK',label,flush=True)
def login(page,user):
    page.goto(base)
    page.fill('#f-id',user)
    page.fill('#f-pw','ChangeMe123!')
    page.get_by_role('button',name='Anmelden',exact=True).click()
    page.wait_for_selector('.view-page h1')

def fits(page):
    return page.evaluate('''() => [...document.querySelectorAll('.view-page *')].every(e => {
      const r=e.getBoundingClientRect(); return !r.width || (r.left>=-0.5 && r.right<=innerWidth+0.5);
    })''')

try:
    for line in server.stdout:
        if 'FIXTURE_READY' in line: break
    else: raise RuntimeError(server.stderr.read())
    with sync_playwright() as pw:
        browser=pw.chromium.launch()
        admin_ctx=browser.new_context(locale='de-DE',viewport={'width':1440,'height':950})
        member_ctx=browser.new_context(locale='de-DE',viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
        admin=admin_ctx.new_page(); member=member_ctx.new_page()
        errors=[]
        for p in [admin,member]: p.on('pageerror',lambda e:errors.append(str(e)))
        login(admin,'OaO Admin'); login(member,'Blunt OaO')
        check(admin.locator('.sidebar [data-path="/alliances"]').count()==1,'Alliances navigation')
        check(admin.locator('.sidebar [data-path="/dinos"]').count()==0,'Old data module removed from navigation')
        admin.goto(base+'/#/alliances')
        admin.get_by_role('button',name='Neue Beziehung',exact=True).click()
        admin.fill('#alliance-name','Friendly Tribe '+('LongName'*10))
        admin.fill('#alliance-server','EU 123')
        admin.fill('#alliance-map','The Island')
        admin.get_by_role('button',name='Speichern',exact=True).click()
        expect(admin.locator('.relationship')).to_have_count(1)
        check(admin.locator('.relationship.alliance').count()==1,'Create blue alliance')
        admin.get_by_role('button',name='Bearbeiten',exact=True).click()
        admin.select_option('#alliance-relation','friend')
        admin.get_by_role('button',name='Speichern',exact=True).click()
        expect(admin.locator('.relationship.friend')).to_have_count(1)
        check(True,'Change relationship to green friend')
        member.goto(base+'/#/alliances')
        expect(member.locator('.relationship')).to_have_count(1)
        check(member.locator('.relationship button').count()==0,'Member has read-only relationship UI')
        for width in [320,375,390,430]:
            member.set_viewport_size({'width':width,'height':844})
            check(fits(member),'Alliance overflow '+str(width))
        member.screenshot(path=str(shots/'alliances-mobile.png'),full_page=True)
        admin.goto(base+'/#/chat'); member.goto(base+'/#/chat')
        expect(member.locator('.chat-message')).to_have_count(50)
        member.get_by_role('button',name='Ältere Nachrichten laden',exact=True).click()
        expect(member.locator('.chat-message')).to_have_count(55)
        check(True,'Load older persisted messages')
        check(not member.locator('.chat-older').is_visible(),'Hide history button after final page')
        text='<img src=x onerror=alert(1)> '+('LongText'*100)
        member.fill('#chat-body',text)
        member.get_by_role('button',name='Senden',exact=True).click()
        expect(member.locator('.chat-message').last.locator('p')).to_have_text(text)
        expect(admin.locator('.chat-message').last.locator('p')).to_have_text(text,timeout=12000)
        check(member.locator('.chat-message img').count()==0,'Chat renders user input as literal text; polling delivers it')
        for width in [320,375,390,430]:
            member.set_viewport_size({'width':width,'height':844})
            member.locator('#chat-body').focus()
            check(fits(member),'Chat overflow '+str(width))
        member.set_viewport_size({'width':390,'height':440})
        member.locator('#chat-body').scroll_into_view_if_needed()
        check(member.locator('#chat-body').is_visible(),'Composer accessible with reduced viewport')
        member.set_viewport_size({'width':390,'height':844})
        member.screenshot(path=str(shots/'chat-mobile.png'),full_page=True)
        member.route('**/api/chat/messages',lambda route:route.abort())
        member.fill('#chat-body','Keep my draft')
        member.get_by_role('button',name='Senden',exact=True).click()
        expect(member.get_by_role('button',name='Senden',exact=True)).to_be_enabled()
        check(member.input_value('#chat-body')=='Keep my draft','Failed send preserves draft and allows retry')
        member.unroute('**/api/chat/messages')
        member.goto(base+'/#/')
        expect(member.locator('.chat-message p').last).to_have_text(text)
        check(True,'Home shows latest chat message')
        # Verify an actual failing image progresses through bundled image to SVG.
        fallback=admin.evaluate('''async () => {
          const {itemBild}=await import('/js/icons.js');
          const a=itemBild({key:'rex',image_path:'items/missing.jpg'});
          document.body.append(a);
          await new Promise(r=>setTimeout(r,700));
          const bundled=a.querySelector('img');
          const loaded=!!bundled?.naturalWidth && bundled.src.endsWith('/assets/rex.png');
          bundled.dispatchEvent(new Event('error'));
          const svg=!!a.querySelector('svg'); a.remove(); return {loaded,svg};
        }''')
        check(fallback['loaded'] and fallback['svg'],'Uploaded image fallback to bundled JPEG, then silhouette')
        # Add server via the same authenticated API client used by the app.
        admin.evaluate("async()=>{const {api}=await import('/js/api.js');await api.createServer({name:'AAA UI Server',mapName:'The Island'});}")
        admin.goto(base+'/#/')
        expect(admin.locator('.tiles .t-val').filter(has_text='The Island')).to_have_count(1)
        check(True,'Dashboard reads map_name')
        admin.goto(base+'/#/alliances')
        admin.get_by_role('button',name='Löschen',exact=True).click()
        admin.locator('.modal .btn.danger').click()
        expect(admin.locator('.relationship')).to_have_count(0)
        check(True,'Admin deletes relationship')
        check(not errors,'No browser JavaScript exceptions: '+str(errors))
        browser.close()
    print(f'{checks} community UI checks passed',flush=True)
finally:
    server.terminate();server.wait(timeout=10)
    shutil.rmtree(temp,ignore_errors=True)
