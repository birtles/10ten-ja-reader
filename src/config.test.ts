let mockBrowser: any = {};

jest.mock('webextension-polyfill-ts', () => ({ browser: mockBrowser }));

import { Config } from './config';
import { DbLanguageId } from './db-languages';

type StorageName = 'sync' | 'local';
type StorageChange = {
  oldValue?: any;
  newValue?: any;
};
type ChangeDict = { [field: string]: StorageChange };
type Listener = (changes: ChangeDict, areaName: StorageName) => void;

class MockStorage {
  onChanged = new MockOnChanged();
  sync = new MockStorageArea(this.onChanged, 'sync');
}

class MockOnChanged {
  _listeners: Array<Listener> = [];

  addListener(listener: Listener) {
    if (this._listeners.indexOf(listener) !== -1) {
      return;
    }
    this._listeners.push(listener);
  }

  removeListener(listener: Listener) {
    const index = this._listeners.indexOf(listener);
    if (index === -1) {
      return;
    }
    this._listeners.splice(index, 1);
  }

  _onChange(changes: ChangeDict, areaName: StorageName) {
    for (const listener of this._listeners) {
      listener(changes, areaName);
    }
  }
}

type StorageDict = { [key: string]: any };

class MockStorageArea {
  _storage: StorageDict = {};
  _onChanged: MockOnChanged;
  _areaName: StorageName;

  constructor(onChanged: MockOnChanged, areaName: StorageName) {
    this._onChanged = onChanged;
    this._areaName = areaName;
  }

  get(
    param: string | Array<string> | { [key: string]: any } | null
  ): Promise<any> {
    if (param === undefined || param === null) {
      return Promise.resolve(this._storage);
    }

    if (Array.isArray(param)) {
      const result: StorageDict = {};
      for (const field of param) {
        result[field] = this._storage[field];
      }
      return Promise.resolve(result);
    }

    if (typeof param === 'object') {
      const result: StorageDict = {};
      for (const field of Object.keys(param)) {
        result[field] = this._storage[field] || param[field];
      }
      return Promise.resolve(result);
    }

    if (typeof param === 'string') {
      const result: StorageDict = {};
      if (this._storage.hasOwnProperty(param)) {
        result[param] = this._storage[param];
      }
      return Promise.resolve(result);
    }

    return Promise.reject('Unexpected param type');
  }

  set(obj: StorageDict) {
    const changes: ChangeDict = {};
    for (const field of Object.keys(obj)) {
      changes[field] = {};
      if (typeof this._storage[field] !== 'undefined') {
        changes[field].oldValue = this._storage[field];
      }
      if (typeof obj[field] !== 'undefined') {
        changes[field].newValue = obj[field];
      }
    }

    this._storage = { ...this._storage, ...obj };

    setImmediate(() => {
      this._onChanged._onChange(changes, this._areaName);
    });

    return Promise.resolve();
  }

  remove(keys: string | Array<string>): Promise<void> {
    if (Array.isArray(keys)) {
      for (const key of keys) {
        delete this._storage[key];
      }
    } else {
      delete this._storage[keys];
    }

    return Promise.resolve();
  }
}

(global as any).__ALLOW_MAC_CTRL__ = false;

describe('Config', () => {
  let languageGetter: jest.SpyInstance<readonly string[], []>;

  beforeEach(() => {
    mockBrowser.storage = new MockStorage();
    languageGetter = jest.spyOn(window.navigator, 'languages', 'get');
  });

  it('returns the default settings', () => {
    languageGetter.mockReturnValue(['ro', 'fr-CA', 'en']);
    const config = new Config();

    expect(config.showPriority).toEqual(true);
    expect(config.showRomaji).toEqual(false);
    expect(config.readingOnly).toEqual(false);
    expect(config.accentDisplay).toEqual('binary');
    expect(config.posDisplay).toEqual('expl');
    expect(config.toggleKey).toEqual('Alt+R');
    expect(config.holdToShowKeys).toEqual(null);
    expect(config.keys).toEqual({
      toggleDefinition: [],
      nextDictionary: ['Shift', 'Enter'],
      movePopupDownOrUp: [],
      startCopy: ['c'],
    });
    expect(config.keysNormalized).toEqual({
      toggleDefinition: [],
      nextDictionary: ['Shift', 'Enter'],
      movePopupUp: [],
      movePopupDown: [],
      startCopy: ['c'],
    });
    expect(config.contextMenuEnable).toEqual(true);
    expect(config.popupStyle).toEqual('default');
    expect(config.noTextHighlight).toEqual(false);
    expect(config.dictLang).toEqual('fr');
    expect(config.showKanjiComponents).toEqual(true);
    expect(config.kanjiReferences).toEqual([
      'radical',
      'nelson_r',
      'kk',
      'py',
      'jlpt',
      'unicode',
      'conning',
      'halpern_njecd',
      'halpern_kkld_2ed',
      'heisig6',
      'henshall',
      'sh_kk2',
      'nelson_c',
      'nelson_n',
      'skip',
      'sh_desc',
    ]);
  });

  it('reports changes to all listeners', async () => {
    const receivedChanges1: Array<ChangeDict> = [];
    const receivedChanges2: Array<ChangeDict> = [];

    const config = new Config();
    config.addChangeListener((change) => {
      receivedChanges1.push(change);
    });
    config.addChangeListener((change) => {
      receivedChanges2.push(change);
    });

    config.showKanjiComponents = false;
    config.showKanjiComponents = true;

    await new Promise<void>(function checkForChanges(resolve) {
      if (receivedChanges1.length + receivedChanges2.length < 4) {
        setImmediate(() => {
          checkForChanges(resolve);
        });
      } else {
        resolve();
      }
    });

    expect(receivedChanges1).toEqual([
      { showKanjiComponents: { newValue: false } },
      { showKanjiComponents: { oldValue: false, newValue: true } },
    ]);
    expect(receivedChanges2).toEqual([
      { showKanjiComponents: { newValue: false } },
      { showKanjiComponents: { oldValue: false, newValue: true } },
    ]);
  });

  it('upgrades reference settings', async () => {
    await mockBrowser.storage.sync.set({
      kanjiReferences: {
        E: true,
        U: true,
        P: false,
        L: false,
        Y: true,
      },
    });

    const config = new Config();

    await config.ready;

    expect(config.kanjiReferences).toEqual([
      'radical',
      'nelson_r',
      'kk',
      'py',
      'jlpt',
      'unicode',
      'conning',
      'halpern_njecd',
      'halpern_kkld_2ed',
      'henshall',
      'sh_kk2',
      'nelson_c',
      'nelson_n',
      'sh_desc',
    ]);

    const setReferences = await mockBrowser.storage.sync.get(
      'kanjiReferencesV2'
    );
    expect(setReferences).toEqual({
      kanjiReferencesV2: {
        unicode: true,
        heisig6: false,
        henshall: true,
        py: true,
        skip: false,
      },
    });
  });

  it('handles changes to dictLang setting', () => {
    languageGetter.mockReturnValue(['ro', 'fr-CA', 'en']);
    const config = new Config();

    // Default value
    expect(config.dictLang).toEqual('fr');

    // Explicitly override
    config.dictLang = 'pt';
    expect(config.dictLang).toEqual('pt');

    // Revert to default
    config.dictLang = 'fr';
    languageGetter.mockReturnValue(['es', 'en']);
    // ... Should reflect updated default
    expect(config.dictLang).toEqual('es');

    // No supported default language
    languageGetter.mockReturnValue(['da']);
    expect(config.dictLang).toEqual('en');

    // Unsupported value
    config.dictLang = 'yer' as DbLanguageId;
    expect(config.dictLang).toEqual('en');
  });

  it('reports changes to default dictLang setting', async () => {
    languageGetter.mockReturnValue(['en']);
    const config = new Config();

    const listenForNextChange = () =>
      new Promise<ChangeDict>((resolve) => {
        config.addChangeListener(function reportChange(change) {
          config.removeChangeListener(reportChange);
          resolve(change);
        });
      });

    const listenForNoChange = () =>
      new Promise<void>((resolve, reject) => {
        config.addChangeListener((changes) => {
          reject(new Error(`Got change: ${JSON.stringify(changes)}`));
        });

        let tries = 10;
        (function wait() {
          if (--tries) {
            setImmediate(wait);
          } else {
            resolve();
          }
        })();
      });

    const languageChangeEvent = new Event('languagechange');

    // Check that changing the language produces an event
    languageGetter.mockReturnValue(['es', 'en']);
    let nextChangePromise = listenForNextChange();
    window.dispatchEvent(languageChangeEvent);
    let nextChange = await nextChangePromise;
    expect(nextChange).toEqual({
      dictLang: { oldValue: 'en', newValue: 'es' },
    });
    expect(config.dictLang).toEqual('es');

    // Check that a change that doesn't effect the value is ignored
    languageGetter.mockReturnValue(['da', 'es', 'en']);
    let noChangePromise = listenForNoChange();
    window.dispatchEvent(languageChangeEvent);
    await noChangePromise;
    expect(config.dictLang).toEqual('es');

    // Override the language so that we no longer depend on the user's
    // accept-languages setting.
    nextChangePromise = listenForNextChange();
    config.dictLang = 'pt';
    nextChange = await nextChangePromise;
    expect(nextChange).toEqual({
      dictLang: { oldValue: 'es', newValue: 'pt' },
    });

    // Check that we don't report a change if the user's accept-language changes
    // now.
    languageGetter.mockReturnValue(['en']);
    noChangePromise = listenForNoChange();
    window.dispatchEvent(languageChangeEvent);
    await noChangePromise;
    expect(config.dictLang).toEqual('pt');
  });
});
