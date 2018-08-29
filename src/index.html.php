<!DOCTYPE html>
<html lang="en">
    <head>
        <title><?php echo $title === null ? 'web2fs' : htmlspecialchars($title)." (web2fs)" ?></title>
        <meta charset="utf-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
        <meta name="author" content="Sushain K. Cherivirala">
        <link rel="icon" type="image/x-icon" href="/favicon.ico?b69c924d943b330a0c691a38d590e091bc9863c3" />
        <link rel="stylesheet" href="<?php echo $kernel->getAssetPath("$bundle.css") ?>" />
        <script type="text/javascript">
            window.CONTEXT = <?php echo json_encode($context) ?>;
        </script>
    </head>
    <body>
        <div id="app"></div>
        <script type="text/javascript" src="<?php echo $kernel->getAssetPath("$bundle.js") ?>"></script>
    </body>
</html>
