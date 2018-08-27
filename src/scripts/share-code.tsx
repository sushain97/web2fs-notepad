import '../styles/code.scss';
import '../styles/share.scss';

import { Classes } from '@blueprintjs/core';
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
document.body.setAttribute('class', mode === 'dark' ? Classes.DARK : '');
document.getElementById('app')!.innerHTML = value;
