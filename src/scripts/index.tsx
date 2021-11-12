import '../styles/index.scss';

import {
  Alert,
  AnchorButton,
  Button,
  ButtonGroup,
  Callout,
  Classes,
  Code,
  Dialog,
  Divider,
  FocusStyleManager,
  FormGroup,
  HotkeysProvider,
  H5,
  HotkeyConfig,
  HotkeysTarget2,
  Icon,
  InputGroup,
  Intent,
  Menu,
  MenuDivider,
  MenuItem,
  NonIdealState,
  Popover,
  PopoverInteractionKind,
  Position,
  Spinner,
  Switch,
  Tag,
  TextArea,
  Toaster,
  Tooltip,
} from '@blueprintjs/core';
import { IconName, IconNames } from '@blueprintjs/icons';
import {
  IItemListRendererProps,
  IItemRendererProps,
  IQueryListRendererProps,
  QueryList,
} from '@blueprintjs/select';
import axios, { AxiosError, CancelTokenSource } from 'axios';
import classNames from 'classnames';
import download from 'downloadjs';
import { fileSize } from 'humanize-plus';
import * as LocalForage from 'localforage';
import { compact, debounce, pick, sortBy, startCase } from 'lodash-es';
import * as punycode from 'punycode';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import Worker from './worker';

import { AppWorker, ILanguage, IWorkerMessageEvent, Mode, WorkerMessageType } from './types';

// We want to ensure that versions are somewhat meaningful by debouncing
// updates. However, we don't want to allow lots of unsent input to get
// built up so we only buffer UPDATE_MAX_WAIT_MS of updates.
const UPDATE_DEBOUNCE_MS = 5000;
const UPDATE_MAX_WAIT_MS = 15000;
const OUTDATED_CHECK_MS = 60000;

enum Format {
  PlainText = 'PlainText',
  Markdown = 'Markdown',
  Code = 'Code',
}

const FormatExtensions = {
  [Format.PlainText]: 'txt',
  [Format.Markdown]: 'md',
  [Format.Code]: 'code',
};

interface INote {
  content: string;
  id: string;
  modificationTime: number;
  version: number;
}

interface INoteVersionEntry {
  modificationTime: number;
  size: number;
}

interface IAppState {
  confirmDeleteAlertOpen: boolean;
  content: string;
  currentVersion: number | null;
  format: Format;
  history?: INoteVersionEntry[];
  language?: string;
  languages?: ILanguage[];
  mode: Mode;
  monospace: boolean;
  note: INote;
  readOnly: boolean;
  renameAlertOpen: boolean;
  renderedContent?: string;
  selectLanguageDialogOpen: boolean;
  shareUrl?: string;
  shareUrlSuccessMessage?: string;
  updating: boolean;
  wrap: boolean;
}

const NOTE_SETTINGS_STATE_PROPERTIES = ['format', 'language', 'monospace', 'wrap'] as const;

const NOTE_SETTINGS_TEXTAREA_PROPERTIES = [
  'scrollLeft',
  'scrollTop',
  'selectionEnd',
  'selectionStart',
] as const;

interface INoteSettings
  extends Partial<Pick<IAppState, typeof NOTE_SETTINGS_STATE_PROPERTIES[number]>>,
    Partial<Pick<HTMLTextAreaElement, typeof NOTE_SETTINGS_TEXTAREA_PROPERTIES[number]>> {}

interface ISettings {
  mode: Mode | null;
}

interface IPageContext {
  currentVersion: number;
  note: INote;
}

interface IAppProps extends IPageContext {
  // hotkeyCallbacks: IHotkeyCallbacks;
  noteSettings: INoteSettings | null;
  settings: ISettings;
}

FocusStyleManager.onlyShowFocusOnTabs();

const AppToaster = Toaster.create();
const SettingsStore = LocalForage.createInstance({ name: 'global' });
const NotesSettingStore = LocalForage.createInstance({ name: 'notes' });

class App extends React.Component<IAppProps, IAppState> {
  private cancelTokenSource?: CancelTokenSource;
  private checkOutdatedVersionInterval?: number;
  private contentRef?: HTMLTextAreaElement | null;
  private handleContentScrollDebounced = debounce(this.updateNoteSettings.bind(this), 100);
  private hotkeys: HotkeyConfig[];
  private lastOutdatedVersionCheck: number;
  private renameForm: React.RefObject<HTMLFormElement> = React.createRef();
  private renameInput: React.RefObject<HTMLInputElement> = React.createRef();
  private updateFailedToastKey?: string;
  private updateNoteDebounced: ReturnType<typeof debounce>;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  private worker = new Worker() as AppWorker;

  public constructor(props: IAppProps) {
    super(props);

    const { note, currentVersion, noteSettings, settings } = props;

    const format = noteSettings?.format || Format.PlainText;
    const wrap = noteSettings?.wrap ?? true;
    const monospace =
      noteSettings?.monospace === true ||
      (noteSettings?.monospace == null && format === Format.Code) ||
      false;

    this.state = {
      confirmDeleteAlertOpen: false,
      content: note.content,
      currentVersion,
      format,
      language: noteSettings?.language,
      mode: settings?.mode || Mode.Light,
      monospace,
      note,
      readOnly: true,
      renameAlertOpen: false,
      selectLanguageDialogOpen: false,
      updating: false,
      wrap,
    };

    this.updateNoteDebounced = debounce(this.updateNote, UPDATE_DEBOUNCE_MS, {
      maxWait: UPDATE_MAX_WAIT_MS,
    });

    this.hotkeys = (
      [
        ['Save', 'mod+s', this.updateNote],
        ['Toggle Mode', 'mod+d', this.handleModeToggle],
        ['Delete', 'mod+alt+d', this.handleDeleteButtonClick],
        ['Rename', 'mod+alt+r', this.handleRenameButtonClick],
        ['Download', 'mod+alt+j', this.handleDownloadButtonClick],
        ['Share', 'mod+alt+s', this.shareHandler(false)],
        ['Toggle Monospace', 'mod+alt+m', this.handleMonospaceToggle],
        ['Toggle Text Wrap', 'mod+alt+w', this.handleWrapToggle],
      ] as Array<[string, string, () => void]>
    ).map(([label, combo, onKeyDown]) => ({
      label,
      combo,
      onKeyDown,
      global: true,
      allowInInput: true,
      preventDefault: true,
      stopPropagation: true,
    }));

    this.worker.postMessage({
      path: `${window.location.protocol}//${window.location.host}`,
      type: WorkerMessageType.INITIALIZE,
    });
    this.worker.addEventListener('message', this.handleWorkerMessage);
    this.requestWorkerContentRender();

    this.lastOutdatedVersionCheck = Date.now();
  }

  public componentDidMount() {
    document.addEventListener('selectionchange', this.handleSelectionChange);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    window.addEventListener('onfocus', () => void this.checkOutdatedVersion());
    this.checkOutdatedVersionInterval = window.setInterval(
      this.checkOutdatedVersion,
      OUTDATED_CHECK_MS,
    );
  }

  public componentDidUpdate(prevProps: IAppProps, prevState: IAppState) {
    if (NOTE_SETTINGS_STATE_PROPERTIES.some((prop) => prevState[prop] !== this.state[prop])) {
      void this.updateNoteSettings();
    }
    if (
      prevState.content !== this.state.content ||
      prevState.format !== this.state.format ||
      prevState.language !== this.state.language
    ) {
      this.requestWorkerContentRender();
    }
  }

  public componentWillUnmount() {
    document.removeEventListener('selectionchange', this.handleSelectionChange);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    window.removeEventListener('visibilitychange', () => void this.checkOutdatedVersion());
    window.clearInterval(this.checkOutdatedVersionInterval);
    this.updateNoteDebounced.cancel();
  }

  public render() {
    return (
      <HotkeysTarget2 hotkeys={this.hotkeys}>
        <div
          id="container"
          className={classNames({ [Classes.DARK]: this.state.mode === Mode.Dark })}
        >
          {this.renderContent(this.state)}
          {this.renderStatusBar(this.state)}
          {this.renderDeleteAlert(this.state)}
          {this.renderCopyShareUrlAlert(this.state)}
          {this.renderRenameAlert(this.state)}
          {this.renderSelectLanguageDialog(this.state)}
        </div>
      </HotkeysTarget2>
    );
  }

  private checkOutdatedVersion = async () => {
    let { currentVersion } = this.state;
    const { version } = this.state.note;
    const saved = currentVersion !== null;
    const old = saved && version !== currentVersion;

    if (Date.now() - this.lastOutdatedVersionCheck < OUTDATED_CHECK_MS) {
      return;
    }

    try {
      const { data: history } = await axios.get<INoteVersionEntry[]>(
        `/${this.state.note.id}/history`,
      );
      this.lastOutdatedVersionCheck = Date.now();
      currentVersion = history.length ? history.length : null;
      this.setState({ currentVersion });

      if (currentVersion !== null && (currentVersion > version || !saved) && !old) {
        if (document.hidden) {
          const showOutdatedVersionToast = () => {
            this.showOutdatedVersionToast();
            window.removeEventListener('visibilitychange', showOutdatedVersionToast);
          };
          window.addEventListener('visibilitychange', showOutdatedVersionToast);
        } else {
          this.showOutdatedVersionToast();
        }

        await this.showNoteVersion(version, false);
      }
    } catch (error) {
      console.warn('Failed to check for outdated version: ', error); // eslint-disable-line no-console
    }
  };

  private contentRefHandler = async (ref: HTMLTextAreaElement | null) => {
    this.contentRef = ref;

    if (this.contentRef) {
      const settings = (await NotesSettingStore.getItem<INoteSettings>(this.props.note.id)) || {};

      for (const property of NOTE_SETTINGS_TEXTAREA_PROPERTIES) {
        const value = settings[property];
        if (value != null) {
          this.contentRef[property] = value;
        }
      }
    }
  };

  private deleteNote = async () => {
    try {
      await axios.delete(`/${this.state.note.id}`);
      window.location.href = '/';
    } catch (error) {
      this.showAxiosErrorToast('Deleting note failed', error);
    }
  };

  private formatChangeHandler = (format: Format) => {
    return () => {
      if (format === Format.Code) {
        this.setState({ selectLanguageDialogOpen: true });
      } else {
        this.setState({ format, renderedContent: undefined });
      }
    };
  };

  private handelRenameCancel = () => {
    this.setState({ renameAlertOpen: false });
  };

  private handleAutoDetectLanguage = () => {
    this.setState({
      format: Format.Code,
      language: undefined,
      monospace: true,
      renderedContent: undefined,
      selectLanguageDialogOpen: false,
    });
  };

  private handleBeforeUnload = (ev: BeforeUnloadEvent) => {
    const { updating, note, content } = this.state;

    if (updating || content !== note.content) {
      const message = 'Are you sure you want to leave this page with unsaved changes?';
      ev.returnValue = message;
      return message;
    }
  };

  private handleContentChange = ({
    currentTarget: { value: content },
  }: React.FormEvent<HTMLTextAreaElement>) => {
    const { currentVersion, updating } = this.state;

    this.setState({ content }, () => {
      if (currentVersion === null && !updating) {
        void this.updateNote();
      } else {
        this.updateNoteDebounced();
      }
    });
  };

  private handleContentKeyDown = (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const { currentTarget, key, shiftKey } = ev;

    if (key === 'Tab') {
      ev.preventDefault();

      if (!shiftKey) {
        const { selectionStart, selectionEnd, value } = currentTarget;
        currentTarget.value = `${value.substring(0, selectionStart)}\t${value.substring(
          selectionEnd,
        )}`;
        currentTarget.selectionEnd = selectionStart + 1;
      }
    }
  };

  private handleContentScroll = ({
    currentTarget: { scrollLeft, scrollTop },
  }: React.UIEvent<HTMLTextAreaElement>) => {
    // This redirection is necessary since React's SyntheticEvent will get re-used
    // and a passed currentTarget reference to debounce will be invalid.
    void this.handleContentScrollDebounced({ scrollTop, scrollLeft });
  };

  private handleCopyShareLinkInputFocus(
    this: void,
    { currentTarget }: React.FocusEvent<HTMLInputElement>,
  ) {
    currentTarget.scrollLeft = 0;
    currentTarget.select();
  }

  private handleCopyShareUrl = async () => {
    try {
      const { shareUrl, shareUrlSuccessMessage } = this.state;
      await App.copyTextToClipboard(shareUrl!);
      AppToaster.show({
        icon: IconNames.CLIPBOARD,
        intent: Intent.SUCCESS,
        message: shareUrlSuccessMessage,
      });
      this.setState({ shareUrl: undefined });
    } catch (error) {
      AppToaster.show({
        icon: IconNames.WARNING_SIGN,
        intent: Intent.WARNING,
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        message: `Copying share link failed: ${error}.`,
      });
    }
  };

  private handleCopyShareUrlCancel = () => {
    this.setState({ shareUrl: undefined });
  };

  private handleDeleteButtonClick = () => {
    this.setState({ confirmDeleteAlertOpen: true });
  };

  private handleDownloadButtonClick = () => {
    const { format, note, content, language, languages } = this.state;

    // We pick the shortest alias/name as a poor man's extension heuristic.
    let extension = FormatExtensions[format];
    if (format === Format.Code && language && languages) {
      extension = [
        ...(languages.find(({ name }) => name === language)!.aliases || []),
        language,
      ].sort((a, b) => a.length - b.length)[0];
    }

    const filename = `${note.id}_${note.version}.${extension}`;
    const type = format === Format.Markdown ? 'text/markdown' : 'text/plain';
    download(content, filename, type);
  };

  private handleHistoryPopoverOpening = async () => {
    try {
      this.setState({ history: undefined });
      const { data: history } = await axios.get<INoteVersionEntry[]>(
        `/${this.state.note.id}/history`,
      );
      this.setState({ history });
    } catch (error) {
      this.showAxiosErrorToast('Fetching history failed', error);
    }
  };

  private handleLanguageSelected = ({ name }: ILanguage) => {
    this.setState({
      format: Format.Code,
      language: name,
      monospace: true,
      renderedContent: undefined,
      selectLanguageDialogOpen: false,
    });
  };

  private handleModeToggle = async () => {
    const mode = this.state.mode === Mode.Light ? Mode.Dark : Mode.Light;
    this.setState({ mode });
    await SettingsStore.setItem('mode', mode);
  };

  private handleMonospaceToggle = () => {
    const { monospace } = this.state;
    this.setState({ monospace: !monospace });
  };

  private handleNoteDeletionCancel = () => {
    this.setState({ confirmDeleteAlertOpen: false });
  };

  private handleReadOnlyShareToggle = () => {
    this.setState({ readOnly: !this.state.readOnly });
  };

  private handleRename = async (ev?: React.FormEvent) => {
    const { id, version } = this.state.note;
    const form = this.renameForm.current!;

    if (ev) {
      ev.preventDefault();
    }

    if (form.checkValidity()) {
      this.setState({ renameAlertOpen: false });

      const newId = this.renameInput.current!.value;
      try {
        await axios.post(`/${id}/rename`, `newId=${encodeURIComponent(newId)}`);

        this.setState({
          note: { ...this.state.note, id: newId },
        });
        window.history.pushState(null, '', `/${newId}${version ? `/${version}` : ''}`);
        AppToaster.show({
          icon: IconNames.ANNOTATION,
          intent: Intent.SUCCESS,
          message: `Renamed note to ${newId}.`,
        });
      } catch (error) {
        this.showAxiosErrorToast('Renaming note failed', error);
      }
    } else {
      // We use this minor hack to trigger the native form validation UI
      const temporarySubmitButton = document.createElement('button');
      form.appendChild(temporarySubmitButton);
      temporarySubmitButton.click();
      form.removeChild(temporarySubmitButton);
    }

    return false;
  };

  private handleRenameButtonClick = () => {
    this.setState({ renameAlertOpen: true });
  };

  private handleSelectLanguageClose = () => {
    this.setState({ selectLanguageDialogOpen: false });
  };

  private handleSelectLanguageDialogOpening = () => {
    this.worker.postMessage({ type: WorkerMessageType.LIST_CODE_LANGUAGES });
  };

  private handleSelectionChange = () => {
    if (this.contentRef) {
      void this.updateNoteSettings({
        selectionEnd: this.contentRef.selectionEnd,
        selectionStart: this.contentRef.selectionStart,
      });
    }
  };

  private handleViewLatestButtonClick = async ({ metaKey }: React.MouseEvent<HTMLElement>) => {
    await this.showNoteVersion(this.state.currentVersion!, metaKey);
  };

  private handleWorkerMessage = ({ data: response }: IWorkerMessageEvent) => {
    if (!('request_type' in response)) {
      throw new Error(`Recieved message without request_type: ${JSON.stringify(response)}`);
    }

    if (response.type === WorkerMessageType.ERROR) {
      AppToaster.show({
        icon: IconNames.WARNING_SIGN,
        intent: Intent.WARNING,
        message: (
          <>
            <strong>Failed to {startCase(response.request_type.toLowerCase())}</strong>:{' '}
            {response.error}.
          </>
        ),
      });
    } else {
      switch (response.request_type) {
        case WorkerMessageType.RENDER_CODE:
          this.setState({
            language: response.result.language,
            renderedContent: response.result.value,
          });
          break;
        case WorkerMessageType.RENDER_MARKDOWN:
          this.setState({ renderedContent: response.result });
          break;
        case WorkerMessageType.LIST_CODE_LANGUAGES:
          this.setState({ languages: response.result });
          break;
        default: {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const _: never = response;
        }
      }
    }
  };

  private handleWrapToggle = () => {
    const { wrap } = this.state;
    this.setState({ wrap: !wrap });
  };

  private historyMenuItemClickHandler = (version: number) => {
    return ({ metaKey }: React.MouseEvent<HTMLElement>) => {
      void this.showNoteVersion(version, metaKey);
    };
  };

  private languagePredicate(this: void, query: string, { name, aliases }: ILanguage) {
    const lowerQuery = query.toLowerCase();
    return (
      name.toLowerCase().includes(lowerQuery) ||
      (aliases || []).some((alias) => alias.toLowerCase().includes(lowerQuery))
    );
  }

  private renderContent({
    content,
    format,
    currentVersion,
    monospace,
    wrap,
    renderedContent,
    note: { version },
  }: IAppState) {
    const disabled = currentVersion !== null && version !== currentVersion;

    const textArea = (
      <TextArea
        inputRef={this.contentRefHandler}
        onScroll={this.handleContentScroll}
        value={content}
        title={disabled ? 'Editing a prior version of a note is not permitted.' : ''}
        onChange={disabled ? undefined : this.handleContentChange}
        onKeyDown={disabled ? undefined : this.handleContentKeyDown}
        fill={true}
        wrap={wrap ? 'soft' : 'off'}
        autoFocus={true}
        className={classNames('content-input', {
          [Classes.MONOSPACE_TEXT]: monospace,
        })}
        readOnly={disabled}
      />
    );

    if (format === Format.Markdown || format === Format.Code) {
      return (
        <div className="split-content-area">
          <div className="content-input-container">{textArea}</div>
          <Divider />
          {renderedContent == null ? (
            <div className={classNames('content-output-container')}>
              <NonIdealState title={`Rendering ${startCase(format)}...`} icon={<Spinner />} />
            </div>
          ) : (
            <div
              className={classNames(
                Classes.RUNNING_TEXT,
                format === Format.Code && Classes.CODE_BLOCK,
                'content-output-container',
                format.toLowerCase(),
              )}
              dangerouslySetInnerHTML={{ __html: renderedContent }}
            />
          )}
        </div>
      );
    } else {
      return textArea;
    }
  }

  private renderCopyShareUrlAlert({ shareUrl, mode }: IAppState) {
    return (
      <Alert
        cancelButtonText="Cancel"
        onConfirm={this.handleCopyShareUrl}
        isOpen={shareUrl != null}
        icon={IconNames.SHARE}
        className={classNames('copy-share-link-alert', { [Classes.DARK]: mode === Mode.Dark })}
        canEscapeKeyCancel={true}
        canOutsideClickCancel={true}
        onCancel={this.handleCopyShareUrlCancel}
        intent={Intent.PRIMARY}
        confirmButtonText="Copy Share Link"
      >
        <InputGroup
          value={shareUrl}
          readOnly={true}
          leftIcon={IconNames.CLIPBOARD}
          className={Classes.FILL}
          autoFocus={true}
          onFocus={this.handleCopyShareLinkInputFocus}
        />
      </Alert>
    );
  }

  private renderDeleteAlert({ confirmDeleteAlertOpen }: IAppState) {
    return (
      <Alert
        isOpen={confirmDeleteAlertOpen}
        intent={Intent.DANGER}
        confirmButtonText="Delete"
        cancelButtonText="Cancel"
        icon={IconNames.TRASH}
        onCancel={this.handleNoteDeletionCancel}
        onConfirm={this.deleteNote}
        canEscapeKeyCancel={true}
        canOutsideClickCancel={true}
      >
        Are you sure you want to delete this note and all associated versions?
      </Alert>
    );
  }

  private renderFormatMenu = () => {
    return (
      <Menu>
        {Object.keys(Format).map((format) => {
          const icon = {
            [Format.PlainText]: IconNames.DOCUMENT,
            [Format.Markdown]: IconNames.STYLE,
            [Format.Code]: IconNames.CODE,
          }[format as Format] as IconName;

          return (
            <MenuItem
              icon={icon}
              text={startCase(format)}
              key={format}
              active={this.state.format === Format[format as keyof typeof Format]}
              onClick={this.formatChangeHandler(format as Format)}
            />
          );
        })}
      </Menu>
    );
  };

  private renderHistoryMenu() {
    const {
      history,
      currentVersion,
      note: { version },
    } = this.state;

    let content;
    if (history == null) {
      content = [...Array(currentVersion).keys()].map((i) => (
        <MenuItem
          key={i}
          className={Classes.SKELETON}
          disabled={true}
          text={`v${i} - ${new Date().toLocaleString()}`}
          label="0 bytes"
        />
      ));
    } else {
      content = history.map(({ modificationTime, size }, i) => (
        <MenuItem
          key={i}
          active={i + 1 === version}
          text={`v${i + 1} - ${new Date(modificationTime * 1000).toLocaleString()}`}
          label={fileSize(size)}
          onClick={this.historyMenuItemClickHandler(i + 1)}
        />
      ));
    }

    return <Menu className="version-history-menu">{content}</Menu>;
  }

  private renderLanguage(
    this: void,
    { name }: ILanguage,
    { modifiers: { active }, handleClick }: IItemRendererProps,
  ) {
    return <MenuItem active={active} onClick={handleClick} key={name} text={startCase(name)} />;
  }

  private renderLanguages(
    this: void,
    { filteredItems, renderItem }: IItemListRendererProps<ILanguage>,
  ) {
    return <Menu className="languages">{filteredItems.map(renderItem)}</Menu>;
  }

  private renderLanguagesQueryList(
    this: void,
    {
      itemList,
      handleQueryChange,
      query,
      handleKeyDown,
      handleKeyUp,
    }: IQueryListRendererProps<ILanguage>,
  ) {
    return (
      <div onKeyDown={handleKeyDown} onKeyUp={handleKeyUp}>
        <InputGroup
          leftIcon={IconNames.SEARCH}
          type="search"
          placeholder="Search languages"
          className={classNames(Classes.FILL, 'search-languages-input')}
          onChange={handleQueryChange}
          value={query}
          round={true}
          autoFocus={true}
        />
        {itemList}
      </div>
    );
  }

  private renderRenameAlert({ renameAlertOpen, mode }: IAppState) {
    return (
      <Alert
        isOpen={renameAlertOpen}
        icon={IconNames.ANNOTATION}
        intent={Intent.PRIMARY}
        cancelButtonText="Cancel"
        confirmButtonText="Rename"
        onCancel={this.handelRenameCancel}
        onConfirm={this.handleRename}
        canEscapeKeyCancel={true}
        canOutsideClickCancel={true}
        className={classNames({ [Classes.DARK]: mode === Mode.Dark })}
      >
        <form ref={this.renameForm} onSubmit={this.handleRename}>
          <FormGroup
            inline={true}
            helperText={
              <>
                Must be unique and match the pattern <Code>[A-z0-9_-]+</Code>
              </>
            }
          >
            <input
              className={classNames(Classes.INPUT, Classes.FILL)}
              required={true}
              autoFocus={true}
              pattern="[A-z0-9_-]+"
              placeholder="Enter new name"
              ref={this.renameInput}
            />
          </FormGroup>
        </form>
      </Alert>
    );
  }

  private renderSelectLanguageDialog({ selectLanguageDialogOpen, mode, languages }: IAppState) {
    return (
      <Dialog
        isOpen={selectLanguageDialogOpen}
        title="Select Language"
        icon={IconNames.CODE}
        onClose={this.handleSelectLanguageClose}
        onOpening={this.handleSelectLanguageDialogOpening}
        className={classNames('select-language-dialog', { [Classes.DARK]: mode === Mode.Dark })}
      >
        <div className={Classes.DIALOG_BODY}>
          {languages ? (
            <QueryList
              renderer={this.renderLanguagesQueryList}
              items={sortBy(languages, 'name')}
              itemRenderer={this.renderLanguage}
              onItemSelect={this.handleLanguageSelected}
              itemPredicate={this.languagePredicate}
              itemListRenderer={this.renderLanguages}
            />
          ) : (
            <NonIdealState icon={<Spinner />} title={'Loading Languages…'} />
          )}
        </div>
        <div className={Classes.DIALOG_FOOTER}>
          <div className={Classes.DIALOG_FOOTER_ACTIONS}>
            <Button onClick={this.handleSelectLanguageClose}>Cancel</Button>
            <Button onClick={this.handleAutoDetectLanguage} intent={Intent.PRIMARY}>
              Auto Detect
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  private renderShareMenu() {
    const {
      readOnly,
      note: { version },
      currentVersion,
    } = this.state;

    return (
      <Menu>
        <MenuDivider
          title={
            <div className="share-menu-header">
              Share
              <Divider />
              <Switch
                className="share-menu-switch"
                label="Read-only"
                checked={readOnly}
                onChange={this.handleReadOnlyShareToggle}
                inline={true}
              />
            </div>
          }
        />
        <MenuItem
          text="Latest"
          label={currentVersion === version ? '(default)' : undefined}
          onClick={this.shareHandler(false)}
          icon={IconNames.AUTOMATIC_UPDATES}
        />
        <MenuItem
          text="Current"
          label={`v${version}`}
          onClick={this.shareHandler(true)}
          icon={IconNames.HISTORY}
        />
      </Menu>
    );
  }

  private renderStatusBar({
    currentVersion,
    note: { version, modificationTime, content },
    content: currentContent,
    mode,
    format,
    language,
  }: IAppState) {
    const mobile = window.innerWidth <= 480;
    const saved = currentVersion !== null;
    const old = saved && version !== currentVersion;
    const updated = saved && currentContent === content;

    return (
      <div className="status-bar">
        {this.renderStatusBarHistory(this.state, { updated, old, saved, mobile })}
        <div>
          <Callout
            intent={old ? Intent.WARNING : undefined}
            icon={old ? <Icon icon={IconNames.WARNING_SIGN} /> : null} // manually inserted in order to control sizing
            className="status-bar-callout"
          >
            {old && <H5>Editing disabled for old version</H5>}
            Last modified {new Date(modificationTime * 1000).toLocaleString()}
          </Callout>
          <ButtonGroup>
            <Popover position={Position.TOP} content={this.renderFormatMenu()}>
              <Button
                rightIcon={mobile ? undefined : IconNames.CARET_UP}
                icon={IconNames.PRESENTATION}
              >
                {!mobile && (
                  <>
                    {startCase(format)}
                    {format === Format.Code ? (
                      <>
                        {' ('}
                        {language ? (
                          startCase(language)
                        ) : (
                          <span className={Classes.SKELETON}>...</span>
                        )}
                        {')'}
                      </>
                    ) : (
                      ''
                    )}
                  </>
                )}
              </Button>
            </Popover>
            <Tooltip
              content={mode === Mode.Light ? 'Dark Mode' : 'Light Mode'}
              position={Position.TOP}
            >
              <Button
                icon={mode === Mode.Light ? IconNames.MOON : IconNames.FLASH}
                onClick={this.handleModeToggle}
              />
            </Tooltip>
            <Popover
              content={this.renderTextOptionSwitches()}
              interactionKind={PopoverInteractionKind.HOVER}
              position={Position.TOP}
              hoverCloseDelay={200}
            >
              <Button icon={IconNames.FONT} />
            </Popover>
            <Tooltip content="Rename" position={Position.TOP}>
              <Button icon={IconNames.ANNOTATION} onClick={this.handleRenameButtonClick} />
            </Tooltip>
            <Tooltip content="Download" position={Position.TOP}>
              <Button icon={IconNames.DOWNLOAD} onClick={this.handleDownloadButtonClick} />
            </Tooltip>
            <Popover
              content={this.renderShareMenu()}
              interactionKind={PopoverInteractionKind.HOVER}
              position={Position.TOP}
              hoverCloseDelay={200}
            >
              <Button
                icon={IconNames.LINK}
                onClick={this.shareHandler(currentVersion !== version)}
              />
            </Popover>
            <Tooltip content="Delete" position={Position.TOP}>
              <Button
                icon={IconNames.TRASH}
                onClick={this.handleDeleteButtonClick}
                intent={Intent.DANGER}
              />
            </Tooltip>
          </ButtonGroup>
        </div>
      </div>
    );
  }

  private renderStatusBarHistory(
    { updating, currentVersion, note: { version } }: IAppState,
    {
      updated,
      old,
      saved,
      mobile,
    }: { mobile: boolean; old: boolean; saved: boolean; updated: boolean },
  ) {
    const versionString = saved
      ? mobile
        ? `v${version}`
        : `Version ${version} of ${currentVersion!}`
      : 'Unsaved';
    return (
      <div className="status-bar-history">
        <Tooltip content={updating ? 'Saving' : updated ? 'Saved' : 'Save'} position={Position.TOP}>
          <AnchorButton // Button swallows hover events when disabled, breaking the tooltip
            icon={IconNames.FLOPPY_DISK}
            loading={updating}
            onClick={this.updateNote}
            disabled={updated || old}
          />
        </Tooltip>
        <Popover
          content={saved ? this.renderHistoryMenu() : undefined}
          onOpening={this.handleHistoryPopoverOpening}
          position={Position.TOP_LEFT}
        >
          <Tag
            icon={updated ? IconNames.SAVED : IconNames.OUTDATED}
            minimal={true}
            large={true}
            interactive={saved}
            className="version-tag"
          >
            {versionString}
          </Tag>
        </Popover>
        {old && (
          <Tooltip content="View latest" position={Position.TOP}>
            <Button icon={IconNames.FAST_FORWARD} onClick={this.handleViewLatestButtonClick} />
          </Tooltip>
        )}
      </div>
    );
  }

  private renderTextOptionSwitches() {
    const { monospace, wrap } = this.state;

    return (
      <div className="text-option-switches-container">
        <Switch label="Monospace" checked={monospace} onChange={this.handleMonospaceToggle} />
        <Switch label="Wrap Text" checked={wrap} onChange={this.handleWrapToggle} />
      </div>
    );
  }

  private requestWorkerContentRender = () => {
    const { format, content, language } = this.state;

    if (format === Format.Code) {
      this.worker.postMessage({
        content,
        language,
        type: WorkerMessageType.RENDER_CODE,
      });
    } else if (format === Format.Markdown) {
      this.worker.postMessage({
        content,
        type: WorkerMessageType.RENDER_MARKDOWN,
      });
    }
  };

  private shareHandler = (pinned: boolean) => {
    return async () => {
      const { note, content, format, mode, language, readOnly, currentVersion } = this.state;

      if (note.content !== content || currentVersion === null) {
        await this.updateNote();
      }

      let url;
      try {
        url = compact([
          `${window.location.protocol}/`,
          punycode.toUnicode(window.location.host),
          'shared',
          ...(readOnly ? [await this.shareNote(pinned)] : [note.id, pinned ? note.version : null]),
          `${format.toLowerCase()}${format === Format.Code && language ? `-${language}` : ''}`,
          mode === Mode.Dark && mode.toLowerCase(),
        ]).join('/');
      } catch {
        return;
      }

      const message = compact([
        'Copied',
        pinned && 'pinned',
        readOnly && 'read-only',
        'share link to clipboard.',
      ]).join(' ');

      const error = await App.copyTextToClipboard(url);
      if (error) {
        this.setState({ shareUrl: url, shareUrlSuccessMessage: message });
      } else {
        AppToaster.show({
          icon: IconNames.CLIPBOARD,
          intent: Intent.SUCCESS,
          message,
        });
      }
    };
  };

  private async shareNote(pinned: boolean) {
    const {
      note: { id, version },
    } = this.state;

    try {
      return (await axios.post<string>(`/share/${id}${pinned ? `/${version}` : ''}`)).data;
    } catch (error) {
      this.showAxiosErrorToast('Failed to share note', error);
      throw error;
    }
  }

  private showAxiosErrorToast(message: string, error: AxiosError | unknown, key?: string) {
    let details;
    if (axios.isAxiosError(error)) {
      details = (error.response?.data as { message: string }).message || error.toString();
    } else {
      console.warn('Encountered unknown error', error);
    }

    return AppToaster.show(
      {
        icon: IconNames.WARNING_SIGN,
        intent: Intent.WARNING,
        message: (
          <>
            <strong>{message}</strong>: {details}.
          </>
        ),
      },
      key,
    );
  }

  private async showNoteVersion(version: number, newWindow: boolean) {
    const {
      content: currentContent,
      note: { id, content },
    } = this.state;

    if (newWindow) {
      window.open(`/${this.state.note.id}/${version}`);
    } else {
      try {
        if (currentContent !== content) {
          void this.updateNote();
        }

        const {
          data: { note },
        } = await axios.get<{ note: INote }>(`/${id}/${version}`);
        this.setState({
          content: note.content,
          note,
        });
        window.history.pushState(null, '', `/${id}/${version}`);
      } catch (error) {
        this.showAxiosErrorToast('Fetching history failed', error);
      }
    }
  }

  private showOutdatedVersionToast() {
    AppToaster.show({
      action: {
        icon: IconNames.FAST_FORWARD,
        onClick: this.handleViewLatestButtonClick,
        text: 'View latest',
      },
      icon: IconNames.WARNING_SIGN,
      intent: Intent.WARNING,
      message: `Current version is now outdated.`,
    });
  }

  private updateNote = async () => {
    const {
      note: { id, content },
      content: currentContent,
      currentVersion,
    } = this.state;

    this.updateNoteDebounced.cancel();
    if (this.cancelTokenSource) {
      this.cancelTokenSource.cancel();
    }

    if (currentContent === content && currentVersion !== null) {
      return;
    }

    try {
      this.cancelTokenSource = axios.CancelToken.source();

      this.setState({ updating: true });
      const { data: updatedNote } = await axios.post<INote>(
        `/${id}`,
        `text=${encodeURIComponent(currentContent)}`,
        { cancelToken: this.cancelTokenSource.token },
      );

      delete this.cancelTokenSource;
      this.setState({
        currentVersion: updatedNote.version,
        note: updatedNote,
        updating: false,
      });
      window.history.pushState(null, '', `/${id}/${updatedNote.version}`);
    } catch (error) {
      if (!axios.isCancel(error)) {
        this.updateFailedToastKey = this.showAxiosErrorToast(
          'Updating note failed',
          error,
          this.updateFailedToastKey,
        );
      }

      this.setState({
        updating: false,
      });
    }
  };

  private async updateNoteSettings(settings?: Partial<INoteSettings>) {
    const { id } = this.state.note;
    await NotesSettingStore.setItem(id, {
      ...((await NotesSettingStore.getItem(id)) as Partial<INoteSettings>),
      ...pick(this.state, NOTE_SETTINGS_STATE_PROPERTIES),
      ...settings,
    });
  }

  private static async copyTextToClipboard(text: string) {
    let error: string | null = null;

    let textArea;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        if (!document.execCommand('copy')) {
          error = 'Unknown failure';
        }
      }
    } catch (err) {
      error = (err as Error).toString();
    } finally {
      if (textArea) {
        document.body.removeChild(textArea);
      }
    }

    return error;
  }
}

void (async () => {
  const context = (window as unknown as { CONTEXT: IPageContext }).CONTEXT;
  const noteSettings = await NotesSettingStore.getItem<INoteSettings | null>(context.note.id);
  const settings = { mode: (await SettingsStore.getItem<string>('mode')) as Mode };

  ReactDOM.render(
    <HotkeysProvider>
      <App {...{ ...context, settings, noteSettings }} />
    </HotkeysProvider>,
    document.getElementById('app'),
  );
})();
