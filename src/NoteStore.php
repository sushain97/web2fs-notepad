<?php

namespace App;

use Psr\Log\LoggerInterface;
use Symfony\Component\HttpKernel\KernelInterface;

// phpcs:disable PSR1.Classes.ClassDeclaration.MultipleClasses

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

class NoteMetadata
{
    public $shares;

    public static function fromJSON(string $rawData): NoteMetadata
    {
        $metadata = new self();
        $data = json_decode($rawData);
        $metadata->shares = $data->shares;
        return $metadata;
    }

    public function __construct()
    {
        $this->shares = [];
    }

    public function serialize(): array
    {
        return [
            'shares' => $this->shares,
        ];
    }
}

class NoteStoreException extends \Exception
{
}

class NoteStore
{
    public const INITIAL_VERSION = 1;
    public const ID_PATTERN = '[A-z0-9_-]+';
    public const SHARED_ID_PATTERN = '@[A-z0-9]{6}';
    public const VERSION_PATTERN = '\d+';

    public const CONTENT_SIZE_LIMIT_EXCEEDED_EXCEPTION_CODE = 1;
    public const VERSION_LIMIT_EXCEEDED_EXCEPTION_CODE = 2;
    public const ID_ALREADY_EXISTS_EXCEPTION_CODE = 3;
    public const ID_LENGTH_EXCEEDED_EXCEPTION_CODE = 4;

    private const MAX_ID_SELECTION_ATTEMPTS = 10;
    private const MAX_ID_LENGTH = 200;
    private const MAX_FILE_SIZE_BYTES = 2500000; // 2.5 MB
    private const MAX_VERSION = 1000;

    private const DATA_DIR_MODE = 0755;
    private const DATA_MODE = 0644;

    private const VERSION_DATA_DIR = '_versions/';
    private const SHARES_DATA_DIR = '_shares/';
    private const METADATA_DATA_DIR = '_metadata/';

    public static function isIdReserved(string $id): bool
    {
        return $id === 'shared';
    }

    public static function isIdValid(string $id): bool
    {
        return !self::isIdReserved($id) && preg_match('/^'.self::ID_PATTERN.'$/', $id);
    }

    private static function readFileWithLock(string $path): string
    {
        $file = fopen($path, 'r');
        if (flock($file, LOCK_SH)) {
            $fileSize = filesize($path);
            $content = $fileSize === 0 ? '' : fread($file, $fileSize);
            if ($content === false) {
                flock($file, LOCK_UN);
                throw new \Exception('Unable to load file');
            }
            flock($file, LOCK_UN);
        } else {
            throw new \Exception('Unable to secure file lock');
        }

        return $content;
    }

    private $logger;
    private $kernel;

    public function __construct(LoggerInterface $logger, KernelInterface $kernel)
    {
        $this->logger = $logger;
        $this->kernel = $kernel;

        if (!is_dir($this->getDataDir())) {
            mkdir($this->getDataDir(), self::DATA_DIR_MODE, true);
        }
        if (!is_dir($this->getVersionDataDir())) {
            mkdir($this->getVersionDataDir(), self::DATA_DIR_MODE, true);
        }
        if (!is_dir($this->getSharesDataDir())) {
            mkdir($this->getSharesDataDir(), self::DATA_DIR_MODE, true);
        }
        if (!is_dir($this->getMetadataDataDir())) {
            mkdir($this->getMetadataDataDir(), self::DATA_DIR_MODE, true);
        }
    }

    public function getCurrentNoteVersion(string $id): int
    {
        if ($this->hasNote($id)) {
            $versions = $this->getNoteVersions($id);
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
                throw new \Exception("Exceeded $attempts attempts to select a unique id");
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
        $content = self::readFileWithLock($path);

        $version = $version === null ? $this->getCurrentNoteVersion($id) : $version;
        $mtime = $this->getNoteModificationTime($id, $version);
        $note = new Note($id, $version, $mtime, $content);
        return $note;
    }

    public function updateNote(string $id, string $content): Note
    {
        $content_size = strlen($content);

        if ($content_size > self::MAX_FILE_SIZE_BYTES) {
            throw new NoteStoreException(
                "Content with $content_size bytes exceeded ".self::MAX_FILE_SIZE_BYTES.' byte limit',
                self::CONTENT_SIZE_LIMIT_EXCEEDED_EXCEPTION_CODE
            );
        }

        $this->logger->info("Updating note $id with $content_size bytes.");

        $newNote = !$this->hasNote($id);
        if ($newNote) {
            if (strlen($id) > self::MAX_ID_LENGTH) {
                throw new NoteStoreException(
                    'Id of length '.strlen($id).' exceeded '.self::MAX_ID_LENGTH.' character limit',
                    self::ID_LENGTH_EXCEEDED_EXCEPTION_CODE
                );
            }

            mkdir($this->getNoteVersionDataDir($id), self::DATA_DIR_MODE, true);
        }

        $newVersion = $newNote ? self::INITIAL_VERSION : $this->getCurrentNoteVersion($id) + 1;
        if ($newVersion > self::MAX_VERSION) {
            throw new NoteStoreException(
                "New version $newVersion exceeded maximum ".self::MAX_VERSION.' versions',
                self::VERSION_LIMIT_EXCEEDED_EXCEPTION_CODE
            );
        }

        $rootContentPath = $this->getNoteContentPath($id);
        $rootContentFile = fopen($rootContentPath, 'w');
        if (flock($rootContentFile, LOCK_EX)) {
            $this->logger->debug("Writing new version to $rootContentPath.");
            fwrite($rootContentFile, $content);

            $newVersionPath = $this->getNoteVersionPath($id, $newVersion);
            $this->logger->debug("Writing new version to $newVersionPath.");
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

        // We intentionally leave any existing shares intact so that their ids
        // are not incidentally allocated to another note. Since they are now
        // dangling symlinks, they will externally behave identically to a non-
        // existent share.
        $metadataPath = $this->getNoteMetadataPath($id);
        if (file_exists($metadataPath)) {
            unlink($metadataPath);
        }

        $versionDataDir = $this->getNoteVersionDataDir($id);
        array_map('unlink', glob("$versionDataDir/*"));
        rmdir($versionDataDir);
    }

    public function getNoteHistory(string $id): array
    {
        $versions = $this->getNoteVersions($id);
        $versionDataDir = $this->getNoteVersionDataDir($id);

        $history = array_map(
            function (int $version) use ($versionDataDir): NoteHistoryEntry {
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
            throw new NoteStoreException(
                "Note with id $newId already exists, refusing to overwrite",
                self::ID_ALREADY_EXISTS_EXCEPTION_CODE
            );
        }

        if (strlen($newId) > self::MAX_ID_LENGTH) {
            throw new NoteStoreException(
                'New id of length '.strlen($newId).' exceeded '.self::MAX_ID_LENGTH.' character limit',
                self::ID_LENGTH_EXCEEDED_EXCEPTION_CODE
            );
        }

        $this->logger->info("Renaming note $id to $newId.");

        $versionDataDir = $this->getNoteVersionDataDir($id);
        $newVersionDataDir = $this->getNoteVersionDataDir($newId);
        rename($versionDataDir, $newVersionDataDir);

        $contentPath = $this->getNoteContentPath($id);
        $newContentPath = $this->getNoteContentPath($newId);
        rename($contentPath, $newContentPath);

        $metadataPath = $this->getNoteMetadataPath($id);
        if (file_exists($metadataPath)) {
            $newMetadataPath = $this->getNoteMetadataPath($newId);
            rename($metadataPath, $newMetadataPath);

            $content = self::readFileWithLock($newMetadataPath);
            $metadata = NoteMetadata::fromJSON($content);

            $sharesDataDir = $this->getSharesDataDir();
            $oldRootContentPath = $this->getShareDirRelativeNoteContentPath($id);
            $newRootContentPath = $this->getShareDirRelativeNoteContentPath($newId);
            $versionContentPathRegex = '|^../'.self::VERSION_DATA_DIR."$id/(".self::VERSION_PATTERN.')$|';

            foreach ($metadata->shares as $shareId) {
                $shareSymlinkPath = $sharesDataDir.$shareId;
                $contentPath = readlink($shareSymlinkPath);

                $matches = [];
                if ($contentPath === $oldRootContentPath) {
                    $newContentPath = $newRootContentPath;
                } elseif (preg_match($versionContentPathRegex, $contentPath, $matches)) {
                    $newContentPath = $this->getShareDirRelativeNoteContentPath($newId, $matches[1]);
                } else {
                    throw new \Exception("Found unrecognized content path link $contentPath");
                }

                $this->logger->debug("Moving share $shareId from $contentPath to $newContentPath.");
                unlink($shareSymlinkPath);
                symlink($newContentPath, $shareSymlinkPath);
            }
        }
    }

    public function shareNote(string $id, ?int $version = null): string
    {
        $this->logger->info("Sharing note $id at version $version.");

        $attempts = 1;
        do {
            if ($attempts >= self::MAX_ID_SELECTION_ATTEMPTS) {
                throw new \Exception("Exceeded $attempts attempts to select a unique share id");
            }

            $attempts++;
            $shareId = '@'.substr(str_shuffle('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'), -6);
        } while ($shareId == null || $this->hasSharedNote($shareId));

        $this->logger->info("Generated note shared id: $shareId.");

        // We use a symlink rather than a hard link so that the dangling link
        // is left behind to reserve this id. In order to support renames,
        // we maintain a listing of them in metadata. The paths are relative
        // in order to facilitate renames.
        $shareSymlinkPath = $this->getSharesDataDir().$shareId;
        $relativeContentPath = $this->getShareDirRelativeNoteContentPath($id, $version);
        symlink($relativeContentPath, $shareSymlinkPath);

        $metadataPath = $this->getNoteMetadataPath($id);
        $metadataFile = fopen($metadataPath, 'c+');
        if (flock($metadataFile, LOCK_EX)) {
            $fileSize = filesize($metadataPath);
            if ($fileSize === 0) {
                $this->logger->debug('Creating new metadata.');
                $metadata = new NoteMetadata();
            } else {
                $this->logger->debug('Reading existing metadata.');
                $content = fread($metadataFile, $fileSize);
                $metadata = NoteMetadata::fromJSON($content);
            }

            $metadata->shares[] = $shareId;

            $this->logger->debug('Flushing updated metadata.');
            ftruncate($metadataFile, 0);
            fseek($metadataFile, 0);
            fwrite($metadataFile, json_encode($metadata->serialize(), JSON_PRETTY_PRINT));

            flock($metadataFile, LOCK_UN);
        } else {
            throw new \Exception('Unable to secure metadata file lock');
        }

        return $shareId;
    }

    public function hasExtantSharedNote(string $shareId): bool
    {
        return file_exists($this->getSharesDataDir().$shareId);
    }

    public function getSharedNoteContent(string $shareId): string
    {
        $this->logger->info("Fetching shared note $shareId.");

        $sharesDataDir = $this->getSharesDataDir();
        $path = $sharesDataDir.readlink($sharesDataDir.$shareId);
        $content = self::readFileWithLock($path);

        return $content;
    }

    private function hasSharedNote(string $shareId): bool
    {
        return is_link($this->getSharesDataDir().$shareId);
    }

    private function getDataDir(): string
    {
        return $this->kernel->getProjectDir().'/var/data/';
    }

    private function getVersionDataDir(): string
    {
        return $this->getDataDir().self::VERSION_DATA_DIR;
    }

    private function getSharesDataDir(): string
    {
        return $this->getDataDir().self::SHARES_DATA_DIR;
    }

    private function getMetadataDataDir(): string
    {
        return $this->getDataDir().self::METADATA_DATA_DIR;
    }

    private function getNoteMetadataPath(string $id): string
    {
        return $this->getMetadataDataDir().$id;
    }

    private function getNoteVersionDataDir(string $id): string
    {
        return $this->getVersionDataDir().$id.'/';
    }

    private function getNoteVersionPath(string $id, int $version): string
    {
        if (intval($version) < self::INITIAL_VERSION) {
            throw new \DomainException("Invalid version: $version");
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

    private function getShareDirRelativeNoteContentPath(string $id, ?int $version = null): string
    {
        if ($version === null) {
            return "../$id";
        } else {
            return '../'.self::VERSION_DATA_DIR."$id/$version";
        }
    }

    private function getNoteModificationTime(string $id, ?int $version = null): int
    {
        $time = filemtime($this->getNoteContentPath($id, $version));

        if ($time === false) {
            throw new \Exception('Unable to fetch modification time');
        }
        return $time;
    }

    private function getNoteVersions(string $id): array
    {
        if (!$this->hasNote($id)) {
            return [];
        }

        $versions = array_diff(scandir($this->getNoteVersionDataDir($id)), ['.', '..']);
        sort($versions, SORT_NUMERIC);
        return $versions;
    }
}
