import { pick } from 'lodash-es';

import {
  AppWorker,
  WorkerMessageType,
  WorkerRequestMessage,
  WorkerResultForRequest,
} from './types';
import setupMarkdown from './setup-markdown';

declare let self: AppWorker;

declare global {
  let __webpack_public_path__: string;
}

const getCodeRenderer = async () => {
  if (!self.HighlightJs) {
    self.HighlightJs = (await import('highlight.js')).default;
  }

  return self.HighlightJs;
};

const getMarkdownRenderer = async (refreshCallback: () => void) => {
  if (!self.MarkdownIt) {
    const md = (await import('markdown-it')).default;
    self.MarkdownIt = setupMarkdown(md, refreshCallback);
  }

  return self.MarkdownIt;
};

const respond = <T extends WorkerRequestMessage>(request: T, result: WorkerResultForRequest<T>) => {
  self.postMessage({
    request,
    requestType: request.type,
    result,
    type: WorkerMessageType.RESULT,
  });
};

self.addEventListener('message', async ({ data: request }) => {
  if ('requestType' in request) {
    throw new Error(`Recieved message with requestType: ${JSON.stringify(request)}`);
  }

  try {
    switch (request.type) {
      case WorkerMessageType.INITIALIZE: {
        __webpack_public_path__ = `${request.path}/${__webpack_public_path__}`;
        break;
      }
      case WorkerMessageType.RENDER_CODE: {
        const { language, content } = request;
        const highlightJs = await getCodeRenderer();

        // Exclude properties of the highlight result which cannot be cloned
        // and thus cause a DataCloneError if included.
        const result = pick(
          language
            ? highlightJs.highlight(content, { ignoreIllegals: true, language })
            : highlightJs.highlightAuto(content),
          ['language', 'value'],
        );

        return respond(request, result);
      }
      case WorkerMessageType.RENDER_MARKDOWN: {
        const render = () => {
          const result = markdownIt.render(request.content);
          return respond(request, result);
        };
        const markdownIt = await getMarkdownRenderer(render);
        return render();
      }
      case WorkerMessageType.LIST_CODE_LANGUAGES: {
        const highlightJs = await getCodeRenderer();
        const result = highlightJs.listLanguages().map((name) => ({
          name,
          ...pick(highlightJs.getLanguage(name), 'aliases'),
        }));
        return respond(request, result);
      }
    }
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
      request,
      requestType: request.type,
      type: WorkerMessageType.ERROR,
    });
  }
});

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
export default null as unknown as typeof AppWorker;
