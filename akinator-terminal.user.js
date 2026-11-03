sed: -e expression #1, char 135: unknown command: `@'
// ==UserScript==
// @name         Akinator Terminal
// @namespace    akinator-terminal
// @version      1.0.0
// @description  Terminal styling and keyboard navigation for the original Akinator site.
// @match        https://akinator.com/*
// @match        https://*.akinator.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(() => {
  'use strict';

  const root = document.documentElement;
  const mode = 'data-aki-terminal';
  const shortcuts = 'data-aki-key';
  const answerIds = ['a_yes', 'a_no', 'a_dont_know', 'a_probably', 'a_probably_not'];
  const controlSelector = 'a[href],button,input,select,textarea,summary,[role="button"],[role="link"],[tabindex],[onclick]';

  GM_addStyle(`
    html[${mode}], html[${mode}] body {
      background: #101412 !important; color: #c8d4cc !important; color-scheme: dark;
      font: 16px/1.55 ui-monospace, Consolas, monospace !important;
    }
    html[${mode}] body *:not(svg):not(svg *) {
      font-family: inherit !important; text-shadow: none !important;
      box-shadow: none !important; border-radius: 0 !important;
    }
    html[${mode}] :is(header,main,footer,section,article,div,ul,li,form,nav) {
      background-color: transparent !important; background-image: none !important;
      color: inherit !important;
    }
    html[${mode}] :is(p,span,h1,h2,h3,h4,label) { color: inherit !important; }
    html[${mode}] :is(a,button,input,select,textarea,summary,[role=button]) {
      background: #161d19 !important; color: #a4eab5 !important;
    }
    html[${mode}] :focus-visible { outline: 2px solid #a4eab5 !important; outline-offset: 3px; }
    html[${mode}] [${shortcuts}]::before {
      content: '[' attr(${shortcuts}) '] '; color: #a4eab5; margin-inline-end: .45em;
    }
    html[${mode}] :is(.akinator-body,.akinator-background,.genie)[aria-hidden=true] {
      visibility: hidden !important;
    }
    #aki-terminal-help {
      position: fixed; inset: auto 1rem 1rem; width: fit-content; max-width: calc(100vw - 2rem);
      margin: 0 auto; padding: .5rem .8rem; z-index: 2147483647;
      background: #101412; color: #a4eab5; border: 1px solid #526a58;
      font: 12px/1.5 ui-monospace, Consolas, monospace; pointer-events: none;
    }
  `);

  const help = document.createElement('output');
  help.id = 'aki-terminal-help';
  help.setAttribute('aria-live', 'off');
  document.body.append(help);

  function setMode(enabled) {
    root.toggleAttribute(mode, enabled);
    help.hidden = !enabled;
    try { sessionStorage.setItem(mode, enabled ? 'on' : 'off'); } catch {}
  }

  function visible(element) {
    if (!element?.isConnected || element.matches(':disabled,[aria-disabled="true"]') ||
        element.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
    const style = getComputedStyle(element);
    return style.visibility === 'visible' && element.getClientRects().length > 0;
  }

  function scope() {
    return [...document.querySelectorAll('dialog[open],[role="dialog"][aria-modal="true"]')]
      .filter(visible).at(-1) ?? document;
  }

  function controls() {
    return [...scope().querySelectorAll(controlSelector)].filter(element =>
      visible(element) && element.tabIndex >= 0 && element.type !== 'hidden');
  }

  function answers() {
    const page = scope();
    const options = answerIds.map(id => page.querySelector('#' + id));
    return options.every(visible) ? options : [];
  }

  function refresh() {
    for (const element of document.querySelectorAll('[role="button"],[role="link"],[onclick]')) {
      if (visible(element) && element.tabIndex < 0 && !element.hasAttribute('tabindex')) {
        element.tabIndex = 0;
      }
    }
    const options = answers();
    for (const element of document.querySelectorAll('[' + shortcuts + ']')) {
      if (!options.includes(element)) element.removeAttribute(shortcuts);
    }
    options.forEach((element, index) => element.setAttribute(shortcuts, index + 1));
    const hint = options.length ? '1–5 answer · ' : '';
    help.textContent = '> ' + hint + '↑/↓ move · Enter select · Tab all controls · Alt+Shift+T toggle';
  }

  let enabled = true;
  try { enabled = sessionStorage.getItem(mode) !== 'off'; } catch {}
  setMode(enabled);
  refresh();

  let queued = false;
  new MutationObserver(records => {
    if (queued || records.every(record => help.contains(record.target))) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; refresh(); });
  }).observe(document.body, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ['class', 'hidden', 'style', 'open', 'aria-hidden', 'aria-disabled', 'onclick']
  });

  document.addEventListener('keydown', event => {
    if (event.altKey && event.shiftKey && !event.ctrlKey && event.code === 'KeyT') {
      event.preventDefault();
      if (!event.repeat) setMode(!root.hasAttribute(mode));
      return;
    }
    if (!root.hasAttribute(mode) || event.defaultPrevented || event.isComposing ||
        event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
        event.target.closest?.('input,select,textarea,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return;

    const options = answers();
    if (/^[1-5]$/.test(event.key) && options.length) {
      event.preventDefault();
      if (!event.repeat) options[Number(event.key) - 1].click();
      return;
    }
    if (event.key === 'Enter' &&
        event.target.matches?.('[role="button"],[role="link"],[onclick]') &&
        !event.target.matches('a[href],button,input,select,textarea,summary')) {
      event.preventDefault();
      if (!event.repeat) event.target.click();
      return;
    }
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const items = controls();
    if (!items.length) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown'
      ? (index + 1) % items.length
      : (index <= 0 ? items.length - 1 : index - 1);
    items[next].focus();
  });
})();
