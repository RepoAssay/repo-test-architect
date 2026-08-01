<?php

declare(strict_types=1);

namespace RepoAssay\PhpPhpunitBasic;

final class Service
{
    public function execute(bool $enabled): string
    {
        return $enabled ? 'enabled' : 'disabled';
    }
}
