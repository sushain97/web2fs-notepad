import '../styles/code.scss';
import '../styles/share.scss';

import { Classes } from '@blueprintjs/core';
import classNames from 'classnames';
import HighlightJs from 'highlight.js';

const { content, language, mode } = (window as any).CONTEXT;

let value;
if (language) {
  ({ value } = HighlightJs.highlight(language, content, true));
} else {
  ({ value } = HighlightJs.highlightAuto(content));
}

const app = document.getElementById('app')!;
app.setAttribute('style', 'white-space: pre');
app.setAttribute('class', Classes.CODE_BLOCK);
document.body.setAttribute(
  'class',
  classNames(Classes.MONOSPACE_TEXT, { [Classes.DARK]: mode === 'dark' }),
);
document.getElementById('app')!.innerHTML = value;
