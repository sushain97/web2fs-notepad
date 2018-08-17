<?php
namespace App;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\Routing\Annotation\Route;

class PageController extends AbstractController
{
    // TODO: customize the 400/404/500 templates (especially for curl)

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

        return $this->redirectToRoute('show_note', array('id' => $id));
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
    public function showNote(string $id, ?string $version, NoteStore $store): Response
    {
        $request = Request::createFromGlobals();
        $user_agent = $request->headers->get('User-Agent');

        if ($version !== null && $version != 0 && !$store->hasNoteVersion($id, $version)) {
            throw $this->createNotFoundException("Version does not exist: $version.");
        }

        $hasNote = $store->hasNote($id);
        if (!$hasNote) {
            $store->updateNote($id, '');
        }
        $note = $store->getNote($id, $version);

        if (strpos($user_agent, 'curl') === 0) {
            return new Response($content);
        } else {
            // TODO: render a page that shows the content and lets you edit it
            //       (updates URL to newest version + version listing + spinner)
            // TODO: ensure that if version is set, the page is frozen
            return $this->render('index.html.php', array(
                'note' => $note->serialize(),
                'currentVersion' => $store->getCurrentNoteVersion($id),
            ));
        }
    }

    /**
     * @Route("/{id}", name="update_note", methods={"POST"}, requirements={"id"="[A-z0-9_-]+"})
     */
    public function updateNote(string $id, NoteStore $store): Response
    {
        $request = Request::createFromGlobals();
        if (!$request->request->has('text')) {
            throw new BadRequestHttpException('Missing update text parameter.');
        }

        $content = $request->request->get('text');

        try {
            $newVersion = $store->updateNote($id, $content);
        } catch (NoteContentSizeExceeded $e) {
            throw new BadRequestHttpException("Failed to update note: {$e->getMessage()}.");
        }

        return $this->json(array('version' => $newVersion));
    }

    /**
     * @Route("/{id}", name="delete_note", methods={"DELETE"}, requirements={"id"="[A-z0-9_-]+"})
     */
    public function deleteNote(string $id): Response
    {
        // TODO: write this function
    }

    /**
     * @Route("/{id}/history", name="list_note_history", methods={"GET"}, requirements={"id"="[A-z0-9_-]+"})
     */
    public function listNoteHistory(string $id): Response
    {
        // TODO: write this (return some JSON info including sizes of versions and mtimes?)
    }

    /**
     * @Route("/{id}/rename", name="rename_note", methods={"POST"}, requirements={"id"="[A-z0-9_-]+"})
     */
    public function renameNote(string $id): Response
    {
        // TODO: write this and redirect?
    }
}
