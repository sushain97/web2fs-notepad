import '@blueprintjs/core/lib/css/blueprint.css'; // tslint:disable-line no-submodule-imports
import '@blueprintjs/icons/lib/css/blueprint-icons.css'; // tslint:disable-line no-submodule-imports
import 'normalize.css';
import './index.scss';

import {
  Alert,
  Button,
  ButtonGroup,
  Callout,
  Classes,
  Code,
  Dialog,
  FocusStyleManager,
  FormGroup,
  H5,
  Intent,
  Menu,
  MenuItem,
  NonIdealState,
  Popover,
  Position,
  Spinner,
  Tag,
  TextArea,
  Toaster,
  Tooltip,
} from '@blueprintjs/core';
import { IconNames } from '@blueprintjs/icons';
import axios, { CancelTokenSource } from 'axios';
import { fileSize } from 'humanize-plus';
import { debounce } from 'lodash-es';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as store from 'store/dist/store.modern'; // tslint:disable-line no-submodule-imports

// TODO: new format rendering (markdeep, code along with existing plain text) with lazy load(?)
// TODO: refresh props instead of window.location.href replace

// We want to ensure that versions are somewhat meaningful by debouncing
// updates. However, we don't want to allow lots of unsent input to get
// built up so we only buffer UPDATE_MAX_WAIT_MS of updates.
const UPDATE_DEBOUNCE_MS = 2000;
const UPDATE_MAX_WAIT_MS = 10000;

type Mode = 'light' | 'dark';

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

interface IAppProps {
  currentVersion: number;
  note: INote;
}

interface IAppState {
  confirmDeleteAlertOpen: boolean;
  content: string;
  currentVersion: number;
  history?: INoteVersionEntry[];
  mode: Mode;
  note: INote;
  renameDialogOpen: boolean;
  updating: boolean;
}

FocusStyleManager.onlyShowFocusOnTabs();

const AppToaster = Toaster.create();

class App extends React.Component<IAppProps, IAppState> {
  private cancelTokenSource?: CancelTokenSource;
  private contentRef?: HTMLTextAreaElement | null;
  private renameForm: React.RefObject<HTMLFormElement>;
  private renameInput: React.RefObject<HTMLInputElement>;
  private updateFailedToastKey?: string;

  private updateNote = debounce(
    async () => {
      try {
        const { note, content } = this.state;
        const { id } = note;

        if (this.cancelTokenSource) {
          this.cancelTokenSource.cancel();
        }

        this.cancelTokenSource = axios.CancelToken.source();

        this.setState({ updating: true });
        const { data: updatedNote } = await axios.post<INote>(
          `/${id}`,
          `text=${encodeURIComponent(content)}`,
          {
            cancelToken: this.cancelTokenSource.token,
          },
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
              message: `Update Failed: ${error}`,
            },
            this.updateFailedToastKey,
          );
        }

        this.setState({
          updating: false,
        });
      }
    },
    UPDATE_DEBOUNCE_MS,
    { maxWait: UPDATE_MAX_WAIT_MS },
  );

  public constructor(props: IAppProps) {
    super(props);

    const { note, currentVersion } = props;
    this.state = {
      confirmDeleteAlertOpen: false,
      content: note.content,
      currentVersion,
      mode: store.get('mode', 'light'),
      note,
      renameDialogOpen: false,
      updating: false,
    };

    this.renameForm = React.createRef();
    this.renameInput = React.createRef();
  }

  public componentDidMount() {
    document.addEventListener('selectionchange', this.handleSelectionChange);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  public componentWillUnmount() {
    document.removeEventListener('selectionchange', this.handleSelectionChange);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
  }

  public render() {
    return (
      <div id="container" className={this.state.mode === 'dark' ? Classes.DARK : undefined}>
        {this.renderTextArea(this.state)}
        {this.renderStatusBar(this.state)}
        {this.renderDeleteAlert(this.state)}
        {this.renderRenameDialog(this.state)}
      </div>
    );
  }

  private contentRefHandler = (ref: HTMLTextAreaElement | null) => {
    this.contentRef = ref;

    if (this.contentRef) {
      const { selectionStart = null, selectionEnd = null } = store.get(this.props.note.id) || {};

      if (selectionStart != null) {
        this.contentRef.selectionStart = selectionStart;
      }

      if (selectionEnd != null) {
        this.contentRef.selectionEnd = selectionEnd;
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
        message: `Delete Failed: ${error}`,
      });
    }
  };

  private handelRenameCancel = () => {
    this.setState({ renameDialogOpen: false });
  };

  private handleBeforeUnload = (ev: BeforeUnloadEvent) => {
    const { updating, note, content } = this.state;

    if (updating || content !== note.content) {
      const message = 'Are you sure you want to leave this page with unsaved changes?';
      ev.returnValue = message;
      return message;
    }
  };

  private handleContentChange = (event: React.FormEvent<HTMLTextAreaElement>) => {
    const { value: content } = event.currentTarget;
    this.setState({ content }, this.updateNote);
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

  private handleDeleteButtonClick = () => {
    this.setState({ confirmDeleteAlertOpen: true });
  };

  private handleDownloadButtonClick = () => {
    const { content, id, version } = this.state.note;
    const filename = `${id}_${version}.txt`;

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
        message: `Fetching hustory failed: ${error}`,
      });
    }
  };

  private handleModeToggle = () => {
    const mode = this.state.mode === 'light' ? 'dark' : 'light';
    this.setState({ mode });
    store.set('mode', mode);
  };

  private handleNoteDeletionCancel = () => {
    this.setState({ confirmDeleteAlertOpen: false });
  };

  private handleRename = async (ev?: React.FormEvent) => {
    const {
      note: { id },
    } = this.state;
    const form = this.renameForm.current!;

    if (ev) {
      ev.preventDefault();
    }

    if (this.renameForm.current!.checkValidity()) {
      try {
        const newId = this.renameInput.current!.value;
        await axios.post(`/${id}/rename`, `newId=${encodeURIComponent(newId)}`);
        window.location.href = `/${newId}`;
      } catch (error) {
        AppToaster.show({
          icon: IconNames.WARNING_SIGN,
          intent: Intent.WARNING,
          message: `Rename Failed: ${error}`,
        });
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
      store.set(this.props.note.id, {
        selectionEnd: this.contentRef.selectionEnd,
        selectionStart: this.contentRef.selectionStart,
      });
    }
  };

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
      >
        Are you sure you want to delete this note and all associated versions?
      </Alert>
    );
  }

  private renderHistoryMenu() {
    const {
      history,
      note: { id },
    } = this.state;

    return (
      <Menu>
        {history ? (
          history.map(({ modificationTime, size }, i) => (
            <MenuItem
              key={i}
              text={`v${i + 1} - ${new Date(modificationTime * 1000).toLocaleString()}`}
              label={fileSize(size)}
              href={`/${id}/${i + 1}`}
            />
          ))
        ) : (
          <MenuItem text={<NonIdealState icon={<Spinner />} />} />
        )}
      </Menu>
    );
  }

  private renderRenameDialog({ renameDialogOpen }: IAppState) {
    return (
      <Dialog
        isOpen={renameDialogOpen}
        title="Rename Note"
        icon={IconNames.EDIT}
        onClose={this.handelRenameCancel}
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
                className={Classes.INPUT}
                required={true}
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

  private renderStatusBar({
    currentVersion,
    note: { version, modificationTime },
    mode,
    updating,
  }: IAppState) {
    const disabled = version !== currentVersion;

    return (
      <div className="status-bar">
        <Popover
          content={this.renderHistoryMenu()}
          onOpening={this.handleHistoryPopoverOpening}
          position={Position.TOP_LEFT}
        >
          <Tag
            icon={updating ? <Spinner size={20} /> : IconNames.SAVED}
            minimal={true}
            large={true}
            interactive={true}
          >
            Version {version} of {currentVersion}
          </Tag>
        </Popover>
        <div>
          <Callout intent={disabled ? Intent.WARNING : undefined} className="status-bar-callout">
            {disabled && <H5>Editing disabled for old version</H5>}
            Last modified {new Date(modificationTime * 1000).toLocaleString()}
          </Callout>
          <ButtonGroup>
            <Tooltip
              content={mode === 'light' ? 'Dark Mode' : 'Light Mode'}
              position={Position.TOP}
            >
              <Button
                icon={mode === 'light' ? IconNames.MOON : IconNames.FLASH}
                onClick={this.handleModeToggle}
              />
            </Tooltip>
            <Tooltip content="Rename" position={Position.TOP}>
              <Button icon={IconNames.EDIT} onClick={this.handleRenameButtonClick} />
            </Tooltip>
            <Tooltip content="Download" position={Position.TOP}>
              <Button icon={IconNames.DOWNLOAD} onClick={this.handleDownloadButtonClick} />
            </Tooltip>
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

  private renderTextArea({ content, currentVersion, note: { version } }: IAppState) {
    const disabled = version !== currentVersion;

    return (
      <TextArea
        inputRef={this.contentRefHandler}
        intent={Intent.PRIMARY}
        value={content}
        title={disabled ? 'Editing a prior version of a note is not permitted.' : ''}
        onChange={disabled ? undefined : this.handleContentChange}
        onKeyDown={disabled ? undefined : this.handleContentKeyDown}
        fill={true}
        autoFocus={true}
        className="content-input"
        readOnly={disabled}
      />
    );
  }
}

ReactDOM.render(<App {...(window as any).CONTEXT} />, document.getElementById('app'));
