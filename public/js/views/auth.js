import { el, clear, toast } from '../ui.js';
import { t, LANGS, getLang, setLang } from '../i18n.js';
import { api, setCsrf, ApiError } from '../api.js';

export function renderAuth(root, { onSignedIn }) {
  let mode = 'login';
  let message = null;
  let messageKind = 'err';

  // Link aus der "Passwort vergessen"-Mail: /?reset=<token>. Token sofort aus
  // der Adresszeile entfernen, damit er nicht im Verlauf/Screenshot landet.
  let resetToken = null;
  try {
    const params = new URLSearchParams(location.search);
    resetToken = params.get('reset');
    if (resetToken) {
      mode = 'reset';
      params.delete('reset');
      const rest = params.toString();
      history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
    }
  } catch { /* ohne History-API einfach normal weiter */ }

  function draw() {
    clear(root);

    const notice = message ? el('div.notice.' + messageKind, { text: message }) : null;

    const form = mode === 'login' ? loginForm()
      : mode === 'forgot' ? forgotForm()
      : mode === 'reset' ? resetForm()
      : registerForm();

    root.append(
      el('div.auth-wrap', {},
        el('div.auth-box', {},
          el('div.auth-logo', {},
            el('img', { src: '/assets/logo.png', alt: 'ARK Tribe Hub', width: '132', height: '132' })
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
                text: l.code.toUpperCase(),
                title: l.label,
                'aria-label': l.label,
                onclick: () => { setLang(l.code); draw(); },
              })
            )
          ),
          legalLinks(),
          el('p', { style: 'text-align:center;color:var(--faint);font-size:.76rem;margin-top:14px', text: t('footer.by') })
        )
      )
    );
  }

  function loginForm() {
    const tribe = el('input', { type: 'text', autocomplete: 'organization', id: 'f-tribe', placeholder: t('auth.tribe_placeholder') });
    const identifier = el('input', { type: 'text', autocomplete: 'username', required: true, id: 'f-id' });
    const password = el('input', { type: 'password', autocomplete: 'current-password', required: true, id: 'f-pw' });
    const submit = el('button.btn.primary.block', { type: 'submit', text: t('auth.login') });

    const form = el('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true;
        try {
          const res = await api.login({
            tribeSlug: tribe.value.trim().toLowerCase() || undefined,
            identifier: identifier.value.trim(),
            password: password.value,
          });
          if (res.mfaRequired) { form.replaceWith(mfaForm(res.mfaToken, res.method, res.emailHint)); return; }
          setCsrf(res.csrfToken);
          onSignedIn(res.user);
        } catch (err) {
          message = err instanceof ApiError ? err.message : t('common.error');
          messageKind = 'err';
          draw();
        }
      },
    },
      el('div.field', {},
        el('label', { for: 'f-tribe', text: t('auth.tribe_slug') }),
        tribe,
        el('span.hint', { text: t('auth.tribe_login_hint') })
      ),
      el('div.field', {}, el('label', { for: 'f-id', text: t('auth.identifier') }), identifier),
      el('div.field', {}, el('label', { for: 'f-pw', text: t('auth.password') }), password),
      submit,
      el('button.btn.ghost.block.auth-forgot', { type: 'button', style: 'margin-top:8px', text: t('auth.forgot'), onclick: () => { mode = 'forgot'; message = null; draw(); } })
    );
    setTimeout(() => identifier.focus(), 30);
    return form;
  }

  // Schritt 1: Link anfordern (gleiche Felder wie beim Login).
  function forgotForm() {
    const tribe = el('input', { type: 'text', autocomplete: 'organization', id: 'fp-tribe', placeholder: t('auth.tribe_placeholder') });
    const identifier = el('input', { type: 'text', autocomplete: 'username', required: true, id: 'fp-id' });
    const submit = el('button.btn.primary.block', { type: 'submit', text: t('auth.forgot_send') });
    const form = el('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true;
        try {
          await api.forgotPassword({ tribeSlug: tribe.value.trim().toLowerCase() || undefined, identifier: identifier.value.trim() });
          mode = 'login'; message = t('auth.forgot_sent'); messageKind = 'ok';
        } catch (err) {
          message = err instanceof ApiError ? err.message : t('common.error'); messageKind = 'err';
        }
        draw();
      },
    },
      el('p', { style: 'margin:0 0 12px;color:var(--muted)', text: t('auth.forgot_intro') }),
      el('div.field', {}, el('label', { for: 'fp-tribe', text: t('auth.tribe_slug') }), tribe, el('span.hint', { text: t('auth.tribe_login_hint') })),
      el('div.field', {}, el('label', { for: 'fp-id', text: t('auth.identifier') }), identifier),
      submit,
      el('button.btn.ghost.block', { type: 'button', style: 'margin-top:8px', text: t('common.back'), onclick: () => { mode = 'login'; message = null; draw(); } })
    );
    setTimeout(() => identifier.focus(), 30);
    return form;
  }

  // Schritt 2: neues Passwort über den Link aus der Mail setzen.
  function resetForm() {
    const pw = el('input', { type: 'password', required: true, minlength: '10', id: 'rp-pw', autocomplete: 'new-password' });
    const pw2 = el('input', { type: 'password', required: true, minlength: '10', id: 'rp-pw2', autocomplete: 'new-password' });
    const submit = el('button.btn.primary.block', { type: 'submit', text: t('auth.reset_save') });
    const form = el('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        if (pw.value !== pw2.value) { message = t('auth.reset_mismatch'); messageKind = 'err'; draw(); return; }
        submit.disabled = true;
        try {
          await api.resetPassword({ token: resetToken, password: pw.value });
          resetToken = null; mode = 'login'; message = t('auth.reset_done'); messageKind = 'ok';
        } catch (err) {
          message = err instanceof ApiError ? err.message : t('common.error'); messageKind = 'err';
          submit.disabled = false;
        }
        draw();
      },
    },
      el('p', { style: 'margin:0 0 12px;color:var(--muted)', text: t('auth.reset_intro') }),
      el('div.field', {}, el('label', { for: 'rp-pw', text: t('auth.reset_new') }), pw, el('span.hint', { text: t('auth.password_hint') })),
      el('div.field', {}, el('label', { for: 'rp-pw2', text: t('auth.reset_repeat') }), pw2),
      submit,
      el('button.btn.ghost.block', { type: 'button', style: 'margin-top:8px', text: t('common.back'), onclick: () => { resetToken = null; mode = 'login'; message = null; draw(); } })
    );
    setTimeout(() => pw.focus(), 30);
    return form;
  }

  // Zweiter Schritt fuer Konten mit Zwei-Faktor-Anmeldung.
  function mfaForm(mfaToken, method = 'totp', emailHint = null) {
    const code = el('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9]{6}', maxlength: '6', required: true, id: 'f-otp', placeholder: '123456', style: 'text-align:center;letter-spacing:.4em;font-size:1.4rem' });
    const status = el('div.notice.err', { hidden: true, role: 'alert' });
    const submit = el('button.btn.primary.block', { type: 'submit', text: t('auth.login') });
    const resend = el('button.btn.ghost.block', { type: 'button', style: 'margin-top:8px', text: t('mfa.resend'), onclick: async () => {
      resend.disabled = true;
      try { await api.resendMfa(mfaToken); status.hidden = true; toast(t('mfa.resent')); }
      catch (err) { status.hidden = false; status.textContent = err instanceof ApiError ? err.message : t('common.error'); }
      finally { setTimeout(() => { resend.disabled = false; }, 45000); }
    } });
    const form = el('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true;
        try {
          const res = await api.loginMfa({ mfaToken, code: code.value.trim() });
          setCsrf(res.csrfToken);
          onSignedIn(res.user);
        } catch (err) {
          status.hidden = false;
          status.textContent = err instanceof ApiError ? err.message : t('common.error');
          submit.disabled = false;
          code.select();
        }
      },
    },
      el('p', { style: 'margin:0 0 12px;color:var(--muted)', text: method === 'email' ? t('mfa.login_hint_email', { email: emailHint || '' }) : t('mfa.login_hint') }),
      status,
      el('div.field', {}, el('label', { for: 'f-otp', text: t('mfa.code') }), code),
      submit,
      method === 'email' ? resend : null,
      el('button.btn.ghost.block', { type: 'button', style: 'margin-top:8px', text: t('common.back'), onclick: () => draw() })
    );
    setTimeout(() => code.focus(), 30);
    return form;
  }

  function registerForm() {
    const tribe = el('input', { type: 'text', required: true, id: 'r-tribe', placeholder: t('auth.tribe_placeholder'), autocomplete: 'organization' });
    const username = el('input', { type: 'text', required: true, id: 'r-user', autocomplete: 'username' });
    const email = el('input', { type: 'email', required: true, id: 'r-mail', autocomplete: 'email' });
    const password = el('input', { type: 'password', required: true, minlength: '10', id: 'r-pw', autocomplete: 'new-password' });
    const submit = el('button.btn.primary.block', { type: 'submit', text: t('auth.register') });

    return el('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true;
        try {
          await api.register({
            tribeSlug: tribe.value.trim().toLowerCase(),
            username: username.value.trim(),
            email: email.value.trim(),
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
      el('div.field', {},
        el('label', { for: 'r-tribe', text: t('auth.tribe_slug') }),
        tribe,
        el('span.hint', { text: t('auth.tribe_register_hint') })
      ),
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
          el('img', { src: '/assets/logo.png', alt: 'ARK Tribe Hub', width: '132', height: '132' })
        ),
        el('div.card', {},
          el('h2', { text: t('dash.welcome', { name: user.username }) }),
          el('p', { style: 'color:var(--muted);margin:10px 0 18px', text: t('auth.pending') }),
          el('button.btn.block', { text: t('auth.logout'), onclick: onSignOut })
        ),
        legalLinks()
      )
    )
  );
}

function legalLinks() {
  return el('nav.auth-legal-links', { 'aria-label': t('footer.legal') },
    el('a', { href: '/impressum.html', text: t('footer.imprint') }),
    el('a', { href: '/datenschutz.html', text: t('footer.privacy') }),
    el('a', { href: '/nutzungsbedingungen.html', text: t('footer.terms') })
  );
}
