#!/bin/sh
cat src/* > jquery.torrent.js
java -jar ../yuicompressor-2.4.6.jar jquery.torrent.js > jquery.torrent.min.js