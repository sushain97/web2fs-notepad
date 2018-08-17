import '@blueprintjs/core/lib/css/blueprint.css'; // tslint:disable-line no-submodule-imports
import '@blueprintjs/icons/lib/css/blueprint-icons.css'; // tslint:disable-line no-submodule-imports
import './index.scss';

import { Intent, Position, Spinner, Tag, TextArea, Toaster } from '@blueprintjs/core';
import { IconNames } from '@blueprintjs/icons'; // TODO: make sure tree shaking is working
import { debounce } from 'lodash';
import preact from 'preact';
import * as store from 'store/dist/store.modern'; // tslint:disable-line no-submodule-imports
import wretch from 'wretch';

// TODO: bright/dark mode that gets remembered

const UPDATE_DEBOUNCE_MS = 1000;

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

const AppToaster = Toaster.create({
  position: Position.TOP,
});

class App extends preact.Component<IAppProps, IAppState> {
  private contentRef?: HTMLTextAreaElement;

  private updateNote = debounce(async () => {
    try {
      const { note } = this.state;
      const { id, content } = note;
      this.setState({ updating: true });
      const { version } = await wretch(`/${id}`)
        .formUrl({ text: content })
        .post()
        .json();
      this.setState({ updating: false, currentVersion: version, note: { ...note, version } });
      window.history.pushState(null, '', `/${id}/${version}`);
    } catch (error) {
      // TODO: figure out why this won't work (something with preact?)
      AppToaster.show(
        {
          icon: IconNames.WARNING_SIGN,
          intent: Intent.WARNING,
          message: `Update Failed: ${error}`,
        },
        'update_failed',
      );
      this.setState({ updating: false });
    }
  }, UPDATE_DEBOUNCE_MS);

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
  }

  public componentWillUnmount() {
    document.removeEventListener('selectionchange', this.handleSelectionChange);
  }

  public render(props, { note, currentVersion, updating }: IAppState) {
    const disabled = note.version !== currentVersion;

    // TODO: better UI/UX for disabled
    // TODO: access to old versions via interactive tag?
    return (
      <div>
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
        {
          <Tag
            icon={updating ? <Spinner size={20} /> : IconNames.SAVED}
            minimal={true}
            large={true}
          >
            Version {note.version} of {currentVersion}
          </Tag>
        }
      </div>
    );
  }

  private contentRefHandler = (contentRef?: HTMLTextAreaElement) => {
    this.contentRef = contentRef;

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

// FIXME: this is fighting around some weird type issues with Preact and TypeScript
const MungedApp: any = App;
preact.render(<MungedApp {...(window as any).CONTEXT} />, document.body);
