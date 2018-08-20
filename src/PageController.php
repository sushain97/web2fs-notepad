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
    /**
     * @Route("/", name="new_note", methods={"GET"})
     */
    public function newNote(NoteStore $store): Response
    {
        try {
            $id = $store->generateNewId();
        } catch (MaxIdSelectionAttemptsExceeded $e) {
            throw new HttpException(500, "Unable to allocate new note: {$e->getMessage()}.");
        }

        return $this->redirectToRoute('show_note', ['id' => $id]);
    }

    /**
     * @Route(
     *     "/{id}/{version}",
     *     name="show_note",
     *     methods={"GET"},
     *     requirements={"id"="[A-z0-9_-]+", "version"="\d+"},
     *     defaults={"version"=null}
     * )
     */
    public function showNote(string $id, ?int $version, NoteStore $store, KernelInterface $kernel): Response
    {
        $request = Request::createFromGlobals();
        $userAgent = $request->headers->get('User-Agent');

        $hasNote = $store->hasNote($id);

        if ($version !== null && !$store->hasNoteVersion($id, $version)) {
            if ($hasNote) {
                throw $this->createNotFoundException("Version does not exist: $version.");
            } else {
                throw $this->createNotFoundException("Note does not exist: $id.");
            }
        }

        if ($hasNote) {
            $note = $store->getNote($id, $version);
            $currentVersion = $store->getCurrentNoteVersion($id);
        } else {
            // We don't actually persist a note to the filesystem to imitate lazy
            // saving and avoid saving a bunch of empty files.
            $currentVersion = NoteStore::INITIAL_VERSION;
            $note = new Note($id, $currentVersion, time(), '');
        }

        $data = [
            'note' => $note->serialize(),
            'currentVersion' => $currentVersion,
        ];

        if (strpos($userAgent, 'curl') === 0) {
            return new Response($content);
        } elseif ($request->getAcceptableContentTypes()[0] === 'application/json') {
            return $this->json($data);
        } else {
            return $this->render('index.html.php', $data + ['kernel' => $kernel]);
        }
    }

    /**
     * @Route("/{id}", name="update_note", methods={"POST"}, requirements={"id"="[A-z0-9_-]+"})
     */
    public function updateNote(string $id, NoteStore $store): Response
    {
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

    /**
     * @Route("/{id}", name="delete_note", methods={"DELETE"}, requirements={"id"="[A-z0-9_-]+"})
     */
    public function deleteNote(string $id, NoteStore $store): Response
    {
        if ($store->hasNote($id)) {
            $store->deleteNote($id);
        }
        return new Response();
    }

    /**
     * @Route("/{id}/history", name="list_note_history", methods={"GET"}, requirements={"id"="[A-z0-9_-]+"})
     */
    public function listNoteHistory(string $id, NoteStore $store): Response
    {
        $history = $store->getNoteHistory($id);
        $serialize = function ($entry): array {
            return $entry->serialize();
        };
        return $this->json(array_map($serialize, $history));
    }

    /**
     * @Route("/{id}/rename", name="rename_note", methods={"POST"}, requirements={"id"="[A-z0-9_-]+"})
     */
    public function renameNote(string $id, NoteStore $store): Response
    {
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
