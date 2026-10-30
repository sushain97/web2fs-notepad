<?php

namespace App;

use Symfony\Bundle\FrameworkBundle\Kernel\MicroKernelTrait;
use Symfony\Component\HttpKernel\Kernel as BaseKernel;

class Kernel extends BaseKernel
{
    use MicroKernelTrait;

    private $manifest;

    public function __construct(string $environment, bool $debug)
    {
        parent::__construct($environment, $debug);

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

    public function getAssetPath(string $asset): string
    {
        return '/assets/'.($this->manifest[$asset] ?? $asset);
    }
}
