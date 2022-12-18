import '../styles/code.scss';
import '../styles/share.scss';

import { Classes } from '@blueprintjs/core';
import classNames from 'classnames';
import HighlightJs from 'highlight.js';

import { Mode } from './types';

declare const window: typeof global.window & {
  CONTEXT: { content: string; language: string; mode: string };
};
const { content, language, mode } = window.CONTEXT;

let value;
if (language) {
  ({ value } = HighlightJs.highlight(content, { ignoreIllegals: true, language }));
} else {
  ({ value } = HighlightJs.highlightAuto(content));
}

const app = document.getElementById('app')!;
app.setAttribute('class', Classes.CODE_BLOCK);
document.body.setAttribute(
  'class',
  classNames(Classes.MONOSPACE_TEXT, { [Classes.DARK]: mode === Mode.Dark.toLowerCase() }),
);
document.getElementById('app')!.innerHTML = value;
