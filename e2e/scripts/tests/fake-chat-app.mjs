// A local stand-in for the deployed chat, just faithful enough for the
// production smoke script to run end to end without a network: one page with
// the sidebar's markup and roles, and the thread API it calls.
import http from 'node:http';

const ANSWER = 'EPSDT covers medically necessary services for members under 21. '.repeat(5).trim();

const PAGE = `<!doctype html><title>Fake chat</title>
<div id="sidebar"></div>
<button data-testid="new-thread-button">New</button>
<div id="messages"></div>
<textarea data-testid="chat-input"></textarea>
<button data-testid="send-button">Ask</button>
<script>
let threads = [], current = null, editing = null, menu = null, confirming = null;
const api = (method, path, body) => fetch(path, { method, headers: { 'content-type': 'application/json' },
  body: body && JSON.stringify(body) }).then(response => response.ok ? response.json() : Promise.reject(response.status));
const refresh = async () => { threads = (await api('GET', '/api/memory/threads?agentId=fake')).threads; render(); };
const escape = text => text.replace(/[&<"]/g, c => ({ '&': '&amp;', '<': '&lt;', '"': '&quot;' })[c]);
function render() {
  document.querySelector('#sidebar').innerHTML = threads.map(thread => {
    const title = escape(thread.title);
    return '<div class="group' + (thread.id === current ? ' border-l-accent' : '') + '" data-id="' + thread.id + '">'
      + (editing === thread.id
        ? '<input aria-label="Rename ' + title + '" value="' + title + '">'
        : '<button data-testid="thread-item">' + title + '</button><button aria-label="Thread actions for ' + title + '">…</button>')
      + (menu === thread.id ? '<div role="menu"><div role="menuitem">Rename</div><div role="menuitem">Delete</div></div>' : '')
      + '</div>';
  }).join('') + (confirming ? '<div role="alertdialog"><button>Cancel</button><button id="confirm">Delete</button></div>' : '');
  document.querySelector('input')?.focus();
}
function show(answer) {
  document.querySelector('#messages').innerHTML = answer === undefined ? '' : '<div data-testid="assistant-message">'
    + '<span data-testid="verification-badge" data-outcome="passed">Verified</span><div class="prose">' + answer + '</div>'
    + '<div data-testid="tool-step">searchSections</div>'
    + '<div data-testid="sources-panel"><button data-testid="sources-panel-trigger">Sources 1 source</button></div></div>';
}
document.querySelector('#sidebar').addEventListener('click', async event => {
  const id = event.target.closest('[data-id]')?.dataset.id;
  const label = event.target.getAttribute('aria-label') ?? '';
  if (event.target.id === 'confirm') {
    const doomed = confirming;
    confirming = null;
    await api('DELETE', '/api/memory/threads/' + doomed + '?agentId=fake').catch(() => undefined);
    if (doomed === current) { current = null; show(); }
    return refresh();
  }
  if (label.startsWith('Thread actions for ')) menu = id;
  else if (event.target.textContent === 'Rename') { editing = id; menu = null; }
  else if (event.target.textContent === 'Delete') { confirming = id; menu = null; }
  else if (event.target.dataset.testid === 'thread-item') {
    current = id;
    show((await api('GET', '/api/memory/threads/' + id + '/messages')).answer);
  }
  render();
});
document.querySelector('#sidebar').addEventListener('keydown', async event => {
  if (event.key !== 'Enter' || !editing) return;
  const id = editing;
  editing = null;
  await api('PATCH', '/api/memory/threads/' + id + '?agentId=fake', { title: event.target.value }).catch(() => undefined);
  refresh();
});
document.querySelector('[data-testid="new-thread-button"]').onclick = () => { current = null; show(); render(); };
document.querySelector('[data-testid="send-button"]').onclick = async () => {
  const input = document.querySelector('[data-testid="chat-input"]');
  const threadId = crypto.randomUUID();
  current = threadId;
  await api('POST', '/api/memory/threads?agentId=fake', { threadId, title: input.value.slice(0, 60) });
  show((await api('POST', '/chat', { memory: { thread: threadId } })).answer);
  input.value = '';
  refresh();
};
refresh();
</script>`;

/**
 * Start the fake. `threads` is the account's stored state, newest first, and is
 * shared with the caller so a test can seed leftovers and inspect what remains.
 */
export async function startFakeChatApp({ threads = [], rejectDelete = false, forgetAnswers = false } = {}) {
  const writes = [];
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const json = (status, body) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const id = url.pathname.match(/^\/api\/memory\/threads\/([^/]+)/)?.[1];
    if (request.method !== 'GET') writes.push(`${request.method} ${id ?? body.threadId ?? body.memory?.thread}`);

    if (request.method === 'GET' && url.pathname === '/chat') {
      response.writeHead(200, { 'content-type': 'text/html' });
      return response.end(PAGE);
    }
    if (url.pathname === '/api/memory/threads') {
      if (request.method === 'POST') threads.unshift({ id: body.threadId, title: body.title });
      return json(200, { threads });
    }
    if (request.method === 'POST' && url.pathname === '/chat') {
      threads.find(thread => thread.id === body.memory.thread).answer = ANSWER;
      return json(200, { answer: ANSWER });
    }
    const thread = threads.find(candidate => candidate.id === id);
    if (!thread) return json(404, {});
    if (url.pathname.endsWith('/messages')) return json(200, { answer: forgetAnswers ? 'Something else.' : thread.answer });
    if (request.method === 'PATCH') {
      thread.title = body.title;
      return json(200, thread);
    }
    if (request.method === 'DELETE') {
      if (rejectDelete) return json(500, {});
      threads.splice(threads.indexOf(thread), 1);
      return json(200, {});
    }
    return json(405, {});
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    threads,
    writes,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}
