import { Classes } from '@blueprintjs/core';
import classNames from 'classnames';
import * as MarkdownIt from 'markdown-it';

export default (md: typeof MarkdownIt): MarkdownIt => {
  const markdownIt = md({
    linkify: true,
    typographer: true,
  });

  const defaultLinkRenderer =
    markdownIt.renderer.rules.link_open ||
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
