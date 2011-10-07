function bencode(object)
{
    switch(object.constructor)
    {
        case Boolean:
            return 'i' + parseInt(object ? 1 : 0) + 'e';
        break;

        case Number:
            return 'i' + parseInt(object) + 'e';
        break;

        case Date:
            return 'i' + Math.floor(object.valueOf() / 1000) + 'e';
        break;

        case Array:
            var result = new BlobBuilder();
            result.append('l');
            for (var i = 0; i < object.length; i++) {
                result.append(bencode(object[i]));
            }
            result.append('e');
            return result.getBlob();
        break;

        case Object:
            var result = new BlobBuilder();
            result.append('d');

            for (var p in object)
            {
                if ( ! object.hasOwnProperty(p) ) {
                    continue;
                }
                result.append(bencode(String(p))); //key
                result.append(bencode(object[p])); //value
            }
            result.append('e');
            return result.getBlob();
        break;

        case Blob:
            var blob = new BlobBuilder();
                blob.append(object.size.toString());
                blob.append(':');
                blob.append(object);
                return blob.getBlob();
        break;

        case String:
        default:
            var str = object.toString();
            return str.length + ':' + str;
        break;

    }
}
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
            Blob.prototype.slice = Blob.prototype.slice || Blob.prototype.webkitSlice || Blob.prototype.mozSlice;

            if(options.torrent) //if user set his torrent fields - merge them with our defaults
            { //$.extend won't merge objects with methods. so merging only torrent parts
                options.torrent = $.extend(true, $.torrent.defaultOptions.torrent, options.torrent);
            }

            base.options = $.extend({}, $.torrent.defaultOptions, options);
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
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  SHA-1 implementation in JavaScript | (c) Chris Veness 2002-2010 | www.movable-type.co.uk      */
/*   - see http://csrc.nist.gov/groups/ST/toolkit/secure_hashing.html                             */
/*         http://csrc.nist.gov/groups/ST/toolkit/examples.html                                   */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

var Sha1 = {};  // Sha1 namespace

/**
 * Generates SHA-1 hash of string
 *
 * @param {String} msg                String to be hashed
 * @param {Boolean} [utf8encode=true] Encode msg as UTF-8 before generating hash
 * @returns {String}                  Hash of msg as hex character string
 */
Sha1.hash = function(msg, utf8encode) {
  utf8encode =  (typeof utf8encode == 'undefined') ? true : utf8encode;
  
  // convert string to UTF-8, as SHA only deals with byte-streams
  if (utf8encode) msg = Utf8.encode(msg);
  
  // constants [§4.2.1]
  var K = [0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6];
  
  // PREPROCESSING 
  
  msg += String.fromCharCode(0x80);  // add trailing '1' bit (+ 0's padding) to string [§5.1.1]
  
  // convert string msg into 512-bit/16-integer blocks arrays of ints [§5.2.1]
  var l = msg.length/4 + 2;  // length (in 32-bit integers) of msg + ‘1’ + appended length
  var N = Math.ceil(l/16);   // number of 16-integer-blocks required to hold 'l' ints
  var M = new Array(N);
  
  for (var i=0; i<N; i++) {
    M[i] = new Array(16);
    for (var j=0; j<16; j++) {  // encode 4 chars per integer, big-endian encoding
      M[i][j] = (msg.charCodeAt(i*64+j*4)<<24) | (msg.charCodeAt(i*64+j*4+1)<<16) | 
        (msg.charCodeAt(i*64+j*4+2)<<8) | (msg.charCodeAt(i*64+j*4+3));
    } // note running off the end of msg is ok 'cos bitwise ops on NaN return 0
  }
  // add length (in bits) into final pair of 32-bit integers (big-endian) [§5.1.1]
  // note: most significant word would be (len-1)*8 >>> 32, but since JS converts
  // bitwise-op args to 32 bits, we need to simulate this by arithmetic operators
  M[N-1][14] = ((msg.length-1)*8) / Math.pow(2, 32); M[N-1][14] = Math.floor(M[N-1][14])
  M[N-1][15] = ((msg.length-1)*8) & 0xffffffff;
  
  // set initial hash value [§5.3.1]
  var H0 = 0x67452301;
  var H1 = 0xefcdab89;
  var H2 = 0x98badcfe;
  var H3 = 0x10325476;
  var H4 = 0xc3d2e1f0;
  
  // HASH COMPUTATION [§6.1.2]
  
  var W = new Array(80); var a, b, c, d, e;
  for (var i=0; i<N; i++) {
  
    // 1 - prepare message schedule 'W'
    for (var t=0;  t<16; t++) W[t] = M[i][t];
    for (var t=16; t<80; t++) W[t] = Sha1.ROTL(W[t-3] ^ W[t-8] ^ W[t-14] ^ W[t-16], 1);
    
    // 2 - initialise five working variables a, b, c, d, e with previous hash value
    a = H0; b = H1; c = H2; d = H3; e = H4;
    
    // 3 - main loop
    for (var t=0; t<80; t++) {
      var s = Math.floor(t/20); // seq for blocks of 'f' functions and 'K' constants
      var T = (Sha1.ROTL(a,5) + Sha1.f(s,b,c,d) + e + K[s] + W[t]) & 0xffffffff;
      e = d;
      d = c;
      c = Sha1.ROTL(b, 30);
      b = a;
      a = T;
    }
    
    // 4 - compute the new intermediate hash value
    H0 = (H0+a) & 0xffffffff;  // note 'addition modulo 2^32'
    H1 = (H1+b) & 0xffffffff; 
    H2 = (H2+c) & 0xffffffff; 
    H3 = (H3+d) & 0xffffffff; 
    H4 = (H4+e) & 0xffffffff;
  }

  return Sha1.toHexStr(H0) + Sha1.toHexStr(H1) + 
    Sha1.toHexStr(H2) + Sha1.toHexStr(H3) + Sha1.toHexStr(H4);
}

//
// function 'f' [§4.1.1]
//
Sha1.f = function(s, x, y, z)  {
  switch (s) {
  case 0: return (x & y) ^ (~x & z);           // Ch()
  case 1: return x ^ y ^ z;                    // Parity()
  case 2: return (x & y) ^ (x & z) ^ (y & z);  // Maj()
  case 3: return x ^ y ^ z;                    // Parity()
  }
}

//
// rotate left (circular left shift) value x by n positions [§3.2.5]
//
Sha1.ROTL = function(x, n) {
  return (x<<n) | (x>>>(32-n));
}

//
// hexadecimal representation of a number 
//   (note toString(16) is implementation-dependant, and  
//   in IE returns signed numbers when used on full words)
//
Sha1.toHexStr = function(n) {
  var s="", v;
  for (var i=7; i>=0; i--) { v = (n>>>(i*4)) & 0xf; s += v.toString(16); }
  return s;
}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Utf8 class: encode / decode between multi-byte Unicode characters and UTF-8 multiple          */
/*              single-byte character encoding (c) Chris Veness 2002-2010                         */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

var Utf8 = {};  // Utf8 namespace

/**
 * Encode multi-byte Unicode string into utf-8 multiple single-byte characters 
 * (BMP / basic multilingual plane only)
 *
 * Chars in range U+0080 - U+07FF are encoded in 2 chars, U+0800 - U+FFFF in 3 chars
 *
 * @param {String} strUni Unicode string to be encoded as UTF-8
 * @returns {String} encoded string
 */
Utf8.encode = function(strUni) {
  // use regular expressions & String.replace callback function for better efficiency 
  // than procedural approaches
  var strUtf = strUni.replace(
      /[\u0080-\u07ff]/g,  // U+0080 - U+07FF => 2 bytes 110yyyyy, 10zzzzzz
      function(c) { 
        var cc = c.charCodeAt(0);
        return String.fromCharCode(0xc0 | cc>>6, 0x80 | cc&0x3f); }
    );
  strUtf = strUtf.replace(
      /[\u0800-\uffff]/g,  // U+0800 - U+FFFF => 3 bytes 1110xxxx, 10yyyyyy, 10zzzzzz
      function(c) { 
        var cc = c.charCodeAt(0); 
        return String.fromCharCode(0xe0 | cc>>12, 0x80 | cc>>6&0x3F, 0x80 | cc&0x3f); }
    );
  return strUtf;
}

/**
 * Decode utf-8 encoded string back into multi-byte Unicode characters
 *
 * @param {String} strUtf UTF-8 string to be decoded back to Unicode
 * @returns {String} decoded string
 */
Utf8.decode = function(strUtf) {
  // note: decode 3-byte chars first as decoded 2-byte strings could appear to be 3-byte char!
  var strUni = strUtf.replace(
      /[\u00e0-\u00ef][\u0080-\u00bf][\u0080-\u00bf]/g,  // 3-byte chars
      function(c) {  // (note parentheses for precence)
        var cc = ((c.charCodeAt(0)&0x0f)<<12) | ((c.charCodeAt(1)&0x3f)<<6) | ( c.charCodeAt(2)&0x3f); 
        return String.fromCharCode(cc); }
    );
  strUni = strUni.replace(
      /[\u00c0-\u00df][\u0080-\u00bf]/g,                 // 2-byte chars
      function(c) {  // (note parentheses for precence)
        var cc = (c.charCodeAt(0)&0x1f)<<6 | c.charCodeAt(1)&0x3f;
        return String.fromCharCode(cc); }
    );
  return strUni;
}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
