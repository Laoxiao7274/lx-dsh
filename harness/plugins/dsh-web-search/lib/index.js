import { join as pathJoin } from 'node:path';
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

const inject = ['web', 'llm', 'webServer'];

/* Persisted config lives beside the harness settings in $DSH_HOME so
   provider choices and API keys survive restarts. */
var DSH_HOME = process.env.DSH_HOME || pathJoin(homedir(), '.dsh');
var CONFIG_PATH = pathJoin(DSH_HOME, 'web-search.json');

function loadPersistedConfig() {
  try {
    var saved = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    if (saved && typeof saved === 'object') return saved;
  } catch (e) { /* absent or unreadable: defaults apply */ }
  return null;
}

function persistConfig(config) {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) { console.error('web-search: 配置写入失败:', e) }
}

function mergeConfig(target, saved) {
  if (!saved) return;
  if (saved.provider && typeof saved.provider === 'string') target.provider = saved.provider;
  if (saved.apiKeys && typeof saved.apiKeys === 'object') {
    for (var k in target.apiKeys) if (typeof saved.apiKeys[k] === 'string') target.apiKeys[k] = saved.apiKeys[k];
  }
  if (saved.curator && typeof saved.curator === 'object') {
    if (typeof saved.curator.webEnabled === 'boolean') target.curator.webEnabled = saved.curator.webEnabled;
    if (typeof saved.curator.port === 'number') target.curator.port = saved.curator.port;
  }
  if (saved.summary && typeof saved.summary === 'object') {
    if (typeof saved.summary.enabled === 'boolean') target.summary.enabled = saved.summary.enabled;
    if (typeof saved.summary.model === 'string') target.summary.model = saved.summary.model;
  }
}

function apply(ctx) {
  var config = {
    provider: 'exa-mcp',
    apiKeys: { tavily: '', brave: '', jina: '', exa: '', kagi: '', perplexity: '' },
    curator: { webEnabled: false, port: 18790 },
    summary: { enabled: false, model: '' }
  };
  mergeConfig(config, loadPersistedConfig());
  var tempSeq = 0, curatorHtml = null;

  function outText(o) { if (!o) return ''; if (typeof o === 'string') return o; if (typeof o === 'object' && o.text !== undefined) return String(o.text); return String(o) }
  function escDQ(s) { return String(s).replace(/"/g, '\\"') }
  function utf8B64(str) { var b = new TextEncoder().encode(str), r = ''; for (var i = 0; i < b.length; i++) r += String.fromCharCode(b[i]); return btoa(r) }
  function safeJSON(t) { try { return JSON.parse(t) } catch (e) { return null } }
  function safeInlineJSON(d) { return JSON.stringify(d).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') }
  function uuid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) { var r = Math.random()*16|0; return (c==='x'?r:(r&3|8)).toString(16) }) }
  function getParam(req, name) { var url = req.url || ''; var qi = url.indexOf('?'); if (qi < 0) return null; var qs = url.slice(qi + 1); var pairs = qs.split('&'); for (var i = 0; i < pairs.length; i++) { var eq = pairs[i].indexOf('='); if (eq < 0) continue; if (pairs[i].slice(0, eq) === name) return decodeURIComponent(pairs[i].slice(eq + 1)) } return null }
  function makeUserMessage(text) { return { id: uuid(), role: 'user', content: [{ type: 'text', text: text }], source: { kind: 'plugin', plugin: 'dsh-web-search' } } }

  async function curl(url, opts) {
    opts = opts || {};
    var shell = ctx.get('shell'); if (!shell) throw new Error('shell 服务不可用');
    var sp = ctx.get('sandboxPolicy');
    var policy = sp ? sp.resolve({ mode: 'danger-full-access' }) : { mode: 'danger-full-access', workspaceRoot: 'C:\\' };
    var cmd = 'curl.exe -s --max-time ' + (opts.timeout || 60);
    var headers = opts.headers || {};
    for (var h in headers) cmd += ' -H "' + escDQ(h) + ': ' + escDQ(headers[h]) + '"';
    if (opts.body) {
      tempSeq++;
      var tmpName = 'dsh_curl_' + Date.now() + '_' + tempSeq + '.json';
      var b64 = utf8B64(opts.body);
      var writeCmd = "$p = Join-Path $env:TEMP '" + tmpName + "'; [System.IO.File]::WriteAllBytes($p, [System.Convert]::FromBase64String('" + b64 + "')); Write-Output $p";
      var writeSpec = shell.resolve({ command: writeCmd, timeoutMs: 5000, stdoutMaxBytes: 1024, sandboxPolicy: policy });
      var wr = await shell.run(writeSpec);
      cmd += ' -d @' + outText(wr.stdout).trim();
    }
    cmd += ' "' + escDQ(url) + '"';
    var spec = shell.resolve({ command: cmd, timeoutMs: (opts.timeout || 60) * 1000, stdoutMaxBytes: opts.maxBytes || 2097152, sandboxPolicy: policy });
    var r = await shell.run(spec);
    var stdout = outText(r.stdout), stderr = outText(r.stderr);
    if (r.exitCode !== 0) throw new Error('curl 失败 (exit ' + r.exitCode + '): ' + (stderr || stdout).slice(0, 500));
    return stdout;
  }

  function openBrowser(url) { var shell = ctx.get('shell'); if (!shell) return; var sp = ctx.get('sandboxPolicy'); var policy = sp ? sp.resolve({ mode: 'danger-full-access' }) : { mode: 'danger-full-access', workspaceRoot: 'C:\\' }; try { shell.run(shell.resolve({ command: 'cmd /c start "" "' + escDQ(url) + '"', timeoutMs: 5000, stdoutMaxBytes: 1024, sandboxPolicy: policy })).catch(function() {}) } catch (e) {} }

  async function getCuratorHtml(sessionData) {
    if (curatorHtml === null) {
      try {
        /* Packaged beside the plugin: <pkg>/curator.html. Reading it
           directly is fine — this code runs in the host Node process. */
        var curatorPath = new URL('../curator.html', import.meta.url);
        var html = readFileSync(curatorPath, 'utf8');
        curatorHtml = html.length >= 1000 ? html : false;
      } catch (e) { curatorHtml = false }
    }
    if (!curatorHtml) return null;
    return curatorHtml.replace('__INLINE_DATA__', safeInlineJSON(sessionData));
  }

  function parseSources(text, max) {
    var blocks = text.split(/(?=^Title: )/m).filter(function (b) { return b.trim() });
    var sources = [];
    for (var i = 0; i < blocks.length && sources.length < max; i++) {
      var b = blocks[i].trim(), urlM = b.match(/^URL: (.+)/m), titleM = b.match(/^Title: (.+)/m);
      if (!urlM) continue;
      var snippet = '', hlM = b.match(/\nHighlights:\s*\n([\s\S]*?)(?:\n---|$)/);
      if (hlM) snippet = hlM[1].trim().replace(/\s+/g, ' ').slice(0, 300);
      else { var tM = b.match(/\nText: ([\s\S]*?)(?:\n---|$)/); if (tM) snippet = tM[1].trim().replace(/\s+/g, ' ').slice(0, 300) }
      sources.push({ url: urlM[1].trim(), title: titleM ? titleM[1].trim() : '', snippet: snippet });
    }
    return sources;
  }

  async function searchExaMcp(query, max) {
    var raw = await curl('https://mcp.exa.ai/mcp?tools=web_search_exa', { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'x-exa-source': 'dsh-web-search' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'web_search_exa', arguments: { query: query, numResults: max } } }) });
    var parsed = null, lines = raw.split('\n');
    for (var i = 0; i < lines.length; i++) if (lines[i].indexOf('data:') === 0) { var c = safeJSON(lines[i].slice(5).trim()); if (c && (c.result || c.error)) { parsed = c; break } }
    if (!parsed) parsed = safeJSON(raw);
    if (!parsed) throw new Error('Exa MCP 返回无法解析的响应');
    if (parsed.error) throw new Error('Exa MCP 错误: ' + (parsed.error.message || JSON.stringify(parsed.error)));
    var text = '', content = parsed.result && parsed.result.content;
    if (Array.isArray(content)) for (var j = 0; j < content.length; j++) if (content[j].type === 'text' && content[j].text) { text = content[j].text; break }
    if (!text) throw new Error('Exa MCP 返回空内容');
    return { sources: parseSources(text, max), truncated: false };
  }
  async function searchTavily(q, m, k) { if (!k) throw new Error('Tavily Key 未配置'); var d = safeJSON(await curl('https://api.tavily.com/search', { headers: { Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, search_depth: 'basic', max_results: m, include_answer: 'basic' }) })); if (!d) throw new Error('Tavily 无效 JSON'); var s = (d.results || []).slice(0, m).filter(function(r){return r.url}).map(function(r){return {url:r.url,title:r.title||'',snippet:typeof r.content==='string'?r.content.replace(/\s+/g,' ').trim().slice(0,300):''}}); return {sources:s,truncated:false,...(d.answer?{content:d.answer}:{})} }
  async function searchBrave(q, m, k) { if (!k) throw new Error('Brave Key 未配置'); var d = safeJSON(await curl('https://api.search.brave.com/res/v1/web/search?q='+encodeURIComponent(q)+'&count='+m, { headers: { 'X-Subscription-Token': k, Accept: 'application/json' } })); if (!d) throw new Error('Brave 无效 JSON'); var s = ((d.web&&d.web.results)||[]).slice(0,m).filter(function(r){return r.url}).map(function(r){return {url:r.url,title:r.title||'',snippet:r.description||''}}); return {sources:s,truncated:false} }
  async function searchJina(q, m, k) { if (!k) throw new Error('Jina Key 未配置'); var d = safeJSON(await curl('https://s.jina.ai/'+encodeURIComponent(q)+'?count='+m, { headers: { Authorization: 'Bearer '+k, Accept: 'application/json' } })); if (!d) throw new Error('Jina 无效 JSON'); var items = Array.isArray(d)?d:(Array.isArray(d.data)?d.data:[]); var s = items.slice(0,m).filter(function(r){return r.url}).map(function(r){return {url:r.url,title:r.title||'',snippet:(r.description||'').replace(/\s+/g,' ').trim().slice(0,300)}}); return {sources:s,truncated:false} }
  async function searchExaApi(q, m, k) { if (!k) throw new Error('Exa Key 未配置'); var d = safeJSON(await curl('https://api.exa.ai/search', { headers: { 'x-api-key': k, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, numResults: m, type: 'auto', contents: { highlights: true } }) })); if (!d) throw new Error('Exa API 无效 JSON'); var s = (d.results||[]).slice(0,m).filter(function(r){return r.url}).map(function(r){return {url:r.url,title:r.title||'',snippet:(Array.isArray(r.highlights)?r.highlights.join(' '):'').replace(/\s+/g,' ').trim().slice(0,300)}}); return {sources:s,truncated:false} }
  async function searchKagi(q, m, k) { if (!k) throw new Error('Kagi Key 未配置'); var d = safeJSON(await curl('https://kagi.com/api/v1/search?q='+encodeURIComponent(q)+'&limit='+m, { headers: { Authorization: 'Bearer '+k, Accept: 'application/json' } })); if (!d) throw new Error('Kagi 无效 JSON'); var items = (d.data&&d.data.search)?(d.data.search[0]||[]):(d.data||[]); if(!Array.isArray(items))items=[]; var s = items.slice(0,m).filter(function(r){return r.url||r.href||r.link}).map(function(r){return {url:r.url||r.href||r.link,title:r.title||r.name||'',snippet:(r.snippet||r.description||r.summary||'').slice(0,300)}}); return {sources:s,truncated:false} }
  async function searchPerplexity(q, m, k) { if (!k) throw new Error('Perplexity Key 未配置'); var d = safeJSON(await curl('https://api.perplexity.ai/chat/completions', { headers: { Authorization: 'Bearer '+k, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'sonar', messages: [{role:'user',content:q}], max_tokens: 1024 }) })); if (!d) throw new Error('Perplexity 无效 JSON'); var a = d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content||''; var cites = Array.isArray(d.citations)?d.citations:[]; var s = cites.slice(0,m).map(function(c,i){return typeof c==='string'?{url:c,title:'来源 '+(i+1),snippet:''}:{url:c.url,title:c.title||'来源 '+(i+1),snippet:''}}); return {sources:s,truncated:false,...(a?{content:a}:{})} }

  async function doSearch(query, max, provider) {
    if (provider === 'deepseek') { var prev = ctx.web.searchProviderId; ctx.web.searchProviderId = 'deepseek-official'; try { return await ctx.web.search({ query: query, maxResults: max }) } finally { ctx.web.searchProviderId = prev } }
    var fns = { 'exa-mcp': function() { return searchExaMcp(query, max) }, 'tavily': function() { return searchTavily(query, max, config.apiKeys.tavily) }, 'brave': function() { return searchBrave(query, max, config.apiKeys.brave) }, 'jina': function() { return searchJina(query, max, config.apiKeys.jina) }, 'exa': function() { return searchExaApi(query, max, config.apiKeys.exa) }, 'kagi': function() { return searchKagi(query, max, config.apiKeys.kagi) }, 'perplexity': function() { return searchPerplexity(query, max, config.apiKeys.perplexity) } };
    var fn = fns[provider]; if (!fn) throw new Error('未知的搜索引擎: ' + provider);
    return await fn();
  }

  async function doSummarize(query, sources) {
    var llm = ctx.llm; if (!llm) return null;
    /* Route: an explicit config choice first, then the agent default model.
       With neither, skip the summary instead of guessing a provider id that
       may not exist on this machine. */
    var provider = null, model = null, sm = config.summary.model;
    if (sm && sm.indexOf('/') > 0) { provider = sm.slice(0, sm.indexOf('/')); model = sm.slice(sm.indexOf('/') + 1) }
    else { var adm = ctx.get('agentDefaultModel'); if (adm) { var sel = adm.currentSelection(); if (sel) { provider = sel.provider; model = sel.model } } }
    if (!provider || !model) return null;
    var lines = ['You are writing the final web search summary for a coding assistant.', 'Write a concise, factual summary using only the provided search results.', 'Requirements:', '- Keep it readable and skimmable.', '- Include key findings and caveats.', '- Do not invent sources or claims.', '- If evidence is weak or conflicting, say so explicitly.', '- End with a short "Sources" section listing the most relevant URLs.', '', '<search_results>', 'Query: ' + query];
    sources.forEach(function(s, i) { lines.push((i+1)+'. '+(s.title||s.url)); if (s.snippet) lines.push('   '+s.snippet) });
    lines.push('</search_results>');
    try {
      var stream = llm.stream({ provider: provider, model: model, messages: [makeUserMessage(lines.join('\n'))], maxTokens: 2048 });
      var summary = '';
      for await (var chunk of stream) if (chunk.type === 'text-delta' && chunk.text) summary += chunk.text;
      return { summary: summary, meta: { model: provider+'/'+model, durationMs: 0, tokenEstimate: Math.ceil(summary.length/4), fallbackUsed: false } };
    } catch (e) { console.error('web-search: 模型总结失败:', e); return null }
  }

  async function listAllModels() {
    var llm = ctx.llm; if (!llm) return [];
    var result = [];
    try {
      var providers = llm.listProviders();
      if (Array.isArray(providers)) {
        for (var i = 0; i < providers.length; i++) {
          var p = providers[i];
          try {
            var models = await llm.listModels(p.id);
            if (Array.isArray(models)) {
              for (var j = 0; j < models.length; j++) {
                result.push({ value: p.id + '/' + models[j].id, label: (p.name || p.id) + ' / ' + (models[j].name || models[j].id) });
              }
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
    return result;
  }

  var cachedModels = null;
  function getCuratorSummaryModels() {
    if (!config.summary.enabled) return [];
    return (cachedModels || []).map(function(m) { return { value: m.value, label: m.label } });
  }

  var sessions = new Map();
  function createSession(query, maxResults) { var token = uuid(); var s = { token: token, queries: [query], maxResults: maxResults, state: 'SEARCHING', searchResults: [], sseResponse: null, sseKeepalive: null, streamedEvents: new Map(), searchStreamDone: false, nextQueryIndex: 1, resolveSubmit: null, resolveCancel: null, completed: false, lastHeartbeat: Date.now(), browserConnected: false, provider: config.provider, selectedIndices: null, submittedSummary: '' }; sessions.set(token, s); return s }
  function writeSSE(s, event, data) { var res = s.sseResponse; if (!res || res.writableEnded) return false; try { res.write('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n'); return true } catch (e) { return false } }
  function sendSSE(s, event, data) { if (event === 'result' || event === 'search-error') s.streamedEvents.set(data.queryIndex, { event: event, data: data }); writeSSE(s, event, data) }
  function replaySSE(s) { s.streamedEvents.forEach(function(item) { writeSSE(s, item.event, item.data) }); if (s.searchStreamDone) writeSSE(s, 'done', {}) }

  var curatorDisposers = [];
  function startCurator() {
    if (curatorDisposers.length > 0) return;
    var ws = ctx.webServer; if (!ws) return;
    function parseBody(req) { return new Promise(function(resolve) { var body = ''; req.on('data', function(c) { body += c; if (body.length > 65536) { req.destroy(); resolve(null) } }); req.on('end', function() { try { resolve(body ? JSON.parse(body) : {}) } catch (e) { resolve(null) } }); req.on('error', function() { resolve(null) }) }) }
    function sendJson(res, status, data) { try { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)) } catch(e) {} }

    curatorDisposers.push(ws.register({ kind: 'exact', path: '/web-search/curator', handler: async function(req, res) {
      try {
        var token = getParam(req, 'session'); var s = sessions.get(token);
        if (!s) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('Invalid session'); return }
        s.browserConnected = true; s.lastHeartbeat = Date.now();
        var sumModels = getCuratorSummaryModels();
        var sumDefault = config.summary.enabled ? (config.summary.model || (cachedModels && cachedModels[0] ? cachedModels[0].value : '')) : '';
        var sessionData = { queries: s.queries, sessionToken: s.token, timeout: 120, availableProviders: { exa: true, 'exa-mcp': true, brave: true, tavily: true, jina: true, kagi: true, perplexity: true, deepseek: true, all: false }, defaultProvider: s.provider, searchProvider: s.provider, summaryModels: sumModels, defaultSummaryModel: sumDefault };
        var html = await getCuratorHtml(sessionData);
        if (!html) { res.writeHead(502, { 'Content-Type': 'text/plain' }); res.end('curator.html 不可用'); return }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html);
      } catch (e) { console.error('curator / error:', e); if (!res.headersSent) { res.writeHead(500); res.end('Error') } }
    }}));
    curatorDisposers.push(ws.register({ kind: 'exact', path: '/web-search/curator/events', handler: function(req, res) {
      try {
        var token = getParam(req, 'session'); var s = sessions.get(token);
        if (!s) { res.writeHead(403); res.end('Invalid session'); return }
        if (s.state === 'COMPLETED') { sendJson(res, 409, { ok: false, error: 'No events' }); return }
        if (s.sseResponse) { try { s.sseResponse.end() } catch(e){} }
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' }); res.flushHeaders();
        if (res.socket) res.socket.setNoDelay(true);
        s.sseResponse = res; replaySSE(s);
        if (s.sseKeepalive) clearInterval(s.sseKeepalive);
        s.sseKeepalive = setInterval(function() { writeSSE(s, 'keepalive', {}) }, 15000);
        req.on('close', function() { if (s.sseResponse === res) s.sseResponse = null });
      } catch (e) { console.error('curator /events error:', e) }
    }}));
    curatorDisposers.push(ws.register({ kind: 'exact', path: '/web-search/curator/state', handler: function(req, res) {
      try { var token = getParam(req, 'session'); var s = sessions.get(token); if (!s) { sendJson(res, 403, { ok: false }); return }; s.browserConnected = true; s.lastHeartbeat = Date.now(); var events = []; s.streamedEvents.forEach(function(item) { events.push(item) }); sendJson(res, 200, { ok: true, events: events, done: s.searchStreamDone }) } catch (e) { sendJson(res, 500, { ok: false, error: String(e) }) }
    }}));
    curatorDisposers.push(ws.register({ kind: 'exact', path: '/web-search/curator/heartbeat', handler: async function(req, res) {
      try { var body = await parseBody(req); if (!body) { sendJson(res, 400, { ok: false }); return }; var s = sessions.get(body.token); if (!s) { sendJson(res, 403, { ok: false }); return }; s.browserConnected = true; s.lastHeartbeat = Date.now(); sendJson(res, 200, { ok: true }) } catch (e) { sendJson(res, 500, { ok: false, error: String(e) }) }
    }}));
    curatorDisposers.push(ws.register({ kind: 'exact', path: '/web-search/curator/provider', handler: async function(req, res) {
      try { var body = await parseBody(req); if (!body) { sendJson(res, 400, { ok: false }); return }; var s = sessions.get(body.token); if (!s) { sendJson(res, 403, { ok: false }); return }; s.provider = body.provider || s.provider; sendJson(res, 200, { ok: true }) } catch (e) { sendJson(res, 500, { ok: false, error: String(e) }) }
    }}));
    curatorDisposers.push(ws.register({ kind: 'exact', path: '/web-search/curator/search', handler: async function(req, res) {
      try { var body = await parseBody(req); if (!body) { sendJson(res, 400, { ok: false }); return }; var s = sessions.get(body.token); if (!s) { sendJson(res, 403, { ok: false }); return }; if (s.state === 'COMPLETED') { sendJson(res, 409, { ok: false, error: 'Session closed' }); return }; var qi = s.nextQueryIndex++; ; var q = (body.query || '').trim(); if (!q) { sendJson(res, 400, { ok: false, error: 'Invalid query' }); return }; var prov = body.provider || s.provider; s.lastHeartbeat = Date.now(); sendJson(res, 200, { ok: true, queryIndex: qi }); (async function() { try { var result = await doSearch(q, s.maxResults, prov); var srcs = result.sources.map(function(src) { return { title: src.title, url: src.url, domain: src.url.replace(/^https?:\/\//, '').split('/')[0], snippet: src.snippet } }); var entry = { queryIndex: qi, query: q, answer: result.content || '', results: srcs, provider: prov }; s.searchResults.push(entry); if (s.state !== 'COMPLETED') sendSSE(s, 'result', entry) } catch (err) { var e = { queryIndex: qi, query: q, answer: '', results: [], error: String(err.message || err), provider: prov }; s.searchResults.push(e); if (s.state !== 'COMPLETED') sendSSE(s, 'search-error', e) } })() } catch (e) { sendJson(res, 500, { ok: false, error: String(e) }) }
    }}));
    curatorDisposers.push(ws.register({ kind: 'exact', path: '/web-search/curator/summarize', handler: async function(req, res) {
      try {
        if (!config.summary.enabled) { sendJson(res, 403, { ok: false, error: 'Summary is disabled' }); return }
        var body = await parseBody(req); if (!body) { sendJson(res, 400, { ok: false }); return }
        var s = sessions.get(body.token); if (!s) { sendJson(res, 403, { ok: false }); return }
        if (s.state === 'COMPLETED') { sendJson(res, 409, { ok: false }); return }
        var selected = body.selected || []; var allSources = [];
        selected.forEach(function(idx) { var sr = s.searchResults[idx]; if (sr) sr.results.forEach(function(src) { allSources.push(src) }) });
        var result = await doSummarize(s.queries[0] || '', allSources);
        if (result && result.summary) sendJson(res, 200, { ok: true, summary: result.summary, meta: result.meta });
        else sendJson(res, 200, { ok: true, summary: 'Unable to generate summary. Please review the search results manually.', meta: { model: null, durationMs: 0, tokenEstimate: 0, fallbackUsed: true, fallbackReason: 'no-llm' } });
      } catch (e) { console.error('curator /summarize error:', e); sendJson(res, 500, { ok: false, error: String(e.message || e) }) }
    }}));
    curatorDisposers.push(ws.register({ kind: 'exact', path: '/web-search/curator/rewrite', handler: async function(req, res) {
      try { var body = await parseBody(req); if (!body) { sendJson(res, 400, { ok: false }); return }; var s = sessions.get(body.token); if (!s) { sendJson(res, 403, { ok: false }); return }; sendJson(res, 200, { ok: true, query: (body.query || '').trim() }) } catch (e) { sendJson(res, 500, { ok: false, error: String(e) }) }
    }}));
    curatorDisposers.push(ws.register({ kind: 'exact', path: '/web-search/curator/submit', handler: async function(req, res) {
      try { var body = await parseBody(req); if (!body) { sendJson(res, 400, { ok: false }); return }; var s = sessions.get(body.token); if (!s) { sendJson(res, 403, { ok: false }); return }; if (s.state === 'COMPLETED') { sendJson(res, 409, { ok: false }); return }; s.state = 'COMPLETED'; s.selectedIndices = body.selected || []; s.submittedSummary = body.summary || ''; s.rawResults = body.rawResults === true; sendJson(res, 200, { ok: true }); if (s.sseResponse) { try { s.sseResponse.end() } catch(e){}; s.sseResponse = null }; if (s.sseKeepalive) { clearInterval(s.sseKeepalive); s.sseKeepalive = null }; if (s.resolveSubmit) s.resolveSubmit() } catch (e) { sendJson(res, 500, { ok: false, error: String(e) }) }
    }}));
    curatorDisposers.push(ws.register({ kind: 'exact', path: '/web-search/curator/cancel', handler: async function(req, res) {
      try { var body = await parseBody(req); if (!body) { sendJson(res, 400, { ok: false }); return }; var s = sessions.get(body.token); if (!s) { sendJson(res, 403, { ok: false }); return }; if (s.state === 'COMPLETED') { sendJson(res, 200, { ok: true }); return }; s.state = 'COMPLETED'; sendJson(res, 200, { ok: true }); if (s.sseResponse) { try { s.sseResponse.end() } catch(e){}; s.sseResponse = null }; if (s.sseKeepalive) { clearInterval(s.sseKeepalive); s.sseKeepalive = null }; if (s.resolveCancel) s.resolveCancel() } catch (e) { sendJson(res, 500, { ok: false, error: String(e) }) }
    }}));
  }
  function stopCurator() { curatorDisposers.forEach(function(d) { d() }); curatorDisposers = []; sessions.forEach(function(s) { if (s.sseResponse) { try { s.sseResponse.end() } catch(e){} }; if (s.sseKeepalive) clearInterval(s.sseKeepalive); if (s.resolveCancel) s.resolveCancel() }); sessions.clear() }

  var PID = 'dsh-web-search';
  var provider = {
    id: PID, available: function () { return true },
    search: async function (request, signal) {
      var q = request.query, max = request.maxResults || 8, p = config.provider, result;
      if (p === 'deepseek') { var prev = ctx.web.searchProviderId; ctx.web.searchProviderId = 'deepseek-official'; try { result = await ctx.web.search(request, signal) } finally { ctx.web.searchProviderId = prev } }
      else { result = await doSearch(q, max, p) }
      if (config.summary.enabled && result.sources.length > 0) { var s = await doSummarize(q, result.sources); if (s) result = { sources: result.sources, truncated: result.truncated, content: s.summary } }
      if (!config.curator.webEnabled) return result;
      /* Curator review needs the packaged curator.html; without it the page
         cannot render, so waiting for a submit that can never arrive would
         hang the search. Skip the review and return the raw result. */
      if (!(await getCuratorHtml({}))) {
        console.error('web-search: curator.html 未打包，跳过审核页流程');
        return result;
      }
      if (!curatorDisposers.length) startCurator();
      var session = createSession(q, max);
      var srcs = result.sources.map(function(s) { return { title: s.title, url: s.url, domain: s.url.replace(/^https?:\/\//, '').split('/')[0], snippet: s.snippet } });
      var entry = { queryIndex: 0, query: q, answer: result.content || '', results: srcs, provider: p };
      session.searchResults.push(entry); sendSSE(session, 'result', entry); session.searchStreamDone = true; session.state = 'RESULT_SELECTION'; sendSSE(session, 'done', {});
      openBrowser('http://127.0.0.1:3080/web-search/curator?session=' + session.token);
      var submitted = await new Promise(function(resolve) { session.resolveSubmit = function() { resolve(true) }; session.resolveCancel = function() { resolve(false) } });
      if (submitted) { var selectedIndices = session.selectedIndices || [0]; var finalSources = []; selectedIndices.forEach(function(idx) { var sr = session.searchResults[idx]; if (sr) sr.results.forEach(function(s) { finalSources.push({ url: s.url, title: s.title, snippet: s.snippet }) }) }); var finalResult = { sources: finalSources.length > 0 ? finalSources : result.sources, truncated: false }; if (session.submittedSummary) finalResult.content = session.submittedSummary; else if (result.content) finalResult.content = result.content; sessions.delete(session.token); return finalResult } else { sessions.delete(session.token); return result }
    }
  };

  listAllModels().then(function(m) { cachedModels = m });

  if (config.curator.webEnabled) startCurator();
  ctx.effect(function () { var d = ctx.web.registerSearchProvider(provider); var prev = ctx.web.searchProviderId; ctx.web.searchProviderId = PID; return function () { if (ctx.web.searchProviderId === PID) ctx.web.searchProviderId = prev; stopCurator(); d() } });

  // 用 webServer HTTP 路由代替 harness.handle（静态插件没有 harness 全局）
  function apiJson(res, status, data) { try { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)) } catch(e) {} }
  function apiBody(req) { return new Promise(function(resolve) { var body = ''; req.on('data', function(c) { body += c; if (body.length > 65536) { req.destroy(); resolve(null) } }); req.on('end', function() { try { resolve(body ? JSON.parse(body) : {}) } catch (e) { resolve(null) } }); req.on('error', function() { resolve(null) }) }) }

  ctx.effect(function () {
    var ws = ctx.webServer;
    var disposers = [];
    if (ws) {
      disposers.push(ws.register({ kind: 'exact', path: '/web-search/api/get-config', handler: function(req, res) { apiJson(res, 200, JSON.parse(JSON.stringify(config))) } }));
      disposers.push(ws.register({ kind: 'exact', path: '/web-search/api/update', handler: async function(req, res) {
        var args = await apiBody(req); if (!args) { apiJson(res, 400, { ok: false }); return }
        if (args.provider) config.provider = args.provider;
        if (args.apiKeys) for (var k in args.apiKeys) if (k in config.apiKeys) config.apiKeys[k] = args.apiKeys[k];
        if (args.curator) { if (typeof args.curator.webEnabled === 'boolean') config.curator.webEnabled = args.curator.webEnabled; if (typeof args.curator.port === 'number') config.curator.port = args.curator.port }
        if (args.summary) { if (typeof args.summary.enabled === 'boolean') config.summary.enabled = args.summary.enabled; if (typeof args.summary.model === 'string') config.summary.model = args.summary.model }
        if (config.curator.webEnabled && !curatorDisposers.length) startCurator();
        if (!config.curator.webEnabled && curatorDisposers.length) stopCurator();
        persistConfig(config);
        apiJson(res, 200, { ok: true });
      }}));
      disposers.push(ws.register({ kind: 'exact', path: '/web-search/api/list-models', handler: async function(req, res) { apiJson(res, 200, await listAllModels()) } }));

      /* ── Plugin management API ── */
      var pluginsDir = pathJoin(DSH_HOME, 'plugins');

      function listPlugins() {
        var results = [];
        var seen = {};
        function addPkg(pkg, dir, source) {
          var name = pkg.name || dir;
          if (seen[name]) return;
          seen[name] = true;
          results.push({ name: name, dir: dir, version: pkg.version || '0.0.0', description: pkg.description || '', source: source, hasClient: !!(pkg.dsh && pkg.dsh.client), hasBundle: !!(pkg.dsh && pkg.dsh.bundle) });
        }
        /* 1. Scan ~/.dsh/plugins/ */
        try {
          var dirs = readdirSync(pluginsDir, { withFileTypes: true }).filter(function(d) { return d.isDirectory() });
          dirs.forEach(function(d) {
            try { addPkg(JSON.parse(readFileSync(pathJoin(pluginsDir, d.name, 'package.json'), 'utf8')), d.name, 'plugins'); } catch (e) {}
          });
        } catch (e) {}
        /* 2. Scan profile node_modules for third-party dsh plugins */
        try {
          var nmDir = pathJoin(DSH_HOME, 'profiles', 'web', 'node_modules');
          var nmDirs = readdirSync(nmDir, { withFileTypes: true }).filter(function(d) { return d.isDirectory() });
          nmDirs.forEach(function(d) {
            if (d.name.startsWith('@')) {
              /* scoped package: check subdirectories */
              try {
                var subDirs = readdirSync(pathJoin(nmDir, d.name), { withFileTypes: true }).filter(function(s) { return s.isDirectory() });
                subDirs.forEach(function(s) {
                  try {
                    var pkg = JSON.parse(readFileSync(pathJoin(nmDir, d.name, s.name, 'package.json'), 'utf8'));
                    if (pkg.dsh && !pkg.name.startsWith('@deepseek-ai/')) addPkg(pkg, d.name + '/' + s.name, 'profile');
                  } catch (e) {}
                });
              } catch (e) {}
            } else {
              try {
                var pkg = JSON.parse(readFileSync(pathJoin(nmDir, d.name, 'package.json'), 'utf8'));
                if (pkg.dsh && !pkg.name.startsWith('@deepseek-ai/')) addPkg(pkg, d.name, 'profile');
              } catch (e) {}
            }
          });
        } catch (e) {}
        /* 3. Built-in bundles from the profile template: non-official entries
           in dsh.profile.bundles, resolved through the launcher's shared
           module fallback (profiles/node_modules junctions). These ship with
           the installation — no update controls, but reload still applies. */
        try {
          var profileManifest = JSON.parse(readFileSync(pathJoin(DSH_HOME, 'profiles', 'web', 'package.json'), 'utf8'));
          var bundles = (profileManifest.dsh && profileManifest.dsh.profile && profileManifest.dsh.profile.bundles) || [];
          var fallbackDir = pathJoin(DSH_HOME, 'profiles', 'node_modules');
          bundles.forEach(function(name) {
            if (name.startsWith('@deepseek-ai/')) return;
            try {
              var pkg = JSON.parse(readFileSync(pathJoin(fallbackDir, name, 'package.json'), 'utf8'));
              if (pkg.dsh) addPkg(pkg, name, 'builtin');
            } catch (e) {}
          });
        } catch (e) {}
        return results;
      }

      disposers.push(ws.register({ kind: 'exact', path: '/web-search/api/plugins', handler: function(req, res) {
        apiJson(res, 200, listPlugins());
      }}));

      disposers.push(ws.register({ kind: 'exact', path: '/web-search/api/plugins/check', handler: async function(req, res) {
        try {
          var url = new URL('http://localhost' + req.url);
          var name = url.searchParams.get('name');
          if (!name) { apiJson(res, 400, { error: 'name required' }); return }
          var registryUrl = 'https://registry.npmjs.org/' + encodeURIComponent(name).replace('%40', '@');
          var data = await curl(registryUrl, { timeout: 8000 });
          var parsed = safeJSON(data);
          if (!parsed || !parsed['dist-tags']) { apiJson(res, 200, { latest: null, error: 'not found' }); return }
          apiJson(res, 200, { latest: parsed['dist-tags'].latest, versions: Object.keys(parsed.versions || {}).slice(-5) });
        } catch (e) { apiJson(res, 200, { latest: null, error: String(e) }) }
      }}));

      disposers.push(ws.register({ kind: 'exact', path: '/web-search/api/plugins/update', handler: async function(req, res) {
        try {
          var body = await apiBody(req); if (!body || !body.name) { apiJson(res, 400, { ok: false, error: 'name required' }); return }
          var dir = pathJoin(pluginsDir, body.dir || body.name);
          if (!existsSync(pathJoin(dir, 'package.json'))) { apiJson(res, 404, { ok: false, error: 'plugin not found' }); return }
          execSync('npm install ' + body.name + '@latest', { cwd: dir, stdio: 'pipe', timeout: 60000 });
          apiJson(res, 200, { ok: true });
        } catch (e) { apiJson(res, 500, { ok: false, error: String(e.message || e) }) }
      }}));

      disposers.push(ws.register({ kind: 'exact', path: '/web-search/api/plugins/reload', handler: async function(req, res) {
        try {
          var body = await apiBody(req); if (!body || !body.name) { apiJson(res, 400, { ok: false, error: 'name required' }); return }
          var loader = ctx.get('loader');
          if (!loader) { apiJson(res, 503, { ok: false, error: 'loader not available' }); return }
          var entry = null;
          for (var e of loader.entries()) { if (e.options.name === body.name || e.id === body.name) { entry = e; break } }
          if (!entry) { apiJson(res, 404, { ok: false, error: 'plugin entry not found' }); return }
          if (entry.fiber) { try { await entry.fiber.dispose() } catch(e) {} }
          try { await loader.import(entry); apiJson(res, 200, { ok: true }) }
          catch (e) { apiJson(res, 500, { ok: false, error: 'reload failed: ' + String(e) }) }
        } catch (e) { apiJson(res, 500, { ok: false, error: String(e) }) }
      }}));

      /* ── Modlens vision config API ── */
      var modlensDir = pathJoin(homedir(), '.modlens');
      var modlensPath = pathJoin(modlensDir, 'config.json');
      var settingsPath = pathJoin(DSH_HOME, 'settings.yaml');
      var patchPath = pathJoin(DSH_HOME, 'profiles', 'web', 'cordis.patch.yml');

      function readModlensConfig() {
        try { return JSON.parse(readFileSync(modlensPath, 'utf8')); }
        catch (e) { return { providers: {}, provider: 'openai', reuse: {} }; }
      }
      function writeModlensConfig(cfg) {
        try { mkdirSync(modlensDir, { recursive: true }); } catch (e) {}
        writeFileSync(modlensPath, JSON.stringify(cfg, null, 2), 'utf8');
      }

      function readProviderFromSettings(providerName) {
        try {
          var yaml = readFileSync(settingsPath, 'utf8');
          var block = yaml.split(providerName + ':')[1] || '';
          var baseURLMatch = block.match(/baseURL:\s*(.+)/);
          var apiKeyEnvMatch = block.match(/apiKeyEnv:\s*(.+)/);
          var displayMatch = block.match(/display\s*Name:\s*(.+)/);
          var apiMatch = block.match(/api:\s*(.+)/);
          return {
            baseURL: baseURLMatch ? baseURLMatch[1].trim().replace(/['"]/g, '') : '',
            apiKeyEnv: apiKeyEnvMatch ? apiKeyEnvMatch[1].trim() : '',
            displayName: displayMatch ? displayMatch[1].trim().replace(/['"]/g, '') : providerName,
            api: apiMatch ? apiMatch[1].trim() : 'openai-completions'
          };
        } catch (e) { return { baseURL: '', apiKeyEnv: '', displayName: providerName, api: 'openai-completions' }; }
      }

      function readVariantStatus() {
        var fromPatch = null;
        try {
          var patch = readFileSync(patchPath, 'utf8');
          var modStart = patch.indexOf('- id: modlens');
          if (modStart !== -1) {
            var modBlock = patch.substring(modStart);
            var nextEntry = modBlock.indexOf('\n- id:', 5);
            if (nextEntry > 0) modBlock = modBlock.substring(0, nextEntry);
            var upstreamMatch = modBlock.match(/upstream:\s*(.+)/);
            var providerNameMatch = modBlock.match(/providerName:\s*(.+)/);
            var disabledMatch = modBlock.match(/disabled:\s*(true|false)/i);
            fromPatch = {
              active: !disabledMatch || disabledMatch[1] !== 'true',
              upstream: upstreamMatch ? upstreamMatch[1].trim() : '',
              providerName: providerNameMatch ? providerNameMatch[1].trim().replace(/['"]/g, '') : ''
            };
          }
        } catch (e) {}
        if (fromPatch) return fromPatch;
        /* No profile-patch entry: the plugin can still ship in the web
           profile template as a bundle layer — report that activation. */
        try {
          var profileManifest = JSON.parse(readFileSync(pathJoin(DSH_HOME, 'profiles', 'web', 'package.json'), 'utf8'));
          var bundles = (profileManifest.dsh && profileManifest.dsh.profile && profileManifest.dsh.profile.bundles) || [];
          if (bundles.indexOf('@liustack/modlens') !== -1) return { active: true, upstream: '', providerName: '', viaTemplate: true };
        } catch (e) {}
        return { active: false };
      }

      /* GET /modlens/status */
      disposers.push(ws.register({ kind: 'exact', path: '/web-search/api/modlens/status', handler: function(req, res) {
        apiJson(res, 200, { variant: readVariantStatus(), engine: readModlensConfig() });
      }}));

      /* GET /modlens/models */
      disposers.push(ws.register({ kind: 'exact', path: '/web-search/api/modlens/models', handler: async function(req, res) {
        try { apiJson(res, 200, await listAllModels()); } catch (e) { apiJson(res, 200, []) }
      }}));

      /* POST /modlens/variant — generate a vision variant */
      disposers.push(ws.register({ kind: 'exact', path: '/web-search/api/modlens/variant', handler: async function(req, res) {
        try {
          var body = await apiBody(req);
          if (!body || !body.hostProvider || !body.hostModel) { apiJson(res, 400, { ok: false, error: 'hostProvider and hostModel required' }); return }

          if (body.visionProvider && body.visionModel) {
            var provInfo = readProviderFromSettings(body.visionProvider);
            var cfg = readModlensConfig();
            var engineProvider = provInfo.api.indexOf('anthropic') >= 0 ? 'anthropic' : 'openai';
            cfg.provider = engineProvider;
            if (!cfg.providers) cfg.providers = {};
            if (!cfg.providers[engineProvider]) cfg.providers[engineProvider] = {};
            cfg.providers[engineProvider].baseUrl = provInfo.baseURL;
            cfg.providers[engineProvider].apiKey = process.env[provInfo.apiKeyEnv] || '';
            cfg.providers[engineProvider].model = body.visionModel;
            writeModlensConfig(cfg);
          }

          var hostInfo = readProviderFromSettings(body.hostProvider);
          var providerName = body.variantName || (hostInfo.displayName + ' (modlens vision)');
          var patchContent = readFileSync(patchPath, 'utf8');
          var newConfig = '    upstream: ' + body.hostProvider + '\n    families:\n      - ' + body.hostProvider + '\n    providerName: ' + JSON.stringify(providerName);
          var modStart = patchContent.indexOf('- id: modlens');
          if (modStart === -1) {
            /* No user-layer entry yet: append an id-targeted override. The
               bundle row already carries the plugin; this entry only pins its
               config (upstream/families/providerName). */
            if (patchContent.length > 0 && !patchContent.endsWith('\n')) patchContent += '\n';
            var appended = '\n- id: modlens\n  name: \'@liustack/modlens\'\n  config:\n' + newConfig + '\n';
            writeFileSync(patchPath, patchContent + appended, 'utf8');
          } else {
            /* Remove disabled: true if present */
            patchContent = patchContent.replace(/(\n  disabled:\s*true)/i, '');
            var configStart = patchContent.indexOf('config:', modStart);
            if (configStart === -1) { apiJson(res, 500, { ok: false, error: 'config block not found' }); return }
            var nextEntry = patchContent.indexOf('\n- id:', configStart);
            if (nextEntry === -1) nextEntry = patchContent.length;
            var newPatch = patchContent.substring(0, configStart) + 'config:\n' + newConfig + patchContent.substring(nextEntry);
            writeFileSync(patchPath, newPatch, 'utf8');
          }

          var loader = ctx.get('loader');
          if (loader) {
            for (var e of loader.entries()) {
              if (e.id === 'modlens' || e.options.name === '@liustack/modlens') {
                if (e.fiber) { try { await e.fiber.dispose() } catch(err) {} }
                try { await loader.import(e); } catch(err) {}
                break;
              }
            }
          }
          apiJson(res, 200, { ok: true, providerName: providerName });
        } catch (e) { apiJson(res, 500, { ok: false, error: String(e.message || e) }) }
      }}));

      /* POST /modlens/variant/disable */
      disposers.push(ws.register({ kind: 'exact', path: '/web-search/api/modlens/variant/disable', handler: async function(req, res) {
        try {
          /* Update cordis.patch.yml to disable modlens */
          var patchContent = readFileSync(patchPath, 'utf8');
          var modStart = patchContent.indexOf('- id: modlens');
          if (modStart !== -1) {
            /* Check if already has disabled: true */
            var modBlock = patchContent.substring(modStart);
            var nextEntry = modBlock.indexOf('\n- id:', 5);
            if (nextEntry > 0) modBlock = modBlock.substring(0, nextEntry);
            if (!/disabled:\s*true/i.test(modBlock)) {
              /* Insert disabled: true after the name line */
              var nameEnd = patchContent.indexOf('\n', modStart + patchContent.substring(modStart).indexOf('name:'));
              if (nameEnd !== -1) {
                patchContent = patchContent.substring(0, nameEnd + 1) + '  disabled: true\n' + patchContent.substring(nameEnd + 1);
                writeFileSync(patchPath, patchContent, 'utf8');
              }
            }
          } else {
            /* Template-activated plugin with no user-layer entry yet: append
               the disabled override so the bundle row actually turns off. */
            if (patchContent.length > 0 && !patchContent.endsWith('\n')) patchContent += '\n';
            writeFileSync(patchPath, patchContent
              + '\n- id: modlens\n  name: \'@liustack/modlens\'\n  disabled: true\n', 'utf8');
          }
          /* Dispose and reload modlens */
          var loader = ctx.get('loader');
          if (loader) {
            for (var e of loader.entries()) {
              if (e.id === 'modlens' || e.options.name === '@liustack/modlens') {
                if (e.fiber) { try { await e.fiber.dispose() } catch(err) {} }
                try { await loader.import(e); } catch(err) {}
                break;
              }
            }
          }
          apiJson(res, 200, { ok: true });
        } catch (e) { apiJson(res, 500, { ok: false, error: String(e.message || e) }) }
      }}));
}
    return function () { disposers.forEach(function(d) { d() }) };
  });
}

export { apply, inject };