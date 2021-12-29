<?php

namespace App;

use Symfony\Bundle\FrameworkBundle\Kernel\MicroKernelTrait;
use Symfony\Component\Config\Loader\LoaderInterface;
use Symfony\Component\Config\Resource\FileResource;
use Symfony\Component\DependencyInjection\ContainerBuilder;
use Symfony\Component\HttpKernel\Kernel as BaseKernel;
use Symfony\Component\Routing\RouteCollectionBuilder;

class Kernel extends BaseKernel
{
    use MicroKernelTrait;

    private $manifest;

    const CONFIG_EXTS = '.{php,xml,yaml,yml}';

    public function __construct(...$args)
    {
        parent::__construct(...$args);

        $manifestPath = $this->getProjectDir().'/public/assets/assets-manifest.json';
        if (file_exists($manifestPath)) {
            $this->manifest = json_decode(file_get_contents($manifestPath), true);
        } else {
            $this->manifest = [];
        }
    }

    public function getProjectDir(): string
    {
        return realpath(__DIR__.'/../');
    }

    public function getCacheDir(): string
    {
        return $this->getProjectDir().'/var/cache/'.$this->environment;
    }

    public function getLogDir(): string
    {
        return $this->getProjectDir().'/var/log';
    }

    public function getAssetPath(string $asset)
    {
        return '/assets/'.$this->manifest[$asset];
    }

    public function registerBundles()
    {
        $contents = require $this->getProjectDir().'/config/bundles.php';
        foreach ($contents as $class => $envs) {
            if (isset($envs['all']) || isset($envs[$this->environment])) {
                yield new $class();
            }
        }
    }

    protected function configureContainer(ContainerBuilder $container, LoaderInterface $loader): void
    {
        $container->addResource(new FileResource($this->getProjectDir().'/config/bundles.php'));
        $container->setParameter('container.dumper.inline_class_loader', true);
        $confDir = $this->getProjectDir().'/config';

        $loader->load($confDir.'/{packages}/*'.self::CONFIG_EXTS, 'glob');
        $loader->load($confDir.'/{services}'.self::CONFIG_EXTS, 'glob');
    }

    protected function configureRoutes(RouteCollectionBuilder $routes): void
    {
        $routes->import($this->getProjectDir().'/config/{routes}'.self::CONFIG_EXTS, '/', 'glob');
    }
}
