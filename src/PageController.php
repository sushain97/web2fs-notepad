<?php
namespace App;

use Symfony\Component\Routing\Annotation\Route;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;

class PageController extends AbstractController {
    /**
     * @Route("/", methods={"GET"})
     */
    public function new_note() {
        $number = random_int(0, 100);

        return new Response('<html><body>Lucky number: '.$number.'</body></html>');
    }

    /**
     * @Route("/{name}", methods={"GET", "POST"})
     */
    public function existing_note()
    {
        $number = random_int(0, 100);

        return new Response('<html><body>Lucky number: '.$number.'</body></html>');
    }
}
