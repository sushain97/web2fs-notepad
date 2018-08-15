<?php
namespace App;

use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\Routing\Annotation\Route;

class PageController extends AbstractController {
    /**
     * @Route("/", name="new_note", methods={"GET"})
     */
    public function new_note(LoggerInterface $logger, NoteStore $store) {
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
    public function show_note($id, $version, NoteStore $store) {
        $request = Request::createFromGlobals();
        $user_agent = $request->headers->get('User-Agent');
        $version = intval($version);

        if ($version !== null && $version !== 0 && !$store->hasNoteVersion($id, $version)) {
            // TODO: customize the 404 template
            throw $this->createNotFoundException("Version does not exist: $version");
        }

        $content = $store->hasNote($id) ? $store->getNoteContent($id, $version) : '';

        if (strpos($user_agent, 'curl') === 0) {
            return new Response($content);
        } else {
            // TODO: render a page that shows the content and lets you edit it
            // TODO: ensure that if version is set, the page is frozen
            return new Response('<html><body>Current content: '.$content.'</body></html>');
        }
    }

    /**
     * @Route("/api/{id}", name="update_note", methods={"POST"}, requirements={"id"="[A-z0-9_-]+"})
     */
    public function update_note($id) {
        // TODO: take the payload and write it
        // TODO: catch NoteContentSizeExceeded and surface 400
        $number = random_int(0, 100);

        return new Response('<html><body>Lucky number: '.$number.'</body></html>');
    }

    public function list_note_versions($id) {
        // TODO: write this
    }
}
