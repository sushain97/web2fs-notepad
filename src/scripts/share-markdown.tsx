import '../styles/markdown.scss';
import '../styles/share.scss';

import { Classes } from '@blueprintjs/core';
import classNames from 'classnames';
import * as MarkdownIt from 'markdown-it';
import MarkdownItAnchor from 'markdown-it-anchor';

import setupMarkdown from './setup-markdown';
import { Mode } from './types';

const markdownIt = setupMarkdown(MarkdownIt);
markdownIt.use(MarkdownItAnchor, { permalink: true });

const { content, mode } = (window as unknown as { CONTEXT: { content: string; mode: string } })
  .CONTEXT;
const app = document.getElementById('app')!;
app.setAttribute('class', classNames(Classes.RUNNING_TEXT, 'markdown'));
app.innerHTML = markdownIt.render(content);
document.body.setAttribute(
  'class',
  classNames({ [Classes.DARK]: mode === Mode.Dark.toLowerCase() }),
);
