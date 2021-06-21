import type { HLJSApi, LanguageDetail } from 'highlight.js';
import * as MarkdownIt from 'markdown-it';

export const enum Mode {
  Light = 'Light',
  Dark = 'Dark',
}

export const enum WorkerMessageType {
  INITIALIZE = 'INITIALIZE',
  RESULT = 'RESULT',
  ERROR = 'ERROR',
  RENDER_CODE = 'RENDER_CODE',
  RENDER_MARKDOWN = 'RENDER_MARKDOWN',
  LIST_CODE_LANGUAGES = 'LIST_CODE_LANGUAGES',
}

export interface ILanguage extends Pick<LanguageDetail, 'aliases'> {
  name: string;
}

interface WorkerInitializeMessage {
  type: WorkerMessageType.INITIALIZE;
  path: string;
}

interface WorkerRenderCodeRequestMessage {
  type: WorkerMessageType.RENDER_CODE;
  content: string;
  language?: string;
}

interface WorkerListLanguagesRequestMessage {
  type: WorkerMessageType.LIST_CODE_LANGUAGES;
}

interface WorkerRenderMarkdownRequestMessage {
  type: WorkerMessageType.RENDER_MARKDOWN;
  content: string;
}

export type WorkerRequestMessage =
  | WorkerRenderCodeRequestMessage
  | WorkerListLanguagesRequestMessage
  | WorkerRenderMarkdownRequestMessage;

interface BaseWorkerResultMessage<T extends WorkerRequestMessage> {
  type: WorkerMessageType.RESULT;
  request_type: T['type'];
  request: T;
  result: WorkerResultForRequest<T>;
}

export type WorkerResultForRequest<T extends WorkerRequestMessage> =
  T extends WorkerRenderCodeRequestMessage
    ? Pick<ReturnType<HLJSApi['highlight']>, 'language' | 'value'>
    : T extends WorkerRenderMarkdownRequestMessage
    ? ReturnType<ReturnType<typeof MarkdownIt>['render']>
    : T extends WorkerListLanguagesRequestMessage
    ? Array<ILanguage>
    : never;

interface WorkerErrorMessage<T extends WorkerRequestMessage | WorkerInitializeMessage> {
  type: WorkerMessageType.ERROR;
  request: T;
  request_type: T['type'];
  error: string;
}

export type WorkerResultMessage =
  | BaseWorkerResultMessage<WorkerRenderCodeRequestMessage>
  | BaseWorkerResultMessage<WorkerListLanguagesRequestMessage>
  | BaseWorkerResultMessage<WorkerRenderMarkdownRequestMessage>;

type WorkerMessage =
  | WorkerInitializeMessage
  | WorkerRequestMessage
  | WorkerResultMessage
  | WorkerErrorMessage<WorkerInitializeMessage | WorkerRequestMessage>;

interface IWorkerMessageEvent extends MessageEvent {
  data: WorkerMessage;
}

type WorkerEventListenerOrEventListenerObject =
  | {
      handleEvent: (ev: IWorkerMessageEvent) => void;
    }
  | ((evt: IWorkerMessageEvent) => void);

export class AppWorker extends Worker {
  HighlightJs?: HLJSApi;
  MarkdownIt?: ReturnType<typeof MarkdownIt>;

  public addEventListener(
    type: 'message',
    listener: WorkerEventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  public postMessage(message: WorkerMessage): void;
}
