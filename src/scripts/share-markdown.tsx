import '../styles/markdown.scss';
import '../styles/share.scss';
import '../styles/code.scss';

import { Classes } from '@blueprintjs/core';
import classNames from 'classnames';
import * as MarkdownIt from 'markdown-it';
import MarkdownItAnchor from 'markdown-it-anchor';

import setupMarkdown from './setup-markdown';
import { Mode } from './types';

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
