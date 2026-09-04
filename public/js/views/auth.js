import { el, clear } from '../ui.js';
import { t, LANGS, getLang, setLang } from '../i18n.js';
import { api, setCsrf, ApiError } from '../api.js';

export function renderAuth(root, { onSignedIn }) {
  let mode = 'login';
  let message = null;
  let messageKind = 'err';

  function draw() {
    clear(root);

    const notice = message ? el('div.notice.' + messageKind, { text: message }) : null;

    const form = mode === 'login' ? loginForm() : registerForm();

    root.append(
      el('div.auth-wrap', {},
        el('div.auth-box', {},
          el('div.auth-logo', {},
            el('img', { src: '/assets/logo.png', alt: 'ARK Tribe Hub', width: '132', height: '132' }),
            el('h1', { text: 'ARK Tribe Hub' }),
            el('p', { text: t('app.tagline') })
          ),
          el('div.card', {},
            // Echte Tabs statt zweier gleich benannter Buttons: sonst lesen
            // Screenreader "Anmelden" zweimal vor, ohne dass klar wird, welches
            // der Umschalter und welches der Absende-Button ist.
            el('div.auth-tabs', { role: 'tablist' },
              el('button' + (mode === 'login' ? '.on' : ''), {
                type: 'button',
                role: 'tab',
                'aria-selected': mode === 'login' ? 'true' : 'false',
                text: t('auth.login'),
                onclick: () => { mode = 'login'; message = null; draw(); },
              }),
              el('button' + (mode === 'register' ? '.on' : ''), {
                type: 'button',
                role: 'tab',
                'aria-selected': mode === 'register' ? 'true' : 'false',
                text: t('auth.register'),
                onclick: () => { mode = 'register'; message = null; draw(); },
              })
            ),
            notice,
            form
          ),
          el('div', { style: 'display:flex;justify-content:center;gap:6px;margin-top:16px' },
            ...LANGS.map((l) =>
              el('button.btn.sm.ghost' + (getLang() === l.code ? ' primary' : ''), {
                text: l.flag,
                title: l.label,
                'aria-label': l.label,
                onclick: () => { setLang(l.code); draw(); },
              })
            )
          ),
          el('p', { style: 'text-align:center;color:var(--faint);font-size:.76rem;margin-top:14px', text: t('footer.by') })
        )
      )
    );
  }

  function loginForm() {
    const identifier = el('input', { type: 'text', autocomplete: 'username', required: true, id: 'f-id' });
    const password = el('input', { type: 'password', autocomplete: 'current-password', required: true, id: 'f-pw' });
    const submit = el('button.btn.primary.block', { type: 'submit', text: t('auth.login') });

    const form = el('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true;
        try {
          const res = await api.login({ identifier: identifier.value.trim(), password: password.value });
          setCsrf(res.csrfToken);
          onSignedIn(res.user);
        } catch (err) {
          message = err instanceof ApiError ? err.message : t('common.error');
          messageKind = 'err';
          draw();
        }
      },
    },
      el('div.field', {}, el('label', { for: 'f-id', text: t('auth.identifier') }), identifier),
      el('div.field', {}, el('label', { for: 'f-pw', text: t('auth.password') }), password),
      submit
    );
    setTimeout(() => identifier.focus(), 30);
    return form;
  }

  function registerForm() {
    const tribe = el('input', { type: 'text', required: true, id: 'r-tribe', placeholder: 'oao' });
    const username = el('input', { type: 'text', required: true, id: 'r-user', autocomplete: 'username' });
    const email = el('input', { type: 'email', id: 'r-mail', autocomplete: 'email' });
    const password = el('input', { type: 'password', required: true, minlength: '8', id: 'r-pw', autocomplete: 'new-password' });
    const submit = el('button.btn.primary.block', { type: 'submit', text: t('auth.register') });

    return el('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true;
        try {
          await api.register({
            tribeSlug: tribe.value.trim().toLowerCase(),
            username: username.value.trim(),
            email: email.value.trim() || undefined,
            password: password.value,
          });
          mode = 'login';
          message = t('auth.registered');
          messageKind = 'ok';
          draw();
        } catch (err) {
          message = err instanceof ApiError ? err.message : t('common.error');
          messageKind = 'err';
          submit.disabled = false;
          draw();
        }
      },
    },
      el('div.field', {}, el('label', { for: 'r-tribe', text: t('auth.tribe') }), tribe),
      el('div.field', {},
        el('label', { for: 'r-user', text: t('auth.username') }),
        username,
        el('span.hint', { text: t('auth.username_hint') })
      ),
      el('div.field', {}, el('label', { for: 'r-mail', text: t('auth.email') }), email),
      el('div.field', {},
        el('label', { for: 'r-pw', text: t('auth.password') }),
        password,
        el('span.hint', { text: t('auth.password_hint') })
      ),
      submit
    );
  }

  draw();
}

/** Bildschirm für freigeschaltete-noch-nicht Konten. */
export function renderPending(root, { user, onSignOut }) {
  clear(root);
  root.append(
    el('div.auth-wrap', {},
      el('div.auth-box', {},
        el('div.auth-logo', {},
          el('img', { src: '/assets/logo.png', alt: '', width: '132', height: '132' }),
          el('h1', { text: 'ARK Tribe Hub' })
        ),
        el('div.card', {},
          el('h2', { text: t('dash.welcome', { name: user.username }) }),
          el('p', { style: 'color:var(--muted);margin:10px 0 18px', text: t('auth.pending') }),
          el('button.btn.block', { text: t('auth.logout'), onclick: onSignOut })
        )
      )
    )
  );
}
