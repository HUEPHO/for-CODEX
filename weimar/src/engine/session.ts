import { createGame } from './setup.ts';
import { dispatch } from './reducer.ts';
import { ensure } from './rules.ts';
import type { GameState, Command, NewGameOptions } from './types.ts';
export const SAVE_VERSION = 'weimar-0.7.0';
interface SaveFile {
  format: typeof SAVE_VERSION;
  options: NewGameOptions;
  commands: Command[];
}
export class GameSession {
  state: GameState;
  readonly options: NewGameOptions;
  commands: Command[] = [];
  redoCommands: Command[] = [];
  constructor(options: NewGameOptions = {}) {
    this.options = {
      seed: options.seed ?? 1921,
      demo: options.scenario ? false : (options.demo ?? true),
      ...(options.scenario ? { scenario: options.scenario } : {}),
      ...(options.testCard !== undefined
        ? { testCard: options.testCard, testPrerequisites: options.testPrerequisites ?? false }
        : {}),
    };
    this.state = createGame(this.options);
  }
  send(command: Command) {
    const result = dispatch(this.state, command);
    if (result.ok) {
      this.state = result.state;
      this.commands.push(structuredClone(command));
      this.redoCommands = [];
    }
    return result;
  }
  private replay() {
    let state = createGame(this.options);
    for (const c of this.commands) {
      const r = dispatch(state, c);
      ensure(r.ok, r.ok ? '' : '操作记录无法重放：' + r.error);
      state = r.state;
    }
    this.state = state;
  }
  undo() {
    const c = this.commands.pop();
    if (c) {
      this.redoCommands.push(c);
      this.replay();
    }
  }
  redo() {
    const c = this.redoCommands.pop();
    if (c) {
      this.commands.push(c);
      this.replay();
    }
  }
  export() {
    return JSON.stringify(
      { format: SAVE_VERSION, options: this.options, commands: this.commands } satisfies SaveFile,
      null,
      2,
    );
  }
  static import(text: string) {
    ensure(text.length <= 5_000_000, '存档超过5MB限制');
    let save: SaveFile;
    try {
      save = JSON.parse(text);
    } catch {
      throw new Error('不是有效的 JSON 存档');
    }
    // Legacy histories are revalidated under current rules; changed choice IDs
    // or clarified rules can reject them or change outcomes. Never overwrite the old save.
    ensure(
      save &&
        [
          SAVE_VERSION,
          'weimar-0.6.0',
          'weimar-0.5.0',
          'weimar-0.4.0',
          'weimar-0.3.0',
          'weimar-tutorial-0.2.0',
          'weimar-tutorial-0.1.0',
        ].includes(save.format),
      '存档版本不兼容，请使用本版本导出的存档',
    );
    ensure(save.options && typeof save.options.demo === 'boolean', '存档设置无效');
    ensure(Array.isArray(save.commands) && save.commands.length <= 10000, '操作记录无效或过长');
    const session = new GameSession(save.options);
    for (let i = 0; i < save.commands.length; i++) {
      const r = session.send(save.commands[i]);
      ensure(r.ok, r.ok ? '' : `第 ${i + 1} 条记录无效：${r.error}`);
    }
    return session;
  }
}
