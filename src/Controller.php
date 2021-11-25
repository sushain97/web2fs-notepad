<?php

namespace App;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\GetResponseForExceptionEvent;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\KernelInterface;
use Symfony\Component\Routing\Annotation\Route;

class Controller extends AbstractController
{
    private static function extractFormatLanguageAndShareBundle(string $format): array
    {
        $language = null;
        if ($format === 'markdown') {
            $bundle = 'share-markdown';
        } elseif (strpos($format, 'code') === 0) {
            $bundle = 'share-code';
            $maybeLanguage = explode('-', $format);
            $language = count($maybeLanguage) > 1 ? $maybeLanguage[1] : null;
        } else {
            $bundle = 'share-plaintext';
        }

        return [$language, $bundle];
    }

    private $kernel;

    public function __construct(KernelInterface $kernel)
    {
        $this->kernel = $kernel;
    }

    public function newNote(NoteStore $store): Response
    {
        $id = $store->generateNewId();
        return $this->redirectToRoute('showNote', ['id' => $id]);
    }

    public function showNote(string $id, ?int $version, NoteStore $store): Response
    {
        $this->ensureNoteIdNotReserved($store, $id);
        $hasNote = $store->hasNote($id);
        if ($version !== null) {
            $this->ensureNoteVersionExists($store, $id, $version);
        }

        $request = Request::createFromGlobals();
        $userAgent = $request->headers->get('User-Agent');
        $contentType = $request->getAcceptableContentTypes()[0];

        if ($hasNote) {
            $note = $store->getNote($id, $version);
            $currentVersion = $store->getCurrentNoteVersion($id);
        } else {
            // We don't actually persist a note to the filesystem to imitate lazy
            // saving and avoid saving a bunch of empty files.
            $currentVersion = null;
            $note = new Note($id, NoteStore::INITIAL_VERSION, time(), '');
        }

        $data = [
            'note' => $note->serialize(),
            'currentVersion' => $currentVersion,
        ];

        if ($contentType === 'application/json') {
            $response = $this->json($data);
        } elseif (strpos($userAgent, 'curl') === 0 || $contentType === 'text/plain') {
            $response = new Response($note->content);
        } else {
            $response = $this->renderHTML($data, 'index', $id);
        }

        $response->setVary('Accept');
        return $response;
    }

    public function listNoteHistory(string $id, NoteStore $store): Response
    {
        $this->ensureNoteIdNotReserved($store, $id);
        $history = $store->getNoteHistory($id);
        $serialize = function ($entry): array {
            return $entry->serialize();
        };
        return $this->json(array_map($serialize, $history));
    }

    public function showReadOnlySharedNote(
        string $id,
        string $format,
        string $mode,
        NoteStore $store
    ): Response {
        if (!$store->hasExtantSharedNote($id)) {
            throw $this->createNotFoundException("Shared note does not exist: $id");
        }

        [$language, $bundle] = self::extractFormatLanguageAndShareBundle($format);
        $context = [
            'mode' => $mode,
            'content' => $store->getSharedNoteContent($id),
            'language' => $language,
        ];

        return $this->renderHTML($context, $bundle);
    }

    public function showSharedNote(
        string $id,
        string $format,
        string $mode,
        NoteStore $store
    ): Response {
        $this->ensureNoteIdNotReserved($store, $id);
        $this->ensureNoteVersionExists($store, $id);

        [$language, $bundle] = self::extractFormatLanguageAndShareBundle($format);
        $context = [
            'mode' => $mode,
            'content' => $store->getNote($id)->content,
            'language' => $language,
        ];

        return $this->renderHTML($context, $bundle, $id);
    }

    public function showSharedNoteVersion(
        string $id,
        int $version,
        string $format,
        string $mode,
        NoteStore $store
    ): Response {
        $this->ensureNoteIdNotReserved($store, $id);
        $this->ensureNoteVersionExists($store, $id, $version);

        [$language, $bundle] = self::extractFormatLanguageAndShareBundle($format);
        $context = [
            'mode' => $mode,
            'content' => $store->getNote($id, $version)->content,
            'language' => $language,
        ];

        return $this->renderHTML($context, $bundle, $id);
    }

    public function updateNote(string $id, NoteStore $store): Response
    {
        $this->ensureNoteIdNotReserved($store, $id);

        $request = Request::createFromGlobals();

        if ($request->getContentType() === 'json') {
            $json = json_decode($request->getContent());
            if ($json === null) {
                throw new BadRequestHttpException('Invalid JSON');
            }
            if (!isset($json->text)) {
                throw new BadRequestHttpException('Missing text parameter');
            }
            if (!is_string($json->text)) {
                throw new BadRequestHttpException('Invalid text parameter');
            }

            $content = $json->text;
        } else {
            if (!$request->request->has('text')) {
                throw new BadRequestHttpException('Missing text parameter');
            }

            $content = $request->request->get('text');
        }

        $note = $store->updateNote($id, $content);
        return $this->json($note->serialize());
    }

    public function deleteNote(string $id, NoteStore $store): Response
    {
        if ($store->hasNote($id)) {
            $store->deleteNote($id);
        }
        return new Response();
    }

    public function renameNote(string $id, NoteStore $store): Response
    {
        $request = Request::createFromGlobals();
        if (!$request->request->has('newId')) {
            throw new BadRequestHttpException('Missing newId parameter');
        }

        $newId = $request->request->get('newId');
        $this->ensureNoteIdNotReserved($store, $newId);

        if (!NoteStore::isIdValid($newId)) {
            throw new BadRequestHttpException('New ID must match pattern '.NoteStore::ID_PATTERN);
        }

        // Silently accept a no-op rename.
        if ($id !== $newId) {
            // Renaming a non-existent note is effectively a no-op so just let the
            // user think they've renamed it. This lets the consumers be less intelligent.
            if ($store->hasNote($id)) {
                $store->renameNote($id, $newId);
            }
        }

        return new Response();
    }

    public function shareNote(string $id, ?int $version, NoteStore $store): Response
    {
        $this->ensureNoteIdNotReserved($store, $id);
        $this->ensureNoteVersionExists($store, $id, $version);
        $sharedId = $store->shareNote($id, $version);
        return new Response($sharedId);
    }

    public function onKernelException(GetResponseForExceptionEvent $event)
    {
        $exception = $event->getException();
        if ($this->kernel->getEnvironment() !== 'dev' || $exception instanceof HttpExceptionInterface) {
            $request = $event->getRequest();
            $userAgent = $request->headers->get('User-Agent');
            $contentType = $request->getAcceptableContentTypes()[0];

            $response = null;

            if ($contentType === 'application/json') {
                $data = ['message' => $exception->getMessage()];
                if ($exception->getCode()) {
                    $data['code'] = $exception->getCode();
                }

                $response = new JsonResponse($data);
            } elseif (strpos($userAgent, 'curl') === 0 || $contentType === 'text/plain') {
                $response = new Response();
                $response->setContent($exception->getMessage());
            }

            if ($response !== null) {
                if ($exception instanceof NoteStoreException) {
                    $response->setStatusCode(Response::HTTP_BAD_REQUEST);
                } elseif ($exception instanceof HttpExceptionInterface) {
                    $response->setStatusCode($exception->getStatusCode());
                } else {
                    $response->setStatusCode(Response::HTTP_INTERNAL_SERVER_ERROR);
                }

                $event->setResponse($response);
            }
        }
    }

    private function renderHTML(array $context, string $bundle, ?string $title = null): Response
    {
        return $this->render('index.html.php', [
            'kernel' => $this->kernel,
            'context' => $context,
            'bundle' => $bundle,
            'title' => $title,
        ]);
    }

    private function ensureNoteVersionExists(NoteStore $store, string $id, ?int $version = null): void
    {
        $hasNote = $store->hasNote($id);
        if (!$hasNote) {
            throw $this->createNotFoundException("Note does not exist: $id");
        } elseif ($version !== null && !$store->hasNoteVersion($id, $version)) {
            throw $this->createNotFoundException("Version does not exist: $version");
        }
    }

    private function ensureNoteIdNotReserved(NoteStore $store, string $id): void
    {
        if (NoteStore::isIdReserved($id)) {
            throw new BadRequestHttpException("Reserved note id: $id");
        }
    }
}
