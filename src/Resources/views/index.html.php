<!DOCTYPE html>
<html lang="en">
    <head>
        <title>web2fs: <?php echo $note['id'] ?></title>
        <meta charset="utf-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
        <meta name="author" content="Sushain K. Cherivirala">
        <link rel="stylesheet" href="/bundle.css"/>
        <script type="text/javascript">
            window.CONTEXT = {
                note: <?php echo json_encode($note) ?>,
                currentVersion: <?php echo $currentVersion ?>,
            };
        </script>
        <!-- TODO: add a favicon -->
    </head>
    <body>
        <script type="text/javascript" src="/bundle.js"></script>
    </body>
</html>
