import '../styles/share.scss';

import { Classes } from '@blueprintjs/core';
import classNames from 'classnames';
import MarkdownIt from 'markdown-it';

const markdownIt = MarkdownIt({
  linkify: true,
  typographer: true,
});

const { content, mode } = (window as any).CONTEXT;
const app = document.getElementById('app')!;
app.setAttribute('class', Classes.RUNNING_TEXT);
app.setAttribute('style', 'margin: 15px');
app.innerHTML = markdownIt.render(content);
document.body.setAttribute('class', classNames({ [Classes.DARK]: mode === 'dark' }));
