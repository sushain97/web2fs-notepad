import { Classes } from '@blueprintjs/core';
import classNames from 'classnames';
import type { HLJSApi } from 'highlight.js';
import * as MarkdownIt from 'markdown-it';

let highlightJs: HLJSApi | undefined;

export default (md: typeof MarkdownIt, refreshCallback?: () => void): MarkdownIt => {
  const highlight = (content: string, language: string) => {
    (async () => {
      if (!highlightJs) {
        highlightJs = (await import('highlight.js')).default;
        if (refreshCallback) {
          refreshCallback();
        }
      }
    })().catch((err) => console.warn('Unable to load highlighting library: ', err));

    if (highlightJs) {
      if (highlightJs.getLanguage(language)) {
        return highlightJs.highlight(content, { ignoreIllegals: true, language }).value;
      } else {
        return highlightJs.highlightAuto(content).value;
      }
    }

    return '';
  };

  const markdownIt = md({
    highlight,
    linkify: true,
    typographer: true,
  });

  const defaultLinkRenderer =
    markdownIt.renderer.rules.link_open ??
    ((tokens, idx, options, _, self) => {
      return self.renderToken(tokens, idx, options);
    });
  markdownIt.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const href = token.attrGet('href');

    if (href && !href.startsWith('#')) {
      const attrIndex = token.attrIndex('target');
      const { attrs } = token;
      if (attrIndex < 0 || attrs == null) {
        token.attrPush(['target', '_blank']);
      } else {
        attrs[attrIndex][1] = '_blank';
      }
    }

    return defaultLinkRenderer(tokens, idx, options, env, self);
  };

  markdownIt.renderer.rules.table_open = () => {
    return `<table class="${classNames(
      Classes.HTML_TABLE,
      Classes.HTML_TABLE_BORDERED,
      Classes.SMALL,
    )}">\n`;
  };

  return markdownIt;
};
