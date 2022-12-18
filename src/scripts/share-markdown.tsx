import '../styles/markdown.scss';
import '../styles/share.scss';
import '../styles/code.scss';

import * as MarkdownIt from 'markdown-it';
import { Classes } from '@blueprintjs/core';
import MarkdownItAnchor from 'markdown-it-anchor';
import classNames from 'classnames';

import { Mode } from './types';
import setupMarkdown from './setup-markdown';

declare const window: typeof global.window & {
  CONTEXT: { content: string; mode: string };
};
const { content, mode } = window.CONTEXT;

document.body.setAttribute(
  'class',
  classNames({ [Classes.DARK]: mode === Mode.Dark.toLowerCase() }),
);

const render = () => {
  const markdownIt = setupMarkdown(MarkdownIt, render);
  markdownIt.use(MarkdownItAnchor, { permalink: true });

  const app = document.getElementById('app')!;
  app.setAttribute('class', classNames(Classes.RUNNING_TEXT, 'markdown'));
  app.innerHTML = markdownIt.render(content);
};

render();
