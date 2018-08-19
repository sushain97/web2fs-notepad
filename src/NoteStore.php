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
        return array(
            'id' => $this->id,
            'version' => $this->version,
            'modificationTime' => $this->mtime,
            'content' => $this->content,
        );
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
        return array(
            'modificationTime' => $this->mtime,
            'size' => $this->size,
        );
    }
}

class NoteStore
{
    # TODO: tighten all the 0777 permissions

    const MAX_ID_SELECTION_ATTEMPTS = 10;
    const MAX_FILE_SIZE_BYTES = 2500000; // 2.5 MB

    private $logger;
    private $kernel;

    public function __construct(LoggerInterface $logger, KernelInterface $kernel)
    {
        $this->logger = $logger;
        $this->kernel = $kernel;

        if (!is_dir($this->getDataDir())) {
            mkdir($this->getDataDir(), 0777, true);
        }
        if (!is_dir($this->getVersionDataDir())) {
            mkdir($this->getVersionDataDir(), 0777, true);
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

    private function getNoteVersionDataDir(string $id): string
    {
        return $this->getVersionDataDir().$id.'/';
    }

    private function getNoteVersionPath(string $id, int $version): string
    {
        if (intval($version) < 0) {
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

    public function getCurrentNoteVersion(string $id): int
    {
        if ($this->hasNote($id)) {
            $versions = scandir($this->getNoteVersionDataDir($id));
            rsort($versions, 1);
            return intval($versions[0]);
        } else {
            return 0;
        }
    }

    public function generateNewId(): string
    {
        // TODO: generate a human readable id instead

        $attempts = 1;
        do {
            if ($attempts >= self::MAX_ID_SELECTION_ATTEMPTS) {
                throw new MaxIdSelectionAttemptsExceeded("Gave up after $attempts attempts.");
            }

            $attempts++;
            $id = substr(str_shuffle('234579abcdefghjkmnpqrstwxyz'), -5);
        } while ($id == null || $this->hasNote($id));

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
            $content = $fileSize == 0 ? '' : fread($file, filesize($path));
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
            mkdir($this->getNoteVersionDataDir($id), 0777, true);
        }

        $rootContentPath = $this->getNoteContentPath($id);
        $rootContentFile = fopen($rootContentPath, 'w');
        if (flock($rootContentFile, LOCK_EX)) {
            $this->logger->debug("Writing new version to $rootContentPath");
            fwrite($rootContentFile, $content);

            $newVersion = $newNote ? 0 : $this->getCurrentNoteVersion($id) + 1;
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

    public function deleteNote(string $id)
    {
        unlink($this->getNoteContentPath($id));
        $versionDataDir = $this->getNoteVersionDataDir($id);
        array_map('unlink', glob("$versionDataDir/*"));
        rmdir($versionDataDir);
    }

    public function getNoteHistory(string $id): array
    {
        $versionDataDir = $this->getNoteVersionDataDir($id);

        $history = [];
        foreach(glob("$versionDataDir/*") as $version) {
            $stat = stat($version);
            $history[] = new NoteHistoryEntry($stat['mtime'], $stat['size']);
        }

        return $history;
    }
}
