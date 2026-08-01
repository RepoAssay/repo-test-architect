<?php

declare(strict_types=1);

namespace RepoAssay\PhpPhpunitBasic;

final class Parser
{
    public static function normalize(?string $value): string
    {
        if ($value === null) {
            throw new \InvalidArgumentException('Value is required.');
        }

        return trim($value);
    }
}
