(function($){
    $.torrent = function(el, options){
        // To avoid scope issues, use 'base' instead of 'this'
        // to reference this class from internal events and functions.
        var base = this;
        options = options || {};

        // Access to jQuery and DOM versions of element
        base.$el = $(el);
        base.el = el;
        base.hashedPieces = [];
        
        // Add a reverse reference to the DOM object
        base.$el.data("torrent", base);

        base.init = function()
        {
            //compatibility-layer
            //TODO: Silverligtht FileAPI Implementation
            window.BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder;
            //Blob.prototype.slice = Blob.prototype.slice || Blob.prototype.webkitSlice || Blob.prototype.mozSlice;
            if(!base.fixBlobSlice()){
                throw 'not_supported';
            }
            
            if(options.torrent) //if user set his torrent fields - merge them with our defaults
            { //$.extend won't merge objects with methods. so merging only torrent parts
                options.torrent = $.extend(true, $.torrent.defaultOptions.torrent, options.torrent);
            }

            base.options = $.extend({}, $.torrent.defaultOptions, options);
        };
        
        /** Thanks dmitry-dedukhin/lightweight-uploader **/
        base.fixBlobSlice = function() {
            if(window.Blob) {
                var origBlobSlice, origFileSlice, test_blob;
                if(Blob.prototype.slice) { // method exists, let's check it
                    if(window.BlobBuilder) {
                        test_blob = (new BlobBuilder()).append("abc").getBlob();
                    } else {
                        return false;
                    }
                    if(test_blob && test_blob.slice(1, 1).size != 0) { // slice is an old-semantic slice
                        origBlobSlice = Blob.prototype.slice;
                        Blob.prototype.slice = function(start, end, contentType) {
                            return origBlobSlice.apply(this, [start, end - start, contentType]);
                        };
                        if(File.prototype.slice !== Blob.prototype.slice) { // this is needed for Firefox 4.0.0
                            origFileSlice = File.prototype.slice;
                            File.prototype.slice = function(start, end, contentType) {
                                return origFileSlice.apply(this, [start, end - start, contentType]);
                            };
                        }
                        return true;
                    }
                    return false;
                } else if(Blob.prototype.webkitSlice || Blob.prototype.mozSlice) { // new-semantic function, just use it
                    /*
                    // We can't do like this because of in FF we get exception "Illegal operation on WrappedNative prototype object" while calling fake slice method
                    origBlobSlice = Blob.prototype.webkitSlice || Blob.prototype.mozSlice;
                    Blob.prototype.slice = function(start, end, contentType) {
                        return origBlobSlice.apply(this, [start, end, contentType]);
                    }
                    */
                    if(Blob.prototype.webkitSlice) {
                        origBlobSlice = 'webkitSlice';
                    } else if(Blob.prototype.mozSlice) {
                        origBlobSlice = 'mozSlice';
                    }
                    Blob.prototype.slice = function(start, end, contentType) {
                        return this[origBlobSlice].apply(this, [start, end, contentType]);
                    };
                    return true;
                }
                return false;
            }
        };
        base.hexToBlob =  function(string)
        {
            var result = new Uint8Array(Math.ceil(string.length/2));
            for(var i=0;i < string.length; i+=2){
                result[Math.ceil(i/2)] = parseInt(string.substr(i,2),16);
            }

            var resultBlob = new BlobBuilder();
            resultBlob.append(result.buffer);
            return resultBlob.getBlob();
        };

        base.beginCreateTorrent = function(paramaters){
            var info = base.options.torrent.info;
            delete info.files;
            delete info.length;
            info.pieces = [];

            if(!this.el.files){ throw 'wrong_element';}
            if(this.el.files.length == 0 ){throw 'no_files';}

            var chunksNumber = 0;
            var chunkSize = info['piece length'];

            for (var i = 0, file; file = base.el.files[i]; ++i)
            {
                if(base.el.files.length > 1)
                {
                    if(typeof info.files=='undefined') //first iteration
                    {
                       info.files=[];
                    }
                    info.files[i] = {length:file.size, path: [file.name]};
                }
                else
                {
                    info.length = file.size; //set 1-file-torrent length

                    info.name = //if user did not set his own name for torrent
                        ($.torrent.defaultOptions.torrent.info.name == info.name) ?
                            base.el.files[0].name //make it for him
                        :
                            info.name //else leave it as it is
                        ;
                }
                chunksNumber += Math.ceil(file.size / chunkSize);
            }

            var offset = 0;
            var chunkId = 0;
            for (var j = 0, file; file = base.el.files[j]; ++j)
            {
                offset = 0; //setting offset for a new file
                var chunk = file.slice(offset,chunkSize);

                //while chunks are in file
                while(chunk.size > 0)
                {
                    (function(chunk,chunkId){ //this creepy hack is for copying chunk and chunkId
                        //now that we have their current values, we can safely use them in assigned functions
                        //without them being overwritten by ref later
                        
                        var task = function(){
                            //new reader each chunk, cause different onloaded event for every chunk
                            var fileReader = new FileReader();
                            fileReader.onloadend = function(e)
                            {
                                var hexHash = Sha1.hash(e.target.result,false); //no, we don't need utf8ing for us
                                info.pieces[chunkId] = base.hexToBlob(hexHash);
                                var actualLength = function(arr){
                                    var count = 0;
                                    //TODO: somehow find a more pretty solution
                                    for(var k in arr){count++;}
                                    return count;
                                }(info.pieces);

                                //notify user code
                                base.onProgressChanged.call(this,{done: actualLength, all: chunksNumber});
                                base.$el.dequeue();
                            };
                            fileReader.readAsBinaryString(chunk);
                        };
                        base.$el.queue(task);
                        
                    })(chunk,chunkId);
                    
                    //prepare next chunk
                    offset += chunkSize;
                    chunk = file.slice(offset,offset+chunkSize);
                    chunkId++;
                }
            }
        };

        base.onProgressChanged = function(e){
            base.options.onProgressChanged.call(this,e); //call user event

            var torrent = base.options.torrent;
            if(e.done == e.all){ //this was last piece, hence we are making Blob out of them

                var pieces = new BlobBuilder();
                for(var i=0,piece;piece = torrent.info.pieces[i];i++){
                    pieces.append(piece);
                }
                torrent.info.pieces = pieces.getBlob();
                base.options.onTorrentCreated.call(this, bencode(torrent)); //call user event
            }
        };

        // Run initializer
        base.init();
    };
    
    $.torrent.defaultOptions = {
        torrent:{
            info: {
                name: 'Torrent',
                "piece length": 1048576,
                pieces: [] //actually will be a string, but for the sake of async-filling we'll leave it as array and
                            //.join('') later
                /*
                files:[
                    {length:0, path: ''},
                    {length:0, path: ''}
                ], //multi-file torrent
                */
                //length: 0, //in case of 1-file torrent
            }
        },
        onProgressChanged: function (){},
        onTorrentCreated: function (){},
        onError: function(){}
    };
    
    $.fn.torrent = function(options){
        return this.each(function(){
            (new $.torrent(this, options));
        });
    };
    
    // This function breaks the chain, but returns
    // the torrent if it has been attached to the object.
    $.fn.gettorrent = function(){
        return this.data("torrent");
    };

})(jQuery);
