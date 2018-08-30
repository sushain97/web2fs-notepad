<?php

namespace App;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\KernelInterface;
use Symfony\Component\Routing\Annotation\Route;

class PageController extends AbstractController
{
    private function renderHTML(KernelInterface $kernel, array $context, string $bundle, ?string $title = null): Response
    {
        return $this->render('index.html.php', [
            'kernel' => $kernel,
            'context' => $context,
            'bundle' => $bundle,
            'title' => $title,
        ]);
    }

    private function ensureNoteVersionExists(NoteStore $store, string $id, ?int $version = null): void
    {
        $hasNote = $store->hasNote($id);
        if (!$hasNote) {
            throw $this->createNotFoundException("Note does not exist: $id.");
        } elseif ($version !== null && !$store->hasNoteVersion($id, $version)) {
            throw $this->createNotFoundException("Version does not exist: $version.");
        }
    }

    private function ensureNoteIdNotReserved(NoteStore $store, string $id): void
    {
        if ($store->isIdReserved($id)) {
            throw new BadRequestHttpException("Reserved note id: $id.");
        }
    }

    private function extractFormatLanguageAndShareBundle(string $format): array
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

    public function newNote(NoteStore $store): Response
    {
        try {
            $id = $store->generateNewId();
        } catch (MaxIdSelectionAttemptsExceeded $e) {
            throw new HttpException(500, "Unable to allocate new note: {$e->getMessage()}.");
        }

        return $this->redirectToRoute('showNote', ['id' => $id]);
    }

    public function showNote(string $id, ?int $version, NoteStore $store, KernelInterface $kernel): Response
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
            return $this->json($data);
        } elseif (strpos($userAgent, 'curl') === 0 || $contentType === 'text/plain') {
            return new Response($note->content);
        } else {
            return $this->renderHTML($kernel, $data, 'index', $id);
        }
    }

    public function shareNote(string $id, ?int $version, NoteStore $store): Response
    {
        $this->ensureNoteIdNotReserved($store, $id);
        $this->ensureNoteVersionExists($store, $id, $version);
        $sharedId = $store->shareNote($id, $version);
        return new Response($sharedId);
    }

    public function showReadOnlySharedNote(
        string $id,
        NoteStore $store,
        string $format,
        string $mode,
        KernelInterface $kernel
    ): Response {
        if (!$store->hasSharedNote($id)) {
            throw $this->createNotFoundException("Shared note does not exist: $id.");
        }

        [$language, $bundle] = $this->extractFormatLanguageAndShareBundle($format);
        $context = [
            'mode' => $mode,
            'content' => $store->getSharedNoteContent($id),
            'language' => $language,
        ];

        return $this->renderHTML($kernel, $context, $bundle);
    }

    public function showSharedNote(
        string $id,
        string $format,
        string $mode,
        NoteStore $store,
        KernelInterface $kernel
    ): Response {
        $this->ensureNoteIdNotReserved($store, $id);
        $this->ensureNoteVersionExists($store, $id);

        [$language, $bundle] = $this->extractFormatLanguageAndShareBundle($format);
        $context = [
            'mode' => $mode,
            'content' => $store->getNote($id)->content,
            'language' => $language,
        ];

        return $this->renderHTML($kernel, $context, $bundle, $id);
    }

    public function showSharedNoteVersion(
        string $id,
        int $version,
        string $format,
        string $mode,
        NoteStore $store,
        KernelInterface $kernel
    ): Response {
        $this->ensureNoteIdNotReserved($store, $id);
        $this->ensureNoteVersionExists($store, $id, $version);

        [$language, $bundle] = $this->extractFormatLanguageAndShareBundle($format);
        $context = [
            'mode' => $mode,
            'content' => $store->getNote($id, $version)->content,
            'language' => $language,
        ];

        return $this->renderHTML($kernel, $context, $bundle, $id);
    }

    public function updateNote(string $id, NoteStore $store): Response
    {
        $this->ensureNoteIdNotReserved($store, $id);

        $request = Request::createFromGlobals();
        if (!$request->request->has('text')) {
            throw new BadRequestHttpException('Missing text parameter.');
        }

        $content = $request->request->get('text');

        try {
            $note = $store->updateNote($id, $content);
        } catch (NoteContentSizeExceeded $e) {
            throw new BadRequestHttpException("Failed to update note: {$e->getMessage()}.");
        }

        return $this->json($note->serialize());
    }

    public function deleteNote(string $id, NoteStore $store): Response
    {
        if ($store->hasNote($id)) {
            $store->deleteNote($id);
        }
        return new Response();
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

    public function renameNote(string $id, NoteStore $store): Response
    {
        $this->ensureNoteIdNotReserved($store, $id);

        $request = Request::createFromGlobals();
        if (!$request->request->has('newId')) {
            throw new BadRequestHttpException('Missing newId parameter.');
        }

        $newId = $request->request->get('newId');

        if ($store->hasNote($newId)) {
            throw new BadRequestHttpException('Cannot overwrite existing note.');
        }

        if (!preg_match('/[A-z0-9_-]+/', $newId)) {
            throw new BadRequestHttpException('New ID must match pattern [A-z0-9_-]+.');
        }

        // Renaming a non-existent note is effectively a no-op so just let the
        // user think they've renamed it. This lets the consumers be less intelligent.
        if ($store->hasNote($id)) {
            $store->renameNote($id, $newId);
        }

        return new Response();
    }
}
