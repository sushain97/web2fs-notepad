import { Classes } from '@blueprintjs/core';
import classNames from 'classnames';
import MarkdownIt from 'markdown-it';

export default (md: typeof MarkdownIt) => {
  const markdownIt = md({
    linkify: true,
    typographer: true,
  });

  const defaultLinkRenderer =
    markdownIt.renderer.rules.link_open ||
    ((tokens, idx, options, env, self) => {
      return self.renderToken(tokens, idx, options);
    });
  markdownIt.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx].attrGet('href');

    if (href && !href.startsWith('#')) {
      const attrIndex = tokens[idx].attrIndex('target');
      if (attrIndex < 0) {
        tokens[idx].attrPush(['target', '_blank']);
      } else {
        tokens[idx].attrs[attrIndex][1] = '_blank';
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
