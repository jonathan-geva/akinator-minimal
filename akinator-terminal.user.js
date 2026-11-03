// ==UserScript==
// @name         Akinator Terminal
// @namespace    akinator-terminal
// @version      2.0.0
// @updateURL    https://raw.githubusercontent.com/jonathan-geva/akinator-minimal/main/akinator-terminal.user.js
// @downloadURL  https://raw.githubusercontent.com/jonathan-geva/akinator-minimal/main/akinator-terminal.user.js
// @description  Full-screen keyboard terminal for the original Akinator site.
// @match        https://akinator.com/*
// @match        https://*.akinator.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(() => {
  'use strict';

  if (window.top !== window.self) return;

  const root = document.documentElement;
  const mode = 'data-aki-terminal';
  const answerIds = ['a_yes', 'a_no', 'a_dont_know', 'a_probably', 'a_probably_not'];
  const selector = 'a[href],button,input,select,textarea,summary,[role="button"],[role="link"],[onclick],[tabindex="0"]';
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });

  GM_addStyle(`
    html[${mode}] { overflow: hidden !important; background: #0d0f0e !important; }
    html[${mode}] > body { opacity: 0 !important; pointer-events: none !important; }
  `);

  shadow.innerHTML = `
    <style>
      :host { all: initial; position: fixed; inset: 0; z-index: 2147483647;
        display: block; overflow: auto; background: #0d0f0e; color: #d0d6d2;
        color-scheme: dark; font: 16px/1.55 ui-monospace, Consolas, monospace; }
      :host([hidden]) { display: none; }
      main { max-width: 72ch; margin: 0 auto; padding: clamp(1rem, 6vw, 4rem) 1.25rem; }
      header, label, small { color: #9ba9a0; }
      #screen { margin: 1.5rem 0 1rem; white-space: pre-wrap; overflow-wrap: anywhere; }
      #actions { display: grid; gap: .15rem; justify-items: start; }
      button, input, select, textarea { font: inherit; color: inherit; background: transparent; }
      button { border: 0; text-align: left; padding: .15rem .35rem; cursor: pointer; }
      button:hover, button:focus-visible { background: #243329; }
      :focus-visible { outline: 1px solid #8fdfa7; }
      b { color: #8fdfa7; font-weight: normal; }
      form { display: flex; align-items: baseline; margin: 1.25rem 0 .65rem; gap: .5rem; }
      #command { border: 0; min-width: 0; flex: 1; padding: .25rem; }
      #status { display: block; }
    </style>
    <main aria-label="Akinator terminal">
      <header>$ akinator</header>
      <div id="screen" aria-live="polite"></div>
      <div id="actions"></div>
      <form><label for="command">aki&gt;</label><input id="command" aria-label="Akinator command"
        autocomplete="off" autocapitalize="off" spellcheck="false"></form>
      <small id="status" role="status">Type a number and press Enter. Type help for commands.</small>
    </main>`;
  root.append(host);

  const screen = shadow.querySelector('#screen');
  const actions = shadow.querySelector('#actions');
  const command = shadow.querySelector('#command');
  const status = shadow.querySelector('#status');
  let items = [];
  let primary = [];
  let expanded = false;
  let enabled = false;
  let frame;
  let previousScope;
  let previousText;
  let originalAriaHidden;

  function visible(element) {
    return Boolean(element?.isConnected && !element.matches(':disabled,[aria-disabled="true"]') &&
      !element.closest('[hidden],[inert]') && getComputedStyle(element).visibility === 'visible' &&
      element.getClientRects().length);
  }

  function label(element) {
    return (element.getAttribute('aria-label') || element.labels?.[0]?.innerText ||
      element.innerText || element.value || element.querySelector('img[alt]')?.alt ||
      element.getAttribute('title') || element.getAttribute('placeholder') || '').trim();
  }

  function render() {
    if (!enabled) return;
    const modal = [...document.querySelectorAll('dialog[open],[role="dialog"]')].filter(visible).at(-1);
    const content = modal ?? document.querySelector('main,#content,#main-content') ?? document.body;
    const page = modal ?? document.body;
    const answers = answerIds.map(id => page.querySelector('#' + id)).filter(visible);
    const candidates = [...page.querySelectorAll(selector)].filter(element =>
      visible(element) && !element.matches('input[type="hidden"]') && label(element));
    const ordered = [...new Set([...answers, ...candidates])].filter(element =>
      !candidates.some(other => other !== element && element.contains(other) && label(other) === label(element)));
    const question = [...page.querySelectorAll('#question-label,.question-label,.question-text,#question,.question')]
      .filter(visible).map(element => element.innerText.trim()).find(Boolean);
    const messages = [...content.querySelectorAll('[id*="proposition"],h1,h2,h3,p')]
      .filter(element => visible(element) && !element.closest('header,footer,nav,aside'))
      .map(element => element.innerText.trim()).filter(Boolean);
    const output = question || [...new Set(messages)].slice(0, 6).join('\n\n') || 'Choose an action.';
    if (previousScope !== page || previousText !== output) expanded = false;
    previousScope = page;
    previousText = output;
    primary = ordered.filter(element => answers.includes(element) ||
      (content === document.body ? !element.closest('header,footer,nav,aside') : content.contains(element))).slice(0, 12);
    if (!primary.length) primary = ordered.slice(0, 8);
    const next = expanded ? ordered : primary;
    if (screen.textContent !== output) screen.textContent = output;
    if (items.length === next.length && items.every((item, i) =>
      item.element === next[i] && item.label === label(next[i]))) return;
    items = next.map(element => ({ element, label: label(element) }));
    actions.replaceChildren(...items.map((item, index) => {
      const button = document.createElement('button');
      const number = document.createElement('b');
      number.textContent = String(index + 1).padStart(2, '0') + '  ';
      button.append(number, item.label);
      button.addEventListener('click', () => activate(index));
      return button;
    }));
  }

  function activate(index, value) {
    const target = items[index]?.element;
    if (!visible(target)) {
      status.textContent = 'Action unavailable. Type all to list available actions.';
      return;
    }
    if (target.matches('select,textarea,input:not([type]),input:is([type=text],[type=search],[type=email],[type=number],[type=password],[type=url],[type=tel])')) {
      if (value === undefined) {
        const options = target.matches('select') ? [...target.options].map(option => option.value + ' = ' + option.text).join(' | ') : '';
        status.textContent = 'Enter ' + (index + 1) + ' followed by a value.' + (options ? ' ' + options : '');
        command.value = (index + 1) + ' ';
      } else {
        target.value = value;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        status.textContent = 'Value entered.';
      }
    } else {
      target.click();
      status.textContent = '';
    }
    command.focus();
    schedule();
  }

  shadow.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    const text = command.value.trim();
    command.value = '';
    if (text === 'help') {
      status.textContent = 'number = run action · number value = fill field · all = list all actions · game = compact list · native = original page';
    } else if (text === 'all' || text === 'game') {
      expanded = text === 'all';
      render();
    } else if (text === 'native') {
      setMode(false);
    } else {
      const match = /^(\d+)(?:\s+(.+))?$/.exec(text);
      if (match) activate(Number(match[1]) - 1, match[2]);
      else status.textContent = 'Unknown command. Type help.';
    }
  });

  shadow.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const focusable = [...actions.querySelectorAll('button'), command];
    const index = focusable.indexOf(shadow.activeElement);
    const step = event.key === 'ArrowUp' ? -1 : 1;
    event.preventDefault();
    focusable[(index + step + focusable.length) % focusable.length].focus();
  });

  function setMode(on) {
    enabled = on;
    host.hidden = !on;
    root.toggleAttribute(mode, on);
    if (on) {
      originalAriaHidden = document.body.getAttribute('aria-hidden');
      command.focus();
      document.body.setAttribute('aria-hidden', 'true');
      render();
    } else {
      if (originalAriaHidden === null) document.body.removeAttribute('aria-hidden');
      else document.body.setAttribute('aria-hidden', originalAriaHidden);
    }
    try { sessionStorage.setItem(mode, on ? 'on' : 'off'); } catch {}
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  }

  new MutationObserver(schedule).observe(document.body, {
    childList: true, subtree: true, attributes: true, characterData: true
  });

  document.addEventListener('focusin', event => {
    if (enabled && event.target !== host) command.focus();
  });

  document.addEventListener('keydown', event => {
    if (event.altKey && event.shiftKey && event.code === 'KeyT') {
      event.preventDefault();
      if (!event.repeat) setMode(!enabled);
      return;
    }
    if (!enabled || event.key !== 'Tab') return;
    const focusable = [...actions.querySelectorAll('button'), command];
    const index = focusable.indexOf(shadow.activeElement);
    const step = event.shiftKey ? -1 : 1;
    event.preventDefault();
    focusable[(index + step + focusable.length) % focusable.length].focus();
  }, true);

  let startEnabled = true;
  try { startEnabled = sessionStorage.getItem(mode) !== 'off'; } catch {}
  if (startEnabled) setMode(true);
  else host.hidden = true;
})();
