// Fold raw session events (history page + live mux frames) into render items.
// Linear, stateless over the full event array — cheap enough to re-run per batch.
import type { HistoryEntry } from '@/dsh/types';

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}
export interface Block {
  type: 'text' | 'reasoning' | 'tool-call';
  text: string;
  id?: string;
  name?: string;
  argsText?: string;
}
export type Item =
  | { kind: 'user'; key: string; seq: number; text: string }
  | { kind: 'context'; key: string; seq: number; label: string; text: string }
  | { kind: 'assistant'; key: string; seq: number; stepLabel: string; blocks: (Block | undefined)[]; streaming: boolean; usage?: Usage }
  | { kind: 'tool'; key: string; seq: number; callId: string; name: string; title?: string; description?: string; args?: string; output?: string; done: boolean; viewCard?: string }
  | { kind: 'divider'; key: string; seq: number; text: string; tone: 'dim' | 'info' | 'ok' | 'warn' | 'err' };

export function foldEvents(entries: HistoryEntry[]): Item[] {
  const items: Item[] = [];
  const byKey = new Map<string, any>();
  const push = (it: Item): void => {
    items.push(it);
    byKey.set(it.key, it);
  };

  for (const entry of entries) {
    const e = entry.event;
    const d: any = e.data ?? {};
    const v = entry.view;

    switch (e.type) {
      case 'user/message': {
        const src: any = d.source ?? {};
        const text = (d.content ?? [])
          .filter((b: any) => b && b.type === 'text')
          .map((b: any) => b.text)
          .join('\n');
        if (!text) break;
        if (src.kind === 'user') {
          push({ kind: 'user', key: 'u' + e.seq, seq: e.seq, text });
        } else {
          const label = src.kind === 'plugin' ? String(src.plugin ?? 'plugin').split('/').pop() : String(src.kind ?? 'system');
          push({ kind: 'context', key: 'c' + e.seq, seq: e.seq, label, text });
        }
        break;
      }

      case 'assistant/chunk': {
        const key = 'a' + d.turn + '_' + d.step;
        let it: any = byKey.get(key);
        if (!it) {
          it = { kind: 'assistant', key, seq: e.seq, stepLabel: 'turn ' + d.turn + ' · step ' + d.step, blocks: [], streaming: true };
          byKey.set(key, it);
          items.push(it);
        }
        it.seq = e.seq;
        const c: any = d.chunk ?? {};
        if (c.type === 'block-start') {
          it.blocks[c.index] = { type: c.blockType === 'tool-call' ? 'tool-call' : c.blockType, text: '' };
        } else if (c.type === 'text-delta' || c.type === 'reasoning-delta') {
          const b = it.blocks[c.index] ?? (it.blocks[c.index] = { type: c.type === 'text-delta' ? 'text' : 'reasoning', text: '' });
          b.text += c.text ?? '';
        } else if (c.type === 'tool-call-delta') {
          let b: any = it.blocks[c.index];
          if (!b) {
            b = { type: 'tool-call', text: '', id: c.id, name: c.name, argsText: '' };
            it.blocks[c.index] = b;
          }
          if (c.id) b.id = c.id;
          if (c.name) b.name = c.name;
          b.argsText = (b.argsText ?? '') + (c.argumentsDelta ?? '');
        } else if (c.type === 'block-end') {
          const bl: any = c.block ?? {};
          if (bl.type === 'text' || bl.type === 'reasoning') {
            it.blocks[c.index] = { type: bl.type, text: bl.text ?? '' };
          } else if (bl.type === 'tool-call') {
            it.blocks[c.index] = {
              type: 'tool-call',
              text: '',
              id: bl.id,
              name: bl.name,
              argsText: bl.arguments != null ? (typeof bl.arguments === 'string' ? bl.arguments : JSON.stringify(bl.arguments)) : '',
            };
          }
        } else if (c.type === 'usage') {
          it.usage = c.usage;
        }
        break;
      }

      case 'assistant/message': {
        const key = 'a' + d.turn + '_' + d.step;
        let it: any = byKey.get(key);
        if (!it) {
          it = { kind: 'assistant', key, seq: e.seq, stepLabel: 'turn ' + d.turn + ' · step ' + d.step, blocks: [], streaming: false };
          byKey.set(key, it);
          items.push(it);
        }
        it.seq = e.seq;
        it.streaming = false;
        it.stepLabel = 'turn ' + d.turn + ' · step ' + d.step;
        if (d.usage) it.usage = d.usage;
        const msg: any = d.message ?? {};
        it.blocks = (msg.content ?? []).map((b: any) => {
          if (!b) return undefined;
          if (b.type === 'text') return { type: 'text', text: b.text ?? '' } as Block;
          if (b.type === 'reasoning') return { type: 'reasoning', text: b.text ?? '' } as Block;
          if (b.type === 'tool-call') {
            return {
              type: 'tool-call',
              text: '',
              id: b.id,
              name: b.name,
              argsText: b.arguments != null ? (typeof b.arguments === 'string' ? b.arguments : JSON.stringify(b.arguments)) : '',
            } as Block;
          }
          return { type: 'text', text: '[' + b.type + ']' } as Block;
        });
        break;
      }

      case 'tool/call': {
        push({
          kind: 'tool',
          key: 't' + d.callId,
          seq: e.seq,
          callId: d.callId,
          name: d.name,
          title: v?.view?.title,
          description: v?.view?.description,
          args: d.arguments,
          done: false,
          viewCard: v?.view?.card,
        });
        break;
      }

      case 'tool/result': {
        const callId: string | undefined = d.message?.source?.callId;
        let output: any = v?.view?.output;
        if (output === undefined) {
          const inner = (d.message?.content ?? []).find((b: any) => b && b.type === 'tool-result');
          output = (inner?.content ?? []).filter((c: any) => c && c.type === 'text').map((c: any) => c.text).join('\n');
        }
        const it: any = callId ? byKey.get('t' + callId) : undefined;
        if (it) {
          it.output = output;
          it.done = true;
          it.seq = e.seq;
        } else {
          push({ kind: 'divider', key: 'tr' + e.seq, seq: e.seq, text: 'tool/result (call unknown)', tone: 'dim' });
        }
        break;
      }

      case 'step/start':
      case 'step/end':
        break;

      case 'turn/end':
        push({ kind: 'divider', key: 'te' + e.seq, seq: e.seq, text: 'turn ' + d.turn + ' · ' + ((d.reason && d.reason.kind) || d.reason || 'end'), tone: 'dim' });
        break;

      case 'command/run':
        push({ kind: 'divider', key: 'cr' + e.seq, seq: e.seq, text: '/' + (d.name ?? '') + ' ' + (d.args ?? ''), tone: 'info' });
        break;
      case 'command/done':
        push({ kind: 'divider', key: 'cd' + e.seq, seq: e.seq, text: String(d.kind ?? 'done') + (d.text ? ': ' + d.text : ''), tone: d.kind === 'success' ? 'ok' : 'dim' });
        break;

      case 'approval/asked':
        push({ kind: 'divider', key: 'aa' + e.seq, seq: e.seq, text: 'approval requested · ' + d.toolName + (d.reason ? ' — ' + String(d.reason).slice(0, 140) : ''), tone: 'warn' });
        break;
      case 'approval/decided':
        push({ kind: 'divider', key: 'ad' + e.seq, seq: e.seq, text: 'approval: ' + d.outcome, tone: d.outcome === 'allowed-once' ? 'ok' : 'dim' });
        break;

      case 'permission/preset':
        push({ kind: 'divider', key: 'pp' + e.seq, seq: e.seq, text: 'permission preset → ' + d.preset, tone: 'info' });
        break;
      case 'approval/policy':
        push({ kind: 'divider', key: 'ap' + e.seq, seq: e.seq, text: 'approval policy → ' + d.policy, tone: 'info' });
        break;
      case 'sandbox/mode':
        push({ kind: 'divider', key: 'sm' + e.seq, seq: e.seq, text: 'sandbox mode → ' + d.mode, tone: 'info' });
        break;

      case 'agent/inbox/spliced':
        break;

      default:
        if (e.ignorable) break;
        push({ kind: 'divider', key: 'x' + e.seq, seq: e.seq, text: e.type, tone: 'dim' });
    }
  }
  return items;
}
