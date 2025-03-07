import '../html/options.html.src';

import {
  allDataSeries,
  allMajorDataSeries,
  DataSeries,
  DataSeriesState,
  MajorDataSeries,
} from '@birchill/hikibiki-data';
import Browser, { browser } from 'webextension-polyfill-ts';

import { Config, DEFAULT_KEY_SETTINGS } from './config';
import { AccentDisplay, PartOfSpeechDisplay } from './content-config';
import { Command, CommandParams, isValidKey } from './commands';
import { CopyKeys, CopyNextKeyStrings } from './copy-keys';
import { dbLanguageMeta, isDbLanguageId } from './db-languages';
import {
  DbStateUpdatedMessage,
  cancelDbUpdate,
  deleteDb,
  reportError,
  updateDb,
} from './db-listener-messages';
import { translateDoc } from './l10n';
import { getReferenceLabelsForLang, getReferencesForLang } from './refs';
import { isChromium, isEdge, isFirefox, isMac, isSafari } from './ua-utils';

const config = new Config();

function completeForm() {
  // UA-specific styles
  if (isFirefox()) {
    document.documentElement.classList.add('firefox');
  }
  if (isChromium()) {
    document.documentElement.classList.add('chromium');
  }
  if (isEdge()) {
    document.documentElement.classList.add('edge');
  }
  if (isSafari()) {
    document.documentElement.classList.add('safari');
  }

  // Pop-up
  renderPopupStyleSelect();

  // Keyboard
  configureCommands();
  configureHoldToShowKeys();
  addPopupKeys();
  translateKeys();

  // Language
  fillInLanguages();

  // Kanji
  createKanjiReferences();

  // l10n
  translateDoc();

  document.getElementById('highlightText')!.addEventListener('click', (evt) => {
    config.noTextHighlight = !(evt.target as HTMLInputElement).checked;
  });

  document
    .getElementById('contextMenuEnable')!
    .addEventListener('click', (evt) => {
      config.contextMenuEnable = (evt.target as HTMLInputElement).checked;
    });

  document.getElementById('showPriority')!.addEventListener('click', (evt) => {
    config.showPriority = (evt.target as HTMLInputElement).checked;
    renderPopupStyleSelect();
  });

  document.getElementById('showRomaji')!.addEventListener('click', (evt) => {
    config.showRomaji = (evt.target as HTMLInputElement).checked;
    renderPopupStyleSelect();
  });

  document
    .getElementById('showDefinitions')!
    .addEventListener('click', (evt) => {
      config.readingOnly = !(evt.target as HTMLInputElement).checked;
      renderPopupStyleSelect();
    });

  document.getElementById('accentDisplay')!.addEventListener('input', (evt) => {
    config.accentDisplay = (evt.target as HTMLSelectElement)
      .value as AccentDisplay;
    renderPopupStyleSelect();
  });

  document.getElementById('posDisplay')!.addEventListener('input', (evt) => {
    config.posDisplay = (evt.target as HTMLSelectElement)
      .value as PartOfSpeechDisplay;
    renderPopupStyleSelect();
  });

  document
    .getElementById('showKanjiComponents')!
    .addEventListener('click', (evt) => {
      config.showKanjiComponents = (evt.target as HTMLInputElement).checked;
    });

  if (browser.management) {
    browser.management.getSelf().then((info) => {
      if (info.installType === 'development') {
        (document.querySelector('.db-admin') as HTMLElement).style.display =
          'block';
        document
          .getElementById('deleteDatabase')!
          .addEventListener('click', (evt) => {
            if (browserPort) {
              browserPort.postMessage(deleteDb());
            }
          });
      }
    });
  }
}

function renderPopupStyleSelect() {
  const popupStyleSelect = document.getElementById('popupstyle-select')!;
  empty(popupStyleSelect);
  const themes = ['default', 'light', 'blue', 'lightblue', 'black', 'yellow'];

  for (const theme of themes) {
    const input = document.createElement('input');
    input.setAttribute('type', 'radio');
    input.setAttribute('name', 'popupStyle');
    input.setAttribute('value', theme);
    input.setAttribute('id', `popupstyle-${theme}`);
    popupStyleSelect.appendChild(input);

    input.addEventListener('click', () => {
      config.popupStyle = theme;
    });

    const label = document.createElement('label');
    label.setAttribute('for', `popupstyle-${theme}`);
    popupStyleSelect.appendChild(label);

    // The default theme alternates between light and dark so we need to
    // generate two popup previews and overlay them.
    if (theme === 'default') {
      const popupPreviewContainer = document.createElement('div');
      popupPreviewContainer.classList.add('overlay');
      popupPreviewContainer.appendChild(renderPopupPreview('light'));
      popupPreviewContainer.appendChild(renderPopupPreview('black'));
      label.appendChild(popupPreviewContainer);
    } else {
      label.appendChild(renderPopupPreview(theme));
    }
  }
}

function renderPopupPreview(theme: string): HTMLElement {
  const popupPreview = document.createElement('div');
  popupPreview.classList.add('popup-preview');
  popupPreview.classList.add('window');
  popupPreview.classList.add(`-${theme}`);

  const entry = document.createElement('div');
  entry.classList.add('entry');
  popupPreview.appendChild(entry);

  const headingDiv = document.createElement('div');
  entry.append(headingDiv);

  const spanKanji = document.createElement('span');
  spanKanji.classList.add('w-kanji');
  spanKanji.textContent = '理解';
  if (config.showPriority) {
    spanKanji.append(renderStar());
  }
  headingDiv.appendChild(spanKanji);

  const spanKana = document.createElement('span');
  spanKana.classList.add('w-kana');

  switch (config.accentDisplay) {
    case 'downstep':
      spanKana.textContent = 'りꜜかい';
      break;

    case 'binary':
      {
        const spanWrapper = document.createElement('span');
        spanWrapper.classList.add('w-binary');

        const spanRi = document.createElement('span');
        spanRi.classList.add('h-l');
        spanRi.textContent = 'り';
        spanWrapper.append(spanRi);

        const spanKai = document.createElement('span');
        spanKai.classList.add('l');
        spanKai.textContent = 'かい';
        spanWrapper.append(spanKai);

        spanKana.append(spanWrapper);
      }
      break;

    case 'none':
      spanKana.textContent = 'りかい';
      break;
  }

  if (config.showPriority) {
    spanKana.append(renderStar());
  }
  headingDiv.appendChild(spanKana);

  if (config.showRomaji) {
    const spanRomaji = document.createElement('span');
    spanRomaji.classList.add('w-romaji');
    spanRomaji.textContent = 'rikai';
    headingDiv.appendChild(spanRomaji);
  }

  if (!config.readingOnly) {
    const spanDef = document.createElement('span');

    if (config.posDisplay !== 'none') {
      const posSpan = document.createElement('span');
      posSpan.classList.add('w-pos', 'tag');
      switch (config.posDisplay) {
        case 'expl':
          posSpan.append(
            ['n', 'vs']
              .map((pos) => browser.i18n.getMessage(`pos_label_${pos}`) || pos)
              .join(', ')
          );
          break;

        case 'code':
          posSpan.append('n, vs');
          break;
      }
      spanDef.append(posSpan);
    }

    spanDef.classList.add('w-def');
    spanDef.append('understanding');

    entry.appendChild(spanDef);
  }

  return popupPreview;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function renderStar(): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('svgicon');
  svg.style.opacity = '0.5';
  svg.setAttribute('viewBox', '0 0 98.6 93.2');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute(
    'd',
    'M98 34a4 4 0 00-3-1l-30-4L53 2a4 4 0 00-7 0L33 29 4 33a4 4 0 00-3 6l22 20-6 29a4 4 0 004 5 4 4 0 002 0l26-15 26 15a4 4 0 002 0 4 4 0 004-4 4 4 0 000-1l-6-29 22-20a4 4 0 001-5z'
  );
  svg.append(path);

  return svg;
}

function configureCommands() {
  // Disable any controls associated with configuring browser.commands if the
  // necessary APIs are not available.
  const canConfigureCommands =
    browser.commands &&
    typeof (browser.commands as any).update === 'function' &&
    typeof (browser.commands as any).reset === 'function';

  const browserCommandControls =
    document.querySelectorAll('.key.command input');
  for (const control of browserCommandControls) {
    (control as HTMLInputElement).disabled = !canConfigureCommands;
  }

  document.getElementById('browser-commands-alternative')!.style.display =
    canConfigureCommands ? 'none' : 'block';

  if (!canConfigureCommands) {
    return;
  }

  const getToggleShortcut = (): Command => {
    const getControl = (part: string): HTMLInputElement => {
      return document.getElementById(`toggle-${part}`) as HTMLInputElement;
    };

    const params: CommandParams = {
      alt: getControl('alt').checked,
      ctrl: getControl('ctrl').checked,
      macCtrl: !!getControl('macctrl')?.checked,
      shift: getControl('shift').checked,
      key: getControl('key').value,
    };

    return Command.fromParams(params);
  };

  const updateToggleKey = () => {
    try {
      const shortcut = getToggleShortcut();
      config.toggleKey = shortcut.toString();
      showToggleCommandSupport(shortcut);
    } catch (e) {
      setToggleKeyWarningState('error', e.message);
    }
  };

  const toggleKeyCheckboxes = document.querySelectorAll(
    '.command input[type=checkbox][id^=toggle-]'
  );
  for (const checkbox of toggleKeyCheckboxes) {
    checkbox.addEventListener('click', updateToggleKey);
  }

  const toggleKeyTextbox = document.getElementById(
    'toggle-key'
  ) as HTMLInputElement;
  toggleKeyTextbox.addEventListener('keydown', (evt) => {
    let key = evt.key;
    if (evt.key.length === 1) {
      key = key.toUpperCase();
    }

    if (!isValidKey(key)) {
      // Most printable keys are one character in length so make sure we don't
      // allow the default action of adding them to the text input. For other
      // keys we don't handle though (e.g. Tab) we probably want to allow the
      // default action.
      if (evt.key.length === 1) {
        evt.preventDefault();
      }
      return;
    }

    toggleKeyTextbox.value = key;
    evt.preventDefault();
    updateToggleKey();
  });

  toggleKeyTextbox.addEventListener('compositionstart', () => {
    toggleKeyTextbox.value = '';
  });
  toggleKeyTextbox.addEventListener('compositionend', () => {
    toggleKeyTextbox.value = toggleKeyTextbox.value.toUpperCase();
    updateToggleKey();
  });
}

type WarningState = 'ok' | 'warning' | 'error';

function setToggleKeyWarningState(state: WarningState, message?: string) {
  const icon = document.getElementById('toggle-key-icon')!;
  icon.classList.toggle('-warning', state === 'warning');
  icon.classList.toggle('-error', state === 'error');
  if (message) {
    icon.setAttribute('title', message);
  } else {
    icon.removeAttribute('title');
  }
}

function getFirefoxMajorVersion(): number | null {
  const matches = navigator.userAgent.match(/Firefox\/(\d+)/);
  if (matches === null || matches.length < 2) {
    return null;
  }

  const majorVersion = parseInt(matches[1]);
  return majorVersion === 0 ? null : majorVersion;
}

function showToggleCommandSupport(command: Command) {
  // Key sequences with a secondary modifier other than Shift are only
  // supported from Firefox 63 and onwards. Show a warning or error depending on
  // whether or not we are prior to Firefox 63.
  const firefoxMajorVersion = getFirefoxMajorVersion();
  if (firefoxMajorVersion === null || !command.usesExpandedModifierSet()) {
    setToggleKeyWarningState('ok');
    return;
  }

  if (firefoxMajorVersion < 63) {
    setToggleKeyWarningState(
      'error',
      browser.i18n.getMessage('error_ctrl_alt_unsupported')
    );
  } else {
    setToggleKeyWarningState(
      'warning',
      browser.i18n.getMessage('error_ctrl_alt_warning')
    );
  }
}

function configureHoldToShowKeys() {
  const checkboxes = document.querySelectorAll(
    '.holdtoshowkeys input[type=checkbox][id^=show-]'
  );

  const getHoldToShowKeysValue = (): string | null => {
    const parts: Array<string> = [];

    for (const checkbox of checkboxes) {
      if ((checkbox as HTMLInputElement).checked) {
        parts.push((checkbox as HTMLInputElement).value);
      }
    }
    if (!parts.length) {
      return null;
    }
    return parts.join('+');
  };

  for (const checkbox of checkboxes) {
    checkbox.addEventListener('click', () => {
      config.holdToShowKeys = getHoldToShowKeysValue();
    });
  }
}

function addPopupKeys() {
  const grid = document.getElementById('key-grid')!;

  for (const setting of DEFAULT_KEY_SETTINGS) {
    // Don't show the copy entry if the clipboard API is not available
    if (
      setting.name === 'startCopy' &&
      (!navigator.clipboard ||
        typeof navigator.clipboard.writeText !== 'function')
    ) {
      continue;
    }

    const keyBlock = document.createElement('div');
    keyBlock.classList.add('key');
    keyBlock.classList.add('browser-style');

    for (const key of setting.keys) {
      const keyInput = document.createElement('input');
      keyInput.setAttribute('type', 'checkbox');
      keyInput.setAttribute('id', `key-${setting.name}-${key}`);
      keyInput.setAttribute('name', `key-${setting.name}-${key}`);
      keyInput.classList.add(`key-${setting.name}`);
      keyInput.dataset.key = key;
      keyBlock.append(keyInput);
      keyBlock.append(' '); // <-- Mimick the whitespace in the template file

      keyInput.addEventListener('click', () => {
        const checkedKeys = document.querySelectorAll(
          `input[type=checkbox].key-${setting.name}:checked`
        );
        config.updateKeys({
          [setting.name]: Array.from(checkedKeys).map(
            (checkbox) => (checkbox as HTMLInputElement).dataset.key
          ),
        });
      });

      const keyLabel = document.createElement('label');
      keyLabel.setAttribute('for', `key-${setting.name}-${key}`);

      // We need to add an extra span inside in order to be able to get
      // consistent layout when using older versions of extensions.css that put
      // the checkbox in a pseudo.
      if (setting.name === 'movePopupDownOrUp') {
        const [down, up] = key.split(',', 2);

        {
          const downSpan = document.createElement('span');
          downSpan.classList.add('key-box');
          downSpan.textContent = down;
          keyLabel.append(downSpan);
        }

        {
          const orSpan = document.createElement('span');
          orSpan.classList.add('or');
          orSpan.textContent = '/';
          keyLabel.append(orSpan);
        }

        {
          const upSpan = document.createElement('span');
          upSpan.classList.add('key-box');
          upSpan.textContent = up;
          keyLabel.append(upSpan);
        }
      } else {
        const keyLabelSpan = document.createElement('span');
        keyLabelSpan.classList.add('key-box');
        keyLabelSpan.textContent = key;
        keyLabel.append(keyLabelSpan);
      }

      keyBlock.append(keyLabel);
    }

    grid.append(keyBlock);

    const keyDescription = document.createElement('div');
    keyDescription.classList.add('key-description');
    keyDescription.textContent = browser.i18n.getMessage(setting.l10nKey);

    // Copy keys has an extended description.
    if (setting.name === 'startCopy') {
      const copyKeyList = document.createElement('ul');
      copyKeyList.classList.add('key-list');

      const copyKeys: Array<{
        key: string;
        l10nKey: string;
      }> = CopyKeys.map(({ key, optionsString }) => ({
        key,
        l10nKey: optionsString,
      }));
      copyKeys.push({
        // We just show the first key here. This matches what we show in the
        // pop-up too.
        key: setting.keys[0],
        l10nKey: CopyNextKeyStrings.optionsString,
      });

      for (const copyKey of copyKeys) {
        const item = document.createElement('li');
        item.classList.add('key');

        const keyLabel = document.createElement('label');
        const keySpan = document.createElement('span');
        keySpan.classList.add('key-box');
        keySpan.append(copyKey.key);
        keyLabel.append(keySpan);
        item.append(keyLabel);
        item.append(browser.i18n.getMessage(copyKey.l10nKey));

        copyKeyList.appendChild(item);
      }

      keyDescription.appendChild(copyKeyList);
    }

    grid.appendChild(keyDescription);
  }
}

function translateKeys() {
  if (!isMac()) {
    return;
  }

  const keyLabels = document.querySelectorAll('.key > label > span');
  for (const label of keyLabels) {
    if (label.textContent === 'Ctrl') {
      label.textContent = '⌘';
    } else if (label.textContent === 'Alt') {
      label.textContent = 'Option';
    }
  }
}

function fillInLanguages() {
  const select = document.querySelector('select#lang') as HTMLSelectElement;

  for (let [id, data] of dbLanguageMeta) {
    let label = data.name;
    if (data.hasWords && !data.hasKanji) {
      label += browser.i18n.getMessage('options_lang_words_only');
    } else if (!data.hasWords && data.hasKanji) {
      label += browser.i18n.getMessage('options_lang_kanji_only');
    }
    const option = document.createElement('option');
    option.value = id;
    option.append(label);
    select.append(option);
  }

  select.addEventListener('change', () => {
    if (!isDbLanguageId(select.value)) {
      const msg = `Got unexpected language code: ${select.value}`;
      if (browserPort) {
        browserPort.postMessage(reportError(msg));
      }
      console.error(msg);
      return;
    }
    config.dictLang = select.value;
  });
}

function createKanjiReferences() {
  const container = document.getElementById(
    'kanji-reference-list'
  ) as HTMLDivElement;

  // Remove any non-static entries
  for (const child of Array.from(container.children)) {
    if (!child.classList.contains('static')) {
      child.remove();
    }
  }

  const referenceNames = getReferenceLabelsForLang(config.dictLang);
  for (const { ref, full } of referenceNames) {
    const rowDiv = document.createElement('div');
    rowDiv.classList.add('browser-style');
    rowDiv.classList.add('checkbox-row');

    const checkbox = document.createElement('input');
    checkbox.setAttribute('type', 'checkbox');
    checkbox.setAttribute('id', `ref-${ref}`);
    checkbox.setAttribute('name', ref);
    checkbox.addEventListener('click', (evt) => {
      config.updateKanjiReferences({
        [ref]: (evt.target as HTMLInputElement).checked,
      });
    });

    rowDiv.append(checkbox);

    const label = document.createElement('label');
    label.setAttribute('for', `ref-${ref}`);
    label.textContent = full;
    rowDiv.append(label);

    container.append(rowDiv);
  }

  // We want to match the arrangement of references when they are displayed,
  // that is, in a vertically flowing grid. See comments where we generate the
  // popup styles for more explanation.
  //
  // We need to add 1 to the number of references, however, to accommodate the
  // "Kanji components" item.
  container.style.gridTemplateRows = `repeat(${Math.ceil(
    (referenceNames.length + 1) / 2
  )}, minmax(min-content, max-content))`;
}

function fillVals() {
  const optform = document.getElementById('optform') as HTMLFormElement;
  optform.showPriority.checked = config.showPriority;
  optform.showRomaji.checked = config.showRomaji;
  optform.showDefinitions.checked = !config.readingOnly;
  optform.accentDisplay.value = config.accentDisplay;
  optform.posDisplay.value = config.posDisplay;
  optform.highlightText.checked = !config.noTextHighlight;
  optform.contextMenuEnable.checked = config.contextMenuEnable;
  optform.showKanjiComponents.checked = config.showKanjiComponents;
  optform.popupStyle.value = config.popupStyle;

  try {
    const toggleCommand = Command.fromString(config.toggleKey);
    const getToggleControl = (part: string): HTMLInputElement =>
      document.getElementById(`toggle-${part}`) as HTMLInputElement;
    getToggleControl('alt').checked = toggleCommand.alt;
    getToggleControl('ctrl').checked = toggleCommand.ctrl;
    getToggleControl('shift').checked = toggleCommand.shift;
    if (getToggleControl('macctrl')) {
      getToggleControl('macctrl').checked = toggleCommand.macCtrl;
    }
    getToggleControl('key').value = toggleCommand.key;
    showToggleCommandSupport(toggleCommand);
  } catch (e) {
    browser.runtime.sendMessage({
      type: 'reportWarning',
      message: `Unable to parse toggleKey: ${config.toggleKey}`,
    });
  }

  // Note that this setting is hidden in active-tab only mode
  const holdKeyParts: Array<string> =
    typeof config.holdToShowKeys === 'string'
      ? config.holdToShowKeys.split('+')
      : [];
  const holdKeyCheckboxes = document.querySelectorAll(
    '.holdtoshowkeys input[type=checkbox][id^=show-]'
  );
  for (const checkbox of holdKeyCheckboxes) {
    (checkbox as HTMLInputElement).checked = holdKeyParts.includes(
      (checkbox as HTMLInputElement).value
    );
  }

  for (const [setting, keys] of Object.entries(config.keys)) {
    const checkboxes = document.querySelectorAll<HTMLInputElement>(
      `input[type=checkbox].key-${setting}`
    );
    for (const checkbox of checkboxes) {
      checkbox.checked =
        !!checkbox.dataset.key && keys.includes(checkbox.dataset.key);
    }
  }

  const langSelect = document.querySelector('select#lang') as HTMLSelectElement;
  const langOptions = langSelect.querySelectorAll('option');
  const dictLang = config.dictLang;
  for (const option of langOptions) {
    option.selected = option.value === dictLang;
  }

  const enabledReferences = new Set(config.kanjiReferences);
  for (const ref of getReferencesForLang(config.dictLang)) {
    const checkbox = document.getElementById(`ref-${ref}`) as HTMLInputElement;
    if (checkbox) {
      checkbox.checked = enabledReferences.has(ref);
    }
  }
}

let browserPort: Browser.Runtime.Port | undefined;

function isDbStateUpdatedMessage(evt: unknown): evt is DbStateUpdatedMessage {
  return (
    typeof evt === 'object' &&
    typeof (evt as any).type === 'string' &&
    (evt as any).type === 'dbstateupdated'
  );
}

function updateFormFromConfig() {
  // If the language changes, the set of references we should show might also
  // change. We need to do this before calling `fillVals` since that will take
  // care of ticking the right boxes.
  createKanjiReferences();
  fillVals();
}

window.onload = async () => {
  await config.ready;
  completeForm();
  fillVals();
  config.addChangeListener(updateFormFromConfig);

  // Listen to changes to the database.
  browserPort = browser.runtime.connect(undefined, { name: 'options' });
  browserPort.onMessage.addListener((evt: unknown) => {
    if (isDbStateUpdatedMessage(evt)) {
      // For Runtime.Port.postMessage Chrome appears to serialize objects using
      // JSON serialization (not structured cloned). As a result, any Date
      // objects will be transformed into strings.
      //
      // Ideally we'd introduce a new type for these deserialized objects that
      // converts `Date` to `Date | string` but that is likely to take a full
      // day of TypeScript wrestling so instead we just manually reach into
      // this object and convert the fields known to possibly contain dates
      // into dates.
      if (typeof evt.state.updateState.lastCheck === 'string') {
        evt.state.updateState.lastCheck = new Date(
          evt.state.updateState.lastCheck
        );
      }
      if (typeof (evt.state.updateState as any).nextRetry === 'string') {
        (evt.state.updateState as any).nextRetry = new Date(
          (evt.state.updateState as any).nextRetry
        );
      }

      updateDatabaseSummary(evt);
    }
  });
};

window.onunload = () => {
  config.removeChangeListener(updateFormFromConfig);
  if (browserPort) {
    browserPort.disconnect();
    browserPort = undefined;
  }
};

function updateDatabaseSummary(evt: DbStateUpdatedMessage) {
  updateDatabaseBlurb(evt);
  updateDatabaseStatus(evt);
}

function updateDatabaseBlurb(evt: DbStateUpdatedMessage) {
  const blurb = document.querySelector('.db-summary-blurb')!;
  empty(blurb);

  const attribution = browser.i18n.getMessage('options_data_source');
  blurb.append(
    linkify(attribution, [
      {
        keyword: 'JMdict/EDICT',
        href: 'https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project',
      },
      {
        keyword: 'KANJIDIC',
        href: 'https://www.edrdg.org/wiki/index.php/KANJIDIC_Project',
      },
      {
        keyword: 'JMnedict/ENAMDICT',
        href: 'https://www.edrdg.org/enamdict/enamdict_doc.html',
      },
    ])
  );

  const license = browser.i18n.getMessage('options_edrdg_license');
  const licenseKeyword = browser.i18n.getMessage(
    'options_edrdg_license_keyword'
  );

  blurb.append(
    linkify(license, [
      {
        keyword: 'Electronic Dictionary Research and Development Group',
        href: 'https://www.edrdg.org/',
      },
      {
        keyword: licenseKeyword,
        href: 'https://www.edrdg.org/edrdg/licence.html',
      },
    ])
  );

  const accentAttribution = browser.i18n.getMessage(
    'options_accent_data_source'
  );
  const accentPara = document.createElement('p');
  accentPara.append(accentAttribution);
  blurb.append(accentPara);
}

function updateDatabaseStatus(evt: DbStateUpdatedMessage) {
  const { updateState } = evt.state;

  const statusElem = document.querySelector('.db-summary-status')!;
  empty(statusElem);
  statusElem.classList.remove('-error');
  statusElem.classList.remove('-warning');

  // Fill out the info part

  switch (updateState.state) {
    case 'idle':
      updateIdleStateSummary(evt, statusElem);
      break;

    case 'checking': {
      const infoDiv = document.createElement('div');
      infoDiv.classList.add('db-summary-info');
      infoDiv.append(browser.i18n.getMessage('options_checking_for_updates'));
      statusElem.append(infoDiv);
      break;
    }

    case 'downloading':
    case 'updatingdb': {
      const infoDiv = document.createElement('div');
      infoDiv.classList.add('db-summary-info');
      const progressElem = document.createElement('progress');
      progressElem.classList.add('progress');
      progressElem.max = 100;
      progressElem.value = updateState.progress * 100;
      progressElem.id = 'update-progress';
      infoDiv.append(progressElem);

      const labelElem = document.createElement('label');
      labelElem.classList.add('label');
      labelElem.htmlFor = 'update-progress';

      const labels: { [series in DataSeries]: string } = {
        kanji: 'options_kanji_data_name',
        radicals: 'options_bushu_data_name',
        names: 'options_name_data_name',
        words: 'options_words_data_name',
      };
      const dbLabel = browser.i18n.getMessage(labels[updateState.series]);

      const { major, minor, patch } = updateState.downloadVersion;
      const versionString = `${major}.${minor}.${patch}`;

      const progressAsPercent = Math.round(updateState.progress * 100);
      const key =
        updateState.state === 'downloading'
          ? 'options_downloading_data'
          : 'options_updating_data';
      labelElem.textContent = browser.i18n.getMessage(key, [
        dbLabel,
        versionString,
        String(progressAsPercent),
      ]);

      infoDiv.append(labelElem);
      statusElem.append(infoDiv);
      break;
    }
  }

  // Add the action button info if any

  const buttonDiv = document.createElement('div');
  buttonDiv.classList.add('db-summary-button');

  switch (updateState.state) {
    case 'idle': {
      // We should probably skip this when we are offline, but for now it
      // doesn't really matter.
      const updateButton = document.createElement('button');
      updateButton.classList.add('browser-style');
      updateButton.setAttribute('type', 'button');
      const isUnavailable = allDataSeries.some(
        (series) => evt.state[series].state === DataSeriesState.Unavailable
      );
      updateButton.textContent = browser.i18n.getMessage(
        updateState.state === 'idle' && !isUnavailable
          ? 'options_update_check_button_label'
          : 'options_update_retry_button_label'
      );
      updateButton.addEventListener('click', triggerDatabaseUpdate);
      buttonDiv.append(updateButton);

      if (updateState.lastCheck) {
        const lastCheckDiv = document.createElement('div');
        lastCheckDiv.classList.add('last-check');
        const lastCheckString = browser.i18n.getMessage(
          'options_last_database_check',
          formatDate(updateState.lastCheck)
        );
        lastCheckDiv.append(lastCheckString);
        buttonDiv.append(lastCheckDiv);
      }
      break;
    }

    case 'checking':
    case 'downloading':
    case 'updatingdb': {
      const cancelButton = document.createElement('button');
      cancelButton.classList.add('browser-style');
      cancelButton.setAttribute('type', 'button');
      cancelButton.textContent = browser.i18n.getMessage(
        'options_cancel_update_button_label'
      );
      cancelButton.addEventListener('click', cancelDatabaseUpdate);
      buttonDiv.append(cancelButton);
      break;
    }
  }

  statusElem.append(buttonDiv);
}

async function updateIdleStateSummary(
  evt: DbStateUpdatedMessage,
  statusElem: Element
) {
  const { updateError } = evt.state;
  const kanjiDbState = evt.state.kanji;

  if (!!updateError && updateError.name === 'OfflineError') {
    const infoDiv = document.createElement('div');
    infoDiv.classList.add('db-summary-info');
    infoDiv.append(browser.i18n.getMessage('options_offline_explanation'));
    statusElem.classList.add('-warning');
    statusElem.append(infoDiv);
    return;
  }

  if (!!updateError && updateError.name !== 'AbortError') {
    const infoDiv = document.createElement('div');
    infoDiv.classList.add('db-summary-info');

    const messageDiv = document.createElement('div');
    let errorMessage: string | undefined;
    if (updateError.name === 'QuotaExceededError') {
      try {
        let { quota } = await navigator.storage.estimate();
        if (typeof quota !== 'undefined') {
          // For Firefox, typically origins get a maximum of 20% of the global
          // limit. When we have unlimitedStorage permission, however, we can
          // use up to the full amount of the global limit. The storage API,
          // however, still returns 20% as the quota, so multiplying by 5 will
          // give the actual quota.
          if (isFirefox()) {
            quota *= 5;
          }
          errorMessage = browser.i18n.getMessage(
            'options_db_update_quota_error',
            formatSize(quota)
          );
        }
      } catch (_e) {
        /* Ignore. This UA likely doesn't support the navigator.storage API */
      }
    }

    if (!errorMessage) {
      errorMessage = browser.i18n.getMessage(
        'options_db_update_error',
        updateError.message
      );
    }
    messageDiv.append(errorMessage);
    infoDiv.append(messageDiv);

    if (updateError.nextRetry) {
      const nextRetryDiv = document.createElement('div');
      const nextRetryString = browser.i18n.getMessage(
        'options_db_update_next_retry',
        formatDate(updateError.nextRetry)
      );
      nextRetryDiv.append(nextRetryString);
      infoDiv.append(nextRetryDiv);
    }

    statusElem.classList.add('-error');
    statusElem.append(infoDiv);

    return;
  }

  if (
    kanjiDbState.state === DataSeriesState.Initializing ||
    kanjiDbState.state === DataSeriesState.Empty
  ) {
    const infoDiv = document.createElement('div');
    infoDiv.classList.add('db-summary-info');
    infoDiv.append(browser.i18n.getMessage('options_no_database'));
    statusElem.append(infoDiv);
    return;
  }

  if (kanjiDbState.state === DataSeriesState.Unavailable) {
    const infoDiv = document.createElement('div');
    infoDiv.classList.add('db-summary-info');
    infoDiv.append(browser.i18n.getMessage('options_database_unavailable'));
    statusElem.classList.add('-error');
    statusElem.append(infoDiv);
    return;
  }

  const gridDiv = document.createElement('div');
  gridDiv.classList.add('db-summary-version-grid');

  for (const series of allMajorDataSeries) {
    const versionInfo = evt.state[series].version;
    if (!versionInfo) {
      continue;
    }

    const { major, minor, patch, lang } = versionInfo;
    const titleDiv = document.createElement('div');
    titleDiv.classList.add('db-source-title');
    const titleKeys: { [series in MajorDataSeries]: string } = {
      kanji: 'options_kanji_data_title',
      names: 'options_name_data_title',
      words: 'options_words_data_title',
    };
    const titleString = browser.i18n.getMessage(
      titleKeys[series],
      `${major}.${minor}.${patch} (${lang})`
    );
    titleDiv.append(titleString);
    gridDiv.append(titleDiv);

    const sourceDiv = document.createElement('div');
    sourceDiv.classList.add('db-source-version');

    const sourceNames: { [series in MajorDataSeries]: string } = {
      kanji: 'KANJIDIC',
      names: 'JMnedict/ENAMDICT',
      words: 'JMdict/EDICT',
    };
    const sourceName = sourceNames[series];

    const { databaseVersion, dateOfCreation } = versionInfo;

    let sourceString;
    if (databaseVersion && databaseVersion !== 'n/a') {
      sourceString = browser.i18n.getMessage(
        'options_data_series_version_and_date',
        [sourceName, databaseVersion, dateOfCreation]
      );
    } else {
      sourceString = browser.i18n.getMessage('options_data_series_date_only', [
        sourceName,
        dateOfCreation,
      ]);
    }
    sourceDiv.append(sourceString);
    gridDiv.append(sourceDiv);
  }

  statusElem.append(gridDiv);
}

function empty(elem: Element) {
  while (elem.firstChild) {
    (elem.firstChild as any).remove();
  }
}

function linkify(
  source: string,
  replacements: Array<{ keyword: string; href: string }>
): DocumentFragment {
  const matchedReplacements: Array<{
    index: number;
    keyword: string;
    href: string;
  }> = [];

  for (const replacement of replacements) {
    const index = source.indexOf(replacement.keyword);
    if (index !== -1) {
      matchedReplacements.push({ index, ...replacement });
    }
  }
  matchedReplacements.sort((a, b) => a.index - b.index);

  const result = new DocumentFragment();
  let position = 0;

  for (const replacement of matchedReplacements) {
    if (position < replacement.index) {
      result.append(source.substring(position, replacement.index));
    }

    const link = document.createElement('a');
    link.href = replacement.href;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = replacement.keyword;
    result.append(link);

    position = replacement.index + replacement.keyword.length;
  }

  if (position < source.length) {
    result.append(source.substring(position, source.length));
  }

  return result;
}

// Our special date formatting that is a simplified ISO 8601 in local time
// without seconds.
function formatDate(date: Date): string {
  const pad = (n: number) => (n < 10 ? '0' + n : n);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatSize(sizeInBytes: number): string {
  const kilobyte = 1024;
  const megabyte = kilobyte * 1024;
  const gigabyte = megabyte * 1024;
  const terabyte = gigabyte * 1024;

  // We don't bother localizing any of this. Anyone able to make sense of a
  // file size, can probably understand an English file size prefix.
  if (sizeInBytes >= terabyte) {
    return (sizeInBytes / terabyte).toFixed(3) + 'Tb';
  }
  if (sizeInBytes >= gigabyte) {
    return (sizeInBytes / gigabyte).toFixed(2) + 'Gb';
  }
  if (sizeInBytes >= megabyte) {
    return (sizeInBytes / megabyte).toFixed(1) + 'Mb';
  }
  if (sizeInBytes >= kilobyte) {
    return Math.round(sizeInBytes / kilobyte) + 'Kb';
  }

  return sizeInBytes + ' bytes';
}

function triggerDatabaseUpdate() {
  if (!browserPort) {
    return;
  }

  browserPort.postMessage(updateDb());
}

function cancelDatabaseUpdate() {
  if (!browserPort) {
    return;
  }

  browserPort.postMessage(cancelDbUpdate());
}
