import '@blueprintjs/core/lib/css/blueprint.css'; // tslint:disable-line no-submodule-imports
import '@blueprintjs/icons/lib/css/blueprint-icons.css'; // tslint:disable-line no-submodule-imports
import 'normalize.css';
import './index.scss';

import { Callout, H5, Intent, Spinner, Tag, TextArea, Toaster } from '@blueprintjs/core';
import { IconNames } from '@blueprintjs/icons'; // TODO: make sure tree shaking is working
import axios, { CancelTokenSource } from 'axios';
import { debounce } from 'lodash';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as store from 'store/dist/store.modern'; // tslint:disable-line no-submodule-imports

// TODO: bright/dark mode that gets remembered

// We want to ensure that versions are somewhat meaningful by debouncing
// updates. However, we don't want to allow lots of unsent input to get
// built up so we only buffer UPDATE_MAX_WAIT_MS of updates.
const UPDATE_DEBOUNCE_MS = 2000;
const UPDATE_MAX_WAIT_MS = 10000;

interface INote {
  content: string;
  id: string;
  modificationTime: number;
  version: number;
}

interface IAppProps {
  currentVersion: number;
  note: INote;
}

interface IAppState {
  content: string;
  currentVersion: number;
  note: INote;
  updating: boolean;
}

const AppToaster = Toaster.create();

class App extends React.Component<IAppProps, IAppState> {
  private cancelTokenSource?: CancelTokenSource;
  private contentRef?: HTMLTextAreaElement;
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

        this.cancelTokenSource = null;
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
      content: note.content,
      currentVersion,
      note,
      updating: false,
    };
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
    const {
      note: { version, modificationTime },
      currentVersion,
      updating,
      content,
    } = this.state;
    const disabled = version !== currentVersion;

    // TODO: access to old versions via interactive tag?
    return (
      <>
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
        <div className="status-bar">
          <Tag
            icon={updating ? <Spinner size={20} /> : IconNames.SAVED}
            minimal={true}
            large={true}
          >
            Version {version} of {currentVersion}
          </Tag>
          <Callout intent={disabled ? Intent.WARNING : undefined} className="status-bar-callout">
            {disabled && <H5>Editing disabled for old version</H5>}
            Last modified {new Date(modificationTime * 1000).toLocaleString()}
          </Callout>
        </div>
      </>
    );
  }

  private contentRefHandler = (ref?: HTMLTextAreaElement) => {
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

  private handleBeforeUnload = ev => {
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

  private handleSelectionChange = () => {
    if (this.contentRef) {
      store.set(this.props.note.id, {
        selectionEnd: this.contentRef.selectionEnd,
        selectionStart: this.contentRef.selectionStart,
      });
    }
  };
}

ReactDOM.render(<App {...(window as any).CONTEXT} />, document.getElementById('container'));
