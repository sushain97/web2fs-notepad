import '@blueprintjs/core/lib/css/blueprint.css'; // tslint:disable-line no-submodule-imports
import '@blueprintjs/icons/lib/css/blueprint-icons.css'; // tslint:disable-line no-submodule-imports
import 'normalize.css';
import './index.scss';

import { Intent, Position, Spinner, Tag, TextArea, Toast, Toaster } from '@blueprintjs/core';
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
const UPDATE_DEBOUNCE_MS = 2500;
const UPDATE_MAX_WAIT_MS = 10000;

interface INote {
  content: string;
  id: string;
  version: number;
}

interface IAppProps {
  currentVersion: number;
  note: INote;
}

interface IAppState {
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
        const { note } = this.state;
        const { id, content } = note;

        if (this.cancelTokenSource) {
          this.cancelTokenSource.cancel();
        }

        this.cancelTokenSource = axios.CancelToken.source();

        this.setState({ updating: true });
        const {
          data: { version },
        } = await axios.post<INote>(`/${id}`, `text=${encodeURIComponent(content)}`, {
          cancelToken: this.cancelTokenSource.token,
        });

        this.cancelTokenSource = null;
        this.setState({
          currentVersion: version,
          note: { ...this.state.note, version },
          updating: false,
        });
        window.history.pushState(null, '', `/${id}/${version}`);
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
    const { note, currentVersion, updating } = this.state;
    const disabled = note.version !== currentVersion;

    // TODO: better UI/UX for disabled
    // TODO: access to old versions via interactive tag?
    return (
      <>
        <TextArea
          inputRef={this.contentRefHandler}
          intent={Intent.PRIMARY}
          value={note.content}
          disabled={disabled}
          title={disabled ? 'Editing a prior version of a note is not permitted.' : ''}
          onChange={this.handleContentChange}
          onKeyDown={this.handleContentKeyDown}
          fill={true}
          autoFocus={true}
          className="content-input"
        />
        <div className="status-bar">
          <Tag
            icon={updating ? <Spinner size={20} /> : IconNames.SAVED}
            minimal={true}
            large={true}
          >
            Version {note.version} of {currentVersion}
          </Tag>
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
    if (this.state.updating) {
      const message = 'Are you sure you want to leave this page with unsaved changes?';
      ev.returnValue = message;
      return message;
    }
  };

  private handleContentChange = (event: React.FormEvent<HTMLTextAreaElement>) => {
    const { value: content } = event.currentTarget;
    this.setState({ note: { ...this.state.note, content } }, this.updateNote);
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
