<?php
namespace App;

use Psr\Log\LoggerInterface;
use Symfony\Component\HttpKernel\KernelInterface;

class MaxIdSelectionAttemptsExceeded extends \Exception {}
class NoteContentSizeExceeded extends \Exception {}

class NoteStore {
    const MAX_ID_SELECTION_ATTEMPTS = 10;
    const MAX_FILE_SIZE_BYTES = 2500000; // 2.5 MB

    private $logger;
    private $kernel;

    public function __construct(LoggerInterface $logger, KernelInterface $kernel) {
        $this->logger = $logger;
        $this->kernel = $kernel;

        # TODO: tighten these permissions
        if (!is_dir($this->getDataDir())) {
            mkdir($this->getDataDir(), 0777, true);
        }
        if (!is_dir($this->getVersionDataDir())) {
            mkdir($this->getVersionDataDir(), 0777, true);
        }
    }

    private function getDataDir() {
        return $this->kernel->getProjectDir().'/var/data/';
    }

    private function getVersionDataDir() {
        return $this->getDataDir().'/var/data/_versions/';
    }

    private function getNoteVersionDataDir($id) {
        return $this->getVersionDataDir().$id.'/';
    }

    private function getNoteVersionPath($id, $version) {
        if (!is_int($version) || $version < 0) {
            throw new Exception("Invalid version: $version");
        }

        return $this->getNoteVersionDataDir($id).$version;;
    }

    private function getNoteContentPath($id, $version=null) {
        if ($version === null) {
            return $this->getDataDir().$id;
        } else {
            return $this->getNoteVersionPath($id, $version);
        }
    }

    private function getCurrentNoteVersion($id) {
        if ($this->hasNote($id)) {
            $versions = scandir($this->getNoteVersionDataDir());
            rsort($versions, 1);
            return intval($versions[0]);
        } else {
            return 0;
        }
    }

    public function generateNewId() {
        // TODO: generate a human readable id instead

        $id = null;
        $attempts = 1;
        do {
            if ($attempts >= self::MAX_ID_SELECTION_ATTEMPTS) {
                throw new MaxIdSelectionAttemptsExceeded("Gave up after $attempts attempts.");
            }

            $attempts++;
            $id = substr(str_shuffle('234579abcdefghjkmnpqrstwxyz'), -5);
        } while($this->hasNote($id));

        $this->logger->info("Generated new note id: $id");

        return $id;
    }

    public function hasNote($id) {
        return file_exists($this->getNoteContentPath($id));
    }

    public function hasNoteVersion($id, $version) {
        return file_exists($this->getNoteContentPath($id));
    }

    public function getNote($id, $version=null) {
        $this->logger->info("Fetching note $id at version $version");

        $content = get_file_contents($this->getNoteContentPath($id, $version));
        if ($content === false) {
            throw new Exception('Unable to load note.');
        }

        return $content;
    }

    public function updateNote($id, $content) {
        if (strlen($content) > self::MAX_FILE_SIZE_BYTES) {
            throw new NoteContentSizeExceeded("Content with {strlen($content)} bytes exceeded maximum {self::MAX_FILE_SIZE_BYTES} bytes.");
        }

        $this->logger->info("Updating note $id with {strlen($content)} bytes");

        $current_version = $this->getCurrentNoteVersion($id);
        $new_version_path = $this->getNoteVersionPath($id, $current_version + 1);
        $this->logger->debug("Writing new version to $new_version_path");
        file_put_contents($new_version_path, $content);


        $root_content_path = $this->getNoteContentPath($id);
        $this->logger->debug("Writing new version to $root_content_path");
        file_put_contents($root_content_path, $content);
    }
}
