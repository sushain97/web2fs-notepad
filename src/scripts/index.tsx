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
  H5,
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
  Pre,
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
import axios, { CancelTokenSource } from 'axios';
import classNames from 'classnames';
import * as HighlightJs from 'highlight.js';
import { fileSize } from 'humanize-plus';
import * as LocalForage from 'localforage';
import { compact, debounce, pick, sortBy, startCase } from 'lodash-es';
import * as MarkdownIt from 'markdown-it';
import * as punycode from 'punycode';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import setupMarkdown from './setup-markdown';

// We want to ensure that versions are somewhat meaningful by debouncing
// updates. However, we don't want to allow lots of unsent input to get
// built up so we only buffer UPDATE_MAX_WAIT_MS of updates.
const UPDATE_DEBOUNCE_MS = 5000;
const UPDATE_MAX_WAIT_MS = 15000;

enum Mode {
  Light = 'Light',
  Dark = 'Dark',
}

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

interface ILanguage extends HighlightJs.IMode {
  name: string;
}

interface IAppState {
  confirmDeleteAlertOpen: boolean;
  content: string;
  currentVersion: number | null;
  format: Format;
  history?: INoteVersionEntry[];
  language?: string;
  mode: Mode;
  monospace: boolean;
  note: INote;
  readOnly: boolean;
  renameDialogOpen: boolean;
  selectLanguageDialogOpen: boolean;
  shareUrl?: string;
  shareUrlSuccessMessage?: string;
  updating: boolean;
  wrap: boolean;
}

const NOTE_SETTINGS_STATE_PROPERTIES: Array<'format' | 'language' | 'monospace' | 'wrap'> = [
  'format',
  'language',
  'monospace',
  'wrap',
];

const NOTE_SETTINGS_TEXTAREA_PROPERTIES: Array<
  'scrollLeft' | 'scrollTop' | 'selectionEnd' | 'selectionStart'
> = ['scrollLeft', 'scrollTop', 'selectionEnd', 'selectionStart'];

interface INoteSettings
  extends Partial<Pick<IAppState, typeof NOTE_SETTINGS_STATE_PROPERTIES[0]>>,
    Partial<Pick<HTMLTextAreaElement, typeof NOTE_SETTINGS_TEXTAREA_PROPERTIES[0]>> {}

interface ISettings {
  mode: Mode | null;
}

interface IPageContext {
  currentVersion: number;
  note: INote;
}

interface IAppProps extends IPageContext {
  noteSettings: INoteSettings | null;
  settings: ISettings;
}

FocusStyleManager.onlyShowFocusOnTabs();

const AppToaster = Toaster.create();
const SettingsStore = LocalForage.createInstance({ name: 'global' });
const NotesSettingStore = LocalForage.createInstance({ name: 'notes' });

class App extends React.Component<IAppProps, IAppState> {
  private cancelTokenSource?: CancelTokenSource;
  private contentRef?: HTMLTextAreaElement | null;
  private HighlightJs?: typeof HighlightJs;
  private languages?: ILanguage[];
  private MarkdownIt?: ReturnType<typeof MarkdownIt>;
  private renameForm: React.RefObject<HTMLFormElement> = React.createRef();
  private renameInput: React.RefObject<HTMLInputElement> = React.createRef();
  private updateFailedToastKey?: string;
  private updateNoteDebounced: ReturnType<typeof debounce>;

  public constructor(props: IAppProps) {
    super(props);

    const { note, currentVersion, noteSettings, settings } = props;

    const format = (noteSettings && noteSettings.format) || Format.PlainText;
    const wrap = noteSettings && noteSettings.wrap != null ? noteSettings.wrap : true;
    const monospace =
      (noteSettings && noteSettings.monospace === true) ||
      (noteSettings && noteSettings.monospace == null && format === Format.Code) ||
      false;

    this.state = {
      confirmDeleteAlertOpen: false,
      content: note.content,
      currentVersion,
      format,
      language: noteSettings == null ? undefined : noteSettings.language,
      mode: (settings && settings.mode) || Mode.Light,
      monospace,
      note,
      readOnly: true,
      renameDialogOpen: false,
      selectLanguageDialogOpen: false,
      updating: false,
      wrap,
    };

    this.updateNoteDebounced = debounce(this.updateNote, UPDATE_DEBOUNCE_MS, {
      maxWait: UPDATE_MAX_WAIT_MS,
    });

    if (format === Format.Markdown) {
      this.loadMarkdownRenderer();
    } else if (format === Format.Code) {
      this.loadCodeRenderer();
    }
  }

  public componentDidMount() {
    document.addEventListener('selectionchange', this.handleSelectionChange);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  public componentDidUpdate(prevProps: IAppProps, prevState: IAppState) {
    if (NOTE_SETTINGS_STATE_PROPERTIES.some(prop => prevState[prop] !== this.state[prop])) {
      this.updateNoteSettings();
    }
  }

  public componentWillUnmount() {
    document.removeEventListener('selectionchange', this.handleSelectionChange);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
  }

  public render() {
    return (
      <div id="container" className={classNames({ [Classes.DARK]: this.state.mode === Mode.Dark })}>
        {this.renderContent(this.state)}
        {this.renderStatusBar(this.state)}
        {this.renderDeleteAlert(this.state)}
        {this.renderCopyShareUrlAlert(this.state)}
        {this.renderRenameDialog(this.state)}
        {this.renderSelectLanguageDialog(this.state)}
      </div>
    );
  }

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
      AppToaster.show({
        icon: IconNames.WARNING_SIGN,
        intent: Intent.WARNING,
        message: `Deleting note failed: ${error}`,
      });
    }
  };

  private formatChangeHandler = (format: Format) => {
    return () => {
      if (format === Format.Code) {
        this.setState({ selectLanguageDialogOpen: true });
      } else {
        this.setState({ format });
      }
    };
  };

  private handelRenameCancel = () => {
    this.setState({ renameDialogOpen: false });
  };

  private handleAutoDetectLanguage = async () => {
    this.setState({
      format: Format.Code,
      selectLanguageDialogOpen: false,
    });

    await this.loadCodeRenderer();

    const { language } = this.HighlightJs!.highlightAuto(this.state.content);
    this.setState({
      language,
      monospace: true,
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
    currentTarget: { value },
  }: React.FormEvent<HTMLTextAreaElement>) => {
    const { currentVersion, updating } = this.state;

    this.setState(
      { content: value },
      currentVersion === null && !updating ? this.updateNote : this.updateNoteDebounced,
    );
  };

  private handleContentKeyDown = (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const { currentTarget, keyCode } = ev;

    if (keyCode === 9) {
      ev.preventDefault();

      const { selectionStart, selectionEnd, value } = currentTarget;
      currentTarget.value = `${value.substring(0, selectionStart)}\t${value.substring(
        selectionEnd,
      )}`;
      currentTarget.selectionEnd = selectionStart + 1;
    }
  };

  private handleContentScroll = ({
    currentTarget: { scrollLeft, scrollTop },
  }: React.UIEvent<HTMLTextAreaElement>) => {
    // This redirection is necessary since React's SyntheticEvent will get re-used
    // and a passed currentTarget reference to debounce will be invalid.
    this.handleContentScrollDebounced({ scrollTop, scrollLeft });
  };

  // tslint:disable-next-line member-ordering
  private handleContentScrollDebounced = debounce(({ scrollLeft, scrollTop }) => {
    this.updateNoteSettings({ scrollLeft, scrollTop });
  }, 100);

  private handleCopyShareLinkInputFocus({ currentTarget }: React.FocusEvent<HTMLInputElement>) {
    currentTarget.scrollLeft = 0;
    currentTarget.select();
  }

  private handleCopyShareUrl = () => {
    try {
      const { shareUrl, shareUrlSuccessMessage } = this.state;
      App.copyTextToClipboard(shareUrl!);
      AppToaster.show({
        icon: IconNames.CLIPBOARD,
        intent: Intent.SUCCESS,
        message: shareUrlSuccessMessage!,
      });
      this.setState({ shareUrl: undefined });
    } catch (error) {
      AppToaster.show({
        icon: IconNames.WARNING_SIGN,
        intent: Intent.WARNING,
        message: `Copying share link failed: ${error}`,
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
    const {
      format,
      note: { content, id, version },
      language,
    } = this.state;

    let extension = FormatExtensions[format];
    if (format === Format.Code && language && this.HighlightJs) {
      extension = [...(this.HighlightJs.getLanguage(language).aliases || []), language].sort(
        (a, b) => a.length - b.length,
      )[0];
    }

    const filename = `${id}_${version}.${extension}`;
    const blob = new Blob([content], { type: 'text/plain' });
    if (window.navigator.msSaveOrOpenBlob) {
      window.navigator.msSaveBlob(blob, filename);
    } else {
      const downloadLink = window.document.createElement('a');
      downloadLink.href = window.URL.createObjectURL(blob);
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  };

  private handleHistoryPopoverOpening = async () => {
    try {
      this.setState({ history: undefined });
      const { data: history } = await axios.get<INoteVersionEntry[]>(
        `/${this.state.note.id}/history`,
      );
      this.setState({ history });
    } catch (error) {
      AppToaster.show({
        icon: IconNames.WARNING_SIGN,
        intent: Intent.WARNING,
        message: `Fetching history failed: ${error}`,
      });
    }
  };

  private handleLanguageSelected = ({ name }: ILanguage) => {
    this.setState({
      format: Format.Code,
      language: name,
      monospace: true,
      selectLanguageDialogOpen: false,
    });
  };

  private handleModeToggle = () => {
    const mode = this.state.mode === Mode.Light ? Mode.Dark : Mode.Light;
    this.setState({ mode });
    SettingsStore.setItem('mode', mode);
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

    if (this.renameForm.current!.checkValidity()) {
      try {
        const newId = this.renameInput.current!.value;
        await axios.post(`/${id}/rename`, `newId=${encodeURIComponent(newId)}`);

        this.setState({
          note: { ...this.state.note, id: newId },
        });
        window.history.pushState(null, '', `/${newId}${version ? `/${version}` : ''}`);
      } catch (error) {
        AppToaster.show({
          icon: IconNames.WARNING_SIGN,
          intent: Intent.WARNING,
          message: `Renaming note failed: ${error}`,
        });
      } finally {
        this.setState({ renameDialogOpen: false });
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
    this.setState({ renameDialogOpen: true });
  };

  private handleSelectionChange = () => {
    if (this.contentRef) {
      this.updateNoteSettings({
        selectionEnd: this.contentRef.selectionEnd,
        selectionStart: this.contentRef.selectionStart,
      });
    }
  };

  private handleSelectLanguageClose = () => {
    this.setState({ selectLanguageDialogOpen: false });
  };

  private handleSelectLanguageDialogOpening = () => {
    this.loadCodeRenderer();
  };

  private handleViewLatestButtonClick = ({ metaKey }: React.MouseEvent<HTMLElement>) => {
    this.showNoteVersion(this.state.currentVersion!, metaKey);
  };

  private handleWrapToggle = () => {
    const { wrap } = this.state;
    this.setState({ wrap: !wrap });
  };

  private historyMenuItemClickHandler = (version: number) => {
    return ({ metaKey }: React.MouseEvent<HTMLElement>) => {
      this.showNoteVersion(version, metaKey);
    };
  };

  private languagePredicate(query: string, { name, aliases }: ILanguage) {
    const lowerQuery = query.toLowerCase();
    return (
      name.toLowerCase().includes(lowerQuery) ||
      (aliases || []).some(alias => alias.toLowerCase().includes(lowerQuery))
    );
  }

  private loadCodeRenderer = async () => {
    if (this.HighlightJs) {
      return;
    }

    try {
      const hljs = await import(/* webpackChunkName: "highlight-js" */ 'highlight.js');
      this.HighlightJs = ((hljs as any).default as typeof HighlightJs | undefined) || hljs;
      this.languages = this.HighlightJs.listLanguages().map(name => ({
        name,
        ...this.HighlightJs!.getLanguage(name),
      }));
      this.forceUpdate();
    } catch (error) {
      AppToaster.show({
        icon: IconNames.WARNING_SIGN,
        intent: Intent.WARNING,
        message: `Fetching code renderer failed: ${error}.`,
      });
    }
  };

  private async loadMarkdownRenderer() {
    if (this.MarkdownIt) {
      return;
    }

    try {
      const md = await import(/* webpackChunkName: "markdown-it" */ 'markdown-it');
      this.MarkdownIt = setupMarkdown(((md as any).default as typeof MarkdownIt | undefined) || md);
      this.forceUpdate();
    } catch (error) {
      AppToaster.show({
        icon: IconNames.WARNING_SIGN,
        intent: Intent.WARNING,
        message: `Fetching markdown renderer failed: ${error}.`,
      });
    }
  }

  private renderContent({
    content,
    format,
    currentVersion,
    language,
    monospace,
    wrap,
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
      let output;

      if (format === Format.Markdown) {
        if (this.MarkdownIt) {
          output = (
            <div
              className={classNames(Classes.RUNNING_TEXT, 'content-output-container', 'markdown')}
              dangerouslySetInnerHTML={{ __html: this.MarkdownIt.render(content) }}
            />
          );
        } else {
          this.loadMarkdownRenderer();

          output = (
            <div className="content-output-container">
              <NonIdealState icon={<Spinner />} title="Loading Markdown Renderer…" />
            </div>
          );
        }
      } else if (format === Format.Code) {
        if (this.HighlightJs) {
          if (language) {
            output = (
              <Pre
                className={classNames(Classes.RUNNING_TEXT, 'content-output-container')}
                dangerouslySetInnerHTML={{
                  __html: this.HighlightJs.highlight(language, content, true).value,
                }}
              />
            );
          } else {
            output = (
              <div className="content-output-container">
                <NonIdealState icon={<Spinner />} title="Detecting Language…" />
              </div>
            );
          }
        } else {
          this.loadCodeRenderer();

          output = (
            <div className="content-output-container">
              <NonIdealState icon={<Spinner />} title="Loading Code Renderer…" />
            </div>
          );
        }
      }

      return (
        <div className="split-content-area">
          <div className="content-input-container">{textArea}</div>
          <Divider />
          {output}
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
        {Object.keys(Format).map(format => {
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
      content = [...Array(currentVersion).keys()].map(i => (
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
    { name }: ILanguage,
    { modifiers: { active }, handleClick }: IItemRendererProps,
  ) {
    return <MenuItem active={active} onClick={handleClick} key={name} text={startCase(name)} />;
  }

  private renderLanguages({ filteredItems, renderItem }: IItemListRendererProps<ILanguage>) {
    return <Menu className="languages">{filteredItems.map(renderItem)}</Menu>;
  }

  private renderLanguagesQueryList({
    itemList,
    handleQueryChange,
    query,
    handleKeyDown,
    handleKeyUp,
  }: IQueryListRendererProps<ILanguage>) {
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

  private renderRenameDialog({ renameDialogOpen, mode }: IAppState) {
    return (
      <Dialog
        isOpen={renameDialogOpen}
        title="Rename Note"
        icon={IconNames.EDIT}
        onClose={this.handelRenameCancel}
        className={classNames({ [Classes.DARK]: mode === Mode.Dark })}
      >
        <div className={Classes.DIALOG_BODY}>
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
        </div>
        <div className={Classes.DIALOG_FOOTER}>
          <div className={Classes.DIALOG_FOOTER_ACTIONS}>
            <Button onClick={this.handelRenameCancel}>Cancel</Button>
            <Button
              title="Rename"
              intent={Intent.PRIMARY}
              icon={IconNames.CONFIRM}
              onClick={this.handleRename}
            >
              Rename
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  private renderSelectLanguageDialog({ selectLanguageDialogOpen, mode }: IAppState) {
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
          {this.HighlightJs ? (
            <QueryList
              renderer={this.renderLanguagesQueryList}
              items={sortBy(this.languages!, 'name')}
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
    updating,
    monospace,
  }: IAppState) {
    const saved = currentVersion !== null;
    const old = saved && version !== currentVersion;
    const updated = saved && currentContent === content;

    return (
      <div className="status-bar">
        <div className="status-bar-history">
          <Tooltip
            content={updating ? 'Saving' : updated ? 'Saved' : 'Save'}
            position={Position.TOP}
          >
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
              {saved ? `Version ${version} of ${currentVersion}` : 'Unsaved'}
            </Tag>
          </Popover>
          {old && (
            <Tooltip content="View latest" position={Position.TOP}>
              <Button icon={IconNames.FAST_FORWARD} onClick={this.handleViewLatestButtonClick} />
            </Tooltip>
          )}
        </div>
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
              <Button rightIcon={IconNames.CARET_UP} icon={IconNames.PRESENTATION}>
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
              <Button icon={IconNames.EDIT} onClick={this.handleRenameButtonClick} />
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

  private renderTextOptionSwitches() {
    const { monospace, wrap } = this.state;

    return (
      <div className="text-option-switches-container">
        <Switch label="Monospace" checked={monospace} onChange={this.handleMonospaceToggle} />
        <Switch label="Wrap Text" checked={wrap} onChange={this.handleWrapToggle} />
      </div>
    );
  }

  private shareHandler = (pinned: boolean) => {
    return async () => {
      const { note, content, format, mode, language, readOnly, currentVersion } = this.state;

      if (note.content !== content || currentVersion === null) {
        await this.updateNote();
      }

      const url = compact([
        `${window.location.protocol}/`,
        punycode.toUnicode(window.location.host),
        'shared',
        ...(readOnly ? [await this.shareNote(pinned)] : [note.id, pinned ? note.version : null]),
        `${format.toLowerCase()}${format === Format.Code && language ? `-${language}` : ''}`,
        mode === Mode.Dark && mode.toLowerCase(),
      ]).join('/');
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
    return (await axios.post<string>(`/share/${id}${pinned ? `/${version}` : ''}`)).data;
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
          this.updateNote();
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
        AppToaster.show({
          icon: IconNames.WARNING_SIGN,
          intent: Intent.WARNING,
          message: `Fetching history failed: ${error}.`,
        });
      }
    }
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
        this.updateFailedToastKey = AppToaster.show(
          {
            icon: IconNames.WARNING_SIGN,
            intent: Intent.WARNING,
            message: `Updating note failed: ${error}.`,
          },
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
      ...(await NotesSettingStore.getItem(id)),
      ...pick(this.state, NOTE_SETTINGS_STATE_PROPERTIES),
      ...settings,
    });
  }

  private static async copyTextToClipboard(text: string) {
    let error = null;

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
      error = err.toString();
    } finally {
      if (textArea) {
        document.body.removeChild(textArea);
      }
    }

    return error;
  }
}

(async () => {
  const context: IPageContext = (window as any).CONTEXT;
  const noteSettings = await NotesSettingStore.getItem<INoteSettings | null>(context.note.id);
  const settings = { mode: (await SettingsStore.getItem<string>('mode')) as Mode };
  ReactDOM.render(
    <App {...{ ...context, settings, noteSettings }} />,
    document.getElementById('app'),
  );
})();
