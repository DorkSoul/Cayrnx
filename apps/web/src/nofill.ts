// Password managers (Bitwarden/Vaultwarden, 1Password, LastPass) guess that any text box named
// "name", "path", … is a login field and offer to fill it. None of Cayrnx's text fields are
// credentials, so mark them all as "ignore" — including ones that appear later in dialogs.
// Real password fields (login, setup, change password) are left alone so autofill still works.

const IGNORE: Record<string, string> = {
  'data-bwignore': 'true',
  'data-1p-ignore': 'true',
  'data-lpignore': 'true',
  'data-form-type': 'other',
};

function mark(el: Element): void {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  if (el instanceof HTMLInputElement && el.type === 'password') return;
  if (el.hasAttribute('data-bwignore')) return;
  for (const [k, v] of Object.entries(IGNORE)) el.setAttribute(k, v);
  if (!el.getAttribute('autocomplete')) el.setAttribute('autocomplete', 'off');
}

export function ignorePasswordManagers(root: HTMLElement = document.body): void {
  root.querySelectorAll('input, textarea').forEach(mark);
  new MutationObserver((records) => {
    for (const r of records)
      for (const n of r.addedNodes) {
        if (!(n instanceof Element)) continue;
        mark(n);
        n.querySelectorAll('input, textarea').forEach(mark);
      }
  }).observe(root, { childList: true, subtree: true });
}
