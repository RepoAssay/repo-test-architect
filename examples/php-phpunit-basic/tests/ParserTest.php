<?php

declare(strict_types=1);

namespace RepoAssay\PhpPhpunitBasic\Tests;

use PHPUnit\Framework\TestCase;
use RepoAssay\PhpPhpunitBasic\Parser;

final class ParserTest extends TestCase
{
    public function testNormalizesInput(): void
    {
        self::assertSame('hello', Parser::normalize(' hello '));
    }
}
