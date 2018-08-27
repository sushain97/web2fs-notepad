import '../styles/markdown.scss';
import '../styles/share.scss';

import { Classes } from '@blueprintjs/core';
import classNames from 'classnames';
import MarkdownIt from 'markdown-it';
import setupMarkdown from './setup-markdown';

const markdownIt = setupMarkdown(MarkdownIt);

const { content, mode } = (window as any).CONTEXT;
const app = document.getElementById('app')!;
app.setAttribute('class', classNames(Classes.RUNNING_TEXT, 'markdown'));
app.setAttribute('style', 'margin: 15px');
app.innerHTML = markdownIt.render(content);
document.body.setAttribute('class', classNames({ [Classes.DARK]: mode === 'dark' }));
