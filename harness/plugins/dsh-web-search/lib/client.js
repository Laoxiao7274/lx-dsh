window.__ModuleLoader__.load({
	id: "@laoxiao7274/dsh-web-search",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");

		var gsapReady = null;
		function ensureGsap() {
			if (gsapReady) return gsapReady;
			if (typeof window.gsap !== 'undefined') { gsapReady = Promise.resolve(window.gsap); return gsapReady; }
			gsapReady = new Promise(function (resolve) {
				var s = document.createElement('script');
				s.src = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js';
				s.onload = function () { resolve(window.gsap); };
				s.onerror = function () { resolve(null); };
				document.head.appendChild(s);
			});
			return gsapReady;
		}

		function apply(ctx) {
			var slots = ctx.slots;
			if (slots === undefined) return;
			slots.inject('settings.section', function () {
				slots.register({ name: 'settings.section', id: 'web-search', order: 50, label: '网页搜索' }, WebSearchPanel);
			});
			slots.inject('settings.section', function () {
				slots.register({ name: 'settings.section', id: 'plugin-manager', order: 60, label: '插件管理' }, PluginManagerPanel);
			});
			slots.inject('settings.section', function () {
				slots.register({ name: 'settings.section', id: 'modlens', order: 70, label: '视觉模型' }, ModlensPanel);
			});
		}

		/* ── Theme tokens: use host --dsw-alias-* variables, matching ui-settings-plugins ── */
		var C = {
			card: function (extra) { return Object.assign({
				background: 'var(--dsw-alias-bg-layer-3)',
				border: '1px solid var(--dsw-alias-border-l2)',
				borderRadius: '12px',
				padding: '14px 16px',
				transition: 'border-color 0.16s, background 0.16s'
			}, extra || {}); },
			label: { fontSize: '13px', fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', marginBottom: '6px' },
			desc: { fontSize: '13px', color: 'var(--dsw-alias-label-tertiary)', lineHeight: '1.5' },
			input: {
				padding: '8px 12px', borderRadius: '8px',
				border: '1px solid var(--dsw-alias-border-l2)',
				background: 'var(--dsw-alias-bg-layer-2)',
				color: 'var(--dsw-alias-label-primary)',
				fontSize: '14px', width: '100%', boxSizing: 'border-box',
				transition: 'border-color 0.16s'
			},
			btn: function (variant) {
				var base = { padding: '5px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.16s', border: '1px solid transparent', display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', appearance: 'none', font: 'inherit' };
				if (variant === 'primary') return Object.assign(base, { background: 'var(--dsw-alias-label-primary)', color: 'var(--dsw-alias-bg-layer-3)' });
				if (variant === 'success') return Object.assign(base, { borderColor: 'var(--dsw-alias-state-success-primary)', background: 'var(--dsw-alias-state-success-tertiary)', color: 'var(--dsw-alias-state-success-primary)' });
				return Object.assign(base, { borderColor: 'var(--dsw-alias-border-l2)', background: 'none', color: 'var(--dsw-alias-label-secondary)' });
			},
			sectionTitle: { fontSize: '15px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--dsw-alias-label-primary)', display: 'flex', alignItems: 'center', gap: '8px' },
			badge: function (color) { return {
				display: 'inline-flex', alignItems: 'center', fontSize: '11px', fontWeight: 500,
				padding: '1px 8px', borderRadius: '999px',
				background: 'var(--dsw-alias-bg-module-platform)',
				color: 'var(--dsw-alias-label-secondary)',
				whiteSpace: 'nowrap'
			}; },
			badgeColored: function (color) { return {
				display: 'inline-flex', alignItems: 'center', fontSize: '11px', fontWeight: 500,
				padding: '1px 8px', borderRadius: '999px',
				background: color + '1a', color: color,
				whiteSpace: 'nowrap'
			}; }
		};

		/* ── Custom Dropdown with GSAP animation ── */
		function Dropdown(props) {
			var openState = react.useState(false);
			var open = openState[0], setOpen = openState[1];
			var rootRef = react.useRef(null);
			var menuRef = react.useRef(null);

			react.useEffect(function () {
				if (!open) return;
				var handler = function (e) {
					if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
				};
				document.addEventListener('mousedown', handler);
				return function () { document.removeEventListener('mousedown', handler); };
			}, [open]);

			react.useEffect(function () {
				if (!menuRef.current) return;
				ensureGsap().then(function (gsap) {
					if (!gsap) return;
					if (open) {
						var items = menuRef.current.querySelectorAll('[data-dropdown-item]');
						gsap.set(menuRef.current, { display: 'block', opacity: 0, y: -6, transformOrigin: 'top center' });
						gsap.to(menuRef.current, { opacity: 1, y: 0, duration: 0.18, ease: 'power2.out' });
						gsap.fromTo(items, { opacity: 0, x: -6 }, { opacity: 1, x: 0, duration: 0.16, stagger: 0.025, ease: 'power2.out', delay: 0.04 });
					} else {
						gsap.to(menuRef.current, { opacity: 0, y: -6, duration: 0.12, ease: 'power2.in', onComplete: function () { if (menuRef.current) menuRef.current.style.display = 'none'; } });
					}
				});
			}, [open]);

			var selected = props.options.find(function (o) { return o.value === props.value; }) || props.options[0] || { label: '', value: '' };

			return react.createElement('div', { ref: rootRef, style: { position: 'relative', width: '100%', zIndex: open ? 50 : 'auto' } },
				react.createElement('button', {
					type: 'button',
					style: {
						width: '100%', boxSizing: 'border-box', padding: '8px 32px 8px 12px', borderRadius: '8px',
						border: '1px solid ' + (open ? 'var(--dsw-alias-label-dimmed)' : 'var(--dsw-alias-border-l2)'),
						background: 'var(--dsw-alias-bg-layer-2)',
						color: 'var(--dsw-alias-label-primary)',
						fontSize: '14px', fontWeight: 500, textAlign: 'left', cursor: 'pointer',
						transition: 'border-color 0.16s',
						display: 'flex', alignItems: 'center', justifyContent: 'space-between',
						appearance: 'none', font: 'inherit'
					},
					onClick: function () { setOpen(!open); }
				},
					react.createElement('span', null, selected ? selected.label : ''),
					react.createElement('svg', { width: '12', height: '12', viewBox: '0 0 24 24', fill: 'none', stroke: 'var(--dsw-alias-label-tertiary)', strokeWidth: '2.5', strokeLinecap: 'round', style: { transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.16s' } },
						react.createElement('path', { d: 'M6 9l6 6 6-6' })
					)
				),
				react.createElement('div', {
					ref: menuRef,
					style: {
						position: 'absolute', top: 'calc(100% + 4px)', left: '0', right: '0', zIndex: 100,
						background: 'var(--dsw-alias-bg-layer-3)',
						border: '1px solid var(--dsw-alias-border-l2)',
						borderRadius: '8px',
						boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
						overflow: 'hidden', display: 'none', maxHeight: '240px', overflowY: 'auto'
					}
				}, props.options.map(function (o) {
					var isSelected = o.value === props.value;
					return react.createElement('div', {
						key: o.value,
						'data-dropdown-item': true,
						style: {
							padding: '8px 12px', fontSize: '14px', cursor: 'pointer',
							color: isSelected ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-primary)',
							fontWeight: isSelected ? 600 : 400,
							background: isSelected ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent',
							transition: 'background 0.12s'
						},
						onMouseEnter: function (e) { if (!isSelected) e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)'; },
						onMouseLeave: function (e) { if (!isSelected) e.currentTarget.style.background = 'transparent'; },
						onClick: function () { props.onChange(o.value); setOpen(false); }
					}, o.label);
				}))
			);
		}

		/* ── Toggle switch ── */
		function Toggle(p) {
			var on = p.value;
			var ref = react.useRef(null);
			react.useEffect(function () {
				if (!ref.current) return;
				ensureGsap().then(function (gsap) {
					if (!gsap) return;
					var knob = ref.current.querySelector('[data-toggle-knob]');
					if (knob) gsap.to(knob, { x: on ? 20 : 0, duration: 0.3, ease: 'power2.inOut' });
				});
			}, [on]);
			return react.createElement('button', {
				ref: ref,
				style: {
					position: 'relative', width: '44px', height: '24px', borderRadius: '12px',
					border: '1px solid var(--dsw-alias-border-l2)',
					cursor: 'pointer', flexShrink: 0,
					background: on ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-bg-module-platform)',
					transition: 'background 0.3s ease, border-color 0.3s ease',
					appearance: 'none'
				},
				onClick: function () { p.onChange(!on) }
			}, react.createElement('span', {
				'data-toggle-knob': true,
				style: {
					position: 'absolute', top: '2px', left: '2px',
					width: '18px', height: '18px', borderRadius: '50%',
					background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
				}
			}));
		}

		function WebSearchPanel(props) {
			var cs = react.useState(null); var config = cs[0], setConfig = cs[1];
			var ms = react.useState([]); var models = ms[0], setModels = ms[1];
			var es = react.useState(''); var error = es[0], setError = es[1];
			var rootRef = react.useRef(null);

			react.useEffect(function () {
				fetch('/web-search/api/get-config').then(function(r) { return r.json() }).then(setConfig).catch(function (e) { setError(String(e)) });
				fetch('/web-search/api/list-models').then(function(r) { return r.json() }).then(function(list) { if (Array.isArray(list)) setModels(list) }).catch(function(e) {});
			}, []);

			react.useEffect(function () {
				if (!config || !rootRef.current) return;
				var cards = rootRef.current.querySelectorAll('[data-anim-card]');
				ensureGsap().then(function (gsap) {
					if (!gsap) return;
					gsap.set(cards, { opacity: 0, y: 12 });
					gsap.to(cards, { opacity: 1, y: 0, duration: 0.32, stagger: 0.06, ease: 'power2.out', clearProps: 'opacity,transform' });
				});
			}, [config]);

			function update(patch) {
				fetch('/web-search/api/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).then(function(r) { return r.json() }).then(function () {
					setConfig(function (prev) {
						var next = JSON.parse(JSON.stringify(prev));
						if (patch.provider) next.provider = patch.provider;
						if (patch.apiKeys) for (var k in patch.apiKeys) if (k in next.apiKeys) next.apiKeys[k] = patch.apiKeys[k];
						if (patch.curator) for (var c in patch.curator) next.curator[c] = patch.curator[c];
						if (patch.summary) for (var s in patch.summary) next.summary[s] = patch.summary[s];
						return next;
					});
				}).catch(function (e) { setError(String(e)) });
			}

			if (config === null) return react.createElement('div', { style: { maxWidth: '560px', padding: '20px 0', color: 'var(--dsw-alias-label-tertiary)', fontSize: '14px' } }, '加载中…');

			var PROVIDERS = [
				{ value: 'deepseek', label: 'DeepSeek（内置）' },
				{ value: 'exa-mcp', label: 'Exa MCP（免费）' },
				{ value: 'tavily', label: 'Tavily' },
				{ value: 'brave', label: 'Brave' },
				{ value: 'jina', label: 'Jina' },
				{ value: 'exa', label: 'Exa API' },
				{ value: 'kagi', label: 'Kagi' },
				{ value: 'perplexity', label: 'Perplexity' }
			];
			var current = PROVIDERS.find(function (p) { return p.value === config.provider }) || PROVIDERS[0];

			var children = [];
			children.push(react.createElement('div', { key: 'header', style: { marginBottom: '2px' } },
				react.createElement('h2', { style: C.sectionTitle }, '🌐 网页搜索'),
				react.createElement('p', { style: Object.assign({}, C.desc, { margin: '0 0 4px 0' }) }, '配置搜索引擎、API 密钥、审核服务和模型总结。')
			));

			children.push(react.createElement('div', { key: 'provider', 'data-anim-card': true, style: C.card() },
				react.createElement('label', { style: C.label }, '搜索引擎'),
				react.createElement(Dropdown, { options: PROVIDERS, value: config.provider, onChange: function (v) { update({ provider: v }) } }),
				current.needsKey && react.createElement('div', { style: { marginTop: '10px' } },
					react.createElement('label', { style: C.label }, current.label + ' API Key'),
					react.createElement('input', { type: 'password', style: C.input, placeholder: '输入 API Key…', defaultValue: config.apiKeys[current.value] || '', onBlur: function (e) { update({ apiKeys: (function(){ var o={}; o[current.value]=e.target.value; return o })() }) } })
				)
			));

			children.push(react.createElement('div', { key: 'curator', 'data-anim-card': true, style: C.card() },
				react.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
					react.createElement('label', { style: Object.assign({}, C.label, { marginBottom: 0 }) }, '审核服务'),
					config.curator.webEnabled ? react.createElement('span', { style: C.badgeColored('#f0ad4e') }, '已开启') : react.createElement('span', { style: C.badge() }, '已关闭')
				),
				react.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' } },
					react.createElement(Toggle, { value: config.curator.webEnabled, onChange: function (v) { update({ curator: { webEnabled: v } }) } }),
					react.createElement('span', { style: { fontSize: '13px', color: 'var(--dsw-alias-label-tertiary)', lineHeight: '1.4' } }, '开启后搜索需手动确认，关闭后自动返回结果。')
				)
			));

			var sumChildren = [
				react.createElement('div', { key: 'sum-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
					react.createElement('label', { style: Object.assign({}, C.label, { marginBottom: 0 }) }, '模型总结'),
					config.summary.enabled ? react.createElement('span', { style: C.badgeColored('#5cb85c') }, '已开启') : react.createElement('span', { style: C.badge() }, '已关闭')
				),
				react.createElement('div', { key: 'sum-toggle', style: { display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' } },
					react.createElement(Toggle, { value: config.summary.enabled, onChange: function (v) { update({ summary: { enabled: v } }) } }),
					react.createElement('span', { style: { fontSize: '13px', color: 'var(--dsw-alias-label-tertiary)', lineHeight: '1.4' } }, '用模型总结搜索结果，独立于审核服务。')
				)
			];
			if (config.summary.enabled) {
				var modelOptions = [{ value: '', label: '当前会话模型' }];
				models.forEach(function (m) { modelOptions.push({ value: m.value, label: m.label }) });
				sumChildren.push(react.createElement('div', { key: 'sum-model', style: { marginTop: '10px' } },
					react.createElement('label', { style: C.label }, '总结模型'),
					react.createElement(Dropdown, { options: modelOptions, value: config.summary.model || '', onChange: function (v) { update({ summary: { model: v } }) } })
				));
			}
			children.push(react.createElement('div', { key: 'summary', 'data-anim-card': true, style: C.card() }, sumChildren));

			if (error) children.push(react.createElement('div', { key: 'err', style: { padding: '8px 12px', borderRadius: '8px', background: 'var(--dsw-alias-state-error-secondary)', color: 'var(--dsw-alias-state-error-primary)', fontSize: '13px' } }, '⚠ ' + error));

			return react.createElement('div', { ref: rootRef, style: { maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '12px', padding: '20px 0' } }, children);
		}

		function PluginManagerPanel(props) {
			var ps = react.useState(null); var plugins = ps[0], setPlugins = ps[1];
			var cs = react.useState({}); var checking = cs[0], setChecking = cs[1];
			var bs = react.useState({}); var busy = bs[0], setBusy = bs[1];
			var rootRef = react.useRef(null);

			function loadPlugins() {
				fetch('/web-search/api/plugins').then(function(r) { return r.json() }).then(function(list) { setPlugins(Array.isArray(list) ? list : []); }).catch(function() { setPlugins([]); });
			}
			react.useEffect(function () { loadPlugins(); }, []);

			react.useEffect(function () {
				if (!plugins || !rootRef.current) return;
				var cards = rootRef.current.querySelectorAll('[data-pm-card]');
				ensureGsap().then(function (gsap) {
					if (!gsap) return;
					gsap.set(cards, { opacity: 0, y: 10 });
					gsap.to(cards, { opacity: 1, y: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out', clearProps: 'opacity,transform' });
				});
			}, [plugins]);

			function checkUpdate(name) {
				setChecking(function (prev) { var n = JSON.parse(JSON.stringify(prev)); n[name] = 'checking'; return n; });
				fetch('/web-search/api/plugins/check?name=' + encodeURIComponent(name)).then(function(r) { return r.json() }).then(function(info) {
					setChecking(function (prev) { var n = JSON.parse(JSON.stringify(prev)); n[name] = info; return n; });
				}).catch(function() {
					setChecking(function (prev) { var n = JSON.parse(JSON.stringify(prev)); n[name] = { error: 'failed' }; return n; });
				});
			}

			function updatePlugin(p) {
				setBusy(function (prev) { var n = JSON.parse(JSON.stringify(prev)); n[p.name] = 'updating'; return n; });
				fetch('/web-search/api/plugins/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: p.name, dir: p.dir }) }).then(function(r) { return r.json() }).then(function() {
					setBusy(function (prev) { var n = JSON.parse(JSON.stringify(prev)); n[p.name] = null; return n; });
					loadPlugins(); checkUpdate(p.name);
				}).catch(function(e) { setBusy(function (prev) { var n = JSON.parse(JSON.stringify(prev)); n[p.name] = null; return n; }); });
			}

			function reloadPlugin(p) {
				setBusy(function (prev) { var n = JSON.parse(JSON.stringify(prev)); n[p.name] = 'reloading'; return n; });
				fetch('/web-search/api/plugins/reload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: p.name }) }).then(function(r) { return r.json() }).then(function() {
					setBusy(function (prev) { var n = JSON.parse(JSON.stringify(prev)); n[p.name] = null; return n; });
				}).catch(function(e) { setBusy(function (prev) { var n = JSON.parse(JSON.stringify(prev)); n[p.name] = null; return n; }); });
			}

			if (plugins === null) return react.createElement('div', { style: { maxWidth: '560px', padding: '20px 0', color: 'var(--dsw-alias-label-tertiary)', fontSize: '14px' } }, '加载中…');

			var children = [];
			children.push(react.createElement('div', { key: 'header', style: { marginBottom: '2px' } },
				react.createElement('h2', { style: C.sectionTitle }, '🔌 插件管理'),
				react.createElement('p', { style: Object.assign({}, C.desc, { margin: '0 0 4px 0' }) }, '查看已安装的第三方插件，检查更新，重载插件。')
			));

			if (plugins.length === 0) {
				children.push(react.createElement('div', { 'data-pm-card': true, style: C.card({ textAlign: 'center', color: 'var(--dsw-alias-label-tertiary)' }) }, '暂无已安装的第三方插件'));
			} else {
				plugins.forEach(function (p) {
					var st = checking[p.name];
					var isBusy = busy[p.name];
					var isChecking = st === 'checking';
					var info = (st && typeof st === 'object') ? st : null;
					var hasUpdate = info && info.latest && info.latest !== p.version;
					var iconText = p.name.replace(/^@[^/]+\//, '').charAt(0).toUpperCase();
					var isBuiltin = p.source === 'builtin';

					var statusBadge = null;
					if (isBuiltin) statusBadge = react.createElement('span', { style: C.badgeColored('#8a7fe8') }, '内置');
					else if (isBusy === 'updating') statusBadge = react.createElement('span', { style: C.badgeColored('#5b9bd5') }, '更新中');
					else if (isBusy === 'reloading') statusBadge = react.createElement('span', { style: C.badgeColored('#5b9bd5') }, '重载中');
					else if (isChecking) statusBadge = react.createElement('span', { style: C.badge() }, '检查中');
					else if (hasUpdate) statusBadge = react.createElement('span', { style: C.badgeColored('#5cb85c') }, '有新版本 v' + info.latest);
					else if (info && !info.error) statusBadge = react.createElement('span', { style: C.badge() }, '最新');

					var cardChildren = [
						react.createElement('div', { key: 'top', style: { display: 'flex', alignItems: 'flex-start', gap: '12px' } },
							react.createElement('div', { style: { width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: '#fff', background: 'var(--dsw-alias-brand-primary)' } }, iconText),
							react.createElement('div', { style: { flex: 1, minWidth: 0 } },
								react.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
									react.createElement('span', { style: { fontSize: '14px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, p.name),
									react.createElement('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)', fontFamily: 'monospace' } }, 'v' + p.version)
								),
								p.description && react.createElement('p', { style: Object.assign({}, C.desc, { margin: '3px 0 0 0', fontSize: '12px' }) }, p.description)
							),
							statusBadge
						),
						react.createElement('div', { key: 'actions', style: { display: 'flex', gap: '8px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--dsw-alias-border-l2)' } },
							!isBuiltin && react.createElement('button', { style: C.btn(), onClick: function () { checkUpdate(p.name); } }, isChecking ? '检查中…' : '检查更新'),
							!isBuiltin && hasUpdate && react.createElement('button', { style: C.btn('success'), onClick: function () { updatePlugin(p); }, disabled: isBusy === 'updating' }, '更新'),
							react.createElement('button', { style: C.btn('primary'), onClick: function () { reloadPlugin(p); }, disabled: isBusy === 'reloading' }, '重载')
						)
					];
					children.push(react.createElement('div', { key: p.name, 'data-pm-card': true, style: C.card() }, cardChildren));
				});
			}

			return react.createElement('div', { ref: rootRef, style: { maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '12px', padding: '20px 0' } }, children);
		}

		/* ── Modlens Vision Panel ── */
		function ModlensPanel(props) {
			var st = react.useState(null); var status = st[0], setStatus = st[1];
			var ms = react.useState([]); var models = ms[0], setModels = ms[1];
			var es = react.useState(''); var error = es[0], setError = es[1];
			var hs = react.useState(''); var hostModel = hs[0], setHostModel = hs[1];
			var vs = react.useState(''); var visionModel = vs[0], setVisionModel = vs[1];
			var ns = react.useState(''); var variantName = ns[0], setVariantName = ns[1];
			var gs = react.useState(false); var generating = gs[0], setGenerating = gs[1];
			var rs = react.useState(null); var result = rs[0], setResult = rs[1];
			var tabState = react.useState('generate'); var activeTab = tabState[0], setTab = tabState[1];
			var delState = react.useState(null); var delTarget = delState[0], setDelTarget = delState[1];
			var editState = react.useState(null); var editTarget = editState[0], setEditTarget = editState[1];
			var editNameState = react.useState(''); var editName = editNameState[0], setEditName = editNameState[1];
			var editHostState = react.useState(''); var editHost = editHostState[0], setEditHost = editHostState[1];
			var editVisionState = react.useState(''); var editVision = editVisionState[0], setEditVision = editVisionState[1];
			var rootRef = react.useRef(null);

			function loadAll() {
				Promise.all([
					fetch('/web-search/api/modlens/status').then(function(r) { return r.json() }),
					fetch('/web-search/api/modlens/models').then(function(r) { return r.json() }).catch(function() { return [] })
				]).then(function(arr) {
					setStatus(arr[0]);
					setModels(Array.isArray(arr[1]) ? arr[1] : []);
				}).catch(function(e) { setError(String(e)) });
			}
			react.useEffect(function () { loadAll(); }, []);

			react.useEffect(function () {
				if (!status || !rootRef.current) return;
				var cards = rootRef.current.querySelectorAll('[data-ml-card]');
				ensureGsap().then(function (gsap) {
					if (!gsap) return;
					gsap.set(cards, { opacity: 0, y: 10 });
					gsap.to(cards, { opacity: 1, y: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out', clearProps: 'opacity,transform' });
				});
			}, [status]);

			react.useEffect(function () {
				if (!rootRef.current) return;
				var cards = rootRef.current.querySelectorAll('[data-ml-card], [data-pm-card]');
				if (!cards.length) return;
				ensureGsap().then(function (gsap) {
					if (!gsap) return;
					gsap.fromTo(cards, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.25, stagger: 0.04, ease: 'power2.out' });
				});
			}, [activeTab]);

			if (status === null) return react.createElement('div', { style: { maxWidth: '560px', padding: '20px 0', color: 'var(--dsw-alias-label-tertiary)', fontSize: '14px' } }, '加载中…');

			var allModels = models.map(function (m) { return { value: m.value || m.id || '', label: m.label || m.name || m.id || '' }; });
			var hostOptions = allModels.filter(function (m) { return m.label.indexOf('modlens vision') === -1; });
			var existingVariants = allModels.filter(function (m) { return m.label.indexOf('modlens vision') >= 0; }).map(function (m) { var parts = m.label.split(' / '); return { value: m.value, label: parts[0] }; });
			var variant = status.variant || {};
			var engine = status.engine || {};

			function generate(host, vision, name) {
				setGenerating(true); setResult(null);
				var parts = host.split('/');
				var hp = parts.length > 1 ? parts[0] : host;
				var hm = parts.length > 1 ? parts[1] : host;
				var vparts = vision.split('/');
				var vp = vparts.length > 1 ? vparts[0] : vision;
				var vm = vparts.length > 1 ? vparts[1] : vision;
				fetch('/web-search/api/modlens/variant', {
					method: 'POST', headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ hostProvider: hp, hostModel: hm, visionProvider: vp, visionModel: vm, variantName: name || '' })
				}).then(function(r) { return r.json() }).then(function(r) {
					setGenerating(false);
					if (r.ok) { setResult({ ok: true, name: r.providerName }); setHostModel(''); setVisionModel(''); setVariantName(''); loadAll(); }
					else setResult({ ok: false, error: r.error || '未知错误' });
				}).catch(function(e) { setGenerating(false); setResult({ ok: false, error: String(e) }); });
			}

			function disableVariant() {
				setGenerating(true);
				fetch('/web-search/api/modlens/variant/disable', { method: 'POST' })
					.then(function(r) { return r.json() })
					.then(function(r) { setGenerating(false); if (r.ok) { setResult(null); loadAll(); } })
					.catch(function(e) { setGenerating(false); setError(String(e)); });
			}

			var tabStyle = function (active) { return Object.assign({
				padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
				border: '1px solid transparent', transition: 'all 0.16s', appearance: 'none', font: 'inherit'
			}, active ? {
				background: 'var(--dsw-alias-interactive-bg-hover)', border: '1px solid var(--dsw-alias-border-l2)',
				color: 'var(--dsw-alias-label-primary)'
			} : {
				background: 'none', color: 'var(--dsw-alias-label-tertiary)'
			}); };

			var children = [];
			children.push(react.createElement('div', { key: 'header', style: { marginBottom: '2px' } },
				react.createElement('h2', { style: C.sectionTitle }, '👁 视觉模型'),
				react.createElement('p', { style: Object.assign({}, C.desc, { margin: '0 0 8px 0' }) }, '为主模型添加视觉能力，生成和管理视觉变体。')
			));

			children.push(react.createElement('div', { key: 'tabs', style: { display: 'flex', gap: '6px', marginBottom: '4px' } },
				react.createElement('button', { style: tabStyle(activeTab === 'generate'), onClick: function () { setTab('generate'); } }, '生成变体'),
				react.createElement('button', { style: tabStyle(activeTab === 'manage'), onClick: function () { setTab('manage'); } }, '管理变体' + (existingVariants.length > 0 ? ' (' + existingVariants.length + ')' : ''))
			));

			if (activeTab === 'generate') {
				var genCard = [
					react.createElement('div', { key: 'host-field', style: { marginBottom: '12px' } },
						react.createElement('label', { style: C.label }, '主模型（文本模型）'),
						react.createElement('p', { style: Object.assign({}, C.desc, { margin: '0 0 6px 0', fontSize: '12px' }) }, '选择要添加视觉能力的文本模型。'),
						react.createElement(Dropdown, { options: hostOptions, value: hostModel, onChange: function (v) { setHostModel(v); setResult(null); } })
					),
					react.createElement('div', { key: 'vision-field', style: { marginBottom: '12px' } },
						react.createElement('label', { style: C.label }, '视觉模型（读图引擎）'),
						react.createElement('p', { style: Object.assign({}, C.desc, { margin: '0 0 6px 0', fontSize: '12px' }) }, '选择用于读取图片的模型。'),
						react.createElement(Dropdown, { options: allModels, value: visionModel, onChange: function (v) { setVisionModel(v); setResult(null); } })
					),
					react.createElement('div', { key: 'name-field', style: { marginBottom: '12px' } },
						react.createElement('label', { style: C.label }, '变体名称（可选）'),
						react.createElement('input', { style: C.input, placeholder: 'MYT (modlens vision)', value: variantName, onChange: function (e) { setVariantName(e.target.value); } })
					),
					react.createElement('button', {
						key: 'gen-btn',
						style: Object.assign({}, C.btn('primary'), { opacity: (!hostModel || !visionModel || generating) ? 0.4 : 1 }),
						disabled: !hostModel || !visionModel || generating, onClick: function () { generate(hostModel, visionModel, variantName); }
					}, generating ? '生成中…' : '✨ 生成视觉变体')
				];
				if (result) {
					genCard.push(react.createElement('div', {
						key: 'result', style: { marginTop: '10px', padding: '8px 12px', borderRadius: '8px', fontSize: '13px',
							background: result.ok ? 'var(--dsw-alias-state-success-tertiary)' : 'var(--dsw-alias-state-error-secondary)',
							color: result.ok ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)' }
					}, result.ok ? '✓ 已生成：' + result.name : '✗ ' + result.error));
				}
				children.push(react.createElement('div', { key: 'gen-card', 'data-ml-card': true, style: C.card() }, genCard));
			} else {
				var mgmtChildren = [];
				if (variant.active && existingVariants.length === 0) {
					var ep = engine.provider || '-';
					var em = (engine.providers && engine.providers[ep] && engine.providers[ep].model) || '-';
					if (editTarget === 'active') {
						mgmtChildren.push(react.createElement('div', { key: 'edit-active', style: { marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--dsw-alias-border-l2)' } },
							react.createElement('label', { style: C.label }, '变体名称'),
							react.createElement('input', { style: C.input, value: editName, onChange: function (e) { setEditName(e.target.value); } }),
							react.createElement('div', { style: { height: '10px' } }),
							react.createElement('label', { style: C.label }, '主模型'),
							react.createElement(Dropdown, { options: hostOptions, value: editHost, onChange: setEditHost }),
							react.createElement('div', { style: { height: '10px' } }),
							react.createElement('label', { style: C.label }, '视觉模型'),
							react.createElement(Dropdown, { options: allModels, value: editVision, onChange: setEditVision }),
							react.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } },
								react.createElement('button', { style: Object.assign({}, C.btn('primary'), { opacity: (!editHost || !editVision || generating) ? 0.4 : 1 }), disabled: !editHost || !editVision || generating, onClick: function () { generate(editHost, editVision, editName); setEditTarget(null); } }, generating ? '保存中…' : '保存'),
								react.createElement('button', { style: C.btn(), onClick: function () { setEditTarget(null); } }, '取消')
							)
						));
					} else {
						mgmtChildren.push(react.createElement('div', { key: 'active-row', style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' } },
							react.createElement('div', { style: { width: '28px', height: '28px', borderRadius: '6px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#fff', background: 'var(--dsw-alias-brand-primary)' } }, (variant.providerName || '?').charAt(0)),
							react.createElement('div', { style: { flex: 1, minWidth: 0 } },
								react.createElement('span', { style: { fontSize: '14px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, variant.providerName || '未命名变体'),
								react.createElement('span', { style: Object.assign({}, C.badgeColored('#5cb85c'), { marginLeft: '8px' }) }, '已启用')
							),
							react.createElement('div', { style: { display: 'flex', gap: '6px' } },
								react.createElement('button', { style: C.btn(), onClick: function () {
								setEditTarget('active');
								setEditName(variant.providerName || '');
								var up = variant.upstream || '';
								var hostMatch = hostOptions.find(function(o) { return o.value.indexOf(up) >= 0; });
								setEditHost(hostMatch ? hostMatch.value : '');
								var engModel = (engine.providers && engine.providers[engine.provider] && engine.providers[engine.provider].model) || '';
								var visMatch = allModels.find(function(o) { return o.label.indexOf(engModel) >= 0 || o.value.indexOf(engModel) >= 0; });
								setEditVision(visMatch ? visMatch.value : '');
							}, disabled: generating }, '修改'),
								react.createElement('button', { style: C.btn(), onClick: disableVariant, disabled: generating }, '关闭')
							)
						));
						mgmtChildren.push(react.createElement('div', { key: 'active-info', style: { display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--dsw-alias-border-l2)' } },
							react.createElement('span', null, 'upstream: ' + (variant.upstream || '-')),
							react.createElement('span', null, '视觉引擎: ' + ep),
							react.createElement('span', null, '视觉模型: ' + em)
						));
					}
				}
				if (existingVariants.length > 0) {
					if (variant.active) mgmtChildren.push(react.createElement('div', { key: 'list-label', style: { fontSize: '12px', fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', marginBottom: '6px' } }, '模型选择器中的变体'));
					existingVariants.forEach(function (v) {
						if (editTarget === v.value) {
							mgmtChildren.push(react.createElement('div', { key: 'edit-' + v.value, style: { padding: '8px 0', borderBottom: '1px solid var(--dsw-alias-border-l1)' } },
								react.createElement('label', { style: C.label }, '变体名称'),
								react.createElement('input', { style: C.input, value: editName, onChange: function (e) { setEditName(e.target.value); } }),
								react.createElement('div', { style: { height: '8px' } }),
								react.createElement('label', { style: C.label }, '主模型'),
								react.createElement(Dropdown, { options: hostOptions, value: editHost, onChange: setEditHost }),
								react.createElement('div', { style: { height: '8px' } }),
								react.createElement('label', { style: C.label }, '视觉模型'),
								react.createElement(Dropdown, { options: allModels, value: editVision, onChange: setEditVision }),
								react.createElement('div', { style: { display: 'flex', gap: '6px', marginTop: '8px' } },
									react.createElement('button', { style: Object.assign({}, C.btn('primary'), { opacity: (!editHost || !editVision || generating) ? 0.4 : 1 }), disabled: !editHost || !editVision || generating, onClick: function () { generate(editHost, editVision, editName); setEditTarget(null); } }, generating ? '保存中…' : '保存'),
									react.createElement('button', { style: C.btn(), onClick: function () { setEditTarget(null); } }, '取消')
								)
							));
						} else {
							mgmtChildren.push(react.createElement('div', { key: v.value, style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--dsw-alias-border-l1)' } },
								react.createElement('div', { style: { width: '24px', height: '24px', borderRadius: '5px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#fff', background: 'var(--dsw-alias-brand-primary)' } }, v.label.charAt(0)),
								react.createElement('span', { style: { flex: 1, fontSize: '13px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' } }, v.label),
								react.createElement('button', { style: C.btn(), onClick: function () {
								setEditTarget(v.value);
								setEditName(v.label);
								var up = variant.upstream || '';
								var hostMatch = hostOptions.find(function(o) { return o.value.indexOf(up) >= 0; });
								setEditHost(hostMatch ? hostMatch.value : '');
								var engModel = (engine.providers && engine.providers[engine.provider] && engine.providers[engine.provider].model) || '';
								var visMatch = allModels.find(function(o) { return o.label.indexOf(engModel) >= 0 || o.value.indexOf(engModel) >= 0; });
								setEditVision(visMatch ? visMatch.value : '');
							}, disabled: generating }, '修改'),
								react.createElement('button', { style: Object.assign({}, C.btn(), { color: 'var(--dsw-alias-state-error-primary)', borderColor: 'var(--dsw-alias-state-error-secondary)' }), onClick: function () { setDelTarget(v); } }, '删除')
							));
						}
					});
				}
				if (mgmtChildren.length === 0) {
					mgmtChildren.push(react.createElement('div', { key: 'empty', style: { textAlign: 'center', color: 'var(--dsw-alias-label-tertiary)', padding: '12px' } }, '暂无已生成的视觉变体'));
				}
				children.push(react.createElement('div', { key: 'mgmt-card', 'data-ml-card': true, style: C.card() }, mgmtChildren));
			}

			if (delTarget) {
				children.push(react.createElement('div', {
					key: 'modal-overlay', onClick: function () { setDelTarget(null); },
					style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }
				},
					react.createElement('div', {
						key: 'modal', onClick: function (e) { e.stopPropagation(); },
						style: { background: 'var(--dsw-alias-bg-layer-3)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '12px', padding: '20px', maxWidth: '360px', width: '90%', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }
					},
						react.createElement('h3', { style: { fontSize: '15px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--dsw-alias-label-primary)' } }, '确认删除'),
						react.createElement('p', { style: Object.assign({}, C.desc, { margin: '0 0 16px 0' }) }, '确定要删除变体「' + delTarget.label + '」吗？此操作不可恢复。'),
						react.createElement('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
							react.createElement('button', { style: C.btn(), onClick: function () { setDelTarget(null); } }, '取消'),
							react.createElement('button', {
								style: Object.assign({}, C.btn(), { background: 'var(--dsw-alias-state-error-primary)', color: '#fff', borderColor: 'transparent' }),
								onClick: function () { disableVariant(); setDelTarget(null); }
							}, '删除')
						)
					)
				)
				);
			}

			if (error) children.push(react.createElement('div', { key: 'err', style: { padding: '8px 12px', borderRadius: '8px', background: 'var(--dsw-alias-state-error-secondary)', color: 'var(--dsw-alias-state-error-primary)', fontSize: '13px' } }, '⚠ ' + error));

			return react.createElement('div', { ref: rootRef, style: { maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '12px', padding: '20px 0' } }, children);
		}

		exports.apply = apply;
		exports.inject = ["slots"];
		return module.exports;
	}
});