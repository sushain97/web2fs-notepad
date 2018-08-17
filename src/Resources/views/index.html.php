<!DOCTYPE html>
<html lang="en">
    <head>
        <title>web2fs: <?php echo $note['id'] ?></title>
        <meta charset="utf-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
        <meta name="author" content="Sushain K. Cherivirala">
        <!-- Dynamically link, minify and combine these -->
        <link rel="stylesheet" href="/node_modules/normalize.css/normalize.css"/>
        <link rel="stylesheet" href="/node_modules/@blueprintjs/icons/lib/css/blueprint-icons.css"/>
        <link rel="stylesheet" href="/node_modules/@blueprintjs/core/lib/css/blueprint.css"/>
        <style type="text/css">
            /* TODO, write this in SCSS in another file and use Blueprint's vars */
            body {
                margin: 2rem;
                background-color: #F5F8FA;
            }

            textarea.bp3-input.content-input {
                height: calc(100vh - 5.75rem);
                margin-bottom: 1rem;
            }
        </style>
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
