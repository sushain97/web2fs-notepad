<!DOCTYPE html>
<html lang="en">
    <head>
        <title><?php echo $note['id'] ?> (web2fs)</title>
        <meta charset="utf-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
        <meta name="author" content="Sushain K. Cherivirala">
        <link rel="stylesheet" href="<?php echo $kernel->getAssetPath('main.css') ?>"/>
        <script type="text/javascript">
            window.CONTEXT = {
                note: <?php echo json_encode($note) ?>,
                currentVersion: <?php echo $currentVersion ?>,
            };
        </script>
    </head>
    <body>
        <div id="app"></div>
        <script type="text/javascript" src="<?php echo $kernel->getAssetPath('main.js') ?>"></script>
    </body>
</html>
