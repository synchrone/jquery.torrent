<?php
	include "lightbenc.php";
	if(isset($_GET['strlen']))
	{
		echo mb_strlen($HTTP_RAW_POST_DATA);
	}
	else if($HTTP_RAW_POST_DATA)
	{
        file_put_contents('generated.torrent',$HTTP_RAW_POST_DATA);
		var_dump(Lightbenc::bdecode($HTTP_RAW_POST_DATA));
		echo '<a href="generated.torrent">Download it!</a>';
	}
    else{
		var_dump(Lightbenc::bdecode_file('generated.torrent'));
		echo "<br /><br /><br /><br />";
		var_dump(Lightbenc::bdecode_file('generated_ut.torrent'));
	}
?>