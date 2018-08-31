<?php

// phpcs:disable PSR1.Files.SideEffects

namespace App;

use Symfony\Component\Routing\RouteCollection;
use Symfony\Component\Routing\Route;

const ID_REQ = NoteStore::ID_PATTERN;
const SHARED_ID_REQ = NoteStore::SHARED_ID_PATTERN;
const VERSION_REQ = NoteStore::VERSION_PATTERN;
const FORMAT_REQ = 'raw|plaintext|plainText|markdown|code(-[^/]+)?';
const MODE_REQ = 'light|dark';

const DEFAULT_FORMAT = 'plaintext';
const DEFAULT_MODE = 'light';

class RouteBuilder
{
    public $routes;

    public function __construct()
    {
        $this->routes = new RouteCollection();
    }

    public function addRoute(string $name, string $method, string $path, array $options = [])
    {
        $route = new Route($path, ['_controller' => [Controller::class, $name]]);
        $route->setMethods([$method]);
        $route->addDefaults(isset($options['defaults']) ? $options['defaults'] : []);
        $route->addRequirements(isset($options['requirements']) ? $options['requirements'] : []);

        $this->routes->add($name, $route);
    }
}

$routeBuilder = new RouteBuilder();

$routeBuilder->addRoute('newNote', 'GET', '/');
$routeBuilder->addRoute('showNote', 'GET', '/{id}/{version}', [
    'requirements' => ['id' => ID_REQ, 'version' => VERSION_REQ],
    'defaults' => ['version' => null],
]);
$routeBuilder->addRoute('listNoteHistory', 'GET', '/{id}/history', [
    'requirements' => ['id' => ID_REQ],
]);
$routeBuilder->addRoute('showReadOnlySharedNote', 'GET', '/shared/{id}/{format}/{mode}', [
    'requirements' => ['id' => SHARED_ID_REQ, 'format' => FORMAT_REQ, 'mode' => MODE_REQ],
    'defaults' => ['format' => DEFAULT_FORMAT, 'mode' => DEFAULT_MODE],
]);
$routeBuilder->addRoute('showSharedNote', 'GET', '/shared/{id}/{format}/{mode}', [
    'requirements' => ['id' => ID_REQ, 'format' => FORMAT_REQ, 'mode' => MODE_REQ],
    'defaults' => ['format' => DEFAULT_FORMAT, 'mode' => DEFAULT_MODE],
]);
$routeBuilder->addRoute('showSharedNoteVersion', 'GET', '/shared/{id}/{version}/{format}/{mode}', [
    'requirements' => ['id' => ID_REQ, 'format' => FORMAT_REQ, 'mode' => MODE_REQ],
    'defaults' => ['format' => DEFAULT_FORMAT, 'mode' => DEFAULT_MODE],
]);

$routeBuilder->addRoute('updateNote', 'POST', '/{id}', [
    'requirements' => ['id' => ID_REQ],
]);
$routeBuilder->addRoute('deleteNote', 'DELETE', '/{id}', [
    'requirements' => ['id' => ID_REQ],
]);
$routeBuilder->addRoute('renameNote', 'POST', '/{id}/rename', [
    'requirements' => ['id' => ID_REQ],
]);
$routeBuilder->addRoute('shareNote', 'POST', '/share/{id}/{version}', [
    'requirements' => ['id' => ID_REQ, 'version' => VERSION_REQ],
    'defaults' => ['version' => null],
]);

return $routeBuilder->routes;
