<?php

namespace App;

use Psr\Log\LoggerInterface;
use Symfony\Component\HttpKernel\KernelInterface;

// phpcs:disable PSR1.Classes.ClassDeclaration.MultipleClasses

class MaxIdSelectionAttemptsExceeded extends \Exception
{
}
class NoteContentSizeExceeded extends \Exception
{
}
class NoteAlreadyExists extends \Exception
{
}

class Note
{
    public $id;
    public $version;
    public $content;
    public $mtime;

    public function __construct(string $id, int $version, int $mtime, string $content)
    {
        $this->id = $id;
        $this->version = $version;
        $this->mtime = $mtime;
        $this->content = $content;
    }

    public function serialize(): array
    {
        return [
            'id' => $this->id,
            'version' => $this->version,
            'modificationTime' => $this->mtime,
            'content' => $this->content,
        ];
    }
}

class NoteHistoryEntry
{
    public $mtime;
    public $size;

    public function __construct(int $mtime, int $size)
    {
        $this->mtime = $mtime;
        $this->size = $size;
    }

    public function serialize(): array
    {
        return [
            'modificationTime' => $this->mtime,
            'size' => $this->size,
        ];
    }
}

class NoteStore
{
    public const INITIAL_VERSION = 1;
    public const ID_PATTERN = '[A-z0-9_-]+';
    public const SHARED_ID_PATTERN = '@[A-z0-9]{6}';

    private const MAX_ID_SELECTION_ATTEMPTS = 10;
    private const MAX_FILE_SIZE_BYTES = 2500000; // 2.5 MB
    private const DATA_DIR_MODE = 0755;
    private const DATA_MODE = 0644;

    public static function isIdReserved(string $id): bool
    {
        return $id === 'shared';
    }

    public static function isIdValid(string $id): bool
    {
        return !self::isIdReserved($id) && preg_match('/^'.self::ID_PATTERN.'$/', $id);
    }

    private $logger;
    private $kernel;

    public function __construct(LoggerInterface $logger, KernelInterface $kernel)
    {
        $this->logger = $logger;
        $this->kernel = $kernel;

        if (!is_dir($this->getDataDir())) {
            mkdir($this->getDataDir(), self::DATA_MODE, true);
        }
        if (!is_dir($this->getVersionDataDir())) {
            mkdir($this->getVersionDataDir(), self::DATA_DIR_MODE, true);
        }
        if (!is_dir($this->getSharedDataDir())) {
            mkdir($this->getSharedDataDir(), self::DATA_DIR_MODE, true);
        }
    }

    private function getDataDir(): string
    {
        return $this->kernel->getProjectDir().'/var/data/';
    }

    private function getVersionDataDir(): string
    {
        return $this->getDataDir().'_versions/';
    }

    private function getSharedDataDir(): string
    {
        return $this->getDataDir().'_shared/';
    }

    private function getNoteVersionDataDir(string $id): string
    {
        return $this->getVersionDataDir().$id.'/';
    }

    private function getNoteVersionPath(string $id, int $version): string
    {
        if (intval($version) < self::INITIAL_VERSION) {
            throw new \Exception("Invalid version: $version");
        }

        return $this->getNoteVersionDataDir($id).$version;
        ;
    }

    private function getNoteContentPath(string $id, ?int $version = null): string
    {
        if ($version === null) {
            return $this->getDataDir().$id;
        } else {
            return $this->getNoteVersionPath($id, $version);
        }
    }

    private function getNoteModificationTime(string $id, ?int $version = null): int
    {
        $time = filemtime($this->getNoteContentPath($id, $version));

        if ($time === false) {
            throw new \Exception("Unable to fetch modification time");
        }
        return $time;
    }

    private function getVersions(string $id): array
    {
        $versions = array_diff(scandir($this->getNoteVersionDataDir($id)), ['.', '..']);
        sort($versions, SORT_NUMERIC);
        return $versions;
    }

    public function getCurrentNoteVersion(string $id): int
    {
        if ($this->hasNote($id)) {
            $versions = $this->getVersions($id);
            return intval(end($versions));
        } else {
            return self::INITIAL_VERSION;
        }
    }

    public function generateNewId(): string
    {
        $attempts = 1;
        do {
            if ($attempts >= self::MAX_ID_SELECTION_ATTEMPTS) {
                throw new MaxIdSelectionAttemptsExceeded("Gave up after $attempts attempts.");
            }

            $attempts++;
            $id = substr(str_shuffle('234579abcdefghjkmnpqrstwxyz'), -5);
        } while ($id == null || $this->hasNote($id) || !$this->isIdValid($id));

        $this->logger->info("Generated new note id: $id.");

        return $id;
    }

    public function hasNote(string $id): bool
    {
        return file_exists($this->getNoteContentPath($id));
    }

    public function hasNoteVersion(string $id, int $version): bool
    {
        return file_exists($this->getNoteContentPath($id, $version));
    }

    public function getNote(string $id, ?int $version = null): Note
    {
        $this->logger->info("Fetching note $id at version $version.");

        $path = $this->getNoteContentPath($id, $version);
        $file = fopen($path, 'r');
        if (flock($file, LOCK_SH)) {
            $fileSize = filesize($path);
            $content = $fileSize == 0 ? '' : fread($file, $fileSize);
            if ($content === false) {
                flock($file, LOCK_UN);
                throw new \Exception('Unable to load note.');
            }
            flock($file, LOCK_UN);
        } else {
            throw new \Exception('Unable to secure file lock');
        }

        $version = $version === null ? $this->getCurrentNoteVersion($id) : $version;
        $mtime = $this->getNoteModificationTime($id, $version);
        $note = new Note($id, $version, $mtime, $content);
        return $note;
    }

    public function updateNote(string $id, string $content): Note
    {
        $content_size = strlen($content);

        if ($content_size > self::MAX_FILE_SIZE_BYTES) {
            throw new NoteContentSizeExceeded(
                "Content with $content_size bytes exceeded maximum {self::MAX_FILE_SIZE_BYTES} bytes."
            );
        }

        $this->logger->info("Updating note $id with $content_size bytes.");

        $newNote = !$this->hasNote($id);
        if ($newNote) {
            mkdir($this->getNoteVersionDataDir($id), self::DATA_DIR_MODE, true);
        }

        $rootContentPath = $this->getNoteContentPath($id);
        $rootContentFile = fopen($rootContentPath, 'w');
        if (flock($rootContentFile, LOCK_EX)) {
            $this->logger->debug("Writing new version to $rootContentPath");
            fwrite($rootContentFile, $content);

            $newVersion = $newNote ? self::INITIAL_VERSION : $this->getCurrentNoteVersion($id) + 1;
            $newVersionPath = $this->getNoteVersionPath($id, $newVersion);
            $this->logger->debug("Writing new version to $newVersionPath");
            file_put_contents($newVersionPath, $content);

            flock($rootContentFile, LOCK_UN);
        } else {
            throw new \Exception('Unable to secure file lock');
        }

        $note = new Note($id, $newVersion, time(), $content);
        return $note;
    }

    public function deleteNote(string $id): void
    {
        $this->logger->info("Deleting note $id.");

        unlink($this->getNoteContentPath($id));
        $versionDataDir = $this->getNoteVersionDataDir($id);
        array_map('unlink', glob("$versionDataDir/*"));
        rmdir($versionDataDir);
    }

    public function getNoteHistory(string $id): array
    {
        $versions = $this->getVersions($id);
        $versionDataDir = $this->getNoteVersionDataDir($id);

        $history = array_map(
            function ($version) use ($versionDataDir): NoteHistoryEntry {
                $stat = stat($versionDataDir.$version);
                return new NoteHistoryEntry($stat['mtime'], $stat['size']);
            },
            $versions
        );

        return $history;
    }

    public function renameNote(string $id, string $newId): void
    {
        if ($this->hasNote($newId)) {
            throw new \NoteAlreadyExists("Refusing to overwrite $newId content.");
        }

        $this->logger->info("Renaming note $id to $newId.");

        $versionDataDir = $this->getNoteVersionDataDir($id);
        $newVersionDataDir = $this->getNoteVersionDataDir($newId);
        rename($versionDataDir, $newVersionDataDir);

        $contentPath = $this->getNoteContentPath($id);
        $newContentPath = $this->getNoteContentPath($newId);
        rename($contentPath, $newContentPath);
    }

    public function shareNote(string $id, ?int $version = null): string
    {
        $this->logger->info("Sharing note $id at version $version.");

        $attempts = 1;
        do {
            if ($attempts >= self::MAX_ID_SELECTION_ATTEMPTS) {
                throw new MaxIdSelectionAttemptsExceeded("Gave up after $attempts attempts.");
            }

            $attempts++;
            $sharedId = '@'.substr(str_shuffle('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'), -6);
        } while ($sharedId == null || $this->hasSharedNote($sharedId));

        $this->logger->info("Generated note shared id: $sharedId.");

        $sharedSymlinkPath = $this->getSharedDataDir().$sharedId;
        if ($version === null) {
            symlink($this->getNoteContentPath($id), $sharedSymlinkPath);
        } else {
            symlink($this->getNoteContentPath($id, $version), $sharedSymlinkPath);
        }

        return $sharedId;
    }

    public function hasSharedNote(string $id): bool
    {
        return file_exists($this->getSharedDataDir().$id);
    }

    public function getSharedNoteContent(string $id): string
    {
        $this->logger->info("Fetching shared note $id.");

        $sharedSymlinkPath = $this->getSharedDataDir().$id;
        $realContentPath = readlink($sharedSymlinkPath);
        $file = fopen($realContentPath, 'r');
        if (flock($file, LOCK_SH)) {
            $fileSize = filesize($realContentPath);
            $content = $fileSize == 0 ? '' : fread($file, $fileSize);
            if ($content === false) {
                flock($file, LOCK_UN);
                throw new \Exception('Unable to load note.');
            }
            flock($file, LOCK_UN);
        } else {
            throw new \Exception('Unable to secure file lock');
        }

        return $content;
    }
}
